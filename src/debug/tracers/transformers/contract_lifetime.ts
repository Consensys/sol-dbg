import { InterpreterStep } from "@ethereumjs/evm";
import { Address } from "@ethereumjs/util";
import { RunTxResult, VM } from "@ethereumjs/vm";
import { OPCODES } from "../../opcodes";
import { FrameKind } from "../../types";
import { BasicStepInfo } from "./basic_info";
import { ExternalFrameInfo, topExtFrame } from "./ext_stack";

export interface ContractLifeTimeInfo {
    contractCreated?: Address;
    contractKilled?: Address;
}

/**
 * Given a trace of contract creation/deletion event compute a gen/kill set summary for the trace.
 */
export function getContractGenKillSet(
    trace: ContractLifeTimeInfo[],
    res?: RunTxResult
): [Set<string>, Set<string>] {
    // Need to account for an entire transaction creating a contract potentially.
    const [gen, kill] = trace.reduce<[Set<string>, Set<string>]>(
        ([gen, kill], info) => {
            if (info.contractCreated) {
                const strAddr = info.contractCreated.toString();

                if (kill.has(strAddr)) {
                    kill.delete(strAddr);
                } else {
                    gen.add(info.contractCreated.toString());
                }
            }

            if (info.contractKilled) {
                const strAddr = info.contractKilled.toString();
                if (gen.has(strAddr)) {
                    gen.delete(strAddr);
                } else {
                    kill.add(strAddr);
                }
            }
            return [gen, kill];
        },
        [new Set(), new Set()]
    );

    if (res && res.createdAddress !== undefined) {
        gen.add(res.createdAddress.toString());
    }

    return [gen, kill];
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
