import { InterpreterStep } from "@ethereumjs/evm";
import { VM } from "@ethereumjs/vm";
import { bigEndianBufToNumber } from "../../../utils";
import { decodeEvent } from "../../abi";
import { IArtifactManager } from "../../artifact_manager";
import { DecodedEventDesc, EventDesc } from "../../types";
import { BasicStepInfo } from "./basic_info";

export interface EventInfo {
    emittedEvent: EventDesc | undefined;
    decodedEvent: DecodedEventDesc | undefined;
}

/**
 * Adds source info for each step (if available)
 */
export async function addEventInfo<T extends object & BasicStepInfo>(
    vm: VM,
    step: InterpreterStep,
    state: T,
    artifactManager: IArtifactManager
): Promise<T & EventInfo> {
    let emittedEvent: EventDesc | undefined = undefined;
    let decodedEvent: DecodedEventDesc | undefined = undefined;

    // Finally check if an event is being emitted for this step
    if (step.opcode.name.startsWith("LOG")) {
        const stack = state.evmStack;
        const off = bigEndianBufToNumber(stack[stack.length - 1]);
        const size = bigEndianBufToNumber(stack[stack.length - 2]);

        const nTopics = (step.opcode.name[3] as any) - ("0" as any);
        const payload = state.memory.slice(off, off + size);

        emittedEvent = {
            payload,
            topics: stack.slice(stack.length - 2 - nTopics, stack.length - 2).reverse()
        };

        decodedEvent = decodeEvent(artifactManager, emittedEvent);
    }

    return {
        emittedEvent,
        decodedEvent,
        ...state
    };
}
