/**
 * Destructively add all entries from map B to map A
 */
export function map_add<K, V>(A: Map<K, V>, B: Map<K, V>): void {
    for (const [k, v] of B) {
        A.set(k, v);
    }
}
