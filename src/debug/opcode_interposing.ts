import { ERROR } from "@ethereumjs/evm/dist/cjs/exceptions";
import { RunState } from "@ethereumjs/evm/dist/cjs/interpreter";
import {
    OpHandler,
    Opcode,
    addresstoBytes,
    trap,
    writeCallOutput
} from "@ethereumjs/evm/dist/cjs/opcodes";
import {
    AsyncDynamicGasHandler,
    SyncDynamicGasHandler
} from "@ethereumjs/evm/dist/cjs/opcodes/gas";
import { AddOpcode } from "@ethereumjs/evm/dist/cjs/types";
import { Address, bigIntToBytes, setLengthLeft } from "@ethereumjs/util/dist/cjs";
import { bigEndianBufToBigint } from "../utils";
import {
    FoundryCheatcodesAddress,
    FoundryContext,
    RevertMatch,
    returnStateMatchesRevert
} from "./foundry_cheatcodes";

function interopseOnOp(code: number, opcodes: any, handler: OpHandler): AddOpcode {
    const originalOp: Opcode = opcodes.opcodes.get(code);
    const gasFunction: AsyncDynamicGasHandler | SyncDynamicGasHandler | undefined =
        originalOp.dynamicGas ? opcodes.dynamicGasHandlers.get(code) : undefined;

    return {
        opcode: code,
        opcodeName: originalOp.name,
        baseFee: originalOp.fee,
        gasFunction: gasFunction,
        logicFunction: handler
    };
}

export function foundryInterposedOps(opcodes: any, foundryCtx: FoundryContext): AddOpcode[] {
    const res: AddOpcode[] = [];
    const foundryOpInterposing = new Map<number, OpHandler>([
        [
            0x42,
            (runState: RunState): void => {
                const time =
                    foundryCtx.timeWarp === undefined
                        ? runState.interpreter.getBlockTimestamp()
                        : foundryCtx.timeWarp;

                runState.stack.push(time);
            }
        ],
        [
            0x43,
            (runState: RunState): void => {
                const number =
                    foundryCtx.rollBockNum === undefined
                        ? runState.interpreter.getBlockNumber()
                        : foundryCtx.rollBockNum;

                runState.stack.push(number);
            }
        ],
        [
            0x32,
            (runState: RunState): void => {
                const [, prankOrigin] = foundryCtx.matchPrank(true);

                const origin =
                    prankOrigin instanceof Address
                        ? bigEndianBufToBigint(prankOrigin.toBytes())
                        : runState.interpreter.getTxOrigin();

                runState.stack.push(origin);
            }
        ],
        [
            0x33,
            (runState: RunState): void => {
                const [prankSender] = foundryCtx.matchPrank(false);

                const caller =
                    prankSender instanceof Address
                        ? bigEndianBufToBigint(prankSender.toBytes())
                        : runState.interpreter.getCaller();

                runState.stack.push(caller);
            }
        ],
        // 0xf0: CREATE
        [
            0xf0,
            async function (runState, common) {
                // If we're calling vm.* ignore the expectedRevert
                const expectedRevert = getExpectedRevert(foundryCtx);
                const [value, offset, length] = runState.stack.popN(3);

                if (
                    common.isActivatedEIP(3860) &&
                    length > Number(common.param("vm", "maxInitCodeSize")) &&
                    !runState.interpreter._evm.allowUnlimitedInitCodeSize
                ) {
                    trap(ERROR.INITCODE_SIZE_VIOLATION);
                }

                const gasLimit = runState.messageGasLimit!;
                runState.messageGasLimit = undefined;

                let data = new Uint8Array(0);
                if (length !== BigInt(0)) {
                    data = runState.memory.read(Number(offset), Number(length), true);
                }

                const ret = await runState.interpreter.create(gasLimit, value, data);
                handleCreateReturn(runState, ret, expectedRevert);
            }
        ],
        // 0xf5: CREATE2
        [
            0xf5,
            async function (runState, common) {
                const expectedRevert = foundryCtx.getExpectedRevert();

                if (runState.interpreter.isStatic()) {
                    trap(ERROR.STATIC_STATE_CHANGE);
                }

                const [value, offset, length, salt] = runState.stack.popN(4);

                if (
                    common.isActivatedEIP(3860) &&
                    length > Number(common.param("vm", "maxInitCodeSize")) &&
                    !runState.interpreter._evm.allowUnlimitedInitCodeSize
                ) {
                    trap(ERROR.INITCODE_SIZE_VIOLATION);
                }

                const gasLimit = runState.messageGasLimit!;
                runState.messageGasLimit = undefined;

                let data = new Uint8Array(0);
                if (length !== BigInt(0)) {
                    data = runState.memory.read(Number(offset), Number(length), true);
                }

                const ret = await runState.interpreter.create2(
                    gasLimit,
                    value,
                    data,
                    setLengthLeft(bigIntToBytes(salt), 32)
                );
                handleCreateReturn(runState, ret, expectedRevert);
            }
        ],
        // 0xf1: CALL
        [
            0xf1,
            async function (runState: RunState) {
                const [, toAddr, value, inOffset, inLength, outOffset, outLength] =
                    runState.stack.popN(7);

                const toAddress = new Address(addresstoBytes(toAddr));

                const expectedRevert = getExpectedRevert(foundryCtx, toAddress);

                let data = new Uint8Array(0);
                if (inLength !== BigInt(0)) {
                    data = runState.memory.read(Number(inOffset), Number(inLength), true);
                }

                const gasLimit = runState.messageGasLimit!;
                runState.messageGasLimit = undefined;

                const ret = await runState.interpreter.call(gasLimit, toAddress, value, data);

                handleReturn(runState, ret, outOffset, outLength, expectedRevert);
            }
        ],
        // 0x00: STOP
        [
            0x00,
            function (runState) {
                const expectedRevert = getExpectedRevert(foundryCtx);
                if (expectedRevert === undefined) {
                    trap(ERROR.STOP);
                } else {
                    runState.interpreter.revert(new Uint8Array(0));
                }
            }
        ],
        // 0xf2: CALLCODE
        [
            0xf2,
            async function (runState: RunState) {
                const [, toAddr, value, inOffset, inLength, outOffset, outLength] =
                    runState.stack.popN(7);
                const toAddress = new Address(addresstoBytes(toAddr));
                const expectedRevert = getExpectedRevert(foundryCtx, toAddress);

                const gasLimit = runState.messageGasLimit!;
                runState.messageGasLimit = undefined;

                let data = new Uint8Array(0);
                if (inLength !== BigInt(0)) {
                    data = runState.memory.read(Number(inOffset), Number(inLength), true);
                }

                const ret = await runState.interpreter.callCode(gasLimit, toAddress, value, data);

                handleReturn(runState, ret, outOffset, outLength, expectedRevert);
            }
        ],
        // 0xf4: DELEGATECALL
        [
            0xf4,
            async function (runState) {
                const value = runState.interpreter.getCallValue();
                const [, toAddr, inOffset, inLength, outOffset, outLength] = runState.stack.popN(6);
                const toAddress = new Address(addresstoBytes(toAddr));
                const expectedRevert = getExpectedRevert(foundryCtx, toAddress);

                let data = new Uint8Array(0);
                if (inLength !== BigInt(0)) {
                    data = runState.memory.read(Number(inOffset), Number(inLength), true);
                }

                const gasLimit = runState.messageGasLimit!;
                runState.messageGasLimit = undefined;

                const ret = await runState.interpreter.callDelegate(
                    gasLimit,
                    toAddress,
                    value,
                    data
                );

                handleReturn(runState, ret, outOffset, outLength, expectedRevert);
            }
        ],
        // 0xfa: STATICCALL
        [
            0xfa,
            async function (runState) {
                const value = BigInt(0);
                const [, toAddr, inOffset, inLength, outOffset, outLength] = runState.stack.popN(6);
                const toAddress = new Address(addresstoBytes(toAddr));
                const expectedRevert = getExpectedRevert(foundryCtx, toAddress);

                const gasLimit = runState.messageGasLimit!;
                runState.messageGasLimit = undefined;

                let data = new Uint8Array(0);
                if (inLength !== BigInt(0)) {
                    data = runState.memory.read(Number(inOffset), Number(inLength), true);
                }

                const ret = await runState.interpreter.callStatic(gasLimit, toAddress, value, data);

                handleReturn(runState, ret, outOffset, outLength, expectedRevert);
            }
        ],
        // 0xf3: RETURN
        [
            0xf3,
            function (runState) {
                const [offset, length] = runState.stack.popN(2);
                let returnData = new Uint8Array(0);

                // If we're calling vm.* ignore the expectedRevert
                const expectedRevert = getExpectedRevert(foundryCtx);

                if (expectedRevert === undefined) {
                    if (length !== BigInt(0)) {
                        returnData = runState.memory.read(Number(offset), Number(length));
                    }
                    runState.interpreter.finish(returnData);
                } else {
                    runState.interpreter.revert(returnData);
                }
            }
        ]
    ]);

    for (const [code, handler] of foundryOpInterposing) {
        res.push(interopseOnOp(code, opcodes, handler));
    }

    return res;
}

function getExpectedRevert(ctx: FoundryContext, toAddress?: Address): RevertMatch {
    const expectedRevert =
        toAddress && toAddress.equals(FoundryCheatcodesAddress)
            ? undefined
            : ctx.getExpectedRevert();

    if (expectedRevert) {
        // We expected a revert - clear it
        ctx.clearExpectRevert();
    }

    return expectedRevert;
}

function handleReturn(
    runState: RunState,
    ret: bigint,
    outOffset: bigint,
    outLength: bigint,
    expectedRevert: RevertMatch
): void {
    if (expectedRevert === undefined) {
        // Nothing to do - no expected revert
    } else if (!returnStateMatchesRevert(ret, runState, expectedRevert)) {
        // If return doesn't match expected revert (no revert, or different bytes/signature) throw an error
        ret = 0n;
    } else {
        // Otherwise we match the expected revert, so return all 0s
        runState.returnBytes = new Uint8Array(outLength !== 0n ? Number(outLength) : 32 * 128);
        ret = 1n;
    }

    writeCallOutput(runState, outOffset, outLength);
    runState.stack.push(ret);
}

function handleCreateReturn(runState: RunState, ret: bigint, expectedRevert: RevertMatch): void {
    if (expectedRevert === undefined) {
        // Nothing to do - no expected revert
    } else if (!returnStateMatchesRevert(ret, runState, expectedRevert)) {
        // If return doesn't match expected revert (no revert, or different bytes/signature) throw an error
        ret = 0n;
    } else {
        // Otherwise we match the expected revert, so return all 1s
        ret = 1n;
    }

    runState.stack.push(ret);
}
