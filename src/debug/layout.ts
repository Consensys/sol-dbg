import { ContractDefinition, InferType } from "solc-typed-ast";
import { IArtifactManager } from "./artifact_manager";
import { roundLocToType, stor_decodeValue } from "./decoding";
import { MapKeys } from "./tracers";
import { DataLocationKind, Storage, StorageLocation } from "./types";

export interface ContractSolidityState {
    [key: string]: any;
}

/**
 * Check that a type is a struct (without fully decoding it, to avoid crashes due to missing definitions)
 */
/*
function isStructT(t: TypeName): boolean {
    return t instanceof UserDefinedTypeName && t.typeString.startsWith("struct");
}
*/

/**
 * Check that a type is an array (without fully decoding it, to avoid crashes due to missing definitions)
 */
/*
function isArrayT(t: TypeName): boolean {
    return t instanceof ArrayTypeName;
}
*/

/**
 * Check if a state variable should begin in a fresh slot
 */
/*
function startsInNextSlot(t: TypeName, prevT?: TypeName): boolean {
    if (isStructT(t) || isArrayT(t)) {
        return true;
    }

    if (prevT != undefined && (isStructT(prevT) || isArrayT(prevT))) {
        return true;
    }

    return false;
}
*/

export function decodeContractState(
    artifactManager: IArtifactManager,
    infer: InferType,
    contract: ContractDefinition,
    storage: Storage,
    mapKeys?: MapKeys
): ContractSolidityState | undefined {
    const res: ContractSolidityState = {};

    let loc: StorageLocation = {
        kind: DataLocationKind.Storage,
        address: BigInt(0),
        endOffsetInWord: 32
    };

    for (const base of contract.vLinearizedBaseContracts) {
        for (const varDecl of base.vStateVariables) {
            const typeNode = infer.variableDeclarationToTypeNode(varDecl);
            loc = roundLocToType(loc, typeNode, infer);
            const arg = stor_decodeValue(typeNode, loc, storage, infer, mapKeys);

            if (arg === undefined) {
                return undefined;
            }

            const [value, nextLoc] = arg;

            res[varDecl.name] = value;
            loc = nextLoc;
        }
    }

    return res;
}
