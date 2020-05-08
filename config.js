"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

let config = {};

config.appConfig = [
	{appName: 'fastplatform_jobs', endpoint: 'dev.eretailing.com'},
	// {appName: 'eretailing', endpoint: 'dev.eretailing.com'},
	// {appName: 'fastplatform', endpoint: 'dev.fastplatform.com'},
];

config.rsyncLocation = "/usr/local/bin/rsync";
config.targetUsername = 'jacob';
config.remoteDir = "/home/webapps/";
config.localDir = '/Users/Yennei/git/webapp/';

module.exports = config