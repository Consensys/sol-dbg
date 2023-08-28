import { Address, bytesToUtf8 } from "@ethereumjs/util";
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
    InferType,
    IntType,
    PointerType,
    specializeType,
    StringType,
    StructDefinition,
    TupleType,
    TypeName,
    TypeNode,
    UserDefinedType,
    UserDefinedValueTypeDefinition
} from "solc-typed-ast";
import { DataLocation, DataLocationKind, LinearMemoryLocation, Memory } from "..";
import { bigEndianBytesToBigint, checkAddrOoB, fits, MAX_ARR_DECODE_LIMIT, uint256 } from "../..";

function mem_decodeInt(
    typ: IntType,
    loc: LinearMemoryLocation,
    memory: Memory
): undefined | [bigint, number] {
    const numAddr = checkAddrOoB(loc.address, memory);

    // OoB access
    if (numAddr === undefined) {
        return undefined;
    }

    let res = bigEndianBytesToBigint(memory.slice(numAddr, numAddr + 32));

    // Convert signed negative 2's complement values
    if (typ.signed && (res & (BigInt(1) << BigInt(typ.nBits - 1))) !== BigInt(0)) {
        // Mask out any 1's above the number's size
        res = res & ((BigInt(1) << BigInt(typ.nBits)) - BigInt(1));
        res = -((BigInt(1) << BigInt(typ.nBits)) - res);
    }

    assert(
        fits(res, typ),
        `Decoded value ${res} from ${loc} doesn't fit in expected type ${typ.pp()}`
    );

    return [res, 32];
}

function mem_decodeAddress(
    loc: LinearMemoryLocation,
    memory: Memory
): undefined | [Address, number] {
    const numAddr = checkAddrOoB(loc.address, memory);

    if (numAddr === undefined) {
        return undefined;
    }

    return [new Address(memory.slice(numAddr + 12, numAddr + 32)), 32];
}

function mem_decodeFixedBytes(
    typ: FixedBytesType,
    loc: LinearMemoryLocation,
    memory: Memory
): undefined | [Uint8Array, number] {
    const numAddr = checkAddrOoB(loc.address, memory);

    if (numAddr === undefined) {
        return undefined;
    }

    return [memory.slice(numAddr, numAddr + typ.size), 32];
}

function mem_decodeBool(loc: LinearMemoryLocation, memory: Memory): undefined | [boolean, number] {
    const numAddr = checkAddrOoB(loc.address, memory);

    if (numAddr === undefined) {
        return undefined;
    }

    const res = bigEndianBytesToBigint(memory.slice(numAddr, numAddr + 32)) !== BigInt(0);

    return [res, 32];
}

function mem_decodeEnum(
    def: EnumDefinition,
    loc: LinearMemoryLocation,
    memory: Memory
): undefined | [bigint, number] {
    const intType = enumToIntType(def);

    return mem_decodeInt(intType, loc, memory);
}

function mem_decodeBytes(
    loc: LinearMemoryLocation,
    memory: Memory
): undefined | [Uint8Array, number] {
    let bytesOffset = loc.address;
    let bytesSize = 0;

    const lenRes = mem_decodeInt(uint256, loc, memory);

    if (lenRes == undefined) {
        return undefined;
    }

    if (lenRes[0] >= MAX_ARR_DECODE_LIMIT) {
        return undefined;
    }

    const numLen = Number(lenRes[0]);

    bytesOffset += BigInt(lenRes[1]);
    bytesSize += lenRes[1];
    bytesSize += numLen + (numLen % 32 === 0 ? 0 : 1 - (numLen % 32));

    const checkedArrDynOffset = checkAddrOoB(bytesOffset, memory);

    if (checkedArrDynOffset === undefined) {
        return undefined;
    }

    if (checkedArrDynOffset + numLen > memory.length) {
        return undefined;
    }

    const res = memory.slice(checkedArrDynOffset, checkedArrDynOffset + numLen);

    return [res, bytesSize];
}

function mem_decodeString(loc: LinearMemoryLocation, memory: Memory): undefined | [string, number] {
    const bytes = mem_decodeBytes(loc, memory);

    if (bytes === undefined) {
        return undefined;
    }

    return [bytesToUtf8(bytes[0]), bytes[1]];
}

function mem_decodeArray(
    typ: ArrayType,
    loc: LinearMemoryLocation,
    memory: Memory,
    infer: InferType
): undefined | [any[], number] {
    let arrOffset = loc.address;
    let arrBytesSize = 0;

    let numLen: number;

    if (typ.size === undefined) {
        const len = mem_decodeInt(uint256, loc, memory);

        if (len == undefined) {
            return undefined;
        }

        if (len[0] >= MAX_ARR_DECODE_LIMIT) {
            return undefined;
        }

        numLen = Number(len[0]);

        arrOffset += BigInt(len[1]);
        arrBytesSize += len[1];
    } else {
        if (typ.size >= MAX_ARR_DECODE_LIMIT) {
            return undefined;
        }

        numLen = Number(typ.size);
    }

    const res: any[] = [];

    for (let i = 0; i < numLen; i++) {
        const elementTuple = mem_decodeValue(
            typ.elementT,
            { kind: loc.kind, address: arrOffset },
            memory,
            infer
        );

        if (elementTuple === undefined) {
            return undefined;
        }

        const [elementVal, elementSize] = elementTuple;

        res.push(elementVal);

        arrOffset += BigInt(elementSize);
        arrBytesSize += elementSize;
    }

    return [res, arrBytesSize];
}

function mem_decodeTuple(
    typ: TupleType,
    loc: LinearMemoryLocation,
    memory: Memory,
    infer: InferType
): undefined | [any[], number] {
    let tupleOffset: bigint = loc.address;
    let size = 0;

    const res: any[] = [];

    for (const field of typ.elements) {
        assert(field !== null, ``);
        const decodeRes = mem_decodeValue(
            field,
            { kind: loc.kind, address: tupleOffset },
            memory,
            infer
        );

        if (decodeRes === undefined) {
            return undefined;
        }

        const [elVal, elementSize] = decodeRes;

        tupleOffset += BigInt(elementSize);
        size += elementSize;

        res.push(elVal);
    }

    return [res, size];
}

function mem_decodeStruct(
    def: StructDefinition,
    loc: LinearMemoryLocation,
    memory: Memory,
    infer: InferType
): undefined | [any, number] {
    const res: any = {};

    let size = 0;
    let offset = loc.address;

    for (let i = 0; i < def.vMembers.length; i++) {
        const field = def.vMembers[i];
        const fieldT = specializeType(
            infer.typeNameToTypeNode(field.vType as TypeName),
            SolDataLocation.Memory
        );

        const fieldRes = mem_decodeValue(
            fieldT,
            { kind: loc.kind, address: offset },
            memory,
            infer
        );

        if (fieldRes === undefined) {
            return undefined;
        }

        res[field.name] = fieldRes[0];

        size += fieldRes[1];
        offset += BigInt(fieldRes[1]);
    }

    return [res, size];
}

function mem_decodePointer(
    typ: PointerType,
    loc: LinearMemoryLocation,
    memory: Memory,
    infer: InferType
): undefined | [any, number] {
    assert(
        typ.location === SolDataLocation.Memory,
        `Unexpected pointer to ${typ.location} in memory`
    );

    const offRes = mem_decodeInt(uint256, loc, memory);

    if (offRes === undefined) {
        return undefined;
    }

    const size = offRes[1];

    const pointedToLoc: DataLocation = {
        kind: DataLocationKind.Memory,
        address: offRes[0]
    };

    const pointedToValue = mem_decodeValue(typ.to, pointedToLoc, memory, infer);

    if (pointedToValue === undefined) {
        return undefined;
    }

    return [pointedToValue[0], size];
}

export function mem_decodeValue(
    typ: TypeNode,
    loc: LinearMemoryLocation,
    memory: Memory,
    infer: InferType
): undefined | [any, number] {
    //console.error(`mem_decodeValue(${typ.pp()}, ${ppLoc(loc)})`);
    if (typ instanceof IntType) {
        return mem_decodeInt(typ, loc, memory);
    }

    if (typ instanceof AddressType) {
        return mem_decodeAddress(loc, memory);
    }

    if (typ instanceof FixedBytesType) {
        return mem_decodeFixedBytes(typ, loc, memory);
    }

    if (typ instanceof BoolType) {
        return mem_decodeBool(loc, memory);
    }

    if (typ instanceof UserDefinedType) {
        const def = typ.definition;

        if (def instanceof EnumDefinition) {
            return mem_decodeEnum(def, loc, memory);
        }

        if (def instanceof ContractDefinition) {
            return mem_decodeAddress(loc, memory);
        }

        if (def instanceof UserDefinedValueTypeDefinition) {
            const underlyingType = infer.typeNameToTypeNode(def.underlyingType);

            return mem_decodeValue(underlyingType, loc, memory, infer);
        }

        if (def instanceof StructDefinition) {
            return mem_decodeStruct(def, loc, memory, infer);
        }

        throw new Error(`NYI decoding user defined type ${typ.pp()}`);
    }

    if (typ instanceof ArrayType) {
        return mem_decodeArray(typ, loc, memory, infer);
    }

    if (typ instanceof BytesType) {
        return mem_decodeBytes(loc, memory);
    }

    if (typ instanceof StringType) {
        return mem_decodeString(loc, memory);
    }

    if (typ instanceof TupleType) {
        return mem_decodeTuple(typ, loc, memory, infer);
    }

    if (typ instanceof PointerType) {
        return mem_decodePointer(typ, loc, memory, infer);
    }

    throw new Error(`NYI decoding ${typ.pp()}`);
}
