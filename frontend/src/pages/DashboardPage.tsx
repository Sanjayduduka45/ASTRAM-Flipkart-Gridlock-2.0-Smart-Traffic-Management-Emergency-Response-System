import React from 'react';
import { 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  Users, 
  MapPin, 
  Sparkles, 
  ChevronDown, 
  CloudRain, 
  Shield, 
  AlertCircle,
  Truck,
  Activity,
  Wrench
} from 'lucide-react';
import { KPICard } from '../components/KPICard';
import { BENGALURU_LOCATIONS } from '../mockData';
import type { Incident, TrafficForecastResult, MapLayersState, HotspotData, CameraData, WeatherData } from '../types';

const MapViewer = React.lazy(() => import('../components/MapViewer').then(m => ({ default: m.MapViewer })));

interface DashboardPageProps {
  activeIncidentsList: Incident[];
  forecastResult: TrafficForecastResult | null;
  activeDemoScenario: string;
  selectedIncident: Incident | null;
  setSelectedIncident: (inc: Incident | null) => void;
  mapLayers: MapLayersState;
  setMapLayers: React.Dispatch<React.SetStateAction<MapLayersState>>;
  setSelectedHotspot: (spot: HotspotData | null) => void;
  cameras: CameraData[];
  weatherData: WeatherData;
  setActiveTab: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  activeIncidentsList,
  forecastResult,
  activeDemoScenario,
  selectedIncident,
  setSelectedIncident,
  mapLayers,
  setMapLayers,
  setSelectedHotspot,
  cameras,
  weatherData,
  setActiveTab
}) => {
  // Fallback default spotlight event if forecastResult is null
  const defaultSpotlight: TrafficForecastResult = {
    eventName: 'IPL Cricket Tournament',
    eventType: 'Sports Game',
    locationName: 'Chinnaswamy Stadium',
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    startTime: '16:00',
    endTime: '22:30',
    expectedCrowd: 45005,
    weather: 'Clear',
    congestionLevel: 'CRITICAL',
    trafficIncreasePct: 85,
    peakCongestionTime: '20:30',
    expectedDelayMins: 45,
    riskScore: 82,
    modelName: 'Traffic Intelligence Engine (Local)',
    modelVersion: 'v1.0.0-fallback',
    inferenceTimeMs: 2.45,
    hourlyTrend: [],
    aiRecommendations: [
      "Pre-position 12 Officers at stadium perimeter, enforce outbound diversions at Queens Road.",
      "Reroute inbound traffic via dynamic VMS early advisory alerts.",
      "Activate manual signal timing overrides at MG Road and Queens Road junctions."
    ]
  };

  const activeSpotlight = forecastResult || defaultSpotlight;

  // Row 1 Metric Calculations
  const criticalEventsCount = activeIncidentsList.filter(i => i.risk_level === 'CRITICAL').length;
  const highRiskCorridorsCount = BENGALURU_LOCATIONS.filter((loc) => loc.risk === 'CRITICAL' || loc.risk === 'HIGH').length;
  const currentExpectedDelay = activeDemoScenario ? '38 mins' : '24 mins';
  const availableOfficersText = activeDemoScenario ? '92 / 150' : '108 / 150';

  // Live Traffic Summary calculation based on active incidents
  const totalIncidents = activeIncidentsList.length;
  const smoothPct = Math.max(50, 85 - totalIncidents * 2.5);
  const heavyPct = Math.min(25, 5 + totalIncidents * 1.5);
  const moderatePct = 100 - smoothPct - heavyPct;

  // Recent 5 incidents
  const recentIncidents = [...activeIncidentsList]
    .sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime())
    .slice(0, 5);

  // Expected weather delay calculation
  const weatherDelayIncrease = Math.round(5 + (weatherData.rainfall_mm || 0) * 1.2);

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* ROW 1: Metric KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Major Events" 
          value={criticalEventsCount} 
          icon={AlertTriangle} 
          trend={{ 
            value: activeDemoScenario ? '↑ 100%' : 'Stable', 
            status: activeDemoScenario ? 'bad' : 'neutral' 
          }}
          subtext="Requires immediate dispatch"
        />
        <KPICard 
          title="Busy Roads" 
          value={highRiskCorridorsCount} 
          icon={TrendingUp} 
          trend={{ 
            value: activeDemoScenario ? '↑ 14%' : 'Stable', 
            status: activeDemoScenario ? 'bad' : 'neutral' 
          }}
          subtext="Junction congestion > 70%"
        />
        <KPICard 
          title="Travel Delay" 
          value={currentExpectedDelay} 
          icon={Clock} 
          trend={{ 
            value: activeDemoScenario ? '↑ 14m' : 'Stable', 
            status: activeDemoScenario ? 'bad' : 'neutral' 
          }}
          subtext="Avg delay across segments"
        />
        <KPICard 
          title="Available Officers" 
          value={availableOfficersText} 
          icon={Users} 
          trend={{ 
            value: activeDemoScenario ? '↓ 16 deployed' : 'Full strength', 
            status: activeDemoScenario ? 'bad' : 'good' 
          }}
          subtext="Available for deployment"
        />
      </div>

      {/* ROW 1.5: Live Traffic Summary, Weather Impact, and 2-Hour Prediction & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Card A: Live Traffic Summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Activity className="h-4.5 w-4.5 text-blue-600" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Live Traffic Summary</h4>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Smooth Roads</span>
                <span className="text-emerald-600 font-bold">{smoothPct.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${smoothPct}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Moderate Traffic</span>
                <span className="text-amber-600 font-bold">{moderatePct.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${moderatePct}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Heavy Traffic</span>
                <span className="text-rose-600 font-bold">{heavyPct.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full transition-all duration-500" style={{ width: `${heavyPct}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-semibold border-t border-slate-100">
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Peak Traffic Time</span>
                <strong className="text-slate-800 font-bold">17:30 - 19:30</strong>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Most Congested Area</span>
                <strong className="text-slate-800 font-bold">Silk Board Corridor</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Card B: Weather Impact Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-20 w-20 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <CloudRain className="h-4.5 w-4.5 text-blue-600" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Weather Impact Monitor</h4>
          </div>
          <div className="space-y-2 text-xs font-semibold text-slate-655">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Current Weather:</span>
              <strong className="text-slate-800">{weatherData.rainfall_mm > 0 ? 'Rainy Showers' : 'Partly Cloudy'} ({weatherData.temperature}°C)</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Rainfall Status:</span>
              <strong className="text-slate-800">{weatherData.rainfall_mm.toFixed(1)} mm/hr</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Affected Areas:</span>
              <strong className="text-slate-800 truncate max-w-[160px]">Outer Ring Rd, Bannerghatta</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Expected Delay Increase:</span>
              <strong className="text-rose-600 font-extrabold">+{weatherDelayIncrease} mins</strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Weather Risk Level:</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase ${
                weatherData.flood_risk === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200' :
                weatherData.flood_risk === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {weatherData.flood_risk} RISK
              </span>
            </div>
          </div>
        </div>

        {/* Card C: Next 2-Hour Traffic Prediction & Active Alerts */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Shield className="h-4.5 w-4.5 text-blue-600" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">AI Warnings & Active Alerts</h4>
          </div>
          <div className="space-y-3 text-xs">
            {/* 2-Hour prediction ticker */}
            <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
              <span className="text-[9px] font-black text-blue-600 block uppercase mb-1">🤖 2-Hour Bottleneck Alert</span>
              <p className="text-[10.5px] text-slate-700 font-semibold leading-relaxed">
                Predictive analytics expect a major bottleneck forming at <strong className="text-slate-900">Hebbal Flyover</strong> in 45 mins. Dynamic routing recommended.
              </p>
            </div>

            {/* Active alerts indicators */}
            <div className="space-y-2 font-semibold">
              <div className="flex items-center justify-between text-[11px] bg-rose-50 text-rose-700 border border-rose-100 p-1.5 rounded-lg">
                <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" /> Waterlogging: ORR</span>
                <span className="text-[8px] font-black uppercase bg-rose-600 text-white px-1.5 py-0.5 rounded">High Risk</span>
              </div>
              <div className="flex items-center justify-between text-[11px] bg-blue-50 text-blue-700 border border-blue-100 p-1.5 rounded-lg">
                <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" /> VIP Movement: Richmond Rd</span>
                <span className="text-[8px] font-black uppercase bg-blue-600 text-white px-1.5 py-0.5 rounded">17:45 - 18:15</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ROW 2: Active Event Spotlight */}
      <div className="bg-gradient-to-br from-indigo-50/40 to-blue-50/40 border border-indigo-100 shadow-md backdrop-blur-md rounded-xl p-6 relative overflow-hidden transition-all duration-300">
        <div className="absolute -right-24 -top-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-24 -bottom-24 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                Active Event Spotlight
              </span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight truncate leading-tight">
              {activeSpotlight.eventName}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 font-semibold">
              <span className="flex items-center gap-1.5">
                📍 {activeSpotlight.locationName}
              </span>
              <span className="hidden sm:inline opacity-40">•</span>
              <span>
                📅 {activeSpotlight.date}
              </span>
              <span className="hidden sm:inline opacity-40">•</span>
              <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                ⏱️ {activeSpotlight.startTime} - {activeSpotlight.endTime}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 shrink-0 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0 border-indigo-100/50">
            <div className="grid grid-cols-3 gap-6 sm:gap-8 flex-1 md:flex-initial">
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Risk Score</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    activeSpotlight.riskScore >= 75 ? 'bg-rose-500 animate-pulse' :
                    activeSpotlight.riskScore >= 50 ? 'bg-orange-500' :
                    activeSpotlight.riskScore >= 30 ? 'bg-yellow-500' : 'bg-emerald-500'
                  }`} />
                  <strong className="text-lg font-black text-slate-800 leading-none">
                    {activeSpotlight.riskScore}/100
                  </strong>
                </div>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Expected Crowd</span>
                <strong className="text-lg font-black text-slate-800 leading-none block mt-1">
                  {activeSpotlight.expectedCrowd.toLocaleString()}
                </strong>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Predicted Delay</span>
                <strong className="text-lg font-black text-rose-600 leading-none block mt-1">
                  +{activeSpotlight.expectedDelayMins}m
                </strong>
              </div>
            </div>
            
            <div className="pt-2 md:pt-0 shrink-0 w-full sm:w-auto">
              <button
                onClick={() => setActiveTab('prediction')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer border border-transparent"
              >
                View Operational Plan
                <ChevronDown className="h-4 w-4 rotate-270 shrink-0 transform -rotate-95" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3: Map Viewer + Resources & Recent Incidents Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Map (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col transition-all duration-300">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-600">
                <MapPin className="h-4.5 w-4.5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Live City Traffic Map
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">
                  Hotspots, checkpoints, cameras, and emergency squad location pins
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] font-bold text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                <span>Critical</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                <span>High Risk</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                <span>Moderate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span>Low Risk</span>
              </div>
            </div>
          </div>
          <div className="h-[450px] relative w-full">
            <React.Suspense fallback={<div className="flex items-center justify-center h-full w-full bg-slate-100 text-slate-450 font-bold text-xs">Loading Tactical Map Viewer...</div>}>
              <MapViewer 
                incidents={activeIncidentsList}
                onSelectIncident={setSelectedIncident}
                selectedIncident={selectedIncident}
                activeLayers={mapLayers}
                onToggleLayer={(layerId) => setMapLayers((prev) => ({ ...prev, [layerId]: !prev[layerId as keyof MapLayersState] }))}
                onSelectHotspot={(spot) => {
                  setSelectedHotspot(spot);
                  setSelectedIncident(null);
                }}
                cameras={cameras}
                weatherData={weatherData}
              />
            </React.Suspense>
          </div>
        </div>

        {/* RIGHT COLUMN: Resources & Recent Reports Feed (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Resource Status panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Users className="h-4.5 w-4.5 text-blue-600" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active Resource Dispatch</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1 text-slate-500"><Shield className="h-3.5 w-3.5" /> Patrols</span>
                <strong className="text-slate-800">42 / 50</strong>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1 text-slate-500"><Truck className="h-3.5 w-3.5" /> Tows</span>
                <strong className="text-slate-800">12 / 15</strong>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1 text-slate-500"><Wrench className="h-3.5 w-3.5" /> Pumps</span>
                <strong className="text-slate-800">8 / 10</strong>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1 text-slate-500"><Users className="h-3.5 w-3.5" /> TMC Ops</span>
                <strong className="text-slate-800">24 / 25</strong>
              </div>
            </div>
          </div>

          {/* Recent Incident list log */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-[312px]">
            <div>
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 mb-3">
                <AlertTriangle className="h-4.5 w-4.5 text-blue-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Recent Incidents Feed</h4>
              </div>
              
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {recentIncidents.map((inc) => (
                  <div 
                    key={inc.id}
                    onClick={() => setSelectedIncident(inc)}
                    className={`p-2.5 rounded-xl border transition-all text-xs font-semibold cursor-pointer flex justify-between items-start ${
                      selectedIncident?.id === inc.id 
                        ? 'bg-blue-50 border-blue-300' 
                        : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-blue-600 font-bold">{inc.id}</span>
                        <span className="text-[10px] text-slate-400">| {inc.nearest_junction}</span>
                      </div>
                      <p className="text-[10px] text-slate-550 truncate max-w-[160px] font-medium">{inc.description}</p>
                    </div>
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                      inc.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                      inc.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {inc.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ROW 4: Suggested Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-3">
          <div className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Sparkles className="h-4.5 w-4.5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Suggested Actions
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Top 3 high-impact tactical actions calculated for the active spotlight event
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {activeSpotlight.aiRecommendations.slice(0, 3).map((rec, idx) => {
            let tag = "Tactical Action";
            let tagColor = "bg-slate-550/10 text-slate-655 border-slate-200";
            
            const recLower = rec.toLowerCase();
            if (recLower.includes("officer") || recLower.includes("manpower") || recLower.includes("marshals")) {
              tag = "Manpower Allocation";
              tagColor = "bg-blue-500/10 text-blue-600 border-blue-500/20";
            } else if (recLower.includes("diversion") || recLower.includes("detour") || recLower.includes("reroute") || recLower.includes("bypass")) {
              tag = "Rerouting & Diversion";
              tagColor = "bg-cyan-500/10 text-cyan-600 border-cyan-500/20";
            } else if (recLower.includes("barricade") || recLower.includes("barrier")) {
              tag = "Barricade Strategy";
              tagColor = "bg-amber-500/10 text-amber-600 border-amber-500/20";
            } else if (recLower.includes("signal") || recLower.includes("green-phase") || recLower.includes("timing")) {
              tag = "Signal Management";
              tagColor = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
            } else if (recLower.includes("vms") || recLower.includes("advisory") || recLower.includes("broadcast") || recLower.includes("radio")) {
              tag = "Commuter Advisory";
              tagColor = "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
            }
            
            return (
              <div 
                key={idx} 
                className="border border-slate-150 rounded-xl p-4.5 bg-slate-50/30 hover:border-slate-300 transition-all duration-300 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-400 font-bold">Directive #{idx + 1}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${tagColor}`}>
                      {tag}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-bold">
                    {rec}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
