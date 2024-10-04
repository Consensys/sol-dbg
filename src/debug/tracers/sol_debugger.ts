import { InterpreterStep } from "@ethereumjs/evm";
import { TypedTransaction } from "@ethereumjs/tx";
import { VM } from "@ethereumjs/vm";
import { StepState } from "../types";
import { MapOnlyTracer } from "./base_tracer";
import {
    addBasicInfo,
    addContractLifetimeInfo,
    addKeccakInvertInfo,
    addOpInfo
} from "./transformers";
import { addEventInfo } from "./transformers/events";
import { addExternalFrame } from "./transformers/ext_stack";
import { addInternalFrame } from "./transformers/int_stack";
import { addSource } from "./transformers/source";

export class SolTxDebugger extends MapOnlyTracer<StepState> {
    async processRawTraceStep(
        vm: VM,
        step: InterpreterStep,
        trace: StepState[],
        tx: TypedTransaction
    ): Promise<[StepState, null]> {
        const opInfo = addOpInfo(vm, step, {});
        const basicInfo = await addBasicInfo(vm, step, opInfo, trace);
        const extFrameInfo = await addExternalFrame(
            vm,
            step,
            basicInfo,
            trace,
            this.artifactManager,
            tx
        );
        const source = await addSource(vm, step, extFrameInfo);
        const intStack = await addInternalFrame(
            vm,
            step,
            source,
            trace,
            this.artifactManager,
            this.strict
        );

        const events = await addEventInfo(vm, step, intStack);

        const contractLifetime = await addContractLifetimeInfo(vm, step, events, trace);

        const keccakPreimages = await addKeccakInvertInfo(vm, step, contractLifetime, trace);

        return [keccakPreimages, null];
    }
}
