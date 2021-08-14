import Rsync from 'rsync';
import chokidar from 'chokidar';
import {promises as fs} from 'fs';

class Jsyncd {
  constructor(config) {
    this._config = config;
    this._logFileHandle = null;

    if (config.logFile)
    {
      let tempLogHandle = fs.createWriteStream(config.logFile, {flags: 'a'});

      tempLogHandle.on('error', (err) => {
        err.type = `Error writing to '${config.logFile}'. Ensure file exists and is writable.`;
        throw err;
      });

      tempLogHandle.on('open', () => {
        console.log(`Sending logs to ${config.logFile}`);
        this._logFileHandle = tempLogHandle;
      });
    }
  }

  async startSync() {
    const config = this._config;

    let apps = config.appConfig;
    if (!Array.isArray(apps) || !apps.length) {
      let error = new Error('Invalid or empty config.appConfig');
      error.type = 'Misconfigured config file';
      throw error;
    }

    config.appConfig.forEach((syncConfig) => this.syncApp(syncConfig));
  }

  syncApp(syncConfig) {
    const config = this._config;

    const applicationFolders = syncConfig.directories;

    if (!Array.isArray(applicationFolders) || !applicationFolders.length) {
      let error = new Error('Invalid or empty config.appConfig.applicationFolders');
      error.type = 'Misconfigured config file';
      throw error;
    }

    let chokidarWatchOptions = {};
    if (syncConfig.chokidarWatchOptions !== undefined) {
      chokidarWatchOptions = syncConfig.chokidarWatchOptions || {};
    }
    else {
      chokidarWatchOptions = config.chokidarWatchOptions || {};
    }

    let remoteHostUri = '';
    let remoteConfig = syncConfig.hostConfig || {};
    let sshConnectionString = '';

    if (remoteConfig.targetUsername) {
      remoteHostUri += remoteConfig.targetUsername && remoteConfig.targetUsername + '@';
      remoteHostUri += remoteConfig.hostname + ':';

      let sshOptions = [];

      for (const [key, value] of Object.entries(remoteConfig.sshOptions || {})) {
        sshOptions.push(key, value);
      }

      if (sshOptions.length) {
        sshConnectionString += 'ssh ' + sshOptions.join(' ');
      }
    }

    applicationFolders.forEach((directoryConfig) => {
      let sourcePath = directoryConfig.source;
      let destinationPath = directoryConfig.destination;

      let rsyncExcludePattern = [];

      if (directoryConfig.rsyncExcludePattern !== undefined) {
        rsyncExcludePattern = directoryConfig.rsyncExcludePattern;
      }
      else if (syncConfig.rsyncExcludePattern !== undefined) {
        rsyncExcludePattern = syncConfig.rsyncExcludePattern;
      }
      else if (config.rsyncExcludePattern !== undefined) {
        rsyncExcludePattern = config.rsyncExcludePattern;
      }

      let activeDirectorySyncs = {};

      chokidar.watch(sourcePath, chokidarWatchOptions).on('all', (event) => {

        // // only listen for these events for now.
        // this.sendToLog('event: ' + event + ' local dir ' + localFileDir);
        if (event !== 'addDir' && event !== 'change' && event !== 'add') {
          return;
        }

        if (activeDirectorySyncs[sourcePath]) {
          // this.sendToLog(`Warning: A sync is already queued for ${sourcePath} Skipping...`);
          return;
        }

        activeDirectorySyncs[sourcePath] = true;

        let rsync = new Rsync();

        if (syncConfig.rsyncFlags !== undefined) {
          rsync.flags(syncConfig.rsyncFlags || []);
        }
        else {
          rsync.flags(config.rsyncFlags || []);
        }

        if (rsyncExcludePattern.length) {
          rsync.exclude(rsyncExcludePattern);
        }

        if (sshConnectionString) {
          rsync.set('e', sshConnectionString);
        }

        // let relativePathFromSource = localFileDir.replace(sourcePath, '');
        // let completeDestinationPath = destinationPath + relativePathFromSource;

        rsync.source(sourcePath);
        rsync.destination(remoteHostUri + destinationPath);

        this.sendToLog(`${this.timestampNormalLog()} Calling rsync for ${sourcePath} -> ${destinationPath}`);

        if (this._config.logRsyncCommand) {
          this.sendToLog(rsync.command());
        }

        this.runRsyncExecute(rsync).then((exitCode) => {
          this.sendToLog(`${this.timestampNormalLog()} Finished syncing with exitcode: ${exitCode}`);
        }).catch((error) => {
          this.sendToLog(`${this.getTimestamp()} Error syncing: ${error}`);
        }).then(() => {
          delete activeDirectorySyncs[sourcePath];
        });
      });
    });
  }

  runRsyncExecute(rsync) {
    return new Promise((resolve, reject) => {
      let outputFirstLine = false;

      rsync.execute((error, exitCode) => {
        if (error) {
          return reject(error);
        }

        return resolve(exitCode);
      }, (stdoutHandle) => {
        let outputContent = this.parseRsyncOutHandle(stdoutHandle);

        if (!outputFirstLine && outputContent.length) {
          this.sendToLog(`${this.timestampNormalLog()} Syncing new/modified files/dirs`);
          outputFirstLine = true;
        }

        this.sendToLog(outputContent);
      }, (stderrHandle) => {
        let outputContent = this.parseRsyncOutHandle(stderrHandle);

        this.sendToLog(`${this.getTimestamp()} Error syncing: ${outputContent}`);
      });
    });
  }

  parseRsyncOutHandle(stdoutHandle) {
    // rsync with the -i option has some weird junk at the beginning of the file name. Just trim that off.
    let formattedOutput = stdoutHandle.toString().replace(/.* /g, '').trim();

    return formattedOutput;
  }

  sendToLog(contentToLog) {
    if (this._logFileHandle) {
      this._logFileHandle.write(contentToLog + '\n');
    } else {
      console.log(contentToLog);
    }
  }

  timestampNormalLog() {
    return `${this.getTimestamp()} Normal:`;
  }

  getTimestamp() {
    const date = new Date();
    return date.toDateString() + ' ' + date.toTimeString().split(' ')[0];
  }
}

export default Jsyncd;