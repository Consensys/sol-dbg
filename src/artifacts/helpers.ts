import { Decoder } from "cbor";
import { assert } from "solc-typed-ast";
import { HexString, PartialSolcOutput, UnprefixedHexString } from "./solc";
import { bytesToHex, toBytes } from "@ethereumjs/util";

interface ContractMdStruct {
    // bzzr0 hash
    bzzr0?: HexString;
    // bzzr1 hash
    bzzr1?: HexString;
    // ipfs hash
    ipfs?: HexString;
    // The solc version was included after 0.5.x
    solc?: string;
    // Are experimental features enabled?
    experimental?: boolean;
}

function getAllStringsAfterPrefix(hay: string, prefix: string, expLen: number): string[] {
    const res: string[] = [];

    let off = hay.length;

    while (true) {
        off = hay.lastIndexOf(prefix, off - 1);

        if (off === -1) {
            return res;
        }

        if (off + prefix.length + expLen >= hay.length) {
            continue;
        }

        res.push(hay.slice(off + prefix.length, off + prefix.length + expLen));
    }
}

const ipfsStrPrefix = "64697066735822";
const bzzr0 = "65627a7a72305820";
const bzzr1 = "65627a7a72315820";

function getBytecodeHashHacky(bytecode: string | Uint8Array): ContractMdStruct | undefined {
    if (bytecode instanceof Uint8Array) {
        bytecode = bytesToHex(bytecode);
    }

    const ipfsCandidates = new Set(getAllStringsAfterPrefix(bytecode, ipfsStrPrefix, 34));
    const bzzr0Candidates = new Set(getAllStringsAfterPrefix(bytecode, bzzr0, 32));
    const bzzr1Candidates = new Set(getAllStringsAfterPrefix(bytecode, bzzr1, 32));

    if (ipfsCandidates.size + bzzr0Candidates.size + bzzr1Candidates.size !== 1) {
        return undefined;
    }

    if (ipfsCandidates.size === 1) {
        return { ipfs: [...ipfsCandidates][0] };
    }

    if (bzzr0Candidates.size === 1) {
        return { bzzr0: [...bzzr0Candidates][0] };
    }

    return { bzzr1: [...bzzr1Candidates][0] };
}

function getDeployedBytecodeMdInfo(
    deployedBytecode: UnprefixedHexString | Uint8Array
): ContractMdStruct {
    if (deployedBytecode instanceof Uint8Array) {
        deployedBytecode = bytesToHex(deployedBytecode);
    }

    const len = deployedBytecode.length;

    let rawMd: any = {};

    try {
        const off = parseInt(deployedBytecode.substring(len - 4), 16);
        const mdHex = deployedBytecode.substring(len - 4 - off * 2, len - 4);

        rawMd = Decoder.decodeAllSync(mdHex, { encoding: "hex" })[0];
    } catch {
        // The contract bytecode may not have metadata, which would result in random crashes in the decoder.
        // Catch those so we don't end up crashing in the absence of metadata.
    }

    const res: ContractMdStruct = {};

    if (rawMd.hasOwnProperty("ipfs")) {
        res.ipfs = bytesToHex(toBytes(rawMd.ipfs));
    }

    if (rawMd.hasOwnProperty("bzzr0")) {
        res.bzzr0 = bytesToHex(toBytes(rawMd.bzzr));
    }

    if (rawMd.hasOwnProperty("bzzr1")) {
        res.bzzr1 = bytesToHex(toBytes(rawMd.bzzr1));
    }

    if (rawMd.hasOwnProperty("experimental")) {
        res.experimental = rawMd.experimental;
    }

    if (rawMd.hasOwnProperty("solc")) {
        res.solc = `${rawMd.solc[0]}.${rawMd.solc[1]}.${rawMd.solc[2]}`;
    }

    return res;
}

export function getCodeHash(deplBytecode: UnprefixedHexString | Uint8Array): HexString | undefined {
    const md = getDeployedBytecodeMdInfo(deplBytecode);

    // TODO: Should we prefix the hash with the hash type? bzzr0/ipfs
    if (md.bzzr0 !== undefined) {
        return md.bzzr0;
    }

    if (md.bzzr1 !== undefined) {
        return md.bzzr1;
    }

    if (md.ipfs !== undefined) {
        return md.ipfs;
    }

    return undefined;
}

export function getCreationCodeHash(
    creationBytecode: UnprefixedHexString | Uint8Array
): HexString | undefined {
    const md = getBytecodeHashHacky(creationBytecode);

    if (md === undefined) {
        return undefined;
    }

    // TODO: Should we prefix the hash with the hash type? bzzr0/ipfs
    if (md.bzzr0 !== undefined) {
        return md.bzzr0;
    }

    if (md.ipfs !== undefined) {
        return md.ipfs;
    }

    return undefined;
}

/**
 * Given a standard solc JSON output `artifact` find the compiler version used
 * to compute the contracts.  We do this by walking over all of the bytecodes in
 * the artifact, and decoding the CBOR-encoded metadata at the end of each
 * contract. If all contracts in the artifact agree on the version they report,
 * we return that.
 */
export function getArtifactCompilerVersion(artifact: PartialSolcOutput): string | undefined {
    let res: string | undefined;

    for (const fileName in artifact.contracts) {
        for (const contractName in artifact.contracts[fileName]) {
            const version = getDeployedBytecodeMdInfo(
                artifact.contracts[fileName][contractName].evm.deployedBytecode.object
            ).solc;

            assert(
                !(version !== undefined && res !== undefined && version !== res),
                `Unexpected different compiler versions in the same artifact: ${version} and ${res}`
            );

            res = version;
        }
    }

    return res;
}

export function isPartialSolcOutput(arg: any): arg is PartialSolcOutput {
    return arg.hasOwnProperty("contracts") && arg.hasOwnProperty("sources");
}
