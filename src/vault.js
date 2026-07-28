const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateTotp, remainingSeconds, normalizeSecret } = require('./totp');

const VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 310000;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;

let vaultDir = null;
let vaultPath = null;
let masterKey = null;
let accounts = [];

function init() {
  vaultDir = path.join(os.homedir(), '.otpvault');
  vaultPath = path.join(vaultDir, 'vault.dat');
}

function ensureVaultDir() {
  if (!vaultDir) throw new Error('Vault is not initialized');
  fs.mkdirSync(vaultDir, { recursive: true });
}

function vaultExists() {
  return Boolean(vaultPath && fs.existsSync(vaultPath));
}

function getStatus() {
  return {
    exists: vaultExists(),
    unlocked: masterKey !== null,
    count: masterKey ? accounts.length : 0,
  };
}

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
}

function encryptPayload(key, payload) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptPayload(key, blob) {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + 16);
  const data = blob.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function packVaultFile(salt, encryptedBlob) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(VAULT_VERSION, 0);
  header.writeUInt32BE(PBKDF2_ITERATIONS, 4);
  return Buffer.concat([header, salt, encryptedBlob]);
}

function unpackVaultFile(fileBuf) {
  const version = fileBuf.readUInt32BE(0);
  const iterations = fileBuf.readUInt32BE(4);
  if (version !== VAULT_VERSION) {
    throw new Error('Unsupported vault version');
  }
  const salt = fileBuf.subarray(8, 8 + SALT_LEN);
  const encryptedBlob = fileBuf.subarray(8 + SALT_LEN);
  return { iterations, salt, encryptedBlob };
}

let currentSalt = null;

function persistWithCurrentKey() {
  if (!masterKey || !vaultPath || !currentSalt) throw new Error('Vault is locked');
  ensureVaultDir();
  const encryptedBlob = encryptPayload(masterKey, { accounts });
  const packed = packVaultFile(currentSalt, encryptedBlob);
  const tmp = `${vaultPath}.tmp`;
  fs.writeFileSync(tmp, packed);
  fs.renameSync(tmp, vaultPath);
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
}

async function setup(password) {
  assertPassword(password);
  if (vaultExists()) throw new Error('Vault already exists');
  currentSalt = crypto.randomBytes(SALT_LEN);
  masterKey = deriveKey(password, currentSalt);
  accounts = [];
  persistWithCurrentKey();
}

async function unlock(password) {
  if (!vaultExists()) throw new Error('No vault found');
  const fileBuf = fs.readFileSync(vaultPath);
  const { iterations, salt, encryptedBlob } = unpackVaultFile(fileBuf);
  const key = crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, 'sha256');
  try {
    const payload = decryptPayload(key, encryptedBlob);
    masterKey = key;
    currentSalt = Buffer.from(salt);
    accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  } catch {
    throw new Error('Incorrect password');
  }
}

function lock() {
  masterKey = null;
  currentSalt = null;
  accounts = [];
}

function requireUnlocked() {
  if (!masterKey) throw new Error('Vault is locked');
}

function listAccounts() {
  requireUnlocked();
  return accounts.map(({ id, label, issuer, createdAt, updatedAt }) => ({
    id,
    label,
    issuer,
    createdAt,
    updatedAt,
  }));
}

function getSecret(id) {
  requireUnlocked();
  const account = accounts.find((a) => a.id === id);
  if (!account) throw new Error('Account not found');
  return {
    id: account.id,
    label: account.label,
    issuer: account.issuer,
    secret: account.secret,
  };
}

function sanitizeAccountInput(input) {
  const label = String(input.label || '').trim();
  const issuer = String(input.issuer || '').trim();
  const secret = normalizeSecret(input.secret || '');
  if (!label) throw new Error('Account name is required');
  if (!secret) throw new Error('Secret is required');
  // Validate secret by generating once
  generateTotp(secret);
  return { label, issuer, secret };
}

async function addAccount(input) {
  requireUnlocked();
  const { label, issuer, secret } = sanitizeAccountInput(input);
  const now = new Date().toISOString();
  const account = {
    id: crypto.randomUUID(),
    label,
    issuer,
    secret,
    createdAt: now,
    updatedAt: now,
  };
  accounts.push(account);
  persistWithCurrentKey();
  return { id: account.id, label, issuer, createdAt: now, updatedAt: now };
}

async function updateAccount(id, patch) {
  requireUnlocked();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Account not found');
  const current = accounts[idx];
  const next = {
    label: patch.label !== undefined ? String(patch.label).trim() : current.label,
    issuer: patch.issuer !== undefined ? String(patch.issuer).trim() : current.issuer,
    secret: patch.secret !== undefined ? normalizeSecret(patch.secret) : current.secret,
  };
  if (!next.label) throw new Error('Account name is required');
  if (!next.secret) throw new Error('Secret is required');
  generateTotp(next.secret);
  accounts[idx] = {
    ...current,
    ...next,
    updatedAt: new Date().toISOString(),
  };
  persistWithCurrentKey();
  const a = accounts[idx];
  return { id: a.id, label: a.label, issuer: a.issuer, createdAt: a.createdAt, updatedAt: a.updatedAt };
}

async function removeAccount(id) {
  requireUnlocked();
  const before = accounts.length;
  accounts = accounts.filter((a) => a.id !== id);
  if (accounts.length === before) throw new Error('Account not found');
  persistWithCurrentKey();
}

function getCodes() {
  requireUnlocked();
  const remaining = remainingSeconds();
  return accounts.map((a) => ({
    id: a.id,
    label: a.label,
    issuer: a.issuer,
    code: generateTotp(a.secret),
    remaining,
    period: 30,
  }));
}

async function changePassword(currentPassword, newPassword) {
  requireUnlocked();
  assertPassword(newPassword);
  // Verify current password
  const fileBuf = fs.readFileSync(vaultPath);
  const { iterations, salt, encryptedBlob } = unpackVaultFile(fileBuf);
  const checkKey = crypto.pbkdf2Sync(currentPassword, salt, iterations, KEY_LEN, 'sha256');
  try {
    decryptPayload(checkKey, encryptedBlob);
  } catch {
    throw new Error('Current password is incorrect');
  }
  currentSalt = crypto.randomBytes(SALT_LEN);
  masterKey = deriveKey(newPassword, currentSalt);
  persistWithCurrentKey();
}

function verifyMasterPassword(password) {
  requireUnlocked();
  const fileBuf = fs.readFileSync(vaultPath);
  const { iterations, salt, encryptedBlob } = unpackVaultFile(fileBuf);
  const checkKey = crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, 'sha256');
  try {
    decryptPayload(checkKey, encryptedBlob);
  } catch {
    throw new Error('Incorrect password');
  }
}

function createEncryptedBackup(password) {
  requireUnlocked();
  assertPassword(password);
  verifyMasterPassword(password);

  const salt = crypto.randomBytes(SALT_LEN);
  const key = deriveKey(password, salt);
  const exportAccounts = accounts.map(({ label, issuer, secret, createdAt, updatedAt }) => ({
    label,
    issuer,
    secret,
    createdAt,
    updatedAt,
  }));
  const encryptedBlob = encryptPayload(key, {
    accounts: exportAccounts,
    exportedAt: new Date().toISOString(),
  });

  return {
    format: 'vaultotp-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: 'pbkdf2-sha256',
    iterations: PBKDF2_ITERATIONS,
    salt: salt.toString('base64'),
    payload: encryptedBlob.toString('base64'),
  };
}

function parseOtpAuthUri(line) {
  try {
    const url = new URL(line.trim());
    if (url.protocol !== 'otpauth:') return null;
    const secret = url.searchParams.get('secret');
    if (!secret) return null;
    const issuerParam = url.searchParams.get('issuer') || '';
    const pathLabel = decodeURIComponent(url.pathname.replace(/^\/\//, '').replace(/^\//, ''));
    let label = pathLabel;
    let issuer = issuerParam;
    if (pathLabel.includes(':')) {
      const [left, ...rest] = pathLabel.split(':');
      if (!issuer) issuer = left;
      label = rest.join(':').trim() || left;
    }
    return { label: label || 'Imported account', issuer, secret };
  } catch {
    return null;
  }
}

function normalizeImportedAccounts(rawAccounts) {
  if (!Array.isArray(rawAccounts)) throw new Error('Backup has no accounts');
  const result = [];
  for (const item of rawAccounts) {
    if (!item) continue;
    if (typeof item === 'string') {
      const fromUri = parseOtpAuthUri(item);
      if (fromUri) {
        result.push(sanitizeAccountInput(fromUri));
      }
      continue;
    }
    result.push(
      sanitizeAccountInput({
        label: item.label || item.name || item.account || 'Imported account',
        issuer: item.issuer || '',
        secret: item.secret || item.seed || '',
      })
    );
  }
  if (result.length === 0) throw new Error('No valid accounts found in backup');
  return result;
}

function decryptBackupObject(backup, password) {
  assertPassword(password);
  if (!backup || backup.format !== 'vaultotp-backup') {
    throw new Error('Unsupported backup format');
  }
  const iterations = Number(backup.iterations) || PBKDF2_ITERATIONS;
  const salt = Buffer.from(String(backup.salt || ''), 'base64');
  const payload = Buffer.from(String(backup.payload || ''), 'base64');
  if (salt.length !== SALT_LEN || payload.length < IV_LEN + 16) {
    throw new Error('Backup file is corrupted');
  }
  const key = crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, 'sha256');
  try {
    return decryptPayload(key, payload);
  } catch {
    throw new Error('Incorrect backup password');
  }
}

function parseBackupContent(rawText) {
  const text = String(rawText || '').trim();
  if (!text) throw new Error('Backup file is empty');

  // Plain otpauth URI list
  if (text.toLowerCase().includes('otpauth://') && !text.trimStart().startsWith('{')) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return { type: 'plain', accounts: normalizeImportedAccounts(lines) };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Backup must be a VaultOTP file or JSON');
  }

  if (parsed && parsed.format === 'vaultotp-backup') {
    return { type: 'encrypted', backup: parsed };
  }

  if (Array.isArray(parsed)) {
    return { type: 'plain', accounts: normalizeImportedAccounts(parsed) };
  }

  if (parsed && Array.isArray(parsed.accounts)) {
    return { type: 'plain', accounts: normalizeImportedAccounts(parsed.accounts) };
  }

  throw new Error('Unrecognized backup format');
}

function importAccountsList(incoming, { replace = false } = {}) {
  requireUnlocked();
  const normalized = normalizeImportedAccounts(incoming);
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;

  if (replace) {
    accounts = normalized.map((item) => ({
      id: crypto.randomUUID(),
      label: item.label,
      issuer: item.issuer,
      secret: item.secret,
      createdAt: now,
      updatedAt: now,
    }));
    added = accounts.length;
  } else {
    const existingSecrets = new Set(accounts.map((a) => a.secret));
    for (const item of normalized) {
      if (existingSecrets.has(item.secret)) {
        skipped += 1;
        continue;
      }
      accounts.push({
        id: crypto.randomUUID(),
        label: item.label,
        issuer: item.issuer,
        secret: item.secret,
        createdAt: now,
        updatedAt: now,
      });
      existingSecrets.add(item.secret);
      added += 1;
    }
  }

  persistWithCurrentKey();
  return { added, skipped, total: accounts.length };
}

function exportBackupToFile(filePath, password) {
  const backup = createEncryptedBackup(password);
  fs.writeFileSync(filePath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
  return { path: filePath, count: accounts.length };
}

function importBackupFromFile(filePath, password, { replace = false } = {}) {
  requireUnlocked();
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parseBackupContent(raw);

  let incoming;
  if (parsed.type === 'encrypted') {
    if (!password) throw new Error('Backup password is required');
    const payload = decryptBackupObject(parsed.backup, password);
    incoming = payload.accounts;
  } else {
    incoming = parsed.accounts;
  }

  return importAccountsList(incoming, { replace });
}

function inspectBackupFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parseBackupContent(raw);
  if (parsed.type === 'encrypted') {
    return { type: 'encrypted', needsPassword: true };
  }
  return { type: 'plain', needsPassword: false, count: parsed.accounts.length };
}

module.exports = {
  init,
  getStatus,
  setup,
  unlock,
  lock,
  listAccounts,
  getSecret,
  addAccount,
  updateAccount,
  removeAccount,
  getCodes,
  changePassword,
  exportBackupToFile,
  importBackupFromFile,
  inspectBackupFile,
  parseOtpAuthUri,
};
