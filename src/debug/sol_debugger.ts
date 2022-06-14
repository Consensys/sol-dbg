import { Block } from "@ethereumjs/block";
import Common from "@ethereumjs/common";
import { Transaction } from "@ethereumjs/tx";
import VM from "@ethereumjs/vm";
import { InterpreterStep } from "@ethereumjs/vm/dist/evm/interpreter";
import { RunTxResult } from "@ethereumjs/vm/dist/runTx";
import { StateManager } from "@ethereumjs/vm/dist/state";
import { VMContext } from "@remix-project/remix-simulator/src/vm-context";
import { VmProxy } from "@remix-project/remix-simulator/src/VmProxy";
import { Address, rlp } from "ethereumjs-util";
import {
    assert,
    ASTNode,
    FunctionDefinition,
    StateVariableVisibility,
    TypeNode,
    VariableDeclaration,
    variableDeclarationToTypeNode
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
    // TODO: Unify below 3 fields into 'receiver: DeployedContractInfo`
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
    // TODO: Perhaps add a curContract: DeployedContractInfo field here as well, to avoid the lookup into nearestExtFrame
    readonly offset: number;
}

export type ExternalFrame = CallFrame | CreationFrame;
export type Frame = ExternalFrame | InternalCallFrame;
export type DbgStack = Frame[];

/**
 * Information kept by the debugger for every deployed contract in the VM
 */
interface DeployedContractInfo {
    address: HexString;
    code: Buffer;
    info?: ContractInfo;
}

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
 */
/**
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
    code: Buffer;
}

/**
 * State that the debugger maintains for each trace step.
 * It includes the basic VM state (`StepVmState`) and optionally (if we have debug info for this contract)
 * includes the decoded source location, any AST nodes that are mapped to this instruction and any events
 * that may be emitted on this step.
 */
export interface StepState extends StepVMState {
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

export class AdjustedVMContext extends VMContext {
    /**
     * Skip using `Common` due to it causes failures and restrictions.
     *
     * We also want to preserve original StateManager,
     * as it is not yet exported and therefore is unable to be instantiated here.
     */
    createVm(): {
        vm: VM;
        web3vm: VmProxy;
        stateManager: any;
        common: Common;
    } {
        const data = super.createVm(this.currentFork);

        const vm = new VM({
            stateManager: data.vm.stateManager,

            activatePrecompiles: true,
            allowUnlimitedContractSize: true
        });

        data.vm = vm;
        data.common = vm._common;

        data.web3vm.setVM(vm);

        return data;
    }
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
    private artifactManager: IArtifactManager;

    /// Web3 provider wrapping around `this.vm`
    public readonly web3vm: VmProxy;

    /**
     * Map from addresses to information about contracts deployed at that address. We use this to cache
     * lookups from contract code to their corresponding debug info in the artifact manager.
     *
     * TODO(dimo): There is a potnetial bug here if a user does the following:
     * 1. Create a contract at address X in tx0
     * 2. Call X.foo() in tx1
     * 3. Destroy contract in X in tx2
     * 4. Create another contract at address X in tx3 (using CREATE2 for example)
     *
     * If at that point the user calls `loadTx(tx1)`, the contract stored in `deployedContracts` will be the one
     * from step 4, not the one from step 1 which is whats expected.
     *
     * For now we just assert that this doesn't happen in VM's `putCode`, but we should fix this.
     */
    private deployedContracts: Map<HexString, DeployedContractInfo>;

    constructor(artifactManager: IArtifactManager) {
        this.artifactManager = artifactManager;

        const vmContext = new AdjustedVMContext();

        const { web3vm, stateManager } = vmContext.currentVm;

        this.web3vm = web3vm;
        this.deployedContracts = new Map();

        const oldPutContractCode = stateManager.putContractCode.bind(stateManager);

        // This is a really dirty trick to interpose every time a new contract
        // is added (i.e. when code is assigned to an address)
        // We use this interposition to keep our deployed contract cache correct.
        // TODO: Move this in stateManager.ts
        stateManager.putContractCode = async (address: Address, code: Buffer) => {
            if (code.length > 0) {
                const info = this.buildDeployedContractInfo(address, code);

                assert(
                    !this.deployedContracts.has(info.address),
                    `Overwriting contract at address ${info.address}`
                );

                this.deployedContracts.set(info.address, info);
            }

            return oldPutContractCode(address, code);
        };
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
        trace: StepState[]
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
                    const off = Number(lastStep.evmStack[lastStackTop - 1]);
                    const size = Number(lastStep.evmStack[lastStackTop - 2]);
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

                    const argOff = Number(lastStep.evmStack[lastStackTop - argStackOff]);
                    const argSize = Number(lastStep.evmStack[lastStackTop - argSizeStackOff]);

                    const receiver = wordToAddress(lastStep.evmStack[lastStackTop - 1]);
                    const deplContractInfo = await this.getDeployedContract(receiver, state.code);

                    assert(
                        deplContractInfo !== undefined,
                        `No contract found at address ${receiver}`
                    );

                    const msgData = lastStep.memory.slice(argOff, argOff + argSize);
                    const newFrame = await this.makeCallFrame(
                        lastExtFrame.address.toString(),
                        receiver,
                        msgData,
                        state.code,
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

        // Jumping into an internal function call
        if (
            state.op.mnemonic === "JUMPDEST" &&
            lastStep.op.mnemonic === "JUMP" &&
            lastStep.src &&
            lastStep.src.jump === "i"
        ) {
            let args: Array<[string, DataView | undefined]> | undefined;

            if (
                ast instanceof FunctionDefinition ||
                (ast instanceof VariableDeclaration && ast.stateVariable)
            ) {
                args = this.decodeFunArgs(ast, state.evmStack);
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

            assert(
                topFrame.kind === FrameKind.InternalCall,
                `Mismatched internal return from frame `,
                topFrame.kind
            );

            stack.pop();
        }
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

        let code: Buffer;

        if (lastStep === undefined || !lastStep.codeAddress.equals(step.codeAddress)) {
            code = await vm.stateManager.getContractCode(step.codeAddress);
        } else {
            code = lastStep.code;
        }

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
            codeAddress: step.codeAddress,
            code
        };

        await this.adjustStackFrame(stack, vmState, trace);

        const curExtFrame = lastExternalFrame(stack);

        let src: DecodedBytecodeSourceMapEntry | undefined;
        let astNode: ASTNode | undefined;

        try {
            [src, astNode] = this.decodeSourceLoc(step.pc, curExtFrame);
        } catch (e) {
            console.error(
                `Failed decoding location ${step.pc} ${step.opcode.name} depth ${
                    vmState.depth
                } codeAddr ${vmState.codeAddress.toString()} last op ${
                    lastStep?.op.mnemonic
                } depth ${
                    lastStep?.depth
                } codeAddr ${lastStep?.codeAddress.toString()} codes different? ${
                    Buffer.compare(vmState.code, (lastStep as StepState).code) !== 0
                }`
            );
            console.error(`Code is ${code.toString("hex")}`);
        }

        let emittedEvent: EventDesc | undefined = undefined;
        // Finally check if an event is being emitted for this step
        if (step.opcode.name.startsWith("LOG")) {
            const off = Number(evmStack[evmStack.length - 1]);
            const size = Number(evmStack[evmStack.length - 2]);

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
            stack: [...stack],
            src,
            astNode,
            emittedEvent,
            contractInfo: curExtFrame.info
        };
    }

    async debugTx(
        tx: Transaction,
        block: Block | undefined,
        stateManager: StateManager | undefined
    ): Promise<[StepState[], RunTxResult]> {
        const vm = new VM({ stateManager });
        const sender = tx.getSenderAddress().toString();
        const receiver = tx.to === undefined ? ZERO_ADDRESS_STRING : tx.to.toString();
        const isCreation = receiver === ZERO_ADDRESS_STRING;
        const stack: Frame[] = [];

        let curFrame: Frame;

        if (isCreation) {
            curFrame = await this.makeCreationFrame(sender, tx.data, 0);
        } else {
            const receiverInfo = this.deployedContracts.get((tx.to as Address).toString());
            // TODO: This assert is kinda stupid. Because of it we need to use only the internal VM instead of accepting any VM (so that
            // we know about all contracts deployed already.) Should re-write the code so I don't need this.
            assert(receiverInfo !== undefined, ``);

            curFrame = await this.makeCallFrame(
                sender,
                tx.to as Address,
                tx.data,
                receiverInfo.code,
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
     * Helper: Given an address, and the contract code at this address, build a `DeployedContractInfo` struct
     * for this contract. This preforms lookups by code in the `artifactManager`.
     */
    private buildDeployedContractInfo(address: Address, code: Buffer): DeployedContractInfo {
        let info: ContractInfo | undefined;

        try {
            info = this.artifactManager.getContractFromDeployedBytecode(code);
        } catch (e) {
            // Nothing to do
        }

        const hexAddr = address.toString();

        return {
            address: hexAddr,
            code: code,
            info
        };
    }

    /**
     * Get the information for the contract deployed at the given address.
     * Returns `undefined` if we don't know about such a contract. If there is a
     * contract there, but we don't have compiler/debug info for it, this will
     * NOT return undefined - it will return a valid struct.
     */
    private getDeployedContract(
        arg: HexString | Address,
        code: Buffer
    ): DeployedContractInfo | undefined {
        const addr = arg instanceof Address ? arg : Address.fromString(arg);
        const hexAddr = arg instanceof Address ? arg.toString() : arg;

        const res: DeployedContractInfo | undefined = this.deployedContracts.get(hexAddr);

        if (res !== undefined) {
            return res;
        }

        if (code.length === 0) {
            return undefined;
        }

        const info = this.buildDeployedContractInfo(addr, code);

        this.deployedContracts.set(info.address, info);

        return info;
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
     * Build a `CallFrame` from the given `sender` address, `receiver` address, `data` `Buffer`, (msg.data) and the current trace step number.
     */
    private async makeCallFrame(
        sender: HexString,
        receiver: Address,
        data: Buffer,
        receiverCode: Buffer,
        step: number
    ): Promise<CallFrame> {
        const deplContractInfo = this.getDeployedContract(receiver, receiverCode);

        assert(deplContractInfo !== undefined, `No contract found at address ${receiver}`);

        const selector: UnprefixedHexString = data.slice(0, 4).toString("hex");

        let callee: FunctionDefinition | VariableDeclaration | undefined;
        let args: Array<[string, DataView | undefined]> | undefined;

        if (
            deplContractInfo.info &&
            deplContractInfo.info.ast &&
            deplContractInfo.info?.artifact.abiEncoderVersion
        ) {
            const contract = deplContractInfo.info.ast;
            const abiVersion = deplContractInfo.info?.artifact.abiEncoderVersion;
            const matchingFuns = contract.vFunctions.filter(
                (fun) => getFunctionSelector(fun) === selector
            );

            if (matchingFuns.length === 1) {
                callee = matchingFuns[0];
            } else {
                const matchingGetters = contract.vStateVariables.filter((vDef) => {
                    try {
                        return (
                            vDef.visibility === StateVariableVisibility.Public &&
                            vDef.getterCanonicalSignatureHash(abiVersion) === selector
                        );
                    } catch (e) {
                        return false;
                    }
                });

                if (matchingGetters.length === 1) {
                    callee = matchingGetters[0];
                }
            }

            if (callee !== undefined) {
                try {
                    args = decodeMsgData(callee, data, DataLocationKind.CallData, abiVersion);
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
            code: deplContractInfo.code,
            info: deplContractInfo.info,
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
        stack: Stack
    ): Array<[string, DataView]> | undefined {
        const res: Array<[string, DataView]> = [];
        let formals: Array<[string, TypeNode]>;

        try {
            formals =
                callee instanceof FunctionDefinition
                    ? callee.vParameters.vParameters.map((argDef) => [
                          argDef.name,
                          variableDeclarationToTypeNode(argDef)
                      ])
                    : callee.getterArgsAndReturn()[0].map((typ, i) => [`ARG_${i}`, typ]);
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
