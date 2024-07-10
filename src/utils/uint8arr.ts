/**
 * Return True IFF a equals b.
 */
export function uint8ArrEq(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i] != b[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Return the unprefixed hex representation of a
 */
export function uint8ArrToHexString(a: Uint8Array): string {
    // TODO: This can be optimized if we spend a lot of time here
    return Array.from(a)
        .map((i) => i.toString(16).padStart(2, "0"))
        .join("");
}

export function uint8ArrConcat(...args: Uint8Array[]): Uint8Array {
    if (args.length === 0) {
        return new Uint8Array(0);
    }

    if (args.length === 1) {
        return args[0];
    }

    const len = args.reduce((a, b) => a + b.length, 0);
    const res = new Uint8Array(len);
    let idx = 0;
    for (const arr of args) {
        res.set(arr, idx);
        idx += arr.length;
    }

    return res;
}
