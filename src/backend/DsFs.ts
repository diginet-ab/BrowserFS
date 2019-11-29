import {
    BaseFileSystem,
    FileSystem,
    BFSOneArgCallback,
    BFSCallback,
    FileSystemOptions,
    BFSThreeArgCallback
} from '../core/file_system'
import { FileFlag, ActionType } from '../core/file_flag'
import { default as Stats, FileType } from '../core/node_fs_stats'
import { ApiError, ErrorCode } from '../core/api_error'
import { File, BaseFile } from '../core/file'
import setImmediate from '../generic/setImmediate'
import { IDsFs } from '@diginet/ds-fs-backend'
import { DsFsException } from '@diginet/ds-fs-backend/src/IDsFs'

/**
 * Dropbox paths do not begin with a /, they just begin with a folder at the root node.
 * Here, we strip the `/`.
 * @param p An absolute path
 */
function FixPath(p: string): string {
    if (p === '/') {
        return ''
    } else {
        return p
    }
}

function getApiError(e: DsFsException, path: string): ApiError {
    switch (e) {
        case 'ENOTEMPTY':
            return ApiError.ENOTEMPTY(path)
        case 'EEXIST':
            return ApiError.EEXIST(path)
        case 'EISDIR':
            return ApiError.EISDIR(path)
        case 'ENOTDIR':
            return ApiError.ENOTDIR(path)
        case 'ENOENT':
            return ApiError.ENOENT(path)
        default:
            return new ApiError(ErrorCode.EIO)
    }
}

class DsFsFile extends BaseFile implements File {
    constructor(private client: IDsFs, private fh: string, private mode?: number) {
        super()
    }
    public getPos(): number | undefined {
        return undefined
    }
    public close(cb: BFSOneArgCallback): void {
        //NOP
        cb(null)
    }
    public closeSync() {
        // NOP
    }
    public stat(cb: BFSCallback<Stats>) {
        this.client.fgetattr(this.fh).then(
            stats => {
                cb(null, new Stats(FileType.FILE, stats.size, this.mode, stats.atime, stats.mtime, stats.ctime, stats.birthtime))
            },
            () => {
                cb(new ApiError(ErrorCode.EIO))
            }
        )
    }
    public statSync(): Stats {
        throw new ApiError(ErrorCode.ENOTSUP)
    }
    public truncate(len: number, cb: BFSOneArgCallback): void {
        this.client.ftruncate(this.fh, len).then(
            () => {
                cb()
            },
            () => {
                cb(new ApiError(ErrorCode.EIO))
            }
        )
    }
    public truncateSync(): void {
        throw new ApiError(ErrorCode.ENOTSUP)
    }
    public write(
        buffer: Buffer,
        offset: number,
        length: number,
        position: number,
        cb: BFSThreeArgCallback<number, Buffer>
    ): void {
        this.client.write(this.fh, buffer.slice(offset, length), position).then(
            written => {
                cb(null, written, buffer)
            },
            () => {
                cb(new ApiError(ErrorCode.EIO))
            }
        )
    }
    public writeSync(): number {
        throw new ApiError(ErrorCode.ENOTSUP)
    }
    public read(buffer: Buffer, offset: number, length: number, position: number, cb: BFSThreeArgCallback<number, Buffer>): void {
        this.client.read(this.fh, position, length).then(
            data => {
                data.copy(buffer, offset, 0, length)
                cb(null, data.length, buffer)
            },
            (e) => {
                cb(new ApiError(ErrorCode.EIO))
            }
        )
    }
    public readSync(): number {
        throw new ApiError(ErrorCode.ENOTSUP)
    }
    public sync(cb: BFSOneArgCallback): void {
        // NOP.
        cb()
    }
    public syncSync(): void {
        // NOP.
    }
    public chown(uid: number, gid: number, cb: BFSOneArgCallback): void {
        cb(new ApiError(ErrorCode.ENOTSUP))
    }
    public chownSync(uid: number, gid: number): void {
        throw new ApiError(ErrorCode.ENOTSUP)
    }
    public chmod(mode: number, cb: BFSOneArgCallback): void {
        cb(new ApiError(ErrorCode.ENOTSUP))
    }
    public chmodSync(mode: number): void {
        throw new ApiError(ErrorCode.ENOTSUP)
    }
    public utimes(atime: Date, mtime: Date, cb: BFSOneArgCallback): void {
        this.client.futimes(this.fh, atime.getTime(), mtime.getTime()).then(
            () => {
                cb()
            },
            () => {
                cb(new ApiError(ErrorCode.EIO))
            }
        )
    }
    public utimesSync(atime: Date, mtime: Date): void {
        throw new ApiError(ErrorCode.ENOTSUP)
    }
}

export interface DsFsFileSystemOptions {
    backend: () => IDsFs
    mode?: number
}

/**
 * Communicates with the provided DsFs backend.
 */
export default class DsFsFileSystem extends BaseFileSystem implements FileSystem {
    public static readonly Name = 'DsFsFileSystem'

    public static readonly Options: FileSystemOptions = {
        backend: {
            type: 'function',
            optional: false,
            description: 'Backend to use for communicating with DsFs.'
        },
        mode: {
            type: 'number',
            optional: true,
            description: 'The permissions to apply to all files and folders within the FileSystem.'
        }
    }

    /**
     * Creates a new DsFsFileSystem instance with the given options.
     */
    public static Create(opts: DsFsFileSystemOptions, cb: BFSCallback<DsFsFileSystem>): void {
        cb(null, new DsFsFileSystem(opts.backend()))
    }

    public static isAvailable(): boolean {
        return true
    }

    private _backend: IDsFs
    private _mode?: number

    private constructor(backend: IDsFs, mode?: number) {
        super()
        this._backend = backend
        this._mode = typeof mode === 'number' ? mode : parseInt('777', 8)
    }

    public getName(): string {
        return DsFsFileSystem.Name
    }

    public isReadOnly(): boolean {
        return false
    }

    // We don't support symlinks, properties or sync operations (yet..)

    public supportsSymlinks(): boolean {
        return false
    }

    public supportsProps(): boolean {
        return false
    }

    public supportsSynch(): boolean {
        return false
    }

    /**
     * Deletes *everything* in the file system. Mainly intended for unit testing!
     * @param mainCb Called when operation completes.
     */
    public empty(mainCb: BFSOneArgCallback): void {
        mainCb(new ApiError(ErrorCode.ENOTSUP))
    }

    public rename(oldPath: string, newPath: string, cb: BFSOneArgCallback): void {
        this._backend
            .rename(FixPath(oldPath), FixPath(newPath))
            .then(() => cb())
            .catch(function(e: DsFsException) {
                cb(getApiError(e, oldPath))
            })
    }

    public stat(path: string, isLstat: boolean, cb: BFSCallback<Stats>): void {
        if (path === '/') {
            // DsFs will always return this when querying the root directory.
            setImmediate(() => {
                cb(null, new Stats(FileType.DIRECTORY, 4096, this._mode, 0, 0, 0, 0))
            })
            return
        }
        this._backend
            .getattr(FixPath(path))
            .then(metadata => {
                cb(
                    null,
                    new Stats(
                        metadata.isFolder ? FileType.DIRECTORY : FileType.FILE,
                        metadata.size,
                        this._mode,
                        metadata.atime,
                        metadata.mtime,
                        metadata.ctime,
                        metadata.birthtime
                    )
                )
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e, path))
            })
    }

    public open(path: string, flags: FileFlag, mode: number, cb: BFSCallback<File>): void {
        const exists = (fh: string) => {
            switch (flags.pathExistsAction()) {
                case ActionType.THROW_EXCEPTION: {
                    cb(getApiError('EEXIST', path ))
                    break
                }
                case ActionType.TRUNCATE_FILE: {
                    this._backend.ftruncate(fh, 0).then(() => {
                        cb(null, new DsFsFile(this._backend, fh, this._mode))
                    }, (err: DsFsException) => {
                        if (err === 'ENOENT') {
                            // The file was removed.
                            notExists()
                        }
                        else {
                            cb(getApiError(err, path))
                        }
                    })
                    break
                }
                default: {
                    cb(null, new DsFsFile(this._backend, fh, this._mode))
                }
            }
        }
        const notExists = () => {
            if (flags.pathNotExistsAction() === ActionType.CREATE_FILE) {
                this._backend.create(path).then(
                    fh => {
                        cb(null, new DsFsFile(this._backend, fh, this._mode))
                    },
                    err2 => {
                        cb(getApiError(err2, path))
                    }
                )
            } else {
                cb(getApiError('ENOENT', path ))
            }
        }
        this._backend.lookup(path).then(
            fh => {
                // The file exists
                exists(fh)
            },
            (err: DsFsException) => {
                if (err === 'ENOENT') {
                    notExists()
                } else {
                    cb(getApiError(err, path))
                }
            }
        )
    }

    public createFile(path: string, flags: FileFlag, mode: number, cb: BFSCallback<File>): void {
        let _path = FixPath(path)
        this._backend
            .create(_path)
            .then(fh => {
                cb(null, new DsFsFile(this._backend, fh, this._mode))
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e, path))
            })
    }

    /**
     * Delete a file
     */
    public unlink(path: string, cb: BFSOneArgCallback): void {
        this._backend
            .remove(FixPath(path))
            .then(() => {
                cb()
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e, path))
            })
    }

    /**
     * Delete a directory
     */
    public rmdir(path: string, cb: BFSOneArgCallback): void {
        this._backend
            .rmdir(FixPath(path))
            .then(() => {
                cb()
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e, path))
            })
    }

    /**
     * Create a directory
     */
    public mkdir(path: string, mode: number, cb: BFSOneArgCallback): void {
        this._backend
            .mkdir(FixPath(path))
            .then(() => {
                cb()
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e, path))
            })
    }

    /**
     * Get the names of the files in a directory
     */
    public readdir(path: string, cb: BFSCallback<string[]>): void {
        this._backend
            .readdir(FixPath(path))
            .then(res => {
                cb(null, res)
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e, path))
            })
    }
}
