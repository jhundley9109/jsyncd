"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

let config = {};

config.appConfig = [
	{appName: 'mywebapp', endpoint: 'www.example.com'},
];

config.rsyncLocation = "/usr/local/bin/rsync";
config.targetUsername = 'remote_server_name';
config.remoteDir = "/target/remote/directory";
config.localDir = '/Users/user/local/directory/to_sync/';

module.exports = config;