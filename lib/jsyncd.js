import {Rsync} from '@jhundley/rsync';
import chokidar from 'chokidar';
import {promises as fs} from 'fs';
import chalk from 'chalk';

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
    let remoteConfig = syncConfig.hostConfigOptions || {};
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

    applicationFolders.forEach((directoryConfig, directoryIndex) => {
      let sourcePath = directoryConfig.source;
      let destinationPath = directoryConfig.destination;

      if (!sourcePath) {
        let error = new Error(`Missing appConfig.directories[${directoryIndex}].source. Please setup a valid source path.`);
        error.type = 'Misconfigured config file';
        throw error;
      }

      if (!destinationPath) {
        let error = new Error(`Missing appConfig.directories[${directoryIndex}].destination. Please set up a valid destination path.`);
        error.type = 'Misconfigured config file';
        throw error;
      }

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

      chokidar.watch(sourcePath, chokidarWatchOptions).on('all', (event, localFileDir) => {

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
          rsync.setFlags(syncConfig.rsyncFlags || []);
        }
        else {
          rsync.setFlags(config.rsyncFlags || []);
        }

        if (rsyncExcludePattern.length) {
          rsync.exclude(rsyncExcludePattern);
        }

        if (sshConnectionString) {
          rsync.set('e', sshConnectionString);
        }

        rsync.source(sourcePath);
        rsync.destination(remoteHostUri + destinationPath);

        this.sendToLog(`${this.getTimestamp()} Calling rsync for ${sourcePath} -> ${remoteHostUri + destinationPath}`);

        if (this._config.logRsyncCommand) {
          this.sendToLog(rsync.command());
        }

        this.runRsyncExecute(rsync).catch((err) => {
          this.sendToLog('Unhandled error with rsync module...');
          this.sendToLog(err);
        }).then(() => {
          delete activeDirectorySyncs[sourcePath];
        });
      });
    });
  }

  async runRsyncExecute(rsync) {
    let outputFirstLine = false;

    rsync.output((stdoutHandle) => {
      let [outputContent, syncSuccess] = this.parseRsyncOutHandle(stdoutHandle);

      if (!outputFirstLine && outputContent.length && syncSuccess) {
        this.sendInfoToLog(`${this.timestampNormalLog()} Syncing new/modified files/dirs`);
        outputFirstLine = true;
      }

      this.sendToLog(outputContent);
    }, (stderrHandle) => {
      let [outputContent] = this.parseRsyncOutHandle(stderrHandle);

      this.sendErrorToLog(`${this.getTimestamp()} ${outputContent}`);
    });

    return await rsync.execute().then((exitCode) => {
      this.sendInfoToLog(`${this.timestampNormalLog()} Finished syncing with exitcode: ${exitCode}`);
    }).catch((error) => {
      this.sendErrorToLog(`${this.getTimestamp()} ${error}`);
      this.sendToLog(error);
    });
  }

  parseRsyncOutHandle(fileHandle) {
    // rsync with the -i option has a coded description of the changes at the beginning of the file name. Just trim that off.
    let successfulSyncRegex = new RegExp(/^((<f\S*)|(cd\S*)) /gm);

    let rsyncOutString = fileHandle.toString().trim();

    let formattedOutput = rsyncOutString.replace(successfulSyncRegex, '');
    return [formattedOutput, rsyncOutString.match(successfulSyncRegex)];
  }

  sendInfoToLog(contentToLog) {
    if (this._logFileHandle) {
      this.sendToLog(contentToLog);
    } else {
      this.sendToLog(chalk.cyan(contentToLog));
    }
  }

  sendErrorToLog(contentToLog) {
    if (this._logFileHandle) {
      this.sendToLog(contentToLog);
    } else {
      this.sendToLog(chalk.red(contentToLog));
    }
  }

  sendWarningToLog(contentToLog) {
    if (this._logFileHandle) {
      this.sendToLog(contentToLog);
    } else {
      this.sendToLog(chalk.yellow(contentToLog));
    }
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