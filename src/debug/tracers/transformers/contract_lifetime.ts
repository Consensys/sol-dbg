import { InterpreterStep } from "@ethereumjs/evm";
import { Address } from "@ethereumjs/util";
import { VM } from "@ethereumjs/vm";
import { OPCODES } from "../../opcodes";
import { FrameKind } from "../../types";
import { BasicStepInfo } from "./basic_info";
import { ExternalFrameInfo, topExtFrame } from "./ext_stack";

export interface ContractLifeTimeInfo {
    contractCreated?: Address;
    contractKilled?: Address;
}

/**
 * Track contract creation/initialization/destruction. A contract is considered:
 *
 * 1. Created after its constructor returns successfully
 * 2. Destroyed when SELFDESTRUCT is executed
 */
export function addContractLifetimeInfo<T extends object & BasicStepInfo & ExternalFrameInfo>(
    vm: VM,
    step: InterpreterStep,
    state: T,
    trace: Array<T & ContractLifeTimeInfo>
): T & ContractLifeTimeInfo {
    // Case 1. Self-destruct
    if (state.op.opcode === OPCODES.SELFDESTRUCT) {
        return {
            contractKilled: state.address,
            ...state
        };
    }

    if (trace.length === 0) {
        return state;
    }

    // Case 2: We return from a
    const lastStep = trace[trace.length - 1];
    const lastStepFrame = topExtFrame(lastStep.stack);

    // Successful return from a creation frame
    if (
        lastStep.depth === state.depth + 1 &&
        lastStepFrame.kind === FrameKind.Creation &&
        lastStep.op.opcode === OPCODES.RETURN
    ) {
        return {
            contractCreated: lastStep.address,
            ...state
        };
    }

    return state;
}
