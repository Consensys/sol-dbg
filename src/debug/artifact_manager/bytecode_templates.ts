import { equalsBytes, hexToBytes } from "@ethereumjs/util";
import { PartialBytecodeDescription, RangeList } from "../../artifacts";

export interface BytecodeTemplate {
    object: Uint8Array;
    skipRanges: Array<[number, number]>;
}

function makeSkipRanges(rawList: RangeList): Array<[number, number]> {
    return rawList.map((raw) => [raw.start, raw.start + raw.length]);
}

export function makeTemplate(artifact: PartialBytecodeDescription): BytecodeTemplate {
    const skipRanges: Array<[number, number]> = [];

    if (artifact.linkReferences) {
        for (const obj of Object.values(artifact.linkReferences)) {
            for (const ranges of Object.values(obj)) {
                skipRanges.push(...makeSkipRanges(ranges));
            }
        }
    }

    if (artifact.immutableReferences) {
        for (const ranges of Object.values(artifact.immutableReferences)) {
            skipRanges.push(...makeSkipRanges(ranges));
        }
    }

    skipRanges.sort();

    return {
        object: hexToBytes("0x" + artifact.object),
        skipRanges
    };
}

export function matchesTemplate(bytecode: Uint8Array, template: BytecodeTemplate): boolean {
    if (bytecode.length !== template.object.length) {
        return false;
    }

    let curIdx = 0;
    let rangeIdx = 0;

    while (curIdx < template.object.length) {
        let nextIdx: number;
        let compEnd: number;

        if (rangeIdx < template.skipRanges.length) {
            [compEnd, nextIdx] = template.skipRanges[rangeIdx];
        } else {
            compEnd = nextIdx = template.object.length;
        }

        if (!equalsBytes(bytecode.slice(curIdx, compEnd), template.object.slice(curIdx, compEnd))) {
            return false;
        }

        curIdx = nextIdx;
        rangeIdx++;
    }

    return true;
}
