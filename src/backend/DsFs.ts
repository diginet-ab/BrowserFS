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

type RecursiveFolder = { name: string; items?: RecursiveFolder[] }

interface IDsFs {
    /**
     * Retrieve file attributes for a file.
     * @throws ENOENT, ENOTDIR, EFAULT
     */
    getattr(
        filename: string,
        isLstat?: boolean
    ): Promise<{ type: 'directory' | 'file' | 'symlink'; size: number; atime: number; mtime: number; ctime: number; birthtime: number }>
    /**
     * Read from file.
     * @param filename Path to the file.
     * @param offset The position in the file to start reading.
     * @param count Number of bytes to read,
     * @throws EISDIR, EFAULT
     */
    read(filename: string, offset: number, count: number): Promise<Buffer>
    /**
     * Write to file.
     * @param filename Path to the file.
     * @param data The data to write.
     * @param offset The position in the file to start writing.
     * @throw EISDIR, EFAULT
     */
    write(filename: string, data: Buffer, offset: number): Promise<number>
    /**
     * Create a file.
     * @param filename The absolute filename.
     * @returns The filehandle for the newly created file.
     * @throws ENOENT, ENOTDIR, EEXIST, EFAULT
     */
    create(filename: string): Promise<void>
    /**
     * Create a directory.
     * @param dirname The absolute directory name.
     * @returns The filehandle for the newly created directory.
     * @throws ENOENT, ENOTDIR, EEXIST, EFAULT
     */
    mkdir(dirname: string): Promise<void>
    /**
     * Remove a file.
     * @throws ENOENT, ENOTDIR, EISDIR, EFAULT
     */
    remove(filename: string): Promise<void>
    /**
     * Remove a directory.
     * @throws ENOENT, ENOTDIR, ENOTEMPTY, EFAULT
     */
    rmdir(dirname: string): Promise<void>
    /**
     * Rename a file.
     * @throws ENOENT, ENOTDIR, EFAULT
     */
    rename(oldFilename: string, newFilename: string): Promise<void>
    /**
     * Lists all files in a directory.
     * @throws ENOENT, ENOTDIR, EFAULT
     */
    readdir(dirname: string): Promise<string[]>
    /**
     * Recursively reads all files and folders in a directory.
     * @throws ENOTDIR, EFAULT
     */
    readdirRecursive(dirname: string): Promise<RecursiveFolder[]>
    /**
     * Truncate a file.
     * @param size The new size
     * @throws ENOENT, ENOTDIR, EISDIR, EFAULT
     */
    truncate(filename: string, length: number): Promise<void>
    /**
     * Create a symbolic link.
     * @throws ENOENT
     */
    symlink(target: string, path: string): Promise<void>
    /**
     * Set the timestamps of a file.
     * @throws ENOENT, ENOTDIR, EFAULT
     */
    utimes(filename: string, atimeMs: number, mtimeMs: number): Promise<void>
    /**
     * Read value of a symbolic link
     * @throws ENOENT, ENOTDIR, EFAULT
     */
    readlink(filename: string): Promise<string>
    /**
     * Remove a directory and all of its contents.
     * @throws ENOENT, ENOTDIR, EFAULT
     */
    rimraf(dirname: string): Promise<void>
    /**
     * Creates a new copy of a file in a new location.
     * @throws ENOENT, ENOTDIR, EFAULT
     */
    copyFile(src: string, dest: string): Promise<void>
}

function getApiError(e: string, path: string): ApiError {
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
    constructor(private filename: string, private client: IDsFs, private mode?: number) {
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
        this.client.getattr(this.filename).then(
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
        this.client.truncate(this.filename, len).then(
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
        this.client.write(this.filename, buffer.slice(offset, length), position).then(
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
        this.client.read(this.filename, position, length).then(
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
        this.client.utimes(this.filename, atime.getTime(), mtime.getTime()).then(
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

    // We don't support properties or sync operations

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
            .rename(oldPath, newPath)
            .then(() => cb())
            .catch(function(e: string) {
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
            .getattr(path, isLstat)
            .then(metadata => {
                cb(
                    null,
                    new Stats(
                        metadata.type === 'directory' ? FileType.DIRECTORY : metadata.type === 'file' ? FileType.FILE : FileType.SYMLINK,
                        metadata.size,
                        this._mode,
                        metadata.atime,
                        metadata.mtime,
                        metadata.ctime,
                        metadata.birthtime
                    )
                )
            })
            .catch((e: string) => {
                cb(getApiError(e, path))
            })
    }

    public open(path: string, flags: FileFlag, mode: number, cb: BFSCallback<File>): void {
        const exists = () => {
            switch (flags.pathExistsAction()) {
                case ActionType.THROW_EXCEPTION: {
                    cb(getApiError('EEXIST', path ))
                    break
                }
                case ActionType.TRUNCATE_FILE: {
                    this._backend.truncate(path, 0).then(() => {
                        cb(null, new DsFsFile(path, this._backend, this._mode))
                    }, (err: string) => {
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
                    cb(null, new DsFsFile(path, this._backend, this._mode))
                }
            }
        }
        const notExists = () => {
            if (flags.pathNotExistsAction() === ActionType.CREATE_FILE) {
                this._backend.create(path).then(
                    fh => {
                        cb(null, new DsFsFile(path, this._backend, this._mode))
                    },
                    err2 => {
                        cb(getApiError(err2, path))
                    }
                )
            } else {
                cb(getApiError('ENOENT', path ))
            }
        }
        this._backend.getattr(path).then(
            () => {
                // The file exists
                exists()
            },
            (err: string) => {
                if (err === 'ENOENT') {
                    notExists()
                } else {
                    cb(getApiError(err, path))
                }
            }
        )
    }

    public createFile(path: string, flags: FileFlag, mode: number, cb: BFSCallback<File>): void {
        this._backend
            .create(path)
            .then(() => {
                cb(null, new DsFsFile(path, this._backend, this._mode))
            })
            .catch((e: string) => {
                cb(getApiError(e, path))
            })
    }

    /**
     * Delete a file
     */
    public unlink(path: string, cb: BFSOneArgCallback): void {
        this._backend
            .remove(path)
            .then(() => {
                cb()
            })
            .catch((e: string) => {
                cb(getApiError(e, path))
            })
    }

    /**
     * Delete a directory
     */
    public rmdir(path: string, cb: BFSOneArgCallback): void {
        this._backend
            .rmdir(path)
            .then(() => {
                cb()
            })
            .catch((e: string) => {
                cb(getApiError(e, path))
            })
    }

    /**
     * Create a directory
     */
    public mkdir(path: string, mode: number, cb: BFSOneArgCallback): void {
        this._backend
            .mkdir(path)
            .then(() => {
                cb()
            })
            .catch((e: string) => {
                cb(getApiError(e, path))
            })
    }

    /**
     * Get the names of the files in a directory
     */
    public readdir(path: string, cb: BFSCallback<string[]>): void {
        this._backend
            .readdir(path)
            .then(res => {
                cb(null, res)
            })
            .catch((e: string) => {
                cb(getApiError(e, path))
            })
    }

    public symlink(srcpath: string, dstpath: string, type: string, cb: BFSOneArgCallback) {
        this._backend.symlink(srcpath, dstpath).then(() => {
            cb()
        })
        .catch((e: string) => {
            cb(getApiError(e, srcpath))
        })
    }

    public utimes(path: string, atime: Date, mtime: Date, cb: BFSOneArgCallback): void {
        this._backend.utimes(path, atime.getTime(), mtime.getTime()).then(() => {
            cb()
        }, (e: string) => {
            cb(getApiError(e, path));
        })
      }
    
    public readlink(path: string, cb: BFSCallback<string>) {
        this._backend.readlink(path).then((linkString) => {
            cb(null, linkString)
        }, (e) => {
            cb(getApiError(e, path))
        })
    }
}
