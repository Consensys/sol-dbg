import { Decoder } from "cbor";
import { assert } from "solc-typed-ast";
import { HexString, PartialSolcOutput } from ".";
import { toHexString } from "..";

interface ContractMdStruct {
    // Prior to 0.6.x the swarm hash field was called bzzr0
    bzzr0?: HexString;
    // After 0.6.x the swarm hash field was called ipfs
    ipfs?: HexString;
    // The solc version was included after 0.5.x
    solc?: string;
}

function getBytecodeMdInfoHacky(bytecode: string | Buffer): ContractMdStruct | undefined {
    let rawMd: any;

    if (typeof bytecode === "string") {
        const off = bytecode.lastIndexOf("a264");

        if (off === -1) {
            return undefined;
        }

        rawMd = Decoder.decodeAllSync(bytecode.slice(off), { encoding: "hex" })[0];
    } else {
        let off: number;

        for (
            off = bytecode.length - 2;
            off >= 0 && !(bytecode[off] === 0xa2 && bytecode[off + 1] === 0x64);
            off--
        );

        if (off < 0) {
            return undefined;
        }

        rawMd = Decoder.decodeAllSync(bytecode.slice(off), {})[0];
    }

    const res: ContractMdStruct = {};

    if (rawMd.hasOwnProperty("ipfs")) {
        res.ipfs = toHexString(rawMd.ipfs);
    }

    if (rawMd.hasOwnProperty("bzzr0")) {
        res.bzzr0 = toHexString(rawMd.bzzr);
    }

    if (rawMd.hasOwnProperty("solc")) {
        res.solc = `${rawMd.solc[0]}.${rawMd.solc[1]}.${rawMd.solc[2]}`;
    }

    return res;
}

function getDeployedBytecodeMdInfo(deployedBytecode: string | Buffer): ContractMdStruct {
    const len = deployedBytecode.length;

    let rawMd: any;

    if (typeof deployedBytecode === "string") {
        const off = parseInt(deployedBytecode.substring(len - 4), 16);
        const mdHex = deployedBytecode.substring(len - 4 - off * 2, len - 4);

        rawMd = Decoder.decodeAllSync(mdHex, { encoding: "hex" })[0];
    } else {
        const off = deployedBytecode.readInt16BE(deployedBytecode.length - 2);

        rawMd = Decoder.decodeAllSync(
            deployedBytecode.slice(deployedBytecode.length - 2 - off, deployedBytecode.length - 2),
            {}
        )[0];
    }

    const res: ContractMdStruct = {};

    if (rawMd.hasOwnProperty("ipfs")) {
        res.ipfs = toHexString(rawMd.ipfs);
    }

    if (rawMd.hasOwnProperty("bzzr0")) {
        res.bzzr0 = toHexString(rawMd.bzzr);
    }

    if (rawMd.hasOwnProperty("solc")) {
        res.solc = `${rawMd.solc[0]}.${rawMd.solc[1]}.${rawMd.solc[2]}`;
    }

    return res;
}

export function getCodeHash(deplBytecode: string | Buffer): [string, string] | undefined {
    const md = getDeployedBytecodeMdInfo(deplBytecode);

    if (md.bzzr0 !== undefined) {
        return ["bzzr0", md.bzzr0];
    }

    if (md.ipfs !== undefined) {
        return ["ipfs", md.ipfs];
    }

    return undefined;
}

export function getCreationCodeHash(
    creationBytecode: string | Buffer
): [string, string] | undefined {
    const md = getBytecodeMdInfoHacky(creationBytecode);

    if (md === undefined) {
        return undefined;
    }

    if (md.bzzr0 !== undefined) {
        return ["bzzr0", md.bzzr0];
    }

    if (md.ipfs !== undefined) {
        return ["ipfs", md.ipfs];
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
