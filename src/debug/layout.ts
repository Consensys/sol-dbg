import {
    ArrayType,
    ContractDefinition,
    InferType,
    MappingType,
    Mutability,
    PointerType,
    TypeNode
} from "solc-typed-ast";
import { IArtifactManager } from "./artifact_manager";
import { nextWord, roundLocToType, stor_decodeValue } from "./decoding";
import { MapKeys } from "./tracers";
import { DataLocationKind, Storage, StorageLocation } from "./types";

export interface ContractSolidityState {
    [key: string]: any;
}

function isTypeStringStatic32Bytes(t: string): boolean {
    return t.endsWith("[]") || t.includes("mapping(");
}

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

    // If this is set, we set all remaining state vars in res to `undefined`.
    // This is set when a failure in decoding prevents us from computing the rest of the
    // contract layout. This could be due to a missing base contract or a missing type definition
    // for a struct or user-defined value type.
    let cannotDecodeRemaining = false;

    for (const base of [...contract.vLinearizedBaseContracts].reverse()) {
        if (base === null || base === undefined) {
            cannotDecodeRemaining = true;
            continue;
        }

        for (const varDecl of base.vStateVariables) {
            // Not part of layout
            if (
                varDecl.mutability === Mutability.Constant ||
                varDecl.mutability === Mutability.Immutable
            ) {
                // @todo Support decoding constant state variables
                res[varDecl.name] = undefined;
                continue;
            }

            if (cannotDecodeRemaining) {
                res[varDecl.name] = undefined;
                continue;
            }

            let typeNode: TypeNode;

            try {
                typeNode = infer.variableDeclarationToTypeNode(varDecl);
            } catch (e) {
                /**
                 * Missing type info. If this is a:
                 *  - map type
                 *  - array type
                 *
                 * then we can continue decoding as it takes exactly 32 bytes
                 * statically in the layout. Otherwise we have to abort decoding
                 */
                res[varDecl.name] = undefined;

                if (isTypeStringStatic32Bytes(varDecl.typeString)) {
                    loc = nextWord(loc.endOffsetInWord === 32 ? loc : nextWord(loc));
                } else {
                    cannotDecodeRemaining = true;
                }

                continue;
            }

            loc = roundLocToType(loc, typeNode, infer);
            const arg = stor_decodeValue(typeNode, loc, storage, infer, mapKeys);

            if (arg === undefined) {
                if (
                    typeNode instanceof PointerType &&
                    (typeNode.to instanceof ArrayType || typeNode.to instanceof MappingType)
                ) {
                    loc = nextWord(loc.endOffsetInWord === 32 ? loc : nextWord(loc));
                } else {
                    cannotDecodeRemaining = true;
                }

                continue;
            }

            const [value, nextLoc] = arg;

            res[varDecl.name] = value;
            loc = nextLoc;
        }
    }

    return res;
}
