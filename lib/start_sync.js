#!/usr/bin/env node

"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

const Rsync = require('rsync');
const chokidar = require('chokidar');
const moment = require('moment');
const fs = require('fs');

const configFilePath = process.env.HOME + '/.config/jsyncd/config.js';

let fileExists = fs.existsSync(configFilePath);

if (!fileExists)
{
	console.log(`Missing config file! Please place a config file at ${configFilePath}`)
	process.exit();
}

let config = require(configFilePath);

let logFileHandle = null;
try {
	// logFileHandle = fs.openSync(config.logFile, 'a')
	logFileHandle = fs.createWriteStream(config.logFile, {flags: 'a'});
} catch (err) {
	console.log('Cannot open log for writing with message: ' + err)
	process.exit();
}

let watcherObj;

exports.startSync = function() {
	config.appConfig.forEach((syncConfig) => {
		let applicationFolders = syncConfig.directories;
		let chokidarOptions = syncConfig.chokidarOptions || {};

		let remoteHostUri = '';
		let remoteConfig = syncConfig.hostConfig || {};
		let sshConnectionString = '';

		if (remoteConfig.targetUsername)
		{
			remoteHostUri += remoteConfig.targetUsername && remoteConfig.targetUsername + '@'
			remoteHostUri += remoteConfig.hostname + ':';

			let sshOptions = [];

			for (const [key, value] of Object.entries(remoteConfig.sshOptions || {})) {
				sshOptions.push(key, value)
			}

			if (sshOptions.length)
			{
				sshConnectionString += 'ssh ' + sshOptions.join(' ');
			}
		}

		applicationFolders.forEach((directoryConfig) => {
			let completeLocalSourceDir = directoryConfig.localDir;
			let completeTargetPath = directoryConfig.targetDir;
			let excludePattern = directoryConfig.excludePattern || [];

			let activeDirectorySyncs = {};

			watcherObj = chokidar.watch(completeLocalSourceDir, chokidarOptions).on('all', (event, localFileDir) => {

				// // only listen for these events for now.
				// sendToLog('event: ' + event + ' local dir ' + localFileDir)
				if (event != 'addDir' && event != 'change' && event != 'add')
				{
					return;
				}

				if (activeDirectorySyncs[localFileDir]) {
					sendToLog("a sync is already queued for", localFileDir);
					return;
				}

				// foreach
				let alreadyRunningOnParent = false;

				let syncArray = Object.keys(activeDirectorySyncs);
				// syncArray.every(activeSync => {
				for (let activeSync of syncArray)
				{
					if (!alreadyRunningOnParent && activeDirectorySyncs[activeSync] && localFileDir.includes(activeSync))
					{
						alreadyRunningOnParent = true;
						return;
					}
				}

				if (alreadyRunningOnParent)
				{
					// sendToLog("***************************a sync is already queued for a parent directory")
					return;
				}

				let rsync = new Rsync();
				rsync.flags(syncConfig.rsyncFlags || []);

				if (excludePattern.length)
						rsync.exclude(excludePattern);

				sshConnectionString && rsync.set('e', sshConnectionString);
				rsync.destination(remoteHostUri + completeTargetPath)
				rsync.source(localFileDir);

				sendToLog(getTimestamp() + ' Calling rsync for ' + localFileDir);
				activeDirectorySyncs[localFileDir] = true;

				rsync.execute((error, code, cmd) => {
					activeDirectorySyncs[localFileDir] = false;

					if (error)
					{
						sendToLog(getTimestamp() + ' Error syncing: ' + error);
					}
					else
					{
						sendToLog(getTimestamp() + ' Finished syncing ' + localFileDir);
					}
				}, (stdoutHandle) => {
					// rsync with the -i option has some weird junk at the beginning of the file name. Just trim that off.
					// sendToLog(stdoutHandle.toString())
					let formattedOutput = stdoutHandle.toString().replace(/<.*\.\. /g, '').trim();

					sendToLog('Rsync output: ' + formattedOutput)
				}, (stderrHandle) => {
					let formattedOutput = stderrHandle.toString().replace(/<.*\.\. /g, '').trim();
					sendToLog('Rsync error: ' + formattedOutput)
				});
			});
		});
	});
}

function getTimestamp() {
	return moment().format('ddd MMMM D YYYY H:mm:ss')
}

function sendToLog(contentToLog) {
	logFileHandle.write(contentToLog + "\n")
}

process.on('SIGINT', () => {
	watcherObj.close().then(() => {
		sendToLog("Closed everything");
		logFileHandle.close();
		process.exit();
	});
});