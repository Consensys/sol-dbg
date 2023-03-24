import expect from "expect";
import { fastParseBytecodeSourceMapping, parseBytecodeSourceMapping } from "../../src";

const samples: string[] = [
    "29071:3352:71:-:0;;;1572:26:47;;;-1:-1:-1;;1572:26:47;1594:4;1572:26;;;29071:3352:71;;;;;;;;;;;;;;;;",
    "8223:2087:74:-:0;;;8278:61;;;;;;;;;-1:-1:-1;8302:14:74;:30;;-1:-1:-1;;;;;;8302:30:74;8327:4;8302:30;;;8223:2087;;;;;;",
    "23093:1079:71:-:0;;;1572:26:47;;;-1:-1:-1;;1572:26:47;1594:4;1572:26;;;23093:1079:71;;;;;;;;;;;;;;;;",
    "5343:1530:78:-:0;;;;;;;;;;;;;;;;;;;"
];

describe(`Srcmap tests`, () => {
    for (const sample of samples) {
        describe(`Sample ${sample}`, () => {
            it("Fast and slow decoding produce the same results", () => {
                const d1 = parseBytecodeSourceMapping(sample);
                const d2 = fastParseBytecodeSourceMapping(sample);

                expect(d1.length).toEqual(d2.length);

                for (let i = 0; i < d1.length; i++) {
                    /*
                    console.error(
                        `${i}: ref {start ${d1[i].start}, length ${d1[i].length}, sourceIndex ${d1[i].sourceIndex}, jump ${d1[i].jump}}`
                    );
                    console.error(
                        `${i}: fast {start ${d2[i].start}, length ${d2[i].length}, sourceIndex ${d2[i].sourceIndex}, jump ${d2[i].jump}}`
                    );
                    */
                    expect(d1[i].start).toEqual(d2[i].start);
                    expect(d1[i].length).toEqual(d2[i].length);
                    expect(d1[i].jump).toEqual(d2[i].jump);
                    expect(d1[i].sourceIndex).toEqual(d2[i].sourceIndex);
                }
            });
        });
    }
});
