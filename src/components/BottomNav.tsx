import React from 'react';
import {
  Zap,
  Wifi,
  Wrench,
  TrendingUp,
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

export type MainTabType = 'speed' | 'network' | 'tools' | 'trends';

interface BottomNavProps {
  activeTab: MainTabType;
  onSelectTab: (tab: MainTabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const tabs = [
    { id: 'speed' as MainTabType, label: 'Speed Test', icon: Zap },
    { id: 'network' as MainTabType, label: 'Network', icon: Wifi },
    { id: 'tools' as MainTabType, label: 'Tools', icon: Wrench },
    { id: 'trends' as MainTabType, label: 'Trends', icon: TrendingUp },
  ];
  const compact = activeTab === 'speed';

  const handleTabClick = (tabId: MainTabType) => {
    triggerHaptic('tick');
    onSelectTab(tabId);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#070F1E] border-t border-white/10">
      <div className={`max-w-md mx-auto px-4 flex items-center justify-around ${compact ? 'py-1' : 'py-1.5'}`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={compact ? tab.label : undefined}
              className={`flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer ${compact ? 'min-w-12 py-1.5 px-2' : 'py-1.5 px-3 rounded-2xl'} ${
                isActive
                  ? 'text-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div
                className={`w-9 h-8 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? compact ? 'text-app-accent-text' : 'bg-app-accent/10 text-app-accent-text border border-app-accent/40'
                    : 'text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              {!compact && <span
                className={`text-[10px] font-medium tracking-wide mt-1 ${
                  isActive ? 'text-cyan-300 font-bold' : 'text-slate-400'
                }`}
              >
                {tab.label}
              </span>}
              {compact && isActive && <span className="mt-0.5 h-1 w-1 rounded-full bg-app-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
