const { app, BrowserWindow, ipcMain, clipboard, nativeTheme, Menu, dialog } = require('electron');
const path = require('path');
const vault = require('./vault');

let mainWindow = null;
const APP_ICON = path.join(__dirname, '..', 'assets', 'icon.ico');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 360,
    minHeight: 520,
    title: 'VaultOTP',
    icon: APP_ICON,
    backgroundColor: '#0b1220',
    show: false,
    frame: false,
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized', false);
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.vaultotp.app');
  }
  nativeTheme.themeSource = 'dark';
  vault.init();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  vault.lock();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  vault.lock();
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return { maximized: false };
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return { maximized: mainWindow.isMaximized() };
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => ({
  maximized: Boolean(mainWindow && mainWindow.isMaximized()),
}));

ipcMain.handle('vault:status', () => vault.getStatus());

ipcMain.handle('vault:setup', async (_e, password) => {
  try {
    await vault.setup(password);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:unlock', async (_e, password) => {
  try {
    await vault.unlock(password);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:lock', () => {
  vault.lock();
  return { ok: true };
});

ipcMain.handle('vault:list', () => {
  try {
    return { ok: true, accounts: vault.listAccounts() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:add', async (_e, account) => {
  try {
    const created = await vault.addAccount(account);
    return { ok: true, account: created };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:update', async (_e, id, patch) => {
  try {
    const updated = await vault.updateAccount(id, patch);
    return { ok: true, account: updated };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:remove', async (_e, id) => {
  try {
    await vault.removeAccount(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:codes', () => {
  try {
    return { ok: true, codes: vault.getCodes() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:changePassword', async (_e, currentPassword, newPassword) => {
  try {
    await vault.changePassword(currentPassword, newPassword);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:export', async (_e, password) => {
  try {
    if (!mainWindow) throw new Error('Window unavailable');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export encrypted backup',
      defaultPath: `vaultotp-backup-${new Date().toISOString().slice(0, 10)}.otpbak`,
      filters: [
        { name: 'VaultOTP Backup', extensions: ['otpbak'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    const exported = vault.exportBackupToFile(result.filePath, password);
    return { ok: true, path: exported.path, count: exported.count };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:importPick', async () => {
  try {
    if (!mainWindow) throw new Error('Window unavailable');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import backup',
      properties: ['openFile'],
      filters: [
        { name: 'VaultOTP Backup', extensions: ['otpbak', 'json', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    const filePath = result.filePaths[0];
    const info = vault.inspectBackupFile(filePath);
    return { ok: true, path: filePath, ...info };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:import', async (_e, filePath, password, replace) => {
  try {
    const summary = vault.importBackupFromFile(filePath, password, { replace: Boolean(replace) });
    return { ok: true, ...summary };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('clipboard:write', (_e, text) => {
  clipboard.writeText(String(text || ''));
  return { ok: true };
});
