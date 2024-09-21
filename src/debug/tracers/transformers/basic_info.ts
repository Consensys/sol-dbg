import { EVMStateManagerInterface } from "@ethereumjs/common";
import { InterpreterStep } from "@ethereumjs/evm";
import { RLP } from "@ethereumjs/rlp";
import { Address, setLengthLeft } from "@ethereumjs/util";
import { VM } from "@ethereumjs/vm";
import { hexToBytes } from "ethereum-cryptography/utils";
import { assert } from "solc-typed-ast";
import { ImmMap, bigIntToBuf } from "../../../utils";
import { EVMOpInfo, OPCODES, changesMemory } from "../../opcodes";
import { Memory, Stack, Storage } from "../../types";
import { OpInfo } from "./op";

async function getStorage(manager: EVMStateManagerInterface, addr: Address): Promise<Storage> {
    const rawStorage = await manager.dumpStorage(addr);
    const storageEntries: Array<[bigint, Uint8Array]> = [];

    for (const [keyStr, valStr] of Object.entries(rawStorage)) {
        const decoded = RLP.decode(hexToBytes(valStr));
        assert(decoded instanceof Uint8Array, "");
        const valBuf = setLengthLeft(decoded, 32);

        storageEntries.push([BigInt(keyStr), valBuf]);
    }

    return ImmMap.fromEntries(storageEntries);
}

export interface BasicStepInfo {
    evmStack: Stack;
    memory: Memory;
    storage: Storage;
    op: EVMOpInfo;
    pc: number;
    gasCost: bigint;
    dynamicGasCost: bigint;
    gas: bigint;
    depth: number;
    address: Address;
}

/**
 * Adds cleaner typed version of the low-level debugging information
 */
export async function addBasicInfo<T extends object & OpInfo>(
    vm: VM,
    step: InterpreterStep,
    state: T,
    trace: Array<T & BasicStepInfo>
): Promise<T & BasicStepInfo> {
    const evmStack = step.stack.map((word) => bigIntToBuf(word, 32, "big"));
    const lastStep = trace.length > 0 ? trace[trace.length - 1] : undefined;

    const memory: Memory =
        lastStep === undefined || changesMemory(lastStep.op)
            ? new Uint8Array(step.memory)
            : lastStep.memory;

    let storage: Storage;

    if (lastStep === undefined || lastStep.op.opcode === OPCODES.SSTORE) {
        storage = await getStorage(vm.stateManager, step.address);
    } else {
        storage = lastStep.storage;
    }

    const gasCost = BigInt(step.opcode.fee);
    const dynamicGasCost = step.opcode.dynamicFee === undefined ? gasCost : step.opcode.dynamicFee;

    return {
        evmStack,
        memory,
        storage,
        ...state,
        pc: step.pc,
        gasCost,
        dynamicGasCost,
        gas: step.gasLeft,
        depth: step.depth + 1,
        address: step.address
    };
}
