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
 * Return a concatenation of the Uint8Array arguments.
 */
export function uint8ArrConcat(...args: Uint8Array[]): Uint8Array {
    const len = args.reduce((a, b) => a + b.length, 0);
    const res = new Uint8Array(len);
    let idx = 0;
    for (const arr of args) {
        res.set(arr, idx);
        idx += arr.length;
    }

    return res;
}
