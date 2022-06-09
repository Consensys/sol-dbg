import { PrefixedHexString } from "ethereumjs-util";
import {
    assert,
    ASTContext,
    ASTNode,
    ASTReader,
    ContractDefinition,
    getABIEncoderVersion,
    SourceUnit
} from "solc-typed-ast";
import { ABIEncoderVersion } from "solc-typed-ast/dist/types/abi";
import { OpcodeInfo } from ".";
import { DecodedBytecodeSourceMapEntry, parseBytecodeSourceMapping } from "..";
import {
    getArtifactCompilerVersion,
    getCodeHash,
    getCreationCodeHash,
    PartialBytecodeDescription,
    PartialCompiledContract,
    PartialSolcOutput,
    RawAST
} from "../artifacts";
import { findContractDef } from "../utils/misc";

export interface IArtifactManager {
    getContractFromDeployedBytecode(code: string | Buffer): ContractInfo | undefined;
    getContractFromCreationBytecode(code: string | Buffer): ContractInfo | undefined;
    artifacts(): ArtifactInfo[];
    contracts(): ContractInfo[];
    /// TODO: Need a better way of identifying runtime contracts than (bytecode, isCreation)
    getFileById(id: number, code: string | Buffer, isCreation: boolean): SourceFileInfo | undefined;
}

export interface BytecodeInfo {
    // Map from the file-id (used in source maps in this artifact) to the generated Yul sources for this contract's creation bytecode.
    // Note that multiple contracts have overlapping generated units ids, so we need a mapping per-contract
    generatedFileMap: Map<number, SourceFileInfo>;
    srcMap: DecodedBytecodeSourceMapEntry[];
    offsetToIndexMap: Map<number, number>;
}

export interface ContractInfo {
    artifact: ArtifactInfo;
    contractArtifact: PartialCompiledContract;
    contractName: string;
    fileName: string;
    ast: ContractDefinition | undefined;
    bytecode: BytecodeInfo;
    deployedBytecode: BytecodeInfo;
    mdHash: PrefixedHexString;
}

export interface ArtifactInfo {
    artifact: PartialSolcOutput;
    units: SourceUnit[];
    ctx: ASTContext;
    compilerVersion: string;
    abiEncoderVersion: ABIEncoderVersion;
    // Map from the file-id (used in source maps in this artifact) to the actual sources entry (and some additional info)
    fileMap: Map<number, SourceFileInfo>;
    // Map from src triples to AST nodes with that source range
    srcMap: Map<string, ASTNode>;
}

export enum SourceFileType {
    Solidity = "solidity",
    InternalYul = "internal_yul"
}

export interface SourceFileInfo {
    contents: string | undefined;
    rawAst: RawAST;
    ast: SourceUnit | undefined;
    name: string;
    fileIndex: number;
    type: SourceFileType;
}

/**
 * Build an offset-to-instruction index map for the given bytecode. Note
 * that since its not easy to tell exactly where the instruction section ends, we
 * over-approximate by also mapping any potential data sections at the end of bytecode.
 *
 * The main assumption we make is that all non-instruction bytecode comes at the end of the
 * bytecode.
 */
function buildOffsetToIndexMap(bytecode: Buffer | string): Map<number, number> {
    if (typeof bytecode === "string") {
        bytecode = Buffer.from(bytecode, "hex");
    }

    const res = new Map<number, number>();

    for (let i = 0, off = 0; off < bytecode.length; i++) {
        const op = OpcodeInfo[bytecode[off]];

        res.set(off, i);

        off += op.length;
    }

    return res;
}

export function getOffsetSrc(off: number, bytecode: BytecodeInfo): DecodedBytecodeSourceMapEntry {
    const idx = bytecode.offsetToIndexMap.get(off);

    assert(idx !== undefined, `No index for code offset ${off}`);
    assert(
        idx >= 0 && idx < bytecode.srcMap.length,
        `Instruction index ${idx} outside of source map (0-${bytecode.srcMap.length})`
    );

    return bytecode.srcMap[idx];
}

/**
 * ArtifactManager contains a set of solc standard JSON compiler artifacts, and allows for quick
 * lookup from creation or deployed bytecode to the actual compiler artifact.
 */
export class ArtifactManager implements IArtifactManager {
    private _artifacts: ArtifactInfo[];
    private _contracts: ContractInfo[];
    private _mdHashToContractInfo: Map<string, ContractInfo>;

    constructor(artifacts: PartialSolcOutput[]) {
        this._artifacts = [];
        this._contracts = [];
        this._mdHashToContractInfo = new Map<string, ContractInfo>();

        for (const artifact of artifacts) {
            const reader = new ASTReader();
            const compilerVersion = getArtifactCompilerVersion(artifact);

            assert(compilerVersion !== undefined, `Couldn't find compiler version for artifact`);

            const units = reader.read(artifact);
            const abiEncoderVersion = getABIEncoderVersion(units, compilerVersion);
            const fileMap = new Map<number, SourceFileInfo>();
            const unitMap = new Map<number, SourceUnit>(units.map((unit) => [unit.id, unit]));

            for (const fileName in artifact.sources) {
                const sourceInfo = artifact.sources[fileName];
                // TODO: This is hacky. Figure out a cleaner aay to get the fileIndex
                const fileIdx =
                    sourceInfo.fileIndex !== undefined ? sourceInfo.fileIndex : sourceInfo.id;

                fileMap.set(fileIdx, {
                    contents: sourceInfo.contents,
                    rawAst: sourceInfo.ast,
                    ast: unitMap.get(sourceInfo.ast.id),
                    name: fileName,
                    fileIndex: fileIdx,
                    type: SourceFileType.Solidity
                });
            }

            const srcMap = new Map<string, ASTNode>();

            for (const unit of units) {
                unit.walkChildren((child) => srcMap.set(child.src, child));
            }

            this._artifacts.push({
                artifact,
                units,
                ctx: reader.context,
                compilerVersion,
                abiEncoderVersion,
                fileMap,
                srcMap
            });
        }

        for (const artifactInfo of this._artifacts) {
            const artifact = artifactInfo.artifact;

            for (const fileName in artifact.contracts) {
                for (const contractName in artifact.contracts[fileName]) {
                    const contractDef = findContractDef(artifactInfo.units, fileName, contractName);
                    const contractArtifact = artifact.contracts[fileName][contractName];
                    const generatedFileMap = new Map<number, SourceFileInfo>();
                    const deployedGeneratedFileMap = new Map<number, SourceFileInfo>();

                    for (const [srcMap, bytecodeInfo] of [
                        [generatedFileMap, contractArtifact.evm.bytecode],
                        [deployedGeneratedFileMap, contractArtifact.evm.deployedBytecode]
                    ] as Array<[Map<number, SourceFileInfo>, PartialBytecodeDescription]>) {
                        if (!bytecodeInfo.generatedSources) {
                            continue;
                        }

                        for (const src of bytecodeInfo.generatedSources) {
                            srcMap.set(src.id, {
                                rawAst: src.ast,
                                ast: undefined,
                                name: src.name ? src.name : "",
                                contents: src.contents ? src.contents : undefined,
                                type: SourceFileType.InternalYul,
                                fileIndex: src.id
                            });
                        }
                    }

                    const hash = getCodeHash(contractArtifact.evm.deployedBytecode.object);

                    assert(
                        hash !== undefined,
                        `Couldn't find md in bytecode for ${contractName} from ${fileName}`
                    );

                    const contractInfo: ContractInfo = {
                        artifact: artifactInfo,
                        contractArtifact: contractArtifact,
                        fileName,
                        contractName,
                        ast: contractDef,
                        bytecode: {
                            generatedFileMap,
                            srcMap: parseBytecodeSourceMapping(
                                contractArtifact.evm.bytecode.sourceMap
                            ),
                            offsetToIndexMap: buildOffsetToIndexMap(
                                contractArtifact.evm.bytecode.object
                            )
                        },
                        deployedBytecode: {
                            generatedFileMap: deployedGeneratedFileMap,
                            srcMap: parseBytecodeSourceMapping(
                                contractArtifact.evm.deployedBytecode.sourceMap
                            ),
                            offsetToIndexMap: buildOffsetToIndexMap(
                                contractArtifact.evm.deployedBytecode.object
                            )
                        },
                        mdHash: hash[1]
                    };

                    this._contracts.push(contractInfo);

                    this._mdHashToContractInfo.set(hash[1], contractInfo);
                }
            }
        }
    }

    artifacts(): ArtifactInfo[] {
        return this._artifacts;
    }

    getContractFromDeployedBytecode(bytecode: string | Buffer): ContractInfo | undefined {
        const hash = getCodeHash(bytecode);

        if (hash) {
            return this._mdHashToContractInfo.get(hash[1]);
        }

        return undefined;
    }

    getContractFromCreationBytecode(creationBytecode: string | Buffer): ContractInfo | undefined {
        const hash = getCreationCodeHash(creationBytecode);

        if (hash) {
            return this._mdHashToContractInfo.get(hash[1]);
        }

        return undefined;
    }

    getFileById(
        id: number,
        arg: string | Buffer | ContractInfo,
        isCreation: boolean
    ): SourceFileInfo | undefined {
        let contractInfo: ContractInfo | undefined;

        if (typeof arg === "string" || arg instanceof Buffer) {
            contractInfo = isCreation
                ? this.getContractFromCreationBytecode(arg)
                : this.getContractFromDeployedBytecode(arg);
        } else {
            contractInfo = arg;
        }

        if (contractInfo === undefined) {
            return undefined;
        }

        const genFilesMap = isCreation
            ? contractInfo.bytecode.generatedFileMap
            : contractInfo.deployedBytecode.generatedFileMap;

        const res = genFilesMap.get(id);

        if (res) {
            return res;
        }

        return contractInfo.artifact.fileMap.get(id);
    }

    contracts(): ContractInfo[] {
        return this._contracts;
    }
}
