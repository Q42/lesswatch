LESS folder watcher with optional debug information
===================================================

A nodejs script that allows you to watch a folder for changes and compile the less css files into another folder, optionally passing original lessc compiler arguments. 
When the --line-numbers=mediaquery argument is used, this nodejs script will fix the syntax so that webkit understands it too.

I only added those latter modifications. All credits should go to those who did the most work (which is like 99%):

Jonathan Cheung for writing the entire less watcher
https://github.com/jonycheung/Dead-Simple-LESS-Watch-Compiler

Mikeal Rogers for writing the original folder watch script
https://github.com/mikeal/watch
       
Usage:     node lesswatch.js [options] <source-folder> <destination-folder>
Example:   node lesswatch.js --line-numbers=mediaquery less css
    
               That will watch ./less folder and compile the less css files into 
               ./css when they are added/changed and add mediaquery-formatted 
               debug info to the css for debugging with webkit-inspector.

###Installation instructions

First, install LESS. Best to make them accessible from anywhere in your shell.
```
npm install less --global
```
Then, install lesswatch.
```
npm install lesswatch -global
```

###Usage 
```
lesswatch [options] <source-folder> <destination-folder>
```
###Example 
```
lesswatch --line-numbers=mediaquery less css
```
That will watch ./less folder and compile the less css files into ./css when they are added/changed and add mediaquery-formatted debug info to the css for debugging with webkit-inspector.

* This script only compiles files with `.less` extension. More file extensions can be added by modifying the `allowedExtensions` array.
* Files that start with underscores `_style.css` or period `.style.css` are ignored. This behavior can be changed in the `filterFiles()` function.

Github: https://github.com/Q42/lesswatch