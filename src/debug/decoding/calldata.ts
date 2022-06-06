import { Address } from "ethereumjs-util";
import {
    AddressType,
    ArrayType,
    assert,
    BoolType,
    BytesType,
    DataLocation as SolDataLocation,
    FixedBytesType,
    IntType,
    PointerType,
    StringType,
    StructDefinition,
    TupleType,
    TypeNode,
    UserDefinedType,
    variableDeclarationToTypeNode
} from "solc-typed-ast";
import { CalldataLocation, DataLocation, DataLocationKind } from "..";
import {
    bigEndianBufToBigint,
    checkAddrOoB,
    fits,
    MAX_ARR_DECODE_LIMIT,
    Memory,
    uint256
} from "../..";
import { changeToLocation } from "../abi";

function cd_decodeInt(
    typ: IntType,
    loc: CalldataLocation,
    calldata: Buffer
): undefined | [bigint, number] {
    const numAddr = checkAddrOoB(loc.address, calldata);

    // OoB access
    if (numAddr === undefined) {
        return undefined;
    }

    let res = bigEndianBufToBigint(calldata.slice(numAddr, numAddr + 32));

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

function cd_decodeAddress(loc: CalldataLocation, calldata: Memory): undefined | [Address, number] {
    const numAddr = checkAddrOoB(loc.address, calldata);

    if (numAddr === undefined) {
        return undefined;
    }

    const res = new Address(calldata.slice(numAddr + 12, numAddr + 32));
    return [res, 32];
}

function cd_decodeFixedBytes(
    typ: FixedBytesType,
    loc: CalldataLocation,
    calldata: Memory
): undefined | [Buffer, number] {
    const numAddr = checkAddrOoB(loc.address, calldata);

    if (numAddr === undefined) {
        return undefined;
    }

    const res = calldata.slice(numAddr, numAddr + typ.size);
    return [res, 32];
}

function cd_decodeBool(loc: CalldataLocation, calldata: Memory): undefined | [boolean, number] {
    const numAddr = checkAddrOoB(loc.address, calldata);

    if (numAddr === undefined) {
        return undefined;
    }

    const res = bigEndianBufToBigint(calldata.slice(numAddr, numAddr + 32)) !== BigInt(0);
    return [res, 32];
}

function cd_decodeBytes(loc: CalldataLocation, calldata: Memory): undefined | [Buffer, number] {
    let res: Buffer | undefined = undefined;

    let bytesOffset = loc.address;
    let bytesSize = 0;
    const bytesLoc = loc.kind;

    const len = cd_decodeInt(uint256, { kind: bytesLoc, address: bytesOffset }, calldata);

    if (len == undefined) {
        return undefined;
    }

    if (len[0] >= MAX_ARR_DECODE_LIMIT) {
        return undefined;
    }

    const numLen = Number(len[0]);

    bytesOffset += BigInt(len[1]);
    bytesSize += len[1];
    bytesSize += numLen + (numLen % 32 === 0 ? 0 : 1 - (numLen % 32));

    const checkedArrDynOffset = checkAddrOoB(bytesOffset, calldata);

    if (checkedArrDynOffset === undefined) {
        return undefined;
    }

    if (checkedArrDynOffset + numLen > calldata.length) {
        return undefined;
    }

    res = calldata.slice(checkedArrDynOffset, checkedArrDynOffset + numLen);
    return [res, bytesSize];
}

function cd_decodeString(loc: CalldataLocation, calldata: Memory): undefined | [string, number] {
    const bytes = cd_decodeBytes(loc, calldata);

    if (bytes === undefined) {
        return undefined;
    }

    const str = bytes[0].toString("utf-8");

    return [str, bytes[1]];
}

export function cd_decodeArrayContents(
    abiType: ArrayType,
    origType: ArrayType | undefined,
    arrOffset: bigint,
    numLen: number,
    calldata: Memory
): undefined | [any[], number] {
    let arrBytesSize = 0;
    const arrBaseOffset = arrOffset;

    const res: any[] = [];

    const elT = origType !== undefined ? origType.elementT : undefined;

    for (let i = 0; i < numLen; i++) {
        const elementTuple = cd_decodeValue(
            abiType.elementT,
            elT,
            { kind: DataLocationKind.CallData, address: arrOffset },
            calldata,
            arrBaseOffset
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

function cd_decodeArray(
    abiType: ArrayType,
    origType: ArrayType | undefined,
    loc: CalldataLocation,
    calldata: Memory
): undefined | [any[], number] {
    let arrOffset = loc.address;
    let arrBytesSize = 0;

    const len = cd_decodeInt(uint256, loc, calldata);

    if (len == undefined) {
        return undefined;
    }

    if (len[0] >= MAX_ARR_DECODE_LIMIT) {
        return undefined;
    }

    const numLen = Number(len[0]);
    arrOffset += BigInt(len[1]);
    arrBytesSize += len[1];

    const contentsRes = cd_decodeArrayContents(abiType, origType, arrOffset, numLen, calldata);

    if (contentsRes === undefined) {
        return undefined;
    }

    return [contentsRes[0], arrBytesSize + contentsRes[1]];
}

function cd_decodeTuple(
    abiType: TupleType,
    origType: TypeNode | undefined,
    loc: CalldataLocation,
    calldata: Memory
): undefined | [any[], number] {
    let tupleOffset: bigint = loc.address;
    let size = 0;

    const tupleRes: any[] = [];
    const tupleBase = tupleOffset;

    let origElementTs: TypeNode | TypeNode[] | undefined = undefined;

    if (origType instanceof PointerType) {
        origType = origType.to;
    }

    if (origType instanceof ArrayType) {
        assert(
            origType.size !== undefined && Number(origType.size) === abiType.elements.length,
            `Expected original type to be a fixed size array of size ${abiType.elements.length} not {0}`,
            origType
        );

        origElementTs = origType.elementT;
    } else if (origType instanceof UserDefinedType) {
        const def = origType.definition;

        assert(
            def instanceof StructDefinition && def.vMembers.length === abiType.elements.length,
            `Expected struct with ${abiType.elements.length} fields not {0}`,
            origType
        );

        try {
            origElementTs = def.vMembers.map((fieldDef) =>
                changeToLocation(variableDeclarationToTypeNode(fieldDef), SolDataLocation.CallData)
            );
        } catch (e) {
            return undefined;
        }
    } else if (origType !== undefined) {
        throw new Error(
            `Unexpected original type ${origType.pp()} for abi tuple type ${abiType.pp()}`
        );
    }

    for (let i = 0; i < abiType.elements.length; i++) {
        const fieldT = abiType.elements[i];

        const origElementT =
            origElementTs === undefined
                ? undefined
                : origElementTs instanceof TypeNode
                ? origElementTs
                : origElementTs[i];

        const decodeRes = cd_decodeValue(
            fieldT,
            origElementT,
            { kind: loc.kind, address: tupleOffset },
            calldata,
            tupleBase
        );

        if (decodeRes === undefined) {
            return undefined;
        }

        const [elVal, elementSize] = decodeRes;

        tupleOffset += BigInt(elementSize);
        size += elementSize;
        tupleRes.push(elVal);
    }

    if (origType === undefined || origType instanceof ArrayType) {
        return [tupleRes, size];
    }

    const fields = (origType.definition as StructDefinition).vMembers;
    const structRes: any = {};

    for (let i = 0; i < fields.length; i++) {
        structRes[fields[i].name] = tupleRes[i];
    }

    return [structRes, size];
}

function cd_decodePointer(
    abiType: PointerType,
    origType: PointerType | undefined,
    loc: CalldataLocation,
    calldata: Memory,
    callDataBaseOff: bigint
): undefined | [any, number] {
    const offRes = cd_decodeInt(uint256, loc, calldata);

    if (offRes === undefined) {
        return undefined;
    }

    // Adjust relative pointers read **FROM** calldata by the current base offset
    const off = offRes[0] + callDataBaseOff;
    const size = offRes[1];

    const pointedToLoc: DataLocation = {
        kind: DataLocationKind.CallData,
        address: off
    };

    const origPointedToType = origType === undefined ? undefined : origType.to;

    const pointedToValue = cd_decodeValue(
        abiType.to,
        origPointedToType,
        pointedToLoc,
        calldata,
        callDataBaseOff
    );

    if (pointedToValue === undefined) {
        return undefined;
    }

    return [pointedToValue[0], size];
}

export function cd_decodeValue(
    abiType: TypeNode,
    origType: TypeNode | undefined,
    loc: CalldataLocation,
    calldata: Memory,
    callDataBaseOff = BigInt(4)
): undefined | [any, number] {
    /*
    console.error(
        `cd_decodeValue(${abiType.pp()}, ${origType ? origType.pp() : undefined}, ${ppLoc(loc)})`
    );
    */

    if (abiType instanceof IntType) {
        return cd_decodeInt(abiType, loc, calldata);
    }

    if (abiType instanceof AddressType) {
        return cd_decodeAddress(loc, calldata);
    }

    if (abiType instanceof FixedBytesType) {
        return cd_decodeFixedBytes(abiType, loc, calldata);
    }

    if (abiType instanceof BoolType) {
        return cd_decodeBool(loc, calldata);
    }

    if (abiType instanceof ArrayType) {
        assert(
            origType === undefined || origType instanceof ArrayType,
            `Unexpected original type {0}`,
            origType
        );
        return cd_decodeArray(abiType, origType, loc, calldata);
    }

    if (abiType instanceof BytesType) {
        return cd_decodeBytes(loc, calldata);
    }

    if (abiType instanceof StringType) {
        return cd_decodeString(loc, calldata);
    }

    if (abiType instanceof TupleType) {
        return cd_decodeTuple(abiType, origType, loc, calldata);
    }

    if (abiType instanceof PointerType) {
        assert(
            origType === undefined || origType instanceof PointerType,
            `Unexpected original type {0}`,
            origType
        );
        return cd_decodePointer(abiType, origType, loc, calldata, callDataBaseOff);
    }

    throw new Error(`NYI decoding ${abiType.pp()}`);
}
