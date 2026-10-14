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

const SIGNAL_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#60a5fa'];
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
  const height = 230;
  const left = 44;
  const right = 16;
  const top = 16;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xPosition = (frequency: number) =>
    left + ((frequency - range.min) / (range.max - range.min)) * plotWidth;
  const ticks = channelTicks(band).filter((frequency) => frequency >= range.min && frequency <= range.max);
  const plottedNetworks: {
    network: WifiChannelNetwork;
    index: number;
    cx: number;
    cy: number;
    labelX: number;
    labelY: number;
    labelWidth: number;
  }[] = [];
  networks.forEach((network, index) => {
    const cx = xPosition(network.frequencyMhz);
    const cy = signalY(network.signalDbm, top, plotHeight);
    const labelWidth = Math.min(120, networkName(network).length * 5.5);
    const baseY = cy > top + 30 ? cy - 15 : cy + 26;
    const labelCandidates = [baseY];
    for (let offset = 12; offset <= plotHeight; offset += 12) {
      labelCandidates.push(baseY + offset, baseY - offset);
    }
    const labelY = labelCandidates.find((candidate) =>
      candidate >= top + 9 &&
      candidate <= height - bottom - 5 &&
      !plottedNetworks.some((point) =>
        Math.abs(point.cx - cx) < (point.labelWidth + labelWidth) / 2 + 4 &&
        Math.abs(point.labelY - candidate) < 13
      )
    ) ?? baseY;
    plottedNetworks.push({
      network,
      index,
      cx,
      cy,
      labelX: Math.max(left + labelWidth / 2, Math.min(width - right - labelWidth / 2, cx)),
      labelY,
      labelWidth,
    });
  });

  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/60 p-2">
      <div className="flex items-baseline justify-between px-2">
        <span className="text-xs font-semibold text-slate-200">{band} spectrum</span>
        <span className="text-[10px] text-slate-500">Channel width is approximate scan metadata</span>
      </div>
      <div className="overflow-x-auto">
        <svg
          className="mt-1 min-w-[560px] w-full"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${band} Wi-Fi channel graph showing signal strength by frequency`}
        >
          {[-30, -50, -70, -90].map((signal) => {
            const y = signalY(signal, top, plotHeight);
            return (
              <g key={signal}>
                <line x1={left} x2={width - right} y1={y} y2={y} stroke="#334155" strokeDasharray="3 5" />
                <text x={left - 7} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="10">{signal}</text>
              </g>
            );
          })}
          <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke="#475569" />
          {ticks.map((frequency) => {
            const x = xPosition(frequency);
            return (
              <g key={frequency}>
                <line x1={x} x2={x} y1={height - bottom} y2={height - bottom + 4} stroke="#64748b" />
                <text x={x} y={height - 7} textAnchor="middle" fill="#94a3b8" fontSize="9">
                  {formatChannel(frequency, band)}
                </text>
              </g>
            );
          })}
          <text x={10} y={top + plotHeight / 2} fill="#94a3b8" fontSize="9" transform={`rotate(-90 10 ${top + plotHeight / 2})`}>
            Signal (dBm)
          </text>
          {plottedNetworks.map(({ network, index, cx, cy, labelX, labelY }) => {
            const key = `${network.bssid}|${network.frequencyMhz}`;
            const color = SIGNAL_COLORS[index % SIGNAL_COLORS.length];
            const rx = Math.max(8, (network.channelWidthMhz / (range.max - range.min)) * plotWidth / 2);
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
                className="cursor-pointer"
              >
                <title>
                  {networkName(network)} · Ch {network.channel ?? '—'} · {network.signalDbm} dBm · {network.channelWidthMhz} MHz
                </title>
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={rx}
                  ry={11}
                  fill={color}
                  fillOpacity={key === selectedKey ? 0.5 : 0.22}
                  stroke={color}
                  strokeWidth={key === selectedKey ? 2 : 1}
                />
                <circle cx={cx} cy={cy} r={3.5} fill={color} />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  fill={color}
                  fontSize="9"
                  paintOrder="stroke"
                  stroke="#0f172a"
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
          <text x={width - right} y={height - 7} textAnchor="end" fill="#64748b" fontSize="8">
            Channel
          </text>
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
  const height = 150;
  const left = 38;
  const right = 12;
  const top = 12;
  const bottom = 25;
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
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ');

  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-slate-200">Signal history · {ssid}</span>
        <span className="text-[10px] text-slate-500">
          {readings.length} samples · last 24 scans
        </span>
      </div>
      {readings.length < 2 ? (
        <p className="mt-3 text-xs text-slate-400">Keep live scanning on to build this access point’s signal timeline.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg className="mt-2 min-w-[480px] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Signal history for ${ssid}`}>
            {[-40, -60, -80, -100].map((signal) => {
              const y = signalY(signal, top, plotHeight);
              return (
                <g key={signal}>
                  <line x1={left} x2={width - right} y1={y} y2={y} stroke="#334155" strokeDasharray="3 5" />
                  <text x={left - 6} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="9">{signal}</text>
                </g>
              );
            })}
            <path d={linePath} fill="none" stroke="#22d3ee" strokeWidth="2" />
            {points.map((point, index) => (
              <g key={`${point.reading.scannedAt}-${index}`}>
                <circle cx={point.x} cy={point.y} r={3.5} fill="#22d3ee">
                  <title>{new Date(point.reading.scannedAt).toLocaleTimeString()} · {point.reading.signalDbm} dBm</title>
                </circle>
              </g>
            ))}
            <text x={left} y={height - 5} fill="#94a3b8" fontSize="9">
              {new Date(firstTime).toLocaleTimeString()}
            </text>
            <text x={width - right} y={height - 5} textAnchor="end" fill="#94a3b8" fontSize="9">
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
    <div className="space-y-3">
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
