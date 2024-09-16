import { Address } from "@ethereumjs/util";
import * as sol from "solc-typed-ast";
import { FunctionDefinition } from "solc-typed-ast";
import { HexString, UnprefixedHexString } from "../artifacts";
import { ImmMap } from "../utils";
import { ContractInfo } from "./artifact_manager";
import { EVMOpInfo } from "./opcodes";

export interface DeployedContractInfo {
    address: HexString;
    code: UnprefixedHexString;
    info?: ContractInfo;
}

export interface UnknownLocation {
    contract: DeployedContractInfo | undefined;
}

export interface SolLocation {
    contract: DeployedContractInfo | undefined;
    start: number;
    length: number;
    jump: "o" | "i" | "-";
    file: number;
}

export type DecodedSolValue = { value: any; type: string };

export interface StackFrame {
    fun: FunctionDefinition;
    argumentsAtStart: { [argName: string]: DecodedSolValue };
    argsAndLocals: { [varName: string]: DecodedSolValue };
}

export type StackTrace = StackFrame[];

export enum FrameKind {
    Call = "call",
    Creation = "creation",
    InternalCall = "internal_call"
}

/// require("@ethereumjs/evm/dist/cjs/types").EVMOpts
export type EVMOpts = any;

/**
 * Base interface for Stack frames maintained by the debugger
 */
export interface BaseFrame {
    readonly kind: FrameKind;
    /**
     * AST node causing the call. Note that this is not always a FunctionCall. For example this could be:
     * 1. A contract public state var VariableDeclaration
     * 2. Any checked arithmetic operation in sol > 0.8.0 (these are implemented as internal functions)
     * 3. Some other random non-call AST node, that is implemented as a compiler generated function
     */
    readonly callee: sol.ASTNode | undefined;
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
export interface BaseExternalFrame extends BaseFrame {
    readonly sender: Address;
    readonly msgData: Uint8Array;
    readonly address: Address;
    readonly info?: ContractInfo;
    readonly code: Uint8Array;
    readonly codeMdHash: HexString | undefined;
}

/**
 * Stack frame corresponding to an external call
 */
export interface CallFrame extends BaseExternalFrame {
    readonly kind: FrameKind.Call;
    readonly receiver: Address;
    readonly codeAddress: Address;
}

/**
 * Stack frame corresponding to a contract creation call
 */
export interface CreationFrame extends BaseExternalFrame {
    readonly kind: FrameKind.Creation;
}

/**
 * Stack frame corresponding to an internal function call
 */
export interface InternalCallFrame extends BaseFrame {
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
    type: sol.TypeNode;
    abiType?: sol.TypeNode;
    loc: DataLocation;
}

export type Memory = Uint8Array;
export type Stack = Uint8Array[];
export type Storage = ImmMap<bigint, Uint8Array>;
export interface EventDesc {
    payload: Uint8Array;
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
    // May be undefined, when we are in the consturctor. In that case use just the address
    codeAddress: Address | undefined;
}

/**
 * State that the debugger maintains for each trace step.
 * It includes the basic VM state (`StepVmState`) and optionally (if we have debug info for this contract)
 * includes the decoded source location, any AST nodes that are mapped to this instruction and any events
 * that may be emitted on this step.
 */
export interface StepState extends StepVMState {
    stack: DbgStack;
    src: sol.DecodedBytecodeSourceMapEntry | undefined;
    astNode: sol.ASTNode | undefined;
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
