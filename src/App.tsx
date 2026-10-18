/**
 * SpeedXpat — Android Network Diagnostics & Capability Engine
 * Compliant with SPEEDXPAT_UI_SPEC.md
 */

import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { BottomNav, MainTabType } from './components/BottomNav';
import { SpeedTestHome } from './components/SpeedTestHome';
import { NetworkTab } from './components/NetworkTab';
import { DiagnosticToolsTab } from './components/DiagnosticToolsTab';
import { TrendsTab } from './components/TrendsTab';
import { SettingsModal } from './components/SettingsModal';
import { AboutPage, ANDROID_RELEASE_URL } from './components/AboutPage';

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
import { DEFAULT_DNS_DOMAIN } from './config/defaults';
import {
  getDefaultTestEndpoints,
  isAndroidNativeApp,
} from './engines/testEndpoints';

const defaultTestEndpoints = getDefaultTestEndpoints();
const ABOUT_PATH = '/about';
const ANDROID_PROMPT_SEEN_KEY = 'speedxpat.android-download-prompt.seen';

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
    return 'DNS target is invalid. Enter a domain name such as 1.1.1.1.';
  }

  return null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTabType>('speed');
  const [isAboutOpen, setIsAboutOpen] = useState(() => window.location.pathname === ABOUT_PATH);
  const [showAndroidDownloadPrompt, setShowAndroidDownloadPrompt] = useState(false);
  const hasShownAndroidPromptRef = useRef(false);
  const [networkInfo, setNetworkInfo] = useState<DeviceNetworkInfo | null>(null);
  const [history, setHistory] = useState<OverallAssessmentReport[]>(() =>
    getAssessmentHistory()
  );
  // Helper to get primary throughput from array
  const getPrimaryThroughput = (results: any[] | undefined) => {
    if (!results || results.length === 0) return null;
    return results[results.length - 1] || results[0];
  };

  const [currentReport, setCurrentReport] = useState<OverallAssessmentReport | null>(() => {
    const list = getAssessmentHistory();
    return list.length > 0 ? list[0] : null;
  });
  const [pendingReport, setPendingReport] = useState<OverallAssessmentReport | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pingTarget, setPingTarget] = useState(defaultTestEndpoints.ping);
  const [maxDownloadMb, setMaxDownloadMb] = useState(8);
  const [maxUploadMb, setMaxUploadMb] = useState(4);
  const [benchmarkMode, setBenchmarkMode] = useState(true);
  const [useDownloadCap, setUseDownloadCap] = useState(!benchmarkMode);
  const [useUploadCap, setUseUploadCap] = useState(!benchmarkMode);
  const [concurrencyCount, setConcurrencyCount] = useState(4);
  const [dataSaverMode, setDataSaverMode] = useState(false);
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
    const handlePopState = () => setIsAboutOpen(window.location.pathname === ABOUT_PATH);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenAbout = () => {
    setIsSettingsOpen(false);
    if (window.location.pathname !== ABOUT_PATH) {
      window.history.pushState({ speedxpatAboutEntry: true }, '', ABOUT_PATH);
    }
    setIsAboutOpen(true);
  };

  const handleCloseAbout = () => {
    if (window.history.state?.speedxpatAboutEntry === true) {
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', '/');
    setIsAboutOpen(false);
  };

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
      DEFAULT_DNS_DOMAIN
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
        dnsDomain: DEFAULT_DNS_DOMAIN,
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
              setActiveMetrics((prev) => ({ ...prev, pingMs: ping }));
            }
          } else if (p.stage === 'measuring_download') {
            const match = p.currentMetricValue?.match(/([\d.]+)\s*Mbps/);
            if (match) {
              const mbps = parseFloat(match[1]);
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
              setActiveMetrics((prev) => ({ ...prev, loadedPingMs: loaded }));
            }
          }
        },
      });

      triggerHaptic('success');
      setPendingReport(report);
      setShowResults(true);
      if (!isAndroidNativeApp() && !hasShownAndroidPromptRef.current) {
        hasShownAndroidPromptRef.current = true;
        let shouldShowPrompt = true;
        try {
          shouldShowPrompt = localStorage.getItem(ANDROID_PROMPT_SEEN_KEY) !== 'true';
          if (shouldShowPrompt) localStorage.setItem(ANDROID_PROMPT_SEEN_KEY, 'true');
        } catch {
          shouldShowPrompt = true;
        }
        if (shouldShowPrompt) setShowAndroidDownloadPrompt(true);
      }

      // Get primary (last/largest) results for sparkline display
      const primaryDownload = getPrimaryThroughput(report.rawMeasurements.downloadThroughput);
      const primaryUpload = getPrimaryThroughput(report.rawMeasurements.uploadThroughput);
      
      const downloadSamples = primaryDownload?.samples ?? [];
      const firstDownloadTimestamp = downloadSamples[0]?.timestamp ?? 0;
      setDownloadSparklineData(downloadSamples.map((sample: { timestamp: number; instantMbps: number }) => ({
        elapsedMs: Math.max(0, sample.timestamp - firstDownloadTimestamp),
        mbps: sample.instantMbps,
      })));
      
      const uploadSamples = primaryUpload?.samples ?? [];
      const firstUploadTimestamp = uploadSamples[0]?.timestamp ?? 0;
      setUploadSparklineData(uploadSamples.map((sample: { timestamp: number; instantMbps: number }) => ({
        elapsedMs: Math.max(0, sample.timestamp - firstUploadTimestamp),
        mbps: sample.instantMbps,
      })));

      // Set final hero readout
    } catch (error: unknown) {
      triggerHaptic('error');
      if (!String(error).toLowerCase().includes('cancel')) {
        setTestStage('failed');
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
    <div className="app-shell min-h-screen text-app-primary flex flex-col font-sans selection:bg-app-accent selection:text-white">
      {isAboutOpen ? (
        <AboutPage isAndroidApp={isAndroidNativeApp()} onBack={handleCloseAbout} />
      ) : (
        <>
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
        {showAndroidDownloadPrompt && (
          <aside className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-accent/25 bg-app-surface px-4 py-3" aria-label="Android app download">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-app-primary">Native diagnostics on Android</p>
              <p className="mt-0.5 text-xs leading-5 text-app-secondary">Get the Android app for native ICMP ping and nearby Wi-Fi tools.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-app-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-app-accent-hover"
                href={ANDROID_RELEASE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get Android app
              </a>
              <button
                type="button"
                onClick={() => setShowAndroidDownloadPrompt(false)}
                className="grid h-11 w-11 place-items-center rounded-lg text-app-muted transition-colors hover:bg-app-raised hover:text-app-primary"
                aria-label="Dismiss Android app prompt"
                title="Dismiss"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </aside>
        )}
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
        onOpenAbout={handleOpenAbout}
      />
        </>
      )}
    </div>
  );
}
