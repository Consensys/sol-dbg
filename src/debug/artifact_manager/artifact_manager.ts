import { PrefixedHexString, bytesToBigInt } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex, hexToBytes, utf8ToBytes } from "ethereum-cryptography/utils";
import {
    ASTContext,
    ASTNode,
    ASTReader,
    ContractDefinition,
    EventDefinition,
    FunctionDefinition,
    FunctionVisibility,
    InferType,
    SourceUnit,
    StateVariableVisibility,
    TypeNode,
    VariableDeclaration,
    assert,
    getABIEncoderVersion
} from "solc-typed-ast";
import { ABIEncoderVersion, abiTypeToCanonicalName } from "solc-typed-ast/dist/types/abi";
import {
    DecodedBytecodeSourceMapEntry,
    EventDesc,
    PartialBytecodeDescription,
    PartialCompiledContract,
    PartialSolcOutput,
    RawAST,
    UnprefixedHexString,
    detectArtifactCompilerVersion,
    fastParseBytecodeSourceMapping,
    findContractDef,
    getCodeHash,
    getCreationCodeHash,
    zip3
} from "../..";
import { HexString } from "../../artifacts";
import { OpcodeInfo } from "../opcodes";
import { BytecodeTemplate, makeTemplate, matchesTemplate } from "./bytecode_templates";

export interface IArtifactManager {
    getContractFromDeployedBytecode(code: Uint8Array): ContractInfo | undefined;
    getContractFromCreationBytecode(code: Uint8Array): ContractInfo | undefined;
    getContractFromMDHash(hash: HexString): ContractInfo | undefined;
    artifacts(): ArtifactInfo[];
    contracts(): ContractInfo[];
    // TODO: Need a better way of identifying runtime contracts than (bytecode, isCreation)
    getFileById(id: number, code: Uint8Array, isCreation: boolean): SourceFileInfo | undefined;
    infer(version: string): InferType;
    findMethod(
        selector: HexString | Uint8Array
    ): [ContractInfo, FunctionDefinition | VariableDeclaration] | undefined;
    getEventDefInfo(topic: bigint | Uint8Array | EventDesc): EventDefInfo | undefined;
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
    mdHash: PrefixedHexString | undefined;
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

export interface EventDefInfo {
    definition: EventDefinition;
    artifact: ArtifactInfo;
    args: Array<[string, TypeNode, boolean]>;
}

/**
 * Build an offset-to-instruction index map for the given bytecode. Note
 * that since its not easy to tell exactly where the instruction section ends, we
 * over-approximate by also mapping any potential data sections at the end of bytecode.
 *
 * The main assumption we make is that all non-instruction bytecode comes at the end of the
 * bytecode.
 */
function buildOffsetToIndexMap(bytecode: Uint8Array | UnprefixedHexString): Map<number, number> {
    if (typeof bytecode === "string") {
        bytecode = hexToBytes(bytecode);
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
    private _inferCache = new Map<string, InferType>();
    private _creationBytecodeTemplates: BytecodeTemplate[];
    private _deployedBytecodeTemplates: BytecodeTemplate[];
    private _topicToEventInfo: Map<bigint, EventDefInfo>;

    /**
     * Helper to pick a canonical ABI encode version for a set of units.
     * For now just pick the highest version among the files
     * @todo (dimo) I am not sure this function is correct. Seems to work for now
     */
    private pickABIEncoderVersion(units: SourceUnit[], compilerVersion: string): ABIEncoderVersion {
        const versions = new Set<ABIEncoderVersion>(
            units.map((unit) => getABIEncoderVersion(unit, compilerVersion))
        );

        if (versions.has(ABIEncoderVersion.V2)) {
            return ABIEncoderVersion.V2;
        }

        return ABIEncoderVersion.V1;
    }

    constructor(artifacts: Array<PartialSolcOutput | [PartialSolcOutput, string]>) {
        this._artifacts = [];
        this._contracts = [];
        this._mdHashToContractInfo = new Map<string, ContractInfo>();
        this._creationBytecodeTemplates = [];
        this._deployedBytecodeTemplates = [];
        this._topicToEventInfo = new Map();

        for (const arg of artifacts) {
            const reader = new ASTReader();
            let artifact: PartialSolcOutput;
            let compilerVersion: string;

            if (arg instanceof Array) {
                [artifact, compilerVersion] = arg;
            } else {
                artifact = arg;
                const maybeCompilerVersion = detectArtifactCompilerVersion(artifact);
                assert(
                    maybeCompilerVersion !== undefined,
                    `Couldn't find compiler version for artifact`
                );

                compilerVersion = maybeCompilerVersion;
            }

            const units = reader.read(artifact);
            const abiEncoderVersion = this.pickABIEncoderVersion(units, compilerVersion);
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

            // Find all events and add them to the map
            for (const unit of artifactInfo.units) {
                const infer = this.infer(artifactInfo.compilerVersion);

                unit.walkChildren((definition) => {
                    // @todo support anonymous events as well
                    if (definition instanceof EventDefinition && !definition.anonymous) {
                        const evtType = infer.eventDefToType(definition);

                        const args: Array<[string, TypeNode, boolean]> = zip3(
                            definition.vParameters.vParameters.map((d) => d.name),
                            evtType.parameters,
                            definition.vParameters.vParameters.map((d) => d.indexed)
                        );

                        const topic = bytesToBigInt(
                            keccak256(
                                utf8ToBytes(
                                    `${definition.name}(${args.map((x) => abiTypeToCanonicalName(x[1])).join(",")})`
                                )
                            )
                        );

                        const info: EventDefInfo = {
                            definition,
                            artifact: artifactInfo,
                            args
                        };

                        this._topicToEventInfo.set(topic, info);
                    }
                });
            }

            for (const fileName in artifact.contracts) {
                for (const contractName in artifact.contracts[fileName]) {
                    const contractDef = findContractDef(artifactInfo.units, fileName, contractName);
                    const contractArtifact = artifact.contracts[fileName][contractName];
                    const generatedFileMap = new Map<number, SourceFileInfo>();
                    const deployedGeneratedFileMap = new Map<number, SourceFileInfo>();

                    if (contractArtifact.evm.deployedBytecode.object.length === 0) {
                        continue;
                    }

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

                    const contractInfo: ContractInfo = {
                        artifact: artifactInfo,
                        contractArtifact: contractArtifact,
                        fileName,
                        contractName,
                        ast: contractDef,
                        bytecode: {
                            generatedFileMap,
                            srcMap: fastParseBytecodeSourceMapping(
                                contractArtifact.evm.bytecode.sourceMap
                            ),
                            offsetToIndexMap: buildOffsetToIndexMap(
                                contractArtifact.evm.bytecode.object
                            )
                        },
                        deployedBytecode: {
                            generatedFileMap: deployedGeneratedFileMap,
                            srcMap: fastParseBytecodeSourceMapping(
                                contractArtifact.evm.deployedBytecode.sourceMap
                            ),
                            offsetToIndexMap: buildOffsetToIndexMap(
                                contractArtifact.evm.deployedBytecode.object
                            )
                        },
                        mdHash: hash
                    };

                    this._contracts.push(contractInfo);

                    if (hash !== undefined) {
                        this._mdHashToContractInfo.set(hash, contractInfo);
                    }

                    this._creationBytecodeTemplates.push(
                        makeTemplate(contractArtifact.evm.bytecode)
                    );

                    this._deployedBytecodeTemplates.push(
                        makeTemplate(contractArtifact.evm.deployedBytecode)
                    );
                }
            }
        }
    }

    artifacts(): ArtifactInfo[] {
        return this._artifacts;
    }

    getContractFromMDHash(hash: HexString): ContractInfo | undefined {
        return this._mdHashToContractInfo.get(hash);
    }

    getContractFromDeployedBytecode(bytecode: Uint8Array): ContractInfo | undefined {
        const hash = getCodeHash(bytecode);

        if (hash) {
            return this._mdHashToContractInfo.get(hash);
        }

        for (let i = 0; i < this._deployedBytecodeTemplates.length; i++) {
            const templ = this._deployedBytecodeTemplates[i];

            if (matchesTemplate(bytecode, templ)) {
                return this._contracts[i];
            }
        }

        return undefined;
    }

    getContractFromCreationBytecode(creationBytecode: Uint8Array): ContractInfo | undefined {
        const hash = getCreationCodeHash(creationBytecode);

        if (hash) {
            return this._mdHashToContractInfo.get(hash);
        }

        for (let i = 0; i < this._creationBytecodeTemplates.length; i++) {
            const templ = this._creationBytecodeTemplates[i];

            if (matchesTemplate(creationBytecode, templ)) {
                return this._contracts[i];
            }
        }

        return undefined;
    }

    getFileById(
        id: number,
        arg: Uint8Array | ContractInfo,
        isCreation: boolean
    ): SourceFileInfo | undefined {
        let contractInfo: ContractInfo | undefined;

        if (typeof arg === "string" || arg instanceof Uint8Array) {
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

    infer(version: string): InferType {
        if (!this._inferCache.has(version)) {
            this._inferCache.set(version, new InferType(version));
        }

        return this._inferCache.get(version) as InferType;
    }

    findMethod(
        selector: HexString | Uint8Array
    ): [ContractInfo, FunctionDefinition | VariableDeclaration] | undefined {
        if (selector instanceof Uint8Array) {
            selector = bytesToHex(selector);
        }

        for (const contract of this._contracts) {
            if (!contract.ast) {
                continue;
            }

            const inf = this.infer(contract.artifact.compilerVersion);
            const ast = contract.ast;

            const candidates = [
                ...ast.vFunctions.filter(
                    (method) =>
                        method.visibility === FunctionVisibility.External ||
                        method.visibility === FunctionVisibility.Public
                ),
                ...ast.vStateVariables.filter(
                    (getter) => getter.visibility === StateVariableVisibility.Public
                )
            ];

            for (const node of candidates) {
                if (inf.signatureHash(node) === selector) {
                    return [contract, node];
                }
            }
        }

        return undefined;
    }

    getEventDefInfo(arg: bigint | Uint8Array | EventDesc): EventDefInfo | undefined {
        let topic: bigint;

        if (typeof arg === "bigint") {
            topic = arg;
        } else if (arg instanceof Uint8Array) {
            topic = bytesToBigInt(arg);
        } else {
            if (arg.topics.length < 1) {
                return undefined;
            }

            topic = bytesToBigInt(arg.topics[0]);
        }

        return this._topicToEventInfo.get(topic);
    }
}
