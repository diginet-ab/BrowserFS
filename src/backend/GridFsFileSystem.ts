import { BFSOneArgCallback, BFSCallback, FileSystemOptions } from "../core/file_system";
import { AsyncKeyValueROTransaction, AsyncKeyValueRWTransaction, AsyncKeyValueStore, AsyncKeyValueFileSystem } from "../generic/key_value_filesystem";
import { ApiError, ErrorCode } from "../core/api_error";
import { GridFs } from "@diginet/ds-mongodb";
import { RpcClient, NetworkNode, BrowserWebSocketTransport, Transport } from "@diginet/ds-nodes";
import { v4 as uuidv4 } from "uuid";

/**
 * Converts a Exception or a Error from an MongoDB event into a
 * standardized BrowserFS API error.
 * @hidden
 */

/*
function convertError(e: {name: string}, message: string = e.toString()): ApiError {
 switch (e.name) {
   case "NotFoundError":
     return new ApiError(ErrorCode.ENOENT, message);
   case "QuotaExceededError":
     return new ApiError(ErrorCode.ENOSPC, message);
   default:
     // The rest do not seem to map cleanly to standard error codes.
     return new ApiError(ErrorCode.EIO, message);
 }
}
*/

function convertPath(inData: string): string {
  return inData.replace("/", "!");
}
/**
 * Produces a new onerror handler for MongoDB. Our errors are always fatal, so we
 * handle them generically: Call the user-supplied callback with a translated
 * version of the error, and let the error bubble up.
 * @hidden
 */
/*
function onErrorHandler(cb: (e: ApiError) => void, code: ErrorCode = ErrorCode.EIO, message: string | null = null): (e?: any) => void {
  return function(e?: any): void {
    // Prevent the error from canceling the transaction.
    e.preventDefault();
    cb(new ApiError(code, message !== null ? message : undefined));
  };
}
*/
/**
 * @hidden
 */
export class MongoDBROTransaction implements AsyncKeyValueROTransaction {
  constructor(public store: GridFs) { }

  public get(key: string, cb: BFSCallback<Buffer>): void {
    this.store.fileExists(convertPath(key)).then((value) => {
      if (value) {
        this.store.download(convertPath(key)).then((value) => {
          cb(null, value);
        }).catch((reason) => {
          cb(null, undefined);
        });
      } else {
        cb(null, undefined);
      }
    }).catch((reason) => {
      cb(null, undefined);
    });
  }
}

/**
 * @hidden
 */
export class MongoDBRWTransaction extends MongoDBROTransaction implements AsyncKeyValueRWTransaction, AsyncKeyValueROTransaction {
  constructor(store: GridFs) {
    super(store);
  }

  public put(key: string, data: Buffer, overwrite: boolean, cb: BFSCallback<boolean>): void {
    this.store.upload(convertPath(key), data).then((result) => {
      cb(null, result);
    }).catch((reason) => {
      cb(null, undefined);
    });
  }

  public del(key: string, cb: BFSOneArgCallback): void {
    this.store.deleteFile(convertPath(key)).then((result) => {
      cb();
    }).catch((reason) => {
      cb();
    });
  }

  public commit(cb: BFSOneArgCallback): void {
    // Return to the event loop to commit the transaction.
    setTimeout(cb, 0);
  }

  public abort(cb: BFSOneArgCallback): void {
    cb(null);
  }
}

export class MongoDBStore implements AsyncKeyValueStore {
  constructor(private storeName: string, private db: GridFs) {
  }

  public name(): string {
    return GridFsFileSystem.Name + " - " + this.storeName;
  }

  public clear(cb: BFSOneArgCallback): void {
    // Use setTimeout to commit transaction.
    setTimeout(cb, 0);
  }

  public beginTransaction(type: 'readonly'): AsyncKeyValueROTransaction;
  public beginTransaction(type: 'readwrite'): AsyncKeyValueRWTransaction;
  public beginTransaction(type: 'readonly' | 'readwrite' = 'readonly'): AsyncKeyValueROTransaction {
    if (type === 'readwrite') {
      return new MongoDBRWTransaction(this.db);
    } else if (type === 'readonly') {
      return new MongoDBROTransaction(this.db);
    } else {
      throw new ApiError(ErrorCode.EINVAL, "Invalid transaction type.");
    }
  }
}

/**
 * Configuration options for the MongoDB file system.
 */
export interface GridFSOptions {
  // The name of this file system. You can have multiple MongoDB file systems operating
  // at once, but each must have a different name.
  storeName?: string;
  // The server providing ds-nodes network access (defaults to web server host = window.location.host excluding any port)
  host: string;
  // The port of ds-nodes server
  port: number;
  // The name of the MongoDB database, defaults to browserFsDb.
  databaseName: string;
  // The name of the ds-nodes network node providing the GridFs RPC service
  networkNode: string;
  // The size of the inode cache. Defaults to 100. A size of 0 or below disables caching.
  cacheSize?: number;
  // Transport class to use
  transport: typeof Transport;
}

/**
 * A file system that uses the MongoDB key value file system.
 */
export class GridFsFileSystem extends AsyncKeyValueFileSystem {
  public static readonly Name = "GridFS";
  public static readonly Options: FileSystemOptions = {
    storeName: {
      type: "string",
      optional: true,
      description: "The name of this file system. You can have multiple GridFS file systems operating at once, but each must have a different name."
    },
    host: {
      type: "string",
      optional: true,
      description: "The server providing ds-nodes WebSocket access."
    },
    port: {
      type: "number",
      optional: false,
      description: "The port for the server providing ds-nodes WebSocket access."
    },
    networkNode: {
      type: "string",
      optional: true,
      description: "The ds-nodes server providing the GridFs RPC service."
    },
    databaseName: {
      type: "string",
      optional: true,
      description: "The MongoDB database name, defaults to browserFsDb."
    },
    cacheSize: {
      type: "number",
      optional: true,
      description: "The size of the inode cache. Defaults to 100. A size of 0 or below disables caching."
    },
    transport: {
      type: "function",
      optional: true,
      description: "Transport type to use."
    }
  };

  /**
   * Constructs an MongoDB file system with the given options.
   */
  public static async Create(opts: GridFSOptions, cb: BFSCallback<GridFsFileSystem>) {
    try {
      const gfs = new GridFsFileSystem(typeof (opts.cacheSize) === 'number' ? opts.cacheSize : 100);
      const T = opts.transport || BrowserWebSocketTransport;
      const networkNode = new NetworkNode(uuidv4(), new T((opts.host ? opts.host : window.location.host).split(":")[0] + ":" + opts.port.toString(), false));
      await networkNode.open();
      const db = new RpcClient<GridFs>(networkNode, "GridFs").api(opts.networkNode);
      const value = await db.open(opts.databaseName ? opts.databaseName : "browserFsDb");
      if (value) {
        const store = new MongoDBStore(opts.storeName ? opts.storeName : 'browserfs', db);
        gfs.init(store, (e?) => {
          if (e) {
            cb(e);
          } else {
            cb(null, gfs);
          }
        });
      } else {
        cb(new ApiError(ErrorCode.EINVAL, "Failed to open database"));
      }
    } catch (reason) {
      cb(new ApiError(ErrorCode.EINVAL, "Failed to open database" + reason));
    }
  }

  public static isAvailable(): boolean {
    return true;
  }
  /**
   * **Deprecated. Use MongoDB.Create() method instead.**
   *
   * Constructs an MongoDB file system.
   * @param cb Called once the database is instantiated and ready for use.
   *   Passes an error if there was an issue instantiating the database.
   * @param storeName The name of this file system. You can have
   *   multiple MongoDB file systems operating at once, but each must have
   *   a different name.
   */
  constructor(cacheSize: number) {
    super(cacheSize);
  }
}
