#!/usr/bin/env node
'use strict';

const Rsync = require('rsync');
const chokidar = require('chokidar');
const fs = require('fs');

class Jsyncd
{
  constructor(config)
  {
    this._config = config;
  }

  startSync()
  {
    const config = this._config;

    this._logFileHandle = process.stdout;

    if (config.logFile)
    {
      try {
        this._logFileHandle = fs.createWriteStream(config.logFile, {flags: 'a'});
      } catch (err) {
        console.log('Cannot open log for writing with message: ' + err);
        process.exit();
      }
    }

    config.appConfig.forEach((syncConfig) => {
      let applicationFolders = syncConfig.directories;

      let chokidarWatchOptions = {};
      if (syncConfig.chokidarWatchOptions !== undefined)
      {
        chokidarWatchOptions = syncConfig.chokidarWatchOptions || {};
      }
      else
      {
        chokidarWatchOptions = config.chokidarWatchOptions || {};
      }

      let remoteHostUri = '';
      let remoteConfig = syncConfig.hostConfig || {};
      let sshConnectionString = '';

      if (remoteConfig.targetUsername)
      {
        remoteHostUri += remoteConfig.targetUsername && remoteConfig.targetUsername + '@';
        remoteHostUri += remoteConfig.hostname + ':';

        let sshOptions = [];

        for (const [key, value] of Object.entries(remoteConfig.sshOptions || {})) {
          sshOptions.push(key, value);
        }

        if (sshOptions.length)
        {
          sshConnectionString += 'ssh ' + sshOptions.join(' ');
        }
      }

      applicationFolders.forEach((directoryConfig) => {
        let sourcePath = directoryConfig.source;
        let destinationPath = directoryConfig.destination;

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
          // this.sendToLog('event: ' + event + ' local dir ' + localFileDir)
          if (event !== 'addDir' && event !== 'change' && event !== 'add')
          {
            return;
          }

          if (activeDirectorySyncs[localFileDir]) {
            this.sendToLog(`Warning: A sync is already queued for ${localFileDir} Skipping...`);
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
            // this.sendToLog("***************************a sync is already queued for a parent directory")
            return;
          }

          let rsync = new Rsync();

          if (syncConfig.rsyncFlags !== undefined)
          {
            rsync.flags(syncConfig.rsyncFlags || []);
          }
          else
          {
            rsync.flags(config.rsyncFlags || []);
          }

          if (rsyncExcludePattern.length)
          {
              rsync.exclude(rsyncExcludePattern);
          }

          if (sshConnectionString)
          {
            rsync.set('e', sshConnectionString);
          }

          let relativePathFromSource = localFileDir.replace(sourcePath, '');
          let completeDestinationPath = destinationPath + relativePathFromSource;

          rsync.destination(remoteHostUri + completeDestinationPath);
          rsync.source(localFileDir);

          this.sendToLog(this.getTimestamp() + ' Calling rsync for ' + localFileDir + ' -> ' + completeDestinationPath);
          activeDirectorySyncs[localFileDir] = true;

          this.runRsyncExecute(rsync, localFileDir, completeDestinationPath, activeDirectorySyncs);
        });
      });
    });
  }

  runRsyncExecute(rsync, localFileDir, completeDestinationPath, activeDirectorySyncs) {
    rsync.execute((error, code, cmd) => {
      delete activeDirectorySyncs[localFileDir];

      if (error)
      {
        this.sendToLog(this.getTimestamp() + ' Error syncing: ' + error);
      }
      else
      {
        this.sendToLog(this.getTimestamp() + ' Finished syncing ' + localFileDir + ' -> ' + completeDestinationPath);
      }
    }, (stdoutHandle) => {
      // rsync with the -i option has some weird junk at the beginning of the file name. Just trim that off.
      // this.sendToLog(stdoutHandle.toString())
      let formattedOutput = stdoutHandle.toString().replace(/<.*\.\. /g, '').trim();

      let formattedOutputArray = formattedOutput.split('\n');

      for (let outputLine of formattedOutputArray)
      {
        let fileAddedMessaging = '';

        if (outputLine.includes('cd+++++++++'))
        {
          fileAddedMessaging += ' (New directory added)';
          outputLine = outputLine.replace(/cd[+]+ /g, '');
        }

        if (outputLine.includes('<f+++++'))
        {
          outputLine = outputLine.replace(/<f[+]+ /g, '');
          fileAddedMessaging += ' (New file added)';
        }

        this.sendToLog(`Rsync output${fileAddedMessaging}: ${outputLine}`);
      }
    }, (stderrHandle) => {
      let formattedOutput = stderrHandle.toString().replace(/<.*\.\. /g, '').trim();

      this.sendToLog('Rsync error: ' + formattedOutput);
    });
  }

  sendToLog(contentToLog) {
    this._logFileHandle.write(contentToLog + "\n");
  }

  getTimestamp() {
    const date = new Date();
    return date.toDateString() + ' ' + date.toTimeString().split(' ')[0];
  }
}


module.exports = Jsyncd;