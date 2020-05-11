#!/usr/bin/env node

"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

// const fsevents = require('fsevents');
// console.log(__dirname)
// const stop = fsevents.watch(__dirname, (path, flags, id) => {
//   const info = fsevents.getInfo(path, flags, id);
//   console.log(info)
// }); // To start observation
// stop();

let config = require(process.env.HOME + '/.config/jsyncd/config');

const chokidar = require('chokidar');
const moment = require('moment');
const exec = require('child_process').exec;

let excludePattern = ['*.tmp', '*/node/*', '.auth'];

let excludeString = excludePattern.reduce((acc, cv) => {
	return acc + ' --exclude ' + cv;
}, '');

let watcherObj;

config.appConfig.forEach((site) => {
	let applicationFolders = [site.appName + '/', "shared/"];

	applicationFolders.forEach((apllicationFolder) => {

		let completeLocalSourceDir = config.localDir + apllicationFolder;

		let activeDirectorySyncs = {};

		watcherObj = chokidar.watch(completeLocalSourceDir).on('all', (event, localFileDir) => {

			// only listen for these events for now.
			if (event != 'addDir' && event != 'change' && event != 'add')
			{
				return;
			}

			if (activeDirectorySyncs[completeLocalSourceDir]) {
				// console.log("a sync is already queued for", completeLocalSourceDir);
				return;
			}

			activeDirectorySyncs[completeLocalSourceDir] = true;

			// let targetFilename = localFileDir.replace(completeLocalSourceDir, '');
			let completeTargetPath = getTargetFilePath(site);
			// console.log("trying to sync ", localFileDir, completeLocalSourceDir);
			syncFiles(completeLocalSourceDir, completeTargetPath, true, () => {

				activeDirectorySyncs[completeLocalSourceDir] = false;
			});
		});
	});
});

function getTargetFilePath(site) {
	return `${config.targetUsername}@${site.endpoint}:${config.remoteDir}${site.appName}/current/`;
}

function syncFiles(localPath, completeTargetPath, isRecursive, callback) {

	console.log(moment().format('ddd MMMM D YYYY H:mm:ss') + ' Calling rsync for ' + localPath);
	let options = [];

	options.push('-r'); // recursive
	options.push('-t'); // times
	options.push('-O'); // but don't set directory times
	// options.push('--progress'); // verbose
	options.push('-i'); // itemized changes
	// options.push('-v'); // verbose

	let optionsString = options.join(' ');

	exec(`${config.rsyncLocation} ${optionsString} ${excludeString} ${localPath} ${completeTargetPath}`, (error, stdout, stderr) => {
		// rsync with the -i option has some weird junk at the beginning of the file name. Just trim that off.
		let formattedOutput = stdout.replace(/<.*\.\. /, '').trim();

		if (formattedOutput)
			console.log(formattedOutput);

		console.log(moment().format('ddd MMMM D YYYY H:mm:ss') + ' Finished syncing ' + localPath);

		if (typeof callback != 'undefined') {
			callback();
		}
	});
}

process.on('SIGINT', () => {
	console.log("caught it");

	watcherObj.close().then(() => {
		console.log("Closed everything");
		process.exit();
	});
});

// One-liner for current directory
// chokidar.watch(sourceDirectory).on('all', (event, path) => {
// 	exec(`${rsyncLocation} -t ${path} ${targetUsername}@${targetHostname}:/home/webapps/${targetDirectory}/current/`, (error, stdout, stderr) => {
// 		console.log("on the callback", error, stdout, stderr)
// 	})
// });