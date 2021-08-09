"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

let config = {
  logFile: '/var/log/jsyncd/jsyncd.log',
  daemonize: false,
  appConfig: [{
    hostConfig: {
      hostname: 'localhost',
      targetUsername: 'user_name',
      sshOptions: {
        '-p': '2222',
        '-i': '/home/user_name/.ssh/identity_file',
      }
    },
    directories: [{
      source: '/var/some_project/',
      destination: '/home/user_name/git/some_project/',
      rsyncExcludePattern: ['*.tmp', '*/node/*', '.auth', 'node_modules', '.git']
    }],
    chokidarOptions: {
      ignoreInitial: false,
      ignored: [/node_modules/, /\.git/]
      // followSymlinks: true
    },
    // recommended a and i as defaults
    // recommend s if your files can have special characters
    rsyncFlags: ['a', 'O', 'i', 's']
  }],
}

module.exports = config;
