# VaultOTP

Desktop 2FA authenticator built with Electron. Seeds are encrypted at rest with your master password and codes refresh every second.

## Features

- Master-password vault (AES-256-GCM + PBKDF2)
- Add / edit / delete TOTP accounts
- Live 6-digit codes with countdown ring
- Click a code to copy
- Accepts raw Base32 secrets or `otpauth://` URIs
- Change master password from Settings
- Export / import encrypted seed backups (`.otpbak`)
- Import plain JSON account lists or `otpauth://` URI text files

## Run (development)

```bash
npm install
npm start
```

Or double-click `start.cmd`.

## Build Windows app

```bash
npm install
npm run dist
```

Output goes to the `dist/` folder:

| File | What it is |
|------|------------|
| `VaultOTP-1.0.0-win-x64.exe` | Installer (Start Menu + Desktop shortcuts) |
| `VaultOTP-1.0.0-portable.exe` | Portable app (no install) |

Install with the installer, or run the portable `.exe` directly.

On first launch, create a master password (min 8 characters). Your encrypted vault is stored at `~/.otpvault/vault.dat` (for example `C:\Users\<you>\.otpvault\vault.dat` on Windows).
