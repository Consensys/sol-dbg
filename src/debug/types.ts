import { FunctionDefinition } from "solc-typed-ast";
import { ContractInfo } from "./artifact_manager";

export interface DeployedContractInfo {
    address: string;
    // TODO: Should this be unprefixed?
    code: string;
    info?: ContractInfo;
}

export interface UnknownLocation {
    contract: DeployedContractInfo | undefined;
}

export interface SolLocation {
    contract: DeployedContractInfo | undefined;
    start: number;
    length: number;
    jump: "o" | "i" | "-";
    file: number;
}

export type DecodedSolValue = { value: any; type: string };

export interface StackFrame {
    fun: FunctionDefinition;
    argumentsAtStart: { [argName: string]: DecodedSolValue };
    argsAndLocals: { [varName: string]: DecodedSolValue };
}

export type StackTrace = StackFrame[];
