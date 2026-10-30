# VaultOTP

Desktop 2FA authenticator built with Electron. Seeds are encrypted at rest with your master password and codes refresh every second.

## Features

- Master-password vault (AES-256-GCM + PBKDF2)
- Add / edit / delete TOTP accounts
- Live 6-digit codes with countdown ring
- Click a code to copy (clipboard clears after 30 seconds)
- Press `/` to search, `Ctrl+N` to add, `Ctrl+L` to lock
- Accepts raw Base32 secrets or `otpauth://` URIs
- Scan QR codes from image files or the screen
- Auto-lock after idle (mouse movement does not keep the vault open)
- Change master password from Settings
- Export / import encrypted seed backups (`.otpbak`)
- Import plain JSON account lists or `otpauth://` URI text files

## Run (development)

```bash
npm install
npm start
```

Or double-click `start.cmd`. That script uses portable Node.js from the workspace `.tools\node-v*` folder.

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

## Publish a GitHub Release

This repo includes a GitHub Actions workflow that builds Windows EXEs and attaches them to a release when you push a version tag.

1. Update `"version"` in `package.json` (for example `1.0.0`).
2. Commit if needed.
3. Create and push a tag:

```bash
git tag v1.0.0
git push origin master
git push origin v1.0.0
```

4. Open **GitHub → Releases** for the repo. After the Action finishes, `v1.0.0` will include:
   - `VaultOTP-1.0.0-win-x64.exe` (installer)
   - `VaultOTP-1.0.0-portable.exe` (portable)

### Manual release (optional)

If you already built locally:

1. Go to https://github.com/smartguy0505/vaultotp/releases/new
2. Choose tag `v1.0.0` (create it if needed)
3. Title: `VaultOTP 1.0.0`
4. Upload files from `dist/`:
   - `VaultOTP-1.0.0-win-x64.exe`
   - `VaultOTP-1.0.0-portable.exe`
5. Click **Publish release**

On first launch, create a master password (min 8 characters). Your encrypted vault is stored at `~/.otpvault/vault.dat` (for example `C:\Users\<you>\.otpvault\vault.dat` on Windows).
