#!/usr/bin/env node

import Jsyncd from '../lib/jsyncd.js';
import find from 'find-process';
import chalk from 'chalk';
import * as fs from 'fs';
import daemon from 'daemon';
import OptionParser from 'option-parser';

const processName = 'jsyncd';
const defaultConfigFilePath = `${process.env.HOME}/.config/${processName}/config.mjs`;

parseOptionsAndRunProgram();

function parseOptionsAndRunProgram() {
  const optionParser = new OptionParser();

  optionParser.addOption('l', 'log', 'Log file path', 'logFile')
    .argument('FILE', true);

  optionParser.addOption('k', 'kill', `Kill any running ${processName} processes and exit, true value continues program`, 'kill')
    .argument('CONTINUE', false);

  optionParser.addOption('h', 'help', 'Display this help message')
    .action(optionParser.helpAction(`[Options] [<ConfigFile>]\n
If <ConfigFile> is not supplied, defaults to '${defaultConfigFilePath}'
Command line options override settings defined in <ConfigFile>`));

  optionParser.addOption('v', 'version', 'Display version information and exit', 'version');
  optionParser.addOption('d', 'daemon', 'Detach and daemonize the process', 'daemon');
  optionParser.addOption('i', 'ignore', 'Pass `ignoreInitial` to `chokidarWatchOptions`, skips startup sync', 'ignoreInitial');
  optionParser.addOption('D', 'debug', 'Log the generated `Rsync.build` command', 'debug');

  let unparsed;

  try {
    unparsed = optionParser.parse();
  } catch (err) {
    console.log(`Error parsing cli options: ${err.message}`);
    process.exit();
  }

  if (optionParser.version.value()) {
    let packageJsonPath = new URL('../package.json', import.meta.url);
    const {version} = JSON.parse(fs.readFileSync(packageJsonPath));
    console.log(`${processName} version ${version}`);
    process.exit();
  }

  let configFilePath = unparsed.pop();

  if (!configFilePath) {
    configFilePath = defaultConfigFilePath;
  }

  const continueAfterKillProcess = optionParser.kill.value();

  if (continueAfterKillProcess !== undefined) {
    killRunningProcesses().then(() => {

      if (!continueAfterKillProcess) {
        console.log(chalk.red('Ending process... Pass -k=1 to kill any other running daemons and continue starting sync'));
        process.exit();
      }

      parseConfigFileAndStartProcess(configFilePath, optionParser);
    });
  } else {
    parseConfigFileAndStartProcess(configFilePath, optionParser);
  }
}

function parseConfigFileAndStartProcess(configFilePath, optionParser) {
  import(configFilePath).then((configObj) => {
    const config = configObj.default;

    console.log(chalk.green(`Read configuration file: ${configFilePath}`));

    config.logFile = optionParser.logFile.value() || config.logFile;

    if (optionParser.ignoreInitial.value() !== undefined) {
      config.chokidarWatchOptions.ignoreInitial = optionParser.ignoreInitial.value();
    }

    if (optionParser.debug.value() !== undefined) {
      config.debug = optionParser.debug.value();
    }

    if (optionParser.daemon.value() || config.daemonize) {
      if (!config.logFile) {
        console.log(chalk.red('-l, --log option required when using daemonize'));
        process.exit();
      }

      console.log(chalk.yellow(`Going to detach process for ${processName}. Program output can be found at '${config.logFile}'`));

      // pass cwd to work around an issue with the library passing the function process.cwd instead of the result
      daemon({cwd: process.cwd()});
    }

    process.title = `${processName} ${configFilePath}`;

    const jsyncd = new Jsyncd(config);

    jsyncd.startSync().catch((err) => {
      jsyncd.sendErrorToLog('Top level error, exiting the program. Exiting with error:');
      jsyncd.sendToLog(err);
      process.exit(1);
    });

    process.on('SIGINT', () => {
      jsyncd.sendWarningToLog(jsyncd.getTimestamp() + ' Caught SIGINT. Terminating...');
      process.exit();
    });

    process.on('SIGTERM', () => {
      jsyncd.sendWarningToLog(jsyncd.getTimestamp() + ' Caught SIGTERM. Terminating...');
      process.exit();
    });
  }).catch((err) => {
    console.log(chalk.red(`Problem reading or parsing configuration file: ${configFilePath}.`));
    console.log(`${err}`);
    process.exit(1);
  });
}

async function killRunningProcesses() {
  const pid = process.pid;

  const processList = await find('name', `${processName} `).catch((err) => {
    console.log(`Error getting process list: ${err}`);
  });

  for (let processInfo of processList) {
    let runningProcessPid = processInfo.pid;

    if (runningProcessPid === pid) {
      continue;
    }

    if (processInfo.cmd.includes('nodemon')) {
      continue;
    }

    console.log(chalk.yellow(`Killing a running ${processName} process. pid: ${runningProcessPid}`));
    process.kill(processInfo.pid);
  }
}
