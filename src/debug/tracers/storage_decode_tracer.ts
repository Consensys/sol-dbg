import { InterpreterStep } from "@ethereumjs/evm";
import { TypedTransaction } from "@ethereumjs/tx";
import { Address } from "@ethereumjs/util";
import { VM } from "@ethereumjs/vm";
import { ContractStates } from "../../utils";
import { decodeContractStates } from "../layout";
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
    Keccak256InvertInfo,
    KeccakPreimageMap
} from "./transformers";

export interface DecodedStorageInfo {
    decodedStorage?: ContractStates;
}

export type StorageDecodeTracerInfo = BasicStepInfo &
    ExternalFrameInfo &
    ContractLifeTimeInfo &
    Keccak256InvertInfo &
    DecodedStorageInfo;

export interface StorageDecodeTracerCtx {
    liveContracts: Set<string>;
    preimages: KeccakPreimageMap;
    targetSteps: Set<number>;
}

function reducer(
    state: ContractLifeTimeInfo & Keccak256InvertInfo,
    ctx: StorageDecodeTracerCtx
): void {
    if (state.contractCreated) {
        ctx.liveContracts.add(state.contractCreated.toString());
    }

    if (state.contractKilled) {
        ctx.liveContracts.delete(state.contractKilled.toString());
    }

    if (state.keccak) {
        ctx.preimages.set(state.keccak.to, state.keccak.from);
    }
}
/**
 * This tracer computes contract lifetime information and keccak256 pre-images for a TX.
 * The information it collects supports the debugging for the main SolTxDebugger tracer.
 * It is more-light weight and is ran by the TestRunner for all TXs, even if we are not going to debug them.
 */
export class StorageDecodeTracer extends BaseSolTxTracer<
    StorageDecodeTracerInfo,
    StorageDecodeTracerCtx
> {
    async processRawTraceStep(
        vm: VM,
        step: InterpreterStep,
        trace: StorageDecodeTracerInfo[],
        tx: TypedTransaction,
        ctx: StorageDecodeTracerCtx
    ): Promise<[StorageDecodeTracerInfo, StorageDecodeTracerCtx]> {
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

        reducer(keccakInfo, ctx);

        if (!ctx.targetSteps.has(trace.length)) {
            return [keccakInfo, ctx];
        }

        const state = vm.stateManager;
        const decodedStorage: ContractStates = await decodeContractStates(
            this.artifactManager,
            [...ctx.liveContracts].map(Address.fromString),
            state,
            ctx.preimages
        );

        return [
            {
                ...keccakInfo,
                decodedStorage
            },
            ctx
        ];
    }
}
