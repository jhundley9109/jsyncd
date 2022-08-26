var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import os from 'os';
import * as fs from 'fs';
import path from 'path';
import OptionParser from 'option-parser';
import find from 'find-process';
class JsyncdOptionParser extends OptionParser {
    constructor(param) {
        super(param);
        const processName = param.processName;
        this._configFilePath = path.join(os.homedir(), '.config', processName, 'config.mjs');
        this.addOption('c', 'configFilePath', 'Config file path, alternative option to supplying the filename as the last parameter', 'configFilePath')
            .argument('FILE', true)
            .action((filePath) => {
            this._configFilePath = filePath;
        });
        this.addOption('l', 'log', 'Log file path', 'logFile')
            .argument('FILE', true);
        this.addOption('k', 'kill', `Kill any running ${processName} processes and exit, true value exits program`, 'kill')
            .argument('CONTINUE', false)
            .action((stopAfterKillProcess) => __awaiter(this, void 0, void 0, function* () {
            yield killRunningProcesses(processName);
            if (stopAfterKillProcess && stopAfterKillProcess !== '0') {
                console.log(`Ending process due to option: -k=${stopAfterKillProcess}`);
                process.exit();
            }
        }));
        this.addOption('h', 'help', 'Display this help message')
            .action(this.helpAction(`[Options] [<ConfigFile>]\n
  If <ConfigFile> is not supplied, defaults to '${this._configFilePath}'
  Command line options override settings defined in <ConfigFile>`));
        this.addOption('v', 'version', 'Display version information and exit', 'version')
            .action(() => {
            const packageJsonPath = new URL('../package.json', import.meta.url);
            const { version } = JSON.parse(fs.readFileSync(packageJsonPath).toString());
            console.log(`${processName} version ${version}`);
            process.exit();
        });
        this.addOption('d', 'daemon', 'Detach and daemonize the process', 'daemon');
        this.addOption('i', 'ignore', 'Pass `ignoreInitial` to `chokidarWatchOptions`, skips startup sync', 'ignoreInitial');
        this.addOption('D', 'debug', 'Log the generated `Rsync.build` command', 'debug');
    }
    parse(a = undefined) {
        const _super = Object.create(null, {
            parse: { get: () => super.parse }
        });
        return __awaiter(this, void 0, void 0, function* () {
            let unparsed = yield _super.parse.call(this, a);
            this._configFilePath = unparsed.pop() || this._configFilePath;
            if (!this.configFilePath.value()) {
                yield this.configFilePath.handleArgument('c', this._configFilePath);
            }
            return unparsed;
        });
    }
}
function killRunningProcesses(processName) {
    return __awaiter(this, void 0, void 0, function* () {
        const pid = process.pid;
        const processList = yield find('name', `${processName} `).catch((err) => {
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
            return console.log(`Currently no ${processName} processes running`);
        }
    });
}
export default JsyncdOptionParser;
//# sourceMappingURL=jsyncdoptionparser.js.map