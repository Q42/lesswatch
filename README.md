LESS folder watcher with optional debug information
===================================================

A nodejs script that allows you to watch a folder for changes and compile the less css files into another folder, optionally passing original lessc compiler arguments. 
When the --line-numbers=mediaquery argument is used, this nodejs script will fix the syntax so that webkit understands it too.

An enhanced version of [`G42/lesswatch`](https://github.com/Q42/lesswatch) with support of:
* recursive folders
* multiple source folders
* automatically detection of `@import`, when importing `.less` files, those will automatically be tracked, so when changed dependent files will be automatically generated as well. These will be re-detected every time a file is updated/changed.
* show-dependencies tree
* generate `.min.css` files
* delete empty `.css` and `.min.css` files for non-css, but less specific files such as  `variables.less` or `mixins.less` 
 
I only added those latter modifications. All credits should go to those who did the most work (which is like 99%):

Jonathan Cheung for writing the entire less watcher
https://github.com/jonycheung/Dead-Simple-LESS-Watch-Compiler

Mikeal Rogers for writing the original folder watch script
https://github.com/mikeal/watch
       
###Installation instructions

First, install LESS. Best to make them accessible from anywhere in your shell.
```
npm install less --global
```
Then, install less_watch.
```
npm install less_watch --global
```

###Usage 
```
less_watch [options] <source-folder> <destination-folder>
```
###Example 
```
less_watch --line-numbers=mediaquery less css
```
That will watch ./less folder and compile the less css files into ./css when they are added/changed and add mediaquery-formatted debug info to the css for debugging with webkit-inspector.

* This script only compiles files with `.less` extension. More file extensions can be added by modifying the `allowedExtensions` array.
* Files that start with underscores `_style.css` or period `.style.css` are ignored. This behavior can be changed in the `filterFiles()` function.


##Advanced options
 
###Usage:     
```bash
less_watch [options] <source-folder> [destination-folder] --source=folder1 --source=folder2 --source=folderEtc

 [options] can contain original lessc options to pass to the compiler, or
 --source=folder			Adds multiple source folders
 --case-sensitive			Files and folders are parsed case-sensitive, including their dependinces. Useful on a non-windows machine"
 --show-dependinces		Prints dependinces between less files, so you can debug why certain files are generated together.
 --generate-min			Enables generation of .min.css files as well as .css files. They will be optimized using --compress and --yui-compress arguments to lessc. --line-numbers will automatically be stripped out.
```	
###Examples:  

* Outputting all to a custom folder i.e. css
```
	less-watch --line-numbers=mediaquery less css
```

That will watch ./less folder and compile the less css files into 
         ./css when they are added/changed and add mediaquery-formatted 
         debug info to the css for debugging with webkit-inspector.
    
* Outputting all to the same folder as where the less source was found

```
less_watch --line-numbers=mediaquery less
```
  
  That will watch ./less folder and compile the less css files into 
        ./less when they are added/changed and add mediaquery-formatted 
        debug info to the css for debugging with webkit-inspector.

* Monitoring multiple folders and outputting all to the same folder as where the less source was found

```bash
less_watch --line-numbers=mediaquery --source=less --source=content --source=App
```

That will watch ./less, ./content and ./App folders and compile the less css files into the same folder 
        as the .less files were found when they are added/changed and add mediaquery-formatted 
        debug info to the css for debugging with webkit-inspector.
