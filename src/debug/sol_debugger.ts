import { Block } from "@ethereumjs/block";
import { Blockchain } from "@ethereumjs/blockchain";
import { Chain, Common, EVMStateManagerInterface, Hardfork } from "@ethereumjs/common";
import { EVM, InterpreterStep, getOpcodesForHF } from "@ethereumjs/evm";
import { RLP } from "@ethereumjs/rlp";
import { DefaultStateManager } from "@ethereumjs/statemanager";
import { TypedTransaction } from "@ethereumjs/tx";
import { Address, setLengthLeft } from "@ethereumjs/util";
import { RunTxResult, VM } from "@ethereumjs/vm";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";
import { ASTNode, FunctionDefinition, TypeNode, VariableDeclaration, assert } from "solc-typed-ast";
import { EventEmitter } from "stream";
import {
    DecodedBytecodeSourceMapEntry,
    HexString,
    ImmMap,
    UnprefixedHexString,
    ZERO_ADDRESS,
    ZERO_ADDRESS_STRING,
    bigEndianBufToBigint,
    wordToAddress
} from "..";
import { getCodeHash, getCreationCodeHash } from "../artifacts";
import { bigEndianBufToNumber, bigIntToBuf } from "../utils";
import { buildMsgDataViews, findMethodBySelector } from "./abi";
import { ContractInfo, IArtifactManager, getOffsetSrc } from "./artifact_manager";
import { isCalldataType2Slots } from "./decoding";
import {
    FoundryCheatcodesAddress,
    interpRunListeners,
    makeFoundryCheatcodePrecompile,
    setFoundryCtx
} from "./foundry_cheatcodes";
import { foundryInterposedOps } from "./opcode_interposing";
import { OPCODES, changesMemory, createsContract, getOpInfo, increasesDepth } from "./opcodes";
import {
    CallFrame,
    CreationFrame,
    DataLocationKind,
    DataView,
    DbgStack,
    EVMOpts,
    EventDesc,
    ExternalFrame,
    Frame,
    FrameKind,
    InternalCallFrame,
    Memory,
    Stack,
    StepState,
    StepVMState,
    Storage
} from "./types";

// Helper functions

/**
 * Give a stack or a stack frame, find the last **external** stack frame under it (include itself).
 */
export function lastExternalFrame(arg: Frame | DbgStack): ExternalFrame {
    const frame = arg instanceof Array ? arg[arg.length - 1] : arg;

    return frame.kind === FrameKind.InternalCall ? frame.nearestExtFrame : frame;
}

export function getContractInfo(arg: Frame | DbgStack): ContractInfo | undefined {
    const frame = lastExternalFrame(arg);

    return frame.info;
}

async function getStorage(manager: EVMStateManagerInterface, addr: Address): Promise<Storage> {
    const rawStorage = await manager.dumpStorage(addr);
    const storageEntries: Array<[bigint, Uint8Array]> = [];

    for (const [keyStr, valStr] of Object.entries(rawStorage)) {
        const decoded = RLP.decode(hexToBytes(valStr));
        assert(decoded instanceof Uint8Array, "");
        const valBuf = setLengthLeft(decoded, 32);

        storageEntries.push([BigInt(keyStr), valBuf]);
    }

    return ImmMap.fromEntries(storageEntries);
}

export interface SolTxDebuggerOpts {
    strict?: boolean;
    foundryCheatcodes?: boolean;
}

/**
 * Private map tracking VM-to-EVM mapping, used when releasing EVMs from the
 * global listener map for foundry cheatcodes.
 */
const vmToEVMMap = new Map<VM, EVM>();

/**
 * `SolTxDebugger` is the main debugger class. It contains a VM and a
 * corresponding Web3 provider that can be used to run transactions on that VM.
 *
 * Once a particular transaction `tx` has been run against the vm, you can call
 * `debugger.loadTx(tx)` to debug that transaction.
 *
 * `loadTx(tx)` walks over every step of the tx and computes the following information for it:
 *
 * 1. What is the currently deployed contract in which we are executing?
 * 2. Did the `ArtifactManager` have debugging info for this contract? (src map? ast?)
 * 3. If we have source map compute the corresponding src tripple for this instruction
 * 4. If we have an ast, see if the src tripple of this instruction matches any node in the AST
 * 5. If this is a LOGN instruction, extract the event payload and topics
 * 6. Maintain a stack trace, containing all external and internal calls for
 * this step. Note that we can compute internal stack frames only for contracts
 * with debug info.
 *
 * All the above information is held for each step in the `DbgState` struct.
 */
export class SolTxDebugger {
    /// ArtifactManager containing all the solc standard json.
    public readonly artifactManager: IArtifactManager;
    private readonly strict: boolean;
    private readonly foundryCheatcodes: boolean;

    constructor(artifactManager: IArtifactManager, opts?: SolTxDebuggerOpts) {
        this.artifactManager = artifactManager;

        this.strict = true;
        this.foundryCheatcodes = false;

        if (opts) {
            this.strict = opts.strict !== undefined ? opts.strict : this.strict;

            this.foundryCheatcodes =
                opts.foundryCheatcodes !== undefined
                    ? opts.foundryCheatcodes
                    : this.foundryCheatcodes;
        }
    }

    /**
     * Given the VM state of a trace step adjust the stack trace accordingly. This handles the following cases:
     *
     * - op is CREATE or CREATE2 - push a new external frame for the creation context of the contract
     * - op is CALL/CALLCODE/DELEGATECALL/STATICCALL - push a new external frame for the callee context
     * - stack depth decreased and previous instruction was RETURN, REVERT or was in an error state - pop external frames from the stack
     * - internal call - previous op is JUMPDEST and the source map of the current op is the begining of a new function - push a new internal call frame
     * - return from internal call - TODO
     */
    private async adjustStackFrame(
        stack: Frame[],
        state: StepVMState,
        trace: StepState[],
        code: Uint8Array,
        codeHash: HexString | undefined
    ): Promise<void> {
        const lastExtFrame: ExternalFrame = lastExternalFrame(stack);

        // First instruction - nothing to do
        if (trace.length === 0) {
            return;
        }

        const lastStep = trace[trace.length - 1];
        const lastOp = lastStep.op;

        // Case 1: Change in external call depth - contract creation, external call, external call return or revert
        if (lastStep.depth !== state.depth) {
            const lastStackTop = lastStep.evmStack.length - 1;

            if (state.depth > lastStep.depth) {
                assert(
                    increasesDepth(lastOp),
                    `Unexpected depth increase on op ${lastOp.mnemonic}`
                );

                if (createsContract(lastOp)) {
                    // Contract creation call
                    const off = bigEndianBufToNumber(lastStep.evmStack[lastStackTop - 1]);
                    const size = bigEndianBufToNumber(lastStep.evmStack[lastStackTop - 2]);
                    const creationBytecode = lastStep.memory.slice(off, off + size);

                    const curFrame = await this.makeCreationFrame(
                        lastExtFrame.address.toString(),
                        creationBytecode,
                        trace.length
                    );

                    stack.push(curFrame);
                } else {
                    // External call
                    const argStackOff =
                        lastOp.opcode === OPCODES.CALL || lastOp.opcode === OPCODES.CALLCODE
                            ? 3
                            : 2;

                    const argSizeStackOff = argStackOff + 1;

                    const argOff = bigEndianBufToNumber(
                        lastStep.evmStack[lastStackTop - argStackOff]
                    );
                    const argSize = bigEndianBufToNumber(
                        lastStep.evmStack[lastStackTop - argSizeStackOff]
                    );

                    const receiver = wordToAddress(lastStep.evmStack[lastStackTop - 1]);

                    const msgData = lastStep.memory.slice(argOff, argOff + argSize);
                    const newFrame = await this.makeCallFrame(
                        lastExtFrame.address.toString(),
                        receiver,
                        msgData,
                        code,
                        codeHash,
                        trace.length
                    );

                    stack.push(newFrame);
                }
            } else {
                // External return or exception
                let nFramesPopped = lastStep.depth - state.depth;

                // Pop as many external frames as neccessary to match the decrease in
                // depth reported by web3. We need the loop since we don't count the internal frames as decreasing depth
                while (nFramesPopped > 0 && stack.length > 0) {
                    const topFrame = stack[stack.length - 1];

                    if (topFrame.kind === FrameKind.Creation || topFrame.kind === FrameKind.Call) {
                        nFramesPopped--;
                    }

                    stack.pop();
                }
            }

            return;
        }

        // Case 2: No change in external depth - check if there is an internal call or return happening
        const curExtFrame: ExternalFrame = lastExternalFrame(stack);
        const [src, ast] = this.decodeSourceLoc(state.pc, curExtFrame);

        // If there is no debug info for the current contract nothing we can do
        if (src === undefined) {
            return;
        }

        // There are 2 ways to enter an internal function:
        let enteringInternalFun = false;

        //  1. Jumping into an internal function (the previous instruction is a JUMP with source map jump index i)
        if (
            state.op.mnemonic === "JUMPDEST" &&
            lastStep.op.mnemonic === "JUMP" &&
            lastStep.src &&
            lastStep.src.jump === "i"
        ) {
            enteringInternalFun = true;
        }

        //  2. Fall-through (the previous instruction is literally the pervious instruction in the contract body,
        //      AND the current JUMPDEST corresponds to a whole function, AND the pervious instructions' callee is different
        //      from the current instruction's function.
        if (
            !enteringInternalFun &&
            state.op.mnemonic === "JUMPDEST" &&
            (ast instanceof FunctionDefinition ||
                (ast instanceof VariableDeclaration && ast.stateVariable)) &&
            lastStep.stack[lastStep.stack.length - 1].callee !== ast
        ) {
            enteringInternalFun = true;
        }

        if (enteringInternalFun) {
            let args: Array<[string, DataView | undefined]> | undefined;

            if (
                ast instanceof FunctionDefinition ||
                (ast instanceof VariableDeclaration && ast.stateVariable)
            ) {
                assert(curExtFrame.info !== undefined, ``);
                args = this.decodeFunArgs(ast, state.evmStack, curExtFrame.info);
            }

            const newFrame: InternalCallFrame = {
                kind: FrameKind.InternalCall,
                nearestExtFrame: lastExtFrame,
                callee: ast,
                offset: state.pc,
                startStep: trace.length,
                arguments: args
            };

            stack.push(newFrame);

            return;
        }

        // Returning from an internal function call
        if (state.op.mnemonic === "JUMP" && src.jump === "o") {
            const topFrame = stack[stack.length - 1];

            if (this.strict) {
                assert(
                    topFrame.kind === FrameKind.InternalCall,
                    `Mismatched internal return from frame `,
                    topFrame.kind
                );

                stack.pop();
            } else {
                if (topFrame.kind === FrameKind.InternalCall) {
                    stack.pop();
                }
                // @todo log an error somewhere
            }
        }
    }

    /**
     * Get the executing code for the current step. There are 3 cases:
     *
     * 1. We just entered the creation of a new code (last step was
     * CREATE/CREATE2 and depth changed). The code is whatever the memory blob
     * passed to the last op was
     * 2. This is the first step or the `codeAddress` changed between this and the last
     * steps - obtain the code from the `vm.stateManager` using `codeAddress`.
     * 3. Otherwise code is the same in the last step
     * @param vm - current VM
     * @param vmState - current (partial) state in the trace (for which we are computing code)
     * @param trace - trace up to the current state
     */
    private async getCodeAndMdHash(
        vm: VM,
        step: StepVMState,
        trace: StepState[]
    ): Promise<[Uint8Array, HexString | undefined]> {
        const lastStep = trace.length > 0 ? trace[trace.length - 1] : undefined;

        let code: Uint8Array;
        let codeMdHash: HexString | undefined;
        const getCodeAddress = (s: StepVMState): Address =>
            s.codeAddress !== undefined ? s.codeAddress : s.address;

        // Case 1: First step in the trace
        if (lastStep === undefined) {
            const code = await vm.stateManager.getContractCode(getCodeAddress(step));
            const codeMdHash = getCodeHash(code);
            return [code, codeMdHash];
        }

        // Case 2: Just entering a constructor from another contract
        if (createsContract(lastStep.op)) {
            const lastStackTop = lastStep.evmStack.length - 1;

            const off = bigEndianBufToNumber(lastStep.evmStack[lastStackTop - 1]);
            const size = bigEndianBufToNumber(lastStep.evmStack[lastStackTop - 2]);

            const code = lastStep.memory.slice(off, off + size);
            const codeMdHash = getCreationCodeHash(code);
            return [code, codeMdHash];
        }

        // Case 3: The code changed - either we are in a different contract or a delegate call context
        if (!getCodeAddress(lastStep).equals(getCodeAddress(step))) {
            // Case 3: We are changing the code address
            code = await vm.stateManager.getContractCode(getCodeAddress(step));
            codeMdHash = getCodeHash(code);
            return [code, codeMdHash];
        }

        // Case 4: We are still in the same contract
        code = lastStep.code;
        codeMdHash = lastStep.codeMdHash;

        return [code, codeMdHash];
    }

    async processRawTraceStep(
        vm: VM,
        stateManager: EVMStateManagerInterface,
        step: InterpreterStep,
        trace: StepState[],
        stack: Frame[]
    ): Promise<StepState> {
        const evmStack = step.stack.map((word) => bigIntToBuf(word, 32, "big"));
        const lastStep = trace.length > 0 ? trace[trace.length - 1] : undefined;

        const memory: Memory =
            lastStep === undefined || changesMemory(lastStep.op)
                ? new Uint8Array(step.memory)
                : lastStep.memory;

        const op = getOpInfo(step.opcode.name);

        let storage: Storage;

        if (lastStep === undefined || lastStep.op.opcode === OPCODES.SSTORE) {
            storage = await getStorage(stateManager, step.address);
        } else {
            storage = lastStep.storage;
        }

        const gasCost = BigInt(step.opcode.fee);
        const dynamicGasCost =
            step.opcode.dynamicFee === undefined ? gasCost : step.opcode.dynamicFee;

        // First translate the basic VM state
        const vmState: StepVMState = {
            evmStack,
            memory,
            storage,
            op,
            pc: step.pc,
            gasCost,
            dynamicGasCost,
            gas: step.gasLeft,
            depth: step.depth + 1, // Match geth's depth starting at 1
            address: step.address,
            codeAddress: step.codeAddress
        };

        const [code, codeMdHash] = await this.getCodeAndMdHash(vm, vmState, trace);

        await this.adjustStackFrame(stack, vmState, trace, code, codeMdHash);

        const curExtFrame = lastExternalFrame(stack);

        let src: DecodedBytecodeSourceMapEntry | undefined;
        let astNode: ASTNode | undefined;

        try {
            [src, astNode] = this.decodeSourceLoc(step.pc, curExtFrame);
        } catch (e) {
            // Nothing to do
        }

        let emittedEvent: EventDesc | undefined = undefined;

        // Finally check if an event is being emitted for this step
        if (step.opcode.name.startsWith("LOG")) {
            const off = bigEndianBufToNumber(evmStack[evmStack.length - 1]);
            const size = bigEndianBufToNumber(evmStack[evmStack.length - 2]);

            const nTopics = (step.opcode.name[3] as any) - ("0" as any);
            const payload = memory.slice(off, off + size);

            emittedEvent = {
                payload,
                topics: evmStack
                    .slice(evmStack.length - 2 - nTopics, evmStack.length - 2)
                    .reverse()
                    .map(bigEndianBufToBigint)
            };
        }

        return {
            ...vmState,
            code,
            codeMdHash,
            stack: [...stack],
            src,
            astNode,
            emittedEvent,
            contractInfo: curExtFrame.info
        };
    }

    private static async getEVM(opts: EVMOpts, foundryCheatcodes: boolean): Promise<EVM> {
        const tmpEvm = await EVM.create(opts);

        if (!foundryCheatcodes) {
            return tmpEvm;
        }

        const opcodes = getOpcodesForHF(tmpEvm.common);
        const [precompile, foundryCtx] = makeFoundryCheatcodePrecompile();

        const optsCopy: EVMOpts = {
            ...opts,
            customOpcodes: [
                ...(opts.customOpcodes ? opts.customOpcodes : []),
                ...foundryInterposedOps(opcodes, foundryCtx)
            ],
            customPrecompiles: [
                ...(opts.customPrecompiles ? opts.customPrecompiles : []),
                {
                    address: FoundryCheatcodesAddress,
                    function: precompile
                }
            ]
        };

        const res = await EVM.create(optsCopy);

        const emitter = new EventEmitter();
        emitter.on("beforeInterpRun", foundryCtx.beforeInterpRunCB.bind(foundryCtx));
        emitter.on("afterInterpRun", foundryCtx.afterInterpRunCB.bind(foundryCtx));
        interpRunListeners.set(res, emitter);
        setFoundryCtx(res, foundryCtx);
        return res;
    }

    /**
     * Releases references to the EVM stored inside VM from the
     * `interpRunListeners` map.  This avoids memory leaks when repeatedly
     * calling the debugger on different transactions.  Should be called once
     * for every vm created by `SolTxDebugger.createVm` after its done being
     * used.
     */
    static releaseVM(vm: VM): void {
        const evm = vmToEVMMap.get(vm);

        if (evm) {
            interpRunListeners.delete(evm);
        }

        vmToEVMMap.delete(vm);
    }

    static async createVm(
        stateManager: EVMStateManagerInterface | undefined,
        foundryCheatcodes: boolean
    ): Promise<VM> {
        const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai });
        const blockchain = await Blockchain.create({ common });

        if (!stateManager) {
            stateManager = new DefaultStateManager();
        }

        const evm = await SolTxDebugger.getEVM(
            { common, blockchain, stateManager, allowUnlimitedContractSize: true },
            foundryCheatcodes
        );

        const vm = await VM.create({
            common,
            blockchain,
            stateManager,
            evm,
            activatePrecompiles: true
        });

        vmToEVMMap.set(vm, evm);

        return vm;
    }

    async debugTx(
        tx: TypedTransaction,
        block: Block | undefined,
        stateManager: EVMStateManagerInterface
    ): Promise<[StepState[], RunTxResult]> {
        const vm = await SolTxDebugger.createVm(
            stateManager.shallowCopy(true),
            this.foundryCheatcodes
        );

        const sender = tx.getSenderAddress().toString();
        const receiver = tx.to === undefined ? ZERO_ADDRESS_STRING : tx.to.toString();
        const isCreation = receiver === ZERO_ADDRESS_STRING;
        const stack: Frame[] = [];

        let curFrame: Frame;

        if (isCreation) {
            curFrame = await this.makeCreationFrame(sender, tx.data, 0);
        } else {
            assert(
                tx.to !== undefined,
                'Expected "to" of tx {0} to be defined, got undefined instead',
                bytesToHex(tx.hash())
            );

            const code = await vm.stateManager.getContractCode(tx.to);

            /// @todo remove - arbitrary restriction, only good for debugging
            assert(code.length > 0, "Missing code for address {0}", tx.to.toString());

            const codeHash = getCodeHash(code);

            curFrame = await this.makeCallFrame(sender, tx.to, tx.data, code, codeHash, 0);
        }

        stack.push(curFrame);

        const trace: StepState[] = [];

        assert(vm.evm.events !== undefined, "Unable to access EVM events at this point");

        vm.evm.events.on("step", async (step: InterpreterStep, next: any) => {
            const curStep = await this.processRawTraceStep(vm, vm.stateManager, step, trace, stack);

            trace.push(curStep);

            next();
        });

        const txRes = await vm.runTx({
            tx,
            block,
            skipBalance: true,
            skipNonce: true,
            skipBlockGasLimitValidation: true
        });

        SolTxDebugger.releaseVM(vm);

        return [trace, txRes];
    }

    /**
     * Build a `CreationFrame` from the given `sender` address, `data` `Uint8Array`(msg.data) and the current trace step number.
     */
    private async makeCreationFrame(
        sender: HexString,
        data: Uint8Array,
        step: number
    ): Promise<CreationFrame> {
        const contractInfo = await this.artifactManager.getContractFromCreationBytecode(data);
        let args: Array<[string, DataView | undefined]> | undefined;
        const callee = contractInfo && contractInfo.ast ? contractInfo.ast.vConstructor : undefined;

        if (contractInfo && callee instanceof FunctionDefinition) {
            // TODO: Try and find the arguments inside the creation code and decode them
        }

        return {
            kind: FrameKind.Creation,
            sender,
            msgData: data,
            creationCode: data,
            info: contractInfo,
            callee,
            address: ZERO_ADDRESS,
            startStep: step,
            arguments: args
        };
    }

    /**
     * Given a contract info and a function selector find the (potentially inherited) entry point (function or public var getter).
     * @param info
     * @param selector
     * @returns
     */
    private findEntryPoint(
        info: ContractInfo,
        selector: UnprefixedHexString
    ): FunctionDefinition | VariableDeclaration | undefined {
        if (info.ast === undefined) {
            return undefined;
        }

        const contract = info.ast;
        const infer = this.artifactManager.infer(info.artifact.compilerVersion);

        return findMethodBySelector(selector, contract, infer);
    }

    /**
     * Build a `CallFrame` from the given `sender` address, `receiver` address, `data` `Uint8Array`, (msg.data) and the current trace step number.
     */
    private async makeCallFrame(
        sender: HexString,
        receiver: Address,
        data: Uint8Array,
        receiverCode: Uint8Array,
        codeHash: HexString | undefined,
        step: number
    ): Promise<CallFrame> {
        const contractInfo: ContractInfo | undefined =
            codeHash === undefined
                ? codeHash
                : this.artifactManager.getContractFromMDHash(codeHash);

        const selector: UnprefixedHexString = bytesToHex(data.slice(0, 4));

        let callee: FunctionDefinition | VariableDeclaration | undefined;
        let args: Array<[string, DataView | undefined]> | undefined;

        if (contractInfo && contractInfo.ast) {
            const abiVersion = contractInfo.artifact.abiEncoderVersion;
            const infer = this.artifactManager.infer(contractInfo.artifact.compilerVersion);

            callee = this.findEntryPoint(contractInfo, selector);

            if (callee !== undefined) {
                try {
                    args = buildMsgDataViews(
                        callee,
                        data,
                        DataLocationKind.CallData,
                        infer,
                        abiVersion
                    );
                } catch (e) {
                    args = undefined;
                }
            }
        }

        return {
            kind: FrameKind.Call,
            sender,
            msgData: data,
            receiver: receiver.toString(),
            code: receiverCode,
            info: contractInfo,
            callee,
            address: receiver,
            startStep: step,
            arguments: args
        };
    }

    /**
     * Helper function to get the source information for the instruction at a given `instrOffset`,
     * in the context of the external call `ctx`.
     *
     * There are several cases this handles:
     *
     * 1. If there is no debug info for the contract executing in `ctx` return undefined
     * 2. If there is debug info, but no AST return only the decoded bytecode sourcemap entry
     * 3. If there is both debug info and an AST return the decoded source location and any AST nodes that match this location
     */
    decodeSourceLoc(
        instrOffset: number,
        ctx: ExternalFrame
    ): [DecodedBytecodeSourceMapEntry | undefined, ASTNode | undefined] {
        if (!ctx.info) {
            return [undefined, undefined];
        }

        const bytecodeInfo =
            ctx.kind === FrameKind.Creation ? ctx.info.bytecode : ctx.info.deployedBytecode;

        const src = getOffsetSrc(instrOffset, bytecodeInfo);

        const astNode = ctx.info.artifact.srcMap.get(
            `${src.start}:${src.length}:${src.sourceIndex}`
        );

        return [src, astNode];
    }

    /**
     * WIP: TODO document
     * TODO: Rename - this function doesn't do any actual decoding - just building up DataView for the arguments
     * of a function
     */
    private decodeFunArgs(
        callee: FunctionDefinition | VariableDeclaration,
        stack: Stack,
        contractInfo: ContractInfo
    ): Array<[string, DataView]> | undefined {
        const res: Array<[string, DataView]> = [];
        let formals: Array<[string, TypeNode]>;
        const infer = this.artifactManager.infer(contractInfo.artifact.compilerVersion);

        try {
            formals =
                callee instanceof FunctionDefinition
                    ? callee.vParameters.vParameters.map((argDef: VariableDeclaration) => [
                          argDef.name,
                          infer.variableDeclarationToTypeNode(argDef)
                      ])
                    : infer
                          .getterArgsAndReturn(callee)[0]
                          .map((typ: TypeNode, i: number) => [`ARG_${i}`, typ]);
        } catch (e) {
            // `variableDeclarationToTypeNode` may fail when referencing structs/contracts that are defined
            // in SourceUnits that are missing
            return undefined;
        }

        let offsetFromTop = -1;

        for (let i = formals.length - 1; i >= 0; i--) {
            const [name, typ] = formals[i];
            const stackSize = isCalldataType2Slots(typ) ? 2 : 1;

            offsetFromTop += stackSize;

            if (offsetFromTop > stack.length) {
                // Stack underflow. Could be due to optimized code?
                return undefined;
            }

            res.unshift([
                name,
                {
                    type: typ,
                    loc: {
                        kind: DataLocationKind.Stack,
                        offsetFromTop
                    }
                }
            ]);
        }

        return res;
    }
}
