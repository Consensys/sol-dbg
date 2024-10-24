import { ContractStates, HexString, Scenario, TxDesc } from "../../src";

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

// @todo: Test-relevant parts of this should be separated from BaseTestStep and moved under test/
// BaseTestStep should be renamed to something more generic - e.g. TxDesc
export interface TestStep extends TxDesc {
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
    layoutBefore?: ContractStates;
    layoutAtFailure?: ContractStates;
    liveContracts?: string[];
    decodedEvents?: Array<{
        name: string;
        args: Array<[string, any]>;
    }>;
    // Optional sequence of the decoded return results for this call
    decodedReturns?: any[][];
}

export interface TestCase extends Scenario {
    steps: TestStep[];
}
