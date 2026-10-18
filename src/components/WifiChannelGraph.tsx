import React from 'react';

export interface WifiChannelNetwork {
  ssid: string;
  bssid: string;
  hidden: boolean;
  frequencyMhz: number;
  channel: number | null;
  band: string;
  channelWidthMhz: number;
  signalDbm: number;
  security: string;
  wifiStandard: string;
}

export interface WifiSignalReading {
  scannedAt: number;
  signalDbm: number;
}

interface WifiChannelGraphProps {
  networks: WifiChannelNetwork[];
  selectedKey: string | null;
  onSelect: (network: WifiChannelNetwork) => void;
  selectedSsid?: string;
  signalHistory?: WifiSignalReading[];
  lastScanAt?: number | null;
  mode: 'channel' | 'time';
}

const SIGNAL_COLORS = ['#22d3ee', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185'];
const networkName = (network: WifiChannelNetwork) =>
  network.hidden ? 'Hidden network' : network.ssid;
const BAND_RANGES: Record<string, { min: number; max: number }> = {
  '2.4 GHz': { min: 2400, max: 2500 },
  '5 GHz': { min: 5150, max: 5895 },
  '6 GHz': { min: 5925, max: 7125 },
};

function signalY(signalDbm: number, top: number, plotHeight: number): number {
  const boundedSignal = Math.max(-100, Math.min(-30, signalDbm));
  return top + ((-30 - boundedSignal) / 70) * plotHeight;
}

function channelTicks(band: string): number[] {
  if (band === '2.4 GHz') {
    return [1, 3, 5, 7, 9, 11, 13, 14].map((channel) =>
      channel === 14 ? 2484 : 2407 + channel * 5
    );
  }
  if (band === '5 GHz') {
    return [36, 44, 52, 60, 100, 108, 116, 124, 132, 140, 149, 157, 165, 173].map(
      (channel) => 5000 + channel * 5
    );
  }
  return Array.from({ length: 12 }, (_, index) => 5955 + index * 100).filter(
    (frequency) => frequency <= 7125
  );
}

function formatChannel(frequencyMhz: number, band: string): string {
  if (frequencyMhz === 2484) return '14';
  if (band === '2.4 GHz' || band === '6 GHz') {
    return String(Math.round((frequencyMhz - (band === '6 GHz' ? 5950 : 2407)) / 5));
  }
  return String(Math.round((frequencyMhz - 5000) / 5));
}

const WifiBandChart: React.FC<{
  band: string;
  networks: WifiChannelNetwork[];
  selectedKey: string | null;
  onSelect: (network: WifiChannelNetwork) => void;
}> = ({ band, networks, selectedKey, onSelect }) => {
  const range = BAND_RANGES[band];
  const width = 720;
  const height = 240;
  const left = 48;
  const right = 20;
  const top = 20;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const baseY = height - bottom;

  const xPosition = (frequency: number) =>
    left + ((frequency - range.min) / (range.max - range.min)) * plotWidth;
  const ticks = channelTicks(band).filter((frequency) => frequency >= range.min && frequency <= range.max);

  const plottedNetworks = networks.map((network, index) => {
    const cx = xPosition(network.frequencyMhz);
    const cy = signalY(network.signalDbm, top, plotHeight);
    const rx = Math.max(16, (network.channelWidthMhz / (range.max - range.min)) * plotWidth / 2);
    const color = SIGNAL_COLORS[index % SIGNAL_COLORS.length];
    const key = `${network.bssid}|${network.frequencyMhz}`;
    const isSelected = key === selectedKey;

    // Parabolic Bell Curve Path
    const bellPath = `M ${(cx - rx).toFixed(2)} ${baseY} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${(cx + rx).toFixed(2)} ${baseY} Z`;

    return {
      network,
      index,
      cx,
      cy,
      rx,
      color,
      key,
      isSelected,
      bellPath,
    };
  });

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3.5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
          {band} Spectrum & Signal Curves
        </span>
        <span className="font-mono text-[10px] text-slate-400">
          {networks.length} active networks
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          className="min-w-[580px] w-full block overflow-visible"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${band} Wi-Fi channel graph showing signal strength by frequency`}
        >
          <defs>
            {plottedNetworks.map(({ key, color }) => (
              <linearGradient id={`grad-${key.replace(/[^a-zA-Z0-9]/g, '-')}`} key={key} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.45" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            ))}
            <filter id="curveGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Signal Level Grid Lines */}
          {[-30, -50, -70, -90].map((signal) => {
            const y = signalY(signal, top, plotHeight);
            return (
              <g key={signal}>
                <line x1={left} x2={width - right} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" strokeDasharray="4 4" />
                <text x={left - 8} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9" fontFamily="monospace">
                  {signal}
                </text>
              </g>
            );
          })}

          {/* Frequency Base Line */}
          <line x1={left} x2={width - right} y1={baseY} y2={baseY} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />

          {/* Channel Tick Marks */}
          {ticks.map((frequency) => {
            const x = xPosition(frequency);
            return (
              <g key={frequency}>
                <line x1={x} x2={x} y1={baseY} y2={baseY + 5} stroke="#64748b" />
                <text x={x} y={height - 8} textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontWeight="600" fontFamily="monospace">
                  {formatChannel(frequency, band)}
                </text>
              </g>
            );
          })}

          <text x={12} y={top + plotHeight / 2} fill="#64748b" fontSize="9" fontFamily="monospace" transform={`rotate(-90 12 ${top + plotHeight / 2})`}>
            Signal (dBm)
          </text>

          {/* Bell-Curve Network Channels */}
          {plottedNetworks.map(({ network, cx, cy, rx, color, key, isSelected, bellPath }) => {
            const gradId = `grad-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;
            return (
              <g
                key={key}
                role="button"
                tabIndex={0}
                aria-label={`${networkName(network)}, channel ${network.channel ?? 'unknown'}, ${network.signalDbm} dBm`}
                onClick={() => onSelect(network)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(network);
                  }
                }}
                className="cursor-pointer transition-all duration-200"
              >
                <title>
                  {networkName(network)} · Ch {network.channel ?? '—'} · {network.signalDbm} dBm · {network.channelWidthMhz} MHz
                </title>

                {/* Parabolic Area Fill */}
                <path
                  d={bellPath}
                  fill={`url(#${gradId})`}
                  opacity={isSelected ? 0.9 : 0.6}
                />

                {/* Parabolic Glowing Stroke */}
                <path
                  d={`M ${(cx - rx).toFixed(2)} ${baseY} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${(cx + rx).toFixed(2)} ${baseY}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 1.8}
                  strokeLinecap="round"
                  filter={isSelected ? 'url(#curveGlow)' : undefined}
                />

                {/* Peak Center Marker */}
                <circle cx={cx} cy={cy} r={isSelected ? 5 : 3.5} fill={color} stroke="#0f172a" strokeWidth="1.5" />

                {/* Network Label Badge */}
                <text
                  x={cx}
                  y={Math.max(top + 10, cy - 8)}
                  textAnchor="middle"
                  fill={isSelected ? '#ffffff' : color}
                  fontSize="9.5"
                  fontWeight="700"
                  fontFamily="monospace"
                  paintOrder="stroke"
                  stroke="#070b14"
                  strokeWidth="3"
                  strokeLinejoin="round"
                >
                  {networkName(network).length > 14
                    ? `${networkName(network).slice(0, 13)}…`
                    : networkName(network)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

const WifiSignalTimeline: React.FC<{
  ssid: string;
  readings: WifiSignalReading[];
}> = ({ ssid, readings }) => {
  const width = 600;
  const height = 160;
  const left = 42;
  const right = 16;
  const top = 16;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const firstTime = readings[0]?.scannedAt ?? 0;
  const lastTime = readings[readings.length - 1]?.scannedAt ?? firstTime;
  const timeRange = Math.max(1, lastTime - firstTime);

  const points = readings.map((reading) => ({
    x: left + ((reading.scannedAt - firstTime) / timeRange) * plotWidth,
    y: signalY(reading.signalDbm, top, plotHeight),
    reading,
  }));

  const linePath = points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  ).join(' ');

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3.5 shadow-xl backdrop-blur-md">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
          Signal History · {ssid}
        </span>
        <span className="font-mono text-[10px] text-slate-400">
          {readings.length} samples · last 24 scans
        </span>
      </div>
      {readings.length < 2 ? (
        <p className="mt-3 text-xs text-slate-400">Keep live scanning on to build this access point’s signal timeline.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg className="mt-2 min-w-[480px] w-full block overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Signal history for ${ssid}`}>
            {[-40, -60, -80, -100].map((signal) => {
              const y = signalY(signal, top, plotHeight);
              return (
                <g key={signal}>
                  <line x1={left} x2={width - right} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 4" />
                  <text x={left - 6} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9" fontFamily="monospace">{signal}</text>
                </g>
              );
            })}
            <path d={linePath} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((point, index) => (
              <g key={`${point.reading.scannedAt}-${index}`}>
                <circle cx={point.x} cy={point.y} r={4} fill="#22d3ee" stroke="#0f172a" strokeWidth="1.5">
                  <title>{new Date(point.reading.scannedAt).toLocaleTimeString()} · {point.reading.signalDbm} dBm</title>
                </circle>
              </g>
            ))}
            <text x={left} y={height - 6} fill="#64748b" fontSize="9" fontFamily="monospace">
              {new Date(firstTime).toLocaleTimeString()}
            </text>
            <text x={width - right} y={height - 6} textAnchor="end" fill="#64748b" fontSize="9" fontFamily="monospace">
              {new Date(lastTime).toLocaleTimeString()}
            </text>
          </svg>
        </div>
      )}
    </div>
  );
};

export const WifiChannelGraph: React.FC<WifiChannelGraphProps> = ({
  networks,
  selectedKey,
  onSelect,
  selectedSsid,
  signalHistory,
  lastScanAt,
  mode,
}) => {
  const bands = ['2.4 GHz', '5 GHz', '6 GHz'].filter((band) =>
    networks.some((network) => network.band === band)
  );
  const availableHistory = (signalHistory || []).filter((reading) =>
    !lastScanAt || reading.scannedAt <= lastScanAt
  );

  if (mode === 'channel' && !networks.length) {
    return (
      <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 text-center text-xs text-slate-500">
        No visible access points to plot in this scan.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === 'channel' && bands.map((band) => (
        <WifiBandChart
          key={band}
          band={band}
          networks={networks.filter((network) => network.band === band)}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      ))}
      {mode === 'time' && selectedKey && selectedSsid && (
        <WifiSignalTimeline ssid={selectedSsid} readings={availableHistory} />
      )}
      {mode === 'time' && (!selectedKey || !selectedSsid) && (
        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 text-center text-xs text-slate-500">
          Select an access point in the AP list to view its signal history.
        </div>
      )}
    </div>
  );
};