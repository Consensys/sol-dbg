import { Address } from "ethereumjs-util";
import {
    AddressType,
    assert,
    BoolType,
    ContractDefinition,
    EnumDefinition,
    enumToIntType,
    FixedBytesType,
    IntType,
    typeNameToTypeNode,
    TypeNode,
    UserDefinedType,
    UserDefinedValueTypeDefinition
} from "solc-typed-ast";
import { Stack, StackLocation } from "..";
import { bigEndianBufToBigint, fits, wordToAddress } from "../../utils";

function fetchStackWord(offsetFromTop: number, stack: Stack): Buffer | undefined {
    return stack.length <= offsetFromTop ? undefined : stack[stack.length - offsetFromTop - 1];
}

export function st_decodeInt(typ: IntType, loc: StackLocation, stack: Stack): undefined | bigint {
    const word = fetchStackWord(loc.offsetFromTop, stack);

    if (word === undefined) {
        return undefined;
    }

    let res = bigEndianBufToBigint(word);
    if (typ.signed && (res & (BigInt(1) << BigInt(typ.nBits - 1))) !== BigInt(0)) {
        // Mask out any 1's above the number's size
        res = res & ((BigInt(1) << BigInt(typ.nBits)) - BigInt(1));
        res = -((BigInt(1) << BigInt(typ.nBits)) - res);
    }

    // Convert signed negative 2's complement values
    assert(
        fits(res, typ),
        `Decoded value ${res} from ${loc} doesn't fit in expected type ${typ.pp()}`
    );

    return res;
}

function st_decodeAddress(loc: StackLocation, stack: Stack): undefined | Address {
    const addrWord = fetchStackWord(loc.offsetFromTop, stack);

    if (addrWord === undefined) {
        return undefined;
    }

    return wordToAddress(addrWord);
}

function st_decodeFixedBytes(
    typ: FixedBytesType,
    loc: StackLocation,
    stack: Stack
): undefined | Buffer {
    const addrWord = fetchStackWord(loc.offsetFromTop, stack);

    if (addrWord === undefined) {
        return undefined;
    }

    return addrWord.slice(0, typ.size);
}

function st_decodeBool(loc: StackLocation, stack: Stack): undefined | boolean {
    const addrWord = fetchStackWord(loc.offsetFromTop, stack);

    if (addrWord === undefined) {
        return undefined;
    }

    return bigEndianBufToBigint(addrWord) !== BigInt(0);
}

function st_decodeEnum(def: EnumDefinition, loc: StackLocation, stack: Stack): undefined | bigint {
    const intType = enumToIntType(def);

    return st_decodeInt(intType, loc, stack);
}

/**
 * Decode a single value from a stack location. All values in the stack span exactly
 * one slot (32 bytes). Returns the decoded value or undefined (if it failed decoding for some reason)
 */
export function st_decodeValue(typ: TypeNode, loc: StackLocation, stack: Stack): any {
    //console.error(`st_decodeValue(${typ.pp()}, ${ppLoc(loc)})`);
    if (typ instanceof IntType) {
        return st_decodeInt(typ, loc, stack);
    }

    if (typ instanceof AddressType) {
        return st_decodeAddress(loc, stack);
    }

    if (typ instanceof FixedBytesType) {
        return st_decodeFixedBytes(typ, loc, stack);
    }

    if (typ instanceof BoolType) {
        return st_decodeBool(loc, stack);
    }

    if (typ instanceof UserDefinedType) {
        const def = typ.definition;

        if (def instanceof EnumDefinition) {
            return st_decodeEnum(def, loc, stack);
        }

        if (def instanceof ContractDefinition) {
            return st_decodeAddress(loc, stack);
        }

        if (def instanceof UserDefinedValueTypeDefinition) {
            const underlyingType = typeNameToTypeNode(def.underlyingType);

            return st_decodeValue(underlyingType, loc, stack);
        }

        throw new Error(`NYI decoding user defined type ${typ.pp()} from the stack`);
    }

    throw new Error(`NYI decoding ${typ.pp()} from the stack`);
}
