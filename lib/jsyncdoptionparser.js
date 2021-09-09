import * as fs from 'fs';
import OptionParser from 'option-parser';
import find from 'find-process';

class JsyncdOptionParser extends OptionParser {
  constructor(param) {
    super(param);

    const processName = param.processName;
    const defaultConfigFilePath = param.defaultConfigFilePath;

    this.addOption('l', 'log', 'Log file path', 'logFile')
      .argument('FILE', true);

    this.addOption('k', 'kill', `Kill any running ${processName} processes and exit, true value exits program`, 'kill')
      .argument('CONTINUE', false)
      .action(async (stopAfterKillProcess) => {
        await killRunningProcesses(processName);

        if (stopAfterKillProcess && stopAfterKillProcess !== '0') {
          console.log(`Ending process due to option: -k=${stopAfterKillProcess}`);
          process.exit();
        }
      });

    this.addOption('h', 'help', 'Display this help message')
      .action(
        this.helpAction(`[Options] [<ConfigFile>]\n
  If <ConfigFile> is not supplied, defaults to '${defaultConfigFilePath}'
  Command line options override settings defined in <ConfigFile>`));

    this.addOption('v', 'version', 'Display version information and exit', 'version')
      .action(() => {
        let packageJsonPath = new URL('../package.json', import.meta.url);
        const {version} = JSON.parse(fs.readFileSync(packageJsonPath));
        console.log(`${processName} version ${version}`);
        process.exit();
      });

    this.addOption('d', 'daemon', 'Detach and daemonize the process', 'daemon');
    this.addOption('i', 'ignore', 'Pass `ignoreInitial` to `chokidarWatchOptions`, skips startup sync', 'ignoreInitial');
    this.addOption('D', 'debug', 'Log the generated `Rsync.build` command', 'debug');
  }
}

async function killRunningProcesses(processName) {
  const pid = process.pid;

  const processList = await find('name', `${processName} `).catch((err) => {
    console.log(`Error getting process list: ${err}`);
  });

  if (!processList.length) {
    return console.log(`Currently no ${processName} processes running`);
  }

  for (let processInfo of processList) {
    let runningProcessPid = processInfo.pid;

    if (runningProcessPid === pid) {
      continue;
    }

    if (processInfo.cmd.includes('nodemon')) {
      continue;
    }

    console.log(`Killing a running ${processName} process. pid: ${runningProcessPid}`);
    process.kill(processInfo.pid);
  }
}

export default JsyncdOptionParser;