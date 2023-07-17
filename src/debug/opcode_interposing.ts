import {
    OpHandler,
    Opcode,
    addressToBuffer,
    trap,
    writeCallOutput
} from "@ethereumjs/evm/dist/opcodes";
import { AsyncDynamicGasHandler, SyncDynamicGasHandler } from "@ethereumjs/evm/dist/opcodes/gas";
import { AddOpcode } from "@ethereumjs/evm/dist/types";
import {
    FoundryCheatcodesAddress,
    FoundryContext,
    RevertMatch,
    returnStateMatchesRevert
} from "./foundry_cheatcodes";
import { RunState } from "@ethereumjs/evm/dist/interpreter";
import { Address } from "ethereumjs-util";
import { Common } from "@ethereumjs/common";
import { bigEndianBufToBigint } from "../utils";
import { ERROR } from "@ethereumjs/evm/dist/exceptions";

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
            (runState: RunState, common: Common): void => {
                const time =
                    foundryCtx.timeWarp === undefined
                        ? runState.interpreter.getBlockTimestamp()
                        : foundryCtx.timeWarp;

                runState.stack.push(time);
            }
        ],
        [
            0x43,
            (runState: RunState, common: Common): void => {
                const number =
                    foundryCtx.rollBockNum === undefined
                        ? runState.interpreter.getBlockNumber()
                        : foundryCtx.rollBockNum;

                runState.stack.push(number);
            }
        ],
        [
            0x32,
            (runState: RunState, common: Common): void => {
                const [, prankOrigin] = foundryCtx.matchPrank(true);

                const origin =
                    prankOrigin instanceof Address
                        ? bigEndianBufToBigint(prankOrigin.toBuffer())
                        : runState.interpreter.getTxOrigin();

                runState.stack.push(origin);
            }
        ],
        [
            0x33,
            (runState: RunState, common: Common): void => {
                const [prankSender] = foundryCtx.matchPrank(false);

                const caller =
                    prankSender instanceof Address
                        ? bigEndianBufToBigint(prankSender.toBuffer())
                        : runState.interpreter.getCaller();

                runState.stack.push(caller);
            }
        ],
        // 0xf1: CALL
        [
            0xf1,
            async function (runState: RunState) {
                const [_currentGasLimit, toAddr, value, inOffset, inLength, outOffset, outLength] =
                    runState.stack.popN(7);

                const toAddress = new Address(addressToBuffer(toAddr));

                const expectedRevert = toAddress.equals(FoundryCheatcodesAddress)
                    ? undefined
                    : foundryCtx.getExpectedRevert();

                if (expectedRevert) {
                    // We expected a revert - clear it
                    foundryCtx.clearExpectRevert();
                }

                let data = Buffer.alloc(0);
                if (inLength !== BigInt(0)) {
                    data = runState.memory.read(Number(inOffset), Number(inLength), true);
                }

                const gasLimit = runState.messageGasLimit!;
                runState.messageGasLimit = undefined;

                const ret = await runState.interpreter.call(gasLimit, toAddress, value, data);

                handleReturn(runState, ret, foundryCtx, outOffset, outLength, expectedRevert);
            }
        ],
        // 0x00: STOP
        [
            0x00,
            function (runState) {
                const expectedRevert = foundryCtx.getExpectedRevert();
                if (expectedRevert === undefined) {
                    trap(ERROR.STOP);
                } else {
                    foundryCtx.clearExpectRevert();
                    runState.interpreter.revert(Buffer.alloc(0));
                }
            }
        ],
        // 0xf3: RETURN
        [
            0xf3,
            function (runState) {
                const [offset, length] = runState.stack.popN(2);
                let returnData = Buffer.alloc(0);

                // If we're calling vm.* ignore the expectedRevert
                const expectedRevert = runState.env.address.equals(FoundryCheatcodesAddress)
                    ? undefined
                    : foundryCtx.getExpectedRevert();

                if (expectedRevert === undefined) {
                    if (length !== BigInt(0)) {
                        returnData = runState.memory.read(Number(offset), Number(length));
                    }
                    runState.interpreter.finish(returnData);
                } else {
                    foundryCtx.clearExpectRevert();
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

function handleReturn(
    runState: RunState,
    ret: bigint,
    ctx: FoundryContext,
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
        // @todo (dimo): This seems to break in the case where the return value is
        // of a dynamic size (e.g. array). See failing test test_expectRevert_7
        runState.returnBuffer = Buffer.alloc(Number(32 * 10), 0);
        ret = 1n;
    }

    writeCallOutput(runState, outOffset, outLength);
    runState.stack.push(ret);
}
