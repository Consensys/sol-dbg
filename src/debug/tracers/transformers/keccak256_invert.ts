import { InterpreterStep } from "@ethereumjs/evm";
import { VM } from "@ethereumjs/vm";
import { bigEndianBufToBigint, bigEndianBufToNumber } from "../../../utils";
import { OPCODES } from "../../opcodes";
import { BasicStepInfo } from "./basic_info";

export interface Keccak256InvertInfo {
    keccak?: {
        from: Uint8Array;
        to: bigint;
    };
}

/**
 * Add keccak256 pre-image info. Note we add it on the next instruction after the keccak
 */
export function addKeccakInvertInfo<T extends object & BasicStepInfo>(
    vm: VM,
    step: InterpreterStep,
    state: T,
    trace: Array<T & Keccak256InvertInfo>
): T & Keccak256InvertInfo {
    if (trace.length === 0) {
        return state;
    }

    const lastStep = trace[trace.length - 1];

    if (!(lastStep.op.opcode === OPCODES.SHA3)) {
        return state;
    }

    const res = bigEndianBufToBigint(state.evmStack[state.evmStack.length - 1]);
    const lastStepTop = lastStep.evmStack.length - 1;

    const off = bigEndianBufToNumber(lastStep.evmStack[lastStepTop]);
    const size = bigEndianBufToNumber(lastStep.evmStack[lastStepTop - 1]);
    const preImage = lastStep.memory.slice(off, off + size);

    return {
        keccak: {
            from: preImage,
            to: res
        },
        ...state
    };
}
