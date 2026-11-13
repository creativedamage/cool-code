# COOL Code

Custom QR codes with logos, scan tracking, and a shared team dashboard for The Cool Church.

A desktop app (Electron) for designing custom QR codes from any link.

## Features
- **Link / text input** with a live preview
- **Dot styles:** square, dots, rounded, extra‑rounded, classy, classy‑rounded
- **Corner frame & corner center styles**, each with their own color
- **Solid or gradient colors** (linear or radial, adjustable angle) for dots, corners, and background
- **Overall shape:** square or circle, plus rounded background corners
- **Transparent background** option
- **Your logo:** drag‑and‑drop, click to choose, or paste (⌘V). Adjustable size and padding, with the option to clear the dots behind it
- **Live scan check** that warns you if a design is likely to be unscannable
- **8 presets** and a "Surprise me" randomizer
- **High-res export:** PNG at 1024 / 2048 / 4096 / 8192 px or any custom size up to 10,000 px. PNGs are tagged as 300 DPI, so print apps size them correctly.
- **SVG (vector) export:** stays sharp at any size, which suits print shops, Illustrator, Figma and Canva
- **No-background export:** "PNG — no background" and "SVG — no background" remove the background so only the code and your logo are kept, ready to place on any design
- JPEG and WebP are also available; you can copy to the clipboard, and ⌘S exports
- **Scan tracking:** switch on *Track scans* and the code points to a short tracking link that counts every scan, then forwards people to your link. The **Scans** tab shows total scans, unique visitors, today and the last 7 days, a daily chart, and device and operating-system breakdowns, plus recent scans. Link-preview bots aren't counted.
- **Change where a code goes after printing:** edit a tracked code's destination at any time; the printed code stays the same. You can also pause or delete a code.
- **My logos library:** every logo you add is saved for one-click reuse. You can put it on a circle, rounded or square backing in any color.
- **Save / load designs** as `.json` so you can reuse a brand style; your last design is remembered automatically

## Run it
Requires [Node.js](https://nodejs.org) 18+.

```bash
cd cool-code
npm install
npm start
```

## Build a standalone app
```bash
npm run dist:mac   # creates a .dmg in dist/
npm run dist:win   # Windows installer
```
Without an Apple Developer certificate, macOS will warn the first time you open it.
Right-click the app → **Open** to allow it.

## Tips for scannable codes
- Keep strong contrast: dark dots on a light background work best.
- With a logo, keep error correction on **High** and the logo size under ~40%.
- Test with your phone camera before printing.

## Installing the Mac app
1. Unzip `COOL-Code-1.0.0-mac-arm64.zip` (Apple Silicon: M1/M2/M3/M4) or `…-mac-x64.zip` (Intel Macs).
2. Drag **COOL Code.app** into your **Applications** folder.
3. The first time, macOS will say it can't verify the developer (the app isn't notarized by Apple).
   Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
   Or run once in Terminal: `xattr -dr com.apple.quarantine "/Applications/COOL Code.app"`

## Scan tracking service
Tracking runs on Supabase (see `supabase/functions/`): `s` handles the redirect and records each scan, and `api` lets the app manage links, protected by an access key.
`tracking.defaults.json` holds only the service address, which is public. No keys or passwords are stored in this repo or in the app.
People sign in with their **@thecoolchurch.com Google account**. Until Google sign-in is switched on, an admin can sign in with a personal access key.

## Releases & automatic updates
Releases are built by GitHub Actions (`.github/workflows/release.yml`) on macOS and Windows runners.

1. Bump `version` in `package.json`, for example `1.3.1`.
2. Commit, then tag and push: `git tag v1.3.1 && git push origin main --tags`
3. About 10 minutes later, a GitHub Release appears with:
   - the Mac `.dmg` and `.zip` files (Apple Silicon and Intel)
   - the Windows installer

Installed copies check for new releases at launch and every 6 hours, or when you click **Settings → Check for updates**. They then show an **Update to x.y.z** button: one click downloads the update, swaps it in and restarts the app.
