/**
 * Destructively add set B to set A
 */
export function set_add<T>(A: Set<T>, B: Set<T>): void {
    for (const el of B) {
        A.add(el);
    }
}

/**
 * Destructively subtract set B from set A
 */
export function set_subtract<T>(A: Set<T>, B: Set<T>): void {
    for (const el of B) {
        A.delete(el);
    }
}
