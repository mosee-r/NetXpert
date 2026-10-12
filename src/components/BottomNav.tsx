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

  const handleTabClick = (tabId: MainTabType) => {
    triggerHaptic('tick');
    onSelectTab(tabId);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#070F1E]/95 backdrop-blur-lg border-t border-white/10 shadow-2xl">
      <div className="max-w-md mx-auto px-4 py-1.5 flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition-all cursor-pointer ${
                isActive
                  ? 'text-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div
                className={`w-9 h-8 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 glow-cyan-sm scale-105'
                    : 'text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span
                className={`text-[10px] font-medium tracking-wide mt-1 ${
                  isActive ? 'text-cyan-300 font-bold' : 'text-slate-400'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
