#!/usr/bin/env node

"use strict";
/*jshint esversion: 6 */
/*jslint node: true */


let config = require(process.env.HOME + '/.config/jsyncd/config');

const Rsync = require('rsync');
const chokidar = require('chokidar');
const moment = require('moment');

let watcherObj;

config.appConfig.forEach((syncConfig) => {
  let applicationFolders = syncConfig.directories;


	applicationFolders.forEach((directoryConfig) => {
		let completeLocalSourceDir = directoryConfig.localDir;
		let completeTargetPath = directoryConfig.targetDir;
		let excludePattern = directoryConfig.excludePattern || [];

		let activeDirectorySyncs = {};

		let rsync = new Rsync();
		rsync.flags('r', 't', 'O', 'i');

		if (excludePattern.length)
				rsync.exclude(excludePattern);

		rsync.source(completeLocalSourceDir)
		rsync.destination(syncConfig.targetUsername + '@' + syncConfig.server + ':' + completeTargetPath)

		rsync.set('e', 'ssh -p ' + syncConfig.port + ' -i ' + syncConfig.identityFile)

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

			console.log(moment().format('ddd MMMM D YYYY H:mm:ss') + ' Calling rsync for ' + completeLocalSourceDir);
			activeDirectorySyncs[completeLocalSourceDir] = true;

			rsync.execute((error, code, cmd) => {
				// we're done
				activeDirectorySyncs[completeLocalSourceDir] = false;
				console.log(moment().format('ddd MMMM D YYYY H:mm:ss') + ' Finished syncing ' + completeLocalSourceDir);
				// console.log('rsync status', error, code, cmd)
			}, (stdoutHandle) => {
				// console.log("in stdout handle", stdoutHandle)
				// process.stdout.prin
				// rsync with the -i option has some weird junk at the beginning of the file name. Just trim that off.
				let formattedOutput = stdoutHandle.toString().replace(/<.*\.\. /g, '').trim();
				console.log(formattedOutput)
				// console.log(moment().format('ddd MMMM D YYYY H:mm:ss') + ' Finished syncing ' + cmd);
			});
		});
	});
});

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