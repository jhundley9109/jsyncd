#!/usr/bin/env node

"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

const Rsync = require('rsync');
const chokidar = require('chokidar');
const moment = require('moment');
const fs = require('fs');

exports.startSync = function(config) {

  let logFileHandle = process.stdout;
  if (config.logFile)
  {
    try {
      logFileHandle = fs.createWriteStream(config.logFile, {flags: 'a'});
    } catch (err) {
      console.log('Cannot open log for writing with message: ' + err)
      process.exit();
    }
  }

  config.appConfig.forEach((syncConfig) => {
    let applicationFolders = syncConfig.directories;
    let chokidarWatchOptions = syncConfig.chokidarWatchOptions || {};

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
      let sourcePath = directoryConfig.source;
      let destinationPath = directoryConfig.destination;
      let rsyncExcludePattern = directoryConfig.rsyncExcludePattern || [];

      let activeDirectorySyncs = {};

      chokidar.watch(sourcePath, chokidarWatchOptions).on('all', (event, localFileDir) => {

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

        let alreadyRunningOnParent = false;

        let syncArray = Object.keys(activeDirectorySyncs);

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

        if (rsyncExcludePattern.length)
            rsync.exclude(rsyncExcludePattern);

        sshConnectionString && rsync.set('e', sshConnectionString);
        rsync.destination(remoteHostUri + destinationPath)
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

  function sendToLog(contentToLog) {
    logFileHandle.write(contentToLog + "\n")
  }

  process.on('SIGINT', () => {
    sendToLog(getTimestamp() + ' Caught SIGINT. Terminating...');
    process.exit();
  });

  process.on('SIGTERM', () => {
    sendToLog(getTimestamp() + ' Caught SIGTERM. Terminating...');
    process.exit();
  });
}

function getTimestamp() {
  return moment().format('ddd MMMM D YYYY H:mm:ss')
}
