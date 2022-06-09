// TODO: This code was copied from Scribble. Should reduce code duplication.
export type DecodedBytecodeSourceMapEntry = {
    start: number;
    length: number;
    sourceIndex: number;
    jump: "i" | "o" | "-" | undefined;
};

export function parseBytecodeSourceMapping(sourceMap: string): DecodedBytecodeSourceMapEntry[] {
    return sourceMap
        .split(";")
        .map((chunk) => chunk.split(":"))
        .map(([start, length, sourceIndex, jump]) => ({
            start: start === "" ? undefined : start,
            length: length === "" ? undefined : length,
            sourceIndex: sourceIndex === "" ? undefined : sourceIndex,
            jump: jump === "" ? undefined : jump
        }))
        .reduce(
            ([previous, ...all], entry) => [
                {
                    start: parseInt(entry.start || previous.start, 10),
                    length: parseInt(entry.length || previous.length, 10),
                    sourceIndex: parseInt(entry.sourceIndex || previous.sourceIndex, 10),
                    jump: entry.jump || previous.jump
                },
                previous,
                ...all
            ],
            [{} as any]
        )
        .reverse()
        .slice(1);
}
