import VM from "@ethereumjs/vm";
import { ExecResult, VmErrorResult } from "@ethereumjs/vm/dist/evm/evm";
import { PrecompileInput } from "@ethereumjs/vm/dist/evm/precompiles";
import { ERROR, VmError } from "@ethereumjs/vm/dist/exceptions";
import { Address, BN, keccak256 } from "ethereumjs-util";
const ethABI = require("web3-eth-abi");

export const FoundryCheatcodesAddress = Address.fromString(
    "0x7109709ECfa91a80626fF3989D68f67F5b1DD12D"
);

export const WARP_SELECTOR = keccak256(Buffer.from("warp(uint256)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const FAIL_SELECTOR = "70ca10bb";

export class FoundryContext {
    public timeWarp: bigint | undefined = undefined;
    public failCalled = false;
}

export function getFoundryCtx(vm: VM): FoundryContext {
    return (vm as any)._foundryCtx;
}

export function setFoundryCtx(vm: VM, ctx: FoundryContext): void {
    (vm as any)._foundryCtx = ctx;
}

export function FoundryCheatcodePrecompile(input: PrecompileInput): ExecResult {
    const selector = input.data.slice(0, 4).toString("hex");
    const ctx: FoundryContext = getFoundryCtx(input._VM);

    if (selector === WARP_SELECTOR) {
        const newTime = BigInt(
            ethABI.decodeParameters(["uint256"], input.data.slice(4).toString("hex"))[0]
        );

        ctx.timeWarp = newTime;

        console.error(`Called Foundry warp(${newTime})`);
        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    if (selector === FAIL_SELECTOR) {
        const res = VmErrorResult(new VmError(ERROR.REVERT), new BN(0));
        console.error(`Called Foundry fail()`);
        ctx.failCalled = true;
        return res;
    }

    throw new Error(`NYI precompile with selector ${selector}`);
}
