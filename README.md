# SpeedXpat

SpeedXpat is a network diagnostics and capability assessment app for measuring internet quality, diagnosing connection issues, and evaluating how well a connection supports common online activities.

It combines a Vite + React frontend, a small Node/Express server, and a native Android WebView shell so the same experience can run in the browser and on mobile.

## Features

- Guided speed test for download and upload throughput
- Latency, jitter, DNS timing, and bufferbloat checks
- Activity suitability scoring for gaming, streaming, conferencing, browsing, remote work, and transfers
- Live network metadata such as ISP, public IP, connection type, and Wi-Fi details
- Saved reports with local history and export options
- Browser and Android-friendly flow with native mobile integrations

## Tech Stack

- React 19 + TypeScript
- Vite
- Express server for local API support
- JavaScript/TypeScript network measurement engines
- Android WebView project under `android/`

## Prerequisites

- Node.js 20+
- npm
- Git
- Optional: Android Studio / Android SDK for building the native wrapper

## Local Development

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

The app also supports environment configuration via `.env.example` if you need to override the local server port or related runtime settings.

## Production Build

```bash
npm run build
npm run lint
```

This project is configured for Vercel deployment through `vercel.json`.

## Android Wrapper

The Android project is in the `android/` directory. To build the native app or bundle the web assets:

```bash
cd android
./gradlew assembleRelease
```

On Windows PowerShell:

```powershell
cd android
.\gradlew.bat assembleRelease
```

## Project Structure

```text
.
├── android/                 # Android WebView app
├── api/                     # API handlers and network helpers
├── public/                  # Static public assets
├── src/                     # React app and engine logic
├── .github/workflows/       # CI/CD and release automation
├── server.ts                # Express server entry
├── package.json             # Scripts and dependencies
├── vercel.json              # Vercel build configuration
├── README.md                # Project docs
├── APP_GUIDE.md             # Detailed app behavior guide
├── SPEEDXPAT_SPEC.md        # Product specification
├── SPEEDXPAT_UI_SPEC.md     # UI specification
└── .env.example             # Example environment config
```

## Deployment

### Vercel

From the repo root:

```bash
npx vercel --prod
```

The project already includes a Vercel config in `vercel.json`.

### GitHub Releases

The repository includes a GitHub Actions workflow that publishes an Android release when a version tag is pushed.

```bash
git tag v1.0.6
git push origin v1.0.6
```

## Privacy and Data Notes

SpeedXpat performs network measurements against external endpoints and may contact IP lookup and performance services. The app stores local assessment history on the device for trend analysis and export, but test traffic and lookups still depend on the network path and endpoint availability.

## License

This project currently does not include a repository license file. If you plan to publish or redistribute it publicly, add a license before release.

## Contributing

Pull requests are welcome. Please keep changes focused, test the build locally, and document any new network measurement behavior or user-facing changes.
