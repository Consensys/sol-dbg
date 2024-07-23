import { EVM, EVMInterface, ExecResult, PrecompileInput } from "@ethereumjs/evm";
import {
    Account,
    Address,
    privateToAddress,
    setLengthLeft,
    setLengthRight
} from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { bytesToHex, utf8ToBytes } from "ethereum-cryptography/utils";
import EventEmitter from "events";
import { bigEndianBufToBigint, bigIntToBuf, uint8ArrConcat, uint8ArrEq } from "../utils";

const EVM_MOD = require("@ethereumjs/evm/dist/cjs/evm");
const EvmErrorResult = EVM_MOD.EvmErrorResult;

const EXCEPTION_MOD = require("@ethereumjs/evm/dist/cjs/exceptions");
const ERROR = EXCEPTION_MOD.ERROR;
const EvmError = EXCEPTION_MOD.EvmError;

/// require("@ethereumjs/evm/dist/cjs/interpreter").Env
type Env = any;
/// require("@ethereumjs/evm/dist/cjs/interpreter").InterpreterOpts
type InterpreterOpts = any;
/// require("@ethereumjs/evm/dist/cjs/interpreter").InterpreterResult
type InterpreterResult = any;

const INTERPRETER_MOD = require("@ethereumjs/evm/dist/cjs/interpreter");
const Interpreter = INTERPRETER_MOD.Interpreter;

/// require("@ethereumjs/evm/dist/cjs/precompiles").PrecompileFunc
type PrecompileFunc = any;
/// require("@ethereumjs/evm/dist/cjs/precompiles").RunState
type RunState = any;
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
export const interpRunListeners = new Map<EVM, EventEmitter>();

Interpreter.prototype.run = async function (
    code: Uint8Array,
    opts?: InterpreterOpts
): Promise<InterpreterResult> {
    const vm = this._evm;
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

function getSelector(signature: string): Uint8Array {
    return keccak256(new TextEncoder().encode(signature)).slice(0, 4);
}

export const WARP_SELECTOR = getSelector("warp(uint256)");
export const ROLL_SELECTOR = getSelector("roll(uint256)");
export const LOAD_SELECTOR = getSelector("load(address,bytes32)");
export const STORE_SELECTOR = getSelector("store(address,bytes32,bytes32)");
export const SIGN_SELECTOR = getSelector("sign(uint256,bytes32)");
export const ADDR_SELECTOR = getSelector("addr(uint256)");
export const DEAL_SELECTOR = getSelector("deal(address,uint256)");
export const PRANK_SELECTOR01 = getSelector("prank(address)");
export const PRANK_SELECTOR02 = getSelector("prank(address,address)");
export const START_PRANK_SELECTOR01 = getSelector("startPrank(address)");
export const START_PRANK_SELECTOR02 = getSelector("startPrank(address,address)");
export const STOP_PRANK_SELECTOR = getSelector("stopPrank()");
export const EXPECT_REVERT_SELECTOR01 = getSelector("expectRevert()");
export const EXPECT_REVERT_SELECTOR02 = getSelector("expectRevert(bytes4)");
export const EXPECT_REVERT_SELECTOR03 = getSelector("expectRevert(bytes)");

export const FAIL_LOC = bytesToHex(setLengthRight(utf8ToBytes("failed"), 32));

export const FAIL_MSG_DATA = bytesToHex(
    uint8ArrConcat(
        getSelector("store(address,bytes32,bytes32)"),
        setLengthLeft(FoundryCheatcodesAddress.toBytes(), 32),
        setLengthRight(utf8ToBytes("failed"), 32),
        setLengthLeft(new Uint8Array([1]), 32)
    )
);

export interface FoundryPrank {
    sender: Address;
    origin: Address | undefined;
    once: boolean;
}

/**
 * A type union containing the different descriptions for "expectRevert". It could be either
 *  - boolean (true) - any revert
 *  - bigint (bytes4) - corresponds to the selector of the expected event
 *  - Uint8Array (bytes) - corresponds to the exact exception byte we expect
 *  - undefined - no expected revert (default value)
 */
export type RevertMatch = Uint8Array | bigint | boolean | undefined;
// ERROR_PREFIX=keccak256("Error(string)")[0:4]
const ERROR_PREFIX = new Uint8Array([8, 195, 121, 160]);

/**
 * Check whether the returned value and data from the sub-context matches the
 * expected revert descriptor.
 */
export function returnStateMatchesRevert(
    ret: bigint,
    state: RunState,
    expected: RevertMatch
): boolean {
    // No revert expected. Doesn't matter what happen
    if (expected === undefined) {
        return true;
    }

    // Any revert was expected. Just check that the return value is 0.
    if (typeof expected === "boolean") {
        return expected === (ret === 0n);
    }

    const excDataSize = state.interpreter.getReturnDataSize();
    const excData = state.interpreter.getReturnData();

    // A specific selector is expected
    if (typeof expected === "bigint") {
        // Not enough data for selector
        if (excDataSize < 4n || excData.length < 4) {
            return false;
        }

        const actualSelector = bigEndianBufToBigint(excData.slice(0, 4));

        return expected === actualSelector;
    }

    let actualBytes: Uint8Array;

    // This looks like an Error(string) encoded message. Extract the inner string/bytes
    if (excDataSize >= 4n && uint8ArrEq(excData.slice(0, 4), ERROR_PREFIX)) {
        try {
            const errMsg = ethABI.decodeParameters(["string"], bytesToHex(excData.slice(4)))[0];
            actualBytes = new TextEncoder().encode(errMsg);
        } catch {
            actualBytes = excData;
        }
    } else {
        actualBytes = excData;
    }

    // Specific exception bytes are expected
    return uint8ArrEq(actualBytes, expected);
}

/**
 * Helper class attached to each VM object, that contains state relevant to Foundry cheatcodes.
 */
export class FoundryContext {
    public timeWarp: bigint | undefined = undefined;
    public rollBockNum: bigint | undefined = undefined;
    public failCalled = false;

    public clearExpectRevert(): void {
        this.expectRevert(undefined);
    }

    public expectRevert(match: RevertMatch): void {
        if (this.envStack.length === 0) {
            return undefined;
        }

        (this.getEnv() as any).expectedRevertDesc = match;
    }

    public getExpectedRevert(): RevertMatch {
        if (this.envStack.length === 0) {
            return undefined;
        }

        return (this.getEnv() as any).expectedRevertDesc;
    }

    /**
     * We keep track of the current stack of EEI objects, in order to keep track
     * of any pranks (pending and current).  Its easier to attach pranks to EEI
     * objects, as there is a unique EEI object for each external call in the
     * trace, and pranks are scoped to external calls.
     */
    private envStack: Env[] = [];

    // Get the current (topmost) EEI object
    public getEnv(): Env {
        return this.envStack[this.envStack.length - 1];
    }

    // Get any pending pranks for the current call frame
    public getPendingPrank(): FoundryPrank | undefined {
        if (this.envStack.length === 0) {
            return undefined;
        }

        return (this.getEnv() as any).pendingPrank;
    }

    // Set the pending prank for the current call frame
    public setPendingPrank(prank: FoundryPrank | undefined): void {
        if (this.envStack.length === 0) {
            return undefined;
        }

        (this.getEnv() as any).pendingPrank = prank;
    }

    /**
     * Get the set of pranks attached to the callframe related to eei.
     * Note that for flexibility we allow more than 1 prank, but in practice
     * foundry restricts this to only 1 prank at a time.
     */
    private getPranks(eei: Env): FoundryPrank[] {
        const pranks = (eei as any).pranks;

        if (pranks === undefined) {
            return [];
        }

        return pranks;
    }

    /**
     * Add a prank to a call frame identified by `eei`.
     */
    public addPrank(eei: Env, prank: FoundryPrank): void {
        const pranks = this.getPranks(eei);
        pranks.push(prank);

        (eei as any).pranks = pranks;
    }

    /**
     * Clear all active and pending pranks.
     */
    public clearPranks(): void {
        for (let i = this.envStack.length - 1; i >= 0; i--) {
            (this.envStack[i] as any).pranks = undefined;
            (this.envStack[i] as any).pendingPrank = undefined;
        }
    }

    /**
     * Look through the current pranks to see if we should override sender and/or origin.
     * If `recurse` is false, only look at the top most call frame (the behavior for msg.sender pranks).
     * If `recurse` is true, look down the call stack (the behavior for tx.origin pranks)
     */
    public matchPrank(recurse: boolean): [Address | undefined, Address | undefined] {
        for (let i = this.envStack.length - 1; i >= 0; i--) {
            const eei = this.envStack[i];
            const isTop = i == this.envStack.length - 1;

            const pranks = this.getPranks(eei);

            for (let j = pranks.length - 1; j >= 0; j--) {
                const prank = pranks[j];

                if (prank.once) {
                    if (!isTop) {
                        continue;
                    }

                    pranks.splice(j, 1);
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
    beforeInterpRunCB(interp: typeof Interpreter): void {
        const env = interp._env;
        const pendingPrank = this.getPendingPrank();

        if (pendingPrank) {
            this.addPrank(env, pendingPrank);

            if (pendingPrank.once) {
                this.setPendingPrank(undefined);
            }
        }

        this.envStack.push(env);
    }

    /**
     * Callback from the hooks in the interpreter to keep track of the
     * eei stack
     */
    afterInterpRunCB(): void {
        this.envStack.pop();
    }
}

export function getFoundryCtx(evm: EVMInterface): FoundryContext {
    return (evm as any)._foundryCtx;
}

export function setFoundryCtx(evm: EVMInterface, ctx: FoundryContext): void {
    (evm as any)._foundryCtx = ctx;
}

export function makeFoundryCheatcodePrecompile(): [PrecompileFunc, FoundryContext] {
    const ctx = new FoundryContext();

    const precompile = async function FoundryCheatcodePrecompile(
        input: PrecompileInput
    ): Promise<ExecResult> {
        const selector = input.data.slice(0, 4);

        if (uint8ArrEq(selector, WARP_SELECTOR)) {
            const newTime = BigInt(
                ethABI.decodeParameters(["uint256"], bytesToHex(input.data.slice(4)))[0]
            );

            ctx.timeWarp = newTime;

            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, ROLL_SELECTOR)) {
            const newBlockNum = BigInt(
                ethABI.decodeParameters(["uint256"], bytesToHex(input.data.slice(4)))[0]
            );

            ctx.rollBockNum = newBlockNum;

            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, LOAD_SELECTOR)) {
            //console.error(`load(${rawAddr}, ${rawLoc})`);
            let value = await input._EVM.stateManager.getContractStorage(
                new Address(input.data.slice(16, 36)),
                input.data.slice(36, 68)
            );

            value = setLengthLeft(value, 32);

            //console.error(`Result: ${bytesToHex(value)}`);

            return {
                executionGasUsed: 0n,
                returnValue: value
            };
        }

        if (uint8ArrEq(selector, STORE_SELECTOR)) {
            const addr = new Address(input.data.slice(16, 36));
            const loc = input.data.slice(36, 68);
            const value = input.data.slice(68, 100);

            /*
            console.error(
                `store(${addr.toString()}, ${bytesToHex(loc)}, ${bytesToHex(value)})`
            );
            */

            if (addr.equals(FoundryCheatcodesAddress)) {
                const strLoc = bytesToHex(loc);

                if (strLoc === FAIL_LOC) {
                    ctx.failCalled = BigInt(bytesToHex(value)) !== 0n;
                } else {
                    throw new Error(
                        `NYI store to loc ${strLoc} of foundry precompile contract ${addr.toString()}`
                    );
                }
            } else {
                await input._EVM.stateManager.putContractStorage(addr, loc, value);
            }

            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, SIGN_SELECTOR)) {
            const pk = input.data.slice(4, 36);
            const digest = input.data.slice(36, 68);

            const sig = secp256k1.sign(digest, pk);

            const r = bigIntToBuf(sig.r, 32, "big");
            const s = bigIntToBuf(sig.s, 32, "big");
            const v = setLengthLeft(new Uint8Array([sig.recovery + 27]), 32);

            return {
                executionGasUsed: 0n,
                returnValue: uint8ArrConcat(v, r, s)
            };
        }

        if (uint8ArrEq(selector, ADDR_SELECTOR)) {
            const pk = input.data.slice(4, 36);
            const addr = setLengthLeft(privateToAddress(pk), 32);

            return {
                executionGasUsed: 0n,
                returnValue: addr
            };
        }

        if (uint8ArrEq(selector, DEAL_SELECTOR)) {
            const addr = new Address(input.data.slice(16, 36));
            const newBalance = "0x" + bytesToHex(input.data.slice(36, 68));

            let acct: Account | undefined = await input._EVM.stateManager.getAccount(addr);

            if (acct === undefined) {
                acct = new Account();
            }
            acct.balance = BigInt(newBalance);
            await input._EVM.stateManager.putAccount(addr, acct);

            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, PRANK_SELECTOR01)) {
            // Foundry doesn't allow multiple concurrent pranks
            if (ctx.getPendingPrank() !== undefined) {
                return EvmErrorResult(new EvmError(ERROR.REVERT), 0n);
            }

            ctx.setPendingPrank({
                sender: new Address(input.data.slice(16, 36)),
                origin: undefined,
                once: true
            });

            //console.error(`prank(${bytesToHex(input.data.slice(16, 36))})`);
            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, PRANK_SELECTOR02)) {
            // Foundry doesn't allow multiple concurrent pranks
            if (ctx.getPendingPrank() !== undefined) {
                return EvmErrorResult(new EvmError(ERROR.REVERT), 0n);
            }

            ctx.setPendingPrank({
                sender: new Address(input.data.slice(16, 36)),
                origin: new Address(input.data.slice(36, 68)),
                once: true
            });

            /*
            console.error(
                `prank(${bytesToHex(input.data.slice(16, 36)}, ${
                    bytesToHex(input.data.slice(36, 68))})`
            );
            */
            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, START_PRANK_SELECTOR01)) {
            // Foundry doesn't allow multiple concurrent pranks
            if (ctx.getPendingPrank() !== undefined) {
                return EvmErrorResult(new EvmError(ERROR.REVERT), 0n);
            }

            ctx.setPendingPrank({
                sender: new Address(input.data.slice(16, 36)),
                origin: undefined,
                once: false
            });

            //console.error(`startPrank(${bytesToHex(input.data.slice(16, 36))})`);

            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, START_PRANK_SELECTOR02)) {
            // Foundry doesn't allow multiple concurrent pranks
            if (ctx.getPendingPrank() !== undefined) {
                return EvmErrorResult(new EvmError(ERROR.REVERT), 0n);
            }

            ctx.setPendingPrank({
                sender: new Address(input.data.slice(16, 36)),
                origin: new Address(input.data.slice(48, 68)),
                once: false
            });

            /*
            console.error(
                `startPrank(${bytesToHex() input.data.slice(16, 36).toString("hex")}, ${new Address(
                    input.data.slice(48, 68)
                )})`
            );
            */

            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, STOP_PRANK_SELECTOR)) {
            ctx.clearPranks();

            //console.error(`stopPrank()`);
            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, EXPECT_REVERT_SELECTOR01)) {
            //console.error(`vm.expectRevert();`);
            ctx.expectRevert(true);
            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, EXPECT_REVERT_SELECTOR02)) {
            //console.error(`vm.expectRevert(bytes4);`);
            if (input.data.length < 8) {
                return EvmErrorResult(new EvmError(ERROR.REVERT), 0n);
            }

            const selector = input.data.slice(4, 8);
            ctx.expectRevert(bigEndianBufToBigint(selector));

            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        if (uint8ArrEq(selector, EXPECT_REVERT_SELECTOR03)) {
            if (input.data.length < 68) {
                return EvmErrorResult(new EvmError(ERROR.REVERT), 0n);
            }

            const len = Number(bigEndianBufToBigint(input.data.slice(36, 68)));

            if (input.data.length < 68 + len) {
                return EvmErrorResult(new EvmError(ERROR.REVERT), 0n);
            }

            const bytes = input.data.slice(68, 68 + len);
            ctx.expectRevert(bytes);

            return {
                executionGasUsed: 0n,
                returnValue: new Uint8Array()
            };
        }

        return {
            executionGasUsed: 0n,
            returnValue: new Uint8Array()
        };
    };

    return [precompile, ctx];
}
