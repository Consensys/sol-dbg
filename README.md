[![NodeJS CI](https://github.com/ConsenSys/sol-dbg/actions/workflows/node.js.yml/badge.svg)](https://github.com/ConsenSys/sol-dbg/actions/workflows/node.js.yml)
[![Coverage](https://codecov.io/gh/ConsenSys/sol-dbg/branch/main/graph/badge.svg)](https://codecov.io/gh/ConsenSys/sol-dbg)
[![npm](https://img.shields.io/npm/v/sol-dbg)](https://www.npmjs.com/package/sol-dbg)
[![npm downloads](https://img.shields.io/npm/dm/sol-dbg.svg)](https://www.npmjs.com/package/sol-dbg)
[![License: Apache V2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

# sol-dbg

[WIP] Small Solidity-level source debugger built around EthereumJS. This is largely inspired by the remix-debugger. The main difference is that its built to work with incomplete debugging information, and it uses the [solc-typed-ast](https://github.com/ConsenSys/solc-typed-ast) library for dealing with ASTs.

Warning: This is still a work in progress, so expect bugs!

Currently the debugger gets a trace from the EthereumJS VM, and for each step of the trace tries to compute:

0. Code currently executing and metadata hash for the currently executing code (including creation bytecodes)
1. The current contract compilation artifact (if one is available).
2. The source location corresponding to the current step (if a source map is available for the given contract).
3. The exact AST node that maps to the current step (if ASTs are given).
4. Whether any event is emitted at this step.
5. The solidity-level stack trace corresponding to the current step. Note that this stack trace will include both internal and external functions. If we don't have information for some contract in the current call stack, then for that contract we will specify a single "external" call frame, and skip any internal functions. The stack trace contains the decoded function arguments as well.

The main part missing to make this a full-fledged debugger is stack-map inference and computing the values of locals.

# Quickstart

To use the debugger you need 3 things:

1. The state of the EthereumJS before the problematic transaction. This can be obtained by calling `vm.stateManager.copy()` right before it's executed. For example on keeping track of this state check out the  [VMTestRunner](https://github.com/ConsenSys/sol-dbg/blob/main/test/utils/test_runner.ts#L81) class.

2. The actual failing `Transaction` and the `Block` in which you wish it to be replayed. These can be built by calling(where the ... are standard JSON descriptions of the tx/block):

```typescript
const tx = new Transaction({....});
const block = Block.fromBlockData({...});
```

3. Call the debugger to obtain a trace of the steps, and then work with the trace:

```typescript
// Call debugTx to get the computed high-level trace
const trace = await solDbg.debugTx(tx, block, stateBefore);

// Print the stack trace at each step:
for (const step of trace) {
    console.log(`Stack trace at pc ${step.pc}:`);

    for(const frame of step) {
        const funName = frame.callee instanceof FunctionDefinition ? frame.callee.name : "<unknown-function>";

        console.log(`${step.address.toString()}:${funName}`);
    }
}
```

# Step Info

The type of each step of the trace is `StepState`, and contains the following information:

```typescript
export interface StepState {
    // The raw EVM stack
    evmStack: Stack;
    // The current state of the memory (as a Buffer)
    memory: Memory;
    // The current storage
    storage: Storage;
    // Information about the current op (opcode, mnemonic, etc)
    op: EVMOpInfo;
    // Current PC
    pc: number;
    // Gas cost of the current instruction
    gasCost: bigint;
    // Dynamic gas cost of the current instruction
    dynamicGasCost: bigint;
    // Remaining gas
    gas: bigint;
    // The external call depth of the stack
    depth: number;
    // Address of the currently executing contract
    address: Address;
    // Address of the CODE which is currently executing (different from address in the case of DELEGATECALL)
    codeAddress: Address;
    // The code that is currently executing
    code: Buffer;
    // Hash of the metadata embedded by the Solidity compiler in the end of the bytecode
    codeHash: HexString;
    // The solidity-level stack trace
    stack: DbgStack;
    // The source code location corresponding to the current opcode
    src: DecodedBytecodeSourceMapEntry | undefined;
    // The AST node corresponding to the current instruction (if ASTs are present)
    astNode: ASTNode | undefined;
    // If an event is emitted by this instruction, the event payload and topics
    emittedEvent: EventDesc | undefined;
    // General information about the given contract (if we have a compiler artifact for it). May contain name, code, sourcemaps, ASTs, metadata /// hash, etc.
    contractInfo: ContractInfo | undefined;
}
```

# Stack Traces

A stack trace is a list of stack frames. There are 2 kinds of stack frames - an `ExternalFrame` and an `InternalCallFrame`. As the name suggests, an `ExternalCall` frame corresponds to an external call, and an `InternalCallFrame` corresponds to a call for an internal function in a contract.

All frames have an optional `callee` field, which is either an `ASTNode` or `undefined`. `callee` is `undefined` when we don't have enough debugging information to determine the target of this call. Otherwise it's the `ASTNode` that corresponds to this call. This is usually a `FunctionDefinition`, but can sometimes be other nodes. For example when calling a public state variable getter the `callee` is a `VariableDeclaration`. When calling an implicit constructor of a contract, the `callee` will be a `ContractDefinition`. Also we are planning on adding support for recognizing compiler-generated functions, in which case the `callee` will be a `YulFunctionDefinition`.

All frames have an optional `arguments` field, with any decoded Solidity-level arguments. Note that the debugger will do its best to decode as many arguments as possible, and will attempt to decode an argument even if some other arguments fail. Arguments decoding may fail due to missing debugging information, in which case either the whole `arguments` array, or some entries in it may be undefined.

Finally note that for a given external call `Contract.Function()` we will have both an `ExternalFrame` for `Contract.Function()` and an internal frame for `Contract.Function()` (if we have enough debug info). It's up to the users of this library to filter out those duplicates.
