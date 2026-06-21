import React, { useState } from 'react';
import { 
  TrendingUp,
  TrendingDown, 
  Activity, 
  Clock, 
  CloudRain, 
  Shield, 
  AlertTriangle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { KPICard } from '../components/KPICard';
import { BENGALURU_LOCATIONS } from '../mockData';

export const TrafficAnalyticsPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'live' | 'forecast' | 'corridors' | 'weather'>('live');

  // Mock hourly congestion live data
  const congestionTrendData = [
    { hour: '08:00', baseline: 42, live: 68, delay: 18 },
    { hour: '10:00', baseline: 58, live: 85, delay: 35 },
    { hour: '12:00', baseline: 45, live: 55, delay: 14 },
    { hour: '14:00', baseline: 38, live: 42, delay: 10 },
    { hour: '16:00', baseline: 52, live: 78, delay: 28 },
    { hour: '18:00', baseline: 74, live: 94, delay: 42 },
    { hour: '20:00', baseline: 60, live: 72, delay: 20 },
    { hour: '22:00', baseline: 40, live: 48, delay: 12 }
  ];

  // Daily Comparison
  const dailyGridData = [
    { day: 'Mon', typical: 55, activeWeek: 64, alerts: 4 },
    { day: 'Tue', typical: 58, activeWeek: 61, alerts: 3 },
    { day: 'Wed', typical: 60, activeWeek: 78, alerts: 8 }, // Heavy monsoonal waterlogging event
    { day: 'Thu', typical: 57, activeWeek: 59, alerts: 2 },
    { day: 'Fri', typical: 64, activeWeek: 73, alerts: 6 },
    { day: 'Sat', typical: 48, activeWeek: 52, alerts: 3 },
    { day: 'Sun', typical: 35, activeWeek: 40, alerts: 2 }
  ];

  // Weather Correlation Data
  const weatherCorrelationData = [
    { rainfall: 0, delayIncrease: 0, speedDrop: 0 },
    { rainfall: 5, delayIncrease: 8, speedDrop: 5 },
    { rainfall: 10, delayIncrease: 18, speedDrop: 12 },
    { rainfall: 15, delayIncrease: 32, speedDrop: 24 },
    { rainfall: 20, delayIncrease: 55, speedDrop: 42 },
    { rainfall: 30, delayIncrease: 95, speedDrop: 70 }
  ];

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Tab Navigation Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-2 shadow-sm shrink-0">
        {[
          { id: 'live', label: 'Live Congestion Index', icon: Activity },
          { id: 'forecast', label: 'Daily Grid Trend', icon: TrendingUp },
          { id: 'corridors', label: 'Corridor Flow Metrics', icon: Clock },
          { id: 'weather', label: 'Weather Correlation', icon: CloudRain }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as 'live' | 'forecast' | 'corridors' | 'weather')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                isActive 
                  ? 'bg-blue-50  text-blue-600  border-blue-100 ' 
                  : 'text-slate-500  hover:bg-slate-50  border-transparent'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* KPI summaries depending on subTab */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Corridor Health Index" 
          value="68%" 
          icon={Activity} 
          trend={{ value: '↓ 4%', status: 'bad' }}
          subtext="Avg city-wide flow rate"
        />
        <KPICard 
          title="Active Bottlenecks" 
          value="8 locations" 
          icon={AlertTriangle} 
          trend={{ value: '↑ 2 locations', status: 'bad' }}
          subtext="Congestion scores > 80%"
        />
        <KPICard 
          title="Avg Junction Speed" 
          value="18.5 km/h" 
          icon={TrendingDown} 
          trend={{ value: '↓ 2.4 km/h', status: 'bad' }}
          subtext="Peak hours city average"
        />
        <KPICard 
          title="VMS Alert Boards" 
          value="14 Active" 
          icon={Shield} 
          trend={{ value: 'Full coverage', status: 'good' }}
          subtext="Dynamic diversion boards online"
        />
      </div>

      {/* Primary Chart Area */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        {subTab === 'live' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Live Hourly Congestion & Delay Live Data
              </h4>
              <p className="text-xs text-slate-400 mt-0.5 mb-2">
                Real-time congestion score compared with typical baseline averages and resultant travel time delays
              </p>
            </div>
            
            <div className="h-72 w-full text-xs font-mono font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={congestionTrendData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBaseline2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderColor: '#e2e8f0',
                      color: '#0f172a' 
                    }} 
                  />
                  <Legend wrapperStyle={{ paddingTop: 10 }} />
                  <Area type="monotone" dataKey="baseline" name="Historical Baseline Index" stroke="#94a3b8" fillOpacity={1} fill="url(#colorBaseline2)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="live" name="Live Congestion Index" stroke="#ef4444" fillOpacity={1} fill="url(#colorLive)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {subTab === 'forecast' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Weekly Grid Congestion Index & Alert Frequency
              </h4>
              <p className="text-xs text-slate-400 mt-0.5 mb-2">
                Daily comparison of current active week grid congestion indexes against typical baseline indexes
              </p>
            </div>
            
            <div className="h-72 w-full text-xs font-mono font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyGridData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderColor: '#e2e8f0',
                      color: '#0f172a' 
                    }} 
                  />
                  <Legend wrapperStyle={{ paddingTop: 10 }} />
                  <Bar dataKey="typical" name="Typical Baseline" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="activeWeek" name="Active Monitored Week" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {subTab === 'corridors' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Bengaluru Corridor Delay & Flow Metrics
              </h4>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">
                Real-time congestion score and travel delays at primary arterial junctions
              </p>
            </div>
            
            <div className="overflow-x-auto border border-slate-150 rounded-xl">
              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Junction Name</th>
                    <th>Zone</th>
                    <th>Congestion Index</th>
                    <th>Travel Delay</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {BENGALURU_LOCATIONS.map((loc) => {
                    let badgeColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                    if (loc.risk === 'CRITICAL') badgeColor = "bg-rose-500/10 text-rose-500 border-rose-500/20";
                    else if (loc.risk === 'HIGH') badgeColor = "bg-orange-500/10 text-orange-500 border-orange-500/20";
                    else if (loc.baseScore > 50) badgeColor = "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
                    
                    return (
                      <tr key={loc.name}>
                        <td className="font-extrabold text-[12px] text-slate-800">{loc.name}</td>
                        <td className="text-slate-500 font-medium">{loc.zone}</td>
                        <td className="font-mono font-bold text-slate-800">{loc.baseScore}%</td>
                        <td className="font-mono text-rose-600 font-bold">+{loc.delay} mins</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${badgeColor}`}>
                            {loc.risk}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {subTab === 'weather' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Rainfall Intensity vs. Congestion & Average Speed Drops
              </h4>
              <p className="text-xs text-slate-400 mt-0.5 mb-2">
                Simulated response mapping travel delays (mins) and average traffic speed reduction (%) against rainfall volume (mm/hr)
              </p>
            </div>
            
            <div className="h-72 w-full text-xs font-mono font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weatherCorrelationData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="rainfall" name="Rainfall (mm/hr)" label={{ value: 'Rainfall (mm/hr)', position: 'insideBottom', offset: -5 }} stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderColor: '#e2e8f0',
                      color: '#0f172a' 
                    }} 
                  />
                  <Legend wrapperStyle={{ paddingTop: 15 }} />
                  <Line type="monotone" dataKey="delayIncrease" name="Travel Delay Increase (mins)" stroke="#ef4444" strokeWidth={2.5} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="speedDrop" name="Traffic Speed Reduction (%)" stroke="#eab308" strokeWidth={2.0} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrafficAnalyticsPage;
