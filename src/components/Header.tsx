import React from 'react';
import {
  SlidersHorizontal,
  Settings,
  History,
  CheckCircle2,
  X,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { DeviceNetworkInfo } from '../types/network';

type HeaderTab = 'speed' | 'network' | 'tools' | 'trends';

interface HeaderProps {
  networkInfo: DeviceNetworkInfo | null;
  activeTab: HeaderTab;
  isTesting: boolean;
  showSpeedResults: boolean;
  hasPendingResult: boolean;
  advancedMode: boolean;
  onToggleAdvancedMode: () => void;
  onCancelTest: () => void;
  onDiscardPendingResult: () => void;
  onRetest: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  savedCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  networkInfo,
  activeTab,
  isTesting,
  showSpeedResults,
  hasPendingResult,
  advancedMode,
  onToggleAdvancedMode,
  onCancelTest,
  onDiscardPendingResult,
  onRetest,
  onOpenSettings,
  onOpenHistory,
  savedCount,
}) => {
  const isOnline = networkInfo?.online ?? true;
  const title = activeTab === 'speed'
    ? showSpeedResults ? 'Result' : 'SpeedTest'
    : activeTab === 'network'
    ? 'Network'
    : activeTab === 'tools'
    ? 'Tools'
    : 'Trends';
  const isDiscardableResult = activeTab === 'speed' && showSpeedResults && hasPendingResult;
  const leftAction = activeTab === 'speed' && isTesting
    ? onCancelTest
    : isDiscardableResult
    ? onDiscardPendingResult
    : onOpenSettings;
  const LeftIcon = activeTab === 'speed' && isTesting
    ? X
    : isDiscardableResult
    ? Trash2
    : Settings;
  const leftLabel = activeTab === 'speed' && isTesting
    ? 'Cancel test'
    : isDiscardableResult
    ? 'Discard unsaved result'
    : 'Open app settings';
  const rightAction = activeTab === 'speed' && showSpeedResults ? onRetest : onOpenHistory;
  const RightIcon = activeTab === 'speed' && showSpeedResults ? RotateCcw : History;
  const rightLabel = activeTab === 'speed' && showSpeedResults ? 'Retest connection' : 'View history and reports';

  return (
    <header className="sticky top-0 z-40 h-14 shrink-0 border-b border-app-divider bg-app-canvas/95 text-app-primary backdrop-blur sm:h-[68px]">
      <div className="relative mx-auto grid h-full max-w-7xl grid-cols-[40px_1fr_40px] items-center px-3 sm:flex sm:justify-between sm:px-6">
        <button
          type="button"
          onClick={leftAction}
          className="grid h-9 w-9 place-items-center rounded-full text-app-muted transition-colors hover:bg-app-raised hover:text-app-primary sm:hidden"
          aria-label={leftLabel}
          title={leftLabel}
        >
          <LeftIcon className="h-4 w-4" aria-hidden="true" />
        </button>

        <a className="hidden items-center space-x-2.5 text-inherit no-underline sm:flex" href="#home" aria-label="SpeedXpat home">
          <img
            src="/speedxpat-logo.png"
            alt=""
            aria-hidden="true"
            className="h-10 w-10 rounded-xl object-cover"
          />
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-extrabold tracking-tight text-app-primary">SpeedXpat</span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isOnline ? 'bg-app-success' : 'bg-app-danger'
                }`}
                title={isOnline ? 'Internet Verified' : 'Connection Disconnected'}
              />
            </div>
            <p className="text-[10px] text-slate-400 font-mono -mt-0.5">
              Diagnostics & Capability Engine
            </p>
          </div>
        </a>

        <h1 className="m-0 text-center text-sm font-semibold text-app-primary sm:absolute sm:left-1/2 sm:-translate-x-1/2">
          {title}
        </h1>

        <button
          type="button"
          onClick={rightAction}
          className="grid h-9 w-9 place-items-center rounded-full text-app-muted transition-colors hover:bg-app-raised hover:text-app-primary sm:hidden"
          aria-label={rightLabel}
          title={rightLabel}
        >
          <RightIcon className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="hidden items-center space-x-2 sm:flex">
          {(activeTab === 'speed' && (isTesting || isDiscardableResult || showSpeedResults)) && (
            <button
              type="button"
              onClick={isTesting ? onCancelTest : isDiscardableResult ? onDiscardPendingResult : onRetest}
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#0E1A2E] text-slate-300 transition-colors hover:bg-[#15253D]"
              aria-label={isTesting ? 'Cancel test' : isDiscardableResult ? 'Discard unsaved result' : 'Retest connection'}
              title={isTesting ? 'Cancel test' : isDiscardableResult ? 'Discard unsaved result' : 'Retest connection'}
            >
              {isTesting
                ? <X className="h-4 w-4" />
                : isDiscardableResult
                ? <Trash2 className="h-4 w-4" />
                : <RotateCcw className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenHistory}
            className="w-10 h-10 rounded-xl bg-[#0E1A2E] hover:bg-[#15253D] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all relative cursor-pointer"
            title="View History & Reports"
            aria-label="View History & Reports"
          >
            <History className="w-4 h-4 text-slate-300" />
            {savedCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-slate-950 font-bold text-[9px] font-mono flex items-center justify-center">
                {savedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleAdvancedMode}
            aria-pressed={advancedMode}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
              advancedMode
                ? 'bg-app-accent/10 border-app-accent/40 text-app-accent-text'
                : 'bg-[#0E1A2E] border-white/10 text-slate-300 hover:bg-[#15253D]'
            }`}
            title={advancedMode ? 'Switch to Simple Diagnostics Mode' : 'Switch to Advanced Diagnostics Mode'}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline font-mono">{advancedMode ? 'Advanced' : 'Simple'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-xl bg-[#0E1A2E] hover:bg-[#15253D] border border-white/10 flex items-center justify-center text-slate-300 hover:text-cyan-400 transition-all cursor-pointer"
            title="Open App & Diagnostics Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
