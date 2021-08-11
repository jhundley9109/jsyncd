#!/usr/bin/env node
'use strict';

const Jsyncd = require("../lib/start_sync");
const fs = require('fs');
const OptionParser = require('option-parser');
const parser = new OptionParser();
const find = require('find-process');

let killOption = parser.addOption('k', 'kill', 'Kill already running jsyncd processes')
  .argument('Continue[truthy]', false);

parser.addOption('h', 'help', 'Display this help message')
  .action(parser.helpAction())
;

const unparsed = parser.parse();

let shouldContinue = parser.getopt().k;

if (shouldContinue !== undefined)
{
  killRunningProcesses(shouldContinue);
}
else
{
  parseConfigFileAndStartProcess(shouldContinue);
}

function parseConfigFileAndStartProcess()
{
  let configFilePath = unparsed.pop();

  if (!configFilePath)
  {
    configFilePath = `${process.env.HOME}/.config/jsyncd/config.js`;
  }

  let fileExists = fs.existsSync(configFilePath);

  if (!fileExists)
  {
    console.log(`Missing config file! Please place a config file at ${configFilePath}`);
    process.exit();
  }

  let config = {};

  try {
    config = require(configFilePath);
    console.log(`Read configuration file: ${configFilePath}`);
  }
  catch (err) {
    console.log(`Problem reading or parsing configuration file. Failed with error: ${err}`);
    process.exit();
  }

  if (config.daemonize)
  {
    if (!config.logFile)
    {
      console.log('logFile option required when using daemonize');
      process.exit();
    }

    console.log(`Going to detcah process for jsyncd. Program output can be found at '${config.logFile}'`);

    // pass cwd to work around an issue with the library passing the function process.cwd instead of the result
    require('daemon')({cwd: process.cwd()});
  }

  process.title = `jsyncd ${configFilePath}`;

  const jsyncd = new Jsyncd(config);
  jsyncd.startSync();

  process.on('SIGINT', () => {
    jsyncd.sendToLog(jsyncd.getTimestamp() + ' Caught SIGINT. Terminating...');
    process.exit();
  });

  process.on('SIGTERM', () => {
    jsyncd.sendToLog(jsyncd.getTimestamp() + ' Caught SIGTERM. Terminating...');
    process.exit();
  });
}

function killRunningProcesses(shouldContinue)
{
  const pid = process.pid;

  find('name', 'jsyncd').then((processList) => {
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
  }).catch((err) => {
    console.log("error?", err);
  }).then(() => {

    if (!shouldContinue)
    {
      console.log('Ending process. Pass -k=1 to kill any other running daemons and continue starting sync');
      process.exit();
    }

    parseConfigFileAndStartProcess();
  });
}
