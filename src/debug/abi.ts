import {
    AddressType,
    ArrayType,
    assert,
    BoolType,
    BytesType,
    ContractDefinition,
    DataLocation as SolDataLocation,
    EnumDefinition,
    enumToIntType,
    FixedBytesType,
    FunctionDefinition,
    InferType,
    IntType,
    MappingType,
    PointerType,
    StringType,
    StructDefinition,
    TupleType,
    TypeNode,
    UserDefinedType,
    UserDefinedValueTypeDefinition,
    VariableDeclaration
} from "solc-typed-ast";
import { ABIEncoderVersion } from "solc-typed-ast/dist/types/abi";
import { DataLocationKind, DataView, cd_decodeValue } from ".";
import { getFunctionSelector } from "../utils";

export function changeToLocation(typ: TypeNode, newLoc: SolDataLocation): TypeNode {
    if (typ instanceof PointerType) {
        return new PointerType(changeToLocation(typ.to, newLoc), newLoc, typ.kind);
    }

    if (typ instanceof ArrayType) {
        return new ArrayType(changeToLocation(typ.elementT, newLoc), typ.size);
    }

    if (typ instanceof MappingType) {
        assert(
            newLoc === SolDataLocation.Storage,
            `Cannot change type of mapping ${typ.pp()} to ${newLoc}`
        );

        return typ;
    }

    if (typ instanceof TupleType) {
        return new TupleType(typ.elements.map((elT) => changeToLocation(elT as TypeNode, newLoc)));
    }

    if (
        typ instanceof IntType ||
        typ instanceof BoolType ||
        typ instanceof AddressType ||
        typ instanceof FixedBytesType ||
        typ instanceof StringType ||
        typ instanceof BytesType ||
        typ instanceof UserDefinedType
    ) {
        return typ;
    }

    throw new Error(`Cannot change location of type ${typ.pp()}`);
}

/**
 * Return the static size that the type `typ` will take in the standard ABI encoding of
 * arguments.
 */
function abiStaticTypeSize(typ: TypeNode): number {
    if (
        typ instanceof IntType ||
        typ instanceof AddressType ||
        typ instanceof FixedBytesType ||
        typ instanceof BoolType ||
        typ instanceof PointerType
    ) {
        return 32;
    }

    if (typ instanceof UserDefinedType) {
        const def = typ.definition;

        if (
            def instanceof EnumDefinition ||
            def instanceof ContractDefinition ||
            def instanceof UserDefinedValueTypeDefinition
        ) {
            return 32;
        }

        throw new Error(`NYI decoding user-defined type ${typ.pp()}`);
    }

    if (typ instanceof TupleType) {
        let res = 0;

        for (const elT of typ.elements) {
            assert(elT !== null, ``);
            res += abiStaticTypeSize(elT);
        }

        return res;
    }

    throw new Error(`NYI decoding type ${typ.pp()}`);
}

/**
 * Given a callee AST Node (FunctionDefinition or VariableDeclaration
 * corresponding to a getter), some msg `data`, that lives in location
 * determined by `kind`, a type inference class as well as an `encoderVersion`
 * try and decode the function arguments for that particular callee from the
 * data.
 */
export function decodeMethodArgs(
    callee: FunctionDefinition | VariableDeclaration,
    data: Buffer,
    kind: DataLocationKind.Memory | DataLocationKind.CallData,
    infer: InferType,
    encoderVersion: ABIEncoderVersion
): Array<[string, any]> {
    const dataViews = buildMsgDataViews(callee, data, kind, infer, encoderVersion);

    const res: Array<[string, any]> = [];

    for (let i = 0; i < dataViews.length; i++) {
        const name = dataViews[i][0];
        const view = dataViews[i][1];

        if (view === undefined) {
            res.push([name, undefined]);
            continue;
        }

        assert(view.abiType !== undefined && view.loc.kind === DataLocationKind.CallData, ``);

        const val = cd_decodeValue(view.abiType, view.type, view.loc, data, BigInt(4), infer);

        res.push([name, val ? val[0] : val]);
    }

    return res;
}

/**
 * An ABI-decoder implementation that is resilient to failures in some arguments decoding.
 * This function will return partial decoding results. This is needed since the fuzzer may not
 * always produce inputs that decode in their entirety.
 */
export function buildMsgDataViews(
    callee: FunctionDefinition | VariableDeclaration,
    data: Buffer,
    kind: DataLocationKind.Memory | DataLocationKind.CallData,
    infer: InferType,
    encoderVersion: ABIEncoderVersion
): Array<[string, DataView | undefined]> {
    const res: Array<[string, DataView | undefined]> = [];

    const selector =
        callee instanceof FunctionDefinition
            ? getFunctionSelector(callee, infer)
            : infer.signatureHash(callee);

    assert(
        selector === data.slice(0, 4).toString("hex"),
        `Expected selector ${selector} instead got ${data.slice(0, 4)}`
    );

    const formals: Array<[string, TypeNode]> =
        callee instanceof FunctionDefinition
            ? callee.vParameters.vParameters.map((argDef) => [
                  argDef.name,
                  infer.variableDeclarationToTypeNode(argDef)
              ])
            : infer.getterArgsAndReturn(callee)[0].map((typ, i) => [`ARG_${i}`, typ]);

    let staticOff = 4;

    const len = data.length;

    for (const [name, originalType] of formals) {
        const typ = toABIEncodedType(originalType, infer, encoderVersion);
        const staticSize = abiStaticTypeSize(typ);
        const loc =
            staticOff + staticSize <= len ? { kind, address: BigInt(staticOff) } : undefined;

        staticOff += staticSize;

        const val = loc ? { type: originalType, abiType: typ, loc } : undefined;

        res.push([name, val]);
    }

    return res;
}

/**
 * Determine if the specified type `typ` is dynamic or not. Dynamic means
 * that if we are trying to read `typ` at location `loc`, in `loc` there should be just a
 * uint256 offset into memory/storage/calldata, where the actual data lives. Otherwise
 * (if the type is "static"), the direct encoding of the data will start at `loc`.
 *
 * Usually "static" types are just the value types - i.e. anything of statically
 * known size that fits in a uint256. As per https://docs.soliditylang.org/en/latest/abi-spec.html#formal-specification-of-the-encoding
 * there are several exceptions to the rule when encoding types in calldata:
 *
 * 1. Fixed size arrays with fixed-sized element types
 * 2. Tuples where all the tuple elements are fixed-size
 *
 * TODO(dimo):
 *  1. Check again that its not possible for tuples in internal calls to somehow get encoded on the stack
 *  2. What happens with return tuples? Are they always in memory?
 */
function isTypeEncodingDynamic(typ: TypeNode): boolean {
    if (
        typ instanceof PointerType ||
        typ instanceof ArrayType ||
        typ instanceof StringType ||
        typ instanceof BytesType
    ) {
        return true;
    }

    // Tuples in calldata with static elements
    if (typ instanceof TupleType) {
        for (const elT of typ.elements) {
            assert(elT !== null, ``);

            if (isTypeEncodingDynamic(elT)) {
                return true;
            }
        }

        return false;
    }

    return false;
}

/**
 * Convert an internal TypeNode to the external TypeNode that would correspond to it
 * after ABI-encoding with encoder version `encoderVersion`. Follows the following rules:
 *
 * 1. Contract definitions turned to address.
 * 2. Enum definitions turned to uint of minimal fitting size.
 * 3. Any storage pointer types are converted to memory pointer types.
 * 4. Throw an error on any nested mapping types.
 * 5. Fixed-size arrays with fixed-sized element types are encoded as inlined tuples
 * 6. Structs with fixed-sized elements are encoded as inlined tuples
 *
 * @see https://docs.soliditylang.org/en/latest/abi-spec.html
 */
export function toABIEncodedType(
    type: TypeNode,
    infer: InferType,
    encoderVersion: ABIEncoderVersion
): TypeNode {
    if (type instanceof MappingType) {
        throw new Error("Cannot abi-encode mapping types");
    }

    if (type instanceof ArrayType) {
        const encodedElementT = toABIEncodedType(type.elementT, infer, encoderVersion);

        if (type.size !== undefined) {
            const elements = [];

            for (let i = 0; i < type.size; i++) {
                elements.push(encodedElementT);
            }

            return new TupleType(elements);
        }

        return new ArrayType(encodedElementT, type.size);
    }

    if (type instanceof PointerType) {
        const toT = toABIEncodedType(type.to, infer, encoderVersion);

        return isTypeEncodingDynamic(toT) ? new PointerType(toT, type.location) : toT;
    }

    if (type instanceof UserDefinedType) {
        if (type.definition instanceof UserDefinedValueTypeDefinition) {
            return infer.typeNameToTypeNode(type.definition.underlyingType);
        }

        if (type.definition instanceof ContractDefinition) {
            return new AddressType(false);
        }

        if (type.definition instanceof EnumDefinition) {
            return enumToIntType(type.definition);
        }

        if (type.definition instanceof StructDefinition) {
            assert(
                encoderVersion !== ABIEncoderVersion.V1,
                "Getters of struct return type are not supported by ABI encoder v1"
            );

            const fieldTs = type.definition.vMembers.map((fieldT) =>
                infer.variableDeclarationToTypeNode(fieldT)
            );

            return new TupleType(
                fieldTs.map((fieldT) => toABIEncodedType(fieldT, infer, encoderVersion))
            );
        }
    }

    return type;
}

export function isABITypeStaticSized(type: TypeNode): boolean {
    if (type instanceof ArrayType) {
        return type.size !== undefined && isABITypeStaticSized(type.elementT);
    }

    if (type instanceof PointerType) {
        return isABITypeStaticSized(type.to);
    }

    if (type instanceof TupleType) {
        for (const elT of type.elements) {
            assert(elT !== null, ``);
            if (!isABITypeStaticSized(elT)) {
                return false;
            }
        }

        return true;
    }

    if (type instanceof StringType || type instanceof BytesType) {
        return false;
    }

    if (
        type instanceof IntType ||
        type instanceof AddressType ||
        type instanceof BoolType ||
        type instanceof FixedBytesType
    ) {
        return true;
    }

    throw new Error(`NYI isABITypeStaticSized(${type.pp()})`);
}
