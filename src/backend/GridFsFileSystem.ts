import { BFSOneArgCallback, BFSCallback, FileSystemOptions } from '../core/file_system'
import { AsyncKeyValueROTransaction, AsyncKeyValueRWTransaction, AsyncKeyValueStore, AsyncKeyValueFileSystem } from '../generic/key_value_filesystem'
import { ApiError, ErrorCode } from '../core/api_error'
import { GridFs } from '@diginet/ds-mongodb'
import FS from '../core/FS';

/*/**
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
  protected done?: () => void
  constructor(public store: GridFs) {
  }

  public get(key: string, cb: BFSCallback<Buffer>): void {
    this.store.fileExists(convertPath(key)).then((value) => {
      if (value) {
        this.store.download(convertPath(key)).then((value2) => {
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
  }

  public abort(cb: BFSOneArgCallback): void {
    cb(null)
  }

  public commit(cb: BFSOneArgCallback): void {
    // Return to the event loop to commit the transaction.
    setTimeout(() => {
      cb()
    }, 0)
  }
}

/**
 * @hidden
 */
export class MongoDBRWTransaction extends MongoDBROTransaction implements AsyncKeyValueRWTransaction, AsyncKeyValueROTransaction {
  constructor(store: GridFs) {
    super(store)
  }

  public put(key: string, data: Buffer, overwrite: boolean, cb: BFSCallback<boolean>): void {
      this.store.upload(convertPath(key), data).then((result: any) => {
        cb(null, result);
      }).catch((reason: Error) => {
        cb(null, undefined);
      });
  }

  public del(key: string, cb: BFSOneArgCallback): void {
    this.store.deleteFile(convertPath(key))
    .then((result: any) => {
      cb()
    })
    .catch((reason: any) => {
      cb()
    })
  }
}

export class MongoDBStore implements AsyncKeyValueStore {
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
      return new MongoDBRWTransaction(this.db)
    } else if (type === 'readonly') {
      return new MongoDBROTransaction(this.db)
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
  // Class to use for communicating with GridFs.
  gridFs: () => GridFs
  // The size of the inode cache. Defaults to 100. A size of 0 or below disables caching.
  cacheSize?: number
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
    gridFs: {
      type: 'function',
      optional: false,
      description: 'Class to use for communicating with GridFs.'
    },
    cacheSize: {
      type: 'number',
      optional: true,
      description: 'The size of the inode cache. Defaults to 100. A size of 0 or below disables caching.'
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
  public static Create(opts: GridFSOptions, cb: BFSCallback<GridFsFileSystem>) {
    try {
      const gfs = new GridFsFileSystem(typeof opts.cacheSize === 'number' ? opts.cacheSize : 100, opts.rootFS)
      const store = new MongoDBStore(opts.storeName ? opts.storeName : 'browserfs', opts.gridFs())
      gfs.init(store, (e?) => {
        if (e) {
          cb(e)
        } else {
          cb(null, gfs)
        }
      })
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
