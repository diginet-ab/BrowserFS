import { BFSOneArgCallback, BFSCallback, FileSystemOptions } from '../core/file_system'
import { AsyncKeyValueROTransaction, AsyncKeyValueRWTransaction, AsyncKeyValueStore, AsyncKeyValueFileSystem } from '../generic/key_value_filesystem'
import { ApiError, ErrorCode } from '../core/api_error'
import { GridFs } from '@diginet/ds-mongodb'
import { RpcClient, Transport } from '@diginet/ds-nodes'
import { BrowserWebSocketTransport } from '@diginet/ds-nodes/lib/src/BrowserWebSocketMessages'
import { NetworkNode } from '@diginet/ds-nodes/lib/src/Messages'
import { v4 as uuidv4 } from 'uuid'
import * as AsyncLock from 'async-lock'
import FS from '../core/FS';

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
  return inData.replace('/', '!')
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
  protected lock: AsyncLock = (AsyncLock as any).default ? new (AsyncLock as any).default() : new AsyncLock()
  protected done?: () => void
  constructor(public store: GridFs, protected asyncKey: string) {
  }

  public get(key: string, cb: BFSCallback<Buffer>): void {
    this.asyncLock(() => {
      this.store.fileExists(convertPath(key)).then((value: any) => {
        if (value) {
          this.store.download(convertPath(key)).then((value2: any) => {
            cb(null, value2);
          }).catch((reason: Error) => {
            cb(null, undefined);
          });
        } else {
          cb(null, undefined);
        }
      }).catch((reason: Error) => {
        cb(null, undefined);
      });
    })
  }

  public abort(cb: BFSOneArgCallback): void {
    this.asyncDone()
    cb(null)
  }

  public commit(cb: BFSOneArgCallback): void {
    // Return to the event loop to commit the transaction.
    setTimeout(() => {
      this.asyncDone()
      cb()
    }, 0)
  }

  protected asyncLock(cb: () => void): void {
    if (!this.done) {
      this.lock.acquire(this.asyncKey, (done) => {
        // async work
        this.done = done
        cb()
      }, (err, ret) => {
        // lock released
      })
    } else {
      cb()
    }
  }

  protected asyncDone() {
    if (this.done) {
      this.done()
      this.done = undefined
    }
  }
}

/**
 * @hidden
 */
export class MongoDBRWTransaction extends MongoDBROTransaction implements AsyncKeyValueRWTransaction, AsyncKeyValueROTransaction {
  constructor(store: GridFs, protected asyncKey: string) {
    super(store, asyncKey)
  }

  public put(key: string, data: Buffer, overwrite: boolean, cb: BFSCallback<boolean>): void {
    this.asyncLock(() => {
      this.store.upload(convertPath(key), data).then((result: any) => {
        cb(null, result);
      }).catch((reason: Error) => {
        cb(null, undefined);
      });
    })
  }

  public del(key: string, cb: BFSOneArgCallback): void {
    this.asyncLock(() => {
      this.store.deleteFile(convertPath(key))
      .then((result: any) => {
        cb()
      })
      .catch((reason: any) => {
        cb()
      })
    })
  }
}

export class MongoDBStore implements AsyncKeyValueStore {
  protected asyncKey = uuidv4().toString()
  constructor(private storeName: string, private db: GridFs) {}

  public name(): string {
    return GridFsFileSystem.Name + ' - ' + this.storeName
  }

  public clear(cb: BFSOneArgCallback): void {
    // Use setTimeout to commit transaction.
    setTimeout(cb, 0)
  }

  public beginTransaction(type: 'readonly'): AsyncKeyValueROTransaction
  public beginTransaction(type: 'readwrite'): AsyncKeyValueRWTransaction
  public beginTransaction(type: 'readonly' | 'readwrite' = 'readonly'): AsyncKeyValueROTransaction {
    if (type === 'readwrite') {
      return new MongoDBRWTransaction(this.db, this.asyncKey)
    } else if (type === 'readonly') {
      return new MongoDBROTransaction(this.db, this.asyncKey)
    } else {
      throw new ApiError(ErrorCode.EINVAL, 'Invalid transaction type.')
    }
  }
}

/**
 * Configuration options for the MongoDB file system.
 */
export interface GridFSOptions {
  // The name of this file system. You can have multiple MongoDB file systems operating
  // at once, but each must have a different name.
  storeName?: string
  // The server providing ds-nodes network access (defaults to web server host = window.location.host excluding any port)
  host: string
  // The port of ds-nodes server
  port: number
  // The name of the MongoDB database, defaults to browserFsDb.
  databaseName: string
  // The name of the ds-nodes network node providing the GridFs RPC service
  networkNode: string
  // The size of the inode cache. Defaults to 100. A size of 0 or below disables caching.
  cacheSize?: number
  // Transport class to use
  transport: typeof Transport
  // Optional root FS for symlink access
  rootFS: () => FS
}

/**
 * A file system that uses the MongoDB key value file system.
 */
export class GridFsFileSystem extends AsyncKeyValueFileSystem {
  public static readonly Name = 'GridFS'
  public static readonly Options: FileSystemOptions = {
    storeName: {
      type: 'string',
      optional: true,
      description: 'The name of this file system. You can have multiple GridFS file systems operating at once, but each must have a different name.'
    },
    host: {
      type: 'string',
      optional: true,
      description: 'The server providing ds-nodes WebSocket access.'
    },
    port: {
      type: 'number',
      optional: false,
      description: 'The port for the server providing ds-nodes WebSocket access.'
    },
    networkNode: {
      type: 'string',
      optional: true,
      description: 'The ds-nodes server providing the GridFs RPC service.'
    },
    databaseName: {
      type: 'string',
      optional: true,
      description: 'The MongoDB database name, defaults to browserFsDb.'
    },
    cacheSize: {
      type: 'number',
      optional: true,
      description: 'The size of the inode cache. Defaults to 100. A size of 0 or below disables caching.'
    },
    transport: {
      type: 'function',
      optional: true,
      description: 'Transport type to use.'
    },
    rootFS: {
      type: 'function',
      optional: true,
      description: 'Optional function returning root FS for resolving symlinks.'
    },
  }

  /**
   * Constructs an MongoDB file system with the given options.
   */
  public static async Create(opts: GridFSOptions, cb: BFSCallback<GridFsFileSystem>) {
    try {
      const gfs = new GridFsFileSystem(typeof opts.cacheSize === 'number' ? opts.cacheSize : 100, opts.rootFS)
      const T = opts.transport || BrowserWebSocketTransport
      const networkNode = new NetworkNode(uuidv4(), new T((opts.host ? opts.host : window.location.host).split(':')[0] + ':' + opts.port.toString(), false))
      await networkNode.open()
      const db = new RpcClient<GridFs>(networkNode, 'GridFs').api(opts.networkNode)
      //const value = await db.open(opts.databaseName ? opts.databaseName : "browserFsDb");
      const value = await db.open(opts.databaseName ? opts.databaseName : 'browserFsDb')
      if (value) {
        const store = new MongoDBStore(opts.storeName ? opts.storeName : 'browserfs', db)
        gfs.init(store, (e?) => {
          if (e) {
            cb(e)
          } else {
            cb(null, gfs)
          }
        })
      } else {
        cb(new ApiError(ErrorCode.EINVAL, 'Failed to open database'))
      }
    } catch (reason) {
      cb(new ApiError(ErrorCode.EINVAL, 'Failed to open database' + reason))
    }
  }

  public static isAvailable(): boolean {
    return true
  }

  public supportsLinks(): boolean {
    return true;
  }

  public supportsSymlinks(): boolean {
    return true;
  }

  public async linkSync(srcpath: string, dstpath: string) {
    await new Promise<void>((resolve, reject) => {
      this.link(srcpath, dstpath, (e) => {
        if (e)
          reject(e)
        else
          resolve()
      })
    })
  }

  public async symlinkSync(srcpath: string, dstpath: string, type: string) {
    await new Promise<void>((resolve, reject) => {
      this.symlink(srcpath, dstpath, type, (e) => {
        if (e)
          reject(e)
        else
          resolve()
      })
    })
  }

  public readlink(p: string, cb: BFSCallback<string>): void {
  }

  public readlinkSync(p: string): string {
    return '';
  }

  constructor(cacheSize: number, rootFS: () => FS) {
    super(cacheSize, rootFS)
  }
}
