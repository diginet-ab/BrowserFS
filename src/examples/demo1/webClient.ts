import "babel-polyfill";
import { NetworkNode, BrowserWebSocketTransport } from "@diginet/ds-nodes";
import * as BrowserFS from "../../../src/core/browserfs";

const node = new NetworkNode("webClient", new BrowserWebSocketTransport(window.location.host.split(":")[0] + ":7656", false));

setInterval(() => {
    // node.emit("sendMessage", "Hello")
    node.send("Hello", "server");
}, 2000);

// Installs globals onto window:
// * Buffer
// * require (monkey-patches if already defined)
// * process
// You can pass in an arbitrary object if you do not wish to pollute
// the global namespace.
BrowserFS.install(window);
// Configures BrowserFS to use the LocalStorage file system.

BrowserFS.configure({
    fs: "MountableFileSystem",
    options: {
        "/local": {
            fs: "LocalStorage",
            options: {
                partition: "A"
            }
        },
        "/local2": {
            fs: "LocalStorage",
            options: {
                partition: "B"
            }
        },
        "/local3": {
            fs: "LocalStorage"
        },
/*        
        "/local4": {
            fs: "AsyncMirror",
            options: {
                sync: { fs: "LocalStorage" },
                async: {
                    fs: "GridFsFileSystem",
                    options: {
                        storeName: "HelloFileSystem",
                        host: "127.0.0.1",
                        networkNode: "server",
                        port: 7656,
                        databaseName: "myBrowserDb",
                        transport: BrowserWebSocketTransport
                    }
                }
            },
        }
*/        
        "/local4": {
            fs: "GridFsFileSystem",
            // fs: "LocalStorage",
            options: {
                storeName: "HelloFileSystem",
                host: "127.0.0.1",
                networkNode: "server",
                port: 7656,
                databaseName: "myBrowserDb"
            }
        }
    }
}, function(e) {
    if (e) {
        // An error happened!
        throw e;
    }
    // Otherwise, BrowserFS is ready-to-use!
    // setTimeout(async () => {

    // Otherwise, BrowserFS is ready-to-use!
    const fs = BrowserFS.BFSRequire("fs");
    // const path = require('path');
    fs.writeFileSync("/local2/hejsan.ts", "hello world");
    fs.writeFileSync("/local3/hejdå.ts", "hej där");
    // fs.writeFileSync("/local4/testing.txt", "Fil i GridFS???");
    // const s = fs.readFileSync("/local4/testing.txt", "utf8");
    // tslint:disable-next-line:no-console
    // console.log(s);
    fs.writeFile('/local4/test.txt', 'Cool, I can do this in the browser!', function(err) {
        fs.readFile('/local4/test.txt', function(e, rv?: Buffer) {
            if (err) {
                // tslint:disable-next-line:no-console
                console.log("Error: " + err.message);
                const p = document.createElement("p");
                p.innerHTML = err.message;
                const container = document.getElementById("container");
                if (container) {
                    container.appendChild(p);
                }
            } else if (rv) {
                // tslint:disable-next-line:no-console
                console.log(rv.toString());
                const p = document.createElement("p");
                p.innerHTML = rv.toString();
                const container = document.getElementById("container");
                if (container) {
                    container.appendChild(p);
                }
            }
        });
/*
        const files = fs.readdirSync("/");
        // tslint:disable-next-line:no-console
        console.log(files);

        function readDirR(dir: string) {
            return fs.statSync(dir).isDirectory() ?
                Array.prototype.concat(...fs.readdirSync(dir).map((f: string) => readDirR(path.join(dir, f)))) :
                dir;
        }
        const r = readDirR("/");
        // tslint:disable-next-line:no-console
        console.log(r);

        fs.readFile('/local/test.txt', function(err: Error, contents: any) {
            // tslint:disable-next-line:no-console
            console.log(contents.toString());
        });
        fs.readFile('/local2/hejsan.ts', function(err: Error, contents: any) {
            // tslint:disable-next-line:no-console
            console.log(contents.toString());
        });
        fs.readFile('/local3/hejdå.ts', function(err: Error, contents: any) {
            // tslint:disable-next-line:no-console
            console.log(contents.toString());
        });
        */
    });
});
/*
BrowserFS.configure({
    fs: "GridFsFileSystem",
    options: {
        storeName: "HelloFileSystem",
        host: "127.0.0.1",
        networkNode: "server",
        port: 7656,
        databaseName: "myBrowserDb"
    }
}, function(e) {
    if (e) {
        // An error happened!
        throw e;
    }
    // }, 1000);
});
*/
