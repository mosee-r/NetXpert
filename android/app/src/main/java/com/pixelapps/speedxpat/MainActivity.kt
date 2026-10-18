package com.pixelapps.speedxpat

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.SystemClock
import android.location.LocationManager
import android.provider.Settings
import android.util.Base64
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.widget.Toast
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

private const val WEBVIEW_LOG_TAG = "SpeedXpatWebView"
private val nativePingTimeRegex = Regex("time[=<]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*ms", RegexOption.IGNORE_CASE)
private val nativePingBytesRegex = Regex("(\\d+)\\s+bytes from", RegexOption.IGNORE_CASE)
private val nativePingTtlRegex = Regex("ttl[= ](\\d+)", RegexOption.IGNORE_CASE)

private fun isValidNativePingHost(host: String): Boolean {
    if (host.isBlank() || host.length > 253 || host.startsWith("-")) return false
    if (host.contains(':')) return host.matches(Regex("^[0-9A-Fa-f:]+$"))
    val normalizedHost = host.removeSuffix(".")
    return normalizedHost.isNotEmpty() && normalizedHost.split('.').all { label ->
        label.length in 1..63 &&
            label.first().isLetterOrDigit() &&
            label.last().isLetterOrDigit() &&
            label.all { it.isLetterOrDigit() || it == '-' }
    }
}

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var pendingFileContent: String? = null
    private var pendingFileMimeType = ""
    private var pendingFileBase64Encoded = false
    private var wifiScanReceiverRegistered = false
    private var wifiPermissionRequestPending = false

    private val requestWifiNameLocationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted && !SpeedXpatNativeInterface.isLocationEnabled(this)) {
            openLocationSettings()
        }
    }

    private val requestWifiLocationPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        wifiPermissionRequestPending = false
        val locationGranted =
            results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                results[Manifest.permission.ACCESS_COARSE_LOCATION] == true ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val nearbyGranted =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                results[Manifest.permission.NEARBY_WIFI_DEVICES] == true ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) == PackageManager.PERMISSION_GRANTED

        if (locationGranted || nearbyGranted) {
            startWifiScan()
        } else {
            publishWifiScanError("Location and Wi-Fi permissions are required to scan nearby Wi-Fi networks.")
        }
    }

    private val wifiScanReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val freshResults = intent?.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false) == true
            publishWifiScanResults(freshResults)
        }
    }

    private val createDocument = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val content = pendingFileContent
        val base64Encoded = pendingFileBase64Encoded
        pendingFileContent = null
        pendingFileMimeType = ""
        pendingFileBase64Encoded = false

        val uri = result.data?.data
        if (result.resultCode != RESULT_OK || uri == null || content == null) {
            if (content != null && result.resultCode != RESULT_CANCELED) {
                Toast.makeText(this, "Report export cancelled.", Toast.LENGTH_SHORT).show()
            }
            return@registerForActivityResult
        }

        try {
            val bytes = if (base64Encoded) Base64.decode(content, Base64.DEFAULT) else content.toByteArray(Charsets.UTF_8)
            contentResolver.openOutputStream(uri, "w")?.use { it.write(bytes) }
                ?: throw IllegalStateException("Unable to open the selected document.")
            Toast.makeText(this, "Report saved successfully.", Toast.LENGTH_LONG).show()
        } catch (error: Exception) {
            Toast.makeText(this, "Unable to save report: ${error.localizedMessage}", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.setGeolocationEnabled(true)

        webView.addJavascriptInterface(SpeedXpatNativeInterface(this), "AndroidNative")
        registerWifiScanReceiver()

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage): Boolean {
                val logMessage =
                    "${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})"
                when (consoleMessage.messageLevel()) {
                    android.webkit.ConsoleMessage.MessageLevel.ERROR -> Log.e(WEBVIEW_LOG_TAG, logMessage)
                    android.webkit.ConsoleMessage.MessageLevel.WARNING -> Log.w(WEBVIEW_LOG_TAG, logMessage)
                    else -> Log.d(WEBVIEW_LOG_TAG, logMessage)
                }
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                callback.invoke(origin, false, false)
            }
        }

        webView.webViewClient = SpeedXpatWebViewClient(this)
        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) {
            webView.postDelayed({
                webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('speedxpat-network-refresh'))",
                    null
                )
            }, 250)
        }
    }

    fun lookupAccessPointVendor(oui: String) {
        if (!oui.matches(Regex("^[0-9A-Fa-f]{6}$"))) {
            publishAccessPointVendorResult(oui, null, "invalid")
            return
        }

        Thread {
            var vendor: String? = null
            var status = "error"
            var connection: HttpURLConnection? = null
            try {
                connection = URL("https://api.macvendors.com/${oui.uppercase()}").openConnection() as HttpURLConnection
                connection.connectTimeout = 3_000
                connection.readTimeout = 3_000
                connection.setRequestProperty("Accept", "text/plain")
                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    vendor = connection.inputStream.bufferedReader().use { it.readText() }
                        .trim()
                        .take(120)
                        .takeIf { it.isNotEmpty() }
                    status = if (vendor == null) "not-found" else "found"
                } else if (connection.responseCode == HttpURLConnection.HTTP_NOT_FOUND) {
                    status = "not-found"
                }
            } catch (error: Exception) {
                Log.w(WEBVIEW_LOG_TAG, "Access-point vendor lookup failed: ${error.localizedMessage}")
            } finally {
                connection?.disconnect()
            }

            runOnUiThread {
                publishAccessPointVendorResult(oui.uppercase(), vendor, status)
            }
        }.start()
    }

    fun runNativePing(host: String, count: Int, payloadSize: Int, requestId: String): Boolean {
        val targetHost = host.trim()
        if (!isValidNativePingHost(targetHost) || count !in 1..10 || payloadSize !in 8..1400 ||
            !requestId.matches(Regex("^[A-Za-z0-9_-]{1,80}$"))
        ) {
            return false
        }

        Thread({
            var process: Process? = null
            val samples = mutableListOf<Double>()
            var outputDetail: String? = null
            try {
                for (sequence in 1..count) {
                    val probeStartedAt = SystemClock.elapsedRealtime()
                    val pingProcess = ProcessBuilder(
                        "/system/bin/ping",
                        "-c", "1",
                        "-s", payloadSize.toString(),
                        "-W", "1",
                        targetHost
                    ).redirectErrorStream(true).start()
                    process = pingProcess
                    val finished = pingProcess.waitFor(2, TimeUnit.SECONDS)
                    if (!finished) {
                        pingProcess.destroyForcibly()
                        pingProcess.waitFor(1, TimeUnit.SECONDS)
                    }
                    val output = pingProcess.inputStream.bufferedReader().use { it.readText() }
                    process = null
                    outputDetail = output.lineSequence().lastOrNull { it.isNotBlank() }
                        ?.trim()
                        ?.take(180)

                    val rttMs = nativePingTimeRegex.find(output)
                        ?.groupValues?.getOrNull(1)?.toDoubleOrNull()
                    val line = if (rttMs != null) {
                        samples.add(rttMs)
                        val bytes = nativePingBytesRegex.find(output)
                            ?.groupValues?.getOrNull(1)?.toIntOrNull() ?: payloadSize + 8
                        val ttl = nativePingTtlRegex.find(output)
                            ?.groupValues?.getOrNull(1)?.toIntOrNull()
                        "Reply from $targetHost: bytes=$bytes time=${"%.1f".format(java.util.Locale.US, rttMs)}ms${ttl?.let { " TTL=$it" } ?: ""}"
                    } else {
                        if (output.contains("unreachable", ignoreCase = true)) {
                            "Reply from $targetHost: Destination host unreachable."
                        } else {
                            "Request timed out."
                        }
                    }

                    publishNativePingResult(
                        JSONObject()
                            .put("type", "progress")
                            .put("requestId", requestId)
                            .put("host", targetHost)
                            .put("count", count)
                            .put("payloadSize", payloadSize)
                            .put("sent", sequence)
                            .put("received", samples.size)
                            .put("line", line)
                    )

                    if (sequence < count) {
                        val elapsedMs = SystemClock.elapsedRealtime() - probeStartedAt
                        val pauseMs = 1_000 - elapsedMs
                        if (pauseMs > 0) Thread.sleep(pauseMs)
                    }
                }

                val transmitted = count
                val received = samples.size
                val lossPercent = ((transmitted - received).coerceAtLeast(0) * 100.0 / transmitted)
                val status = when {
                    samples.isEmpty() -> "failed"
                    received < transmitted -> "partial"
                    else -> "success"
                }
                val message = when {
                    status == "success" -> "All requested probes received replies."
                    status == "partial" -> "Received $received of $transmitted replies."
                    else -> outputDetail ?: "No ICMP replies received; Android may block native ping on this device."
                }

                publishNativePingResult(
                    JSONObject()
                        .put("type", "complete")
                        .put("requestId", requestId)
                        .put("host", targetHost)
                        .put("count", count)
                        .put("payloadSize", payloadSize)
                        .put("status", status)
                        .put("sent", transmitted)
                        .put("received", received)
                        .put("lossPercent", lossPercent)
                        .put("samples", JSONArray().apply { samples.forEach(::put) })
                        .put("minMs", samples.minOrNull() ?: JSONObject.NULL)
                        .put("avgMs", samples.takeIf { it.isNotEmpty() }?.average() ?: JSONObject.NULL)
                        .put("maxMs", samples.maxOrNull() ?: JSONObject.NULL)
                        .put("message", message)
                )
            } catch (error: Exception) {
                process?.destroyForcibly()
                val received = samples.size
                publishNativePingResult(
                    JSONObject()
                        .put("type", "complete")
                        .put("requestId", requestId)
                        .put("host", targetHost)
                        .put("count", count)
                        .put("payloadSize", payloadSize)
                        .put("status", if (received == 0) "failed" else "partial")
                        .put("sent", count)
                        .put("received", received)
                        .put("lossPercent", ((count - received).coerceAtLeast(0) * 100.0 / count))
                        .put("samples", JSONArray().apply { samples.forEach(::put) })
                        .put("minMs", samples.minOrNull() ?: JSONObject.NULL)
                        .put("avgMs", samples.takeIf { it.isNotEmpty() }?.average() ?: JSONObject.NULL)
                        .put("maxMs", samples.maxOrNull() ?: JSONObject.NULL)
                        .put("message", error.localizedMessage ?: "Native ping could not be started.")
                )
            }
        }, "speedxpat-native-ping").start()
        return true
    }

    private fun publishAccessPointVendorResult(oui: String, vendor: String?, status: String) {
        if (!::webView.isInitialized || isFinishing) return
        val eventDetail = JSONObject()
            .put("oui", oui)
            .put("vendor", vendor)
            .put("status", status)
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('speedxpat-access-point-vendor', { detail: $eventDetail }))",
            null
        )
    }

    private fun publishNativePingResult(payload: JSONObject) {
        if (!::webView.isInitialized || isFinishing) return
        val detail = JSONObject.quote(payload.toString())
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('speedxpat-native-ping', { detail: $detail }));",
                null
            )
        }
    }

    override fun onDestroy() {
        if (wifiScanReceiverRegistered) {
            unregisterReceiver(wifiScanReceiver)
            wifiScanReceiverRegistered = false
        }
        super.onDestroy()
    }

    fun startWifiScan(): Boolean {
        val permissionsToRequest = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.NEARBY_WIFI_DEVICES)
            }
        }

        val hasFineLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarseLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasFineLocation && !hasCoarseLocation) {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
            permissionsToRequest.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }

        if (permissionsToRequest.isNotEmpty()) {
            if (!wifiPermissionRequestPending) {
                wifiPermissionRequestPending = true
                runOnUiThread {
                    try {
                        requestWifiLocationPermissions.launch(permissionsToRequest.toTypedArray())
                    } catch (error: Exception) {
                        wifiPermissionRequestPending = false
                        publishWifiScanError(
                            "Unable to request Wi-Fi & Location permissions: ${error.localizedMessage}"
                        )
                    }
                }
            }
            return true
        }

        if (!SpeedXpatNativeInterface.isLocationEnabled(this)) {
            publishWifiScanError("Turn on device Location services to scan nearby Wi-Fi networks.")
            return false
        }

        @Suppress("DEPRECATION")
        val wifiManager = applicationContext.getSystemService(WIFI_SERVICE) as? WifiManager
        if (wifiManager == null || !wifiManager.isWifiEnabled) {
            publishWifiScanError("Turn on Wi-Fi before scanning for nearby networks.")
            return false
        }

        return try {
            if (wifiManager.startScan()) {
                true
            } else {
                publishWifiScanResults(false)
                true
            }
        } catch (_: SecurityException) {
            publishWifiScanError("Android blocked the Wi-Fi scan. Check Location permission and system Location settings.")
            false
        }
    }

    private fun registerWifiScanReceiver() {
        val filter = IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(wifiScanReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(wifiScanReceiver, filter)
        }
        wifiScanReceiverRegistered = true
    }

    private fun publishWifiScanResults(freshResults: Boolean) {
        @Suppress("DEPRECATION")
        val wifiManager = applicationContext.getSystemService(WIFI_SERVICE) as? WifiManager
        val scanResults = try {
            wifiManager?.scanResults.orEmpty()
        } catch (_: SecurityException) {
            publishWifiScanError("Android blocked access to Wi-Fi scan results. Check Location permission and system Location settings.")
            return
        }
        val elapsedRealtimeMicros = SystemClock.elapsedRealtimeNanos() / 1_000
        val latestScanAgeMs = scanResults
            .filter { it.timestamp > 0 }
            .minOfOrNull { ((elapsedRealtimeMicros - it.timestamp).coerceAtLeast(0)) / 1_000 }
            ?: 0
        val scanTimestamp = System.currentTimeMillis() - latestScanAgeMs
        val networks = try {
            JSONArray().apply {
                scanResults
                    .distinctBy { "${it.SSID}|${it.BSSID}|${it.frequency}|${it.capabilities}" }
                    .sortedByDescending { it.level }
                    .forEach { result ->
                        put(
                            JSONObject()
                                .put(
                                    "ssid",
                                    result.SSID.takeUnless { it.isBlank() || it == "<unknown ssid>" } ?: ""
                                )
                                .put("bssid", result.BSSID.orEmpty())
                                .put("hidden", result.SSID.isBlank() || result.SSID == "<unknown ssid>")
                                .put("frequencyMhz", result.frequency)
                                .put("channel", wifiChannel(result.frequency) ?: JSONObject.NULL)
                                .put("band", wifiBand(result.frequency))
                                .put("channelWidthMhz", wifiChannelWidth(result.channelWidth))
                                .put("signalDbm", result.level)
                                .put("security", wifiSecurity(result.capabilities))
                                .put("wifiStandard", wifiStandard(result))
                        )
                    }
            }
        } catch (_: SecurityException) {
            publishWifiScanError("Android blocked access to Wi-Fi scan results. Check Location permission and system Location settings.")
            return
        }

        publishWifiScanPayload(
            JSONObject()
                .put("status", if (freshResults) "success" else "stale")
                .put("scannedAt", scanTimestamp)
                .put("scanAgeMs", latestScanAgeMs)
                .put("networks", networks)
        )
    }

    private fun wifiChannelWidth(channelWidth: Int): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            channelWidth == android.net.wifi.ScanResult.CHANNEL_WIDTH_320MHZ
        ) {
            return 320
        }
        return when (channelWidth) {
            android.net.wifi.ScanResult.CHANNEL_WIDTH_40MHZ -> 40
            android.net.wifi.ScanResult.CHANNEL_WIDTH_80MHZ -> 80
            android.net.wifi.ScanResult.CHANNEL_WIDTH_160MHZ -> 160
            android.net.wifi.ScanResult.CHANNEL_WIDTH_80MHZ_PLUS_MHZ -> 160
            else -> 20
        }
    }

        private fun wifiStandard(result: android.net.wifi.ScanResult): String {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return "Unknown"
            return when (result.wifiStandard) {
                android.net.wifi.ScanResult.WIFI_STANDARD_LEGACY -> "Legacy"
                android.net.wifi.ScanResult.WIFI_STANDARD_11N -> "Wi-Fi 4"
                android.net.wifi.ScanResult.WIFI_STANDARD_11AC -> "Wi-Fi 5"
                android.net.wifi.ScanResult.WIFI_STANDARD_11AX -> "Wi-Fi 6"
                android.net.wifi.ScanResult.WIFI_STANDARD_11AD -> "WiGig"
                android.net.wifi.ScanResult.WIFI_STANDARD_11BE -> "Wi-Fi 7"
                else -> "Unknown"
            }
        }

        private fun publishWifiScanError(message: String) {
            publishWifiScanPayload(JSONObject().put("status", "error").put("message", message))
        }

        private fun publishWifiScanPayload(payload: JSONObject) {
            if (!::webView.isInitialized || isFinishing) return
            val detail = JSONObject.quote(payload.toString())
            webView.post {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('speedxpat-wifi-scan', { detail: $detail }));",
                    null
                )
            }
        }

        private fun wifiChannel(frequencyMhz: Int): Int? = when (frequencyMhz) {
            2484 -> 14
            5935 -> 2
            in 2412..2472 -> (frequencyMhz - 2407) / 5
            in 5000..5895 -> (frequencyMhz - 5000) / 5
            in 5955..7115 -> (frequencyMhz - 5950) / 5
            else -> null
        }

        private fun wifiBand(frequencyMhz: Int): String = when (frequencyMhz) {
            in 2400..2500 -> "2.4 GHz"
            in 4900..5900 -> "5 GHz"
            in 5925..7125 -> "6 GHz"
            else -> "Other"
        }

        private fun wifiSecurity(capabilities: String): String = when {
            capabilities.contains("WPA3", ignoreCase = true) -> "WPA3"
            capabilities.contains("WPA2", ignoreCase = true) -> "WPA2"
            capabilities.contains("WPA", ignoreCase = true) -> "WPA"
            capabilities.contains("WEP", ignoreCase = true) -> "WEP"
            capabilities.contains("OWE", ignoreCase = true) -> "Enhanced Open"
            else -> "Open"
        }

    fun saveFile(filename: String, mimeType: String, content: String, base64Encoded: Boolean): Boolean {
        if (mimeType !in setOf("application/pdf", "image/png", "text/csv", "application/json")) return false
        if (pendingFileContent != null) return false

        val safeFilename = filename
            .substringAfterLast('/')
            .substringAfterLast('\\')
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .take(120)
            .ifBlank { "SpeedXpat-report" }

        pendingFileContent = content
        pendingFileMimeType = mimeType
        pendingFileBase64Encoded = base64Encoded
        runOnUiThread {
            try {
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = mimeType
                    putExtra(Intent.EXTRA_TITLE, safeFilename)
                }
                createDocument.launch(intent)
            } catch (error: Exception) {
                pendingFileContent = null
                pendingFileMimeType = ""
                pendingFileBase64Encoded = false
                Toast.makeText(
                    this,
                    "Unable to open the report save dialog: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
        return true
    }

    fun shareFile(filename: String, mimeType: String, content: String, base64Encoded: Boolean): Boolean {
        if (mimeType != "image/png" || !base64Encoded) return false

        return try {
            val safeFilename = filename
                .substringAfterLast('/')
                .substringAfterLast('\\')
                .replace(Regex("[^A-Za-z0-9._-]"), "_")
                .take(120)
                .ifBlank { "SpeedXpat-results.png" }
            val shareDirectory = File(cacheDir, "shared").apply { mkdirs() }
            val shareFile = File(shareDirectory, safeFilename)
            shareFile.writeBytes(Base64.decode(content, Base64.DEFAULT))
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", shareFile)
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            runOnUiThread {
                startActivity(Intent.createChooser(shareIntent, "Share SpeedXpat test results"))
            }
            true
        } catch (error: Exception) {
            runOnUiThread {
                Toast.makeText(this, "Unable to share PNG: ${error.localizedMessage}", Toast.LENGTH_LONG).show()
            }
            false
        }
    }

    fun openLocationSettings() {
        runOnUiThread {
            startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
        }
    }

    fun requestWifiNameAccess() {
        runOnUiThread {
            val hasLocationPermission =
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (!hasLocationPermission) {
                requestWifiNameLocationPermission.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            } else if (!SpeedXpatNativeInterface.isLocationEnabled(this)) {
                openLocationSettings()
            }
        }
    }

    fun openApplicationSettings() {
        runOnUiThread {
            startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", packageName, null)
                )
            )
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}

class SpeedXpatNativeInterface(private val context: Context) {
    @JavascriptInterface
    fun lookupAccessPointVendor(oui: String) {
        (context as? MainActivity)?.lookupAccessPointVendor(oui)
    }

    @JavascriptInterface
    fun getWifiSsid(): String {
        return fetchSsid(context)
    }

    @JavascriptInterface
    fun getWifiBssid(): String {
        return fetchWifiBssid(context)
    }

    @JavascriptInterface
    fun getLocalIpAddress(): String {
        return fetchLocalIpAddress(context)
    }

    @JavascriptInterface
    fun getGatewayAddress(): String {
        return fetchGatewayAddress(context)
    }

    @JavascriptInterface
    fun getWifiSignalDbm(): Double {
        return fetchWifiSignalDbm(context).toDouble()
    }

    @JavascriptInterface
    fun getWifiFrequencyMhz(): Double {
        return fetchWifiFrequencyMhz(context).toDouble()
    }

    @JavascriptInterface
    fun getNetworkType(): String {
        return fetchNetworkType(context)
    }

    @JavascriptInterface
    fun hasValidatedInternet(): Boolean {
        val connectivityManager =
            context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return false
        val activeNetwork = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    @JavascriptInterface
    fun hasWifiNamePermission(): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    @JavascriptInterface
    fun isLocationEnabled(): Boolean {
        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return false
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            locationManager.isLocationEnabled
        } else {
            Settings.Secure.getInt(
                context.contentResolver,
                Settings.Secure.LOCATION_MODE,
                Settings.Secure.LOCATION_MODE_OFF
            ) != Settings.Secure.LOCATION_MODE_OFF
        }
    }

    @JavascriptInterface
    fun requestWifiNameAccess() {
        (context as? MainActivity)?.requestWifiNameAccess()
    }

    @JavascriptInterface
    fun openLocationSettings() {
        (context as? MainActivity)?.openLocationSettings()
    }

    @JavascriptInterface
    fun openApplicationSettings() {
        (context as? MainActivity)?.openApplicationSettings()
    }

    @JavascriptInterface
    fun scanWifiNetworks(): Boolean {
        return (context as? MainActivity)?.startWifiScan() ?: false
    }

    @JavascriptInterface
    fun runNativePing(host: String, count: Int, payloadSize: Int, requestId: String): Boolean {
        return (context as? MainActivity)?.runNativePing(host, count, payloadSize, requestId) ?: false
    }

    @JavascriptInterface
    fun saveFile(filename: String, mimeType: String, content: String, base64Encoded: Boolean): Boolean {
        return (context as? MainActivity)?.saveFile(filename, mimeType, content, base64Encoded) ?: false
    }

    @JavascriptInterface
    fun shareFile(filename: String, mimeType: String, content: String, base64Encoded: Boolean): Boolean {
        return (context as? MainActivity)?.shareFile(filename, mimeType, content, base64Encoded) ?: false
    }

    companion object {
        fun isLocationEnabled(context: Context): Boolean {
            val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                ?: return false
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                locationManager.isLocationEnabled
            } else {
                Settings.Secure.getInt(
                    context.contentResolver,
                    Settings.Secure.LOCATION_MODE,
                    Settings.Secure.LOCATION_MODE_OFF
                ) != Settings.Secure.LOCATION_MODE_OFF
            }
        }

        fun fetchSsid(context: Context): String {
            val hasLocationPermission =
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val locationEnabled = isLocationEnabled(context)
            if (!hasLocationPermission || !locationEnabled) return ""

            val connectivityManager =
                context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val networkWifiInfo = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                connectivityManager?.getNetworkCapabilities(connectivityManager.activeNetwork)
                    ?.transportInfo as? WifiInfo
            } else {
                null
            }
            @Suppress("DEPRECATION")
            val wifiManager =
                context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            @Suppress("DEPRECATION")
            val managerSsid = wifiManager?.connectionInfo?.ssid
            return sequenceOf(networkWifiInfo?.ssid, managerSsid)
                .mapNotNull { it?.trim('"')?.trim() }
                .firstOrNull { it.isNotEmpty() && it != "<unknown ssid>" && it != "0x" }
                .orEmpty()
        }

        fun fetchWifiBssid(context: Context): String {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val wifiInfo = wifiManager?.connectionInfo ?: return ""
            return wifiInfo.bssid.orEmpty()
        }

        fun fetchLocalIpAddress(context: Context): String {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val ipAddress = wifiManager?.dhcpInfo?.ipAddress ?: 0
            if (ipAddress == 0) return ""
            return android.text.format.Formatter.formatIpAddress(ipAddress)
        }

        fun fetchGatewayAddress(context: Context): String {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val gateway = wifiManager?.dhcpInfo?.gateway ?: 0
            if (gateway == 0) return ""
            return android.text.format.Formatter.formatIpAddress(gateway)
        }

        fun fetchWifiSignalDbm(context: Context): Int {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val wifiInfo = wifiManager?.connectionInfo ?: return 0
            return wifiInfo.rssi
        }

        fun fetchWifiFrequencyMhz(context: Context): Int {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val wifiInfo = wifiManager?.connectionInfo ?: return 0
            return wifiInfo.frequency
        }

        fun fetchNetworkType(context: Context): String {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
            return when {
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "wifi"
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "cellular"
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "ethernet"
                else -> "unknown"
            }
        }
    }
}

private class SpeedXpatWebViewClient(
    private val context: Context,
) : WebViewClient() {
    private val assetLoader = WebViewAssetLoader.Builder()
        .addPathHandler("/", WebViewAssetLoader.PathHandler { path ->
            openAsset("www/$path")
        })
        .build()

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest,
    ): WebResourceResponse? {
        return assetLoader.shouldInterceptRequest(request.url)
            ?: super.shouldInterceptRequest(view, request)
    }

    override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: android.webkit.WebResourceError,
    ) {
        Log.e(
            WEBVIEW_LOG_TAG,
            "WebView load failed (mainFrame=${request.isForMainFrame}, code=${error.errorCode}): " +
                "${request.url} — ${error.description}"
        )
        super.onReceivedError(view, request, error)
    }

    override fun onReceivedHttpError(
        view: WebView,
        request: WebResourceRequest,
        errorResponse: WebResourceResponse,
    ) {
        Log.e(
            WEBVIEW_LOG_TAG,
            "WebView HTTP error ${errorResponse.statusCode} (mainFrame=${request.isForMainFrame}): ${request.url}"
        )
        super.onReceivedHttpError(view, request, errorResponse)
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url
        return uri.scheme != "https" && uri.scheme != "file" && uri.scheme != "assets"
    }

    private fun openAsset(path: String): WebResourceResponse? {
        return try {
            val normalizedPath = path.removePrefix("/")
            if (normalizedPath.isBlank() || normalizedPath.contains("..")) {
                return null
            }
            val inputStream = context.assets.open(normalizedPath)
            val mimeType = when {
                normalizedPath.endsWith(".html") -> "text/html"
                normalizedPath.endsWith(".js") -> "application/javascript"
                normalizedPath.endsWith(".css") -> "text/css"
                normalizedPath.endsWith(".json") -> "application/json"
                normalizedPath.endsWith(".png") -> "image/png"
                normalizedPath.endsWith(".jpg") || normalizedPath.endsWith(".jpeg") -> "image/jpeg"
                normalizedPath.endsWith(".svg") -> "image/svg+xml"
                normalizedPath.endsWith(".ico") -> "image/x-icon"
                else -> "application/octet-stream"
            }
            WebResourceResponse(mimeType, "UTF-8", inputStream)
        } catch (error: Exception) {
            Log.e(WEBVIEW_LOG_TAG, "Unable to open WebView asset: $path", error)
            null
        }
    }
}
