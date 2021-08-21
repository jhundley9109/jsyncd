import {Rsync} from 'rsync';
import chokidar from 'chokidar';
import * as fs from 'fs';
import chalk from 'chalk';

let availableChalkColors = [
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

    let apps = config.appConfigs;
    if (!Array.isArray(apps) || !apps.length) {
      let error = new Error('Invalid or empty config.appConfigs');
      error.type = 'Misconfigured config file';
      throw error;
    }

    apps.forEach((appConfig, appIndex) => this.syncApp(appConfig, appIndex));
  }

  syncApp(appConfig, appIndex) {
    const config = this._config;

    const applicationFolders = appConfig.directories;

    if (!Array.isArray(applicationFolders) || !applicationFolders.length) {
      let error = new Error('Invalid or empty config.appConfig.applicationFolders');
      error.type = 'Misconfigured config file';
      throw error;
    }

    let chokidarWatchOptions = {
      ...appConfig.chokidarWatchOptions,
      ...config.chokidarWatchOptions,
    };

    applicationFolders.forEach((directoryConfig, directoryIndex) => {

      let rsyncBuildOptions = {
        ...config.rsyncBuildOptions,
        ...appConfig.rsyncBuildOptions,
        ...directoryConfig,
      };

      if (!rsyncBuildOptions.source) {
        let error = new Error(`Missing appConfig[${appIndex}].directories[${directoryIndex}].source. Please setup a valid source path.`);
        error.type = 'Misconfigured config file';
        throw error;
      }

      if (!rsyncBuildOptions.destination) {
        let error = new Error(`Missing appConfig[${appIndex}].directories[${directoryIndex}].destination. Please set up a valid destination path.`);
        error.type = 'Misconfigured config file';
        throw error;
      }

      let remoteHostUri = this.buildRemoteURI(appConfig.targetHostname, appConfig.targetUsername);

      rsyncBuildOptions.destination = remoteHostUri + rsyncBuildOptions.destination;

      let sshOptions = [];

      for (const [key, value] of Object.entries(appConfig.sshShellOptions || {})) {
        sshOptions.push(key, value);
      }

      if (sshOptions.length) {
        rsyncBuildOptions.shell = 'ssh ' + sshOptions.join(' ');
      }

      let sourcePath = rsyncBuildOptions.source;

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

        let appName = '';

        if (appConfig.name) {
          appName = ` ${appConfig.name}:[${directoryIndex}]`;
        }

        let modColors =  directoryIndex % availableChalkColors.length;

        let chalkColorFunc = availableChalkColors[modColors];

        this.sendColoredSyncToLog(`${this.getTimestamp()}${appName} Calling rsync for ${rsyncBuildOptions.source} -> ${rsyncBuildOptions.destination}`, chalkColorFunc);

        let rsync = Rsync.build(rsyncBuildOptions);

        if (this._config.logRsyncCommand) {
          this.sendWarningToLog(rsync.command());
        }

        let outputFirstLine = false;

        rsync.output(
          (stdoutHandle) => {
            let [outputContent, syncSuccess] = this.parseRsyncOutHandle(stdoutHandle);

            if (!outputFirstLine && syncSuccess) {
              this.sendColoredSyncToLog(`${this.timestampNormalLog()}${appName} Syncing new/modified files/dirs`, chalkColorFunc);
              outputFirstLine = true;
            }

            this.sendColoredSyncToLog(outputContent, chalkColorFunc);
          },
          (stderrHandle) => {
            let [outputContent] = this.parseRsyncOutHandle(stderrHandle);

            this.sendErrorToLog(`${this.getTimestamp()} ${outputContent}`);
          }
        );

        rsync.execute().then((exitCode) => {
          this.sendColoredSyncToLog(`${this.timestampNormalLog()}${appName} Finished syncing with exitcode: ${exitCode}`, chalkColorFunc);
        }).catch((error) => {
          this.sendErrorToLog(`${this.getTimestamp()} ${error}`);
          // this.sendToLog(error);
        }).then(() => {
          delete activeDirectorySyncs[sourcePath];
        });
      });
    });
  }

  buildRemoteURI(hostname, username) {

    let remoteUri = username && username + '@';
    remoteUri += hostname && hostname + ':';

    if (!remoteUri) {
      remoteUri = '';
    }

    return remoteUri;
  }

  parseRsyncOutHandle(fileHandle) {
    // rsync with the -i option has a coded description of the changes at the beginning of the file name. Just trim that off.
    let successfulSyncRegex = this._rsyncOutputRegex;

    let rsyncOutString = fileHandle.toString().trim();

    let formattedOutput = rsyncOutString.replace(successfulSyncRegex, '');
    return [formattedOutput, rsyncOutString.match(successfulSyncRegex)];
  }

  sendColoredSyncToLog(contentToLog, chalkFunction) {
    this.sendToLog(contentToLog, chalkFunction);
  }

  sendErrorToLog(contentToLog) {
    this.sendToLog(contentToLog, chalk.red);
  }

  sendWarningToLog(contentToLog) {
    this.sendToLog(contentToLog, chalk.yellow);
  }

  sendToLog(contentToLog, chalkFunction) {
    if (this._logFileHandle) {
      this._logFileHandle.write(contentToLog + '\n');
    } else {
      if (typeof chalkFunction == 'function') {
        console.log(chalkFunction(contentToLog));
      } else {
        console.log(contentToLog);
      }
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