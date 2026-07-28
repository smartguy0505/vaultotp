const { nativeImage } = require('electron');
const jsQR = require('jsqr');
const { parseOtpAuthUri } = require('./vault');

function bgraToRgba(bitmap, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < bitmap.length && j < rgba.length; i += 4, j += 4) {
    rgba[j] = bitmap[i + 2];
    rgba[j + 1] = bitmap[i + 1];
    rgba[j + 2] = bitmap[i];
    rgba[j + 3] = bitmap[i + 3];
  }
  return rgba;
}

function prepareImage(image) {
  if (!image || image.isEmpty()) {
    throw new Error('Could not read image');
  }

  let img = image;
  const size = img.getSize();
  const maxEdge = 1800;
  if (size.width > maxEdge || size.height > maxEdge) {
    const scale = maxEdge / Math.max(size.width, size.height);
    img = img.resize({
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
      quality: 'best',
    });
  }
  return img;
}

function decodeQrFromNativeImage(image) {
  const img = prepareImage(image);
  const { width, height } = img.getSize();
  if (width < 20 || height < 20) {
    throw new Error('Image is too small to contain a QR code');
  }

  const bitmap = img.toBitmap();
  const rgba = bgraToRgba(bitmap, width, height);
  const code = jsQR(rgba, width, height, { inversionAttempts: 'attemptBoth' });
  if (!code || !code.data) {
    throw new Error('No QR code found');
  }
  return String(code.data).trim();
}

function decodeQrFromFile(filePath) {
  return decodeQrFromNativeImage(nativeImage.createFromPath(filePath));
}

function decodeQrFromDataUrl(dataUrl) {
  return decodeQrFromNativeImage(nativeImage.createFromDataURL(dataUrl));
}

function parseScannedPayload(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('QR code was empty');

  const otpauth = parseOtpAuthUri(text);
  if (otpauth) {
    return {
      type: 'otpauth',
      raw: text,
      label: otpauth.label,
      issuer: otpauth.issuer,
      secret: otpauth.secret,
    };
  }

  // Some apps encode only the secret
  const secretOnly = text.replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z2-7]+=*$/.test(secretOnly) && secretOnly.length >= 16) {
    return {
      type: 'secret',
      raw: text,
      label: '',
      issuer: '',
      secret: secretOnly.replace(/=+$/, ''),
    };
  }

  throw new Error('QR code is not a valid 2FA otpauth link');
}

module.exports = {
  decodeQrFromFile,
  decodeQrFromDataUrl,
  decodeQrFromNativeImage,
  parseScannedPayload,
};
