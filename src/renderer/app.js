const gate = document.getElementById('gate');
const vaultView = document.getElementById('vault');
const gateForm = document.getElementById('gate-form');
const gateSubtitle = document.getElementById('gate-subtitle');
const gateSubmit = document.getElementById('gate-submit');
const gateError = document.getElementById('gate-error');
const passwordInput = document.getElementById('password');
const confirmField = document.getElementById('confirm-field');
const passwordConfirm = document.getElementById('password-confirm');
const passwordLabel = document.getElementById('password-label');

const codesEl = document.getElementById('codes');
const emptyEl = document.getElementById('empty');
const searchInput = document.getElementById('search');
const accountCount = document.getElementById('account-count');

const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const accountForm = document.getElementById('account-form');
const accountId = document.getElementById('account-id');
const accountLabel = document.getElementById('account-label');
const accountIssuer = document.getElementById('account-issuer');
const accountSecret = document.getElementById('account-secret');
const accountError = document.getElementById('account-error');
const accountSave = document.getElementById('account-save');
const seedActions = document.getElementById('seed-actions');
const btnToggleSeed = document.getElementById('btn-toggle-seed');
const btnCopySeed = document.getElementById('btn-copy-seed');

let revealedSeed = null;
let seedVisible = false;

const settingsModal = document.getElementById('settings-modal');
const passwordForm = document.getElementById('password-form');
const settingsError = document.getElementById('settings-error');
const settingsOk = document.getElementById('settings-ok');
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOk = document.getElementById('confirm-ok');
const transferModal = document.getElementById('transfer-modal');
const transferTitle = document.getElementById('transfer-title');
const transferMessage = document.getElementById('transfer-message');
const transferForm = document.getElementById('transfer-form');
const transferPasswordField = document.getElementById('transfer-password-field');
const transferPasswordLabel = document.getElementById('transfer-password-label');
const transferPassword = document.getElementById('transfer-password');
const transferReplaceField = document.getElementById('transfer-replace-field');
const transferReplace = document.getElementById('transfer-replace');
const transferError = document.getElementById('transfer-error');
const transferSubmit = document.getElementById('transfer-submit');

const toastEl = document.getElementById('toast');
const pwStrength = document.getElementById('pw-strength');
const pwStrengthLabel = document.getElementById('pw-strength-label');

let isSetupMode = false;
let pollTimer = null;
let toastTimer = null;
let autoLockTimer = null;
let vaultUnlocked = false;
let confirmResolver = null;
let transferMode = null;
let pendingImportPath = null;
let pendingTotpOpts = null;
let latestCodes = [];
let renderedListKey = '';
const RING_CIRCUMFERENCE = 2 * Math.PI * 14;
const AUTO_LOCK_KEY = 'vaultotp.autoLockMinutes';
const DEFAULT_AUTO_LOCK_MINUTES = 5;
const SHOW_CODES_KEY = 'vaultotp.showCodes';

const autoLockSelect = document.getElementById('auto-lock-minutes');
const toggleCodesBtn = document.getElementById('btn-toggle-codes');

let codesVisible = localStorage.getItem(SHOW_CODES_KEY) === '1';

function getAutoLockMinutes() {
  const raw = localStorage.getItem(AUTO_LOCK_KEY);
  if (raw === null) return DEFAULT_AUTO_LOCK_MINUTES;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_AUTO_LOCK_MINUTES;
}

function setAutoLockMinutes(minutes) {
  localStorage.setItem(AUTO_LOCK_KEY, String(minutes));
  resetAutoLockTimer();
}

function setCodesVisible(visible) {
  codesVisible = Boolean(visible);
  localStorage.setItem(SHOW_CODES_KEY, codesVisible ? '1' : '0');
  updateRevealButton();
  renderCodes(true);
}

function updateRevealButton() {
  toggleCodesBtn.textContent = codesVisible ? 'Hide' : 'Show';
  toggleCodesBtn.title = codesVisible ? 'Hide codes' : 'Show codes';
  toggleCodesBtn.setAttribute('aria-pressed', codesVisible ? 'true' : 'false');
}

function clearAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

function resetAutoLockTimer() {
  clearAutoLockTimer();
  if (!vaultUnlocked) return;
  const minutes = getAutoLockMinutes();
  if (minutes <= 0) return;
  autoLockTimer = setTimeout(() => {
    autoLockVault();
  }, minutes * 60 * 1000);
}

async function autoLockVault() {
  if (!vaultUnlocked) return;
  clearAutoLockTimer();
  closeAccountModal();
  closeSettings();
  closeTransferModal();
  closeScanModal();
  closeConfirm(false);
  setCodesVisible(false);
  await window.api.lock();
  vaultUnlocked = false;
  showGate();
  const status = await window.api.status();
  setGateMode(status.exists);
  showToast('Vault locked due to inactivity');
}

function noteActivity() {
  if (vaultUnlocked) resetAutoLockTimer();
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2200);
}

function notifyClockSkew(status) {
  const skew = Number(status && status.clockOffsetMs);
  if (!Number.isFinite(skew) || Math.abs(skew) < 15000) return;
  const minutes = Math.max(1, Math.round(Math.abs(skew) / 60000));
  showToast(`System clock is ${minutes} min off — codes use network time`);
}

function formatCode(code) {
  if (!codesVisible) return code && code.length >= 8 ? '•••• ••••' : '••• •••';
  if (!code || code.length < 6) return code || '------';
  if (code.length === 7) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function issuerInitials(item) {
  const source = String(item.issuer || item.label || '?').trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function parseSecretInput(raw) {
  return String(raw || '').trim();
}

function setGateMode(exists) {
  isSetupMode = !exists;
  pwStrength.classList.add('hidden');
  if (isSetupMode) {
    gateSubtitle.textContent = 'Create a master password to encrypt your 2FA seeds';
    passwordLabel.textContent = 'Create master password';
    gateSubmit.textContent = 'Create vault';
    confirmField.classList.remove('hidden');
    passwordConfirm.required = true;
  } else {
    gateSubtitle.textContent = 'Unlock your encrypted authenticator vault';
    passwordLabel.textContent = 'Master password';
    gateSubmit.textContent = 'Unlock';
    confirmField.classList.add('hidden');
    passwordConfirm.required = false;
  }
}

function showGate() {
  stopPolling();
  clearAutoLockTimer();
  vaultUnlocked = false;
  vaultView.classList.add('hidden');
  gate.classList.remove('hidden');
  gateError.textContent = '';
  passwordInput.value = '';
  passwordConfirm.value = '';
  passwordInput.focus();
  renderedListKey = '';
}

function showVault() {
  gate.classList.add('hidden');
  vaultView.classList.remove('hidden');
  searchInput.value = '';
  renderedListKey = '';
  vaultUnlocked = true;
  startPolling();
  resetAutoLockTimer();
}

async function refreshCodes(forceRebuild = false) {
  const res = await window.api.codes();
  if (!res.ok) {
    showGate();
    return;
  }
  latestCodes = res.codes || [];
  renderCodes(forceRebuild);
}

function matchesSearch(item, query) {
  if (!query) return true;
  const hay = `${item.label} ${item.issuer}`.toLowerCase();
  return hay.includes(query);
}

function listKey(filtered) {
  return filtered.map((c) => `${c.id}|${c.label}|${c.issuer || ''}`).join(';');
}

function updateCodeRow(row, item) {
  const warn = item.remaining <= 5;
  const offset = RING_CIRCUMFERENCE * (1 - item.remaining / item.period);
  const codeEl = row.querySelector('.code-value');
  const progress = row.querySelector('.ring .progress');
  const remainEl = row.querySelector('.remain-label');

  if (codeEl && !codeEl.classList.contains('copied-flash')) {
    const nextText = formatCode(item.code);
    if (codeEl.textContent !== nextText) codeEl.textContent = nextText;
    if (codeEl.getAttribute('data-copy') !== item.code) {
      codeEl.setAttribute('data-copy', item.code);
    }
    codeEl.classList.toggle('expiring', warn && codesVisible);
    codeEl.classList.toggle('masked', !codesVisible);
    codeEl.title = codesVisible ? 'Click to copy · clears in 30s' : 'Hidden — click to copy anyway';
  }

  if (progress) {
    progress.setAttribute('stroke-dasharray', String(RING_CIRCUMFERENCE));
    progress.setAttribute('stroke-dashoffset', String(offset));
    progress.classList.toggle('warn', warn);
  }

  if (remainEl) {
    remainEl.textContent = `${item.remaining}s`;
    remainEl.classList.toggle('warn', warn);
  }
}

function buildRowHtml(item) {
  const warn = item.remaining <= 5;
  const offset = RING_CIRCUMFERENCE * (1 - item.remaining / item.period);
  return `
    <article class="code-row" role="listitem" data-id="${item.id}">
      <div class="issuer-avatar" aria-hidden="true">${escapeHtml(issuerInitials(item))}</div>
      <div class="code-meta">
        <h3>${escapeHtml(item.label)}</h3>
        <p>${escapeHtml(item.issuer || 'Authenticator')}</p>
      </div>
      <div class="row-actions">
        <button type="button" class="icon-btn" data-edit="${item.id}" title="Edit" aria-label="Edit ${escapeHtml(item.label)}">
          <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button type="button" class="icon-btn" data-delete="${item.id}" title="Delete" aria-label="Delete ${escapeHtml(item.label)}">
          <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>
      <div class="code-block">
        <button type="button" class="code-value ${warn && codesVisible ? 'expiring' : ''} ${codesVisible ? '' : 'masked'}" data-copy="${escapeHtml(item.code)}" title="${codesVisible ? 'Click to copy · clears in 30s' : 'Hidden — click to copy anyway'}">${formatCode(item.code)}</button>
        <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="track" cx="18" cy="18" r="14"></circle>
          <circle class="progress ${warn ? 'warn' : ''}" cx="18" cy="18" r="14"
            stroke-dasharray="${RING_CIRCUMFERENCE}"
            stroke-dashoffset="${offset}"></circle>
        </svg>
        <span class="remain-label ${warn ? 'warn' : ''}">${item.remaining}s</span>
      </div>
    </article>
  `;
}

function renderCodes(forceRebuild = false) {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = latestCodes.filter((c) => matchesSearch(c, query));
  accountCount.textContent = String(latestCodes.length);
  document.querySelector('.dock').classList.toggle('hidden', latestCodes.length === 0);

  if (latestCodes.length === 0) {
    emptyEl.classList.remove('hidden');
    codesEl.innerHTML = '';
    renderedListKey = '';
    return;
  }

  emptyEl.classList.add('hidden');

  if (filtered.length === 0) {
    const emptyKey = `empty:${query}`;
    if (forceRebuild || renderedListKey !== emptyKey) {
      codesEl.innerHTML = `<div class="empty"><h2>No matches</h2><p>Try a different search term.</p></div>`;
      renderedListKey = emptyKey;
    }
    return;
  }

  const nextKey = listKey(filtered);
  if (forceRebuild || renderedListKey !== nextKey) {
    codesEl.innerHTML = filtered.map(buildRowHtml).join('');
    renderedListKey = nextKey;
    return;
  }

  for (const item of filtered) {
    const row = codesEl.querySelector(`[data-id="${item.id}"]`);
    if (row) updateCodeRow(row, item);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function startPolling() {
  stopPolling();
  refreshCodes();
  pollTimer = setInterval(refreshCodes, 1000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function resetSeedRevealUi() {
  revealedSeed = null;
  seedVisible = false;
  seedActions.classList.add('hidden');
  btnCopySeed.classList.add('hidden');
  btnToggleSeed.textContent = 'Show seed';
  accountSecret.readOnly = false;
}

function openAccountModal(mode, account, preset) {
  accountError.textContent = '';
  accountForm.reset();
  accountId.value = '';
  pendingTotpOpts = null;
  resetSeedRevealUi();

  if (mode === 'edit' && account) {
    modalTitle.textContent = 'Edit account';
    accountSave.textContent = 'Update';
    accountId.value = account.id;
    accountLabel.value = account.label || '';
    accountIssuer.value = account.issuer || '';
    accountSecret.value = '';
    accountSecret.placeholder = 'Hidden — click Show seed, or paste a new secret';
    accountSecret.required = false;
    seedActions.classList.remove('hidden');
  } else {
    modalTitle.textContent = 'Add account';
    accountSave.textContent = 'Save';
    accountSecret.placeholder = 'Base32 secret (otpauth://… also works)';
    accountSecret.required = true;
    if (preset) {
      accountLabel.value = preset.label || '';
      accountIssuer.value = preset.issuer || '';
      accountSecret.value = preset.secret || '';
      pendingTotpOpts = {
        algorithm: preset.algorithm,
        digits: preset.digits,
        period: preset.period,
      };
    }
  }
  modal.classList.remove('hidden');
  accountLabel.focus();
}

function closeAccountModal() {
  modal.classList.add('hidden');
  pendingTotpOpts = null;
  resetSeedRevealUi();
  accountSecret.value = '';
}

const scanModal = document.getElementById('scan-modal');
const scanError = document.getElementById('scan-error');

function openScanModal() {
  scanError.textContent = '';
  scanModal.classList.remove('hidden');
}

function closeScanModal() {
  scanModal.classList.add('hidden');
  scanError.textContent = '';
}

async function handleScanResult(res) {
  if (!res.ok) {
    if (res.canceled) return;
    scanError.textContent = res.error || 'Could not scan QR code';
    return;
  }
  closeScanModal();
  openAccountModal('add', null, {
    label: res.label || '',
    issuer: res.issuer || '',
    secret: res.secret || '',
    algorithm: res.algorithm,
    digits: res.digits,
    period: res.period,
  });
  showToast('QR code detected');
}

function openSettings() {
  settingsError.textContent = '';
  settingsOk.textContent = '';
  passwordForm.reset();
  autoLockSelect.value = String(getAutoLockMinutes());
  settingsModal.classList.remove('hidden');
}

function closeSettings() {
  settingsModal.classList.add('hidden');
}

function closeConfirm(result) {
  if (!confirmResolver) return;
  confirmModal.classList.add('hidden');
  const resolve = confirmResolver;
  confirmResolver = null;
  resolve(Boolean(result));
}

function askConfirm({
  title = 'Confirm',
  message = 'Are you sure?',
  confirmLabel = 'Confirm',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    if (confirmResolver) closeConfirm(false);
    confirmResolver = resolve;
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOk.textContent = confirmLabel;
    confirmOk.classList.toggle('danger-solid', danger);
    confirmOk.classList.toggle('primary', !danger);
    confirmModal.classList.remove('hidden');
    confirmOk.focus();
  });
}

function closeTransferModal() {
  transferModal.classList.add('hidden');
  transferMode = null;
  pendingImportPath = null;
  transferForm.reset();
  transferError.textContent = '';
  transferPassword.required = false;
  transferReplaceField.classList.add('hidden');
  transferPasswordField.classList.remove('hidden');
}

function openExportModal() {
  closeSettings();
  transferMode = 'export';
  pendingImportPath = null;
  transferTitle.textContent = 'Export backup';
  transferMessage.textContent =
    'Enter your master password to create an encrypted backup of all seeds.';
  transferPasswordLabel.textContent = 'Master password';
  transferPassword.required = true;
  transferPasswordField.classList.remove('hidden');
  transferReplaceField.classList.add('hidden');
  transferSubmit.textContent = 'Export';
  transferError.textContent = '';
  transferForm.reset();
  transferModal.classList.remove('hidden');
  transferPassword.focus();
}

function openImportPasswordModal(filePath, needsPassword) {
  transferMode = 'import';
  pendingImportPath = filePath;
  transferTitle.textContent = 'Import backup';
  transferMessage.textContent = needsPassword
    ? 'Enter the backup password, then choose whether to merge or replace accounts.'
    : 'Plain backup detected. Choose whether to merge or replace accounts.';
  transferPasswordLabel.textContent = 'Backup password';
  transferPassword.required = needsPassword;
  transferPasswordField.classList.toggle('hidden', !needsPassword);
  transferReplaceField.classList.remove('hidden');
  transferSubmit.textContent = 'Import';
  transferError.textContent = '';
  transferForm.reset();
  transferReplace.checked = false;
  transferModal.classList.remove('hidden');
  if (needsPassword) transferPassword.focus();
  else transferSubmit.focus();
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  gateError.textContent = '';
  const password = passwordInput.value;
  if (isSetupMode) {
    if (password !== passwordConfirm.value) {
      gateError.textContent = 'Passwords do not match';
      return;
    }
    const res = await window.api.setup(password);
    if (!res.ok) {
      gateError.textContent = res.error || 'Could not create vault';
      return;
    }
  } else {
    const res = await window.api.unlock(password);
    if (!res.ok) {
      gateError.textContent = res.error || 'Could not unlock vault';
      return;
    }
  }
  showVault();
  notifyClockSkew(await window.api.status());
});

document.getElementById('btn-lock').addEventListener('click', async () => {
  clearAutoLockTimer();
  closeAccountModal();
  closeSettings();
  closeTransferModal();
  closeScanModal();
  closeConfirm(false);
  setCodesVisible(false);
  await window.api.lock();
  vaultUnlocked = false;
  showGate();
  const status = await window.api.status();
  setGateMode(status.exists);
});

document.getElementById('btn-add').addEventListener('click', () => openAccountModal('add'));
document.getElementById('btn-empty-add').addEventListener('click', () => openAccountModal('add'));
document.getElementById('btn-scan').addEventListener('click', openScanModal);
document.getElementById('btn-empty-scan').addEventListener('click', openScanModal);
document.getElementById('btn-settings').addEventListener('click', openSettings);

btnToggleSeed.addEventListener('click', async () => {
  const id = accountId.value;
  if (!id) return;
  accountError.textContent = '';

  if (seedVisible) {
    seedVisible = false;
    accountSecret.value = '';
    accountSecret.placeholder = 'Hidden — click Show seed, or paste a new secret';
    btnToggleSeed.textContent = 'Show seed';
    btnCopySeed.classList.add('hidden');
    return;
  }

  if (!revealedSeed) {
    const res = await window.api.getSecret(id);
    if (!res.ok) {
      accountError.textContent = res.error || 'Could not load seed';
      return;
    }
    revealedSeed = res.account.secret;
  }

  seedVisible = true;
  accountSecret.value = revealedSeed;
  accountSecret.placeholder = '';
  btnToggleSeed.textContent = 'Hide seed';
  btnCopySeed.classList.remove('hidden');
});

btnCopySeed.addEventListener('click', async () => {
  const value = accountSecret.value.trim() || revealedSeed;
  if (!value) return;
  await window.api.copy(value, { clearAfterMs: 30000 });
  showToast('Seed copied · clipboard clears in 30s');
});

document.getElementById('btn-scan-image').addEventListener('click', async () => {
  scanError.textContent = '';
  const res = await window.api.scanQrImage();
  await handleScanResult(res);
});

document.getElementById('btn-scan-screen').addEventListener('click', async () => {
  scanError.textContent = '';
  closeScanModal();
  const res = await window.api.scanQrScreen();
  if (!res.ok) {
    if (!res.canceled) {
      openScanModal();
      scanError.textContent = res.error || 'Could not scan QR code';
    }
    return;
  }
  await handleScanResult(res);
});

scanModal.querySelectorAll('[data-close-scan]').forEach((el) => {
  el.addEventListener('click', closeScanModal);
});
document.getElementById('btn-export').addEventListener('click', openExportModal);
document.getElementById('btn-import').addEventListener('click', async () => {
  closeSettings();
  const picked = await window.api.importPick();
  if (!picked.ok) {
    if (!picked.canceled) showToast(picked.error || 'Import failed');
    return;
  }
  openImportPasswordModal(picked.path, Boolean(picked.needsPassword));
});

autoLockSelect.addEventListener('change', () => {
  setAutoLockMinutes(Number(autoLockSelect.value));
  showToast(
    Number(autoLockSelect.value) === 0
      ? 'Auto-lock disabled'
      : `Auto-lock set to ${autoLockSelect.value} min`
  );
});

toggleCodesBtn.addEventListener('click', () => {
  setCodesVisible(!codesVisible);
});

modal.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('click', closeAccountModal);
});
settingsModal.querySelectorAll('[data-close-settings]').forEach((el) => {
  el.addEventListener('click', closeSettings);
});

['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((eventName) => {
  document.addEventListener(eventName, noteActivity, { passive: true });
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && vaultUnlocked && getAutoLockMinutes() > 0) {
    // Keep idle timer running while hidden; do not reset on hide.
  } else if (!document.hidden) {
    noteActivity();
  }
});

accountForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  accountError.textContent = '';
  const id = accountId.value;
  const payload = {
    label: accountLabel.value.trim(),
    issuer: accountIssuer.value.trim(),
    secret: parseSecretInput(accountSecret.value),
    ...(pendingTotpOpts || {}),
  };

  let res;
  if (id) {
    const patch = { label: payload.label, issuer: payload.issuer };
    if (payload.secret) patch.secret = payload.secret;
    res = await window.api.update(id, patch);
  } else {
    res = await window.api.add(payload);
  }

  if (!res.ok) {
    accountError.textContent = res.error || 'Could not save account';
    return;
  }
  closeAccountModal();
  showToast(id ? 'Account updated' : 'Account added');
  await refreshCodes(true);
});

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  settingsError.textContent = '';
  settingsOk.textContent = '';
  const currentPassword = document.getElementById('pw-current').value;
  const newPassword = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  if (newPassword !== confirm) {
    settingsError.textContent = 'New passwords do not match';
    return;
  }
  const res = await window.api.changePassword(currentPassword, newPassword);
  if (!res.ok) {
    settingsError.textContent = res.error || 'Could not change password';
    return;
  }
  settingsOk.textContent = 'Password updated';
  passwordForm.reset();
});

codesEl.addEventListener('click', async (e) => {
  const copyEl = e.target.closest('[data-copy]');
  if (copyEl) {
    const code = String(copyEl.getAttribute('data-copy') || '').replace(/\D/g, '');
    await window.api.copy(code, { clearAfterMs: 30000 });
    const row = copyEl.closest('.code-row');
    if (row) {
      row.classList.add('copied');
      setTimeout(() => row.classList.remove('copied'), 700);
    }
    const previous = copyEl.textContent;
    copyEl.classList.add('copied-flash');
    copyEl.textContent = 'Copied';
    setTimeout(() => {
      copyEl.classList.remove('copied-flash');
      const item = latestCodes.find((c) => c.id === row?.getAttribute('data-id'));
      copyEl.textContent = item ? formatCode(item.code) : previous;
    }, 700);
    showToast('Code copied · clipboard clears in 30s');
    noteActivity();
    return;
  }

  const editBtn = e.target.closest('[data-edit]');
  if (editBtn) {
    const id = editBtn.getAttribute('data-edit');
    const item = latestCodes.find((c) => c.id === id);
    if (item) openAccountModal('edit', item);
    return;
  }

  const deleteBtn = e.target.closest('[data-delete]');
  if (deleteBtn) {
    const id = deleteBtn.getAttribute('data-delete');
    const item = latestCodes.find((c) => c.id === id);
    const name = item ? item.label : 'this account';
    const ok = await askConfirm({
      title: 'Delete account',
      message: `Delete “${name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await window.api.remove(id);
    if (!res.ok) {
      showToast(res.error || 'Delete failed');
      return;
    }
    showToast('Account deleted');
    await refreshCodes(true);
  }
});

searchInput.addEventListener('input', () => renderCodes(true));

transferForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  transferError.textContent = '';
  const password = transferPassword.value;

  if (transferMode === 'export') {
    const res = await window.api.exportBackup(password);
    if (!res.ok) {
      if (res.canceled) {
        closeTransferModal();
        return;
      }
      transferError.textContent = res.error || 'Export failed';
      return;
    }
    closeTransferModal();
    showToast(`Exported ${res.count} account${res.count === 1 ? '' : 's'}`);
    return;
  }

  if (transferMode === 'import') {
    const replace = transferReplace.checked;
    if (replace) {
      const ok = await askConfirm({
        title: 'Replace accounts',
        message: 'This will replace all current accounts with the backup. Continue?',
        confirmLabel: 'Replace',
        danger: true,
      });
      if (!ok) return;
    }
    const res = await window.api.importBackup(pendingImportPath, password || null, replace);
    if (!res.ok) {
      transferError.textContent = res.error || 'Import failed';
      return;
    }
    closeTransferModal();
    await refreshCodes(true);
    const parts = [`Added ${res.added}`];
    if (res.skipped) parts.push(`skipped ${res.skipped} duplicate${res.skipped === 1 ? '' : 's'}`);
    showToast(parts.join(', '));
  }
});

transferModal.querySelectorAll('[data-transfer-cancel]').forEach((el) => {
  el.addEventListener('click', closeTransferModal);
});

document.querySelectorAll('[data-toggle-password]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.getAttribute('data-toggle-password'));
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
});

function passwordScore(value) {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(4, score);
}

passwordInput.addEventListener('input', () => {
  if (!isSetupMode) {
    pwStrength.classList.add('hidden');
    return;
  }
  const score = passwordScore(passwordInput.value);
  pwStrength.classList.toggle('hidden', score === 0);
  pwStrength.dataset.level = String(score);
  pwStrengthLabel.textContent = ['', 'Short', 'Okay', 'Strong', 'Excellent'][score] || '';
});

document.addEventListener('keydown', (e) => {
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
  const dialogOpen = [modal, settingsModal, scanModal, transferModal, confirmModal].some(
    (el) => el && !el.classList.contains('hidden')
  );
  if (!typing && !dialogOpen && vaultUnlocked && e.key === '/') {
    e.preventDefault();
    searchInput.focus();
    return;
  }
  if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && vaultUnlocked) {
    e.preventDefault();
    document.getElementById('btn-lock').click();
    return;
  }
  if (!dialogOpen && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && vaultUnlocked) {
    e.preventDefault();
    openAccountModal('add');
    return;
  }
  if (e.key === 'Escape') {
    if (!confirmModal.classList.contains('hidden')) {
      closeConfirm(false);
      return;
    }
    if (!transferModal.classList.contains('hidden')) {
      closeTransferModal();
      return;
    }
    if (!scanModal.classList.contains('hidden')) {
      closeScanModal();
      return;
    }
    closeAccountModal();
    closeSettings();
  }
});

confirmModal.querySelectorAll('[data-confirm-cancel]').forEach((el) => {
  el.addEventListener('click', () => closeConfirm(false));
});
confirmOk.addEventListener('click', () => closeConfirm(true));

(async function init() {
  const maxBtn = document.getElementById('win-max');
  const maxIcon = document.getElementById('win-max-icon');

  function setMaximizedUi(maximized) {
    maxBtn.title = maximized ? 'Restore' : 'Maximize';
    maxBtn.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
    maxIcon.innerHTML = maximized
      ? '<path d="M3.5 4.5h5v5h-5z"/><path d="M4.5 3.5h5v1M9.5 3.5v5h-1"/>'
      : '<rect x="2.5" y="2.5" width="7" height="7" rx="0.5"/>';
  }

  document.getElementById('win-min').addEventListener('click', () => window.api.windowMinimize());
  maxBtn.addEventListener('click', async () => {
    const res = await window.api.windowMaximize();
    setMaximizedUi(Boolean(res && res.maximized));
  });
  document.getElementById('win-close').addEventListener('click', () => window.api.windowClose());
  window.api.onWindowMaximized(setMaximizedUi);
  const maxState = await window.api.windowIsMaximized();
  setMaximizedUi(Boolean(maxState && maxState.maximized));
  updateRevealButton();

  const status = await window.api.status();
  setGateMode(status.exists);
  if (status.unlocked) {
    showVault();
  } else {
    showGate();
  }
  try {
    notifyClockSkew(status);
  } catch {
    // ignore toast errors so the login form still appears
  }
})();
