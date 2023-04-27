import VM from "@ethereumjs/vm";
import { ExecResult } from "@ethereumjs/vm/dist/evm/evm";
import { PrecompileInput } from "@ethereumjs/vm/dist/evm/precompiles";
import { Address, BN, keccak256, setLengthLeft, setLengthRight } from "ethereumjs-util";
import { bigIntToBuf } from "../utils";
const { secp256k1 } = require("ethereum-cryptography/secp256k1");
const ethABI = require("web3-eth-abi");

export const FoundryCheatcodesAddress = Address.fromString(
    "0x7109709ECfa91a80626fF3989D68f67F5b1DD12D"
);

export const WARP_SELECTOR = keccak256(Buffer.from("warp(uint256)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const ROLL_SELECTOR = keccak256(Buffer.from("roll(uint256)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const LOAD_SELECTOR = keccak256(Buffer.from("load(address,bytes32)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const STORE_SELECTOR = keccak256(Buffer.from("store(address,bytes32,bytes32)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const SIGN_SELECTOR = keccak256(Buffer.from("sign(uint256,bytes32)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const FAIL_LOC = setLengthRight(Buffer.from("failed", "utf-8"), 32).toString("hex");
export const FAIL_MSG_DATA = Buffer.concat([
    keccak256(Buffer.from("store(address,bytes32,bytes32)", "utf-8")).slice(0, 4),
    setLengthLeft(FoundryCheatcodesAddress.toBuffer(), 32),
    setLengthRight(Buffer.from("failed", "utf-8"), 32),
    setLengthLeft(Buffer.from([1]), 32)
]).toString("hex");

export class FoundryContext {
    public timeWarp: bigint | undefined = undefined;
    public rollBockNum: bigint | undefined = undefined;
    public failCalled = false;
}

export function getFoundryCtx(vm: VM): FoundryContext {
    return (vm as any)._foundryCtx;
}

export function setFoundryCtx(vm: VM, ctx: FoundryContext): void {
    (vm as any)._foundryCtx = ctx;
}

export async function FoundryCheatcodePrecompile(input: PrecompileInput): Promise<ExecResult> {
    const selector = input.data.slice(0, 4).toString("hex");
    const ctx: FoundryContext = getFoundryCtx(input._VM);

    if (selector === WARP_SELECTOR) {
        const newTime = BigInt(
            ethABI.decodeParameters(["uint256"], input.data.slice(4).toString("hex"))[0]
        );

        ctx.timeWarp = newTime;

        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    if (selector === ROLL_SELECTOR) {
        const newBlockNum = BigInt(
            ethABI.decodeParameters(["uint256"], input.data.slice(4).toString("hex"))[0]
        );

        ctx.rollBockNum = newBlockNum;

        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    if (selector === LOAD_SELECTOR) {
        //console.error(`load(${rawAddr}, ${rawLoc})`);
        let value = await input._VM.stateManager.getContractStorage(
            new Address(input.data.slice(16, 36)),
            input.data.slice(36, 68)
        );

        value = setLengthLeft(value, 32);

        //console.error(`Result: ${value.toString("hex")}`);

        return {
            gasUsed: new BN(0),
            returnValue: value
        };
    }

    if (selector === STORE_SELECTOR) {
        const addr = new Address(input.data.slice(16, 36));
        const loc = input.data.slice(36, 68);
        const value = input.data.slice(68, 100);

        /*
        console.error(
            `store(${addr.toString()}, ${loc.toString("hex")}, ${value.toString("hex")})`
        );
        */

        if (addr.equals(FoundryCheatcodesAddress)) {
            const strLoc = loc.toString("hex");
            if (strLoc === FAIL_LOC) {
                ctx.failCalled = BigInt(value.toString("hex")) !== BigInt(0);
            } else {
                throw new Error(
                    `NYI store to loc ${strLoc} of foundry precompile contract ${addr.toString()}`
                );
            }
        } else {
            await input._VM.stateManager.putContractStorage(addr, loc, value);
        }

        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    if (selector === SIGN_SELECTOR) {
        const pk = input.data.slice(4, 36);
        const digest = input.data.slice(36, 68);

        const sig = secp256k1.sign(digest, pk);

        const r = bigIntToBuf(sig.r, 32, "big");
        const s = bigIntToBuf(sig.s, 32, "big");
        const v = setLengthLeft(Buffer.from([sig.recovery + 27]), 32);

        return {
            gasUsed: new BN(0),
            returnValue: Buffer.concat([v, r, s])
        };
    }

    throw new Error(`NYI precompile with selector ${selector}`);
}
