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

// let appConfig = [
// 	// {appName: 'eretailing', endpoint: 'dev.eretailing.com'},
// 	{appName: 'fastplatform_jobs', endpoint: 'dev.eretailing.com'},
// 	// {appName: 'fastplatform', endpoint: 'dev.fastplatform.com'},
// ];

// let rsyncLocation = "/usr/local/bin/rsync";
// let targetUsername = 'jacob';
// let remoteDir = "/home/webapps/";
// let localDir = '/Users/Yennei/git/webapp/';

let config = require('./config');

const chokidar = require('chokidar');
const exec = require('child_process').exec;

let excludePattern = ['*.tmp', '*/node/*'];

let excludeString = excludePattern.reduce((acc, cv) => {
	return acc + ' --exclude ' + cv;
}, '');

config.appConfig.forEach((site) => {
	let applicationFolders = [site.appName, "shared"];

	applicationFolders.forEach((apllicationFolder) => {

		let completeLocalSourceDir = config.localDir + apllicationFolder;

		let activeDirectorySyncs = {};

		chokidar.watch(completeLocalSourceDir).on('addDir', (localFileDir, stats) => {

			if (localFileDir == completeLocalSourceDir) {
				// This should only be hit during initialization. Or maybe if you move the whole directory structure... which has undefined behavior.
				if (activeDirectorySyncs[localFileDir]) {
					// activeSyncs[localFileDir] = true;
					console.log("already syncing source dir " + localFileDir, activeDirectorySyncs);
					return ;
				}

				// console.log("it really shouldn't ever hit up here")

				activeDirectorySyncs[localFileDir] = true;

			} else {
				let fileArray = localFileDir.split('/');
				fileArray.pop();
				let upADir = fileArray.join('/');

				// console.log("what is my active syncs up a dir", activeSyncs, localFileDir)

				if (activeDirectorySyncs[upADir]) {
					activeDirectorySyncs[localFileDir] = true;
					// console.log("already syncing " + localFileDir, activeSyncs);
					return ;
				}

				activeDirectorySyncs[localFileDir] = true;
			}

			let targetFilename = localFileDir.replace(completeLocalSourceDir, '');
			let completeTargetPath = getTargetFilePath(site, targetFilename);
			// console.log("trying to sync ", localFileDir, completeLocalSourceDir);
			syncFiles(localFileDir + '/', completeTargetPath, true, () => {

				let activeSyncArray = Object.keys(activeDirectorySyncs);
				// console.log(activeSyncArray, localFileDir)

				for (let i = 0; i < activeSyncArray.length; i++) {
					let activeSyncPath = activeSyncArray[i];

					// if (completedSyncPath.includes(activeSyncPath)) {
					if (activeSyncPath.includes(localFileDir)) {
						delete activeDirectorySyncs[activeSyncPath];
						// console.log("active sync path", activeSyncPath, "is part of", localFileDir, activeSyncs);
					}
				}
			});
		});

		let activeFileSyncs = {};

		chokidar.watch(completeLocalSourceDir).on('change', (localFilePath) => {

			let targetFilename = localFilePath.replace(completeLocalSourceDir, '');
			let completeTargetPath = getTargetFilePath(site, targetFilename);

			if (activeFileSyncs[localFilePath]) {
				// console.log("Already syncing", localFilePath)
				return ;
			}

			activeFileSyncs[localFilePath] = true;

			syncFiles(localFilePath, completeTargetPath, false, () => {
				delete activeFileSyncs[localFilePath];
			});
		});

		// chokidar.watch(completeLocalSourceDir).on('ready', () => console.log('Initial scan complete. Ready for changes'));
		// chokidar.watch(completeLocalSourceDir).on('all', (event, path) => {
		// 	console.log("all hit ", event, path);
		// });

	});
});

function getTargetFilePath(site, targetFilename) {
	return `${config.targetUsername}@${site.endpoint}:${config.remoteDir}${site.appName}/current${targetFilename}`;
}

function syncFiles(localPath, completeTargetPath, isRecursive, callback) {

	console.log("Syncing " + localPath + " to " + completeTargetPath);
	let options = [];

	if (isRecursive)
	{
		options.push('-r');
	}
	else
	{
		options.push('-t');
	}

	let optionsString = options.join(' ');

	exec(`${config.rsyncLocation} ${optionsString} ${excludeString} ${localPath} ${completeTargetPath}`, (error, stdout, stderr) => {
		console.log("Finished syncing " + localPath + " to " + completeTargetPath, error, stdout, stderr, "is recursive", isRecursive);

		if (typeof callback != 'undefined') {
			callback();
		}
	});
}

// One-liner for current directory
// chokidar.watch(sourceDirectory).on('all', (event, path) => {
// 	exec(`${rsyncLocation} -t ${path} ${targetUsername}@${targetHostname}:/home/webapps/${targetDirectory}/current/`, (error, stdout, stderr) => {
// 		console.log("on the callback", error, stdout, stderr)
// 	})
// });