# Jsyncd

`jsyncd` is a daemon aimed at simplifying syncing file changes and deploying `rsync` syncs to configured hosts.

## Why?

  - Configure multiple apps to sync to various local and remote directories.
  - Goal to support MacOS, Windows, and Linux by using `Chokidar` as a unified file monitoring watcher.
  - More simple and expandalbe configurations options when compared to `Lsyncd`.

## Installation

## Getting started

Install with npm:

```
$ npm install -g jsyncd
```

If installed globally, simply run with:
```
$ jsyncd /path/to/config.mjs
```
or place the config file in ~/.config/jsyncd/config.mjs and run with:

```
$ jsyncd
```

## Options
-k --kill Kill all running instances of `jsyncd` and exit the program. Pass a truthy value to kill any existing daemons and continue the program. (-k=1)

Note: The config file path should always be the last option passed to the command

## Config File

The configuration file is the core of instructing `jsyncd` how to sync what files from where to who and where. The configuration file is a javascript module that exports a variable called `config`.

### Why not JSON?
Using a javascript module with exports allows simplifying RegEx passed to **directories.rsyncExcludePattern** and **chokidarWatchOptions.ignored** since you can write native JS and do not have to worry about escaping.

The basic structure is as follows:
  - The top level options control the entire program for all syncs.
  - The **appConfig** instructs each server/destination and how to connect including ssh authentication and other options.
  - Each **appConfig** has an array of directories. Multiple local directories can be synced to multiple destination directories.
  - Each **appConfig** can accept a full range of `chokidar` options instructing the program how/what directories to monitor for changes.
  - **rsyncFlags** option takes a full range of `rsync` flags instructing rsync on how to sync the files that are monitored by `chokidar`. Recommended to use at least '`a`' (archive) and '`i`' (itemized_changes for logging).
A default config file can be placed in `~/.config/jsyncd/config.mjs`. A template can be found in `config_example.mjs`.

Options are:
  - **logFile** Path to where STDOUT will be redirected. Required when `daemonize` is `true`.
  - **daemonize** (default: `false`) Detach process and run program as daemon.
  - **appConfig** An array of apps with configurations to sync.
    - **hostConfig** Optional: Configure a remote server as the target host to sync to.
      - **hostname** IP Address or domain of target.
      - **targetUsername** ssh username if not configured with ~/.ssh/config.
      - **sshOptions** Configure a non-standard port and/or an private key file. Options must have name/value pairs that match name/values in the ssh manual. These options build the `rsync -e "ssh -i {/path/to/privkey} -p {port}"` command.
    - **directories** An array of objects that configure local -> target directory syncs.
      - **source** Path to watch for changes and sync to `destination`.
      - **destination** Path to where `rsync` should send the files.
      - **rsyncExcludePattern** (default `[]`) passed to the `rsync.exclude` function. This is not necessarily the same as `chokidar.ignored` as that can monitor directories higher up the path and sync files in a child directory, such as node_modules and cost a lot of unneeded syncing.
    - **chokidarWatchOptions** May be any supported `chokidar` options and passed as `options` to `chokidar.watch(paths, [options])`.
    - **rsyncFlags** (default: `[]`) Passed to the `rsync.flags()` function.

Note: `rsyncFlags`, `chokidarWatchOptions`, and `rsyncExcludePattern` can be placed at any level higher up the object to set as default. For instance, if all your hosts have the same `rsyncExcludePattern`, you can set that value at the `config.rsyncExcludePattern` level. However, setting that again at a `config.appConfig` or `config.appConfig.directories` level will override a higher up setting.

## Goals

Configuring multiple virtualbox environments with different projects became unwieldy so I was looking for a way to easily configure each target with a different set of rules for live file monitoring.
Originally, I had used the lsyncd project, which worked fine. But I found myself writing LUA in order to set up these rules until I built a program to manage `lsyncd` configuratings. This wasn't ideal since the configuration was LUA code and not completely config based due to the nature of the lua program.

Additionally, `lsyncd` has, at best, flakey support on MacOS depending on the distro and no support on Windows without a solution such as WSL. `jsyncd` solves these problems by simplifying a configuration file to manage all these live file syncs and file monitoring.