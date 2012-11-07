#! /usr/bin/env node

/*  Copyright 2012, Martin Kool (twitter: @mrtnkl)
    Released under the MIT license. Refer to MIT-LICENSE.txt.

    A nodejs script that allows you to watch a folder for changes and 
    compile the less css files into another folder, optionally passing
    original lessc compiler arguments. 
    
    When the --line-numbers=mediaquery argument is used, this nodejs
    script will fix the syntax so that webkit understands it.

    I only added those latter modifications. All credits should go to 
    those who did the most work (which is like 99%):

    Jonathan Cheung for writing the entire less watcher
    https://github.com/jonycheung/Dead-Simple-LESS-Watch-Compiler

    Mikeal Rogers for writing the original folder watch script
    https://github.com/mikeal/watch
       
    Usage:     node lesswatch.js [options] <source-folder> <destination-folder>
    Example:   node lesswatch.js --line-numbers=mediaquery less css
    
               That will watch ./less folder and compile the less css files into 
               ./css when they are added/changed and add mediaquery-formatted 
               debug info to the css for debugging with webkit-inspector.
*/
var allowedExtensions = ["less"];
var sys = require('util')
  , fs = require('fs')
  , path = require('path')
  , events = require('events')
  , exec = require('child_process').exec;

var args = process.argv.slice(2)
  , lessArgs = [] // arguments to pass to the lessc compiler
  , sourceFolder
  , destFolder
  , writeMediaQueryDebugInfo = false // flag to see if writing sass media query info was set
  , fixMediaQueryDebugInfo = true; // we could make this optional if we want

args.forEach(function (arg) {
  if (!arg.match(/^-+/)) {
    if (!sourceFolder)
      sourceFolder = arg;
    else if (!destFolder)
      destFolder = arg;
  }
  else {
    lessArgs.push(arg);
    if (arg.match(/\-\-line\-numbers\=mediaquery/i))
      writeMediaQueryDebugInfo = true;
  }
});

if (!sourceFolder || !destFolder){
  console.log("Usage:");
  console.log("  node lesswatch.js [options] <source-folder> <destination-folder>");
  console.log("  ([options] can contain original lessc options to pass to the compiler)");
  console.log("\nExamples:");
  console.log("  node lesswatch.js less css");
  console.log("  node lesswatch.js --line-numbers=mediaquery less css");
  process.exit(1);
}

// Walk the directory tree
function walk (dir, options, callback, initCallback) {
  if (!callback) {callback = options; options = {}}
  if (!callback.files) callback.files = {};
  if (!callback.pending) callback.pending = 0;
  callback.pending += 1;
  fs.stat(dir, function (err, stat) {
    if (err) return callback(err);
    callback.files[dir] = stat;
    fs.readdir(dir, function (err, files) {
      if (err) return callback(err);
      callback.pending -= 1;
      files.forEach(function (f, index) {
        f = path.join(dir, f);
        callback.pending += 1;
        fs.stat(f, function (err, stat) {
          var enoent = false
            , done = false;

          if (err) {
            if (err.code !== 'ENOENT') {
              return callback(err);
            } else {
              enoent = true;
            }
          }
          callback.pending -= 1;
          done = callback.pending === 0;
          if (!enoent) {
            if (options.ignoreDotFiles && path.basename(f)[0] === '.') return done && callback(null, callback.files);
            if (options.filter && options.filter(f, stat)) return done && callback(null, callback.files);
            callback.files[f] = stat;
            if (stat.isDirectory()) {
              walk(f, options, callback);
            }else{
              initCallback&&initCallback(f);
            }

            if (done) callback(null, callback.files);
          }
        })
      })
      if (callback.pending === 0) callback(null, callback.files);
    })
    if (callback.pending === 0) callback(null, callback.files);
  })

}

//Setup fs.watchFile() for each file.
var watchTree = function ( root, options, watchCallback, initCallback ) {
  if (!watchCallback) {watchCallback = options; options = {}}
  walk(root, options, function (err, files) {
    if (err) throw err;
    var fileWatcher = function (f) {
      fs.watchFile(f, options, function (c, p) {
        // Check if anything actually changed in stat
        if (files[f] && !files[f].isDirectory() && c.nlink !== 0 && files[f].mtime.getTime() == c.mtime.getTime()) return;
        files[f] = c;
        if (!files[f].isDirectory()) {
          if(options.ignoreDotFiles && (path.basename(f)[0] === '.')) return;
          if(options.filter&& options.filter(f, files[f])) return;
          watchCallback(f, c, p);
        }else {
          fs.readdir(f, function (err, nfiles) {
            if (err) return;
            nfiles.forEach(function (b) {
              var file = path.join(f, b);
              if (!files[file]) {
                fs.stat(file, function (err, stat) {
                  if(options.ignoreDotFiles && (path.basename(b)[0] === '.')) return;
                  if(options.filter&& options.filter(b, files[b])) return;
                  watchCallback(file, stat, null);
                  files[file] = stat;
                  fileWatcher(file);
                })
              }
            })
          })
        }
        if (c.nlink === 0) {
          // unwatch removed files.
          delete files[f]
          fs.unwatchFile(f);
        }
      })
    }

    fileWatcher(root);
    for (var i in files) {
      fileWatcher(i);
    }
    watchCallback(files, null, null);
  },
  initCallback);
}

// String function to retrieve the filename without the extension
function getFilenameWithoutExtention(string){
  //extract filename (xxx.less)
  //strip out the extension
  var filename = string.replace(/^.*[\\\/]/, '').split(".")[0];
  return filename
}

// String function to retrieve the file's extension
function getFileExtension(string){
  var extension = string.split(".").pop();
  if (extension == string) return ""
  else
  return extension;
}

// Here's where we run the less compiler
function compileCSS(file){
  var filename = getFilenameWithoutExtention(file);
    var destFile = destFolder + "/" + filename.replace(/\s+/g, "\\ ") + ".css";
    var command = "lessc " + lessArgs.join(" ") + " " + file.replace(/\s+/g, "\\ ") + " " + destFile;
    console.log("Command: '"+command+"'");
    // Run the command
    exec(command, function (error, stdout, stderr) {
      if (error !== null) {
        console.log('exec error: ' + error);
        console.log("stdout : " + stdout)
        console.log("stderr : " + stderr)
      }
      else if (writeMediaQueryDebugInfo && fixMediaQueryDebugInfo) {
        /*

        Now, the mediaquery lines are not written correctly for webkit inspector, so adjust them 
        Change this:

        @media -sass-debug-info{filename{font-family:"z:\Path\To\style.less";}line{font-family:"42";}}

        into this:

        @media -sass-debug-info{filename{font-family:file\:\/\/z\:\/Path\/To\/style\.less}line{font-family:\0000342}}
        */
        fs.readFile(destFile, 'utf8', function (err, data) {
          if (err) {
            console.log(destFile + ' written succesfully. Error while opening that file for fixing SASS media-query syntax... ');
          }
          // loaded, change and save
          else {
            data = data.replace(/@media\s+\-sass\-debug\-info\{\s*filename\{\s*font\-family\:\s*\"(.+?)"\;?\}line\{\s*font\-family\:\s*\"(.+)\"\;?\}\}/g, function (m, mFn, mLn) {
              return '@media -sass-debug-info{filename{font-family:file\\:\\/\\/' + mFn.replace(/\\/g, '\\\/').replace(/\:/g, '\\:').replace(/\./g, '\\.') + '}line{font-family:\\00003' + mLn + '}}';
            });
            fs.writeFile(destFile, data, function (err) {
              if (err) {
                console.log(destFile + ' written and read succesfully. Error while writing that file for fixing SASS media-query syntax... ', data, err);
              }
            });
          }
        });
      }
    });
}

// This is the function we use to filter the files to watch.
function filterFiles(f, stat){
  var filename = getFilenameWithoutExtention(f);
  var extension = getFileExtension(f);
  if (filename.substr(0,1) == "_" || 
      filename.substr(0,1) == "." || 
      filename == "" ||
      allowedExtensions.indexOf(extension) == -1
      )
    return true;
  else{
    return false;
  }   
}

// Here's where we setup the watch function 
watchTree(
  sourceFolder, 
  {interval: 500, ignoreDotFiles:true,filter:filterFiles}, 
  function (f, curr, prev) {
    if (typeof f == "object" && prev === null && curr === null) {
      // Finished walking the tree
      return;
    } else if (curr.nlink === 0) {
      // f was removed
      console.log(f +" was removed.")
    }else {
      // f is a new file or changed
      console.log("The file: "+f+ " was changed.")
      console.log("Recompiling CSS.. "+Date());
      compileCSS(f);
    }
  },
  function(f){
  compileCSS(f);
  }
);
