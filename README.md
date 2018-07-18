# @diginet/ds-fs
Note: This is a fork of https://github.com/jvilk/BrowserFS
> BrowserFS is an in-browser file system that emulates the [Node JS file system API](http://nodejs.org/api/fs.html) and supports storing and retrieving files from various backends. BrowserFS also integrates nicely into the Emscripten file system.

[![Build Status](https://travis-ci.org/jvilk/BrowserFS.svg?branch=master)](https://travis-ci.org/jvilk/BrowserFS)
[![Build Status](https://ci.appveyor.com/api/projects/status/bammh2x1bud8h7a5/branch/master?svg=true)](https://ci.appveyor.com/project/jvilk/browserfs/branch/master)
[![NPM version](https://badge.fury.io/js/browserfs.svg)](http://badge.fury.io/js/browserfs)

### Backends

BrowserFS is highly extensible, and ships with many filesystem backends:

* `HTTPRequest`: Downloads files on-demand from a webserver via `XMLHttpRequest` or `fetch`.
* `LocalStorage`: Stores files in the browser's `localStorage`.
* `HTML5FS`: Stores files into the HTML5 `FileSystem` API.
* `IndexedDB`: Stores files into the browser's `IndexedDB` object database.
* `Dropbox`: Stores files into the user's Dropbox account.
  * Note: You provide this filesystem with an authenticated [DropboxJS V2 JS SDK client](https://github.com/dropbox/dropbox-sdk-js).
* `InMemory`: Stores files in-memory. Thus, it is a temporary file store that clears when the user navigates away.
* `ZipFS`: Read-only zip file-backed FS. Lazily decompresses files as you access them.
  * Supports DEFLATE out-of-the-box.
  * Have super old zip files? [The `browserfs-zipfs-extras` package](https://github.com/jvilk/browserfs-zipfs-extras) adds support for EXPLODE, UNREDUCE, and UNSHRINK.
* `IsoFS`: Mount an .iso file into the file system.
  * Supports Microsoft Joliet and Rock Ridge extensions to the ISO9660 standard.
* `WorkerFS`: Lets you mount the BrowserFS file system configured in the main thread in a WebWorker, or the other way around!
* `MountableFileSystem`: Lets you mount multiple file systems into a single directory hierarchy, as in *nix-based OSes.
* `OverlayFS`: Mount a read-only file system as read-write by overlaying a writable file system on top of it. Like Docker's overlayfs, it will only write changed files to the writable file system.
* `AsyncMirror`: Use an asynchronous backend synchronously. Invaluable for Emscripten; let your Emscripten applications write to larger file stores with no additional effort!
  * Note: Loads the entire contents of the file system into a synchronous backend during construction. Performs synchronous operations in-memory, and enqueues them to be mirrored onto the asynchronous backend.
* `FolderAdapter`: Wraps a file system, and scopes all interactions to a subfolder of that file system.
* `Emscripten`: Lets you mount Emscripten file systems inside BrowserFS.
* `GridFsFileSystem`: Stores files into a MongoDB GridFS database via a ds-nodes GridFs RPC server.

More backends can be defined by separate libraries, so long as they extend the `BaseFileSystem` class. Multiple backends can be active at once at different locations in the directory hierarchy.

For more information, see the [API documentation for BrowserFS](https://jvilk.com/browserfs/2.0.0-beta/index.html).

### Building

Prerequisites:

* Node and NPM
* Run `yarn install` (or `npm install`) to install local dependencies and build BrowserFS

### Using

Using `BrowserFS.configure()`, you can easily configure BrowserFS to use a variety of file system types.

Here's a simple usage example using the LocalStorage-backed file system:

```html
<script type="text/javascript" src="browserfs.min.js"></script>
<script type="text/javascript">
  // Installs globals onto window:
  // * Buffer
  // * require (monkey-patches if already defined)
  // * process
  // You can pass in an arbitrary object if you do not wish to pollute
  // the global namespace.
  BrowserFS.install(window);
  // Configures BrowserFS to use the LocalStorage file system.
  BrowserFS.configure({
    fs: "LocalStorage"
  }, function(e) {
    if (e) {
      // An error happened!
      throw e;
    }
    // Otherwise, BrowserFS is ready-to-use!
  });
</script>
```

Now, you can write code like this:

```js
var fs = require('fs');
fs.writeFile('/test.txt', 'Cool, I can do this in the browser!', function(err) {
  fs.readFile('/test.txt', function(err, contents) {
    console.log(contents.toString());
  });
});
```

The following code mounts a zip file to `/zip`, in-memory storage to `/tmp`, and IndexedDB browser-local storage to `/home`:

```js
// Note: This is the new fetch API in the browser. You can use XHR too.
fetch('mydata.zip').then(function(response) {
  return response.arraybuffer();
}).then(function(zipData) {
  var Buffer = BrowserFS.BFSRequire('buffer').Buffer;

  BrowserFS.configure({
    fs: "MountableFileSystem",
    options: {
      "/zip": {
        fs: "ZipFS",
        options: {
          // Wrap as Buffer object.
          zipData: Buffer.from(zipData)
        }
      },
      "/tmp": { fs: "InMemory" },
      "/home": { fs: "IndexedDB" }
    }
  }, function(e) {
    if (e) {
      // An error occurred.
      throw e;
    }
    // Otherwise, BrowserFS is ready to use!
  });
});
```

### Using with Node

You can use BrowserFS with Node. Simply add `browserfs` as an NPM dependency, and `require('browserfs')`.
The object returned from this action is the same `BrowserFS` global described above.

If you need BrowserFS to return Node Buffer objects (instead of objects that implement the same interface),
simply `require('browserfs/dist/node/index')` instead.

### Testing

To run unit tests, simply run `npm test`.

### License

BrowserFS is licensed under the MIT License. See `LICENSE` for details.
