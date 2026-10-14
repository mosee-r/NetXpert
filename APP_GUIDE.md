# SpeedXpat App Guide

SpeedXpat is a React/TypeScript network diagnostics app with a Vite web build and a native Android WebView wrapper. It measures connection performance, presents activity-suitability assessments, and stores saved reports locally.

## Run the App

Prerequisites: Node.js 22 or later.

```powershell
npm install
npm run dev
```

The development server normally listens on `http://localhost:3000`.

```powershell
npm run lint
npm run build
```

`npm run lint` runs TypeScript without emitting files. `npm run build` builds the Vite client and bundles `server.ts`. The Android app packages the web build into its WebView assets with:

```powershell
android\gradlew.bat -p android :app:buildWebBundle
```

## Main Navigation

The bottom navigation in `src/components/BottomNav.tsx` opens four active tabs:

| Tab | Component | Purpose |
| --- | --- | --- |
| Speed Test | `SpeedTestHome` | Guided test, results, activity suitability, and exports. |
| Network | `NetworkTab` | Current network/provider details and saved Wi-Fi/cellular comparison. |
| Tools | `DiagnosticToolsTab` | Focused latency, DNS, bufferbloat, HTTP probe, and Android Wi-Fi diagnostics. |
| Trends | `TrendsTab` | Browse, inspect, filter, export, and delete saved reports. |

The shared header changes its title and contextual actions by tab and test state. Settings and advanced diagnostics are opened from the header.

## Guided Speed Test

`AssessmentOrchestrator` coordinates the test and emits progress to `App.tsx`. The Speed Test screen has three user-facing states:

1. **Idle:** Start the test. No measurement is fabricated or initialized to a displayed zero.
2. **Active:** Show the current phase, progress, cancellation control, adaptive gauge, and Download/Upload throughput cards. Measurements not yet available stay blank or display an unavailable state.
3. **Results:** Show the saved report’s measurements and activity ratings. A completed report remains pending until **Save and close**; **Discard** removes that pending report without adding it to history. Retest starts a fresh run.

The guided sequence is:

1. Detect network information and locate an optional nearby Measurement Lab server.
2. Measure DNS timing for the configured domain.
3. Run eight HTTPS fetch round-trip probes for idle latency and jitter.
4. Measure download throughput from the Cloudflare speed-test endpoint. The default cap is 8 MiB and the target duration is about 3.5 seconds.
5. Measure upload throughput to the Cloudflare endpoint. The default cap is 4 MiB and the target duration is about 3 seconds.
6. If enabled and a server is located, run separate M-Lab NDT7 download and upload diagnostics. These are supplemental and do not replace the primary Cloudflare measurements.
7. Measure baseline, under-load, and recovery latency for bufferbloat. The load is a concurrent HTTP download.
8. Score six activity profiles: gaming, streaming, conferencing, browsing, remote work, and transfers.

The app calls `AssessmentOrchestrator.cancel()` when a running test is cancelled. Cancelled runs are not saved as reports.

## Adaptive Gauge and Throughput Cards

`ModernSpeedGauge` uses the actual measured Mbps value and a piecewise tick scale. The dial selects a readable range around the reading, expands for faster links, and contracts for slower links with hysteresis. The displayed number is not capped by the dial. Its needle animation uses SVG element references and `requestAnimationFrame`, and respects `prefers-reduced-motion`.

`TwinThroughputCards` shows separate Download and Upload measurements and timestamped samples. It plots straight segments from real samples. The mini-chart requires five valid samples; while a test is running it says **Collecting samples...**, and after completion it distinguishes insufficient samples from no samples. It does not synthesize points.

## Network Tab

`NetworkTab` presents available ISP/ASN and geolocation information, browser-reported downlink and RTT where supported, Wi-Fi frequency/RSSI when available, public IP, and the latest saved Wi-Fi and cellular reports. Unsupported values should appear as unavailable rather than guessed.

Network identification uses `networkInfoEngine.ts`: it tries `ipinfo.io`, a server `/api/network/isp` fallback on web, and `api.ipify.org` for an IP fallback. These lookups require network access and disclose the public IP to the respective lookup service. Browser Network Information API values such as `downlinkMbps` are estimates, not the measured speed-test result.

## Diagnostic Tools

The Tools tab is implemented in `DiagnosticToolsTab.tsx`.

| Tool | How it works | Important limitation |
| --- | --- | --- |
| Live Wi-Fi Analyzer | Requests Android Wi-Fi scan results; supports one-shot or periodic scans, band/security/signal filters, AP details, channel view, signal history, and channel ratings. | Requires the Android wrapper, Wi-Fi, Location services, and Android permissions. The OS may throttle scans or return cached results. Browser-only use cannot scan nearby APs. BSSID details stay in the device UI and are not saved into reports. |
| Continuous Ping Monitor | Repeated HTTP `HEAD`/`GET` requests produce a rolling response-time display. | This is HTTP request timing, not ICMP ping. A failed request is not proof of IP packet loss. |
| HTTP Probe Drop Rate | Runs a configurable number of HTTPS probes with a per-probe timeout; reports completed, successful, failed, and partial counts. | This is an application-level HTTP probe failure rate, not IP-layer packet loss. CORS, TLS, endpoint, or timeout issues can count as failures. |
| Bufferbloat Saturation Probe | Measures idle baseline, latency during a concurrent HTTP download, and recovery; reports the latency delta and grade. | It tests HTTP-induced queueing, not raw router packet queue telemetry. The result is only successful when all three latency phases have usable samples. |
| DNS Resolver Benchmark | Sequentially times domain lookups for Cloudflare-, Google-, Quad9-, and OpenDNS-associated domains. | The implementation calls the app DNS timing engine for each domain; it does not directly send DNS packets to each provider IP. Results should be read as lookup timing through the configured backend/DoH path, not a definitive resolver-vs-resolver benchmark. |
| Remote Endpoint Latency | Runs eight HTTPS fetch round-trip probes against a configurable endpoint and reports min, median, max, and jitter. | It is HTTP/HTTPS endpoint timing, not a gateway ping or ICMP measurement. Packet loss is not measured. |

The code contains a reachability-check handler, but it is not currently exposed as a visible control in the Tools UI. It should not be treated as an available user-facing tool.

## Settings

The Settings modal controls:

- Latency probe URL and DNS domain.
- Primary download/upload transfer caps.
- Data Saver Mode, which lowers the transfer caps to 3 MiB download and 1.5 MiB upload.
- Optional M-Lab diagnostics.
- Stream Concurrency selection.

**Current implementation note:** the Stream Concurrency control is stored in UI state but is not passed to `AssessmentOrchestrator` or the throughput engine, so changing it currently has no effect on test execution.

## History and Scoring

`storage.ts` stores up to 50 reports in browser `localStorage` (or Android WebView local storage). Reports are saved only after the user chooses **Save and close**. The Trends tab can filter by all, Wi-Fi, or cellular runs; inspect a result; export reports; and delete individual or all saved reports.

Activity ratings are deterministic threshold-based assessments from `src/scoring/assessActivities.ts` and `src/config/thresholds.ts`. They evaluate measured throughput, idle latency, jitter, latency under load, and DNS timing against versioned heuristics. They are estimates of suitability, not guarantees for a specific service. The current scoring rules are labeled `v1.0.0-2026` and should be reviewed as provider recommendations and standards change.

## Exports

- **PDF:** `pdfReportGenerator.ts` creates an A4 one-page report with measured metrics, activity suitability, a vector download sample chart, ISP/ASN details, and a masked public IP. IP-layer packet loss is shown as not measured.
- **PNG:** `shareImageGenerator.ts` creates a 1080×1350 summary image with branding, connection type, throughput, latency, jitter, quality grade, and download samples. It excludes IP addresses and device identifiers. Web downloads the file; Android uses the native share bridge when available.
- **CSV/JSON:** The Trends tab exports saved reports through `storage.ts`.

## Platform and Data Limitations

- Browser latency probes use HTTPS fetch. They cannot measure raw ICMP packet loss or guarantee router-level latency.
- Packet loss remains **Not measured** in the primary test. The Tools tab’s HTTP probe drop rate is a separate application-layer metric.
- Wi-Fi scans and some radio/link details require the Android native bridge; browser sandboxes do not expose nearby AP scans, raw sockets, or all hardware signal metrics.
- Public IP, ISP, ASN, and approximate geolocation are obtained from external IP lookup services. Local report history is stored on the device, but network lookups and test traffic still contact those services/endpoints.
- Test results depend on endpoint capacity, routing, browser/WebView behavior, Wi-Fi conditions, and sample count. A chart may be omitted when fewer than five valid throughput samples were recorded.

## Code Map

- `src/App.tsx`: app-level tab selection, test state, pending/saved report flow, and orchestration callbacks.
- `src/engines/`: network lookup, DNS, latency, throughput, bufferbloat, and assessment orchestration.
- `src/scoring/` and `src/config/thresholds.ts`: activity suitability rules.
- `src/components/`: active tab screens and UI controls.
- `src/services/`: local history, PDF, PNG, and M-Lab service integration.
- `android/app/src/main/`: native WebView shell, Wi-Fi scanning, file saving, and share bridge.