# SpeedXpat Android Port

This folder contains a native Android wrapper around the existing SpeedXpat web app.

## What it does

- Loads the exact production front-end bundle built from the existing Vite app.
- Packages the web app assets into the Android application and serves them on a secure local WebView origin.
- Uses Cloudflare for primary speed-test download/upload results, with optional M-Lab NDT7 TCP diagnostics and server metadata kept separate from an IP-to-ASN ISP lookup; it does not simulate network results.

## Open in Android Studio

1. Launch Android Studio.
2. Choose Open an Existing Project.
3. Select the `android` folder in this repository.
4. Let Gradle sync finish.
5. Run the app on an emulator or physical device.

## Notes

- Gradle builds the Vite bundle and syncs it into `app/src/main/assets/www` before building the Android app. The repository's root `node_modules` must be installed first.
- The Android wrapper is implemented in `app/src/main/java/com/pixelapps/speedxpat/MainActivity.kt`.
- Android serves the bundle through `WebViewAssetLoader` so JavaScript modules load correctly without insecure `file://` access.
- Primary download/upload measurements use Cloudflare's public speed-test endpoints on both web and Android. M-Lab NDT7 runs separately when deep diagnostics are enabled and never replaces the Cloudflare score; its server metadata and TCP RTT are reported as diagnostic results. ISP identification comes from a separate public IP-to-ASN lookup. DNS resolution uses DNS-over-HTTPS.
- PDF, CSV, and JSON exports use Android's system save picker; PNG sharing uses the Android Sharesheet. Location permission is requested only when the user starts a nearby Wi-Fi scan in Tools. Android system Location services must also be enabled for scan results and connected Wi-Fi names.
- The Tools tab includes a native nearby Wi-Fi analyzer using Android's public `WifiManager` API (no third-party scanner dependency). Its AP list, channel spectrum, signal history, and channel rating views show SSID/BSSID, band/channel, signal, security, and available Wi-Fi standard locally. BSSIDs are shown only in the AP list and are not persisted or sent to a service. Filters cover band, signal strength, security, and hidden networks. Live mode requests a scan about every 35 seconds, but Android and device manufacturers control scan throttling and can return cached results; the UI labels cached data and scan age. Android requires Wi-Fi, Location permission, and device Location services. Browser builds cannot access nearby scan results.
- The permanent Android application ID is `com.pixelapps.speedxpat`. Release APKs are signed with the local-only `keystore.properties` configuration; never commit that file or the private keystore. Build a signed APK with `.\gradlew.bat assembleRelease`.
- Keep a secure backup of the release keystore and its passwords. Losing them prevents future updates from being signed as the same app.

## Publish a GitHub Release

The `Android Release` GitHub Actions workflow builds and publishes a signed APK whenever a `v*` tag is pushed. Add these repository Actions secrets under **Settings > Secrets and variables > Actions**:

- `ANDROID_KEYSTORE_BASE64`: Base64-encoded bytes of the existing release keystore.
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`: The existing signing credentials.

For example, encode the keystore on Windows with `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\release.keystore"))`. Use the same keystore already used for releases so users can install updates. After pushing the workflow changes, create and push a version tag such as `v1.0.1`; the workflow creates the GitHub Release and attaches its APK. The tag supplies the app version name, while the workflow run number plus one supplies an increasing Android version code.
