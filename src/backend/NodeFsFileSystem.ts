import PreloadFile from '../generic/preload_file';
import { BaseFileSystem, FileSystem, BFSOneArgCallback, BFSCallback, FileSystemOptions } from '../core/file_system';
import { BaseFile } from '../core/file';
import { FileFlag } from '../core/file_flag';
import { default as Stats, FileType } from '../core/node_fs_stats';
import { ApiError, ErrorCode } from '../core/api_error';
import { File } from '../core/file';
import { arrayBuffer2Buffer, buffer2ArrayBuffer } from '../core/util';
import setImmediate from '../generic/setImmediate';
import { dirname } from 'path';
import { RpcClient, NetworkNode, BrowserWebSocketTransport, Transport } from "@diginet/ds-nodes";
import { NodeFs } from "@diginet/ds-node-fs";
import { v4 as uuidv4 } from "uuid";
import { FsImplementation } from '../../node_modules/@types/mkdirp';

export class NodeFsFile extends BaseFile implements File {
  public pos = 0;
  constructor(public ffs: NodeFsFileSystem, public path: string, public flag: FileFlag, public fd: number) {
    super();
  }

  /**
   * **Core**: Get the current file position.
   */
  public getPos(): number | undefined {
    return this.pos;
  }
  /**
   * **Core**: Asynchronous `stat`.
   */
  public stat(cb: BFSCallback<Stats>): void {
    this.ffs.stat(this.path, false, cb);
  }
  /**
   * **Core**: Asynchronous close.
   */
  public async close(cb: BFSOneArgCallback) {
    await this.ffs.nodeFs.closeFile(this.fd);
  }
  /**
   * **Core**: Asynchronous truncate.
   */
  public truncate(len: number, cb: BFSOneArgCallback): void {
    this.ffs.truncate(this.path, len, cb);
  }
  /**
   * **Core**: Asynchronous sync.
   */
  public sync(cb: BFSOneArgCallback): void {
  }
  /**
   * **Core**: Write buffer to the file.
   * Note that it is unsafe to use fs.write multiple times on the same file
   * without waiting for the callback.
   * @param buffer Buffer containing the data to write to
   *  the file.
   * @param offset Offset in the buffer to start reading data from.
   * @param length The amount of bytes to write to the file.
   * @param position Offset from the beginning of the file where this
   *   data should be written. If position is null, the data will be written at
   *   the current position.
   * @param cb The number specifies the number of bytes written into the file.
   */
  public write(buffer: Buffer, offset: number, length: number, position: number | null, cb: BFSThreeArgCallback<number, Buffer>): void {
    this.ffs.nodeFs.
  }
  /**
   * **Core**: Read data from the file.
   * @param buffer The buffer that the data will be
   *   written to.
   * @param offset The offset within the buffer where writing will
   *   start.
   * @param length An integer specifying the number of bytes to read.
   * @param position An integer specifying where to begin reading from
   *   in the file. If position is null, data will be read from the current file
   *   position.
   * @param cb The number is the number of bytes read
   */
  public read(buffer: Buffer, offset: number, length: number, position: number | null, cb: BFSThreeArgCallback<number, Buffer>): void;
  /**
   * **Supplementary**: Asynchronous `datasync`.
   *
   * Default implementation maps to `sync`.
   */
  public datasync(cb: BFSOneArgCallback): void;
  /**
   * **Optional**: Asynchronous `chown`.
   */
  public chown(uid: number, gid: number, cb: BFSOneArgCallback): void;
  /**
   * **Optional**: Asynchronous `fchmod`.
   */
  public chmod(mode: number, cb: BFSOneArgCallback): void;
  /**
   * **Optional**: Change the file timestamps of the file.
   */
  public utimes(atime: Date, mtime: Date, cb: BFSOneArgCallback): void;
}

/**
 * Options for the NodeFs file system.
 */
export interface NodeFsFileSystemOptions {
  // The server providing ds-nodes network access (defaults to web server host = window.location.host excluding any port)
  host: string;
  // The port of ds-nodes server
  port: number;
  // The root path of the target file system
  rootPath: string;
  // The name of the ds-nodes network node providing the GridFs RPC service
  networkNode: string;
  // The size of the inode cache. Defaults to 100. A size of 0 or below disables caching.
  cacheSize?: number;
  // Transport class to use
  transport: typeof Transport;
}

export default class NodeFsFileSystem extends BaseFileSystem implements FileSystem {
  public static readonly Name = "NodeFsFileSystem";

  public static readonly Options: FileSystemOptions = {
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
    rootPath: {
      type: "string",
      optional: true,
      description: "The root path of the target file system."
    },
    transport: {
      type: "function",
      optional: true,
      description: "Transport type to use."
    }
  };

  /**
   * Creates a new NodeFsFileSystem instance with the given options.
   */
  public static async Create(opts: NodeFsFileSystemOptions, cb: BFSCallback<NodeFsFileSystem>) {
    const T = opts.transport || BrowserWebSocketTransport;
    const networkNode = new NetworkNode(uuidv4(), new T((opts.host ? opts.host : window.location.host).split(":")[0] + ":" + opts.port.toString(), false));
    await networkNode.open();
    const nodeFs = new RpcClient<NodeFs>(networkNode, "NodeFs").api(opts.networkNode);
    cb(null, new NodeFsFileSystem(nodeFs));
  }

  public static isAvailable(): boolean {
    return true;
  }

  public constructor(public nodeFs: NodeFs) {
    super();
  }

  public getName(): string {
    return NodeFsFileSystem.Name;
  }

  public isReadOnly(): boolean {
    return false;
  }

  public supportsSymlinks(): boolean {
    return true;
  }

  public supportsProps(): boolean {
    return false;
  }

  public supportsSynch(): boolean {
    return false;
  }

  /**
   * Deletes *everything* in the file system. Mainly intended for unit testing!
   * @param cb Called when operation completes.
   */
  public async empty(cb: BFSOneArgCallback) {
    try {
      await this.nodeFs.empty();
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  public async rename(oldPath: string, newPath: string, cb: BFSOneArgCallback) {
    try {
      await this.nodeFs.rename(oldPath, newPath);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  public stat(path: string, isLstat: boolean, cb: BFSCallback<Stats>): void {
    try {
      const stats = await this.nodeFs.stat(path, isLstat);
      (stats as any).fileData = null;
      cb(null, stats as Stats);
    } catch (e) {
      cb(e);
    }
  }

  public async openFile(path: string, flags: FileFlag, cb: BFSCallback<File>) {
    try {
      const fd = await this.nodeFs.openFile(path, flags.getFlagString());
      const stat = await this.nodeFs.stat(path, false);
      (stat as any).fileData = null;
      const file = new NodeFsFile(this, path, flags, fd);
      cb(null, file);
    } catch (e) {
      cb(e);
    }
  }

  public async createFile(path: string, flags: FileFlag, mode: number, cb: BFSCallback<File>) {
    try {
      await this.nodeFs.createFile(path, flags.getFlagString(), mode);
      this.openFile(path, flags, cb);
    } catch (e) {
      cb(e);
    }
  }

  /**
   * Delete a file
   */
  public async unlink(path: string, cb: BFSOneArgCallback) {
    try {
      await this.nodeFs.unlink(path);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  /**
   * Delete a directory
   */
  public async rmdir(path: string, cb: BFSOneArgCallback) {
    try {
      await this.nodeFs.rmdir(path);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  /**
   * Create a directory
   */
  public async mkdir(path: string, mode: number, cb: BFSOneArgCallback): void {
    try {
      await this.nodeFs.mkdir(path, mode);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  /**
   * Get the names of the files in a directory
   */
  public async readdir(path: string, cb: BFSCallback<string[]>) {
    try {
      const files = await this.nodeFs.readdir(path);
      cb(null, files);
    } catch (e) {
      cb(e);
    }
  }

}
