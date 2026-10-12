import React from 'react';
import {
  LayoutDashboard,
  Wifi,
  Radio,
  Wrench,
  History,
  Settings,
} from 'lucide-react';

export type TabType = 'home' | 'wifi' | 'cellular' | 'tools' | 'history' | 'settings';

interface NavigationTabsProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  savedCount: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onSelectTab,
  savedCount,
}) => {
  const tabs = [
    { id: 'home' as TabType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'wifi' as TabType, label: 'Wi-Fi', icon: Wifi },
    { id: 'cellular' as TabType, label: 'Cellular', icon: Radio },
    { id: 'tools' as TabType, label: 'Diagnostic Tools', icon: Wrench },
    {
      id: 'history' as TabType,
      label: 'History & Reports',
      icon: History,
      badge: savedCount > 0 ? savedCount : undefined,
    },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="bg-slate-900/60 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-2 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-700 text-slate-300">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
