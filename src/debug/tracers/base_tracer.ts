import { Block } from "@ethereumjs/block";
import { Blockchain } from "@ethereumjs/blockchain";
import { Chain, Common, EVMStateManagerInterface, Hardfork } from "@ethereumjs/common";
import { EVM, getOpcodesForHF, InterpreterStep } from "@ethereumjs/evm";
import { DefaultStateManager } from "@ethereumjs/statemanager";
import { TypedTransaction } from "@ethereumjs/tx";
import { RunTxResult, VM } from "@ethereumjs/vm";
import { assert } from "solc-typed-ast";
import { IArtifactManager } from "../artifact_manager";
import {
    FoundryCheatcodesAddress,
    foundryCtxMap,
    getFoundryCtx,
    makeFoundryCheatcodePrecompile
} from "../foundry_cheatcodes";
import { foundryInterposedOps } from "../opcode_interposing";
import { EVMOpts } from "../types";

export interface TracerOpts {
    strict?: boolean;
    foundryCheatcodes?: boolean;
}

export interface FoundryTxResult extends RunTxResult {
    failCalled: boolean;
}

/**
 * Private map tracking VM-to-EVM mapping, used when releasing EVMs from the
 * global listener map for foundry cheatcodes.
 */
const vmToEVMMap = new Map<VM, EVM>();

/**
 * Base class for all trace processors. You can think of trace processing as a combination
 * of a map operation from `InterpreterStep` -> `TraceT`, along with a reduce operation
 * from `(TraceT, CtxT) -> CtxT`. All the map functions are stored in `transformers/` to allow
 * for reusability between different tracers.
 *
 * There is yet no formal place for reducers to go to. Check out `storage_decode_tracer.ts` for an example
 * of a reducer that accumulates live contracts and keccak preimages at each step.
 */
export abstract class BaseSolTxTracer<TraceT, CtxT> {
    artifactManager!: IArtifactManager;
    protected readonly strict: boolean;
    protected readonly foundryCheatcodes: boolean;

    constructor(artifactManager: IArtifactManager, opts?: TracerOpts) {
        this.artifactManager = artifactManager;

        this.strict = true;
        this.foundryCheatcodes = false;

        if (opts) {
            this.strict = opts.strict !== undefined ? opts.strict : this.strict;

            this.foundryCheatcodes =
                opts.foundryCheatcodes !== undefined
                    ? opts.foundryCheatcodes
                    : this.foundryCheatcodes;
        }
    }

    private static async getEVM(opts: EVMOpts, foundryCheatcodes: boolean): Promise<EVM> {
        const tmpEvm = await EVM.create(opts);

        if (!foundryCheatcodes) {
            return tmpEvm;
        }

        const opcodes = getOpcodesForHF(tmpEvm.common);
        const [precompile, foundryCtx] = makeFoundryCheatcodePrecompile();

        const optsCopy: EVMOpts = {
            ...opts,
            customOpcodes: [
                ...(opts.customOpcodes ? opts.customOpcodes : []),
                ...foundryInterposedOps(opcodes, foundryCtx)
            ],
            customPrecompiles: [
                ...(opts.customPrecompiles ? opts.customPrecompiles : []),
                {
                    address: FoundryCheatcodesAddress,
                    function: precompile
                }
            ]
        };

        const res = await EVM.create(optsCopy);
        foundryCtxMap.set(res, foundryCtx);
        return res;
    }

    /**
     * Releases references to the EVM stored inside VM from the
     * `interpRunListeners` map.  This avoids memory leaks when repeatedly
     * calling the debugger on different transactions.  Should be called once
     * for every vm created by `SolTxDebugger.createVm` after its done being
     * used.
     */
    static releaseVM(vm: VM): void {
        const evm = vmToEVMMap.get(vm);

        if (evm) {
            foundryCtxMap.delete(evm);
        }

        vmToEVMMap.delete(vm);
    }

    static async createVm(
        stateManager: EVMStateManagerInterface | undefined,
        foundryCheatcodes: boolean
    ): Promise<VM> {
        const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai });
        const blockchain = await Blockchain.create({ common });

        if (!stateManager) {
            stateManager = new DefaultStateManager();
        }

        const evm = await BaseSolTxTracer.getEVM(
            { common, blockchain, stateManager, allowUnlimitedContractSize: true },
            foundryCheatcodes
        );

        const vm = await VM.create({
            common,
            blockchain,
            stateManager,
            evm,
            activatePrecompiles: true
        });

        vmToEVMMap.set(vm, evm);

        return vm;
    }

    abstract processRawTraceStep(
        vm: VM,
        step: InterpreterStep,
        trace: TraceT[],
        tx: TypedTransaction,
        ctx: CtxT
    ): Promise<[TraceT, CtxT]>;

    /**
     * Run a TX with the specified "transformers" returning a quadruple including:
     *
     * 1. An enriched trace
     * 2. The TX result (with added info for Foundry TX)
     * 3. The StateManager at the end of the TX
     * 4. The final (reduced) context `CtxT`
     */
    async debugTx(
        tx: TypedTransaction,
        block: Block | undefined, // TODO: Make block required and add to processRawTraceStep
        stateBefore: EVMStateManagerInterface,
        ctx: CtxT
    ): Promise<[TraceT[], FoundryTxResult, EVMStateManagerInterface, CtxT]> {
        const vm = await BaseSolTxTracer.createVm(
            stateBefore.shallowCopy(true),
            this.foundryCheatcodes
        );

        const trace: TraceT[] = [];

        assert(vm.evm.events !== undefined, "Unable to access EVM events at this point");

        vm.evm.events.on("step", async (step: InterpreterStep, next: any) => {
            const [curStep, newCtx] = await this.processRawTraceStep(vm, step, trace, tx, ctx);
            ctx = newCtx;

            trace.push(curStep);

            next();
        });

        const txRes = await vm.runTx({
            tx,
            block,
            skipBalance: true,
            skipNonce: true,
            skipBlockGasLimitValidation: true
        });

        const foundryCtx = getFoundryCtx(vm.evm);
        const foundryFailCalled = foundryCtx !== undefined ? foundryCtx.failCalled : false;
        const stateAfter = vm.stateManager;

        BaseSolTxTracer.releaseVM(vm);

        return [
            trace,
            {
                ...txRes,
                failCalled: foundryFailCalled
            },
            stateAfter,
            ctx
        ];
    }
}

export abstract class MapOnlyTracer<TraceT> extends BaseSolTxTracer<TraceT, null> {
    async debugTx(
        tx: TypedTransaction,
        block: Block | undefined,
        stateBefore: EVMStateManagerInterface
    ): Promise<[TraceT[], FoundryTxResult, EVMStateManagerInterface, null]> {
        return super.debugTx(tx, block, stateBefore, null);
    }
}
