import os from 'os';
import * as fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import find from 'find-process';
class JsyncdOptionParser extends Command {
    constructor(processName) {
        super();
        this._processName = processName;
        const defaultConfigFilePath = path.join(os.homedir(), '.config', processName, 'config.mjs');
        this.option('-c, --configFile <configFilePath>', 'Config file path.', defaultConfigFilePath);
        this.option('-d, --daemon', 'Detach and daemonize the process');
        this.option('-D, --debug', 'Log the generated `Rsync.build` command');
        this.option('-i, --ignore', 'Pass `ignoreInitial` to `chokidarWatchOptions`');
        this.option('-k, --kill [exitProgram]', `Kill any running ${processName} processes and exit, '1' exits the program`);
        this.option('-l, --logFile <logFilePath>', 'Log file path');
        this.option('-v, --version', 'Display version information and exit', () => {
            const packageJsonPath = new URL('../../package.json', import.meta.url);
            const { version } = JSON.parse(fs.readFileSync(packageJsonPath).toString());
            console.log(`${processName} version ${version}`);
            process.exit();
        });
    }
    async killRunningProcesses() {
        const pid = process.pid;
        const processName = this._processName;
        const processList = await find('name', `${processName} `).catch((err) => {
            console.log(`Error getting process list: ${err}`);
            return [];
        });
        let killedProcess = false;
        for (const processInfo of processList) {
            const runningProcessPid = processInfo.pid;
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
