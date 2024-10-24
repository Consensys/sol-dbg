import { InterpreterStep } from "@ethereumjs/evm";
import { VM } from "@ethereumjs/vm";

export type TransformerF<T extends object, T1 extends T> = (
    vm: VM,
    step: InterpreterStep,
    state: T,
    trace: T1[]
) => T1;

export * from "./basic_info";
export * from "./contract_lifetime";
export * from "./events";
export * from "./ext_stack";
export * from "./int_stack";
export * from "./keccak256_invert";
export * from "./op";
export * from "./ret_info";
export * from "./source";
