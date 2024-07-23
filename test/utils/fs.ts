import { join } from "path";

const fse = require("fs-extra");

export function ls(dir: string, ext: string): string[] {
    return fse
        .readdirSync(dir)
        .filter((name: string) => name.endsWith(ext))
        .map((name: string) => join(dir, name));
}

export function lsJson(path: string): string[] {
    return ls(path, ".json");
}
