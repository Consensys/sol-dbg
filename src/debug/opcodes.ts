import { assert } from "solc-typed-ast";

export enum InstructionControlFlow {
    NextInstruction = 0,
    JumpToTopOfStack = 1,
    ConditionalJumpToTopOfStack = 2,
    ExternalCall = 3,
    Return = 4,
    Revert = 5,
    Stop = 6,
    StopInvalid = 7
}

export interface Immediate {
    name: string;
    length: number;
}

export interface EVMOpInfo {
    opcode: number;
    mnemonic: string;
    length: number;
    immediates: Immediate[];
    nPush: number;
    nPop: number;
    valid: boolean;
    controlFlow: InstructionControlFlow;
}

export enum OPCODES {
    STOP = 0,
    ADD,
    MUL,
    SUB,
    DIV,
    SDIV,
    MOD,
    SMOD,
    ADDMOD,
    MULMOD,
    EXP,
    SIGNEXTEND,
    Invalid_c,
    Invalid_d,
    Invalid_e,
    Invalid_f,
    LT,
    GT,
    SLT,
    SGT,
    EQ,
    ISZERO,
    AND,
    OR,
    XOR,
    NOT,
    BYTE,
    SHL,
    SHR,
    SAR,
    Invalid_1e,
    Invalid_1f,
    SHA3,
    Invalid_21,
    Invalid_22,
    Invalid_23,
    Invalid_24,
    Invalid_25,
    Invalid_26,
    Invalid_27,
    Invalid_28,
    Invalid_29,
    Invalid_2a,
    Invalid_2b,
    Invalid_2c,
    Invalid_2d,
    Invalid_2e,
    Invalid_2f,
    ADDRESS,
    BALANCE,
    ORIGIN,
    CALLER,
    CALLVALUE,
    CALLDATALOAD,
    CALLDATASIZE,
    CALLDATACOPY,
    CODESIZE,
    CODECOPY,
    GASPRICE,
    EXTCODESIZE,
    EXTCODECOPY,
    RETURNDATASIZE,
    RETURNDATACOPY,
    EXTCODEHASH,
    BLOCKHASH,
    COINBASE,
    TIMESTAMP,
    NUMBER,
    DIFFICULTY,
    GASLIMIT,
    CHAINID,
    SELFBALANCE,
    BASEFEE,
    Invalid_49,
    Invalid_4a,
    Invalid_4b,
    Invalid_4c,
    Invalid_4d,
    Invalid_4e,
    Invalid_4f,
    POP,
    MLOAD,
    MSTORE,
    MSTORE8,
    SLOAD,
    SSTORE,
    JUMP,
    JUMPI,
    PC,
    MSIZE,
    GAS,
    JUMPDEST,
    Invalid_5c,
    Invalid_5d,
    Invalid_5e,
    PUSH0,
    PUSH1,
    PUSH2,
    PUSH3,
    PUSH4,
    PUSH5,
    PUSH6,
    PUSH7,
    PUSH8,
    PUSH9,
    PUSH10,
    PUSH11,
    PUSH12,
    PUSH13,
    PUSH14,
    PUSH15,
    PUSH16,
    PUSH17,
    PUSH18,
    PUSH19,
    PUSH20,
    PUSH21,
    PUSH22,
    PUSH23,
    PUSH24,
    PUSH25,
    PUSH26,
    PUSH27,
    PUSH28,
    PUSH29,
    PUSH30,
    PUSH31,
    PUSH32,
    DUP1,
    DUP2,
    DUP3,
    DUP4,
    DUP5,
    DUP6,
    DUP7,
    DUP8,
    DUP9,
    DUP10,
    DUP11,
    DUP12,
    DUP13,
    DUP14,
    DUP15,
    DUP16,
    SWAP1,
    SWAP2,
    SWAP3,
    SWAP4,
    SWAP5,
    SWAP6,
    SWAP7,
    SWAP8,
    SWAP9,
    SWAP10,
    SWAP11,
    SWAP12,
    SWAP13,
    SWAP14,
    SWAP15,
    SWAP16,
    LOG0,
    LOG1,
    LOG2,
    LOG3,
    LOG4,
    Invalid_a5,
    Invalid_a6,
    Invalid_a7,
    Invalid_a8,
    Invalid_a9,
    Invalid_aa,
    Invalid_ab,
    Invalid_ac,
    Invalid_ad,
    Invalid_ae,
    Invalid_af,
    Invalid_b0,
    Invalid_b1,
    Invalid_b2,
    Invalid_b3,
    Invalid_b4,
    Invalid_b5,
    Invalid_b6,
    Invalid_b7,
    Invalid_b8,
    Invalid_b9,
    Invalid_ba,
    Invalid_bb,
    Invalid_bc,
    Invalid_bd,
    Invalid_be,
    Invalid_bf,
    Invalid_c0,
    Invalid_c1,
    Invalid_c2,
    Invalid_c3,
    Invalid_c4,
    Invalid_c5,
    Invalid_c6,
    Invalid_c7,
    Invalid_c8,
    Invalid_c9,
    Invalid_ca,
    Invalid_cb,
    Invalid_cc,
    Invalid_cd,
    Invalid_ce,
    Invalid_cf,
    Invalid_d0,
    Invalid_d1,
    Invalid_d2,
    Invalid_d3,
    Invalid_d4,
    Invalid_d5,
    Invalid_d6,
    Invalid_d7,
    Invalid_d8,
    Invalid_d9,
    Invalid_da,
    Invalid_db,
    Invalid_dc,
    Invalid_dd,
    Invalid_de,
    Invalid_df,
    Invalid_e0,
    Invalid_e1,
    Invalid_e2,
    Invalid_e3,
    Invalid_e4,
    Invalid_e5,
    Invalid_e6,
    Invalid_e7,
    Invalid_e8,
    Invalid_e9,
    Invalid_ea,
    Invalid_eb,
    Invalid_ec,
    Invalid_ed,
    Invalid_ee,
    Invalid_ef,
    CREATE,
    CALL,
    CALLCODE,
    RETURN,
    DELEGATECALL,
    CREATE2,
    Invalid_f6,
    Invalid_f7,
    Invalid_f8,
    Invalid_f9,
    STATICCALL,
    Invalid_fb,
    Invalid_fc,
    REVERT,
    Invalid_fe,
    SELFDESTRUCT
}

export const OpcodeInfo: EVMOpInfo[] = [
    {
        opcode: 0x00,
        mnemonic: "STOP",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.Stop
    },
    {
        opcode: 0x01,
        mnemonic: "ADD",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x02,
        mnemonic: "MUL",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x03,
        mnemonic: "SUB",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x04,
        mnemonic: "DIV",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x05,
        mnemonic: "SDIV",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x06,
        mnemonic: "MOD",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x07,
        mnemonic: "SMOD",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x08,
        mnemonic: "ADDMOD",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x09,
        mnemonic: "MULMOD",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x0a,
        mnemonic: "EXP",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x0b,
        mnemonic: "SIGNEXTEND",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x0c,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x0d,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x0e,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x0f,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x10,
        mnemonic: "LT",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x11,
        mnemonic: "GT",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x12,
        mnemonic: "SLT",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x13,
        mnemonic: "SGT",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x14,
        mnemonic: "EQ",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x15,
        mnemonic: "ISZERO",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x16,
        mnemonic: "AND",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x17,
        mnemonic: "OR",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x18,
        mnemonic: "XOR",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x19,
        mnemonic: "NOT",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x1a,
        mnemonic: "BYTE",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x1b,
        mnemonic: "SHL",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x1c,
        mnemonic: "SHR",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x1d,
        mnemonic: "SAR",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x1e,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x1f,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x20,
        mnemonic: "SHA3",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x21,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x22,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x23,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x24,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x25,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x26,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x27,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x28,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x29,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x2a,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x2b,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x2c,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x2d,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x2e,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x2f,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x30,
        mnemonic: "ADDRESS",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x31,
        mnemonic: "BALANCE",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x32,
        mnemonic: "ORIGIN",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x33,
        mnemonic: "CALLER",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x34,
        mnemonic: "CALLVALUE",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x35,
        mnemonic: "CALLDATALOAD",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x36,
        mnemonic: "CALLDATASIZE",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x37,
        mnemonic: "CALLDATACOPY",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x38,
        mnemonic: "CODESIZE",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x39,
        mnemonic: "CODECOPY",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x3a,
        mnemonic: "GASPRICE",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x3b,
        mnemonic: "EXTCODESIZE",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x3c,
        mnemonic: "EXTCODECOPY",
        length: 1,
        immediates: [],
        nPop: 4,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x3d,
        mnemonic: "RETURNDATASIZE",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x3e,
        mnemonic: "RETURNDATACOPY",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x3f,
        mnemonic: "EXTCODEHASH",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x40,
        mnemonic: "BLOCKHASH",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x41,
        mnemonic: "COINBASE",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x42,
        mnemonic: "TIMESTAMP",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x43,
        mnemonic: "NUMBER",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x44,
        mnemonic: "DIFFICULTY",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x45,
        mnemonic: "GASLIMIT",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x46,
        mnemonic: "CHAINID",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x47,
        mnemonic: "SELFBALANCE",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x48,
        mnemonic: "BASEFEE",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x49,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x4a,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x4b,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x4c,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x4d,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x4e,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x4f,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x50,
        mnemonic: "POP",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x51,
        mnemonic: "MLOAD",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x52,
        mnemonic: "MSTORE",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x53,
        mnemonic: "MSTORE8",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x54,
        mnemonic: "SLOAD",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x55,
        mnemonic: "SSTORE",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x56,
        mnemonic: "JUMP",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.JumpToTopOfStack
    },
    {
        opcode: 0x57,
        mnemonic: "JUMPI",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.ConditionalJumpToTopOfStack
    },
    {
        opcode: 0x58,
        mnemonic: "PC",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x59,
        mnemonic: "MSIZE",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x5a,
        mnemonic: "GAS",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x5b,
        mnemonic: "JUMPDEST",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x5c,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x5d,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x5e,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0x5f,
        mnemonic: "PUSH0",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x60,
        mnemonic: "PUSH1",
        length: 2,
        immediates: [{ name: "arg", length: 1 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x61,
        mnemonic: "PUSH2",
        length: 3,
        immediates: [{ name: "arg", length: 2 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x62,
        mnemonic: "PUSH3",
        length: 4,
        immediates: [{ name: "arg", length: 3 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x63,
        mnemonic: "PUSH4",
        length: 5,
        immediates: [{ name: "arg", length: 4 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x64,
        mnemonic: "PUSH5",
        length: 6,
        immediates: [{ name: "arg", length: 5 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x65,
        mnemonic: "PUSH6",
        length: 7,
        immediates: [{ name: "arg", length: 6 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x66,
        mnemonic: "PUSH7",
        length: 8,
        immediates: [{ name: "arg", length: 7 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x67,
        mnemonic: "PUSH8",
        length: 9,
        immediates: [{ name: "arg", length: 8 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x68,
        mnemonic: "PUSH9",
        length: 10,
        immediates: [{ name: "arg", length: 9 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x69,
        mnemonic: "PUSH10",
        length: 11,
        immediates: [{ name: "arg", length: 10 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x6a,
        mnemonic: "PUSH11",
        length: 12,
        immediates: [{ name: "arg", length: 11 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x6b,
        mnemonic: "PUSH12",
        length: 13,
        immediates: [{ name: "arg", length: 12 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x6c,
        mnemonic: "PUSH13",
        length: 14,
        immediates: [{ name: "arg", length: 13 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x6d,
        mnemonic: "PUSH14",
        length: 15,
        immediates: [{ name: "arg", length: 14 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x6e,
        mnemonic: "PUSH15",
        length: 16,
        immediates: [{ name: "arg", length: 15 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x6f,
        mnemonic: "PUSH16",
        length: 17,
        immediates: [{ name: "arg", length: 16 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x70,
        mnemonic: "PUSH17",
        length: 18,
        immediates: [{ name: "arg", length: 17 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x71,
        mnemonic: "PUSH18",
        length: 19,
        immediates: [{ name: "arg", length: 18 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x72,
        mnemonic: "PUSH19",
        length: 20,
        immediates: [{ name: "arg", length: 19 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x73,
        mnemonic: "PUSH20",
        length: 21,
        immediates: [{ name: "arg", length: 20 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x74,
        mnemonic: "PUSH21",
        length: 22,
        immediates: [{ name: "arg", length: 21 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x75,
        mnemonic: "PUSH22",
        length: 23,
        immediates: [{ name: "arg", length: 22 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x76,
        mnemonic: "PUSH23",
        length: 24,
        immediates: [{ name: "arg", length: 23 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x77,
        mnemonic: "PUSH24",
        length: 25,
        immediates: [{ name: "arg", length: 24 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x78,
        mnemonic: "PUSH25",
        length: 26,
        immediates: [{ name: "arg", length: 25 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x79,
        mnemonic: "PUSH26",
        length: 27,
        immediates: [{ name: "arg", length: 26 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x7a,
        mnemonic: "PUSH27",
        length: 28,
        immediates: [{ name: "arg", length: 27 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x7b,
        mnemonic: "PUSH28",
        length: 29,
        immediates: [{ name: "arg", length: 28 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x7c,
        mnemonic: "PUSH29",
        length: 30,
        immediates: [{ name: "arg", length: 29 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x7d,
        mnemonic: "PUSH30",
        length: 31,
        immediates: [{ name: "arg", length: 30 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x7e,
        mnemonic: "PUSH31",
        length: 32,
        immediates: [{ name: "arg", length: 31 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x7f,
        mnemonic: "PUSH32",
        length: 33,
        immediates: [{ name: "arg", length: 32 }],
        nPop: 0,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x80,
        mnemonic: "DUP1",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 2,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x81,
        mnemonic: "DUP2",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x82,
        mnemonic: "DUP3",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 4,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x83,
        mnemonic: "DUP4",
        length: 1,
        immediates: [],
        nPop: 4,
        nPush: 5,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x84,
        mnemonic: "DUP5",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x85,
        mnemonic: "DUP6",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x86,
        mnemonic: "DUP7",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x87,
        mnemonic: "DUP8",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x88,
        mnemonic: "DUP9",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x89,
        mnemonic: "DUP10",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x8a,
        mnemonic: "DUP11",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x8b,
        mnemonic: "DUP12",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x8c,
        mnemonic: "DUP13",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x8d,
        mnemonic: "DUP14",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x8e,
        mnemonic: "DUP15",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x8f,
        mnemonic: "DUP16",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x90,
        mnemonic: "SWAP1",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 2,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x91,
        mnemonic: "SWAP2",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x92,
        mnemonic: "SWAP3",
        length: 1,
        immediates: [],
        nPop: 4,
        nPush: 4,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x93,
        mnemonic: "SWAP4",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x94,
        mnemonic: "SWAP5",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x95,
        mnemonic: "SWAP6",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x96,
        mnemonic: "SWAP7",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x97,
        mnemonic: "SWAP8",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x98,
        mnemonic: "SWAP9",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x99,
        mnemonic: "SWAP10",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x9a,
        mnemonic: "SWAP11",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x9b,
        mnemonic: "SWAP12",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x9c,
        mnemonic: "SWAP13",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x9d,
        mnemonic: "SWAP14",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x9e,
        mnemonic: "SWAP15",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0x9f,
        mnemonic: "SWAP16",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 3,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0xa0,
        mnemonic: "LOG0",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0xa1,
        mnemonic: "LOG1",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0xa2,
        mnemonic: "LOG2",
        length: 1,
        immediates: [],
        nPop: 4,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0xa3,
        mnemonic: "LOG3",
        length: 1,
        immediates: [],
        nPop: 5,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0xa4,
        mnemonic: "LOG4",
        length: 1,
        immediates: [],
        nPop: 6,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.NextInstruction
    },
    {
        opcode: 0xa5,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xa6,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xa7,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xa8,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xa9,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xaa,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xab,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xac,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xad,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xae,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xaf,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb0,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb1,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb2,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb3,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb4,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb5,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb6,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb7,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb8,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xb9,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xba,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xbb,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xbc,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xbd,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xbe,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xbf,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc0,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc1,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc2,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc3,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc4,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc5,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc6,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc7,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc8,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xc9,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xca,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xcb,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xcc,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xcd,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xce,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xcf,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd0,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd1,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd2,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd3,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd4,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd5,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd6,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd7,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd8,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xd9,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xda,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xdb,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xdc,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xdd,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xde,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xdf,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe0,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe1,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe2,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe3,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe4,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe5,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe6,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe7,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe8,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xe9,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xea,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xeb,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xec,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xed,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xee,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xef,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xf0,
        mnemonic: "CREATE",
        length: 1,
        immediates: [],
        nPop: 3,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.ExternalCall
    },
    {
        opcode: 0xf1,
        mnemonic: "CALL",
        length: 1,
        immediates: [],
        nPop: 7,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.ExternalCall
    },
    {
        opcode: 0xf2,
        mnemonic: "CALLCODE",
        length: 1,
        immediates: [],
        nPop: 7,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.ExternalCall
    },
    {
        opcode: 0xf3,
        mnemonic: "RETURN",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.Return
    },
    {
        opcode: 0xf4,
        mnemonic: "DELEGATECALL",
        length: 1,
        immediates: [],
        nPop: 6,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.ExternalCall
    },
    {
        opcode: 0xf5,
        mnemonic: "CREATE2",
        length: 1,
        immediates: [],
        nPop: 4,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.ExternalCall
    },
    {
        opcode: 0xf6,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xf7,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xf8,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xf9,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xfa,
        mnemonic: "STATICCALL",
        length: 1,
        immediates: [],
        nPop: 6,
        nPush: 1,
        valid: true,
        controlFlow: InstructionControlFlow.ExternalCall
    },
    {
        opcode: 0xfb,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xfc,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xfd,
        mnemonic: "REVERT",
        length: 1,
        immediates: [],
        nPop: 2,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.Revert
    },
    {
        opcode: 0xfe,
        mnemonic: "Invalid",
        length: 1,
        immediates: [],
        nPop: 0,
        nPush: 0,
        valid: false,
        controlFlow: InstructionControlFlow.StopInvalid
    },
    {
        opcode: 0xff,
        mnemonic: "SELFDESTRUCT",
        length: 1,
        immediates: [],
        nPop: 1,
        nPush: 0,
        valid: true,
        controlFlow: InstructionControlFlow.Stop //@todo Is this correct?
    }
];

export const MnemonicToOpcodeMap = new Map<string, number>(
    OpcodeInfo.filter(
        (opcodeMD) => opcodeMD.mnemonic !== "Invalid" || opcodeMD.opcode === 0xfe
    ).map((opcodeMD) => [
        opcodeMD.mnemonic === "Invalid" ? "INVALID" : opcodeMD.mnemonic,
        opcodeMD.opcode
    ])
);

// Add KECCAK256 as alias for SHA3
MnemonicToOpcodeMap.set("KECCAK256", 0x20);

export function getOpInfo(arg: string | number): EVMOpInfo {
    if (typeof arg === "number") {
        assert(arg >= 0 && arg < 256, `Invalid EVM opcode ${arg}`);

        return OpcodeInfo[arg];
    }

    const opcode = MnemonicToOpcodeMap.get(arg);

    assert(opcode !== undefined, `Unknown opcode mnemonic ${arg}`);
    assert(
        opcode >= 0 && opcode < 256,
        `Internal error: invalid opcode ${opcode} for mnemonic ${arg}`
    );

    return OpcodeInfo[opcode];
}

/**
 * Return true IFF the provided op changes the external call stack depth
 */
export function changesDepth(op: EVMOpInfo): boolean {
    // There are several cases where an op may change the stack depth
    return (
        op.opcode === OPCODES.CREATE ||
        op.opcode === OPCODES.CREATE2 || // Case 1: Contract creation
        op.opcode === OPCODES.CALL ||
        op.opcode === OPCODES.CALLCODE ||
        op.opcode === OPCODES.STATICCALL ||
        op.opcode === OPCODES.DELEGATECALL || // Case 2: Normal call
        op.opcode === OPCODES.RETURN || // Case 3: Normal return
        op.opcode === OPCODES.REVERT ||
        !op.valid
    ); // Case 4: Revert or invalid instruction (used for assert for example)
}

/**
 * Return true IFF the provided op increases the external call stack depth
 */
export function increasesDepth(op: EVMOpInfo): boolean {
    // There are several cases where an op may increase the stack depth
    return (
        op.opcode === OPCODES.CREATE ||
        op.opcode === OPCODES.CREATE2 || // Case 1: Contract creation
        op.opcode === OPCODES.CALL ||
        op.opcode === OPCODES.CALLCODE ||
        op.opcode === OPCODES.STATICCALL ||
        op.opcode === OPCODES.DELEGATECALL
    ); // Case 2: Normal call
}

/**
 * Return true IFF the provided op changes the memory
 */
export function changesMemory(op: EVMOpInfo): boolean {
    return (
        op.opcode === OPCODES.MSTORE ||
        op.opcode === OPCODES.MSTORE8 ||
        op.opcode === OPCODES.CALLDATACOPY ||
        op.opcode === OPCODES.CODECOPY ||
        op.opcode === OPCODES.EXTCODECOPY ||
        op.opcode === OPCODES.RETURNDATACOPY ||
        op.opcode === OPCODES.CALL ||
        op.opcode === OPCODES.CALLCODE ||
        op.opcode === OPCODES.DELEGATECALL ||
        op.opcode === OPCODES.STATICCALL
    );
}

/**
 * Return true IFF the provided op causes the creation of a new contract
 */
export function createsContract(op: EVMOpInfo): boolean {
    // There are several cases where an op may increase the stack depth
    return op.opcode === OPCODES.CREATE || op.opcode === OPCODES.CREATE2; // Case 1: Contract creation
}
