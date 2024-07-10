import { DefaultStateManager } from "@ethereumjs/statemanager";
import { RunTxResult, VM } from "@ethereumjs/vm";
import { bytesToHex } from "ethereum-cryptography/utils";
import expect from "expect";
import fse from "fs-extra";
import { FunctionDefinition, assert } from "solc-typed-ast";
import {
    ArtifactManager,
    ContractInfo,
    DecodedBytecodeSourceMapEntry,
    PartialSolcOutput,
    SolTxDebugger,
    SourceFileInfo,
    StepState,
    bigEndianBufToNumber,
    getContractInfo,
    lastExternalFrame,
    lsJson,
    wordToAddress
} from "../../src";
import {
    FAIL_MSG_DATA,
    FoundryCheatcodesAddress,
    getFoundryCtx
} from "../../src/debug/foundry_cheatcodes";
import { ResultKind, TestCase, TestStep, VMTestRunner, ppStackTrace } from "../../src/utils";

/**
 * Find the last step in the non-internal code, before trace step i
 */
export function findLastNonInternalStepBeforeStepI(
    trace: StepState[],
    i: number
): StepState | undefined {
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

    return findLastNonInternalStepBeforeStepI(trace, i);
}

/**
 * Find the last step in the non-internal code, that leads to the last revert
 */
export function findLastNonInternalStepBeforeLastRevert(trace: StepState[]): StepState | undefined {
    let i = trace.length - 1;

    for (; i >= 0; i--) {
        if (trace[i].op.opcode === 0xfd) {
            break;
        }
    }

    if (i < 0) {
        return undefined;
    }

    return findLastNonInternalStepBeforeStepI(trace, i);
}

/**
 * Find the last step before calling the foundry cheatcode fail()
 */
export function findFirstCallToFail(trace: StepState[]): StepState | undefined {
    let i = 0;

    for (; i < trace.length; i++) {
        // Look for CALL to FoundryCheatcodesAddress with the FAIL_SELECTOR
        if (trace[i].op.mnemonic === "CALL") {
            const stackLen = trace[i].evmStack.length;
            const addr = wordToAddress(trace[i].evmStack[stackLen - 2]);

            if (!addr.equals(FoundryCheatcodesAddress)) {
                continue;
            }

            const argOffset = bigEndianBufToNumber(trace[i].evmStack[stackLen - 4]);
            const argSize = bigEndianBufToNumber(trace[i].evmStack[stackLen - 5]);

            if (argSize < 4) {
                continue;
            }

            const msgData = bytesToHex(trace[i].memory.slice(argOffset, argOffset + argSize));

            if (msgData === FAIL_MSG_DATA) {
                break;
            }
        }
    }

    if (i === trace.length) {
        return undefined;
    }

    //console.error(`Error step: ${i}`);

    return trace[i];
}

function checkResult(result: RunTxResult, step: TestStep, vm: VM): boolean {
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

            const foundryCtx = getFoundryCtx(vm.evm);

            const foundryFailed = foundryCtx.failCalled;
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
            const foundryCtx = getFoundryCtx(vm.evm);

            const failed = foundryCtx.failCalled;

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
                describe(`Tx ${txFile}`, () => {
                    let solDbg: SolTxDebugger;
                    let runner: VMTestRunner;
                    let testJSON: TestCase;

                    beforeAll(async () => {
                        solDbg = new SolTxDebugger(artifactManager, {
                            foundryCheatcodes: true,
                            strict: false
                        });

                        runner = new VMTestRunner(
                            await SolTxDebugger.createVm(new DefaultStateManager(), true)
                        );

                        testJSON = fse.readJsonSync(txFile);

                        await runner.runTestCase(testJSON);
                    });

                    it("Transaction produced expected results", () => {
                        for (let i = 0; i < runner.txs.length; i++) {
                            const curStep = testJSON.steps[i];

                            expect(checkResult(runner.results[i], curStep, runner.vm)).toBeTruthy();
                        }
                    });

                    it("Error maps to correct source location", async () => {
                        for (let i = 0; i < runner.txs.length; i++) {
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

                            const tx = runner.txs[i];
                            const block = runner.getBlock(tx);
                            const stateBefore = runner.getStateBeforeTx(tx);
                            const [trace] = await solDbg.debugTx(tx, block, stateBefore);

                            const errorStep = getStepFailTraceStep(curStep, trace);

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

                            const errorStep = getStepFailTraceStep(curStep, trace);

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
