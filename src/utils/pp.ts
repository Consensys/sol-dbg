import { Address } from "ethereumjs-util";
import {
    AddressType,
    ArrayType,
    assert,
    BoolType,
    BytesType,
    ContractDefinition,
    EnumDefinition,
    FixedBytesType,
    FunctionDefinition,
    FunctionKind,
    InferType,
    IntType,
    PointerType,
    StringType,
    StructDefinition,
    TypeNode,
    UserDefinedType,
    UserDefinedValueTypeDefinition
} from "solc-typed-ast";
import {
    ArtifactManager,
    ContractInfo,
    DbgStack,
    decodeValue,
    ExternalFrame,
    FrameKind,
    getContractInfo,
    lastExternalFrame,
    SolTxDebugger,
    SourceFileInfo,
    StepState
} from "../debug";

const srcLocation = require("src-location");
const fse = require("fs-extra");

function ppValue(typ: TypeNode, v: any, infer: InferType): string {
    if (v === undefined) {
        return `<failed decoding>`;
    }

    if (typ instanceof IntType) {
        return (v as bigint).toString();
    }

    if (typ instanceof AddressType) {
        return (v as Address).toString();
    }

    if (typ instanceof FixedBytesType) {
        return (v as Buffer).toString("hex");
    }

    if (typ instanceof BoolType) {
        return v ? "true" : "false";
    }

    if (typ instanceof UserDefinedType) {
        const def = typ.definition;

        if (def instanceof EnumDefinition) {
            const optInd = Number(v as bigint);

            assert(
                optInd >= 0 && optInd < def.vMembers.length,
                `Enum value ${optInd} outside of enum range 0-${def.vMembers.length} of ${typ.pp()}`
            );

            return `${def.name}.${def.vMembers[optInd].name}`;
        }

        if (def instanceof ContractDefinition) {
            return (v as Address).toString();
        }

        if (def instanceof UserDefinedValueTypeDefinition) {
            const underlyingType = infer.typeNameToTypeNode(def.underlyingType);

            return ppValue(underlyingType, v, infer);
        }

        throw new Error(`NYI ppValue of user-defined type ${typ.pp()}`);
    }

    if (typ instanceof PointerType) {
        if (typ.to instanceof ArrayType) {
            const elT = typ.to.elementT;

            return `[${(v as any[]).map((el) => ppValue(elT, el, infer)).join(", ")}]`;
        }

        if (typ.to instanceof BytesType) {
            return `0x${(v as Buffer).toString("hex")}`;
        }

        if (typ.to instanceof StringType) {
            return `"${v}"`;
        }

        if (typ.to instanceof UserDefinedType && typ.to.definition instanceof StructDefinition) {
            const fields = typ.to.definition.vMembers;
            const strFields: string[] = [];

            for (const field of fields) {
                try {
                    const fieldT = infer.variableDeclarationToTypeNode(field);

                    strFields.push(field.name + ": " + ppValue(fieldT, v[field.name], infer));
                } catch (e) {
                    strFields.push(field.name + ": <failed decoding>");
                }
            }

            return `{${strFields.join(", ")}}`;
        }

        throw new Error(`NYI ppValue of referenced type ${typ.to.pp()}`);
    }

    throw new Error(`NYI ppValue of type ${typ.pp()}`);
}

export function ppStackTrace(
    solDbg: SolTxDebugger,
    trace: StepState[],
    stack: DbgStack,
    curOffset: number
): string {
    const res: string[] = [];

    for (let i = 0; i < stack.length; i++) {
        const frame = stack[i];

        let frameStr: string;

        const lastOffset = i < stack.length - 1 ? trace[stack[i + 1].startStep - 1].pc : curOffset;
        const extFrame = lastExternalFrame(frame);
        const [lastPosInFrame] = solDbg.decodeSourceLoc(lastOffset, extFrame);

        const info = getContractInfo(frame);

        let funArgs: string;
        let funName: string | undefined;
        let fileName: string | undefined;

        const offset = trace[frame.startStep].pc;

        if (info) {
            fileName = info.fileName;
        }

        if (frame.callee) {
            if (frame.callee instanceof FunctionDefinition) {
                let calleeName: string;

                if (frame.callee.isConstructor) {
                    calleeName = "constructor";
                } else if (frame.callee.kind === FunctionKind.Fallback) {
                    calleeName = "fallback";
                } else if (frame.callee.kind === FunctionKind.Receive) {
                    calleeName = "receiver";
                } else {
                    calleeName = frame.callee.name;
                }

                fileName = (
                    frame.callee.vScope instanceof ContractDefinition
                        ? frame.callee.vScope.vScope
                        : frame.callee.vScope
                ).sourceEntryKey;

                funName =
                    (frame.callee.vScope instanceof ContractDefinition
                        ? frame.callee.vScope.name + "."
                        : "") + calleeName;
            } else {
                funName = `<compiler-generated function>@${offset}`;
            }
        } else {
            funName = `<unknown function>@${offset}`;
        }

        if (
            extFrame.info &&
            lastPosInFrame &&
            extFrame.info.artifact.fileMap.has(lastPosInFrame.sourceIndex)
        ) {
            const sourceInfo = extFrame.info.artifact.fileMap.get(
                lastPosInFrame.sourceIndex
            ) as SourceFileInfo;

            if (sourceInfo.contents !== undefined) {
                const t = srcLocation.indexToLocation(
                    sourceInfo.contents,
                    lastPosInFrame.start,
                    true
                );

                fileName += `:${t.line}:${t.column}`;
            }
        }

        if (frame.arguments) {
            const funArgEls: string[] = [];

            for (const [, view] of frame.arguments) {
                if (view === undefined) {
                    funArgEls.push("<unknown>");

                    continue;
                }

                const state = trace[frame.startStep];
                assert(info !== undefined, ``);
                const infer = solDbg.artifactManager.infer(info.artifact.compilerVersion);

                const val = decodeValue(view, state, infer);

                funArgEls.push(ppValue(view.type, val, infer));
            }

            funArgs = funArgEls.join(", ");
        } else {
            funArgs = "<unknown>";
        }

        if (frame.kind === FrameKind.InternalCall) {
            assert(fileName !== undefined, ``);

            frameStr = fileName + " ";
            frameStr += `${funName}(${funArgs})`;
        } else if (frame.kind === FrameKind.Call) {
            if (frame.info === undefined) {
                frameStr = `<unknown function(s) in contract ${frame.address.toString()}>`;
            } else {
                // If we have debug info for this contract ignore the external frame - it will duplicate the internal frame
                continue;
            }
        } else {
            if (frame.info === undefined || frame.info.ast === undefined) {
                frameStr = `<deploying unknown contract>`;
            } else {
                frameStr = `${fileName} `;
                frameStr += `<deploying ${funName}(${funArgs})>`;
            }
        }

        res.push(frameStr);
    }

    return res.reverse().join("\n");
}

export function printStepSourceString(
    step: StepState,
    lastExtStep: ExternalFrame,
    sources: Map<string, string>,
    artifactManager: ArtifactManager,
    prefix: string | undefined
): string | undefined {
    const info = step.contractInfo;

    if (info === undefined) {
        return undefined;
    }

    const errorLoc = step.src;

    if (errorLoc === undefined) {
        return undefined;
    }

    const fileInd = errorLoc.sourceIndex;
    const fileInfo = artifactManager.getFileById(
        fileInd,
        info as ContractInfo,
        lastExtStep.kind === "creation"
    );

    if (fileInfo === undefined) {
        return undefined;
    }

    const fileName = fileInfo.name;

    let fileContents = sources.get(fileName as string);

    if (fileContents === undefined) {
        const actualFileName = prefix ? prefix + fileName : fileName;
        fileContents = fse.readFileSync(actualFileName, {
            encoding: "utf-8"
        }) as string;

        sources.set(fileName, fileContents);
    }

    return (fileContents as string).substring(errorLoc.start, errorLoc.start + errorLoc.length);
}

export function debugDumpTrace(
    trace: StepState[],
    artifactManager: ArtifactManager,
    prefix?: string
): void {
    const sources = new Map<string, string>();

    for (let i = 0; i < trace.length; i++) {
        const step = trace[i];

        const jumpType =
            (step.op.mnemonic === "JUMP" || step.op.mnemonic === "JUMPI") && step.src
                ? step.src.jump
                : "";
        const srcString = printStepSourceString(
            step,
            lastExternalFrame(step.stack),
            sources,
            artifactManager,
            prefix
        );

        console.error(
            `${i} ${step.pc}: ${step.op.mnemonic} ${jumpType} ${
                srcString !== undefined ? srcString : ""
            }`
        );
    }
}

export function ppStep(step: StepState): string {
    let contractId: string;
    const addrStr = `${step.address.toString().slice(36)}`;

    if (step.contractInfo) {
        contractId = `${step.contractInfo.contractName}@${addrStr}`;
    } else if (step.codeMdHash) {
        contractId = `0x${step.codeMdHash.slice(0, 6)}...${step.codeMdHash.slice(60)}@${addrStr}`;
    } else {
        contractId = `unknown@${addrStr}`;
    }
    const immStr = step.op.immediates
        .map((imm) => step.code.slice(step.pc + 1, step.pc + 1 + imm.length).toString("hex"))
        .join(" ");
    const stackStr = step.evmStack
        .slice(step.evmStack.length - step.op.nPop, step.evmStack.length)
        .map((v) => v.toString("hex"))
        .join(", ");
    return `${contractId}# ${step.pc}: ${step.op.mnemonic}(${step.op.opcode.toString(
        16
    )}) ${immStr} [${stackStr}]`;
}
