import { InterpreterStep } from "@ethereumjs/evm";
import { VM } from "@ethereumjs/vm";
import { assert, FunctionDefinition, TypeNode, VariableDeclaration } from "solc-typed-ast";
import { ContractInfo, IArtifactManager } from "../../artifact_manager";
import { isCalldataType2Slots } from "../../decoding";
import {
    DataLocationKind,
    DataView,
    ExternalFrame,
    Frame,
    FrameKind,
    InternalCallFrame,
    Stack
} from "../../types";
import { BasicStepInfo } from "./basic_info";
import { ExternalFrameInfo } from "./ext_stack";
import { SourceInfo } from "./source";

export function topExtFrame(stack: ExternalFrame[]): ExternalFrame {
    assert(stack.length > 0, `Empty stack!`);
    return stack[stack.length - 1];
}

export function topFrame(stack: ExternalFrame[]): Frame {
    const topExt = topExtFrame(stack);

    if (topExt.internalFrames === undefined || topExt.internalFrames.length === 0) {
        return topExt;
    }

    return topExt.internalFrames[topExt.internalFrames.length - 1];
}

function push(stack: ExternalFrame[], frame: Frame): void {
    if (frame.kind === FrameKind.InternalCall) {
        const top = stack[stack.length - 1];

        if (top.internalFrames === undefined) {
            top.internalFrames = [frame];
        } else {
            top.internalFrames.push(frame);
        }
    }
}

function pop(stack: ExternalFrame[]): Frame {
    assert(stack.length > 0, `Pop from empty stack`);
    const top = stack[stack.length - 1];

    if (top.internalFrames !== undefined && top.internalFrames.length > 0) {
        return top.internalFrames.pop() as InternalCallFrame;
    }

    return stack.pop() as ExternalFrame;
}

/**
 * WIP: TODO document
 */
function buildFunArgViews(
    callee: FunctionDefinition | VariableDeclaration,
    stack: Stack,
    contractInfo: ContractInfo,
    artifactManager: IArtifactManager
): Array<[string, DataView]> | undefined {
    const res: Array<[string, DataView]> = [];
    let formals: Array<[string, TypeNode]>;
    const infer = artifactManager.infer(contractInfo.artifact.compilerVersion);

    try {
        formals =
            callee instanceof FunctionDefinition
                ? callee.vParameters.vParameters.map((argDef: VariableDeclaration) => [
                      argDef.name,
                      infer.variableDeclarationToTypeNode(argDef)
                  ])
                : infer
                      .getterArgsAndReturn(callee)[0]
                      .map((typ: TypeNode, i: number) => [`ARG_${i}`, typ]);
    } catch (e) {
        // `variableDeclarationToTypeNode` may fail when referencing structs/contracts that are defined
        // in SourceUnits that are missing
        return undefined;
    }

    let offsetFromTop = -1;

    for (let i = formals.length - 1; i >= 0; i--) {
        const [name, typ] = formals[i];
        const stackSize = isCalldataType2Slots(typ) ? 2 : 1;

        offsetFromTop += stackSize;

        if (offsetFromTop > stack.length) {
            // Stack underflow. Could be due to optimized code?
            return undefined;
        }

        res.unshift([
            name,
            {
                type: typ,
                loc: {
                    kind: DataLocationKind.Stack,
                    offsetFromTop
                }
            }
        ]);
    }

    return res;
}

/**
 * Adds external frame info for each step
 */
export async function addInternalFrame<
    T extends object & BasicStepInfo & ExternalFrameInfo & SourceInfo
>(
    vm: VM,
    step: InterpreterStep,
    state: T,
    trace: T[],
    artifactManager: IArtifactManager,
    strict: boolean
): Promise<T> {
    // No internal stack frame on first step of trace
    if (trace.length === 0) {
        return state;
    }

    const lastStep = trace[trace.length - 1];

    // External call/return - no change to internal stack
    if (lastStep.depth !== state.depth) {
        return state;
    }

    // There are 2 ways to enter an internal function:
    let enteringInternalFun = false;

    //  1. Jumping into an internal function (the previous instruction is a JUMP with source map jump index i)
    if (
        state.op.mnemonic === "JUMPDEST" &&
        lastStep.op.mnemonic === "JUMP" &&
        lastStep.src &&
        lastStep.src.jump === "i"
    ) {
        enteringInternalFun = true;
    }

    const ast = state.astNode;
    const curExtFrame = topExtFrame(state.extStack);

    //  2. Fall-through (the previous instruction is literally the pervious instruction in the contract body,
    //      AND the current JUMPDEST corresponds to a whole function, AND the pervious instructions' callee is different
    //      from the current instruction's function.
    if (
        !enteringInternalFun &&
        state.op.mnemonic === "JUMPDEST" &&
        (ast instanceof FunctionDefinition ||
            (ast instanceof VariableDeclaration && ast.stateVariable)) &&
        topFrame(lastStep.extStack).callee !== ast
    ) {
        enteringInternalFun = true;
    }

    if (enteringInternalFun) {
        let args: Array<[string, DataView | undefined]> | undefined;

        if (
            ast instanceof FunctionDefinition ||
            (ast instanceof VariableDeclaration && ast.stateVariable)
        ) {
            assert(curExtFrame.info !== undefined, ``);
            args = buildFunArgViews(ast, state.evmStack, curExtFrame.info, artifactManager);
        }

        const newFrame: InternalCallFrame = {
            kind: FrameKind.InternalCall,
            nearestExtFrame: curExtFrame,
            callee: ast,
            offset: state.pc,
            startStep: trace.length,
            arguments: args
        };

        push(state.extStack, newFrame);
        return state;
    }

    // Returning from an internal function call
    if (state.op.mnemonic === "JUMP" && state.src && state.src.jump === "o") {
        const curFrame = topFrame(state.extStack);

        if (strict) {
            assert(
                curFrame.kind === FrameKind.InternalCall,
                `Mismatched internal return from frame `,
                curFrame.kind
            );

            pop(state.extStack);
        } else {
            if (curFrame.kind === FrameKind.InternalCall) {
                pop(state.extStack);
            }
            // @todo log an error somewhere
        }
    }

    return state;
}
