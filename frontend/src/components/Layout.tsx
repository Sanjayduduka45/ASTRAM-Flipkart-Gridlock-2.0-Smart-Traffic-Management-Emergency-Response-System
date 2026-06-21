import React, { useState, useRef, useEffect } from 'react';
import { 
  Activity, 
  Map, 
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Radio,
  Globe,
  Megaphone,
  Siren,
  Camera,
  Bell,
  Languages,
  X,
  AlertTriangle,
  CheckCircle,
  LayoutDashboard,
  Calendar,
  Users,
  Cpu,
  Zap,
  Wrench,
  Droplets,
  Settings,
  LogOut,
  ShieldAlert,
  Navigation
} from 'lucide-react';

/* ── Types ──────────────────────────────────────────────── */

export type OperatingMode = 'routine' | 'monsoon' | 'vip' | 'crisis';
export type GlobalLang = 'en' | 'kn';

export interface TMCNotification {
  id: string;
  type: 'dispatch' | 'alert' | 'report' | 'mode_change' | 'weather';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

/* ── Translation Dictionary for Sidebar Labels ─────────── */

const SIDEBAR_TRANSLATIONS: Record<GlobalLang, Record<string, string>> = {
  en: {
    dashboard: 'Traffic Overview',
    traffic_analytics: 'Traffic Insights',
    prediction: 'Traffic Prediction',
    maps: 'City Traffic Map',
    cameras: 'Live Traffic Cameras',
    incident_management: 'Problem Reports',
    citizen_reporting: 'Public Reports',
    citizen_app: 'Citizen App',
    resources: 'Staff Allocation',
    groupPrimary: 'Primary Navigation',
    groupSecondary: 'Advanced Tools',
    systemActive: 'System Active',
    systemVersion: 'v2.0.0 · TMC Engine OK',
    opsDirector: 'Ops Director',
    bengaluruTMC: 'Bengaluru TMC',
    earlyWarning: 'Early Warning',
    liveCount: 'Live',
    notifications: 'Notifications',
    markAllRead: 'Mark all read',
    noNotifications: 'No notifications yet',
    operatingMode: 'Operating Mode',
    bbmp_road_issues: 'Road Issues',
    bbmp_waterlogging: 'Waterlogging',
    bbmp_infrastructure: 'Infrastructure Reports',
    emergency_dispatch: 'Emergency Dispatch',
    emergency_queue: 'Incident Queue',
  },
  kn: {
    dashboard: 'ಸಂಚಾರ ಅವಲೋಕನ',
    traffic_analytics: 'ಸಂಚಾರ ಒಳನೋಟಗಳು',
    prediction: 'ಸಂಚಾರ ಮುನ್ಸೂಚನೆ',
    maps: 'ನगर ಸಂಚಾರ ನಕ್ಷೆ',
    cameras: 'ನೇರ ಸಂಚಾರ ಕ್ಯಾಮೆರಾಗಳು',
    incident_management: 'ಸಮಸ್ಯೆ ವರದಿಗಳು',
    citizen_reporting: 'ಸಾರ್ವಜನಿಕ ವರದಿಗಳು',
    citizen_app: 'ನಾಗರಿಕ ಅಪ್ಲಿಕೇಶನ್',
    resources: 'ಸಿಬ್ಬಂದಿ ನಿಯೋಜನೆ',
    groupPrimary: 'ಪ್ರಾಥಮಿಕ ನ್ಯಾವಿಗೇಷನ್',
    groupSecondary: 'ಸುಧಾರಿತ ಪರಿಕರಗಳು',
    systemActive: 'ಸಿಸ್ಟಮ್ ಸಕ್ರಿಯ',
    systemVersion: 'v2.0.0 · TMC ಎಂಜಿನ್ OK',
    opsDirector: 'ಕಾರ್ಯಾಚರಣೆ ನಿರ್ದೇಶಕ',
    bengaluruTMC: 'ಬೆಂಗಳೂರು TMC',
    earlyWarning: 'ಮುಂಚಿತ ಎಚ್ಚರಿಕೆ',
    liveCount: 'ನೇರ',
    notifications: 'ಅಧಿಸೂಚನೆಗಳು',
    markAllRead: 'ಎಲ್ಲವನ್ನೂ ಓದಿದೆ ಎಂದು ಗುರುತಿಸಿ',
    noNotifications: 'ಇನ್ನೂ ಅಧಿಸೂಚನೆಗಳಿಲ್ಲ',
    operatingMode: 'ಕಾರ್ಯಾಚರಣೆ ಮೋಡ್',
    bbmp_road_issues: 'ರಸ್ತೆ ಸಮಸ್ಯೆಗಳು',
    bbmp_waterlogging: 'ನೀರು ನಿಲ್ಲುವಿಕೆ',
    bbmp_infrastructure: 'ಮೂಲಸೌಕರ್ಯ ವರದಿಗಳು',
    emergency_dispatch: 'ತುರ್ತು ರವಾನೆ',
    emergency_queue: 'ಘಟನೆಗಳ ಸರತಿ ಸಾಲು',
  }
};

/* ── Mode Styling ───────────────────────────────────────── */

const MODE_CONFIG: Record<OperatingMode, { label: string; emoji: string; color: string; border: string; bg: string; glow: string; labelKn: string }> = {
  routine: {
    label: 'Routine',
    emoji: '🟢',
    color: 'text-emerald-450',
    border: 'border-emerald-600/40',
    bg: 'bg-emerald-950/40',
    glow: 'shadow-emerald-500/10',
    labelKn: 'ದಿನಚರಿ',
  },
  monsoon: {
    label: 'Monsoon',
    emoji: '🌧️',
    color: 'text-sky-400',
    border: 'border-sky-600/40',
    bg: 'bg-sky-950/40',
    glow: 'shadow-sky-500/10',
    labelKn: 'ಮುಂಗಾರು',
  },
  vip: {
    label: 'VIP Movement',
    emoji: '🚨',
    color: 'text-amber-400',
    border: 'border-amber-600/40',
    bg: 'bg-amber-950/40',
    glow: 'shadow-amber-500/10',
    labelKn: 'VIP ಚಲನೆ',
  },
  crisis: {
    label: 'Crisis',
    emoji: '🔴',
    color: 'text-rose-400',
    border: 'border-rose-600/40',
    bg: 'bg-rose-950/40',
    glow: 'shadow-rose-500/10',
    labelKn: 'ಬಿಕ್ಕಟ್ಟು',
  }
};

const LANG_OPTIONS: { code: GlobalLang; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'kn', label: 'ಕನ್ನಡ', flag: '🇮🇳' },
];

/* ── Props ──────────────────────────────────────────────── */

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  incidentCount: number;
  activeDemoScenario?: string;
  onSelectDemoScenario?: (scenarioName: string) => void;
  onRunSimulation?: () => void;
  isSimulating?: boolean;
  /* New TMC props */
  globalLang: GlobalLang;
  setGlobalLang: (lang: GlobalLang) => void;
  operatingMode: OperatingMode;
  setOperatingMode: (mode: OperatingMode) => void;
  notifications: TMCNotification[];
  onMarkAllNotificationsRead: () => void;
  currentUser: { username: string; role: 'police' | 'bbmp' | 'emergency' | 'admin' } | null;
  onLogout: () => void;
}

const formatTimestamp = (isoString: string) => {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getSeverity = (type: TMCNotification['type']): 'critical' | 'high' | 'medium' | 'low' => {
  switch (type) {
    case 'alert': return 'critical';
    case 'dispatch': return 'high';
    case 'report': return 'medium';
    default: return 'low';
  }
};

const groupNotifications = (notifs: TMCNotification[]) => {
  const today: TMCNotification[] = [];
  const thisWeek: TMCNotification[] = [];
  const earlier: TMCNotification[] = [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  notifs.forEach(n => {
    const ts = new Date(n.timestamp).getTime();
    if (ts >= todayStart) {
      today.push(n);
    } else if (ts >= oneWeekAgo) {
      thisWeek.push(n);
    } else {
      earlier.push(n);
    }
  });

  return { today, thisWeek, earlier };
};

/* ── Component ──────────────────────────────────────────── */

export const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  incidentCount,
  activeDemoScenario,
  onSelectDemoScenario,
  onRunSimulation,
  isSimulating,
  globalLang,
  setGlobalLang,
  operatingMode,
  notifications,
  onMarkAllNotificationsRead,
  currentUser,
  onLogout
}) => {
  const t = SIDEBAR_TRANSLATIONS[globalLang];
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifDrawer(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLangMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const [isCollapsed, setIsCollapsed] = useState(false);

  const role = currentUser?.role || 'admin';

  const menuItems = React.useMemo(() => {
    if (role === 'police') {
      return [
        { id: 'cameras', icon: Camera },
        { id: 'incident_management', icon: Siren },
        { id: 'resources', icon: Users },
      ];
    }
    if (role === 'bbmp') {
      return [
        { id: 'bbmp_road_issues', icon: Wrench },
        { id: 'bbmp_waterlogging', icon: Droplets },
        { id: 'bbmp_infrastructure', icon: Settings },
      ];
    }
    if (role === 'emergency') {
      return [
        { id: 'emergency_dispatch', icon: Navigation },
        { id: 'emergency_queue', icon: ShieldAlert },
      ];
    }
    // Unified menu order for administrator
    return [
      { id: 'dashboard', icon: LayoutDashboard },
      { id: 'prediction', icon: Calendar },
      { id: 'maps', icon: Map },
      { id: 'resources', icon: Users },
      { id: 'cameras', icon: Camera },
      { id: 'incident_management', icon: Siren },
      { id: 'citizen_reporting', icon: Megaphone },
      { id: 'citizen_app', icon: Cpu },
      { id: 'traffic_analytics', icon: TrendingUp }
    ];
  }, [role]);

  const modeConf = MODE_CONFIG[operatingMode];

  const getModeLabel = (mode: OperatingMode) => {
    const mc = MODE_CONFIG[mode];
    if (globalLang === 'kn') return mc.labelKn;
    return mc.label;
  };

  const notifIcon = (type: TMCNotification['type']) => {
    switch (type) {
      case 'dispatch': return <Siren className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
      case 'alert': return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
      case 'report': return <Megaphone className="h-3.5 w-3.5 text-indigo-400 shrink-0" />;
      case 'mode_change': return <Activity className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
      case 'weather': return <Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
      default: return <Bell className="h-3.5 w-3.5 text-zinc-400 shrink-0" />;
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 transition-colors duration-150">
      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className={`bg-white  border-r border-slate-200  flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-[72px]' : 'w-[240px]'}`}>
        {/* Logo and Collapse Toggle */}
        <div>
          <div className={`px-4 py-4 border-b border-slate-200  flex ${isCollapsed ? 'flex-col items-center space-y-3' : 'items-center justify-between'}`}>
            <div className="flex items-center space-x-2.5 min-w-0">
              <img 
                src="/logo.jpg" 
                alt="ASTRAM Logo" 
                className="h-9 w-9 rounded-lg object-cover bg-white border border-slate-200 shadow-sm shrink-0"
              />
              {!isCollapsed && (
                <div className="min-w-0 transition-opacity duration-200">
                  <h1 className="text-[15px] font-extrabold text-slate-900 tracking-tight leading-none">ASTRAM</h1>
                  <p className="text-[10px] text-slate-400 font-medium tracking-wide">Smart City TMC</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-lg hover:bg-slate-100 border border-slate-200/60 text-slate-500 transition-colors"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="px-3 py-3 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const label = t[item.id] || item.id;
              
              if (isCollapsed) {
                return (
                  <div key={item.id} className="relative group flex justify-center py-0.5">
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`p-2.5 rounded-lg transition-all duration-100 outline-none focus:ring-2 focus:ring-blue-500/25 ${
                        isActive 
                          ? 'bg-blue-50 text-blue-600 border border-blue-100/80 shadow-sm shadow-blue-500/5' 
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                      }`}
                      style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title={label}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                    </button>
                    {/* Hover Tooltip */}
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50 border border-slate-700">
                      {label}
                    </div>
                  </div>
                );
              }
              
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-semibold transition-all duration-100 outline-none focus:ring-2 focus:ring-blue-500/25 border ${
                    isActive 
                      ? 'bg-blue-50 text-blue-600 border-blue-100/80 shadow-sm shadow-blue-500/5 font-extrabold' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="truncate">{label}</span>
                  </div>
                  {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-60 shrink-0" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* System Status Footer */}
        <div className={`px-4 py-3 border-t border-slate-200  ${isCollapsed ? 'flex justify-center' : ''}`}>
          {isCollapsed ? (
            <div className="relative group">
              <div className="h-3.5 w-3.5 rounded-full bg-emerald-500 border border-emerald-400/30 animate-pulse shadow-sm shadow-emerald-500/20" />
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50 border border-slate-700">
                {t.systemActive}: {t.systemVersion}
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2.5 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100/80">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
              <div className="text-left min-w-0">
                <p className="text-[11px] font-semibold text-slate-700 truncate">{t.systemActive}</p>
                <p className="text-[9px] text-slate-400 font-mono">{t.systemVersion}</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Content ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── HEADER BAR ──────────────────────────────────────────── */}
        <header className="relative z-[100] h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-5 shrink-0">
          {/* ─ Left: Tab Title + Live Count ─ */}
          <div className="flex items-center space-x-3 min-w-0">
            <h2 className="text-[15px] font-bold text-slate-800 tracking-tight truncate">
              {t[activeTab] || activeTab}
            </h2>
            <div className="hidden sm:flex items-center space-x-1.5 bg-rose-50/80 px-2.5 py-1 rounded-full border border-rose-100/80">
              <Radio className="h-3 w-3 text-rose-500 animate-pulse" />
              <span className="text-[10px] font-bold text-rose-600">
                {incidentCount} {t.liveCount}
              </span>
            </div>
          </div>

          {/* ─ Right: Controls Aligned with 16px (space-x-4) Gap ─ */}
          <div className="flex items-center space-x-4">
            {/* Hackathon Event Simulation Control */}
            {onRunSimulation && (
              <button
                onClick={onRunSimulation}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  isSimulating 
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-500/20 border border-rose-500 animate-pulse'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-indigo-500/10 border border-indigo-500'
                }`}
              >
                <Zap className={`h-3.5 w-3.5 ${isSimulating ? 'animate-bounce' : ''}`} />
                <span>{isSimulating ? 'Active Simulation' : 'Run Event Simulation'}</span>
              </button>
            )}

            {/* Live Mode Toggle */}
            {onSelectDemoScenario && (
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-all shadow-sm">
                <select
                  value={activeDemoScenario || ''}
                  onChange={(e) => onSelectDemoScenario(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-slate-700 border-none outline-none focus:ring-0 cursor-pointer pr-1"
                >
                  <option value="" className="bg-white">🟢 Live Mode</option>
                  <option value="IPL Match" className="bg-white">🏆 IPL Match</option>
                  <option value="Political Rally" className="bg-white">📢 Political Rally</option>
                  <option value="Festival" className="bg-white">🛕 Festival</option>
                  <option value="Construction" className="bg-white">🚧 Construction</option>
                </select>
              </div>
            )}

            {/* Notification Bell & Drawer */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifDrawer(prev => !prev)}
                className="relative p-1.5 rounded-lg hover:bg-slate-100 border border-slate-200/80 transition-colors"
                title="Notifications"
              >
                <Bell className="h-4 w-4 text-slate-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 flex items-center justify-center bg-rose-500 text-white text-[9px] font-bold rounded-full animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              
              {/* Backdrop overlay */}
              {showNotifDrawer && (
                <div 
                  className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-[190] transition-opacity duration-300"
                  onClick={() => setShowNotifDrawer(false)}
                />
              )}

              {/* Right-Side Notification Drawer */}
              <div className={`fixed top-0 right-0 h-screen w-[380px] max-w-[100vw] bg-white  border-l border-slate-200  shadow-2xl z-[200] flex flex-col transition-transform duration-300 ease-in-out transform ${
                showNotifDrawer ? 'translate-x-0' : 'translate-x-full'
              }`}>
                {/* Drawer header - Sticky */}
                <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-slate-150 bg-white/95 backdrop-blur-md z-10 flex-shrink-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-[14px] font-bold text-slate-900">{t.notifications}</p>
                    {unreadCount > 0 && (
                      <span className="h-4.5 px-1.5 flex items-center justify-center bg-blue-500 text-white text-[9px] font-bold rounded-full">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-3">
                    {unreadCount > 0 && (
                      <button onClick={onMarkAllNotificationsRead} className="text-[11px] font-semibold text-blue-500 hover:text-blue-400 transition-colors">
                        {t.markAllRead}
                      </button>
                    )}
                    <button onClick={() => setShowNotifDrawer(false)} className="p-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Drawer content - Scrollable */}
                <div className="flex-1 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                      <Bell className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-[12px]">{t.noNotifications}</p>
                    </div>
                  ) : (
                    (() => {
                      const { today, thisWeek, earlier } = groupNotifications(notifications);
                      
                      const renderGroup = (groupTitle: string, items: TMCNotification[]) => {
                        if (items.length === 0) return null;
                        return (
                          <div className="flex flex-col">
                            <div className="px-4 py-2 bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                              {groupTitle}
                            </div>
                            {items.map(n => {
                              const severity = n.severity || getSeverity(n.type);
                              return (
                                <div 
                                  key={n.id} 
                                  className={`flex items-start space-x-3.5 px-5 py-4 border-b border-slate-100  transition-colors ${
                                    !n.read ? 'bg-blue-50/20 ' : ''
                                  }`}
                                >
                                  {/* Left: Icon */}
                                  <div className="mt-0.5 p-1.5 rounded-lg bg-slate-50 border border-slate-200/50 shrink-0">
                                    {notifIcon(n.type)}
                                  </div>
                                  
                                  {/* Middle: Details */}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                        severity === 'critical' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                                        severity === 'high' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                                        severity === 'medium' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                                        'bg-slate-500/10 text-slate-500  border border-slate-500/20'
                                      }`}>
                                        {severity}
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-mono">
                                        {formatTimestamp(n.timestamp)}
                                      </span>
                                    </div>
                                    <p className={`text-[12px] font-bold mt-1.5 leading-snug ${!n.read ? 'text-slate-900 ' : 'text-slate-655 '}`}>
                                      {n.title}
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                                      {n.body}
                                    </p>
                                  </div>
                                  
                                  {/* Right: Dot */}
                                  {!n.read && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      };

                      return (
                        <>
                          {renderGroup('Today', today)}
                          {renderGroup('This Week', thisWeek)}
                          {renderGroup('Earlier', earlier)}
                        </>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>

            {/* Language Selector */}
            <div className="relative" ref={langRef}>
              <button
                onClick={() => setShowLangMenu(prev => !prev)}
                className="flex items-center space-x-1.5 p-1.5 rounded-lg hover:bg-slate-100 border border-slate-200/80 transition-colors"
                title="Language"
              >
                <Languages className="h-4 w-4 text-slate-500" />
                <span className="text-[10px] font-bold text-slate-600 uppercase hidden sm:inline">{globalLang}</span>
              </button>
              {showLangMenu && (
                <div className="absolute top-full right-0 mt-2 w-[160px] max-w-[180px] bg-white border border-slate-200 rounded-xl shadow-xl z-[110] p-1 origin-top-right animate-scale-in">
                  {LANG_OPTIONS.map(opt => (
                    <button
                      key={opt.code}
                      onClick={() => { setGlobalLang(opt.code); setShowLangMenu(false); }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 text-left rounded-lg transition-all ${
                        globalLang === opt.code 
                          ? 'bg-blue-50  text-blue-600  font-bold border border-blue-100/40 ' 
                          : 'text-slate-600  hover:bg-slate-100/60 '
                      }`}
                    >
                      <span className="text-sm leading-none flex items-center justify-center w-5 h-5 shrink-0 select-none">{opt.flag}</span>
                      <span className="text-[12px] font-semibold leading-none flex-1 truncate">{opt.label}</span>
                      {globalLang === opt.code && <CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>



            {/* Profile Avatar & Details */}
            <div className="flex items-center space-x-3 pl-3 border-l border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 bg-gradient-to-br from-blue-500 to-indigo-650 text-white rounded-full flex items-center justify-center font-bold text-[10px] shadow-sm">
                  {currentUser?.username.slice(0, 2).toUpperCase() || 'OP'}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-[11px] font-semibold text-slate-855 leading-none capitalize">
                    {currentUser?.username || 'Operator'}
                  </p>
                  <p className="text-[9px] text-slate-455 mt-0.5 uppercase tracking-wider font-bold">
                    {currentUser?.role === 'police' ? 'Traffic Police' :
                     currentUser?.role === 'bbmp' ? 'BBMP' :
                     currentUser?.role === 'emergency' ? 'Emergency' :
                     'Admin'}
                  </p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* ── Mode Banner (when not Routine) ───────────────────────── */}
        {operatingMode !== 'routine' && (
          <div className={`flex items-center justify-center space-x-2 px-4 py-1.5 ${modeConf.bg} border-b ${modeConf.border}`}>
            <span className="text-sm">{modeConf.emoji}</span>
            <span className={`text-[11px] font-extrabold tracking-widest uppercase ${modeConf.color}`}>
              {getModeLabel(operatingMode)} {globalLang === 'en' ? 'Mode Active' : 'ಮೋಡ್ ಸಕ್ರಿಯ'}
            </span>
            <span className={`text-[10px] ${modeConf.color} opacity-60`}>·</span>
            <span className="text-[10px] text-slate-500">
              {globalLang === 'en'
                ? 'All systems adapting to current conditions'
                : 'ಎಲ್ಲಾ ವ್ಯವಸ್ಥೆಗಳು ಪ್ರಸ್ತುತ ಪರಿಸ್ಥಿತಿಗಳಿಗೆ ಹೊಂದಿಕೊಳ್ಳುತ್ತಿವೆ'}
            </span>
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-5 max-w-[1520px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
