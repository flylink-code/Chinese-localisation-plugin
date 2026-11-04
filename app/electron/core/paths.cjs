'use strict'

const path = require('node:path')
const os = require('node:os')

function createPaths(userDataDir) {
  const home = os.homedir()
  return {
    home,
    userDataDir,
    stateFile: path.join(userDataDir, 'state.json'),
    configFile: path.join(userDataDir, 'config.json'),
    historyFile: path.join(userDataDir, 'history.json'),
    backupRoot: path.join(userDataDir, 'backups'),
    pluginRoot: path.join(userDataDir, 'plugins'),
    claudeSettings: path.join(home, '.claude', 'settings.json'),
    appResourcesDir: path.resolve(__dirname, '..', '..', 'resources'),
  }
}

module.exports = { createPaths }
