"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

// Rename copy this file into ~/.config/jsyncd/config.js

let config = {
  rsyncLocation: '/usr/local/bin/rsync',
  appConfig: [{
    server: 'localhost',
    port: '22', // optional
    targetUsername: 'user_name',
    identityFile: '/home/user_name/.ssh/identityfile',
    directories: [{
      targetDir: '/remote/path/',
      localDir: '/home/user_name/git/your_project/',
      excludePattern: ['*.tmp', '*/node/*', '.auth', 'node_modules'] // files you do not wish to be synced
    }]
  }],
}

module.exports = config;
