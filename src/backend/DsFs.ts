import PreloadFile from '../generic/preload_file'
import { BaseFileSystem, FileSystem, BFSOneArgCallback, BFSCallback, FileSystemOptions } from '../core/file_system'
import { FileFlag } from '../core/file_flag'
import { default as Stats, FileType } from '../core/node_fs_stats'
import { ApiError, ErrorCode } from '../core/api_error'
import { File } from '../core/file'
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

function getApiError(e: DsFsException): ApiError {
    if (!e) {
        return new ApiError(ErrorCode.EIO)
    }
    switch (e.code) {
        case 'ENOENT':
            return ApiError.ENOENT(e.path)
        case 'ENOTEMPTY':
            return ApiError.ENOTEMPTY(e.path)
        case 'EEXIST':
            return ApiError.EEXIST(e.path)
        case 'EISDIR':
            return ApiError.EISDIR(e.path)
        case 'ENOTDIR':
            return ApiError.ENOTDIR(e.path)
        default:
            return new ApiError(ErrorCode.EIO)
    }
}

export class DsFsFile extends PreloadFile<DsFsFileSystem> implements File {
    constructor(_fs: DsFsFileSystem, _path: string, _flag: FileFlag, _stat: Stats, contents?: Buffer) {
        super(_fs, _path, _flag, _stat, contents)
    }

    public sync(cb: BFSOneArgCallback): void {
        this._fs._syncFile(this.getPath(), this.getBuffer(), cb)
    }

    public close(cb: BFSOneArgCallback): void {
        this.sync(cb)
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
                cb(getApiError(e))
            })
    }

    public stat(path: string, isLstat: boolean, cb: BFSCallback<Stats>): void {
        if (path === '/') {
            // DsFs will always return this when querying the root directory.
            setImmediate(() => {
                cb(null, new Stats(FileType.DIRECTORY, 4096, this._mode, Date.now(), Date.now(), Date.now(), Date.now()))
            })
            return
        }
        this._backend
            .stat(FixPath(path))
            .then(metadata => {
                if (metadata.isFolder) {
                    cb(null, new Stats(FileType.DIRECTORY, 4096, this._mode))
                } else {
                    cb(null, new Stats(FileType.FILE, metadata.byteSize!, this._mode))
                }
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e))
            })
    }

    public openFile(path: string, flags: FileFlag, cb: BFSCallback<File>): void {
        let _path = FixPath(path)
        Promise.all([this._backend.readFile(_path), this._backend.stat(_path)])
            .then(([data, stat]) => {
                cb(
                    null,
                    new DsFsFile(
                        this,
                        path,
                        flags,
                        new Stats(FileType.FILE, data.byteLength, this._mode, stat.atime, stat.mtime, stat.ctime, stat.birthtime),
                        data
                    )
                )
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e))
            })
    }

    public createFile(p: string, flags: FileFlag, mode: number, cb: BFSCallback<File>): void {
        const fileData = Buffer.alloc(0)
        this._backend
            .writeFile(FixPath(p), fileData)
            .then(() => {
                cb(null, new DsFsFile(this, p, flags, new Stats(FileType.FILE, 0, this._mode), fileData))
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e))
            })
    }

    /**
     * Delete a file
     */
    public unlink(p: string, cb: BFSOneArgCallback): void {
        this._backend
            .deleteFile(FixPath(p))
            .then(() => {
                cb()
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e))
            })
    }

    /**
     * Delete a directory
     */
    public rmdir(p: string, cb: BFSOneArgCallback): void {
        this._backend
            .rmdir(FixPath(p))
            .then(() => {
                cb()
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e))
            })
    }

    /**
     * Create a directory
     */
    public mkdir(p: string, mode: number, cb: BFSOneArgCallback): void {
        this._backend
            .mkdir(FixPath(p))
            .then(() => {
                cb()
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e))
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
                cb(getApiError(e))
            })
    }

    /**
     * (Internal) Syncs file to DsFs.
     */
    public _syncFile(p: string, d: Buffer, cb: BFSOneArgCallback): void {
        this._backend
            .writeFile(FixPath(p), d)
            .then(() => {
                cb()
            })
            .catch((e: DsFsException) => {
                cb(getApiError(e))
            })
    }
}
