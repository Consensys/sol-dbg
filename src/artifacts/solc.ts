/**
 * A type alias for 0x-prefixed hex strings. Used for documentation purposes.
 */
export type HexString = string;

/**
 * A type alias for hex strings without 0x prefix. Used for documentation purposes.
 */
export type UnprefixedHexString = string;

export type RawAST = any;

/**
 * Interface describing the source description in the `"sources"` field of the solc output,
 * as well as in the `contracts.evm.{bytecode, deployedBytecode}.generatedSources array.
 * Some of the optional fields (language, name, contents) are for the generatedSources.
 */
export interface SourceDescription {
    id: number;
    ast: RawAST;
    fileIndex: number;
    language?: string;
    name?: string;
    contents?: string;
}

export interface PartialBytecodeDescription {
    object: UnprefixedHexString;
    sourceMap: string;
    generatedSources?: SourceDescription[];
}

export interface PartialCompiledContract {
    evm: {
        bytecode: PartialBytecodeDescription;
        deployedBytecode: PartialBytecodeDescription;
    };
}

export interface PartialSolcOutput {
    sources: {
        [fileName: string]: SourceDescription;
    };

    contracts: {
        [fileName: string]: {
            [contractName: string]: PartialCompiledContract;
        };
    };
}
