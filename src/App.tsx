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

import { DeviceNetworkInfo } from './types/network';
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
import { getDefaultTestEndpoints, isAndroidNativeApp } from './engines/testEndpoints';

const ADVANCED_MODE_KEY = 'speedxpat_advanced_mode';
const LEGACY_ADVANCED_MODE_KEY = 'netxpert_advanced_mode';
const defaultTestEndpoints = getDefaultTestEndpoints();

function validateTestSettings(
  pingTarget: string,
  downloadTarget: string,
  uploadTarget: string,
  dnsDomain: string
): string | null {
  const endpoints = [
    ['Ping', pingTarget],
    ['Download', downloadTarget],
    ['Upload', uploadTarget],
  ] as const;

  for (const [label, value] of endpoints) {
    try {
      const url = new URL(value.trim(), window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        return `${label} target must be an HTTP or HTTPS URL without embedded credentials.`;
      }
      if (isAndroidNativeApp() && (url.protocol !== 'https:' || url.origin === window.location.origin)) {
        return `${label} target on Android must use a public HTTPS endpoint.`;
      }
    } catch {
      return `${label} target is not a valid URL. Check Diagnostics & Test Settings.`;
    }
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
  const [advancedMode, setAdvancedMode] = useState<boolean>(() => {
    const storedValue = localStorage.getItem(ADVANCED_MODE_KEY);
    if (storedValue !== null) return storedValue === 'true';

    const legacyValue = localStorage.getItem(LEGACY_ADVANCED_MODE_KEY);
    if (legacyValue !== null) {
      localStorage.setItem(ADVANCED_MODE_KEY, legacyValue);
      return legacyValue === 'true';
    }

    return false;
  });

  const [networkInfo, setNetworkInfo] = useState<DeviceNetworkInfo | null>(null);
  const [history, setHistory] = useState<OverallAssessmentReport[]>(() =>
    getAssessmentHistory()
  );
  const [currentReport, setCurrentReport] = useState<OverallAssessmentReport | null>(() => {
    const list = getAssessmentHistory();
    return list.length > 0 ? list[0] : null;
  });
  const initialDownloadMbps = currentReport?.rawMeasurements.downloadThroughput.mbps;

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pingTarget, setPingTarget] = useState(defaultTestEndpoints.ping);
  const [downloadTarget, setDownloadTarget] = useState(defaultTestEndpoints.download);
  const [uploadTarget, setUploadTarget] = useState(defaultTestEndpoints.upload);
  const [dnsDomain, setDnsDomain] = useState('cloudflare.com');
  const [maxDownloadMb, setMaxDownloadMb] = useState(8);
  const [maxUploadMb, setMaxUploadMb] = useState(4);
  const [concurrencyCount, setConcurrencyCount] = useState(4);
  const [dataSaverMode, setDataSaverMode] = useState(false);
  const [useMlab, setUseMlab] = useState(true);

  // Active Test Execution State
  const [isTesting, setIsTesting] = useState(false);
  const [testStage, setTestStage] = useState<AssessmentStage>('idle');
  const [stageName, setStageName] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [appError, setAppError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

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
  const [sparklineData, setSparklineData] = useState<number[]>([]);
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
    detectNetworkInfo().then((info) => {
      if (mounted) setNetworkInfo(info);
    });

    const handleNetworkChange = () => {
      setIsOnline(navigator.onLine);
      detectNetworkInfo().then((info) => {
        if (mounted) setNetworkInfo(info);
      });
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

  const handleToggleAdvancedMode = () => {
    setAdvancedMode((prev) => {
      const next = !prev;
      localStorage.setItem(ADVANCED_MODE_KEY, String(next));
      return next;
    });
  };

  // Start Guided Assessment
  const handleStartTest = async () => {
    const validationError = validateTestSettings(
      pingTarget,
      downloadTarget,
      uploadTarget,
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
    setSparklineData([]);
    setActiveMetrics({});
    setHeroValue('0');
    setHeroUnit('Mbps');
    setHeroLabel('INITIALIZING...');

    const orchestrator = new AssessmentOrchestrator();
    orchestratorRef.current = orchestrator;

    try {
      const report = await orchestrator.runAssessment({
        pingTarget,
        downloadTarget,
        uploadTarget,
        dnsDomain,
        useMlab,
        maxDownloadBytes: (dataSaverMode ? 3 : maxDownloadMb) * 1024 * 1024,
        maxUploadBytes: (dataSaverMode ? 1.5 : maxUploadMb) * 1024 * 1024,
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
              setSparklineData((prev) => [...prev.slice(-20), mbps]);
              setActiveMetrics((prev) => ({ ...prev, downloadMbps: mbps }));
            }
          } else if (p.stage === 'measuring_upload') {
            const match = p.currentMetricValue?.match(/([\d.]+)\s*Mbps/);
            if (match) {
              const mbps = parseFloat(match[1]);
              setHeroValue(mbps.toFixed(1));
              setHeroUnit('Mbps');
              setHeroLabel('UPLOAD STREAM');
              setSparklineData((prev) => [...prev.slice(-20), mbps]);
              setActiveMetrics((prev) => ({ ...prev, uploadMbps: mbps }));
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
      if (!saveAssessmentReport(report)) {
        setAppError('The test completed, but its report could not be saved. Free device storage and try again.');
      }
      setCurrentReport(report);
      refreshHistory();

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
          navigator.onLine
            ? 'The assessment could not finish. Check your connection and test targets, then try again.'
            : 'The assessment stopped because your device is offline. Reconnect and try again.'
        );
      }
    } finally {
      setIsTesting(false);
      orchestratorRef.current = null;
    }
  };

  const handleCancelTest = () => {
    triggerHaptic('error');
    if (orchestratorRef.current) {
      orchestratorRef.current.cancel();
    }
    setIsTesting(false);
    setTestStage('idle');
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
    }
  };

  return (
    <div className="min-h-screen bg-[#070F1E] text-[#F4F8FC] flex flex-col font-sans selection:bg-[#27D7F2] selection:text-slate-950">
      {/* 1. Top App Bar */}
      <Header
        networkInfo={networkInfo}
        advancedMode={advancedMode}
        onToggleAdvancedMode={handleToggleAdvancedMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHistory={() => setActiveTab('trends')}
        savedCount={history.length}
      />

      {/* 2. Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 py-4">
        {!isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-200"
          >
            Your device reports no network connection. Saved reports remain available; diagnostics need a connection.
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
        {activeTab === 'speed' && (
          <SpeedTestHome
            networkInfo={networkInfo}
            report={currentReport}
            isTesting={isTesting}
            stage={testStage}
            stageName={stageName}
            progressPercent={progressPercent}
            heroValue={heroValue}
            heroUnit={heroUnit}
            heroLabel={heroLabel}
            sparklineData={sparklineData}
            activeMetrics={activeMetrics}
            advancedMode={advancedMode}
            useMlab={useMlab}
            onStartTest={handleStartTest}
            onCancelTest={handleCancelTest}
            onExportError={() => setAppError('The report could not be exported. Check available storage and try again.')}
          />
        )}

        {activeTab === 'network' && (
          <NetworkTab
            networkInfo={networkInfo}
            history={history}
            onRefreshNetworkInfo={async () => {
              const info = await detectNetworkInfo();
              setNetworkInfo(info);
            }}
          />
        )}

        {activeTab === 'tools' && <DiagnosticToolsTab />}

        {activeTab === 'trends' && (
          <TrendsTab
            history={history}
            onDeleteReport={handleDeleteReport}
            onClearAllHistory={handleClearAllHistory}
            onExportError={() => setAppError('The report could not be exported. Check available storage and try again.')}
            onInspectReport={(rep) => {
              setCurrentReport(rep);
              setActiveTab('speed');
            }}
          />
        )}
      </main>

      {/* 3. 4-Tab Bottom Navigation Bar */}
      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* 4. Global Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        pingTarget={pingTarget}
        setPingTarget={setPingTarget}
        downloadTarget={downloadTarget}
        setDownloadTarget={setDownloadTarget}
        uploadTarget={uploadTarget}
        setUploadTarget={setUploadTarget}
        dnsDomain={dnsDomain}
        setDnsDomain={setDnsDomain}
        maxDownloadMb={maxDownloadMb}
        setMaxDownloadMb={setMaxDownloadMb}
        maxUploadMb={maxUploadMb}
        setMaxUploadMb={setMaxUploadMb}
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
