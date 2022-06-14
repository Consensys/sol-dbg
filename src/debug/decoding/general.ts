import {
    ArrayType,
    assert,
    DataLocation as SolDataLocation,
    PointerType,
    TypeNode
} from "solc-typed-ast";
import { ABIEncoderVersion } from "solc-typed-ast/dist/types/abi";
import {
    DataLocation,
    DataLocationKind,
    DataView,
    lastExternalFrame,
    MemoryLocation,
    MemoryLocationKind,
    StepState,
    StorageLocation,
    toABIEncodedType
} from "..";
import { MAX_ARR_DECODE_LIMIT, uint256 } from "../..";
import { cd_decodeArrayContents, cd_decodeValue } from "./calldata";
import { mem_decodeValue } from "./memory";
import { st_decodeInt, st_decodeValue } from "./stack";
import { stor_decodeValue } from "./storage";

function solLocToDataKind(loc: SolDataLocation): MemoryLocationKind {
    if (loc === SolDataLocation.Default) {
        return DataLocationKind.Memory;
    }

    return loc as unknown as MemoryLocationKind;
}

/**
 * Helper to dispatch the decoding of a given type `typ` at a given data location `loc` in a given `state`.
 * to the proper decoding logic (memory, calldata, storage, stack)
 */
function decodeValInt(typ: TypeNode, loc: DataLocation, state: StepState): any {
    if (loc.kind === DataLocationKind.Memory) {
        const res = mem_decodeValue(typ, loc, state.memory);

        return res === undefined ? res : res[0];
    }

    if (loc.kind === DataLocationKind.CallData) {
        const lastExtFrame = lastExternalFrame(state.stack);

        let abiType: TypeNode;

        try {
            abiType = toABIEncodedType(typ, ABIEncoderVersion.V2);
        } catch (e) {
            return undefined;
        }

        const res = cd_decodeValue(abiType, typ, loc, lastExtFrame.msgData, BigInt(4));

        return res === undefined ? res : res[0];
    }

    if (loc.kind === DataLocationKind.Stack) {
        return st_decodeValue(typ, loc, state.evmStack);
    }

    const res = stor_decodeValue(typ, loc, state.storage);

    return res === undefined ? res : res[0];
}

export function isCalldataType2Slots(typ: TypeNode): boolean {
    return (
        typ instanceof PointerType &&
        typ.to instanceof ArrayType &&
        typ.location === SolDataLocation.CallData &&
        typ.to.size === undefined
    );
}

/**
 * Decode a generic value expressed as a `DataView` (i.e. a tuple of type and location) given
 * the dbg state `state` at some step.
 */
export function decodeValue(view: DataView, state: StepState): any {
    //console.error(`decodeValue(${ppView(view)})`);
    const typ = view.type;
    const loc = view.loc;

    /**
     * The only case where a pointer from one area of the state crosses into another
     * area of the state are pointers in the stack. All other pointers stay in their
     * own memory region
     */
    if (typ instanceof PointerType && loc.kind === DataLocationKind.Stack) {
        const off = st_decodeInt(uint256, loc, state.evmStack);

        if (off === undefined) {
            return undefined;
        }

        const kind: MemoryLocationKind = solLocToDataKind(typ.location);

        let pointedToLoc: MemoryLocation;

        if (isCalldataType2Slots(typ)) {
            const lastExtFrame = lastExternalFrame(state.stack);

            let abiType: TypeNode;

            try {
                abiType = toABIEncodedType(typ, ABIEncoderVersion.V2);
            } catch (e) {
                return undefined;
            }

            assert(
                abiType instanceof PointerType && abiType.to instanceof ArrayType,
                `InternalError`
            );

            const len = st_decodeInt(
                uint256,
                { kind: loc.kind, offsetFromTop: loc.offsetFromTop - 1 },
                state.evmStack
            );

            if (len === undefined) {
                return undefined;
            }

            if (len > MAX_ARR_DECODE_LIMIT) {
                return undefined;
            }

            const res = cd_decodeArrayContents(
                abiType.to,
                typ.to as ArrayType,
                off,
                Number(len),
                lastExtFrame.msgData
            );

            return res === undefined ? res : res[0];
        }

        if (kind === DataLocationKind.Storage) {
            pointedToLoc = {
                kind,
                address: off,
                endOffsetInWord: 32
            } as StorageLocation;
        } else {
            pointedToLoc = {
                kind,
                address: off
            };
        }

        const res = decodeValInt(typ.to, pointedToLoc, state);

        //console.error(`decodeValue: res ${res}`);
        return res;
    }

    const res = decodeValInt(typ, loc, state);
    //console.error(`decodeValue: res ${res}`);

    return res;
}
