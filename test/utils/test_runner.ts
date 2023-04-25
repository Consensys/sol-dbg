import { Block } from "@ethereumjs/block";
import Common from "@ethereumjs/common";
import { Transaction, TxData } from "@ethereumjs/tx";
import VM from "@ethereumjs/vm";
import { RunTxResult } from "@ethereumjs/vm/dist/runTx";
import { StateManager } from "@ethereumjs/vm/dist/state";
import { VMContext } from "@remix-project/remix-simulator/src/vm-context";
import { VmProxy } from "@remix-project/remix-simulator/src/VmProxy";
import { Account, Address, BN } from "ethereumjs-util";
import { assert } from "solc-typed-ast";
import { HexString } from "../../src/artifacts";
import { hexStrToBuf32, makeFakeTransaction, ZERO_ADDRESS_STRING } from "../../src/utils/misc";
import { SolTxDebugger } from "../../src";

interface BaseTestStep {
    address: HexString;
    gasLimit: HexString;
    gasPrice: HexString;
    input: HexString;
    origin: HexString;
    value: HexString;
    blockCoinbase: HexString;
    blockDifficulty: HexString;
    blockGasLimit: HexString;
    blockNumber: HexString;
    blockTime: HexString;
}

interface AccountDescription {
    nonce: number;
    balance: HexString;
    code: HexString;
    storage: {
        [storageAddr: HexString]: HexString;
    };
}

interface InitialState {
    accounts: {
        [address: HexString]: AccountDescription;
    };
}

interface BaseTestCase {
    initialState: InitialState;
    steps: BaseTestStep[];
}

export enum ResultKind {
    ContractCreated = "contract_created",
    ValueReturned = "value_returned",
    Revert = "revert",
    FoundryFail = "foundry_fail"
}

interface ResultContractCreated {
    kind: ResultKind.ContractCreated;
    address: string;
}

interface ResultValueReturned {
    kind: ResultKind.ValueReturned;
    value: HexString;
}

interface ResultRevert {
    kind: ResultKind.Revert;
}

interface ResultFoundryFail {
    kind: ResultKind.FoundryFail;
}

export interface TestStep extends BaseTestStep {
    // Expected result of the transaction
    result: ResultContractCreated | ResultValueReturned | ResultRevert | ResultFoundryFail;
    // Stack trace at the first error in the tx
    errorStack?: string[];
    // String in the original file in which the error location maps to
    errorString?: string;
    // Optional prefix to append to file path to find the files
    errorPathPrefix?: string;
}

export interface TestCase extends BaseTestCase {
    steps: TestStep[];
}

export class AdjustedVMContext extends VMContext {
    /**
     * Skip using `Common` due to it causes failures and restrictions.
     *
     * We also want to preserve original StateManager,
     * as it is not yet exported and therefore is unable to be instantiated here.
     */
    createVm(): {
        vm: VM;
        web3vm: VmProxy;
        stateManager: any;
        common: Common;
    } {
        const data = super.createVm(this.currentFork);

        const vm = SolTxDebugger.getVM(
            {
                stateManager: data.vm.stateManager,

                activatePrecompiles: true,
                allowUnlimitedContractSize: true
            },
            true
        );

        data.vm = vm;
        data.common = vm._common;

        data.web3vm.setVM(vm);

        return data;
    }
}

/**
 * Helper class to re-play harvey test cases on a in-memory VmProxy
 */
export class VMTestRunner {
    private _provider: VmProxy;
    private _txs: Transaction[];
    private _txToBlock: Map<string, Block>;
    private _results: RunTxResult[];
    private _stateRootBeforeTx = new Map<string, StateManager>();

    get vm(): VM {
        return this._provider.vm;
    }

    constructor(provider?: VmProxy) {
        if (provider === undefined) {
            const vmContext = new AdjustedVMContext();

            const { web3vm } = vmContext.currentVm;

            provider = web3vm;
        }

        this._provider = provider;
        this._txs = [];
        this._results = [];
        this._txToBlock = new Map();
    }

    async runTestCase(testCaseJSON: BaseTestCase): Promise<void> {
        await this.setupInitialState(testCaseJSON.initialState);

        for (let i = 0; i < testCaseJSON.steps.length; i++) {
            const tx = await this.harveyStepToTransaction(testCaseJSON.steps[i]);
            const block = this.harveyStepToBlock(testCaseJSON.steps[i]);
            const res = await this._runTxInt(tx, block);

            this._results.push(res);
        }
    }

    private async setupInitialState(initialState: InitialState): Promise<void> {
        const vm = this._provider.vm;
        const state = vm.stateManager;

        await state.checkpoint();

        for (const addressStr of Object.keys(initialState.accounts)) {
            const { nonce, balance, code, storage } = initialState.accounts[addressStr];

            const address = Address.fromString(addressStr);
            const codeBuf = Buffer.from(code.slice(2), "hex");

            const acct = new Account();

            acct.nonce = new BN(nonce.toString(16), 16);
            acct.balance = new BN(balance.slice(2), 16);

            state.putAccount(address, acct);

            for (const [key, val] of Object.entries(storage)) {
                const keyBuf = hexStrToBuf32(key.slice(2));
                const valBuf = hexStrToBuf32(val.slice(2));

                await state.putContractStorage(address, keyBuf, valBuf);
            }

            await state.putContractCode(address, codeBuf);
        }

        await state.commit();
    }

    async harveyStepToTransaction(step: BaseTestStep): Promise<Transaction> {
        const vm = this._provider.vm;

        const senderAddress = Address.fromString(step.origin);
        const senderAccount = await vm.stateManager.getAccount(senderAddress);
        const senderNonce = senderAccount.nonce;

        const txData: TxData = {
            value: step.value,
            gasLimit: step.gasLimit,
            gasPrice: 1,
            data: step.input,
            nonce: senderNonce
        };

        if (step.address !== ZERO_ADDRESS_STRING) {
            txData.to = step.address;
        }

        return makeFakeTransaction(txData, step.origin);
    }

    harveyStepToBlock(step: BaseTestStep): Block {
        return Block.fromBlockData({
            header: {
                coinbase: step.origin,
                difficulty: step.blockDifficulty,
                gasLimit: step.blockGasLimit,
                number: new BN(step.blockNumber.slice(2), 16),
                timestamp: new BN(step.blockTime.slice(2), 16)
            }
        });
    }

    private async _runTxInt(tx: Transaction, block: Block): Promise<RunTxResult> {
        const vm = this._provider.vm;
        const txHash = tx.hash().toString("hex");

        this._txs.push(tx);

        this._stateRootBeforeTx.set(txHash, vm.stateManager.copy());
        this._txToBlock.set(txHash, block);
        const res = vm.runTx({
            tx,
            block,
            skipBalance: true,
            skipNonce: true,
            skipBlockGasLimitValidation: true
        });

        return res;
    }

    get txs(): Transaction[] {
        return this._txs;
    }

    get results(): RunTxResult[] {
        return this._results;
    }

    getStateBeforeTx(tx: Transaction): StateManager {
        const txHash = tx.hash().toString("hex");
        const res = this._stateRootBeforeTx.get(txHash);

        assert(res !== undefined, `Unable to find state before tx ${txHash}`);

        return res;
    }

    getBlock(tx: Transaction): Block {
        const txHash = tx.hash().toString("hex");
        const res = this._txToBlock.get(txHash);

        assert(res !== undefined, `Unable to find block for tx ${txHash}`);

        return res;
    }
}
