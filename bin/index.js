#!/usr/bin/env node

import Jsyncd from '../lib/jsyncd.js';
import chalk from 'chalk';
import daemon from 'daemon';
import {pathToFileURL} from 'url';
import JsyncdOptionParser from '../lib/jsyncdoptionparser.js';

const processName = 'jsyncd';

parseOptionsAndRunProgram();

async function parseOptionsAndRunProgram() {
  const optionParser = new JsyncdOptionParser({
    processName: processName,
  });

  await optionParser.parse().catch((err) => {
    console.log(`Error parsing cli options: ${err.message}`);
    process.exit();
  });

  const configFilePath = optionParser.configFilePath.value();

  const configObj = await import(pathToFileURL(configFilePath)).catch((err) => {
    console.log(chalk.red(`Problem reading or parsing configuration file: ${configFilePath}.`));
    console.log(`${err}`);
    process.exit(1);
  });

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

    console.log(chalk.yellow(`Process will detach. Output logged to '${config.logFile}'`));

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
}
