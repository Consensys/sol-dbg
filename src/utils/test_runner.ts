import { Block } from "@ethereumjs/block";
import { Common, EVMStateManagerInterface, Hardfork } from "@ethereumjs/common";
import { DefaultStateManager } from "@ethereumjs/statemanager";
import { TypedTransaction, TypedTxData } from "@ethereumjs/tx";
import { Account, Address, PrefixedHexString } from "@ethereumjs/util";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";
import { assert } from "solc-typed-ast";
import { HexString } from "../artifacts";
import {
    BaseSolTxTracer,
    ContractSolidityState,
    FoundryTxResult,
    getContractGenKillSet,
    getKeccakPreimages,
    IArtifactManager,
    KeccakPreimageMap,
    SupportTracer
} from "../debug";
import { map_add } from "./map";
import { hexStrToBuf32, makeFakeTransaction, ZERO_ADDRESS_STRING } from "./misc";
import { set_add, set_subtract } from "./set";

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
    layoutBefore?: ContractSolidityState;
}

export interface TestCase extends BaseTestCase {
    steps: TestStep[];
}

/**
 * Helper class to run a set of TX and record info to allow debuggin any of the TXs independently. This includes:
 *
 * 1. The TX data for each
 * 2. The Block info for each TX
 * 3. The State of the world before each TX
 * 4. The result of the TX
 * 5. The set of contracts before each TX
 * 6. The set of keccak256 (result, preimage) pairs computed by the TX (useful for computing Solidity-level maps)
 */
export class VMTestRunner {
    private tracer: SupportTracer;
    private _txs: TypedTransaction[];
    private _txToBlock: Map<string, Block>;
    private _results: FoundryTxResult[];
    private _stateRootBeforeTx = new Map<string, EVMStateManagerInterface>();
    private _contractsBeforeTx = new Map<string, Set<PrefixedHexString>>();
    private _keccakPreimagesBeforeTx = new Map<string, Map<bigint, Uint8Array>>();

    constructor(
        artifactManager: IArtifactManager,
        private _foundryCheatcodes: boolean = true
    ) {
        this.tracer = new SupportTracer(artifactManager, {
            strict: true,
            foundryCheatcodes: this._foundryCheatcodes
        });

        this._txs = [];
        this._results = [];
        this._txToBlock = new Map();
    }

    async runTestCase(testCaseJSON: BaseTestCase): Promise<void> {
        /**
         * Dummy VM used just to get a StateManager and a Common instance. The actual VM used for execution is created inside
         * SupportTracer. (@todo this is kinda ugly... oh well)
         */
        const dummyVM = await BaseSolTxTracer.createVm(undefined, this._foundryCheatcodes);

        let stateManager = dummyVM.stateManager.shallowCopy();
        const common = dummyVM.common.copy();

        BaseSolTxTracer.releaseVM(dummyVM);

        const contractsBefore = await this.setupInitialState(
            testCaseJSON.initialState,
            stateManager as DefaultStateManager
        );

        const keccakPreimages: KeccakPreimageMap = new Map();

        for (let i = 0; i < testCaseJSON.steps.length; i++) {
            const tx = await this.harveyStepToTransaction(
                testCaseJSON.steps[i],
                stateManager,
                common
            );

            const block = this.harveyStepToBlock(testCaseJSON.steps[i], common);

            const txHash = bytesToHex(tx.hash());

            // Store the sets before the TX
            this._txs.push(tx);
            this._stateRootBeforeTx.set(txHash, stateManager);
            this._txToBlock.set(txHash, block);
            this._contractsBeforeTx.set(txHash, new Set(contractsBefore));
            this._keccakPreimagesBeforeTx.set(txHash, new Map(keccakPreimages));

            const [trace, res, stateAfter] = await this.tracer.debugTx(tx, block, stateManager);

            await (stateManager as DefaultStateManager).flush();

            // Update the set of live contracts
            const [gen, kill] = getContractGenKillSet(trace, res);
            set_add(contractsBefore, gen);
            set_subtract(contractsBefore, kill);

            const txKeccakPreimages = getKeccakPreimages(trace);
            map_add(keccakPreimages, txKeccakPreimages);

            // Update the keccak map

            // Add results
            this._results.push(res);

            stateManager = stateAfter;
        }
    }

    private async setupInitialState(
        initialState: InitialState,
        state: DefaultStateManager
    ): Promise<Set<PrefixedHexString>> {
        const initialContracts = new Set<PrefixedHexString>();

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

            if (codeBuf.length > 0) {
                initialContracts.add(address.toString());
            }
        }

        await state.commit();
        await state.flush();

        return initialContracts;
    }

    async harveyStepToTransaction(
        step: BaseTestStep,
        stateManager: EVMStateManagerInterface,
        common: Common
    ): Promise<TypedTransaction> {
        const senderAddress = Address.fromString(step.origin);
        const senderAccount = await stateManager.getAccount(senderAddress);
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

        return makeFakeTransaction(txData, step.origin, common);
    }

    harveyStepToBlock(step: BaseTestStep, common: Common): Block {
        return Block.fromBlockData(
            {
                header: {
                    coinbase: step.origin,
                    difficulty: common.hardfork() === Hardfork.Shanghai ? 0 : step.blockDifficulty,
                    gasLimit: step.blockGasLimit,
                    number: step.blockNumber,
                    timestamp: step.blockTime
                }
            },
            {
                common: common
            }
        );
    }

    get txs(): TypedTransaction[] {
        return this._txs;
    }

    get results(): FoundryTxResult[] {
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

    getContractsBefore(tx: TypedTransaction): Set<PrefixedHexString> {
        const txHash = bytesToHex(tx.hash());
        const res = this._contractsBeforeTx.get(txHash);

        assert(res !== undefined, `Unable to find block for tx ${txHash}`);

        return res;
    }
}
