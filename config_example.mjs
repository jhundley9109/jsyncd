let config = {
  logFile: '/var/log/jsyncd/jsyncd.log',
  daemonize: false,
  debug: false,
  chokidarOptions: {
    ignoreInitial: true,
    ignored: [/ignore_default_folder_for_all_apps/, /\.git/],
    // usePolling: true,
    // interval: 3000,
    // followSymlinks: true
  },
  rsyncBuildOptions: {
    exclude: ['*.tmp', '*/node/*', '.auth', 'node_modules', '.git', '*.git*', '*.sublime-*', '.htaccess'],
    // recommended a and i as defaults
    // recommend s if your files can have special characters
    flags: ['a', 'O', 'i', 's'],
  },
  appConfigs: [{
    name: 'Virtual Box Instance',
    targetHostname: 'localhost',
    targetUsername: 'user_name',
    sshShellOptions: {
      '-p': '2222',
      '-i': '/home/user_name/.ssh/identity_file',
    },
    directories: [{
      source: '/var/some_project/',
      destination: '/home/user_name/git/some_project/',
      // any Rsync.build options can be set here and override any higher up settings.
      exclude: ['folder_in_source_to_not_sync']
    }],
    chokidarOptions: {
      // This app shouldn't sync on startup.
      ignoreInitial: false,
    },
  },
  {
    name: 'Remote Server',
    targetHostname: 'remote.example.com',
    targetUsername: 'remote_name',
    sshShellOptions: {
      '-i': '/home/user_name/.ssh/remote.example.com',
    },
    rsyncBuildOptions: {
      exclude: ['dont_sync_this_folder_for_all_directories']
    },
    directories: [
      {
        source: '/home/user/git/project/folder1',
        destination: '/home/user_name/git/some_project/',
      },
      {
        source: '/home/user/git/project/folder2',
        destination: '/home/user_name/git/some_project/',
      }
    ],
    chokidarOptions: {
      // Override global ignored directories
      ignored: [/node_modules/, /\.git/, /other_app_folder_to_ignore_watching/],
      followSymlinks: true
    },
  }],
};

export default config;
