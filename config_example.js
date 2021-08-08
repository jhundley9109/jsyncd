"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

let config = {
	logFile: '/var/log/jsyncd/jsyncd.log',
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
			localDir: '/home/user_name/git/some_project/',
			targetDir: '/var/some_project/',
			excludePattern: ['*.tmp', '*/node/*', '.auth', 'node_modules', '.git']
		}],
		chokidarOptions: {
			ignoreInitial: false,
			ignored: [/node_modules/, /\.git/]
		},
		// recommend a and i as defaults
		rsyncFlags: ['a', 'O', 'i']
	}],
}

module.exports = config;
