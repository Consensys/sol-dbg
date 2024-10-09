import { Decoder } from "cbor";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";
import { assert, isExact } from "solc-typed-ast";
import { readInt16Be, toHexString } from "..";
import { HexString, PartialSolcOutput, UnprefixedHexString } from "./solc";

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

/**
 * Find the last (right-most) index in hay where `needle` appears. If `off` is specified, search before `off` (`off` inclusive).
 * If `needle` is not found, return -1;
 */
function lastIndexOfArr(hay: Uint8Array, needle: Uint8Array, off: number | undefined): number {
    assert(needle.length > 0, ``);
    let res = hay.length - 1;
    res = off != undefined ? Math.min(off, res) : res;

    while (res >= 0) {
        res = hay.lastIndexOf(needle[0], res);

        if (res < 0) {
            break;
        }

        if (res + needle.length > hay.length) {
            res--;
            continue;
        }

        let match = true;
        for (let i = 1; i < needle.length; i++) {
            if (hay[res + i] !== needle[i]) {
                match = false;
                break;
            }
        }

        if (match) {
            break;
        }

        res--;
    }

    return res;
}

function getAllBuffersAfterPrefix(
    hay: Uint8Array,
    prefix: Uint8Array,
    expLen: number
): Uint8Array[] {
    const res: Uint8Array[] = [];

    let off = hay.length;

    while (true) {
        off = lastIndexOfArr(hay, prefix, off - 1);

        if (off < 0) {
            return res;
        }

        if (off + prefix.length + expLen >= hay.length) {
            continue;
        }

        res.push(hay.slice(off + prefix.length, off + prefix.length + expLen));
    }
}

const ipfsStrPrefix = "64697066735822";
const ipfsBufPrefix = hexToBytes(ipfsStrPrefix);
const bzzr0 = "65627a7a72305820";
const bzzr0BufPrefix = hexToBytes(bzzr0);
const bzzr1 = "65627a7a72315820";
const bzzr1BufPrefix = hexToBytes(bzzr1);

function getBytecodeHashHacky(bytecode: string | Uint8Array): ContractMdStruct | undefined {
    if (typeof bytecode === "string") {
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
    } else {
        const ipfsCandidates = new Set(getAllBuffersAfterPrefix(bytecode, ipfsBufPrefix, 34));
        const bzzr0Candidates = new Set(getAllBuffersAfterPrefix(bytecode, bzzr0BufPrefix, 32));
        const bzzr1Candidates = new Set(getAllBuffersAfterPrefix(bytecode, bzzr1BufPrefix, 32));

        if (ipfsCandidates.size + bzzr0Candidates.size + bzzr1Candidates.size !== 1) {
            return undefined;
        }

        if (ipfsCandidates.size === 1) {
            return { ipfs: "0x" + bytesToHex([...ipfsCandidates][0]) };
        }

        if (bzzr0Candidates.size === 1) {
            return { bzzr0: "0x" + bytesToHex([...bzzr0Candidates][0]) };
        }

        return { bzzr1: "0x" + bytesToHex([...bzzr1Candidates][0]) };
    }
}

function getDeployedBytecodeMdInfo(
    deployedBytecode: UnprefixedHexString | Uint8Array
): ContractMdStruct | undefined {
    const len = deployedBytecode.length;

    let rawMd: any = {};

    try {
        if (typeof deployedBytecode === "string") {
            const off = parseInt(deployedBytecode.substring(len - 4), 16);
            const mdHex = deployedBytecode.substring(len - 4 - off * 2, len - 4);

            rawMd = Decoder.decodeAllSync(mdHex, { encoding: "hex" })[0];
        } else {
            const off = readInt16Be(deployedBytecode, deployedBytecode.length - 2);

            rawMd = Decoder.decodeAllSync(
                deployedBytecode.slice(
                    deployedBytecode.length - 2 - off,
                    deployedBytecode.length - 2
                ),
                {}
            )[0];
        }
    } catch {
        // The contract bytecode may not have metadata, which would result in random crashes in the decoder.
        // Catch those so we don't end up crashing in the absence of metadata.
        return undefined;
    }

    if (rawMd === undefined) {
        return undefined;
    }

    const res: ContractMdStruct = {};

    if (rawMd.hasOwnProperty("ipfs")) {
        res.ipfs = toHexString(rawMd.ipfs);
    }

    if (rawMd.hasOwnProperty("bzzr0")) {
        res.bzzr0 = toHexString(rawMd.bzzr0);
    }

    if (rawMd.hasOwnProperty("bzzr1")) {
        res.bzzr1 = toHexString(rawMd.bzzr1);
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

    if (!md) {
        return undefined;
    }

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

const longVersion = /([0-9]+\.[0-9]+\.[0-9]+)\+.*/;

/**
 * Given a standard solc JSON output `artifact` find the compiler version used
 * to compute the contracts.  We do this by walking over all of the bytecodes in
 * the artifact, and decoding the CBOR-encoded metadata at the end of each
 * contract. If all contracts in the artifact agree on the version they report,
 * we return that.
 */
export function detectArtifactCompilerVersion(artifact: PartialSolcOutput): string | undefined {
    for (const fileName in artifact.contracts) {
        for (const contractName in artifact.contracts[fileName]) {
            const contractArtifact = artifact.contracts[fileName][contractName];

            if (contractArtifact.evm.deployedBytecode.object.length === 0) {
                continue;
            }

            const md = getDeployedBytecodeMdInfo(contractArtifact.evm.deployedBytecode.object);

            if (md !== undefined && md.solc !== undefined) {
                return md.solc;
            }

            if (contractArtifact.metadata === undefined) {
                continue;
            }

            try {
                const mdJson = JSON.parse(contractArtifact.metadata);

                if (mdJson.compiler && mdJson.compiler.version) {
                    if (isExact(mdJson.compiler.version)) {
                        return mdJson.compiler.version;
                    }

                    const m = mdJson.compiler.version.match(longVersion);

                    if (m !== null) {
                        return m[1];
                    }
                }
            } catch (e) {
                // Nothing to do;
                console.error(e); // @todo remove
            }
        }
    }

    return undefined;
}

export function isPartialSolcOutput(arg: any): arg is PartialSolcOutput {
    return arg.hasOwnProperty("contracts") && arg.hasOwnProperty("sources");
}
