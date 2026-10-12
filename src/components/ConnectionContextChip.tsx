import React, { useState } from 'react';
import {
  Wifi,
  Radio,
  Network,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { DeviceNetworkInfo } from '../types/network';

interface ConnectionContextChipProps {
  networkInfo: DeviceNetworkInfo | null;
}

export const ConnectionContextChip: React.FC<ConnectionContextChipProps> = ({
  networkInfo,
}) => {
  const [showGpsTooltip, setShowGpsTooltip] = useState(false);

  const isOnline = networkInfo?.online ?? true;
  const netType = networkInfo?.networkType || 'unknown';

  const getTransportIcon = () => {
    switch (netType) {
      case 'wifi':
        return Wifi;
      case 'cellular':
        return Radio;
      case 'ethernet':
        return Network;
      default:
        return Wifi;
    }
  };

  const Icon = getTransportIcon();

  // Name & permission state
  const networkName =
    netType === 'wifi'
      ? networkInfo?.wifiSsid || 'Wi-Fi (Name Protected by OS)'
      : netType === 'cellular'
      ? networkInfo?.cellularGeneration || 'Mobile Cellular (LTE/5G)'
      : netType === 'ethernet'
      ? 'Wired Ethernet'
      : 'Network Connected';

  const isNameProtected =
    netType === 'wifi' && (!networkInfo?.wifiSsid || networkInfo.wifiSsid.includes('Protected'));

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
      {/* Primary Transport Chip */}
      <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#0E1A2E] border border-white/10 text-xs shadow-sm text-slate-200">
        <Icon className="w-3.5 h-3.5 text-cyan-400" />
        <span className="font-medium">{networkName}</span>

        {isNameProtected && (
          <div className="relative">
            <button
              onClick={() => setShowGpsTooltip(!showGpsTooltip)}
              className="text-slate-400 hover:text-cyan-300 ml-0.5 p-0.5"
              title="Why is Wi-Fi name hidden?"
            >
              <Info className="w-3 h-3 text-amber-400" />
            </button>
            {showGpsTooltip && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2.5 rounded-xl bg-[#15253D] border border-cyan-500/40 text-[11px] text-slate-200 shadow-2xl z-50 animate-in fade-in">
                <p className="font-semibold text-cyan-300 mb-1">Android Privacy Rule</p>
                <p className="leading-snug text-slate-300">
                  Android 10+ requires system Location (GPS) services to be toggled on to expose local Wi-Fi SSIDs to applications.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reachability Pill */}
      <div
        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border ${
          isOnline
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
            : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
        }`}
      >
        {isOnline ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        ) : (
          <AlertTriangle className="w-3 h-3 text-amber-400" />
        )}
        <span>{isOnline ? 'Internet Reachable' : 'Local Gateway Only'}</span>
      </div>
    </div>
  );
};
