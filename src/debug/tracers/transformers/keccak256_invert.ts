import { InterpreterStep } from "@ethereumjs/evm";
import { VM } from "@ethereumjs/vm";
import { bigEndianBufToBigint, mustReadMem } from "../../../utils";
import { OPCODES } from "../../opcodes";
import { BasicStepInfo } from "./basic_info";

export type KeccakPreimageMap = Map<bigint, Uint8Array>;
export interface Keccak256InvertInfo {
    keccak?: {
        from: Uint8Array;
        to: bigint;
    };
}

/**
 * Given a trace of contract creation/deletion event compute a gen/kill set summary for the trace.
 */
export function getKeccakPreimages(trace: Keccak256InvertInfo[]): KeccakPreimageMap {
    return trace.reduce<KeccakPreimageMap>((m, info) => {
        if (info.keccak) {
            m.set(info.keccak.to, info.keccak.from);
        }
        return m;
    }, new Map());
}

/**
 * A map index is computed by doing keccak(key . p) where p is the slot of the
 * map and key is the original key. MapKeys is a map from p => [... [keyN,
 * keccak(keyN . p)] ... ]
 */
export type MapKeys = Map<bigint, Array<[Uint8Array, bigint]>>;

/**
 * Build a `MapKeys` map from a KeccakPreimageMap
 */
export function getMapKeys(preImageMap: KeccakPreimageMap): MapKeys {
    const res: MapKeys = new Map();

    for (const [keccakVal, origKey] of preImageMap) {
        // Since preimages for map indexing are a concatenation of the real key, and the 32bit
        // storage slot, we don't care about any keccak operations not gerater than 32 bytes
        if (origKey.length <= 32) {
            continue;
        }

        const keySuffix = origKey.slice(-32);
        const slot = bigEndianBufToBigint(keySuffix);

        if (!res.has(slot)) {
            res.set(slot, []);
        }

        // Note we don't have to worry about duplicates. Values in KeccakPreimageMap are guaranteed to be unique due to the keys being
        // their keccaks
        (res.get(slot) as Array<[Uint8Array, bigint]>).push([origKey.slice(0, -32), keccakVal]);
    }

    return res;
}

/**
 * Add keccak256 pre-image info. Note we add it on the next instruction after the keccak
 */
export function addKeccakInvertInfo<T extends object & BasicStepInfo>(
    vm: VM,
    step: InterpreterStep,
    state: T,
    trace: Array<T & Keccak256InvertInfo>
): T & Keccak256InvertInfo {
    if (trace.length === 0) {
        return state;
    }

    const lastStep = trace[trace.length - 1];

    if (!(lastStep.op.opcode === OPCODES.SHA3)) {
        return state;
    }

    const res = bigEndianBufToBigint(state.evmStack[state.evmStack.length - 1]);
    const lastStepTop = lastStep.evmStack.length - 1;

    const preImage = mustReadMem(
        lastStep.evmStack[lastStepTop],
        lastStep.evmStack[lastStepTop - 1],
        lastStep.memory
    );

    return {
        keccak: {
            from: preImage,
            to: res
        },
        ...state
    };
}
