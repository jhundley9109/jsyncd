#!/usr/bin/env node
import Jsyncd from '../lib/jsyncd.js';
import chalk from 'chalk';
import daemon from 'daemon';
import path from 'node:path';
import JsyncdOptionParser from '../lib/jsyncdoptionparser.js';
const processName = 'jsyncd';
await parseOptionsAndRunProgram();
async function parseOptionsAndRunProgram() {
    const optionParser = new JsyncdOptionParser(processName);
    await optionParser.parseAsync().catch((err) => {
        console.log(`Error parsing cli options: ${err.message}`);
        process.exit();
    });
    const options = optionParser.opts();
    if (options.kill) {
        await optionParser.killRunningProcesses();
        if (typeof options.kill !== 'boolean' && options.kill !== '0') {
            console.log(`Ending process due to option: -k=${options.kill}`);
            process.exit();
        }
    }
    const configFilePath = options.configFile;
    const configObj = await import(path.resolve(configFilePath)).catch((err) => {
        console.log(chalk.red(`Problem reading or parsing configuration file: ${configFilePath}.`));
        console.log(chalk.green('To create skeleton config file run this command:'));
        console.log(chalk.green(`    mkdir -p ${path.dirname(configFilePath)}; cp config_example.mjs ${configFilePath};`));
        console.log(`${err}`);
        process.exit(1);
    });
    const config = configObj.default;
    console.log(chalk.green(`Read configuration file: ${configFilePath}`));
    if (config === undefined) {
        console.log(chalk.red(`Config file '${configFilePath}' was read but it does not export a default 'config' variable. Please ensure ${configFilePath} includes an export statement i.e. 'export default config;'`));
        process.exit(1);
    }
    config.logFile = resolveHome(options.logFile || config.logFile);
    if (options.ignoreInitial) {
        config.chokidarWatchOptions.ignoreInitial = true;
    }
    if (options.debug) {
        config.debug = true;
    }
    if (options.daemon || config.daemonize) {
        if (!config.logFile) {
            console.log(chalk.red('-l, --log option required when using daemonize'));
            process.exit();
        }
        console.log(chalk.yellow(`Process will detach. Output logged to '${config.logFile}'`));
        // pass cwd to work around an issue with the library passing the function process.cwd instead of the result
        daemon({ cwd: process.cwd() });
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
// Allow ~/ syntax to define a log file path
function resolveHome(filepath = '') {
    if (filepath && filepath[0] === '~' && process.env.HOME) {
        return path.join(process.env.HOME, filepath.slice(1));
    }
    return filepath;
}
