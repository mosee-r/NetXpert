# SpeedXpat Android Port

This folder contains a native Android wrapper around the existing SpeedXpat web app.

## What it does

- Loads the exact production front-end bundle built from the existing Vite app.
- Packages the web app assets into the Android application and serves them on a secure local WebView origin.
- Uses real Cloudflare HTTP probes and M-Lab NDT7 measurements in the Android app; it does not simulate network results.

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
- Android defaults to Cloudflare's public download/upload test endpoints and M-Lab for throughput; DNS resolution uses DNS-over-HTTPS. The web build continues to use the repository's `/api/...` backend routes.
- PDF, CSV, and JSON exports use Android's system save picker. Android requires system Location services to be enabled, in addition to the app's Location permission, before it will reveal a connected Wi-Fi network name.
- The Tools tab includes a native nearby Wi-Fi scan using Android's public `WifiManager` API (no third-party scanner dependency). It shows visible SSIDs, band/channel, signal level, and security locally; BSSIDs are not exposed or stored. Android requires Wi-Fi, Location permission, and device Location services, and may rate-limit scans. Browser builds cannot access nearby scan results.
- The permanent Android application ID is `com.pixelapps.speedxpat`. Release APKs are signed with the local-only `keystore.properties` configuration; never commit that file or the private keystore. Build a signed APK with `.\gradlew.bat assembleRelease`.
- Keep a secure backup of the release keystore and its passwords. Losing them prevents future updates from being signed as the same app.
