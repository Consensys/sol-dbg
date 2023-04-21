import { Transaction, TxData } from "@ethereumjs/tx";
import { Address, BN } from "ethereumjs-util";
import fse from "fs-extra";
import { join } from "path";
import {
    assert,
    ContractDefinition,
    FunctionDefinition,
    InferType,
    IntType,
    SourceUnit
} from "solc-typed-ast";
import { HexString, UnprefixedHexString } from "..";
import { DataLocation, DataLocationKind, DataView, Stack, Storage } from "../debug/sol_debugger";

export const ZERO_ADDRESS_STRING: HexString = "0x0000000000000000000000000000000000000000";
export const ZERO_ADDRESS = Address.fromString(ZERO_ADDRESS_STRING);

export const uint256 = new IntType(256, false);
export const MAX_ARR_DECODE_LIMIT = BigInt(1000);

export function toHexString(n: number | bigint | Uint8Array, padding = 0): HexString {
    let hex: string;

    if (n instanceof Uint8Array) {
        hex = Buffer.from(n).toString("hex");
    } else {
        hex = n.toString(16);
    }

    if (hex.length < padding) {
        hex = hex.padStart(padding, "0");
    }

    return "0x" + hex;
}

export function bigIntToBuf(
    n: bigint,
    size: number,
    endianness: "big" | "little" = "little"
): Buffer {
    const res = Buffer.alloc(size, 0);

    let i = endianness === "big" ? size - 1 : 0;
    const dir = endianness === "big" ? -1 : 1;
    const zero = BigInt(0);

    while (n !== zero && i >= 0 && i < size) {
        res[i] = Number(n & BigInt(255));
        n = n >> BigInt(8);
        i += dir;
    }

    assert(n === zero, `Word contains garbage beyond ${size} bytes - ${n}`);

    return res;
}

export function hexStrToBuf32(v: UnprefixedHexString): Buffer {
    return Buffer.from(v.padStart(64, "0"), "hex");
}

export function padStart(buf: Buffer, toSize: number, filler: number): Buffer {
    if (buf.length >= toSize) {
        return buf;
    }

    const res = Buffer.alloc(toSize, filler);

    for (let i = toSize - buf.length, j = 0; i < toSize; i++, j++) {
        res[i] = buf[j];
    }

    return res;
}

export function makeFakeTransaction(txData: TxData, from: string): Transaction {
    const fromAddr = Address.fromString(from);
    const tx = new Transaction(txData, { freeze: false });

    /**
     *  Intentionally override getSenderAddress() method
     */
    (tx as unknown as any).getSenderAddress = () => {
        return fromAddr;
    };

    return tx;
}

export function findContractDef(
    units: SourceUnit[],
    fileName: string,
    contractName: string
): ContractDefinition | undefined {
    for (const unit of units) {
        if (unit.sourceEntryKey !== fileName) {
            continue;
        }

        for (const contract of unit.vContracts) {
            if (contract.name === contractName) {
                return contract;
            }
        }
    }

    return undefined;
}

export function resolveConstructor(contract: ContractDefinition): FunctionDefinition | undefined {
    for (const contr of contract.vLinearizedBaseContracts) {
        if (contr.vConstructor) {
            return contr.vConstructor;
        }
    }

    return undefined;
}

export function ls(dir: string, ext: string): string[] {
    return fse
        .readdirSync(dir)
        .filter((name) => name.endsWith(ext))
        .map((name) => join(dir, name));
}

export function lsJson(path: string): string[] {
    return ls(path, ".json");
}

export function isDir(path: string): boolean {
    try {
        return fse.statSync(path).isDirectory();
    } catch (e) {
        return false;
    }
}

export function isFile(path: string): boolean {
    try {
        return fse.statSync(path).isFile();
    } catch (e) {
        return false;
    }
}

/**
 * Return the (inclusive) limits of a 2's complement int type as a pair `[min, max]` `bigint`s
 */
export function limits(typ: IntType): [bigint, bigint] {
    if (typ.signed) {
        const min = -(BigInt(2) << BigInt(typ.nBits - 1));
        const max = BigInt(2) << (BigInt(typ.nBits - 1) - BigInt(1));

        return [min, max];
    }

    return [BigInt(0), (BigInt(2) << BigInt(typ.nBits)) - BigInt(1)];
}

export function fits(val: bigint, typ: IntType): boolean {
    const [min, max] = limits(typ);

    return val >= min && val <= max;
}

export function ppLoc(loc: DataLocation): string {
    return `{kind: ${loc.kind}, ${
        loc.kind === DataLocationKind.Stack ? "offsetFromTop" : "address"
    }: ${loc.kind === DataLocationKind.Stack ? loc.offsetFromTop : loc.address.toString(16)}}${
        loc.kind === DataLocationKind.Storage ? `, offsetInWord: ${loc.endOffsetInWord}` : ""
    }`;
}

export function ppView(view: DataView): string {
    return `{type: ${view.type.pp()}, originalType: ${
        view.originalType ? view.originalType.pp() : "undefined"
    }, loc: ${ppLoc(view.loc)}}`;
}

export function ppStorage(storage: Storage): string {
    const data: { [key: UnprefixedHexString]: UnprefixedHexString } = {};

    for (const [k, v] of storage.entries()) {
        data[k.toString(16)] = v.toString("hex");
    }

    return JSON.stringify(data, undefined, 4) + "\n";
}

export function ppEvmStack(stack: Stack): string {
    return stack.map((frame) => frame.toString("hex")).join("\n");
}

/**
 * Given an `offset` into some memory `buf` check that its in-bounds.
 * Since `offset` may be a bigint we must check that it can be cast to Number without
 * loss of precision and afterwards, whether it fits into the buf.
 */
export function checkAddrOoB(offset: bigint | number, buf: Buffer): number | undefined {
    let numOff: number;

    if (typeof offset === "bigint") {
        // Check that the bigint address fits in a normal number
        if (BigInt(Number(offset)) !== offset) {
            return undefined;
        }

        numOff = Number(offset);
    } else {
        numOff = offset;
    }

    // OoB access
    if (numOff < 0 || numOff + 32 > buf.length) {
        return undefined;
    }

    return numOff;
}

export function wordToAddress(word: Buffer): Address {
    return new Address(word.slice(12));
}

export const LOWER8_MASK = (BigInt(1) << BigInt(8)) - BigInt(1);

/**
 * Convert a big-endian 2's complement encoding to a bigint
 */
export function bigEndianBufToBigint(buf: Buffer): bigint {
    let res = BigInt(0);

    for (let i = 0; i < buf.length; i++) {
        res = res << BigInt(8);
        res += BigInt(buf[i]);
    }

    return res;
}

/**
 * Convert a big-endian 2's complement encoding to a number. Throws an error if the value doesn't fit.
 */
export function bigEndianBufToNumber(buf: Buffer): number {
    const bigintRes = bigEndianBufToBigint(buf);
    assert(
        bigintRes >= BigInt(Number.MIN_SAFE_INTEGER) &&
            bigintRes <= BigInt(Number.MAX_SAFE_INTEGER),
        `Bigint ${bigintRes} doesn't fit in number`
    );

    return Number(bigintRes);
}

export function bnToBigInt(n: BN): bigint {
    return BigInt("0x" + n.toString(16));
}

export function stripOx(s: HexString): UnprefixedHexString {
    return s.startsWith("0x") ? s.slice(2) : s;
}

export function getFunctionSelector(
    f: FunctionDefinition,
    infer: InferType
): UnprefixedHexString | undefined {
    if (f.raw !== undefined && f.raw.functionSelector !== undefined) {
        return f.raw.functionSelector;
    }

    try {
        return infer.signatureHash(f);
    } catch (e) {
        return undefined;
    }
}
