import { Message, NetworkNode, WebSocketTransport, RpcServiceManager } from "@diginet/ds-nodes";
import { GridFs } from "@diginet/ds-mongodb";

const node = new NetworkNode("server", new WebSocketTransport("0.0.0.0:7656", true));

node.on("message", (message: Message) => {
    // tslint:disable-next-line:no-console
    console.log(message.toString());
});

const gridFs = new GridFs();
// gridFs.open("browserDb");

const services1 = new RpcServiceManager(node);
services1.addServiceProvider(gridFs);

node.open();
/*
async function db() {
    await gridFs.open("testDb");
    await gridFs.upload("test.txt", "hej svejs!");
}

db();
*/
setInterval(() => {
    // tslint:disable-next-line:no-console
    console.log("tick");
}, 1000);
// tslint:disable-next-line:no-console
console.log("Done");
