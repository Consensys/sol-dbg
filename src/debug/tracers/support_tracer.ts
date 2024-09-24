import { InterpreterStep } from "@ethereumjs/evm";
import { TypedTransaction } from "@ethereumjs/tx";
import { VM } from "@ethereumjs/vm";
import { BaseSolTxTracer } from "./base_tracer";
import {
    addBasicInfo,
    addContractLifetimeInfo,
    addExternalFrame,
    addKeccakInvertInfo,
    addOpInfo,
    BasicStepInfo,
    ContractLifeTimeInfo,
    ExternalFrameInfo,
    Keccak256InvertInfo
} from "./transformers";

export type SupportTracerStepInfo = BasicStepInfo &
    ExternalFrameInfo &
    ContractLifeTimeInfo &
    Keccak256InvertInfo;
/**
 * This tracer computes contract lifetime information and keccak256 pre-images for a TX.
 * The information it collects supports the debugging for the main SolTxDebugger tracer.
 * It is more-light weight and is ran by the TestRunner for all TXs, even if we are not going to debug them.
 */
export class SupportTracer extends BaseSolTxTracer<SupportTracerStepInfo> {
    async processRawTraceStep(
        vm: VM,
        step: InterpreterStep,
        trace: SupportTracerStepInfo[],
        tx: TypedTransaction
    ): Promise<SupportTracerStepInfo> {
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
        const contracLifetimeInfo = addContractLifetimeInfo(vm, step, extFrameInfo, trace);
        const keccakInfo = addKeccakInvertInfo(vm, step, contracLifetimeInfo, trace);

        return keccakInfo;
    }
}
