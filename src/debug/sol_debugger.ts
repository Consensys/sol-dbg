import { Block } from "@ethereumjs/block";
import { Transaction } from "@ethereumjs/tx";
import VM, { VMOpts } from "@ethereumjs/vm";
import { InterpreterStep } from "@ethereumjs/vm/dist/evm/interpreter";
import { RunTxResult } from "@ethereumjs/vm/dist/runTx";
import { StateManager } from "@ethereumjs/vm/dist/state";
import { Address, rlp } from "ethereumjs-util";
import {
    assert,
    ASTNode,
    FunctionDefinition,
    StateVariableVisibility,
    TypeNode,
    VariableDeclaration
} from "solc-typed-ast";
import {
    bigEndianBufToBigint,
    bnToBigInt,
    DecodedBytecodeSourceMapEntry,
    getFunctionSelector,
    HexString,
    ImmMap,
    padStart,
    UnprefixedHexString,
    wordToAddress,
    ZERO_ADDRESS,
    ZERO_ADDRESS_STRING
} from "..";
import { getCodeHash, getCreationCodeHash } from "../artifacts";
import { bigEndianBufToNumber } from "../utils";
import { decodeMsgData } from "./abi";
import { ContractInfo, getOffsetSrc, IArtifactManager } from "./artifact_manager";
import { isCalldataType2Slots } from "./decoding";
import {
    changesMemory,
    createsContract,
    EVMOpInfo,
    getOpInfo,
    increasesDepth,
    OPCODES
} from "./opcodes";
import {
    FoundryCheatcodePrecompile,
    FoundryCheatcodesAddress,
    FoundryContext,
    interpRunListeners,
    setFoundryCtx
} from "./foundry_cheatcodes";
import { getOpcodesForHF } from "@ethereumjs/vm/dist/evm/opcodes";
import { foundryInterposedOps } from "./opcode_interposing";
import { EventEmitter } from "stream";

export enum FrameKind {
    Call = "call",
    Creation = "creation",
    InternalCall = "internal_call"
}

/**
 * Base interface for Stack frames maintained by the debugger
 */
interface BaseFrame {
    readonly kind: FrameKind;
    /**
     * AST node causing the call. Note that this is not always a FunctionCall. For example this could be:
     * 1. A contract public state var VariableDeclaration
     * 2. Any checked arithmetic operation in sol > 0.8.0 (these are implemented as internal functions)
     * 3. Some other random non-call AST node, that is implemented as a compiler generated function
     */
    readonly callee: ASTNode | undefined;
    /**
     * If we have a `callee` try and infer where the arguments are placed in the VM state. Some arguments may not
     * exist in the case of msg.data generated from a fuzzer for example.
     */
    readonly arguments: Array<[string, DataView | undefined]> | undefined;
    readonly startStep: number;
}

/**
 * Base class for a stack frame corresponding to an external call.
 */
interface BaseExternalFrame extends BaseFrame {
    readonly sender: HexString;
    readonly msgData: Buffer;
    readonly address: Address;
}

/**
 * Stack frame corresponding to an external call
 */
interface CallFrame extends BaseExternalFrame {
    readonly kind: FrameKind.Call;
    readonly receiver: HexString;
    readonly code: Buffer;
    readonly info?: ContractInfo;
}

/**
 * Stack frame corresponding to a contract creation call
 */
interface CreationFrame extends BaseExternalFrame {
    readonly kind: FrameKind.Creation;
    readonly creationCode: Buffer;
    readonly info?: ContractInfo;
}

/**
 * Stack frame corresponding to an internal function call
 */
interface InternalCallFrame extends BaseFrame {
    readonly kind: FrameKind.InternalCall;
    readonly nearestExtFrame: CallFrame | CreationFrame;
    readonly offset: number;
}

export type ExternalFrame = CallFrame | CreationFrame;
export type Frame = ExternalFrame | InternalCallFrame;
export type DbgStack = Frame[];

export enum DataLocationKind {
    Stack = "stack",
    Memory = "memory",
    Storage = "storage",
    CallData = "calldata"
}

export type MemoryLocationKind =
    | DataLocationKind.Memory
    | DataLocationKind.CallData
    | DataLocationKind.Storage;

export interface BaseDataLocation {
    kind: DataLocationKind;
}

export interface StackLocation extends BaseDataLocation {
    kind: DataLocationKind.Stack;
    offsetFromTop: number;
}

export interface BaseMemoryLocation extends BaseDataLocation {
    address: bigint;
}

export interface CalldataLocation extends BaseMemoryLocation {
    kind: DataLocationKind.CallData;
}

export interface LinearMemoryLocation extends BaseMemoryLocation {
    kind: DataLocationKind.Memory;
}

export interface StorageLocation extends BaseMemoryLocation {
    kind: DataLocationKind.Storage;
    endOffsetInWord: number;
}

export type ByteAddressableMemoryLocation = CalldataLocation | LinearMemoryLocation;
export type MemoryLocation = ByteAddressableMemoryLocation | StorageLocation;
export type DataLocation = StackLocation | MemoryLocation;

export interface DataView {
    type: TypeNode;
    originalType?: TypeNode;
    loc: DataLocation;
}

export type Memory = Buffer;
export type Stack = Buffer[];
export type Storage = ImmMap<bigint, Buffer>;
export interface EventDesc {
    payload: Buffer;
    topics: bigint[];
}

/**
 * TODO(dimo): Make memory and storage be computed only for instructions that change them, and for all other
 * instructions alias the previous steps' memory/storage
 *
 * Low-level machine state at a given trace step. It directly mirrors the state reported from Web3
 * and doesn't include any higher-level information that requires debug info.
 */
export interface StepVMState {
    evmStack: Stack;
    memory: Memory;
    storage: Storage;
    op: EVMOpInfo;
    pc: number;
    gasCost: bigint;
    dynamicGasCost: bigint;
    gas: bigint;
    depth: number;
    address: Address;
    codeAddress: Address;
}

/**
 * State that the debugger maintains for each trace step.
 * It includes the basic VM state (`StepVmState`) and optionally (if we have debug info for this contract)
 * includes the decoded source location, any AST nodes that are mapped to this instruction and any events
 * that may be emitted on this step.
 */
export interface StepState extends StepVMState {
    code: Buffer;
    codeMdHash: HexString | undefined;
    stack: DbgStack;
    src: DecodedBytecodeSourceMapEntry | undefined;
    astNode: ASTNode | undefined;
    emittedEvent: EventDesc | undefined;
    contractInfo: ContractInfo | undefined;
}

/**
 * Trace step struct contained in the array returned by web3.debug.traceTransaction().
 * We translate this into `StepVmState`.
 */
export interface Web3DbgState {
    stack: HexString[];
    memory: HexString[];
    storage?: any;
    op: string;
    pc: number;
    gasCost: string;
    gas: string;
    depth: number;
    error?: any;
}

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

async function getStorage(manager: StateManager, addr: Address): Promise<Storage> {
    const rawStorage = await manager.dumpStorage(addr);
    const storageEntries: Array<[bigint, Buffer]> = [];

    for (const [keyStr, valStr] of Object.entries(rawStorage)) {
        const valBuf = padStart(rlp.decode(Buffer.from(valStr, "hex")), 32, 0);

        storageEntries.push([BigInt("0x" + keyStr), valBuf]);
    }

    return ImmMap.fromEntries(storageEntries);
}

export interface SolTxDebuggerOpts {
    strict?: boolean;
    foundryCheatcodes?: boolean;
}

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
        code: Buffer,
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
    ): Promise<[Buffer, HexString | undefined]> {
        const lastStep: StepState | undefined =
            trace.length > 0 ? trace[trace.length - 1] : undefined;

        let code: Buffer;
        let codeMdHash: HexString | undefined;

        if (lastStep !== undefined && createsContract(lastStep.op)) {
            const lastStackTop = lastStep.evmStack.length - 1;
            const off = bigEndianBufToNumber(lastStep.evmStack[lastStackTop - 1]);
            const size = bigEndianBufToNumber(lastStep.evmStack[lastStackTop - 2]);
            code = lastStep.memory.slice(off, off + size);
            codeMdHash = getCreationCodeHash(code);
        } else if (lastStep === undefined || !lastStep.codeAddress.equals(step.codeAddress)) {
            code = await vm.stateManager.getContractCode(step.codeAddress);
            codeMdHash = getCodeHash(code);
        } else {
            code = lastStep.code;
            codeMdHash = lastStep.codeMdHash;
        }

        return [code, codeMdHash];
    }

    async processRawTraceStep(
        vm: VM,
        step: InterpreterStep,
        trace: StepState[],
        stack: Frame[]
    ): Promise<StepState> {
        const evmStack = step.stack.map((word) => Buffer.from(word.toArray("be", 32)));
        const lastStep = trace.length > 0 ? trace[trace.length - 1] : undefined;

        let memory: Memory;

        if (lastStep === undefined || changesMemory(lastStep.op)) {
            memory = Buffer.from(step.memory);
        } else {
            memory = lastStep.memory;
        }

        const op = getOpInfo(step.opcode.name);
        let storage: Storage;

        if (lastStep === undefined || lastStep.op.opcode === OPCODES.SSTORE) {
            storage = await getStorage(step.stateManager, step.address);
        } else {
            storage = lastStep.storage;
        }

        const gasCost = BigInt(step.opcode.fee);
        const dynamicGasCost =
            step.opcode.dynamicFee === undefined ? gasCost : bnToBigInt(step.opcode.dynamicFee);

        // First translate the basic VM state
        const vmState: StepVMState = {
            evmStack,
            memory,
            storage,
            op,
            pc: step.pc,
            gasCost,
            dynamicGasCost,
            gas: bnToBigInt(step.gasLeft),
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

    static getVM(opts: VMOpts, foundryCheatcodes: boolean): VM {
        if (!foundryCheatcodes) {
            return new VM(opts);
        }

        const dummyVM = new VM(opts);
        const opcodes = getOpcodesForHF(dummyVM._common);
        const foundryCtx: FoundryContext = new FoundryContext();

        const optsCopy: VMOpts = {
            ...opts,
            customOpcodes: [
                ...(opts.customOpcodes ? opts.customOpcodes : []),
                ...foundryInterposedOps(opcodes, foundryCtx)
            ],
            customPrecompiles: [
                ...(opts.customPrecompiles ? opts.customPrecompiles : []),
                {
                    address: FoundryCheatcodesAddress,
                    function: FoundryCheatcodePrecompile
                }
            ]
        };

        const res = new VM(optsCopy);

        setFoundryCtx(res, foundryCtx);

        const emitter = new EventEmitter();
        emitter.on("beforeInterpRun", foundryCtx.beforeInterpRunCB.bind(foundryCtx));
        emitter.on("afterInterpRun", foundryCtx.afterInterpRunCB.bind(foundryCtx));
        interpRunListeners.set(res, emitter);
        return res;
    }

    async debugTx(
        tx: Transaction,
        block: Block | undefined,
        stateManager: StateManager | undefined
    ): Promise<[StepState[], RunTxResult]> {
        const vm = SolTxDebugger.getVM({ stateManager }, this.foundryCheatcodes);
        const sender = tx.getSenderAddress().toString();
        const receiver = tx.to === undefined ? ZERO_ADDRESS_STRING : tx.to.toString();
        const isCreation = receiver === ZERO_ADDRESS_STRING;
        const stack: Frame[] = [];

        let curFrame: Frame;

        if (isCreation) {
            curFrame = await this.makeCreationFrame(sender, tx.data, 0);
        } else {
            const code = await vm.stateManager.getContractCode(tx.to as Address);
            const codeHash = getCodeHash(code);
            curFrame = await this.makeCallFrame(
                sender,
                tx.to as Address,
                tx.data,
                code,
                codeHash,
                0
            );
        }

        stack.push(curFrame);

        const trace: StepState[] = [];

        vm.on("step", async (step: InterpreterStep, next: any) => {
            const curStep = await this.processRawTraceStep(vm, step, trace, stack);
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

        return [trace, txRes];
    }

    /**
     * Build a `CreationFrame` from the given `sender` address, `data` `Buffer`(msg.data) and the current trace step number.
     */
    private async makeCreationFrame(
        sender: HexString,
        data: Buffer,
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

        for (const base of contract.vLinearizedBaseContracts) {
            // Need to be defensive here, as in some cases with partial AST information the base may be missing
            if (base === undefined) {
                continue;
            }

            const matchingFuns = base.vFunctions.filter(
                (fun) => getFunctionSelector(fun, infer) === selector
            );

            if (matchingFuns.length === 1) {
                return matchingFuns[0];
            }

            const matchingGetters = base.vStateVariables.filter((vDef) => {
                try {
                    return (
                        vDef.visibility === StateVariableVisibility.Public &&
                        infer.signatureHash(vDef)
                    );
                } catch (e) {
                    return false;
                }
            });

            if (matchingGetters.length === 1) {
                return matchingGetters[0];
            }
        }

        return undefined;
    }

    /**
     * Build a `CallFrame` from the given `sender` address, `receiver` address, `data` `Buffer`, (msg.data) and the current trace step number.
     */
    private async makeCallFrame(
        sender: HexString,
        receiver: Address,
        data: Buffer,
        receiverCode: Buffer,
        codeHash: HexString | undefined,
        step: number
    ): Promise<CallFrame> {
        const contractInfo: ContractInfo | undefined =
            codeHash === undefined
                ? codeHash
                : this.artifactManager.getContractFromMDHash(codeHash);

        const selector: UnprefixedHexString = data.slice(0, 4).toString("hex");

        let callee: FunctionDefinition | VariableDeclaration | undefined;
        let args: Array<[string, DataView | undefined]> | undefined;

        if (contractInfo && contractInfo.ast) {
            const abiVersion = contractInfo.artifact.abiEncoderVersion;
            const infer = this.artifactManager.infer(contractInfo.artifact.compilerVersion);

            callee = this.findEntryPoint(contractInfo, selector);

            if (callee !== undefined) {
                try {
                    args = decodeMsgData(
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
                    ? callee.vParameters.vParameters.map((argDef) => [
                          argDef.name,
                          infer.variableDeclarationToTypeNode(argDef)
                      ])
                    : infer.getterArgsAndReturn(callee)[0].map((typ, i) => [`ARG_${i}`, typ]);
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

            assert(
                offsetFromTop <= stack.length,
                `Stack underflow when trying to decode arguments of {0}`,
                callee,
                `Expected ${formals.length} entries but stack is only ${stack.length} deep`
            );

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
