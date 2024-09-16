import { Block } from "@ethereumjs/block";
import { EVMStateManagerInterface, Hardfork } from "@ethereumjs/common";
import { DefaultStateManager } from "@ethereumjs/statemanager";
import { TypedTransaction, TypedTxData } from "@ethereumjs/tx";
import { Account, Address } from "@ethereumjs/util";
import { RunTxResult, VM } from "@ethereumjs/vm";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";
import { assert } from "solc-typed-ast";
import { HexString } from "../artifacts";
import { ZERO_ADDRESS_STRING, hexStrToBuf32, makeFakeTransaction } from "./misc";

export interface BaseTestStep {
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

export interface AccountDescription {
    nonce: number;
    balance: HexString;
    code: HexString;
    storage: {
        [storageAddr: HexString]: HexString;
    };
}

export interface InitialState {
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
    LastRevert = "last_revert",
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

interface ResultLastRevert {
    kind: ResultKind.LastRevert;
}

interface ResultFoundryFail {
    kind: ResultKind.FoundryFail;
}

export interface TestStep extends BaseTestStep {
    // Expected result of the transaction
    result:
        | ResultContractCreated
        | ResultValueReturned
        | ResultRevert
        | ResultLastRevert
        | ResultFoundryFail;
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

/**
 * Helper class to re-play harvey test cases on a in-memory VmProxy
 */
export class VMTestRunner {
    private _vm: VM;
    private _txs: TypedTransaction[];
    private _txToBlock: Map<string, Block>;
    private _results: RunTxResult[];
    private _stateRootBeforeTx = new Map<string, EVMStateManagerInterface>();

    get vm(): VM {
        return this._vm;
    }

    constructor(vm: VM) {
        this._vm = vm;
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
        const state = this.vm.stateManager as DefaultStateManager;

        await state.checkpoint();

        for (const addressStr of Object.keys(initialState.accounts)) {
            const { nonce, balance, code, storage } = initialState.accounts[addressStr];

            const address = Address.fromString(addressStr);
            const codeBuf = hexToBytes(code.slice(2));

            const acct = new Account();

            acct.nonce = BigInt(nonce);
            acct.balance = BigInt(balance);

            state.putAccount(address, acct);

            for (const [key, val] of Object.entries(storage)) {
                const keyBuf = hexStrToBuf32(key.slice(2));
                const valBuf = hexStrToBuf32(val.slice(2));

                await state.putContractStorage(address, keyBuf, valBuf);
            }

            await state.putContractCode(address, codeBuf);
        }

        await state.commit();
        await state.flush();
    }

    async harveyStepToTransaction(step: BaseTestStep): Promise<TypedTransaction> {
        const senderAddress = Address.fromString(step.origin);
        const senderAccount = await this.vm.stateManager.getAccount(senderAddress);
        const senderNonce = senderAccount !== undefined ? senderAccount.nonce : 0;

        const txData: TypedTxData = {
            value: step.value,
            gasLimit: step.gasLimit,
            gasPrice: 8,
            data: step.input,
            nonce: senderNonce
        };

        if (step.address !== ZERO_ADDRESS_STRING) {
            txData.to = step.address;
        }

        return makeFakeTransaction(txData, step.origin, this._vm.common);
    }

    harveyStepToBlock(step: BaseTestStep): Block {
        return Block.fromBlockData(
            {
                header: {
                    coinbase: step.origin,
                    difficulty:
                        this.vm.common.hardfork() === Hardfork.Shanghai ? 0 : step.blockDifficulty,
                    gasLimit: step.blockGasLimit,
                    number: step.blockNumber,
                    timestamp: step.blockTime
                }
            },
            {
                common: this.vm.common
            }
        );
    }

    private async _runTxInt(tx: TypedTransaction, block: Block): Promise<RunTxResult> {
        const txHash = bytesToHex(tx.hash());

        this._txs.push(tx);

        this._stateRootBeforeTx.set(txHash, this.vm.stateManager.shallowCopy(true));
        this._txToBlock.set(txHash, block);

        const res = this.vm.runTx({
            tx,
            block,
            skipBalance: true,
            skipNonce: true,
            skipBlockGasLimitValidation: true
        });
        await (this.vm.stateManager as DefaultStateManager).flush();

        return res;
    }

    get txs(): TypedTransaction[] {
        return this._txs;
    }

    get results(): RunTxResult[] {
        return this._results;
    }

    getStateBeforeTx(tx: TypedTransaction): EVMStateManagerInterface {
        const txHash = bytesToHex(tx.hash());
        const res = this._stateRootBeforeTx.get(txHash);

        assert(res !== undefined, `Unable to find state before tx ${txHash}`);

        return res;
    }

    getBlock(tx: TypedTransaction): Block {
        const txHash = bytesToHex(tx.hash());
        const res = this._txToBlock.get(txHash);

        assert(res !== undefined, `Unable to find block for tx ${txHash}`);

        return res;
    }
}
