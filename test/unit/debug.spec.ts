import { Address } from "@ethereumjs/util";
import { bytesToHex } from "ethereum-cryptography/utils";
import expect from "expect";
import fse from "fs-extra";
import { assert, DecodedBytecodeSourceMapEntry, forAny } from "solc-typed-ast";
import {
    ArtifactManager,
    ContractInfo,
    decodeContractState,
    FoundryTxResult,
    PartialSolcOutput,
    SolTxDebugger,
    SourceFileInfo,
    StepState
} from "../../src";
import { getMapKeys, getStorage, topExtFrame } from "../../src/debug/tracers/transformers";
import {
    findFirstCallToFail,
    findLastNonInternalStepBeforeLastRevert,
    findLastNonInternalStepBeforeRevert,
    ppStackTrace,
    sanitizeBigintFromJson,
    TxRunner
} from "../../src/utils";
import { lsJson } from "../utils";
import { ResultKind, TestCase, TestStep } from "../utils/test_case";

function checkResult(result: FoundryTxResult, step: TestStep): boolean {
    switch (step.result.kind) {
        case ResultKind.ContractCreated: {
            const createdAddress = result.createdAddress
                ? result.createdAddress.toString()
                : undefined;

            const res = step.result.address === createdAddress;

            if (!res) {
                console.error(
                    `Expected contract created@${step.result.address}, but got contract created at ${createdAddress}`
                );
            }

            return res;
        }

        case ResultKind.ValueReturned: {
            if (result.execResult.exceptionError !== undefined) {
                console.error(
                    `Expected return value ${step.result.value}, instead reverted with`,
                    result.execResult.exceptionError
                );
                return false;
            }

            const actualResult = bytesToHex(result.execResult.returnValue);
            const res = step.result.value === actualResult;

            if (!res) {
                console.error(
                    `Expected return value ${step.result.value}, instead got ${actualResult}`
                );
            }

            const foundryFailed = result.failCalled;
            if (foundryFailed) {
                console.error(`Expected a foundry fail call, but the tx step succeeded`);
            }

            return res && !foundryFailed;
        }

        case ResultKind.Revert: {
            const failed = result.execResult.exceptionError !== undefined;

            if (!failed) {
                console.error(`Expected a revert, but the tx step succeeded`);
            }

            return failed;
        }

        case ResultKind.LastRevert: {
            const failed = result.execResult.exceptionError !== undefined;

            if (!failed) {
                console.error(`Expected a revert, but the tx step succeeded`);
            }

            return failed;
        }

        case ResultKind.FoundryFail: {
            const failed = result.failCalled;

            if (!failed) {
                console.error(`Expected a foundry fail call, but the tx step succeeded`);
            }

            return failed;
        }
    }
}

/**
 * Since the stack traces include absolute path names that may differ on the
 * different machines where the test is ran, we just compare the suffixes of each stack trace line
 * to the expected value
 */
export function stackTracesEq(actualST: string, expectedST: string[]): boolean {
    const actualSTLines = actualST.split("\n");

    if (actualSTLines.length !== expectedST.length) {
        console.error(
            `Traces have different number of lines. Expected(${
                expectedST.length
            }): \n ${expectedST.join("\n")} \n Actual(${actualSTLines.length}): \n ${actualST}`
        );

        return false;
    }

    for (let i = 0; i < actualSTLines.length; i++) {
        if (!actualSTLines[i].endsWith(expectedST[i])) {
            console.error(
                `Traces differ on line ${i}: actual: ${actualSTLines[i]} expected: ${expectedST[i]}`
            );

            return false;
        }
    }

    return true;
}

function getStepFailTraceStep(step: TestStep, trace: StepState[]): StepState | undefined {
    if (step.result.kind === "revert") {
        return findLastNonInternalStepBeforeRevert(trace);
    }

    if (step.result.kind === "last_revert") {
        return findLastNonInternalStepBeforeLastRevert(trace);
    }

    return findFirstCallToFail(trace);
}

describe("Local tests", () => {
    for (const sample of fse.readdirSync("test/samples/local")) {
        describe(`Sample ${sample}`, () => {
            let artifacts: PartialSolcOutput[] = [];
            let artifactManager: ArtifactManager;

            const sources = new Map<string, string>();

            beforeAll(() => {
                artifacts = lsJson(`test/samples/local/${sample}/artifacts`).map((name) =>
                    fse.readJsonSync(name)
                );

                artifactManager = new ArtifactManager(artifacts);
            });

            for (const txFile of lsJson(`test/samples/local/${sample}/txs`)) {
                const testJSON: TestCase = fse.readJsonSync(txFile);

                describe(`Scenario ${txFile}`, () => {
                    let solDbg: SolTxDebugger;
                    let runner: TxRunner;
                    const traces: StepState[][] = [];

                    beforeAll(async () => {
                        solDbg = new SolTxDebugger(artifactManager, {
                            foundryCheatcodes: true,
                            strict: false
                        });

                        runner = new TxRunner(artifactManager, true);

                        await runner.runScenario(testJSON);
                        for (let i = 0; i < testJSON.steps.length; i++) {
                            const tx = runner.txs[i];
                            const block = runner.getBlock(tx);
                            const stateBefore = runner.getStateBeforeTx(tx);
                            const [trace] = await solDbg.debugTx(tx, block, stateBefore);
                            traces.push(trace);
                        }
                    });

                    it("Transactions produced expected results", () => {
                        for (let i = 0; i < testJSON.steps.length; i++) {
                            const curStep = testJSON.steps[i];
                            expect(checkResult(runner.results[i], curStep)).toBeTruthy();
                        }
                    });

                    it("Error maps to correct source location", async () => {
                        for (let i = 0; i < testJSON.steps.length; i++) {
                            const curStep = testJSON.steps[i];
                            if (
                                !(
                                    curStep.result.kind === ResultKind.Revert ||
                                    curStep.result.kind === ResultKind.LastRevert ||
                                    curStep.result.kind === ResultKind.FoundryFail
                                )
                            ) {
                                continue;
                            }

                            const trace = traces[i];

                            const errorStep = getStepFailTraceStep(curStep, trace);

                            expect(errorStep).not.toBeUndefined();
                            assert(errorStep !== undefined, "Should be catched by prev statement");

                            const lastExtStep = topExtFrame(errorStep);
                            const info = lastExtStep.info;

                            expect(info).not.toBeUndefined();
                            expect(errorStep.src).not.toBeUndefined();

                            const errorLoc = errorStep.src as DecodedBytecodeSourceMapEntry;

                            const fileInd = errorLoc.sourceIndex;
                            const fileInfo = artifactManager.getFileById(
                                fileInd,
                                info as ContractInfo,
                                lastExtStep.kind === "creation"
                            );

                            expect(fileInfo).not.toBeUndefined();

                            const fileName = (fileInfo as SourceFileInfo).name;

                            expect(fileName).not.toBeUndefined();

                            if (!curStep.errorString) {
                                return;
                            }

                            let fileContents = sources.get(fileName as string);

                            if (fileContents === undefined) {
                                const actualFileName = curStep.errorPathPrefix
                                    ? curStep.errorPathPrefix + fileName
                                    : fileName;

                                fileContents = fse.readFileSync(actualFileName, {
                                    encoding: "utf-8"
                                });

                                sources.set(fileName, fileContents);
                            }

                            const errStr = (fileContents as string).substring(
                                errorLoc.start,
                                errorLoc.start + errorLoc.length
                            );

                            expect(errStr).toEqual(curStep.errorString);
                        }
                    });

                    if (forAny(testJSON.steps, (step) => step.errorStack !== undefined)) {
                        it("Failure stack traces are correct", async () => {
                            for (let i = 0; i < testJSON.steps.length; i++) {
                                const curStep = testJSON.steps[i];
                                const trace = traces[i];

                                if (curStep.errorStack === undefined) {
                                    continue;
                                }

                                const errorStep = getStepFailTraceStep(curStep, trace);

                                expect(errorStep).not.toBeUndefined();
                                assert(errorStep !== undefined, ``);

                                const actualStackTrace = ppStackTrace(
                                    solDbg,
                                    trace,
                                    errorStep,
                                    errorStep.pc
                                );

                                expect(
                                    stackTracesEq(actualStackTrace, curStep.errorStack as string[])
                                ).toBeTruthy();
                            }
                        });
                    }

                    if (forAny(testJSON.steps, (step) => step.layoutBefore !== undefined)) {
                        it("Layouts before tx ok (if specified)", async () => {
                            for (let i = 0; i < testJSON.steps.length; i++) {
                                const curStep = testJSON.steps[i];

                                if (curStep.layoutBefore === undefined) {
                                    continue;
                                }

                                const tx = runner.txs[i];
                                const stateBefore = runner.getStateBeforeTx(tx);

                                const addr = Address.fromString(curStep.address);

                                const code = await stateBefore.getContractCode(addr);
                                expect(code.length).toBeGreaterThan(0);

                                const info = artifactManager.getContractFromDeployedBytecode(code);

                                expect(info).toBeDefined();
                                assert(info !== undefined && info.ast !== undefined, "");

                                const infer = artifactManager.infer(info.artifact.compilerVersion);
                                const storage = await getStorage(stateBefore, addr);
                                const keccakPreimages = runner.getKeccakPreimagesBefore(tx);
                                const mapKeys = getMapKeys(keccakPreimages);

                                const layout = decodeContractState(
                                    artifactManager,
                                    infer,
                                    info.ast,
                                    storage,
                                    mapKeys
                                );

                                expect(layout).toBeDefined();

                                const strLayout = JSON.stringify(
                                    sanitizeBigintFromJson(layout),
                                    undefined,
                                    2
                                );

                                expect(strLayout).toEqual(
                                    JSON.stringify(curStep.layoutBefore, null, 2)
                                );
                            }
                        });
                    }

                    if (forAny(testJSON.steps, (step) => step.layoutAtFailure !== undefined)) {
                        it("Layouts at failure ok (if specified)", async () => {
                            for (let i = 0; i < testJSON.steps.length; i++) {
                                const curStep = testJSON.steps[i];

                                if (curStep.layoutAtFailure === undefined) {
                                    continue;
                                }

                                const tx = runner.txs[i];
                                const trace = traces[i];

                                const errorStep = getStepFailTraceStep(curStep, trace);

                                expect(errorStep).not.toBeUndefined();
                                assert(
                                    errorStep !== undefined,
                                    "Should be catched by prev statement"
                                );

                                const errorStepIdx = trace.indexOf(errorStep);
                                assert(errorStepIdx > 0, "");

                                const layout = await runner.getDecodedContractStatesOnTxStep(
                                    tx,
                                    errorStepIdx
                                );

                                expect(layout).toBeDefined();

                                const strLayout = JSON.stringify(
                                    sanitizeBigintFromJson(layout),
                                    undefined,
                                    2
                                );

                                expect(strLayout).toEqual(
                                    JSON.stringify(curStep.layoutAtFailure, null, 2)
                                );
                            }
                        });
                    }

                    if (forAny(testJSON.steps, (step) => step.liveContracts !== undefined)) {
                        it("Live contracts before tx ok (if specified)", async () => {
                            for (let i = 0; i < testJSON.steps.length; i++) {
                                const curStep = testJSON.steps[i];

                                if (curStep.liveContracts === undefined) {
                                    continue;
                                }

                                const tx = runner.txs[i];
                                const contractsBefore = runner.getContractsBefore(tx);
                                expect(contractsBefore).toEqual(new Set(curStep.liveContracts));
                            }
                        });
                    }

                    if (forAny(testJSON.steps, (step) => step.decodedEvents !== undefined)) {
                        it("Decoded events in TX are correct", async () => {
                            for (let i = 0; i < testJSON.steps.length; i++) {
                                const curStep = testJSON.steps[i];

                                if (curStep.decodedEvents === undefined) {
                                    continue;
                                }

                                const trace = traces[i];

                                const actualDecodedEvents: Array<[string, Array<[string, any]>]> =
                                    trace
                                        .map((step) => step.decodedEvent)
                                        .filter((x) => x !== undefined)
                                        .filter(
                                            (x) =>
                                                x.def.definition.name !== "AssertionFailedData" &&
                                                x.def.definition.name !== "log_named_address"
                                        )
                                        .map((x) => [
                                            x.def.definition.name,
                                            sanitizeBigintFromJson(x.args)
                                        ]);

                                expect(actualDecodedEvents).toEqual(
                                    curStep.decodedEvents === undefined ? [] : curStep.decodedEvents
                                );
                            }
                        });
                    }

                    if (forAny(testJSON.steps, (step) => step.decodedReturns !== undefined)) {
                        it("Decoded returns in TX are correct", async () => {
                            for (let i = 0; i < testJSON.steps.length; i++) {
                                const curStep = testJSON.steps[i];

                                if (curStep.decodedReturns === undefined) {
                                    continue;
                                }

                                const trace = traces[i];

                                const actualDecodedReturns: any[][] = trace
                                    .filter(
                                        (step) =>
                                            step.retInfo &&
                                            step.retInfo.decodedReturnData !== undefined
                                    )
                                    .map((step) =>
                                        sanitizeBigintFromJson(
                                            (step.retInfo as any).decodedReturnData
                                        )
                                    );

                                expect(actualDecodedReturns).toEqual(curStep.decodedReturns);
                            }
                        });
                    }
                });
            }
        });
    }
});
