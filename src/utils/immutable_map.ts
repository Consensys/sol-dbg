export class ImmMap<KeyT, ValT> {
    private innerM: Map<KeyT, ValT>;
    private _next: this | undefined;

    static fromEntries<K, V>(arg: Iterable<[K, V]>): ImmMap<K, V> {
        const res = new ImmMap<K, V>(undefined);

        for (const [k, v] of arg) {
            res.innerM.set(k, v);
        }

        return res;
    }

    static fromImmMap<K, V>(arg: ImmMap<K, V>): ImmMap<K, V> {
        return new ImmMap<K, V>(arg);
    }

    private constructor(next: any = undefined) {
        this.innerM = new Map();
        this._next = next;
    }

    get(key: KeyT): ValT | undefined {
        if (this.innerM.has(key)) {
            return this.innerM.get(key);
        }

        if (this._next === undefined) {
            return undefined;
        }

        const resInNext = this._next.get(key);

        if (resInNext !== undefined) {
            this.innerM.set(key, resInNext);
        }

        return resInNext;
    }

    set(key: KeyT, val: ValT): this {
        const newMap = new ImmMap<KeyT, ValT>(this);

        newMap.innerM.set(key, val);

        return newMap as this;
    }

    setMany(entries: Iterable<[KeyT, ValT]>): this {
        const newMap = new ImmMap<KeyT, ValT>(this);

        for (const [key, val] of entries) {
            newMap.innerM.set(key, val);
        }

        return newMap as this;
    }

    private collectMap(): Map<KeyT, ValT> {
        const res = this._next ? this._next.collectMap() : new Map();

        for (const [key, val] of this.innerM) {
            res.set(key, val);
        }

        return res;
    }

    entries(): Iterable<[KeyT, ValT]> {
        return this.collectMap();
    }
}
