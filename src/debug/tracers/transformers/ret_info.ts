import { InterpreterStep } from "@ethereumjs/evm";
import { VM } from "@ethereumjs/vm";
import {
    FunctionDefinition,
    StateVariableVisibility,
    TupleType,
    VariableDeclaration
} from "solc-typed-ast";
import { mustReadMem, repeat, stackInd, stackTop } from "../../../utils";
import { IArtifactManager } from "../../artifact_manager";
import { cd_decodeValue } from "../../decoding";
import { OPCODES } from "../../opcodes";
import { DataLocationKind } from "../../types";
import { BasicStepInfo } from "./basic_info";
import { ExternalFrameInfo, topExtFrame } from "./ext_stack";

export interface ReturnInfo {
    retInfo?: {
        // Step at which the call that just returned started
        callStartStep: number;
        // Raw returned data
        rawReturnData: Uint8Array;
        // Decoded returned data (if ast info is available)
        decodedReturnData?: any[];
    };
}

/**
 * Adds return info for steps in the caller context, right after a return.
 */
export async function addReturnInfo<T extends object & BasicStepInfo & ExternalFrameInfo>(
    vm: VM,
    step: InterpreterStep,
    state: T,
    trace: Array<T & ReturnInfo>,
    artifactManager: IArtifactManager
): Promise<T & ReturnInfo> {
    if (trace.length === 0) {
        return state;
    }

    const lastStep = trace[trace.length - 1];

    if (lastStep.op.opcode !== OPCODES.RETURN && lastStep.op.opcode !== OPCODES.STOP) {
        return state;
    }

    const lastFrame = topExtFrame(lastStep);
    const callStartStep = lastFrame.startStep;

    const rawReturnData =
        lastStep.op.opcode === OPCODES.RETURN
            ? mustReadMem(
                  stackTop(lastStep.evmStack),
                  stackInd(lastStep.evmStack, 1),
                  lastStep.memory
              )
            : new Uint8Array(0);

    if (
        !(
            lastFrame.info &&
            (lastFrame.callee instanceof FunctionDefinition ||
                (lastFrame.callee instanceof VariableDeclaration &&
                    lastFrame.callee.stateVariable &&
                    lastFrame.callee.visibility === StateVariableVisibility.Public))
        )
    ) {
        return {
            ...state,
            retInfo: {
                callStartStep,
                rawReturnData
            }
        };
    }

    const infer = artifactManager.infer(lastFrame.info.artifact.compilerVersion);
    const type =
        lastFrame.callee instanceof FunctionDefinition
            ? infer.funDefToType(lastFrame.callee)
            : infer.getterFunType(lastFrame.callee);

    if (type.returns.length === 0) {
        return {
            ...state,
            retInfo: {
                callStartStep,
                rawReturnData,
                decodedReturnData: []
            }
        };
    }

    const encVer = lastFrame.info.artifact.abiEncoderVersion;
    const origType = new TupleType(type.returns);
    const abiType = new TupleType(type.returns.map((t) => infer.toABIEncodedType(t, encVer)));

    const decodeRes = cd_decodeValue(
        abiType,
        origType,
        { kind: DataLocationKind.CallData, address: 0n },
        rawReturnData,
        0n,
        infer
    );

    let decodedReturnData: any[];

    if (decodeRes === undefined) {
        decodedReturnData = repeat(undefined, type.returns.length);
    } else {
        decodedReturnData = decodeRes[0];
    }

    return {
        ...state,
        retInfo: {
            callStartStep,
            rawReturnData,
            decodedReturnData
        }
    };
}
