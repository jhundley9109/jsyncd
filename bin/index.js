#!/usr/bin/env node

const jsyncd = require("../lib/start_sync");
const fs = require('fs');

const args = process.argv.splice(2);
let configFilePath = args[0];

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

// process.title = `jsyncd ${configFilePath}`

jsyncd.startSync(config);
