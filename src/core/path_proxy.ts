import * as realPath from 'path';

class ProxyObj { [key: string]: any }

export interface Path {
    sep: string;
    dirname(p: string): string;
    join(...paths: string[]): string;
    resolve(p: string): string;
}

export const path: Path = new Proxy(new ProxyObj(), {
    get: (obj, prop: string) => {
        if (prop === "dirname") {
            return realPath.dirname;
        } else if (prop === "sep") {
            return realPath.sep;
        } else if (prop === "join") {
            return realPath.join;
        } else if (prop === "resolve") {
            // Avoid resolving eg "/folder/file.txt" to "C:\folder\file.txt"
            return (p: string) => p;
        } else {
            return (realPath as { [key: string]: any; })[prop];
        }
    }
}) as Path;
