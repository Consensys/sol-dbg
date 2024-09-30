import { bytesToHex } from "ethereum-cryptography/utils";
import { FunctionDefinition } from "solc-typed-ast";
import { StepState } from "../debug";
import { FAIL_MSG_DATA, FoundryCheatcodesAddress } from "../debug/foundry_cheatcodes";
import { bigEndianBufToNumber, wordToAddress } from "./misc";
import { flattenStack } from "./pp";

/**
 * Find the last step in the non-internal code, before trace step i
 */
export function findLastNonInternalStepBeforeStepI(
    trace: StepState[],
    i: number
): StepState | undefined {
    const stack = flattenStack(trace[i].stack);

    for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].callee instanceof FunctionDefinition) {
            if (j === stack.length - 1) {
                return trace[i];
            }

            return trace[stack[j + 1].startStep - 1];
        }
    }

    return undefined;
}

/**
 * Find the last step in the non-internal code, that leads to the first revert
 */
export function findLastNonInternalStepBeforeRevert(trace: StepState[]): StepState | undefined {
    let i = 0;

    for (; i < trace.length; i++) {
        if (trace[i].op.opcode === 0xfd) {
            break;
        }
    }

    if (i === trace.length) {
        return undefined;
    }

    return findLastNonInternalStepBeforeStepI(trace, i);
}

/**
 * Find the last step in the non-internal code, that leads to the last revert
 */
export function findLastNonInternalStepBeforeLastRevert(trace: StepState[]): StepState | undefined {
    let i = trace.length - 1;

    for (; i >= 0; i--) {
        if (trace[i].op.opcode === 0xfd) {
            break;
        }
    }

    if (i < 0) {
        return undefined;
    }

    return findLastNonInternalStepBeforeStepI(trace, i);
}

/**
 * Find the last step before calling the foundry cheatcode fail()
 */
export function findFirstCallToFail(trace: StepState[]): StepState | undefined {
    let i = 0;

    for (; i < trace.length; i++) {
        // Look for CALL to FoundryCheatcodesAddress with the FAIL_SELECTOR
        if (trace[i].op.mnemonic === "CALL") {
            const stackLen = trace[i].evmStack.length;
            const addr = wordToAddress(trace[i].evmStack[stackLen - 2]);

            if (!addr.equals(FoundryCheatcodesAddress)) {
                continue;
            }

            const argOffset = bigEndianBufToNumber(trace[i].evmStack[stackLen - 4]);
            const argSize = bigEndianBufToNumber(trace[i].evmStack[stackLen - 5]);

            if (argSize < 4) {
                continue;
            }

            const msgData = bytesToHex(trace[i].memory.slice(argOffset, argOffset + argSize));

            if (msgData === FAIL_MSG_DATA) {
                break;
            }
        }
    }

    if (i === trace.length) {
        return undefined;
    }

    //console.error(`Error step: ${i}`);

    return trace[i];
}
