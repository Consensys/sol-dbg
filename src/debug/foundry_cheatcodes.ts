import VM from "@ethereumjs/vm";
import { ExecResult, VmErrorResult } from "@ethereumjs/vm/dist/evm/evm";
import { PrecompileInput } from "@ethereumjs/vm/dist/evm/precompiles";
import {
    Address,
    BN,
    keccak256,
    privateToAddress,
    setLengthLeft,
    setLengthRight
} from "ethereumjs-util";
import { bigIntToBuf } from "../utils";
import Interpreter, {
    InterpreterOpts,
    InterpreterResult
} from "@ethereumjs/vm/dist/evm/interpreter";
import EEI from "@ethereumjs/vm/dist/evm/eei";
import EventEmitter from "events";
import { ERROR, VmError } from "@ethereumjs/vm/dist/exceptions";

/*
 * Hotpatch Interpreter.run so we can keep track of the runtime relationships between EEIs.
 * We use this to track when one call context is a child of another, which helps us scope pranks
 */
const oldRun = Interpreter.prototype.run;
/**
 * Each test/cases/debug session is associated with a unique VM. And there are
 * multiple interpreter instances per VM. We keep 1 event emitter per VM, so
 * that after we are done working with some VM, we don't unnecessarily invoke
 * its callbacks.
 */
export const interpRunListeners = new Map<VM, EventEmitter>();

Interpreter.prototype.run = async function (
    code: Buffer,
    opts?: InterpreterOpts
): Promise<InterpreterResult> {
    const vm = this._vm;
    const emitter = interpRunListeners.get(vm);

    if (emitter) emitter.emit("beforeInterpRun", this);
    const res = oldRun.bind(this)(code, opts);

    const wrappedPromise = res.then((interpRes: InterpreterResult) => {
        if (emitter) emitter.emit("afterInterpRun", this);

        return interpRes;
    });

    return wrappedPromise;
};

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
export const ADDR_SELECTOR = keccak256(Buffer.from("addr(uint256)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const DEAL_SELECTOR = keccak256(Buffer.from("deal(address,uint256)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const PRANK_SELECTOR01 = keccak256(Buffer.from("prank(address)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const PRANK_SELECTOR02 = keccak256(Buffer.from("prank(address,address)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const START_PRANK_SELECTOR01 = keccak256(Buffer.from("startPrank(address)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const START_PRANK_SELECTOR02 = keccak256(Buffer.from("startPrank(address,address)", "utf-8"))
    .slice(0, 4)
    .toString("hex");
export const STOP_PRANK_SELECTOR = keccak256(Buffer.from("stopPrank()", "utf-8"))
    .slice(0, 4)
    .toString("hex");

export const FAIL_LOC = setLengthRight(Buffer.from("failed", "utf-8"), 32).toString("hex");
export const FAIL_MSG_DATA = Buffer.concat([
    keccak256(Buffer.from("store(address,bytes32,bytes32)", "utf-8")).slice(0, 4),
    setLengthLeft(FoundryCheatcodesAddress.toBuffer(), 32),
    setLengthRight(Buffer.from("failed", "utf-8"), 32),
    setLengthLeft(Buffer.from([1]), 32)
]).toString("hex");

export interface FoundryPrank {
    sender: Address;
    origin: Address | undefined;
    once: boolean;
}

/**
 * Helper class attached to each VM object, that contains state relevant to Foundry cheatcodes.
 */
export class FoundryContext {
    public timeWarp: bigint | undefined = undefined;
    public rollBockNum: bigint | undefined = undefined;
    public failCalled = false;

    /**
     * We keep track of the current stack of EEI objects, in order to keep track
     * of any pranks (pending and current).  Its easier to attach pranks to EEI
     * objects, as there is a unique EEI object for each external call in the
     * trace, and pranks are scoped to external calls.
     */
    private eeiStack: EEI[] = [];

    // Get the current (topmost) EEI object
    public getEEI(): EEI {
        return this.eeiStack[this.eeiStack.length - 1];
    }

    // Get any pending pranks for the current call frame
    public getPendingPrank(): FoundryPrank | undefined {
        if (this.eeiStack.length === 0) {
            return undefined;
        }

        return (this.getEEI() as any).pendingPrank;
    }

    // Set the pending prank for the current call frame
    public setPendingPrank(prank: FoundryPrank | undefined): void {
        if (this.eeiStack.length === 0) {
            return undefined;
        }

        (this.getEEI() as any).pendingPrank = prank;
    }

    /**
     * Get the set of pranks attached to the callframe related to eei.
     * Note that for flexibility we allow more than 1 prank, but in practice
     * foundry restricts this to only 1 prank at a time.
     */
    private getPranks(eei: EEI): FoundryPrank[] {
        const pranks = (eei as any).pranks;

        if (pranks === undefined) {
            return [];
        }

        return pranks;
    }

    /**
     * Add a prank to a call frame identified by `eei`.
     */
    public addPrank(eei: EEI, prank: FoundryPrank): void {
        const pranks = this.getPranks(eei);
        pranks.push(prank);

        (eei as any).pranks = pranks;
    }

    /**
     * Clear all active and pending pranks.
     */
    public clearPranks(): void {
        for (let i = this.eeiStack.length - 1; i >= 0; i--) {
            (this.eeiStack[i] as any).pranks = undefined;
            (this.eeiStack[i] as any).pendingPrank = undefined;
        }
    }

    /**
     * Look through the current pranks to see if we should override sender and/or origin.
     * If `recurse` is false, only look at the top most call frame (the behavior for msg.sender pranks).
     * If `recurse` is true, look down the call stack (the behavior for tx.origin pranks)
     */
    public matchPrank(recurse: boolean): [Address | undefined, Address | undefined] {
        for (let i = this.eeiStack.length - 1; i >= 0; i--) {
            const eei = this.eeiStack[i];
            const isTop = i == this.eeiStack.length - 1;

            const pranks = this.getPranks(eei);

            for (let j = pranks.length - 1; j >= 0; j--) {
                const prank = pranks[j];

                if (prank.once && !isTop) {
                    continue;
                }

                return [prank.sender, prank.origin];
            }

            if (!recurse) {
                break;
            }
        }

        return [undefined, undefined];
    }

    /**
     * Callback from the hooks in the interpreter to keep track of the
     * eei stack
     */
    beforeInterpRunCB(interp: Interpreter): void {
        const eei = interp._eei;
        const pendingPrank = this.getPendingPrank();

        if (pendingPrank) {
            this.addPrank(eei, pendingPrank);

            if (pendingPrank.once) {
                this.setPendingPrank(undefined);
            }
        }

        this.eeiStack.push(interp._eei);
    }

    /**
     * Callback from the hooks in the interpreter to keep track of the
     * eei stack
     */
    afterInterpRunCB(): void {
        this.eeiStack.pop();
    }
}

// Get the FoundryContext associated with a VM
export function getFoundryCtx(vm: VM): FoundryContext {
    return (vm as any)._foundryCtx;
}

// Set the FoundryContext associated with a VM
export function setFoundryCtx(vm: VM, ctx: FoundryContext): void {
    (vm as any)._foundryCtx = ctx;
}

/**
 * Foundry cheatcodes precompile contract deployed at 0x7109709ECfa91a80626fF3989D68f67F5b1DD12D.
 */
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

    if (selector === ADDR_SELECTOR) {
        const pk = input.data.slice(4, 36);
        const addr = setLengthLeft(privateToAddress(pk), 32);

        return {
            gasUsed: new BN(0),
            returnValue: addr
        };
    }

    if (selector === DEAL_SELECTOR) {
        const addr = new Address(input.data.slice(16, 36));
        const newBalance = input.data.slice(36, 68).toString("hex");

        const acct = await input._VM.stateManager.getAccount(addr);
        acct.balance = new BN(newBalance, 16);
        await input._VM.stateManager.putAccount(addr, acct);

        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    if (selector === PRANK_SELECTOR01) {
        // Foundry doesn't allow multiple concurrent pranks
        if (ctx.getPendingPrank() !== undefined) {
            return VmErrorResult(new VmError(ERROR.REVERT), new BN(0));
        }

        ctx.setPendingPrank({
            sender: new Address(input.data.slice(16, 36)),
            origin: undefined,
            once: true
        });

        //console.error(`prank(${input.data.slice(16, 36).toString("hex")})`);
        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    if (selector === PRANK_SELECTOR02) {
        // Foundry doesn't allow multiple concurrent pranks
        if (ctx.getPendingPrank() !== undefined) {
            return VmErrorResult(new VmError(ERROR.REVERT), new BN(0));
        }

        ctx.setPendingPrank({
            sender: new Address(input.data.slice(16, 36)),
            origin: new Address(input.data.slice(36, 68)),
            once: true
        });

        /*
        console.error(
            `prank(${input.data.slice(16, 36).toString("hex")}, ${input.data
                .slice(36, 68)
                .toString("hex")})`
        );
        */
        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    if (selector === START_PRANK_SELECTOR01) {
        // Foundry doesn't allow multiple concurrent pranks
        if (ctx.getPendingPrank() !== undefined) {
            return VmErrorResult(new VmError(ERROR.REVERT), new BN(0));
        }

        ctx.setPendingPrank({
            sender: new Address(input.data.slice(16, 36)),
            origin: undefined,
            once: false
        });

        //console.error(`startPrank(${input.data.slice(16, 36).toString("hex")})`);

        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    if (selector === START_PRANK_SELECTOR02) {
        // Foundry doesn't allow multiple concurrent pranks
        if (ctx.getPendingPrank() !== undefined) {
            return VmErrorResult(new VmError(ERROR.REVERT), new BN(0));
        }

        ctx.setPendingPrank({
            sender: new Address(input.data.slice(16, 36)),
            origin: new Address(input.data.slice(48, 68)),
            once: false
        });

        /*
        console.error(
            `startPrank(${input.data.slice(16, 36).toString("hex")}, ${new Address(
                input.data.slice(48, 68)
            )})`
        );
        */

        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    if (selector === STOP_PRANK_SELECTOR) {
        ctx.clearPranks();

        //console.error(`stopPrank()`);
        return {
            gasUsed: new BN(0),
            returnValue: Buffer.from("", "hex")
        };
    }

    return {
        gasUsed: new BN(0),
        returnValue: Buffer.from("", "hex")
    };
}
