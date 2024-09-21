import { InterpreterStep } from "@ethereumjs/evm";
import { VM } from "@ethereumjs/vm";
import { EVMOpInfo, getOpInfo } from "../../opcodes";

export interface OpInfo {
    op: EVMOpInfo;
}

/**
 * Adds op info to each step
 */
export function addOpInfo<T extends object>(vm: VM, step: InterpreterStep, state: T): T & OpInfo {
    return { op: getOpInfo(step.opcode.name), ...state };
}
