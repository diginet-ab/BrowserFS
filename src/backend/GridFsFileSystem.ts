import PreloadFile from '../generic/preload_file'
import { BaseFileSystem, FileSystem, BFSOneArgCallback, BFSCallback, FileSystemOptions } from '../core/file_system'
import { FileFlag } from '../core/file_flag'
import { default as Stats, FileType } from '../core/node_fs_stats'
import { ApiError, ErrorCode } from '../core/api_error'
import { File } from '../core/file'
import setImmediate from '../generic/setImmediate'
import { GridFs } from '@diginet/ds-mongodb'

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

type GridFsError = {
    code: 'ENOENT' | 'EIO' | 'EEXIST' | 'EISDIR' | 'ENOTDIR' | 'ENOTEMPTY'
    path: string
}

function getApiError(e: GridFsError): ApiError {
    if (!e) {
        return new ApiError(ErrorCode.EIO)
    }
    if (typeof e.code === (-32603 as any)) {
        // This was a remote call. Noice json rpc placed the actual error inside e.data
        e = (e as any).data
    }
    switch (e.code) {
        case 'ENOENT':
            return ApiError.ENOENT(e.path)
        case 'EISDIR':
            return ApiError.EISDIR(e.path)
        case 'EEXIST':
            return ApiError.EEXIST(e.path)
        case 'ENOTDIR':
            return ApiError.ENOTDIR(e.path)
        case 'ENOTEMPTY':
            return ApiError.ENOTEMPTY(e.path)
        default:
            return new ApiError(ErrorCode.EIO)
    }
}

export class GridFsFile extends PreloadFile<GridFsFileSystem> implements File {
    constructor(_fs: GridFsFileSystem, _path: string, _flag: FileFlag, _stat: Stats, contents?: Buffer) {
        super(_fs, _path, _flag, _stat, contents)
    }

    public sync(cb: BFSOneArgCallback): void {
        this._fs._syncFile(this.getPath(), this.getBuffer(), cb)
    }

    public close(cb: BFSOneArgCallback): void {
        this.sync(cb)
    }
}

/**
 * Options for the GridFs file system.
 */
export interface GridFsFileSystemOptions {
    // Client to use for communicating with GridFs.
    client: () => GridFs
    mode?: number
}

/**
 * A read/write file system backed by Dropbox cloud storage.
 *
 * Uses the Dropbox V2 API, and the 2.x JS SDK.
 */
export class GridFsFileSystem extends BaseFileSystem implements FileSystem {
    public static readonly Name = 'GridFsFileSystem'

    public static readonly Options: FileSystemOptions = {
        client: {
            type: 'function',
            optional: false,
            description: 'Client to use for communicating with GridFs.'
        },
        mode: {
            type: 'number',
            optional: true,
            description: 'The permissions to apply to all files and folders within the FileSystem.'
        }
    }

    /**
     * Creates a new GridFsFileSystem instance with the given options.
     */
    public static Create(opts: GridFsFileSystemOptions, cb: BFSCallback<GridFsFileSystem>): void {
        cb(null, new GridFsFileSystem(opts.client()))
    }

    public static isAvailable(): boolean {
        return true
    }

    private _client: GridFs
    private _mode?: number

    private constructor(client: GridFs, mode?: number) {
        super()
        this._client = client
        this._mode = typeof mode === 'number' ? mode : parseInt('777', 8)
    }

    public getName(): string {
        return GridFsFileSystem.Name
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
        this._client
            .rename(FixPath(oldPath), FixPath(newPath))
            .then(() => cb())
            .catch(function(e: GridFsError) {
                cb(getApiError(e))
            })
    }

    public stat(path: string, isLstat: boolean, cb: BFSCallback<Stats>): void {
        if (path === '/') {
            // GridFs doesn't support querying the root directory.
            setImmediate(() => {
                cb(null, new Stats(FileType.DIRECTORY, 4096, this._mode))
            })
            return
        }
        this._client
            .getMetaData(FixPath(path))
            .then(metadata => {
                if (metadata.isFolder) {
                    cb(null, new Stats(FileType.DIRECTORY, 4096, this._mode))
                } else {
                    cb(null, new Stats(FileType.FILE, metadata.byteSize!, this._mode))
                }
            })
            .catch((e: GridFsError) => {
                cb(getApiError(e))
            })
    }

    public openFile(path: string, flags: FileFlag, cb: BFSCallback<File>): void {
        this._client
            .download(FixPath(path))
            .then(data => {
                cb(null, new GridFsFile(this, path, flags, new Stats(FileType.FILE, data.byteLength, this._mode), data))
            })
            .catch((e: GridFsError) => {
                cb(getApiError(e))
            })
    }

    public createFile(p: string, flags: FileFlag, mode: number, cb: BFSCallback<File>): void {
        const fileData = Buffer.alloc(0)
        this._client
            .upload(FixPath(p), fileData)
            .then(() => {
                cb(null, new GridFsFile(this, p, flags, new Stats(FileType.FILE, 0, this._mode), fileData))
            })
            .catch((e: GridFsError) => {
                cb(getApiError(e))
            })
    }

    /**
     * Delete a file
     */
    public unlink(p: string, cb: BFSOneArgCallback): void {
        this._client
            .deleteFile(FixPath(p))
            .then(() => {
                cb()
            })
            .catch((e: GridFsError) => {
                cb(getApiError(e))
            })
    }

    /**
     * Delete a directory
     */
    public rmdir(p: string, cb: BFSOneArgCallback): void {
        this._client
            .rmdir(FixPath(p))
            .then(() => {
                cb()
            })
            .catch((e: GridFsError) => {
                cb(getApiError(e))
            })
    }

    /**
     * Create a directory
     */
    public mkdir(p: string, mode: number, cb: BFSOneArgCallback): void {
        this._client
            .mkdir(FixPath(p))
            .then(() => {
                cb()
            })
            .catch((e: GridFsError) => {
                cb(getApiError(e))
            })
    }

    /**
     * Get the names of the files in a directory
     */
    public readdir(path: string, cb: BFSCallback<string[]>): void {
        this._client
            .readdir(FixPath(path))
            .then(res => {
                cb(null, res)
            })
            .catch((e: GridFsError) => {
                cb(getApiError(e))
            })
    }

    /**
     * (Internal) Syncs file to GridFs.
     */
    public _syncFile(p: string, d: Buffer, cb: BFSOneArgCallback): void {
        this._client
            .upload(FixPath(p), d)
            .then(() => {
                cb()
            })
            .catch((e: 'EIO') => {
                cb(new ApiError(ErrorCode.EIO))
            })
    }
}
