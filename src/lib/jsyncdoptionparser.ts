import os from 'os';
import * as fs from 'fs';
import path from 'path';
// import OptionParser from 'option-parser';
import { Command } from 'commander';
import find from 'find-process';

class JsyncdOptionParser extends Command {
  _processName: string;

  constructor(processName: string) {
    super();

    this._processName = processName;

    const defaultConfigFilePath: string = path.join(os.homedir(), '.config', processName, 'config.mjs');

    this.option('-c, --configFile <configFilePath>', `Config file path.`, defaultConfigFilePath);
    this.option('-d, --daemon', 'Detach and daemonize the process');
    this.option('-D, --debug', 'Log the generated `Rsync.build` command');
    this.option('-i, --ignore', 'Pass `ignoreInitial` to `chokidarWatchOptions`');
    this.option('-k, --kill [exitProgram]', `Kill any running ${processName} processes and exit, '1' exits the program`);
    this.option('-l, --logFile <logFilePath>', 'Log file path');
    this.option('-v, --version', 'Display version information and exit', () => {
      const packageJsonPath = new URL('../../package.json', import.meta.url);
      const {version} = JSON.parse(fs.readFileSync(packageJsonPath).toString());
      console.log(`${processName} version ${version}`);
      process.exit();
    });
  }

  async killRunningProcesses() {
    const pid = process.pid;

    const processName = this._processName;

    const processList = await find('name', `${processName} `).catch((err: Error) => {
      console.log(`Error getting process list: ${err}`);
      return [];
    });

    let killedProcess = false;

    for (let processInfo of processList) {
      let runningProcessPid = processInfo.pid;

      // Skip if the looking at the currently running process or if the process is running in test mode.
      if (runningProcessPid === pid || processInfo.cmd.includes('nodemon')) {
        continue;
      }

      console.log(`Killing a running ${processName} process. pid: ${runningProcessPid}`);
      process.kill(processInfo.pid);

      killedProcess = true;
    }

    if (!killedProcess) {
      console.log(`Currently no ${processName} processes running`);
    }
  }
}

export default JsyncdOptionParser;