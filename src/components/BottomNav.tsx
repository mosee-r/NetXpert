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
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#070F1E] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid min-h-16 w-full max-w-md grid-cols-4 px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
              className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 transition-colors duration-200"
            >
              <div
                className={`flex h-7 w-8 items-center justify-center rounded-md transition-transform duration-200 ${isActive ? '-translate-y-0.5 text-app-accent-text' : 'text-app-muted'}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <span
                className={`max-w-full truncate text-[11px] font-medium ${
                  isActive ? 'text-app-accent-text' : 'text-app-secondary'
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
