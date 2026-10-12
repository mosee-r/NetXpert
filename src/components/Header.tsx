import React from 'react';
import {
  Activity,
  SlidersHorizontal,
  Settings,
  History,
  CheckCircle2,
  AlertCircle,
  Wifi,
} from 'lucide-react';
import { DeviceNetworkInfo } from '../types/network';

interface HeaderProps {
  networkInfo: DeviceNetworkInfo | null;
  advancedMode: boolean;
  onToggleAdvancedMode: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  savedCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  networkInfo,
  advancedMode,
  onToggleAdvancedMode,
  onOpenSettings,
  onOpenHistory,
  savedCount,
}) => {
  const isOnline = networkInfo?.online ?? true;

  return (
    <header className="sticky top-0 z-40 bg-[#070F1E]/95 backdrop-blur-md border-b border-white/10 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
        {/* Left: Logo & Status Dot */}
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#27D7F2] via-[#536DFE] to-[#8C52FF] flex items-center justify-center shadow-lg shadow-[#27D7F2]/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-extrabold tracking-tight text-white">SpeedXpat</span>
              {/* Status Dot: Green = Internet Verified, Amber = Captive/No Internet, Red = Disconnected */}
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isOnline ? 'bg-[#00E676] shadow-[0_0_8px_#00E676]' : 'bg-[#FF5252] shadow-[0_0_8px_#FF5252]'
                }`}
                title={isOnline ? 'Internet Verified' : 'Connection Disconnected'}
              />
            </div>
            <p className="text-[10px] text-slate-400 font-mono -mt-0.5">
              Diagnostics & Capability Engine
            </p>
          </div>
        </div>

        {/* Right: History Log, Advanced Mode Switch & Settings Gear */}
        <div className="flex items-center space-x-2">
          {/* History Shortcut */}
          <button
            onClick={onOpenHistory}
            className="w-10 h-10 rounded-xl bg-[#0E1A2E] hover:bg-[#15253D] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all relative cursor-pointer"
            title="View History & Reports"
          >
            <History className="w-4 h-4 text-slate-300" />
            {savedCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-slate-950 font-bold text-[9px] font-mono flex items-center justify-center">
                {savedCount}
              </span>
            )}
          </button>

          {/* Simple vs Advanced Toggle */}
          <button
            onClick={onToggleAdvancedMode}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
              advancedMode
                ? 'bg-indigo-600/25 border-indigo-500/60 text-indigo-300 glow-indigo'
                : 'bg-[#0E1A2E] border-white/10 text-slate-300 hover:bg-[#15253D]'
            }`}
            title="Toggle between Simple and Advanced Diagnostics Mode"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline font-mono">{advancedMode ? 'Advanced' : 'Simple'}</span>
          </button>

          {/* Global Settings Gear (48x48 dp touch target ergonomics) */}
          <button
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
