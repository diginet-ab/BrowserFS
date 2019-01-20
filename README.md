# @diginet/ds-fs (BrowserFS)
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

# BrowserFS API Documentation

BrowserFS is an in-browser file system that emulates the [Node JS file system API](http://nodejs.org/api/fs.html) and supports storing and retrieving files from various backends. BrowserFS also integrates nicely into the Emscripten file system.

The [README](https://github.com/jvilk/browserfs) provides an overview of how to integrate BrowserFS into your project. This API documentation will focus on how to use BrowserFS once you have added it to your project.

## Configuring BrowserFS

The main BrowserFS interface is [documented here](modules/_core_browserfs_.html).

Before you can use BrowserFS, you need to answer the following questions:

1. **What file system backends do I want to use?**
2. **What configuration options do I pass to each?**

### What Backend(s) to Use?

Before you can use BrowserFS, you must initialize it with a single root file system backend. Think of each backend
as a "storage device". It can be read-only (a zip file or an ISO), read-write (browser-local IndexedDB storage),
and it can even be cloud storage (Dropbox).

If you need to use multiple "storage devices", you can use the `MountableFileSystem` backend to "mount" backends at
different locations in the directory hierarchy.

There are all sorts of adapter file systems available to make it easy to access files stored in Emscripten, files stored in a different context (e.g., a web worker), isolate file operations to a particular folder, access asynchronous storage backends synchronously, and more!

Check out the "Overview" of backends below for a list of backends and their capabilities.

### What Configuration Options For Each?

Different backends require different configuration options. Review the documentation page for each backend you want to use, and note the options passed to its `Create()` method. Some are optional, others are required.

### Putting It All Together

Once you know the backend(s) you want to use, and the options to pass to each, you can configure BrowserFS with a single configuration object:

```javascript
BrowserFS.configure({
  fs: "name of file system type" // from Backends table below,
  options: {
    // options for the file system
  }
}, function (e) {
  if (e) {
    // An error occurred.
    throw e;
  }
  // Otherwise, you can interact with the configured backends via our Node FS polyfill!
  var fs = BrowserFS.BFSRequire('fs');
  fs.readdir('/', function(e, contents) {
    // etc.
  });
});
```

In the case where a file system's options object takes another file system, you can nest another configuration object
in place of the actual file system object:

```javascript
var Buffer = BrowserFS.BFSRequire('buffer').Buffer;
BrowserFS.configure({
  fs: "OverlayFS",
  options: {
    readable: {
      fs: "ZipFS",
      options: {
        zipData: Buffer.from(zipDataAsArrayBuffer)
      }
    },
    writable: {
      fs: "LocalStorage"
    }
  }
}, function(e) {

});
```

Using this method, it's easy to configure mount points in the `MountableFileSystem`:

```javascript
BrowserFS.configure({
  fs: "MountableFileSystem",
  options: {
    '/tmp': { fs: "InMemory" },
    '/home': { fs: "IndexedDB" },
    '/mnt/usb0': { fs: "LocalStorage" }
  }
}, function(e) {

});
```

### Advanced Usage

If `BrowserFS.configure` is not to your liking, you can manually instantiate file system backends and pass the root backend to BrowserFS via its `BrowserFS.initialize()` function.

```javascript
BrowserFS.FileSystem.LocalStorage.Create(function(e, lsfs) {
  BrowserFS.FileSystem.InMemory.Create(function(e, inMemory) {
    BrowserFS.FileSystem.IndexedDB.Create({}, function(e, idbfs) {
      BrowserFS.FileSystem.MountableFileSystem.Create({
        '/tmp': inMemory,
        '/home': idbfs,
        '/mnt/usb0': lsfs
      }, function(e, mfs) {
        BrowserFS.initialize(mfs);
        // BFS is now ready to use!
      });
    });
  });
});
```

## Usage with Emscripten

Once you have configured BrowserFS, you can mount it into the Emscripten file system. More details are in the BrowserFS [README](https://github.com/jvilk/browserfs).

## Overview of Backends

**Key:**

* ✓ means 'yes'
* ✗ means 'no'
* ? means 'depends on configuration'

### Citing

BrowserFS is a component of the [Doppio](http://doppiojvm.org/) and [Browsix](https://browsix.org/) research projects from the PLASMA lab at the University of Massachusetts Amherst. If you decide to use BrowserFS in a project that leads to a publication, please cite the academic papers on [Doppio](https://dl.acm.org/citation.cfm?doid=2594291.2594293) and [Browsix](https://dl.acm.org/citation.cfm?id=3037727):

> John Vilk and Emery D. Berger. Doppio: Breaking the Browser Language Barrier. In
*Proceedings of the 35th ACM SIGPLAN Conference on Programming Language Design and Implementation*
(2014), pp. 508–518.

```bibtex
@inproceedings{VilkDoppio,
  author    = {John Vilk and
               Emery D. Berger},
  title     = {{Doppio: Breaking the Browser Language Barrier}},
  booktitle = {Proceedings of the 35th {ACM} {SIGPLAN} Conference on Programming Language Design and Implementation},
  pages     = {508--518},
  year      = {2014},
  url       = {http://doi.acm.org/10.1145/2594291.2594293},
  doi       = {10.1145/2594291.2594293}
}
```

> Bobby Powers, John Vilk, and Emery D. Berger. Browsix: Bridging the Gap Between Unix and the Browser. In *Proceedings of the Twenty-Second International Conference on Architectural Support for Programming Languages and Operating Systems* (2017), pp. 253–266.

```bibtex
@inproceedings{PowersBrowsix,
  author    = {Bobby Powers and
               John Vilk and
               Emery D. Berger},
  title     = {{Browsix: Bridging the Gap Between Unix and the Browser}},
  booktitle = {Proceedings of the Twenty-Second International Conference on Architectural
               Support for Programming Languages and Operating Systems},
  pages     = {253--266},
  year      = {2017},
  url       = {http://doi.acm.org/10.1145/3037697.3037727},
  doi       = {10.1145/3037697.3037727}
}
```


### License

<table>
  <tr>
    <th></th>
    <th></th>
    <th colspan="3">Optional API Support</th>
  </tr>
  <tr>
    <th>Backend Name</th>
    <th>Writable?</th>
    <th>Synchronous</th>
    <th>Properties</th>
    <th>Links</th>
  </tr>
  <tr>
    <td><a href="classes/_backend_asyncmirror_.asyncmirror.html">AsyncMirror</a></td>
    <td>✓</td>
    <td>✓</td>
    <td>✗</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_dropbox_.dropboxfilesystem.html">Dropbox</a></td>
    <td>✓</td>
    <td>✗</td>
    <td>✗</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_emscripten_.emscriptenfilesystem.html">Emscripten</a></td>
    <td>✓</td>
    <td>✓</td>
    <td>✓</td>
    <td>✓</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_folderadapter_.folderadapter.html">FolderAdapter</a></td>
    <td>?</td>
    <td>?</td>
    <td>?</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_html5fs_.html5fs.html">HTML5FS</a></td>
    <td>✓</td>
    <td>✗</td>
    <td>✗</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_indexeddb_.indexeddbfilesystem.html">IndexedDB</a></td>
    <td>✓</td>
    <td>✗</td>
    <td>✗</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_inmemory_.inmemoryfilesystem.html">InMemory</a></td>
    <td>✓</td>
    <td>✓</td>
    <td>✗</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_isofs_.isofs.html">IsoFS</a></td>
    <td>✗</td>
    <td>✓</td>
    <td>✗</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_localstorage_.localstoragefilesystem.html">LocalStorage</a></td>
    <td>✓</td>
    <td>✓</td>
    <td>✗</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_mountablefilesystem_.mountablefilesystem.html">MountableFileSystem</a></td>
    <td>?</td>
    <td>?</td>
    <td>?</td>
    <td>?</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_overlayfs_.overlayfs.html">OverlayFS</a></td>
    <td>✓</td>
    <td>?</td>
    <td>?</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_httprequest_.httprequest.html">HTTPRequest</a></td>
    <td>✗</td>
    <td>✓</td>
    <td>✗</td>
    <td>✗</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_workerfs_.workerfs.html">WorkerFS</a></td>
    <td>?</td>
    <td>✗</td>
    <td>?</td>
    <td>?</td>
  </tr>
  <tr>
    <td><a href="classes/_backend_zipfs_.zipfs.html">ZipFS</a></td>
    <td>✗</td>
    <td>✓</td>
    <td>✗</td>
    <td>✗</td>
  </tr>
</table>
