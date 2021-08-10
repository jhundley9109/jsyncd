#!/usr/bin/env node

"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

const Rsync = require('rsync');
const chokidar = require('chokidar');
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

    let chokidarWatchOptions = {}
    if (syncConfig.chokidarWatchOptions !== undefined)
      chokidarWatchOptions = syncConfig.chokidarWatchOptions || {};
    else
      chokidarWatchOptions = config.chokidarWatchOptions || {};

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
      // let rsyncExcludePattern = directoryConfig.rsyncExcludePattern || [];

      let rsyncExcludePattern = [];

      if (directoryConfig.rsyncExcludePattern !== undefined)
      {
        rsyncExcludePattern = directoryConfig.rsyncExcludePattern;
      }
      else if (syncConfig.rsyncExcludePattern !== undefined)
      {
        rsyncExcludePattern = syncConfig.rsyncExcludePattern;
      }
      else if (config.rsyncExcludePattern !== undefined)
      {
        rsyncExcludePattern = config.rsyncExcludePattern;
      }

      let activeDirectorySyncs = {};

      chokidar.watch(sourcePath, chokidarWatchOptions).on('all', (event, localFileDir) => {

        // // only listen for these events for now.
        // sendToLog('event: ' + event + ' local dir ' + localFileDir)
        if (event != 'addDir' && event != 'change' && event != 'add')
        {
          return;
        }

        if (activeDirectorySyncs[localFileDir]) {
          sendToLog(`Warning: A sync is already queued for ${localFileDir} Skipping...`);
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

        if (syncConfig.rsyncFlags !== undefined)
          rsync.flags(syncConfig.rsyncFlags || []);
        else
          rsync.flags(config.rsyncFlags || []);

        if (rsyncExcludePattern.length)
            rsync.exclude(rsyncExcludePattern);

        sshConnectionString && rsync.set('e', sshConnectionString);

        let relativePathFromSource = localFileDir.replace(sourcePath, '')
        let completeDestinationPath = destinationPath + relativePathFromSource;

        rsync.destination(remoteHostUri + completeDestinationPath)
        rsync.source(localFileDir);

        sendToLog(getTimestamp() + ' Calling rsync for ' + localFileDir + ' -> ' + completeDestinationPath);
        activeDirectorySyncs[localFileDir] = true;

        rsync.execute((error, code, cmd) => {
          activeDirectorySyncs[localFileDir] = false;

          if (error)
          {
            sendToLog(getTimestamp() + ' Error syncing: ' + error);
          }
          else
          {
            sendToLog(getTimestamp() + ' Finished syncing ' + localFileDir + ' -> ' + completeDestinationPath);
          }
        }, (stdoutHandle) => {
          // rsync with the -i option has some weird junk at the beginning of the file name. Just trim that off.
          // sendToLog(stdoutHandle.toString())
          let formattedOutput = stdoutHandle.toString().replace(/<.*\.\. /g, '').trim();

          let formattedOutputArray = formattedOutput.split('\n')

          for (let outputLine of formattedOutputArray)
          {
            let fileAddedMessaging = '';

            if (outputLine.includes('cd+++++++++'))
            {
              fileAddedMessaging += ' (New directory added)';
              outputLine = outputLine.replace(/cd[+]+ /g, '')
            }

            if (outputLine.includes('<f+++++'))
            {
              outputLine = outputLine.replace(/<f[+]+ /g, '')
              fileAddedMessaging += ' (New file added)';
            }

            sendToLog(`Rsync output${fileAddedMessaging}: ${outputLine}`)
          }
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
  const date = new Date();
  return date.toDateString() + ' ' + date.toTimeString().split(' ')[0];
}
