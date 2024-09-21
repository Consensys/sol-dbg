import { InterpreterStep } from "@ethereumjs/evm";
import { TypedTransaction } from "@ethereumjs/tx";
import { VM } from "@ethereumjs/vm";
import { StepState } from "../types";
import { BaseSolTxTracer } from "./base_tracer";
import { addBasicInfo, addOpInfo } from "./transformers";
import { addEventInfo } from "./transformers/events";
import { addExternalFrame } from "./transformers/ext_stack";
import { addInternalFrame } from "./transformers/int_stack";
import { addSource } from "./transformers/source";

export class SolTxDebugger extends BaseSolTxTracer<StepState> {
    async processRawTraceStep(
        vm: VM,
        step: InterpreterStep,
        trace: StepState[],
        tx: TypedTransaction
    ): Promise<StepState> {
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

        return events;
    }
}
