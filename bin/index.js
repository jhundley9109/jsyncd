#!/usr/bin/env node

'use strict'

const jsyncd = require("../lib/start_sync");
const fs = require('fs');
const OptionParser = require('option-parser');
const parser = new OptionParser();
const find = require('find-process');

let pid = process.pid;

// const args = process.argv.splice(2);

let killOption = parser.addOption('k', 'kill', 'Kill already running jsyncd processes')
  .action(killRunningProcesses)
  .argument('Continue[truthy]', false)

parser.addOption('h', 'help', 'Display this help message')
  .action(parser.helpAction())
;

// parser.parse();

const unparsed = parser.parse();

let shouldContinue= killOption.value();

if (!shouldContinue)
{
  console.log('Ending process. Pass -k=1 to kill any other running daemons and continue starting sync')
  process.exit();
}

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
  require('daemon')({cwd: process.cwd()})
}

process.title = `jsyncd ${configFilePath}`

jsyncd.startSync(config);


function killRunningProcesses(value)
{
  find('name', 'jsyncd').then((processList) => {
    for (let processInfo of processList)
    {
      let runningProcessPid = processInfo.pid;

      if (runningProcessPid === pid)
        continue;

      if (processInfo.cmd.substring('nodemon'))
        continue;

      console.log(`Killing a running jsyncd process. pid: ${runningProcessPid}`)
      process.kill(processInfo.pid)
    }
  }).catch((err) => {
    console.log("error?", err)
  })
}