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

export abstract class BaseSolTxTracer<State> {
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
        trace: State[],
        tx: TypedTransaction
    ): Promise<State>;

    async debugTx(
        tx: TypedTransaction,
        block: Block | undefined, // TODO: Make block required and add to processRawTraceStep
        stateBefore: EVMStateManagerInterface
    ): Promise<[State[], FoundryTxResult, EVMStateManagerInterface]> {
        const vm = await BaseSolTxTracer.createVm(
            stateBefore.shallowCopy(true),
            this.foundryCheatcodes
        );

        const trace: State[] = [];

        assert(vm.evm.events !== undefined, "Unable to access EVM events at this point");

        vm.evm.events.on("step", async (step: InterpreterStep, next: any) => {
            const curStep = await this.processRawTraceStep(vm, step, trace, tx);

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
            stateAfter
        ];
    }
}
