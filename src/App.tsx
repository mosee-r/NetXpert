/**
 * SpeedXpat — Android Network Diagnostics & Capability Engine
 * Compliant with SPEEDXPAT_UI_SPEC.md
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { BottomNav, MainTabType } from './components/BottomNav';
import { SpeedTestHome } from './components/SpeedTestHome';
import { NetworkTab } from './components/NetworkTab';
import { DiagnosticToolsTab } from './components/DiagnosticToolsTab';
import { TrendsTab } from './components/TrendsTab';
import { SettingsModal } from './components/SettingsModal';
import { Wifi } from 'lucide-react';

import { DeviceNetworkInfo, ThroughputChartPoint } from './types/network';
import { OverallAssessmentReport } from './types/scoring';
import { detectNetworkInfo } from './engines/networkInfoEngine';
import { AssessmentOrchestrator, AssessmentProgress, AssessmentStage } from './engines/orchestrator';
import {
  saveAssessmentReport,
  getAssessmentHistory,
  deleteAssessment,
  clearAllHistory,
} from './services/storage';
import { triggerHaptic } from './utils/haptics';
import {
  getAndroidNativeBridge,
  getDefaultTestEndpoints,
  isAndroidNativeApp,
} from './engines/testEndpoints';

const defaultTestEndpoints = getDefaultTestEndpoints();

function validateTestSettings(
  pingTarget: string,
  dnsDomain: string
): string | null {
  try {
    const url = new URL(pingTarget.trim(), window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return 'Ping target must be an HTTP or HTTPS URL without embedded credentials.';
    }
    if (isAndroidNativeApp() && (url.protocol !== 'https:' || url.origin === window.location.origin)) {
      return 'Ping target on Android must use a public HTTPS endpoint.';
    }
  } catch {
    return 'Ping target is not a valid URL. Check Diagnostics & Test Settings.';
  }

  try {
    const domainUrl = new URL(`https://${dnsDomain.trim()}`);
    if (
      !domainUrl.hostname ||
      domainUrl.pathname !== '/' ||
      domainUrl.search ||
      domainUrl.hash ||
      domainUrl.port
    ) {
      return 'DNS target must be a domain name without a path, port, or query.';
    }
  } catch {
    return 'DNS target is invalid. Enter a domain name such as cloudflare.com.';
  }

  return null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTabType>('speed');
  const [networkInfo, setNetworkInfo] = useState<DeviceNetworkInfo | null>(null);
  const [history, setHistory] = useState<OverallAssessmentReport[]>(() =>
    getAssessmentHistory()
  );
  const [currentReport, setCurrentReport] = useState<OverallAssessmentReport | null>(() => {
    const list = getAssessmentHistory();
    return list.length > 0 ? list[0] : null;
  });
  const [pendingReport, setPendingReport] = useState<OverallAssessmentReport | null>(null);
  const [showResults, setShowResults] = useState(false);
  const initialDownloadMbps = currentReport?.rawMeasurements.downloadThroughput.mbps;

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pingTarget, setPingTarget] = useState(defaultTestEndpoints.ping);
  const [dnsDomain, setDnsDomain] = useState('cloudflare.com');
  const [maxDownloadMb, setMaxDownloadMb] = useState(8);
  const [maxUploadMb, setMaxUploadMb] = useState(4);
  const [benchmarkMode, setBenchmarkMode] = useState(true);
  const [useDownloadCap, setUseDownloadCap] = useState(!benchmarkMode);
  const [useUploadCap, setUseUploadCap] = useState(!benchmarkMode);
  const [concurrencyCount, setConcurrencyCount] = useState(4);
  const [dataSaverMode, setDataSaverMode] = useState(false);
  const [useMlab, setUseMlab] = useState(true);

  const [isTesting, setIsTesting] = useState(false);
  const [isSplashActive, setIsSplashActive] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 700);
    const removeTimer = setTimeout(() => setIsSplashActive(false), 1000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);
  const [testStage, setTestStage] = useState<AssessmentStage>('idle');
  const [stageName, setStageName] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [appError, setAppError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [showWifiAccessPrompt, setShowWifiAccessPrompt] = useState(false);

  useEffect(() => {
    if (!isAndroidNativeApp()) return;

    const promptTimer = setTimeout(() => {
      const native = getAndroidNativeBridge();
      if (!native) return;

      try {
        if (window.localStorage.getItem('speedxpat.wifi-access-prompt-dismissed') === 'true') return;
      } catch (error) {
        console.warn('Unable to read Wi-Fi access prompt preference:', error);
      }

      if (!native.hasWifiNamePermission() || !native.isLocationEnabled()) {
        setShowWifiAccessPrompt(true);
      }
    }, 1050);

    return () => clearTimeout(promptTimer);
  }, []);

  const dismissWifiAccessPrompt = () => {
    try {
      window.localStorage.setItem('speedxpat.wifi-access-prompt-dismissed', 'true');
    } catch (error) {
      console.warn('Unable to save Wi-Fi access prompt preference:', error);
    }
    setShowWifiAccessPrompt(false);
  };

  const enableWifiNameAccess = () => {
    const native = getAndroidNativeBridge();
    if (!native) {
      setAppError('Wi-Fi name access is only available in the Android app.');
      dismissWifiAccessPrompt();
      return;
    }

    native.requestWifiNameAccess();
    dismissWifiAccessPrompt();
  };

  // Hero Gauge Counter State
  const [heroValue, setHeroValue] = useState(
    initialDownloadMbps !== null && initialDownloadMbps !== undefined
      ? initialDownloadMbps.toFixed(1)
      : '0'
  );
  const [heroUnit, setHeroUnit] = useState('Mbps');
  const [heroLabel, setHeroLabel] = useState(
    initialDownloadMbps !== null && initialDownloadMbps !== undefined
      ? 'DOWNLOAD SPEED'
      : currentReport
      ? 'NO DOWNLOAD RESULT'
      : 'TEST READY'
  );

  // Real-time Sparkline & Matrix updates
  const [downloadSparklineData, setDownloadSparklineData] = useState<ThroughputChartPoint[]>([]);
  const [uploadSparklineData, setUploadSparklineData] = useState<ThroughputChartPoint[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<{
    downloadMbps?: number | null;
    uploadMbps?: number | null;
    pingMs?: number | null;
    loadedPingMs?: number | null;
    jitterMs?: number | null;
  }>({});

  const orchestratorRef = useRef<AssessmentOrchestrator | null>(null);
  const lastPhaseRef = useRef<string>('');

  useEffect(() => {
    const downloadMbps = currentReport?.rawMeasurements.downloadThroughput.mbps;
    if (downloadMbps !== null && downloadMbps !== undefined) {
      setHeroValue(downloadMbps.toFixed(1));
      setHeroUnit('Mbps');
      setHeroLabel('DOWNLOAD SPEED');
    } else if (currentReport) {
      setHeroValue('0');
      setHeroUnit('Mbps');
      setHeroLabel('NO DOWNLOAD RESULT');
    } else {
      setHeroValue('0');
      setHeroUnit('Mbps');
      setHeroLabel('TEST READY');
    }
  }, [currentReport]);

  // Initial network info detection & listeners
  useEffect(() => {
    let mounted = true;
    const refreshNetworkInfo = () => {
      void detectNetworkInfo((online) => {
        if (mounted) setIsOnline(online);
      }).then((info) => {
        if (mounted) {
          setNetworkInfo(info);
          setIsOnline(info.online);
        }
      });
    };

    refreshNetworkInfo();

    const handleNetworkChange = () => {
      refreshNetworkInfo();
    };

    const handleNativeNetworkRefresh = () => handleNetworkChange();
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
    window.addEventListener('speedxpat-network-refresh', handleNativeNetworkRefresh);

    return () => {
      mounted = false;
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
      window.removeEventListener('speedxpat-network-refresh', handleNativeNetworkRefresh);
    };
  }, []);

  const refreshHistory = () => {
    const list = getAssessmentHistory();
    setHistory(list);
    if (!currentReport && list.length > 0) {
      setCurrentReport(list[0]);
    }
  };

  useEffect(() => {
    if (benchmarkMode) {
      setUseDownloadCap(false);
      setUseUploadCap(false);
    } else {
      setUseDownloadCap(true);
      setUseUploadCap(true);
    }
  }, [benchmarkMode]);

  // Start Guided Assessment
  const handleStartTest = async () => {
    const validationError = validateTestSettings(
      pingTarget,
      dnsDomain
    );
    if (validationError) {
      setActiveTab('speed');
      setAppError(validationError);
      return;
    }

    triggerHaptic('start');
    setAppError(null);
    setIsTesting(true);
    setActiveTab('speed');
    setPendingReport(null);
    setShowResults(false);
    setDownloadSparklineData([]);
    setUploadSparklineData([]);
    setActiveMetrics({});
    setHeroValue('0');
    setHeroUnit('Mbps');
    setHeroLabel('INITIALIZING...');

    const orchestrator = new AssessmentOrchestrator();
    orchestratorRef.current = orchestrator;

    try {
      const effectiveDownloadLimitBytes = dataSaverMode
        ? 3 * 1024 * 1024
        : useDownloadCap
          ? maxDownloadMb * 1024 * 1024
          : undefined;

      const effectiveUploadLimitBytes = dataSaverMode
        ? 1.5 * 1024 * 1024
        : useUploadCap
          ? maxUploadMb * 1024 * 1024
          : undefined;

      const report = await orchestrator.runAssessment({
        pingTarget,
        dnsDomain,
        useMlab,
        maxDownloadBytes: effectiveDownloadLimitBytes,
        maxUploadBytes: effectiveUploadLimitBytes,
        onProgress: (p: AssessmentProgress) => {
          setTestStage(p.stage);
          setStageName(p.stageName);
          setProgressPercent(p.overallPercent);

          // Detect Phase Hand-off for Haptic feedback
          if (p.stage !== lastPhaseRef.current) {
            triggerHaptic('phase');
            lastPhaseRef.current = p.stage;
          }

          // Parse and update real-time telemetry readout
          if (p.stage === 'measuring_latency') {
            const match = p.currentMetricValue?.match(/(\d+)\s*ms/);
            if (match) {
              const ping = parseInt(match[1], 10);
              setHeroValue(String(ping));
              setHeroUnit('ms');
              setHeroLabel('IDLE PING');
              setActiveMetrics((prev) => ({ ...prev, pingMs: ping }));
            }
          } else if (p.stage === 'measuring_download') {
            const match = p.currentMetricValue?.match(/([\d.]+)\s*Mbps/);
            if (match) {
              const mbps = parseFloat(match[1]);
              setHeroValue(mbps.toFixed(1));
              setHeroUnit('Mbps');
              setHeroLabel('DOWNLOAD STREAM');
              setActiveMetrics((prev) => ({ ...prev, downloadMbps: mbps }));
            }
            const throughputSample = p.throughputSample;
            if (throughputSample) {
              setDownloadSparklineData((prev) => [...prev.slice(-29), throughputSample]);
            }
          } else if (p.stage === 'measuring_upload') {
            const match = p.currentMetricValue?.match(/([\d.]+)\s*Mbps/);
            if (match) {
              const mbps = parseFloat(match[1]);
              setHeroValue(mbps.toFixed(1));
              setHeroUnit('Mbps');
              setHeroLabel('UPLOAD STREAM');
              setActiveMetrics((prev) => ({ ...prev, uploadMbps: mbps }));
            }
            const throughputSample = p.throughputSample;
            if (throughputSample) {
              setUploadSparklineData((prev) => [...prev.slice(-29), throughputSample]);
            }
          } else if (p.stage === 'measuring_loaded_latency') {
            const match = p.currentMetricValue?.match(/(\d+)\s*ms/);
            if (match) {
              const loaded = parseInt(match[1], 10);
              setHeroValue(String(loaded));
              setHeroUnit('ms');
              setHeroLabel('PING UNDER LOAD');
              setActiveMetrics((prev) => ({ ...prev, loadedPingMs: loaded }));
            }
          }
        },
      });

      triggerHaptic('success');
      setPendingReport(report);
      setShowResults(true);

      const downloadSamples = report.rawMeasurements.downloadThroughput.samples;
      const firstDownloadTimestamp = downloadSamples[0]?.timestamp ?? 0;
      setDownloadSparklineData(downloadSamples.map((sample) => ({
        elapsedMs: Math.max(0, sample.timestamp - firstDownloadTimestamp),
        mbps: sample.instantMbps,
      })));
      const uploadSamples = report.rawMeasurements.uploadThroughput.samples;
      const firstUploadTimestamp = uploadSamples[0]?.timestamp ?? 0;
      setUploadSparklineData(uploadSamples.map((sample) => ({
        elapsedMs: Math.max(0, sample.timestamp - firstUploadTimestamp),
        mbps: sample.instantMbps,
      })));

      // Set final hero readout
      const finalDl = report.rawMeasurements.downloadThroughput.mbps;
      if (finalDl !== null && finalDl !== undefined) {
        setHeroValue(finalDl.toFixed(1));
        setHeroUnit('Mbps');
        setHeroLabel('DOWNLOAD SPEED');
      }
    } catch (error: unknown) {
      triggerHaptic('error');
      if (!String(error).toLowerCase().includes('cancel')) {
        setTestStage('failed');
        setHeroLabel('TEST FAILED');
        setAppError(
          isOnline !== false
            ? 'The assessment could not finish. Check your connection and test targets, then try again.'
            : 'The assessment stopped because your device is offline. Reconnect and try again.'
        );
      }
    } finally {
      setIsTesting(false);
      orchestratorRef.current = null;
    }
  };

  const handleSaveAndClose = () => {
    if (pendingReport) {
      if (!saveAssessmentReport(pendingReport)) {
        setAppError('The test completed, but its report could not be saved. Free device storage and try again.');
        return;
      }
      setCurrentReport(pendingReport);
      refreshHistory();
    }
    setPendingReport(null);
    setShowResults(false);
  };

  const handleDiscardResults = () => {
    setPendingReport(null);
    setShowResults(false);
  };

  const handleCancelTest = () => {
    triggerHaptic('error');
    if (orchestratorRef.current) {
      orchestratorRef.current.cancel();
    }
    setIsTesting(false);
    setTestStage('idle');
    setPendingReport(null);
    setShowResults(false);
    setHeroLabel('TEST CANCELLED');
  };

  const handleDeleteReport = (id: string) => {
    deleteAssessment(id);
    refreshHistory();
    if (currentReport?.id === id) {
      const remaining = getAssessmentHistory();
      setCurrentReport(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const handleClearAllHistory = () => {
    if (confirm('Are you sure you want to clear your local assessment history?')) {
      clearAllHistory();
      refreshHistory();
      setCurrentReport(null);
      setPendingReport(null);
      setShowResults(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-canvas text-app-primary flex flex-col font-sans selection:bg-app-accent selection:text-white">
      {/* 0. Initial Animated Splash Screen Overlay */}
      {isSplashActive && (
        <div
          className={`splash-screen fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-300 ${
            splashFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div className="relative flex h-56 w-56 items-center justify-center">
            <div className="splash-aura pointer-events-none absolute h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />
            <div className="absolute h-48 w-48 rounded-full border border-cyan-400/20 splash-sweep" aria-hidden="true" />
            <div className="splash-mark relative flex items-center justify-center">
              <img
                src="/speedxpat-logo.svg"
                alt="SpeedXpat Logo"
                className="h-44 w-44 object-contain drop-shadow-[0_0_24px_rgba(6,182,212,0.35)]"
              />
            </div>
          </div>
          <div className="splash-title mt-7 text-center">
            <h1 className="text-2xl font-semibold text-app-primary">
              Speed<span className="text-cyan-400">Xpat</span>
            </h1>
            <p className="mt-1.5 font-mono text-xs uppercase tracking-wider text-app-muted">
              Network Diagnostics & Assessment
            </p>
          </div>
        </div>
      )}

      {showWifiAccessPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-5 py-8 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="wifi-access-title"
            aria-describedby="wifi-access-description"
            className="w-full max-w-md rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-[#11243A] to-[#0B1424] p-6 shadow-2xl shadow-black/40"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200">
              <Wifi className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
              Optional device access
            </p>
            <h2 id="wifi-access-title" className="mt-2 text-xl font-semibold text-white">
              Show your connected Wi-Fi
            </h2>
            <p id="wifi-access-description" className="mt-3 text-sm leading-6 text-slate-300">
              Android requires Location permission and Location Services to reveal the Wi-Fi name. SpeedXpat uses this access only for network details; it does not collect GPS coordinates. You can continue without it.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={dismissWifiAccessPrompt}
                className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10"
              >
                Not now
              </button>
              <button
                type="button"
                autoFocus
                onClick={enableWifiNameAccess}
                className="min-h-11 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
              >
                Enable Wi-Fi name
              </button>
            </div>
          </section>
        </div>
      )}

      {/* 1. Top App Bar */}
      <Header
        isOnline={isOnline}
        activeTab={activeTab}
        isTesting={isTesting}
        showSpeedResults={
          activeTab === 'speed' &&
          showResults &&
          (pendingReport !== null || currentReport !== null)
        }
        hasPendingResult={pendingReport !== null}
        onCancelTest={handleCancelTest}
        onRetest={handleStartTest}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHistory={() => setActiveTab('trends')}
        savedCount={history.length}
      />

      {/* 2. Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 py-4">
        {isOnline === false && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-200"
          >
            Your device cannot reach the internet. Saved reports remain available; diagnostics need a connection.
          </div>
        )}
        {appError && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-sm text-rose-200"
          >
            <span>{appError}</span>
            <button
              type="button"
              onClick={() => setAppError(null)}
              className="shrink-0 text-rose-300 hover:text-white"
              aria-label="Dismiss error message"
            >
              Dismiss
            </button>
          </div>
        )}
        <div key={activeTab} className="app-view-enter">
        {activeTab === 'speed' && (
          <SpeedTestHome
            networkInfo={networkInfo}
            isOnline={isOnline}
            report={showResults ? pendingReport ?? currentReport : null}
            lastReport={currentReport}
            canDiscardResult={pendingReport !== null}
            isTesting={isTesting}
            stage={testStage}
            stageName={stageName}
            progressPercent={progressPercent}
            heroValue={heroValue}
            heroUnit={heroUnit}
            heroLabel={heroLabel}
            downloadSparklineData={downloadSparklineData}
            uploadSparklineData={uploadSparklineData}
            activeMetrics={activeMetrics}
            onStartTest={handleStartTest}
            onCancelTest={handleCancelTest}
            onSaveAndClose={handleSaveAndClose}
            onDiscardResults={handleDiscardResults}
            onExportError={() => setAppError('The report could not be exported. Check available storage and try again.')}
          />
        )}

        {activeTab === 'network' && (
          <NetworkTab
            networkInfo={networkInfo}
            history={history}
            onRefreshNetworkInfo={async () => {
              const info = await detectNetworkInfo(setIsOnline);
              setNetworkInfo(info);
              setIsOnline(info.online);
            }}
          />
        )}

        {activeTab === 'tools' && <DiagnosticToolsTab networkInfo={networkInfo} />}

        {activeTab === 'trends' && (
          <TrendsTab
            history={history}
            hasPendingResult={pendingReport !== null}
            onDeleteReport={handleDeleteReport}
            onClearAllHistory={handleClearAllHistory}
            onExportError={() => setAppError('The report could not be exported. Check available storage and try again.')}
            onInspectReport={(rep) => {
              setCurrentReport(rep);
              setPendingReport(null);
              setShowResults(true);
              setActiveTab('speed');
            }}
          />
        )}
        </div>
      </main>

      {/* 3. 4-Tab Bottom Navigation Bar */}
      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* 4. Global Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        pingTarget={pingTarget}
        setPingTarget={setPingTarget}
        dnsDomain={dnsDomain}
        setDnsDomain={setDnsDomain}
        maxDownloadMb={maxDownloadMb}
        setMaxDownloadMb={setMaxDownloadMb}
        maxUploadMb={maxUploadMb}
        setMaxUploadMb={setMaxUploadMb}
        benchmarkMode={benchmarkMode}
        setBenchmarkMode={setBenchmarkMode}
        useDownloadCap={useDownloadCap}
        setUseDownloadCap={setUseDownloadCap}
        useUploadCap={useUploadCap}
        setUseUploadCap={setUseUploadCap}
        concurrencyCount={concurrencyCount}
        setConcurrencyCount={setConcurrencyCount}
        dataSaverMode={dataSaverMode}
        setDataSaverMode={setDataSaverMode}
        useMlab={useMlab}
        setUseMlab={setUseMlab}
      />
    </div>
  );
}
