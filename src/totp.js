const crypto = require('crypto');

const TIME_URLS = [
  'https://registry.npmjs.org/',
  'https://npmmirror.com/',
  'https://cloudflare.com/',
];

let clockOffsetMs = 0;

function nowMs() {
  return Date.now() + clockOffsetMs;
}

function getClockOffsetMs() {
  return clockOffsetMs;
}

async function syncClock() {
  for (const url of TIME_URLS) {
    try {
      const t0 = Date.now();
      const res = await fetch(url, { method: 'HEAD' });
      const t1 = Date.now();
      const header = res.headers.get('date');
      if (!header) continue;
      const server = Date.parse(header);
      if (!Number.isFinite(server)) continue;
      const rtt = Math.max(0, t1 - t0);
      clockOffsetMs = Math.round(server + rtt / 2 - t1);
      return clockOffsetMs;
    } catch {
      // try next source
    }
  }
  return clockOffsetMs;
}

const ALGORITHMS = {
  SHA1: 'sha1',
  SHA256: 'sha256',
  SHA512: 'sha512',
};

function normalizeSecret(secret) {
  return String(secret || '')
    .replace(/[\s-]+/g, '')
    .replace(/=+$/, '')
    .toUpperCase();
}

function normalizeTotpOptions(options = {}) {
  const algorithm = String(options.algorithm || 'SHA1')
    .toUpperCase()
    .replace(/-/g, '')
    .replace(/^SHA$/, 'SHA1');
  if (!ALGORITHMS[algorithm]) {
    throw new Error('Unsupported TOTP algorithm');
  }

  const digits = Number(options.digits);
  const resolvedDigits = Number.isFinite(digits) && digits > 0 ? digits : 6;
  if (![6, 7, 8].includes(resolvedDigits)) {
    throw new Error('Unsupported TOTP digits');
  }

  const period = Number(options.period);
  const resolvedPeriod = Number.isFinite(period) && period > 0 ? Math.trunc(period) : 30;
  if (resolvedPeriod < 1 || resolvedPeriod > 300) {
    throw new Error('Unsupported TOTP period');
  }

  return { algorithm, digits: resolvedDigits, period: resolvedPeriod };
}

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = normalizeSecret(input);
  if (!cleaned) throw new Error('Empty secret');

  let bits = '';
  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) throw new Error('Invalid base32 secret');
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secretBuf, counter, digits, nodeAlg) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac(nodeAlg, secretBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

function generateTotp(secret, options = {}) {
  const opts = normalizeTotpOptions(options);
  const now = options.now !== undefined ? options.now : nowMs();
  const counter = Math.floor(Math.floor(now / 1000) / opts.period);
  const secretBuf = base32Decode(secret);
  return hotp(secretBuf, counter, opts.digits, ALGORITHMS[opts.algorithm]);
}

function remainingSeconds(period = 30, now = nowMs()) {
  const elapsed = Math.floor(now / 1000) % period;
  return period - elapsed;
}

module.exports = {
  normalizeSecret,
  normalizeTotpOptions,
  generateTotp,
  remainingSeconds,
  base32Decode,
  nowMs,
  getClockOffsetMs,
  syncClock,
};
