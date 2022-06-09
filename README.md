[![NodeJS CI](https://github.com/ConsenSys/sol-dbg/actions/workflows/node.js.yml/badge.svg)](https://github.com/ConsenSys/sol-dbg/actions/workflows/node.js.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

# sol-dbg

Small Solidity-level source debugger built around EthereumJS. This is largely inspired by the remix-debugger. The main difference is that its built to work with incomplete debugging information, and it uses the solc-typed-ast library for dealing with ASTs.

Currently the debugger gets a trace from the EthereumJS VM, and for each step of the trace tries to compute:

1. The current contract compilation artifact (if one is available)
2. The source location corresponding to the current step (if a source map is available for the given contract)
3. The exact AST node that maps to the current step (if ASTs are given)
4. Whether any event is emitted at this step
5. The solidity-level stack trace corresponding to the current step. Note that this stack trace will include both internal and external functions. If we don't have information for some contract in the current call stack, then for that contract we will specify a single "external" call frame, and skip any internal functions. The stack trace contains the decoded function arguments as well.

The main part missing to make this a full-fledged debugger is stack-map inference.

# Quckstart

You can use the debugger as follows:

```
// Instantiate the debugger
const artifacts = [ ... list of standard Solc JSON outputs for the contracts we are debugging ... ]
const artifactManager = new ArtifactManager(artifacts);
const solDbg = new SolTxDebugger(artifactManager);

// First run a transaction against the internal VM in the debugger
const block = Block.fromBlockData({...});
const tx = new Transaction({....});
const stateBefore = solDbg.vm.stateManager.copy();

solDbg.web3.runTx({tx, block});

// Call debugTx to get the computed high-level trace
const trace = await solDbg.debugTx(tx, block, stateBefore);

// Print the stack trace at each step:
for (const step of trace) {
    console.log(`Stack trace at pc ${step.pc}:`);
    for(const frame of step) {
        const funName = frame.callee instanceof FunctionDefinition ? frame.callee.name : "<unknown-function>"
        console.log(`${step.address.toString()}:${funName}`);
    }
}
```

# Step Info

The type of each step of the trace is `StepState`, and contains the following information:

```
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
    // The solidity-level stack trace
    stack: DbgStack;
    // The source code location corresponding to the current opcode
    src: DecodedBytecodeSourceMapEntry | undefined;
    // The AST node corresponding to the current instruction (if ASTs are present)
    astNode: ASTNode | undefined;
    // If an event is emitted by this instruction, the event payload and topics
    emittedEvent: EventDesc | undefined;
    // General information about the given contract (if we have a compiler artifact for it). May contain name, code , sourcemaps, ASTs, metadata /// hash, etc.
    contractInfo: ContractInfo | undefined;
}
```

# Stack Traces

TODO