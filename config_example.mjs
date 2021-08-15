let config = {
  logFile: '/var/log/jsyncd/jsyncd.log',
  daemonize: false,
  chokidarOptions: {
    ignoreInitial: true,
    ignored: [/ignore_default_folder_for_all_apps/, /\.git/],
    // usePolling: true,
    // interval: 3000,
    // followSymlinks: true
  },
  logRsyncCommand: false,
  appConfig: [{
    hostConfigOptions: {
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
      ignored: [/node_modules/, /\.git/, /other_app_folder_to_ignore_watching/]
      // followSymlinks: true
    },
    // recommended a and i as defaults
    // recommend s if your files can have special characters
    rsyncFlags: ['a', 'O', 'i', 's']
  }],
};

export default config;
