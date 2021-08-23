# Jsyncd

`jsyncd` is a daemon aimed at simplifying syncing real time file changes to local directories or remote hosts.

## Why?

- Configure multiple apps to sync to various local and/or remote directories.
- Goal to support MacOS, Windows, and Linux by using `Chokidar` as a unified file monitoring watcher.
- More simple and expandable configurations options when compared to `Lsyncd`.

## How

This program works by moinitoring `config.appConfigs.directories.source` for file system changes and firing off a dynamically built `Rsync.build` command.
Once a file in the directory has been modified, a `chokidar` event is triggered which causes to an `rsync` process to sync from `source` to `destination`.

## Getting started

Install with npm:

```bash
npm install -g jsyncd
```

If installed globally, run with:

```bash
jsyncd /path/to/config.mjs
```

Or place the config file in `~/.config/jsyncd/config.mjs` and run with:

```bash
jsyncd
```

## CLI Options

```options
-k, --kill      Kill all running instances of `jsyncd` and exit the program.
                Pass truthy value to continue program. [-k=1]
```

## Config File

The configuration file is the core of instructing `jsyncd` how to sync what files from where to who and where. The configuration file is a javascript module that exports a variable called `config`.

A default config file can be placed in `~/.config/jsyncd/config.mjs`. A template can be found in `config_example.mjs`.

**Note:** The config file path must be the last option passed to the `jsyncd` command.

### Options

- **logFile** - (default: `/var/log/jsyncd/jsyncd.log`) Path to where STDOUT will be redirected. Required when `daemonize` is `true`.
- **daemonize** - (default: `false`) Detach process and run program as daemon.
- **logRsyncCommand** - (default: `false`) Output the generated rsync command. Can help with debugging.
- **rsyncBuildOptions** - (default: `{}`) These are key value pairs passed to the `Rsync.build` function. The ones provided here are for example. All options from rsync are supported.
  - **flags** - (default: `''` OR `[]`) Optional: pass to the `Rsync.flags`. Typical defaults may include `a` for archive and `i` to log individual files as they sync to the `config.logFile`.
  - **exclude** - (default: `[]`) Optional: passed to the `Rsync.exclude` function. Folders and files for rsync to ignore under the `source` directory. Specifying here will be a default for all sources.
- **appConfigs** - (default: `[{}]`) An array of objects where each `appConfig` defines a host -> remote server connection and path monitoring options.
  - **name** - (default: '') Optional: Give your app a name. It'll show up in the logs when this app syncs to give you further insight on what is actively syncing.
  - **rsyncBuildOptions** - (default: `{}`) Overide the global `Rsync.build` options for this app. Specified keys replace higher up keys.
  - **targetHostname** - (default: `''`) Optional: IP Address or domain of target.
  - **targetUsername** - (default: `''`) Optional: ssh username if not configured with ~/.ssh/config. `targetHostname` is required if this is specified.
  - **sshOptions** - (default: `{}`) Optional: Configure a non-standard ssh options such as port and/or an private key file. Options must have key/value pairs that match key/values in the ssh manual. These options build the `rsync -e "ssh -i {/path/to/privkey} -p {port}"` command.
  - **directories** - (default: `[{}]`) An array of objects that configure local -> target directory syncs. Each key/value pair in each element of each object is passed to `Rsync.build` and is an `rsyncBuildOptions` configuration.
    - **source** - (required) Path to watch for changes and sync to `destination`. A trailing slash on the directory will sync the contents such as `/path/*`. No trailing slash copies the entire directory.
    - **destination** - (required) Path to where `rsync` should send the files.
    - **exclude** - (default: []) Optional: Specify specific exclude files/folders for this source to exclude.
  - **chokidarWatchOptions** - (default: `{}`) May be any supported `chokidar` options and passed as `options` to `chokidar.watch(paths, [options])`. Common parameters may be `ignoreInitial` and `ignored` though there are many other options such as setting up polling instead of event based callbacks.

Note: `rsyncBuildOptions` cascade from the top level down to the `directories` level with the most specific key/value pair being what is passed to `Rsync.build`. This allows you to set global defaults, app defaults, and override specific directories with unique settings. For instance, if all your hosts have the same `rsyncExcludePattern`, you can set that value at the `config.rsyncExcludePattern` level. However, setting that again at a `config.appConfig` or `config.appConfig.directories` level will override a higher up setting.

Note2: `chokidarWatchOptions` cascades from the top level down to the `appConfigs` level with the most specific key/value paris being what is passed to `chokidar.watch(paths, [options])`

### Why not JSON?

Using a javascript module with exports allows simplifying RegEx passed to `directories.rsyncExcludePattern` and `chokidarWatchOptions.ignored` since you can write native JS and do not have to worry about escaping.

Additionally, you can write some logic/functions to dynamically generate configuration directives with plain javascript.

## Goals

Configuring multiple virtualbox environments with different projects became unwieldy so I was looking for a way to easily configure each target with a different set of rules for live file monitoring.
Originally, I had used the lsyncd project which worked fine, but I found myself writing LUA in order to set up these rules until I built a program to manage `lsyncd` configuratings. This wasn't ideal since the configuration was in LUA.

Additionally, `lsyncd` has, at best, flakey support on MacOS depending on the MacOS version and no support on Windows without a solution such as WSL or cygwin. `jsyncd` solves these problems by simplifying a configuration file to manage all these live file syncs and file monitoring that should be interoperable between platforms.
