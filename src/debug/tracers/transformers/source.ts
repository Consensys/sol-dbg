import { InterpreterStep } from "@ethereumjs/evm";
import { VM } from "@ethereumjs/vm";
import * as sol from "solc-typed-ast";
import { getOffsetSrc } from "../../artifact_manager";
import { ExternalFrame, FrameKind } from "../../types";
import { BasicStepInfo } from "./basic_info";
import { ExternalFrameInfo, topExtFrame } from "./ext_stack";

export interface SourceInfo {
    src: sol.DecodedBytecodeSourceMapEntry | undefined;
    astNode: sol.ASTNode | undefined;
}

/**
 * Helper function to get the source information for the instruction at a given `instrOffset`,
 * in the context of the external call `ctx`.
 *
 * There are several cases this handles:
 *
 * 1. If there is no debug info for the contract executing in `ctx` return undefined
 * 2. If there is debug info, but no AST return only the decoded bytecode sourcemap entry
 * 3. If there is both debug info and an AST return the decoded source location and any AST nodes that match this location
 */
export function decodeSourceLoc(
    instrOffset: number,
    ctx: ExternalFrame
): [sol.DecodedBytecodeSourceMapEntry | undefined, sol.ASTNode | undefined] {
    if (!ctx.info) {
        return [undefined, undefined];
    }

    const bytecodeInfo =
        ctx.kind === FrameKind.Creation ? ctx.info.bytecode : ctx.info.deployedBytecode;

    const src = getOffsetSrc(instrOffset, bytecodeInfo);

    const astNode = ctx.info.artifact.srcMap.get(`${src.start}:${src.length}:${src.sourceIndex}`);

    return [src, astNode];
}

/**
 * Adds source info for each step (if available)
 */
export async function addSource<T extends object & BasicStepInfo & ExternalFrameInfo>(
    vm: VM,
    step: InterpreterStep,
    state: T
): Promise<T & SourceInfo> {
    const [src, astNode] = decodeSourceLoc(state.pc, topExtFrame(state));

    return {
        src,
        astNode,
        ...state
    };
}
