import { OpHandler, Opcode } from "@ethereumjs/evm/dist/opcodes";
import { AsyncDynamicGasHandler, SyncDynamicGasHandler } from "@ethereumjs/evm/dist/opcodes/gas";
import { AddOpcode } from "@ethereumjs/evm/dist/types";
import { FoundryContext } from "./foundry_cheatcodes";
import { RunState } from "@ethereumjs/evm/dist/interpreter";
import { Address } from "ethereumjs-util";
import { Common } from "@ethereumjs/common";
import { bigEndianBufToBigint } from "../utils";

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
        ]
    ]);

    for (const [code, handler] of foundryOpInterposing) {
        res.push(interopseOnOp(code, opcodes, handler));
    }

    return res;
}
