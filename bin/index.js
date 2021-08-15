#!/usr/bin/env node

import Jsyncd from '../lib/jsyncd.js';
import OptionParser from 'option-parser';
import find from 'find-process';

parseOptionsAndRunProgram();

function parseOptionsAndRunProgram() {
  const parser = new OptionParser();

  let killOption = parser.addOption('k', 'kill', 'Kill already running jsyncd processes')
    .argument('Continue[truthy]', false);

  parser.addOption('h', 'help', 'Display this help message')
    .action(parser.helpAction());

  const unparsed = parser.parse();

  let configFilePath = unparsed.pop();

  if (!configFilePath)
  {
    configFilePath = `${process.env.HOME}/.config/jsyncd/config.mjs`;
  }

  const continueAfterKillProcess = killOption.value();

  if (continueAfterKillProcess !== undefined)
  {
    killRunningProcesses().then(() => {

      if (!continueAfterKillProcess)
      {
        console.log('Ending process. Pass -k=1 to kill any other running daemons and continue starting sync');
        process.exit();
      }

      parseConfigFileAndStartProcess(configFilePath);
    });
  }
  else
  {
    parseConfigFileAndStartProcess(configFilePath);
  }
}

function parseConfigFileAndStartProcess(configFilePath) {
  import(configFilePath).then((configObj) => {
    const config = configObj.default;

    console.log(`Read configuration file: ${configFilePath}`);

    if (config.daemonize)
    {
      if (!config.logFile)
      {
        console.log('logFile option required when using daemonize');
        process.exit();
      }

      console.log(`Going to detach process for jsyncd. Program output can be found at '${config.logFile}'`);

      // pass cwd to work around an issue with the library passing the function process.cwd instead of the result
      require('daemon')({cwd: process.cwd()});
    }

    process.title = `jsyncd ${configFilePath}`;

    const jsyncd = new Jsyncd(config);

    jsyncd.startSync().catch((err) => {
      jsyncd.sendToLog('Top level error, exiting the program. Exiting with error:');
      jsyncd.sendToLog(err);
      process.exit(1);
    });

    process.on('SIGINT', () => {
      jsyncd.sendToLog(jsyncd.getTimestamp() + ' Caught SIGINT. Terminating...');
      process.exit();
    });

    process.on('SIGTERM', () => {
      jsyncd.sendToLog(jsyncd.getTimestamp() + ' Caught SIGTERM. Terminating...');
      process.exit();
    });
  }).catch((err) => {
    console.log(`Problem reading or parsing configuration file: ${configFilePath}.`);
    console.log(`Failed with error: `, err);
    process.exit(1);
  });
}

async function killRunningProcesses()
{
  const pid = process.pid;

  const processList = await find('name', 'jsyncd ').catch((err) => {
    console.log(`Error getting process list: ${err}`);
  });

  for (let processInfo of processList)
  {
    let runningProcessPid = processInfo.pid;

    if (runningProcessPid === pid)
    {
      continue;
    }

    if (processInfo.cmd.includes('nodemon'))
    {
      continue;
    }

    console.log(`Killing a running jsyncd process. pid: ${runningProcessPid}`);
    process.kill(processInfo.pid);
  }
}
