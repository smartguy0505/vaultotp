const crypto = require('crypto');

function normalizeSecret(secret) {
  return String(secret || '')
    .replace(/\s+/g, '')
    .replace(/=+$/, '')
    .toUpperCase();
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

function hotp(secretBuf, counter, digits = 6) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const str = String(code % 10 ** digits);
  return str.padStart(digits, '0');
}

function generateTotp(secret, options = {}) {
  const period = options.period || 30;
  const digits = options.digits || 6;
  const now = options.now !== undefined ? options.now : Date.now();
  const counter = Math.floor(now / 1000 / period);
  const secretBuf = base32Decode(secret);
  return hotp(secretBuf, counter, digits);
}

function remainingSeconds(period = 30, now = Date.now()) {
  const elapsed = Math.floor(now / 1000) % period;
  return period - elapsed;
}

module.exports = {
  normalizeSecret,
  generateTotp,
  remainingSeconds,
  base32Decode,
};
