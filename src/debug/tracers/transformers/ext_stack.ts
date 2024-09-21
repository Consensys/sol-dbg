import { InterpreterStep } from "@ethereumjs/evm";
import { TypedTransaction } from "@ethereumjs/tx";
import { Address, bytesToHex } from "@ethereumjs/util";
import { VM } from "@ethereumjs/vm";
import { assert, FunctionDefinition, VariableDeclaration } from "solc-typed-ast";
import {
    getCodeHash,
    getCreationCodeHash,
    HexString,
    UnprefixedHexString
} from "../../../artifacts";
import { bigEndianBufToNumber, wordToAddress, ZERO_ADDRESS } from "../../../utils";
import { buildMsgDataViews, findMethodBySelector } from "../../abi";
import { ContractInfo, IArtifactManager } from "../../artifact_manager";
import { createsContract, increasesDepth, OPCODES } from "../../opcodes";
import {
    CallFrame,
    CreationFrame,
    DataLocationKind,
    DataView,
    ExternalFrame,
    FrameKind
} from "../../types";
import { BasicStepInfo } from "./basic_info";

export interface ExternalFrameInfo {
    extStack: ExternalFrame[];
}

/**
 * Given a contract info and a function selector find the (potentially inherited) entry point (function or public var getter).
 * @param info
 * @param selector
 * @returns
 */
function findEntryPoint(
    info: ContractInfo,
    selector: UnprefixedHexString,
    artifactManager: IArtifactManager
): FunctionDefinition | VariableDeclaration | undefined {
    if (info.ast === undefined) {
        return undefined;
    }

    const contract = info.ast;
    const infer = artifactManager.infer(info.artifact.compilerVersion);

    return findMethodBySelector(selector, contract, infer);
}

/**
 * Build a `CallFrame` from the given `sender` address, `receiver` address, `data` `Uint8Array`, (msg.data) and the current trace step number.
 */
function makeCallFrame(
    sender: Address,
    receiver: Address,
    codeAddress: Address,
    data: Uint8Array,
    receiverCode: Uint8Array,
    codeHash: HexString | undefined,
    step: number,
    artifactManager: IArtifactManager
): CallFrame {
    const contractInfo: ContractInfo | undefined =
        codeHash === undefined ? codeHash : artifactManager.getContractFromMDHash(codeHash);

    const selector: UnprefixedHexString = bytesToHex(data.slice(0, 4)).slice(2);

    let callee: FunctionDefinition | VariableDeclaration | undefined;
    let args: Array<[string, DataView | undefined]> | undefined;

    if (contractInfo && contractInfo.ast) {
        const abiVersion = contractInfo.artifact.abiEncoderVersion;
        const infer = artifactManager.infer(contractInfo.artifact.compilerVersion);

        callee = findEntryPoint(contractInfo, selector, artifactManager);

        if (callee !== undefined) {
            try {
                args = buildMsgDataViews(
                    callee,
                    data,
                    DataLocationKind.CallData,
                    infer,
                    abiVersion
                );
            } catch (e) {
                args = undefined;
            }
        }
    }

    return {
        kind: FrameKind.Call,
        sender, // TODO: This should be Address
        msgData: data,
        receiver: receiver, // TODO: This should be Address
        code: receiverCode,
        info: contractInfo,
        callee,
        address: receiver,
        startStep: step,
        arguments: args,
        codeMdHash: codeHash,
        codeAddress
    };
}

/**
 * Build a `CreationFrame` from the given `sender` address, `data` `Uint8Array`(msg.data) and the current trace step number.
 */
function makeCreationFrame(
    sender: Address,
    data: Uint8Array,
    step: number,
    artifactManager: IArtifactManager
): CreationFrame {
    const contractInfo = artifactManager.getContractFromCreationBytecode(data);
    let args: Array<[string, DataView | undefined]> | undefined;
    const callee = contractInfo && contractInfo.ast ? contractInfo.ast.vConstructor : undefined;

    if (contractInfo && callee instanceof FunctionDefinition) {
        // TODO: Try and find the arguments inside the creation code and decode them
    }

    return {
        kind: FrameKind.Creation,
        sender,
        msgData: data,
        code: data,
        info: contractInfo,
        callee,
        address: ZERO_ADDRESS,
        startStep: step,
        arguments: args,
        codeMdHash: getCreationCodeHash(data)
    };
}

/**
 * Decode a *CALL* instruction. Computes:
 * 1. The receiver address
 * 2. The code address
 * 3. The msg.data
 * @param step
 */
function decodeCall(step: BasicStepInfo): [Address, Address, Uint8Array] {
    const op = step.op;
    assert(
        op.opcode === OPCODES.CALL ||
            op.opcode === OPCODES.CALLCODE ||
            op.opcode === OPCODES.DELEGATECALL ||
            op.opcode === OPCODES.STATICCALL,
        `Unexpected call instruction {0}`,
        op.mnemonic
    );

    const stackTop = step.evmStack.length - 1;
    const argStackOff = op.opcode === OPCODES.CALL || op.opcode === OPCODES.CALLCODE ? 3 : 2;
    const argSizeStackOff = argStackOff + 1;

    const receiverArg = wordToAddress(step.evmStack[stackTop - 1]);
    const argOff = bigEndianBufToNumber(step.evmStack[stackTop - argStackOff]);
    const argSize = bigEndianBufToNumber(step.evmStack[stackTop - argSizeStackOff]);

    const receiver = op.opcode === OPCODES.DELEGATECALL ? step.address : receiverArg;
    const codeAddr = receiverArg;
    const msgData = step.memory.slice(argOff, argOff + argSize);

    return [receiver, codeAddr, msgData];
}

/**
 * Adds external frame info for each step
 */
export async function addExternalFrame<T extends object & BasicStepInfo>(
    vm: VM,
    step: InterpreterStep,
    state: T,
    trace: Array<T & ExternalFrameInfo>,
    artifactManager: IArtifactManager,
    tx: TypedTransaction
): Promise<T & ExternalFrameInfo> {
    let extFrame: ExternalFrame;

    if (trace.length === 0) {
        const sender = tx.getSenderAddress();

        if (tx.to === undefined) {
            extFrame = makeCreationFrame(sender, tx.data, 0, artifactManager);
        } else {
            const code = await vm.stateManager.getContractCode(tx.to);

            /// @todo remove - arbitrary restriction, only good for debugging
            assert(code.length > 0, "Missing code for address {0}", tx.to.toString());

            const codeHash = getCodeHash(code);

            extFrame = makeCallFrame(
                sender,
                tx.to,
                tx.to,
                tx.data,
                code,
                codeHash,
                0,
                artifactManager
            );
        }

        return {
            extStack: [extFrame],
            ...state
        };
    }

    const lastStep = trace[trace.length - 1];

    if (lastStep.depth === state.depth) {
        return {
            extStack: lastStep.extStack,
            ...state
        };
    }

    const lastStackTop = lastStep.evmStack.length - 1;
    const lastOp = lastStep.op;

    if (state.depth > lastStep.depth) {
        assert(
            state.depth === lastStep.depth + 1,
            `Unexpected depth increase by more than 1 on step {0}`,
            trace.length
        );
        assert(increasesDepth(lastOp), `Unexpected depth increase on op ${lastOp.mnemonic}`);

        if (createsContract(lastOp)) {
            // Contract creation call
            const off = bigEndianBufToNumber(lastStep.evmStack[lastStackTop - 1]);
            const size = bigEndianBufToNumber(lastStep.evmStack[lastStackTop - 2]);
            const creationBytecode = lastStep.memory.slice(off, off + size);

            extFrame = makeCreationFrame(
                lastStep.address,
                creationBytecode,
                trace.length,
                artifactManager
            );
        } else {
            const [receiver, codeAddr, msgData] = decodeCall(lastStep);

            const code = await vm.stateManager.getContractCode(codeAddr);
            const codeHash = getCodeHash(code);

            extFrame = await makeCallFrame(
                lastStep.address,
                receiver,
                codeAddr,
                msgData,
                code,
                codeHash,
                trace.length,
                artifactManager
            );
        }

        return {
            extStack: [...lastStep.extStack, extFrame],
            ...state
        };
    } else {
        const stack = [...lastStep.extStack];
        // External return or exception
        let nFramesPopped = lastStep.depth - state.depth;

        // Pop as many external frames as neccessary to match the decrease in
        // depth reported by web3. We need the loop since we don't count the internal frames as decreasing depth
        while (nFramesPopped > 0 && stack.length > 0) {
            const topFrame = stack[stack.length - 1];

            if (topFrame.kind === FrameKind.Creation || topFrame.kind === FrameKind.Call) {
                nFramesPopped--;
            }

            stack.pop();
        }

        return {
            extStack: stack,
            ...state
        };
    }
}
