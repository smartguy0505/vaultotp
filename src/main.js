const { app, BrowserWindow, ipcMain, clipboard, nativeTheme, Menu, dialog, desktopCapturer, screen, session } = require('electron');
const path = require('path');
const vault = require('./vault');
const totp = require('./totp');
const qr = require('./qr');

let mainWindow = null;
let regionWindow = null;
let clipboardClearTimer = null;
const APP_ICON = path.join(__dirname, '..', 'assets', 'icon.ico');

function clearClipboardLater(text, delayMs = 30000) {
  if (clipboardClearTimer) clearTimeout(clipboardClearTimer);
  const expected = String(text || '');
  clipboardClearTimer = setTimeout(() => {
    clipboardClearTimer = null;
    try {
      if (clipboard.readText() === expected) clipboard.clear();
    } catch {
      // ignore clipboard races
    }
  }, delayMs);
}

function restoreMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function closeRegionWindow() {
  if (!regionWindow) return;
  try {
    regionWindow.close();
  } catch {
    // ignore
  }
  regionWindow = null;
}

async function captureDisplayImage(display) {
  const width = Math.max(800, Math.round(display.size.width * (display.scaleFactor || 1)));
  const height = Math.max(600, Math.round(display.size.height * (display.scaleFactor || 1)));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  if (!sources.length) throw new Error('No screen sources available');

  const matched =
    sources.find((source) => String(source.display_id) === String(display.id)) || sources[0];
  if (!matched || matched.thumbnail.isEmpty()) {
    throw new Error('Could not capture screen');
  }
  return matched.thumbnail;
}

function selectQrRegion(display, screenshot) {
  return new Promise((resolve) => {
    closeRegionWindow();

    const imageSize = screenshot.getSize();
    let settled = false;

    regionWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: path.join(__dirname, 'region-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('region:result', onResult);
      const win = regionWindow;
      regionWindow = null;
      if (win && !win.isDestroyed()) {
        win.removeAllListeners('closed');
        win.close();
      }
      resolve(result);
    };

    const onResult = (_event, payload) => {
      finish(payload || { ok: false, canceled: true });
    };

    ipcMain.on('region:result', onResult);

    regionWindow.on('closed', () => {
      regionWindow = null;
      finish({ ok: false, canceled: true });
    });

    regionWindow.loadFile(path.join(__dirname, 'renderer', 'region-select.html'));
    regionWindow.webContents.once('did-finish-load', () => {
      if (!regionWindow || regionWindow.isDestroyed()) return;
      regionWindow.webContents.send('region:init', {
        dataUrl: screenshot.toDataURL(),
        displayWidth: display.bounds.width,
        displayHeight: display.bounds.height,
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
      });
    });
    regionWindow.once('ready-to-show', () => {
      if (!regionWindow || regionWindow.isDestroyed()) return;
      regionWindow.show();
      regionWindow.setAlwaysOnTop(true, 'screen-saver');
      regionWindow.focus();
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 520,
    title: 'VaultOTP',
    icon: APP_ICON,
    backgroundColor: '#171717',
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

function allowCapturePermission(_webContents, permission) {
  return permission === 'media' || permission === 'display-capture' || permission === 'clipboard-sanitized-write';
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    restoreMainWindow();
  });
}

app.whenReady().then(async () => {
  if (!gotLock) return;
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.vaultotp.app');
  }
  nativeTheme.themeSource = 'dark';

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    allowCapturePermission(_webContents, permission)
  );
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowCapturePermission(_webContents, permission));
  });

  vault.init();
  await Promise.race([
    totp.syncClock(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
  setInterval(() => {
    totp.syncClock().catch(() => {});
  }, 10 * 60 * 1000);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  vault.lock();
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
  });
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

ipcMain.handle('vault:getSecret', (_e, id) => {
  try {
    return { ok: true, account: vault.getSecret(id) };
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

ipcMain.handle('qr:scanImage', async () => {
  try {
    if (!mainWindow) throw new Error('Window unavailable');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select QR code image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    const raw = qr.decodeQrFromFile(result.filePaths[0]);
    const parsed = qr.parseScannedPayload(raw);
    return { ok: true, ...parsed };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('qr:scanScreen', async () => {
  try {
    if (mainWindow) {
      mainWindow.hide();
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const screenshot = await captureDisplayImage(display);
    const selection = await selectQrRegion(display, screenshot);

    restoreMainWindow();

    if (!selection || selection.canceled || !selection.ok) {
      return { ok: false, canceled: true };
    }

    const rect = selection.rect || {};
    const x = Math.max(0, Math.round(rect.x || 0));
    const y = Math.max(0, Math.round(rect.y || 0));
    const width = Math.max(1, Math.round(rect.width || 0));
    const height = Math.max(1, Math.round(rect.height || 0));
    if (width < 8 || height < 8) {
      throw new Error('Selected region is too small');
    }

    const cropped = screenshot.crop({ x, y, width, height });
    const raw = qr.decodeQrFromNativeImage(cropped);
    const parsed = qr.parseScannedPayload(raw);
    return { ok: true, ...parsed };
  } catch (err) {
    closeRegionWindow();
    restoreMainWindow();
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('clipboard:write', (_e, text, options) => {
  const value = String(text || '');
  clipboard.writeText(value);
  const clearAfterMs = options && Number(options.clearAfterMs);
  if (Number.isFinite(clearAfterMs) && clearAfterMs > 0) {
    clearClipboardLater(value, clearAfterMs);
  }
  return { ok: true };
});
