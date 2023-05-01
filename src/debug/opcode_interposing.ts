import { OpHandler, Opcode } from "@ethereumjs/vm/dist/evm/opcodes";
import { AsyncDynamicGasHandler, SyncDynamicGasHandler } from "@ethereumjs/vm/dist/evm/opcodes/gas";
import { AddOpcode } from "@ethereumjs/vm/dist/evm/types";
import { FoundryContext } from "./foundry_cheatcodes";
import Common from "@ethereumjs/common";
import { RunState } from "@ethereumjs/vm/dist/evm/interpreter";
import { BN, Address } from "ethereumjs-util";

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
                        ? runState.eei.getBlockTimestamp()
                        : new BN(foundryCtx.timeWarp.toString());

                runState.stack.push(time);
            }
        ],
        [
            0x43,
            (runState: RunState, common: Common): void => {
                const number =
                    foundryCtx.rollBockNum === undefined
                        ? runState.eei.getBlockNumber()
                        : new BN(foundryCtx.rollBockNum.toString());

                runState.stack.push(number);
            }
        ],
        [
            0x32,
            (runState: RunState, common: Common): void => {
                const [, prankOrigin] = foundryCtx.matchPrank(true);

                const origin: BN =
                    prankOrigin instanceof Address
                        ? new BN(prankOrigin.buf)
                        : runState.eei.getTxOrigin();

                runState.stack.push(origin);
            }
        ],
        [
            0x33,
            (runState: RunState, common: Common): void => {
                const [prankSender] = foundryCtx.matchPrank(false);

                const caller: BN =
                    prankSender instanceof Address
                        ? new BN(prankSender.buf)
                        : runState.eei.getCaller();

                runState.stack.push(caller);
            }
        ]
    ]);

    for (const [code, handler] of foundryOpInterposing) {
        res.push(interopseOnOp(code, opcodes, handler));
    }

    return res;
}
