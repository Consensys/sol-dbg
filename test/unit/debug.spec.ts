import { RunTxResult } from "@ethereumjs/vm/dist/runTx";
import expect from "expect";
import fse from "fs-extra";
import { assert, FunctionDefinition } from "solc-typed-ast";
import {
    ArtifactManager,
    ContractInfo,
    DecodedBytecodeSourceMapEntry,
    getContractInfo,
    lastExternalFrame,
    lsJson,
    PartialSolcOutput,
    SolTxDebugger,
    SourceFileInfo,
    StepState
} from "../../src";
import { ppStackTrace, ResultKind, TestCase, TestStep, VMTestRunner } from "../utils";

/**
 * Find the last step in the non-internal code, that leads to the first revert
 */
export function findLastNonInternalStepBeforeRevert(trace: StepState[]): StepState | undefined {
    let i = 0;

    for (; i < trace.length; i++) {
        if (trace[i].op.opcode === 0xfd) {
            break;
        }
    }

    if (i === trace.length) {
        return undefined;
    }

    const stack = trace[i].stack;

    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].callee instanceof FunctionDefinition) {
            if (i === stack.length - 1) {
                return trace[i];
            }

            return trace[stack[i + 1].startStep - 1];
        }
    }

    return undefined;
}

function checkResult(result: RunTxResult, step: TestStep): boolean {
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
            const actualResult = result.execResult.returnValue.toString("hex");
            const res = step.result.value === actualResult;

            if (!res) {
                console.error(
                    `Expected return value ${step.result.value}, instead got ${actualResult}`
                );
            }

            return res;
        }

        case ResultKind.Revert: {
            const failed = result.execResult.exceptionError !== undefined;

            if (!failed) {
                console.error(`Expected a revert, but the tx step succeeded`);
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

describe(`Local tests`, async () => {
    for (const sample of fse.readdirSync("test/samples/local")) {
        describe(`Sample ${sample}`, () => {
            let artifacts: PartialSolcOutput[] = [];
            let artifactManager: ArtifactManager;

            const sources = new Map<string, string>();

            before(() => {
                artifacts = lsJson(`test/samples/local/${sample}/artifacts`).map((name) =>
                    fse.readJsonSync(name)
                );

                artifactManager = new ArtifactManager(artifacts);
            });

            for (const txFile of lsJson(`test/samples/local/${sample}/txs`)) {
                describe(`Tx ${txFile}`, async () => {
                    let solDbg: SolTxDebugger;
                    let runner: VMTestRunner;
                    let testJSON: TestCase;

                    before(async () => {
                        solDbg = new SolTxDebugger(artifactManager, { foundryCheatcodes: true });
                        runner = new VMTestRunner();
                        testJSON = fse.readJsonSync(txFile) as TestCase;

                        await runner.runTestCase(testJSON);
                    });

                    it("Transaction produced expected results", () => {
                        for (let i = 0; i < runner.txs.length; i++) {
                            const curStep = testJSON.steps[i];

                            expect(checkResult(runner.results[i], curStep)).toBeTruthy();
                        }
                    });

                    it("Error maps to correct source location", async () => {
                        for (let i = 0; i < runner.txs.length; i++) {
                            const curStep = testJSON.steps[i];

                            const expectRevert = curStep.result.kind === "revert";

                            if (!expectRevert) {
                                continue;
                            }

                            const tx = runner.txs[i];
                            const block = runner.getBlock(tx);
                            const stateBefore = runner.getStateBeforeTx(tx);
                            const [trace] = await solDbg.debugTx(tx, block, stateBefore);

                            const errorStep = findLastNonInternalStepBeforeRevert(trace);

                            expect(errorStep).not.toBeUndefined();
                            assert(errorStep !== undefined, "Should be catched by prev statement");

                            const lastExtStep = lastExternalFrame(errorStep.stack);
                            const info = getContractInfo(
                                errorStep.stack[errorStep.stack.length - 1]
                            );

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
                                continue;
                            }

                            let fileContents = sources.get(fileName as string);

                            if (fileContents === undefined) {
                                fileContents = fse.readFileSync(fileName, {
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

                    it("Failure stack traces are correct", async () => {
                        for (let i = 0; i < runner.txs.length; i++) {
                            const curStep = testJSON.steps[i];

                            if (curStep.errorStack === undefined) {
                                continue;
                            }

                            const tx = runner.txs[i];
                            const block = runner.getBlock(tx);
                            const stateBefore = runner.getStateBeforeTx(tx);
                            const [trace] = await solDbg.debugTx(tx, block, stateBefore);

                            const errorStep = findLastNonInternalStepBeforeRevert(trace);

                            expect(errorStep).not.toBeUndefined();
                            assert(errorStep !== undefined, ``);

                            const actualStackTrace = ppStackTrace(
                                solDbg,
                                trace,
                                errorStep.stack,
                                errorStep.pc
                            );

                            expect(
                                stackTracesEq(actualStackTrace, curStep.errorStack)
                            ).toBeTruthy();
                        }
                    });
                });
            }
        });
    }
});
