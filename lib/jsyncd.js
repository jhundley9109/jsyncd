import {Rsync} from 'rsync';
import chokidar from 'chokidar';
import * as fs from 'fs/promises';
import chalk from 'chalk';

const availableChalkColors = [
  chalk.hex('#FFAAAA'),
  chalk.blue,
  chalk.magenta,
  chalk.cyan,
  chalk.greenBright,
  chalk.blueBright,
  chalk.magentaBright,
  chalk.cyanBright,
];

class Jsyncd {
  constructor(config) {
    this._config = config;
    this._logFileHandle = null;
    this._rsyncOutputRegex = new RegExp(/^((<f\S*)|(cd\S*)) /gm);
    this._rsyncStartOfLineRegex = new RegExp(/^/gm);
  }

  async startSync() {
    const config = this._config;

    const apps = config.appConfigs;

    if (!Array.isArray(apps) || !apps.length) {
      throw new ConfigFileError('Invalid or empty config.appConfigs');
    }

    if (config.logFile) {
      await fs.open(config.logFile, 'a').then((tempLogHandle) => {
        console.log(`Sending logs to ${config.logFile}`);
        this._logFileHandle = tempLogHandle;
      }).catch((err) => {
        err.type = `Error writing to '${config.logFile}'. Ensure file exists and is writable.`;
        throw err;
      });
    }

    apps.forEach((appConfig, appIndex) => this.syncApp(appConfig, appIndex));
  }

  syncApp(appConfig, appIndex) {
    const config = this._config;

    const applicationDirectories = appConfig.directories;

    if (!Array.isArray(applicationDirectories) || !applicationDirectories.length) {
      throw new ConfigFileError(`Invalid or empty config.appConfig[${appIndex}].directories`);
    }

    let chokidarWatchOptions = {
      ...config.chokidarWatchOptions,
      ...appConfig.chokidarWatchOptions,
    };

    // Expect the ssh options to be exact key/value pairs that match the ssh manual
    let shellOptionsArray = Object.entries(appConfig.sshShellOptions || {});

    shellOptionsArray.forEach(entry => entry.forEach(e => {
      const t = typeof e;

      if (t !== 'string' && t !== 'number') {
        throw new ConfigFileError(`config.appConfig[${appIndex}].sshShellOptions must be strings or integers. Invalid option: ${JSON.stringify(entry)}`);
      }
    }));

    // filter out any key/values any empty strings and join them together for a formatted string representation of the object.
    const sshObjString = shellOptionsArray.map(entry => entry.filter(e => String(e) !== '').join(' ')).join(' ');
    const remoteHostUri = this.buildRemoteURI(appConfig.targetHostname, appConfig.targetUsername);

    let activeDirectorySyncs = [];

    applicationDirectories.forEach((directoryConfig, directoryIndex) => {
      let rsyncBuildOptions = {
        ...config.rsyncBuildOptions,
        ...appConfig.rsyncBuildOptions,
        ...directoryConfig,
      };

      if (!rsyncBuildOptions.source) {
        throw new ConfigFileError(`Missing appConfig[${appIndex}].directories[${directoryIndex}].source. Please setup a valid source path.`);
      }

      if (!rsyncBuildOptions.destination) {
        throw new ConfigFileError(`Missing appConfig[${appIndex}].directories[${directoryIndex}].destination. Please set up a valid destination path.`);
      }

      rsyncBuildOptions.destination = remoteHostUri + rsyncBuildOptions.destination;
      rsyncBuildOptions.shell = sshObjString && `ssh ${sshObjString}`;

      const directorySyncStatus = {};
      activeDirectorySyncs.push(directorySyncStatus);

      const sourcePath = rsyncBuildOptions.source;

      let appName = appConfig.name && ` ${appConfig.name}:[${directoryIndex + 1}]`;

      const modColors =  directoryIndex % availableChalkColors.length;
      const chalkColorFunc = availableChalkColors[modColors];

      const watcher = chokidar.watch(sourcePath, chokidarWatchOptions).on('all', (event, localFileDir) => {
        // this.sendDebugToLog(`Chokidar event: ${chalk.yellow(event)} Monitored Path: ${chalk.yellow(localFileDir)}`, chalkColorFunc);

        // only listen for these events for now.
        if (event !== 'addDir' && event !== 'change' && event !== 'add') {
          return;
        }

        if (directorySyncStatus.syncing) {
          // this.sendDebugToLog(`Warning: A sync is already queued for ${chalk.green(sourcePath)} Skipping...`, chalkColorFunc);
          return;
        }

        const activeSyncArray = Object.values(activeDirectorySyncs).filter(directorySyncInfo => directorySyncInfo.syncing);

        if (!activeSyncArray.length) {
          this.sendToLog('\n');
        }

        directorySyncStatus.syncing = true;

        this.buildAndRunRsync(rsyncBuildOptions, chalkColorFunc, appName).then(() => {
          if (directorySyncStatus.firstSyncComplete) {
            directorySyncStatus.syncing = false;
          } else {
            watcher.on('ready', () => {
              directorySyncStatus.syncing = false;
            });
          }
        });
      });

      // When chokidar.ignoreInitial is false, it does a complete scan of all the files and folders under the directory structure.
      // This can take a while. Only run one rsync during that phase.
      watcher.on('ready', () => {
        directorySyncStatus.firstSyncComplete = true;
      });
    });
  }

  async buildAndRunRsync(rsyncBuildOptions, chalkColorFunc, appName='') {
    let rsync = Rsync.build(rsyncBuildOptions);

    this.sendToLog(`${this.getTimestamp()}${appName} Calling rsync for ${rsyncBuildOptions.source} -> ${rsyncBuildOptions.destination}`, chalkColorFunc);
    this.sendDebugToLog(rsync.command(), chalkColorFunc);

    let outputFirstLine = false;

    rsync.output(
      (stdoutHandle) => {
        let [outputContent, syncSuccess] = this.parseRsyncOutHandle(stdoutHandle);

        if (!outputFirstLine && syncSuccess) {
          this.sendToLog(`${this.getTimestamp()}${appName} Syncing new/modified files/dirs`, chalkColorFunc);
          outputFirstLine = true;
        }

        this.sendToLog(outputContent, chalkColorFunc);
      },
      (stderrHandle) => {
        let [outputContent] = this.parseRsyncOutHandle(stderrHandle);

        this.sendErrorToLog(`${this.getTimestamp()}${appName} Rsync error content:\n${outputContent}`);
      }
    );

    const exitCode = await rsync.execute().catch((error) => {
      this.sendErrorToLog(`${this.getTimestamp()}${appName} ${error}`);
      return error.code;
    });

    exitCode !== undefined && this.sendToLog(`${this.getTimestamp()}${appName} Finished with exitcode: ${exitCode}`, chalkColorFunc);
  }

  buildRemoteURI(hostname, username) {
    let remoteUri = username && username + '@';
    remoteUri += hostname && hostname + ':';

    return remoteUri || '';
  }

  parseRsyncOutHandle(fileHandle) {
    // rsync with the -i option has a coded description of the changes at the beginning of the filename. Just trim that off.
    let rsyncOutputRegex = this._rsyncOutputRegex;

    let rsyncOutString = fileHandle.toString().trim();

    let formattedOutput = rsyncOutString.replace(rsyncOutputRegex, '').replace(this._rsyncStartOfLineRegex, ' '.repeat(4));
    return [formattedOutput, rsyncOutString.match(rsyncOutputRegex)];
  }

  sendErrorToLog(contentToLog) {
    this.sendToLog(contentToLog, chalk.red);
  }

  sendWarningToLog(contentToLog) {
    this.sendToLog(contentToLog, chalk.yellow);
  }

  sendDebugToLog(contentToLog, chalkFunction) {
    this._config.debug && this.sendToLog(contentToLog, chalkFunction);
  }

  sendToLog(contentToLog, chalkFunction) {
    if (this._logFileHandle) {
      this._logFileHandle.write(contentToLog + '\n');
    } else {
      if (typeof chalkFunction === 'function') {
        console.log(chalkFunction(contentToLog));
      } else {
        console.log(contentToLog);
      }
    }
  }

  getTimestamp() {
    const date = new Date();
    return `${date.toDateString()} ${date.toTimeString().split(' ')[0]}`;
  }
}

class ConfigFileError extends Error {
  constructor(message) {
    super(message);
    this.type = 'Misconfigured config file';
  }
}

export default Jsyncd;