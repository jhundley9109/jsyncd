#!/usr/bin/env node

import Jsyncd from '../lib/jsyncd.js';
import chalk from 'chalk';
import daemon from 'daemon';
import {pathToFileURL} from 'url';
import JsyncdOptionParser from '../lib/jsyncdoptionparser.js';
import path from 'path';
import os from 'os';
import find from 'find-process';

const processName = 'jsyncd';
const defaultConfigFilePath = path.join(os.homedir(), '.config', processName, 'config.mjs');

const optionParser = new JsyncdOptionParser({
  processName: processName,
  defaultConfigFilePath: defaultConfigFilePath,
});

parseOptionsAndRunProgram();

async function parseOptionsAndRunProgram() {
  let unparsed;

  try {
    unparsed = optionParser.parse();
  } catch (err) {
    console.log(`Error parsing cli options: ${err.message}`);
    process.exit();
  }

  let configFilePath = unparsed.pop() || defaultConfigFilePath;

  const stopAfterKillProcess = optionParser.kill.value();

  if (stopAfterKillProcess !== undefined) {
    await killRunningProcesses();

    // Javascript allowing if ('0') true is REALLY dumb.
    if (stopAfterKillProcess && stopAfterKillProcess !== '0') {
      console.log(chalk.red(`Ending process due to option: -k=${stopAfterKillProcess}`));
      process.exit();
    }
  }

  parseConfigFileAndStartProcess(configFilePath);
}

function parseConfigFileAndStartProcess(configFilePath) {
  import(pathToFileURL(configFilePath)).then((configObj) => {
    const config = configObj.default;

    console.log(chalk.green(`Read configuration file: ${configFilePath}`));

    config.logFile = optionParser.logFile.value() || config.logFile;

    if (optionParser.ignoreInitial.value()) {
      config.chokidarWatchOptions.ignoreInitial = true;
    }

    if (optionParser.debug.value()) {
      config.debug = true;
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

    console.log(chalk.yellow(`Killing a running ${processName} process. pid: ${runningProcessPid}`));
    process.kill(processInfo.pid);
  }
}