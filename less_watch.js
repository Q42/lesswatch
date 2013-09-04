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
       
    Usage:     node lesswatch.js [options] <source-folder> [destination-folder] --source=folder1 --source=folder2 --source=folderEtc

	 [options] can contain original lessc options to pass to the compiler, or
	 --source=folder			Adds multiple source folders
	 --case-sensitive			Files and folders are parsed case-sensitive, including their dependencies. Useful on a non-windows machine"
	 --show-dependency
	 --show-dependencies		Prints dependencies between less files, so you can debug why certain files are generated together.
	 --generate-min-css
	 --generate-min			Enables generation of .min.css files as well as .css files. They will be optimized using --compress and --yui-compress arguments to lessc. --line-numbers will automatically be stripped out.
	
    Examples:  

    Outputting all to a custom folder i.e. css
	node lesswatch.js --line-numbers=mediaquery less css

	  That will watch ./less folder and compile the less css files into 
               ./css when they are added/changed and add mediaquery-formatted 
               debug info to the css for debugging with webkit-inspector.
    
    Outputting all to the same folder as where the less source was found
	node lesswatch.js --line-numbers=mediaquery less

	  That will watch ./less folder and compile the less css files into 
               ./less when they are added/changed and add mediaquery-formatted 
               debug info to the css for debugging with webkit-inspector.

    Monitoring multiple folders and outputting all to the same folder as where the less source was found
	node lesswatch.js --line-numbers=mediaquery --source=less --source=content --source=App

	That will watch ./less, ./content and ./App folders and compile the less css files into the same folder 
               as the .less files were found when they are added/changed and add mediaquery-formatted 
               debug info to the css for debugging with webkit-inspector.
             
*/
var allowedExtensions = ["less"];
var sys = require('util')
  , fs = require('fs')
  , path = require('path')
  , events = require('events')
  , exec = require('child_process').exec;

var args = process.argv.slice(2)
  , lessArgs = [] // arguments to pass to the lessc compiler for .css debug version
  , lessArgsMin = ['--yui-compress', '--compress'] // arguments to pass to the lessc compiler for .min.css runtime version
  , sourceFolders = []
  , destFolder
  , generateMinCss = false
  , showDependencies = false
  , caseSensitive = false
  , writeMediaQueryDebugInfo = false // flag to see if writing sass media query info was set
  , fixMediaQueryDebugInfo = true; // we could make this optional if we want

args.forEach(function (arg) {
	if (!arg.match(/^-+/)) {
		if (!sourceFolders.length)
			sourceFolders.push(arg);
		else if (!destFolder)
			destFolder = arg;
	}
	else {
		var source = /^-+-source=(.*)/i.exec(arg);
		if (source)
			sourceFolders.push(source[1]);
		else {
			if (arg.match(/\-\-show-dependencies/i) || arg.match(/\-\-show-dependency/i))
				showDependencies = true;
			else if (arg.match(/\-\-case-sensitive/i))
				caseSensitive = true;
			else if (arg.match(/\-\-generate-min/i) || arg.match(/\-\-generate-min-css/i))
				generateMinCss = true;
			else {
				lessArgs.push(arg);
				if (arg.match(/\-\-line\-numbers\=mediaquery/i))
					writeMediaQueryDebugInfo = true;
				else lessArgsMin.push(arg);
			}
		}
	}
});

if (!sourceFolders.length) {
	console.log("Usage:");
	console.log("  node lesswatch.js [options] <source-folder> [destination-folder] [--source=folder1] [--source=folder2] [--source=folder etc.]");
	console.log("  [options] can contain original lessc options to pass to the compiler, or");
	console.log("  --source=folder			Adds multiple source folders");
	console.log("  --case-sensitive			Files and folders are parsed case-sensitive, including their dependencies. Useful on a non-windows machine");
	console.log("  --show-dependency		");
	console.log("  --show-dependencies		Prints dependencies between less files, so you can debug why certain files are generated together.");
	console.log("  --generate-min-css		");
	console.log("  --generate-min			Enables generation of .min.css files as well as .css files. They will be optimized using --compress and --yui-compress arguments to lessc. --line-numbers will automatically be stripped out.");
	console.log("\nThe source-folder will be scanned recursively.\nPay attention when you are specifying `destination-folder` and naming multiple files with the same name but in different/sub foldersas they might get overriten.");
	console.log("\nTo export 'less/*.less' into 'css/*.css':");
	console.log("  node lesswatch.js less css");
	console.log("  node lesswatch.js --line-numbers=mediaquery less css");
	console.log("\nTo export the files into the same folder as the 'less/*.less' files are:");
	console.log("  node lesswatch.js less");
	console.log("  node lesswatch.js --line-numbers=mediaquery less");
	console.log("\nTo monitor and export multiple folders and export into the same folder as the '.less' files are:");
	console.log("  node lesswatch.js --source=less --source=App/Home --source=Content");
	console.log("  node lesswatch.js --line-numbers=mediaquery --source=less --source=App/Home --source=Content");
	process.exit(1);
}

// Walk the directory tree
function walk(dir, options, callback, initCallback) {
	if (!callback) { callback = options; options = {} }
	if (!options.files) options.files = {};
	if (!callback.pending) callback.pending = 0;
	var lowerCaseDir = fixCase(dir);
	if (!options.watching[lowerCaseDir]) {
		options.watching[lowerCaseDir] = 1;
		callback.pending += 1;
		fs.stat(dir, function (err, stat) {
			if (err) return callback(err);
			if (stat.isDirectory()) {//if dir is a folder, enumerate all its files 
				options.files[dir] = stat;//monitor this directory for add/delete files
				fs.readdir(dir, readDir.bind(this, dir));
			}
			else {
				delete options.watching[lowerCaseDir];//we've already set above it is watched, but it is a file, remove this so we can watch & parse it
				readDir("", null, [dir]);//otherwise it is a file, so only enumerate itself
			}

			if (callback.pending === 0) callback(null, options.files);

			function readDir(dir, err, files) {
				if (err) return callback(err);
				callback.pending -= 1;
				files.forEach(function (f, index) {
					f = path.join(dir, f);
					var lowerCaseFile = fixCase(f);
					if (!options.watching[lowerCaseFile]) {
						options.watching[lowerCaseFile] = 1;

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
								if (options.ignoreDotFiles && path.basename(f)[0] === '.') return done && callback(null, options.files);
								if (options.filter && options.filter(f, stat)) return done && callback(null, options.files);
								options.files[f] = stat;
								if (stat.isDirectory()) {
									delete options.watching[lowerCaseFile];//allow the sub-folder to be watched, since we'll walk through it
									walk(f, options, callback, initCallback);
								} else {
									initCallback && initCallback(f, stat);
								}

								if (done) {
									callback(null, options.files);
								}
							}
						})
					}
					//else console.log("File already parsed", lowerCaseFile);
				})
				if (callback.pending === 0) callback(null, options.files);
			}
		})
	}
	//else console.log("Folder or file already parsed", lowerCaseDir);
}

var watchFilePooling = {};//used for fs.watchFile as it executes too many times for the same change
var watchingFilesAndFolders = {};
//Setup fs.watchFile() for each file.
var watchTree = function (roots, options, watchCallback, initCallback) {
	if (!watchCallback) { watchCallback = options; options = {}, watching = {} }
	roots.forEach(function (root) {

		walk(root, options, callback, initCallback);

		function callback(err, files) {
			if (err) throw err;
			var fileWatcher = function (f) {
				console.log("Watch", f);
				if (watchingFilesAndFolders[f])
					return;
				watchingFilesAndFolders[f] = 1;
				fs.watchFile(f, options, function (c, p) {
					if (watchFilePooling[f] + 50 > new Date().getTime())
						return;
					watchFilePooling[f] = new Date().getTime();
					if (c.nlink === 0) {
						// unwatch removed files.
						if (files[f])
							watchCallback(f, c, p);
						delete files[f]
						fs.unwatchFile(f);
						return;
					}
					// Check if anything actually changed in stat
					if (files[f] && !files[f].isDirectory() && c.nlink !== 0 && files[f].mtime.getTime() == c.mtime.getTime()) return;
					files[f] = c;
					if (!c.isDirectory()) {
						if (options.ignoreDotFiles && (path.basename(f)[0] === '.')) return;
						if (options.filter && options.filter(f, c)) return;
						watchCallback(f, c, p);
					} else {
						fs.readdir(f, function (err, nfiles) {
							if (err) return;
							nfiles.forEach(function (b) {
								var file = path.join(f, b);
								if (!files[file]) {
									fs.stat(file, function (err, stat) {
										if (options.ignoreDotFiles && (path.basename(b)[0] === '.')) return;
										if (options.filter && options.filter(file, stat)) return;
										console.log("changed file", file);
										watchCallback(file, c, p);
										files[file] = stat;
										fileWatcher(file);
									});
								}
							})
						})
					}
				})
			}

			fileWatcher(root);
			for (var i in files) {
				fileWatcher(i);
			}
			watchCallback(files, null, null, {});
		}
	});
}

// String function to retrieve the filename without the extension
function getFilenameWithoutExtension(filename) {
	var parts = filename.replace(/^.*[\\\/]/, '').split(".");
	parts.pop();
	return parts.join(".");
}

// String function to retrieve the file's extension
function getFileExtension(filename) {
	var extension = filename.split(".").pop();
	if (extension == filename)
		return ""
	else
		return extension;
}

//Here's where we run the less compiler
function compileCSS(file) {
	var filename = getFilenameWithoutExtension(file);

	var destFile = destFolder ? destFolder + "/" + filename.replace(/\s+/g, "\\ ") + ".css" : path.join(path.dirname(file), filename.replace(/\s+/g, "\\ ") + ".css");
	console.log(new Date().toLocaleTimeString(), "lessc " + lessArgs.join(" ") + " " + path.relative(path.resolve(""), path.resolve(file)).replace(/\s+/g, "\\ ") + " ");
	var command = "lessc " + lessArgs.join(" ") + " " + file.replace(/\s+/g, "\\ ") + " " + destFile;
	// Run the command
	exec(command, function (error, stdout, stderr) {

		if (error !== null) {
			console.log('exec error: ' + error);
			console.log("stdout : " + stdout)
			console.log("stderr : " + stderr)
		}
		else {
			fs.stat(destFile, function (err, stat) {
				//delete empty .css files generated such as for variables.less or mixins.less
				if (!err)
					if (stat.size == 0) {
						//console.log("Dleeting empty file", destFile);
						fs.unlink(destFile, function(err) {
						});
					}
					else
						if (writeMediaQueryDebugInfo && fixMediaQueryDebugInfo) {
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
	});
	var minFile = destFile.replace(/.css$/i, ".min.css");
	if (generateMinCss) {
		command = "lessc " + lessArgsMin.join(" ") + " " + file.replace(/\s+/g, "\\ ") + " " + minFile;
		exec(command, function (error, stdout, stderr) {
			if (error !== null) {
				console.log('exec error: ' + error);
				console.log("stdout : " + stdout)
				console.log("stderr : " + stderr)
			}
			fs.stat(minFile, function (err, stat) {
				//delete empty .min.css files generated such as for variables.less or mixins.less
				if (!err)
					if (stat.size == 0) {
						fs.unlink(minFile, function(err) {
						});
					}
			});
		});
	}
	var f = path.resolve(file);
	f = fixCase(f);
	var oldDependencies = dependencies[f] || {};
	dependencies[f] = {};
	fs.readFile(f, 'utf8', function (err, data) {
		if (err) {
			console.log(f + ' cannot be read to determine url imports:', err);
			return;
		}
		data && data.replace(/\@import\s*(url)?\s*\(?[\s\'\"]*(.*\.less)[\s\'\"]*\)?\s*\;?/gi, function (match, u, url) {
			//console.log("import", u, url, f);
			if (!/\.less/gi.test(url))
				return match;
			var lessDir = path.dirname(f);
			var root = path.resolve("");
			var uriRegex = /(https?|file)(\:\/\/)(.*?)\/(.*)/gi;
			if (uriRegex.test(url))
				url.replace(uriRegex, function (match, protocol, protocol_suffix, domain, url) {
					addDependency("", root, url);
					return url;
				});
			else {
				addDependency("", lessDir, url);
			}
			return match;
			function addDependency(root, lessDir, relative, join) {
				relative = relative.replace(/\//g, '\\');
				var final = path.join(lessDir, relative);
				final = path.join(root, final);
				final = fixCase(final);
				if (dependencies[f][final])
					return;
				dependencies[f][final] = 1;

				//monitor external dependencies
				fs.stat(final, function (err, stat) {
					if (!err && !stat.isDirectory())
						watchFilesOrFolders([final]);
				});
				if (showDependencies && !oldDependencies[final])
					console.log("dep[", path.relative(path.resolve(''), f), "] +=", path.relative(path.resolve(''), final));
			}
		});
		if (showDependencies) {
			Object.getOwnPropertyNames(oldDependencies).forEach(function(oldDependency) {
				if (!dependencies[f][oldDependency])
					console.log("dep[", path.relative(path.resolve(''), f), "] -=", path.relative(path.resolve(''), oldDependency));
			});
		}

	});
}

// This is the function we use to filter the files to watch.
function filterFiles(f, stat) {
	var filename = getFilenameWithoutExtension(f);
	var extension = getFileExtension(f);
	if (!stat || !stat.isDirectory())
		if (filename.substr(0, 1) == "_" ||
		filename.substr(0, 1) == "." ||
		filename == "" ||
		allowedExtensions.indexOf(extension) < 0
		)
			return true;
	//console.log("filePath", f, "isDirectory", stat && stat.isDirectory(), "filename", filename, "extension", extension);
	return false;
}

console.log("Watching for changes of", allowedExtensions,"files recursively:", (sourceFolders.length > 1 ? "\n" : "") + sourceFolders.map(function (folder) { return path.resolve(folder); }).join("\n"), sourceFolders.length > 1 ? "\n" : "");
// Here's where we setup the watch function 
var dependencies = {};
var options = { interval: 500, ignoreDotFiles: true, filter: filterFiles, watching: {} };

function watchFilesOrFolders(filesOrFolders) {
	if (!Array.isArray(filesOrFolders))
		filesOrFolders = [filesOrFolders];
	watchTree(filesOrFolders, options, watchCallback, initCallback);
	function watchCallback(f, curr, prev, rebuilt) {
		if (typeof f == "object" && prev === null && curr === null) {
			// Finished walking the tree
			return;
		} else if (curr.nlink === 0) {
			// f was removed
			console.log(f + " was removed.")
		} else {
			var fullPath = fixCase(path.resolve(f));
			// f is a new file or changed
			//console.log("The file: "+f+ " was changed. "+new Date().toLocaleTimeString())
			if (!rebuilt)
				console.log("");

			rebuilt = rebuilt || {};
			if (!rebuilt[fullPath]) {
				rebuilt[fullPath] = 1;
				compileCSS(f);
				var compile = arguments.callee;
				for (var file in dependencies) {
					for (var f in dependencies[file]) {
						if (f == fullPath && file !== fullPath && !rebuilt[file]) {
							compile.call(this, file, {}, {}, rebuilt);
							break;
						}
					}
				}
			}
		}
	}
	function initCallback(f, stat) {
		//automatically detect dependencies such as @import url('a.less') or '../b.less' or '/c.less' or 'http://localhost/d.less'
		//so whenever they change generate its parents too!
		//console.log("compiling");
		compileCSS(f);
	}
}
watchFilesOrFolders(sourceFolders);

function fixCase(f) {
	return caseSensitive ? f : f && f.toLowerCase();
}