import React, { useState, useEffect, useCallback } from 'react';
import { 
  Smartphone,
  AlertTriangle,
  Radio,
  Siren,
  CloudRain,
  Shield,
  CheckCircle,
  Wind,
  Droplets,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { CitizenMobile } from '../components/CitizenMobile';
import type { WeatherData, Incident, CitizenReportInput } from '../types';
import type { TMCNotification } from '../components/Layout';

interface ExtendedWeatherData extends WeatherData {
  humidity?: number;
  wind_speed?: number;
  rain_probability?: number;
  weather_condition?: string;
  source?: string;
  timestamp?: string;
}

interface CitizenAppPageProps {
  weatherData: WeatherData;
  incidents: Incident[];
  setIncidents: React.Dispatch<React.SetStateAction<Incident[]>>;
  setTmcNotifications: React.Dispatch<React.SetStateAction<TMCNotification[]>>;
}

export const CitizenAppPage: React.FC<CitizenAppPageProps> = ({
  weatherData,
  incidents,
  setIncidents,
  setTmcNotifications
}) => {
  const [liveWeather, setLiveWeather] = useState<ExtendedWeatherData | null>(null);
  const [loadingWeather, setLoadingWeather] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Fetch live weather from backend
  const fetchLiveWeather = useCallback(async () => {
    // Avoid synchronous state updates in the render path/effect body
    setTimeout(() => setLoadingWeather(true), 0);
    try {
      const res = await fetch('http://localhost:8000/api/weather');
      if (res.ok) {
        const data = await res.json();
        setLiveWeather(data);
        setLastRefreshed(new Date().toLocaleTimeString());
      } else {
        throw new Error('API return code error');
      }
    } catch (err) {
      console.warn('Failed to fetch live weather, using fallback structure', err);
      // Fallback utilizing props or dynamic structure
      setLiveWeather({
        ...weatherData,
        humidity: 68,
        wind_speed: 12.5,
        rain_probability: 45,
        weather_condition: weatherData.rainfall_mm > 0 ? 'Light Rain' : 'Partly Cloudy',
        source: 'ASTRAM Secondary Sensor (Mocked)',
        timestamp: new Date().toISOString()
      });
      setLastRefreshed(new Date().toLocaleTimeString());
    } finally {
      setLoadingWeather(false);
    }
  }, [weatherData]);

  useEffect(() => {
    const initWeather = setTimeout(() => {
      fetchLiveWeather();
    }, 0);
    // Auto-refresh weather every 30 seconds
    const interval = setInterval(fetchLiveWeather, 30000);
    return () => {
      clearTimeout(initWeather);
      clearInterval(interval);
    };
  }, [fetchLiveWeather]);

  const handleCitizenReport = async (reportData: CitizenReportInput) => {
    // Generate an optimistic ID to append immediately in case backend responds slowly
    const tempId = `CIT-TEMP-${Date.now().toString().slice(-4)}`;
    const tempIncident: Incident = {
      id: tempId,
      start_datetime: new Date().toISOString(),
      latitude: 12.9716 + (Math.random() - 0.5) * 0.05,
      longitude: 77.5946 + (Math.random() - 0.5) * 0.05,
      event_cause: reportData.category.toLowerCase().replace(" ", "_"),
      description: reportData.description,
      veh_type: 'CAR',
      duration_mins: 120,
      num_lanes: 1,
      risk_level: reportData.severity ? (reportData.severity.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') : (reportData.category.toLowerCase() === 'accident' ? 'HIGH' : 'MEDIUM'),
      probability_closure: 0.35,
      congestion_score: 45,
      nearest_junction: reportData.nearest_junction,
      nearest_junction_dist_km: 0.1,
      status: 'PENDING',
      image: reportData.image
    };

    // Optimistically update list
    setIncidents(prev => [tempIncident, ...prev]);

    try {
      const payload = {
        category: reportData.category,
        latitude: 12.9716 + (Math.random() - 0.5) * 0.04,
        longitude: 77.5946 + (Math.random() - 0.5) * 0.04,
        nearest_junction: reportData.nearest_junction,
        description: reportData.description,
        language: 'en',
        image: reportData.image || null
      };

      const res = await fetch('http://localhost:8000/api/citizen-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const dbReport = await res.json();
        const newIncident: Incident = {
          id: dbReport.id,
          start_datetime: dbReport.start_datetime,
          latitude: dbReport.latitude,
          longitude: dbReport.longitude,
          event_cause: dbReport.event_cause,
          description: dbReport.description,
          veh_type: dbReport.veh_type,
          duration_mins: dbReport.duration_mins,
          num_lanes: dbReport.num_lanes,
          risk_level: dbReport.risk_level,
          probability_closure: dbReport.probability_closure,
          congestion_score: dbReport.congestion_score,
          nearest_junction: dbReport.nearest_junction,
          nearest_junction_dist_km: dbReport.nearest_junction_dist_km,
          status: dbReport.status,
          assigned_resource: dbReport.assigned_resource,
          image: dbReport.image,
          original_language: dbReport.original_language,
          translated_description: dbReport.translated_description
        };
        // Replace the optimistic temp incident with the finalized database incident
        setIncidents(prev => [newIncident, ...prev.filter(i => i.id !== tempId)]);
      } else {
        throw new Error("Backend save failed");
      }
    } catch (e) {
      console.warn("Failed to save report to backend, keeping local optimistic incident:", e);
      // Finalize temp ID to a standard format if backend fails
      setIncidents(prev => 
        prev.map(i => i.id === tempId ? { ...i, id: `CIT-${Date.now().toString().slice(-4)}` } : i)
      );
    }

    const newNotif: TMCNotification = {
      id: `notif-${Date.now()}`,
      type: 'report',
      title: `New Citizen Report: ${reportData.category}`,
      body: reportData.description,
      timestamp: new Date().toISOString(),
      read: false,
      severity: reportData.severity ? (reportData.severity.toLowerCase() as 'low' | 'medium' | 'high' | 'critical') : (reportData.category.toLowerCase() === 'accident' ? 'high' : 'medium')
    };
    setTmcNotifications(prev => [newNotif, ...prev]);
  };

  // Compute Citizen Report Stats
  const citizenIncidents = incidents.filter(i => i.id.startsWith('CIT-'));
  const statsOpen = citizenIncidents.filter(i => i.status === 'PENDING').length;
  const statsInvestigating = citizenIncidents.filter(i => i.status === 'ON_SCENE' || i.status === 'DISPATCHED').length;
  const statsResolved = citizenIncidents.filter(i => i.status === 'RESOLVED').length;
  const statsTotal = citizenIncidents.length;

  // Active Critical Alerts from general incidents list
  const activeAlerts = incidents
    .filter(i => i.risk_level === 'CRITICAL' || i.risk_level === 'HIGH')
    .slice(0, 3);

  // Active SOS dispatches (emergency state)
  const activeSosIncidents = incidents.filter(i => i.event_cause.includes('sos') || i.description.includes('SOS'));

  // Static list of road closures to display
  const roadClosures = [
    { road: 'Mysore Road (Arterial lanes)', reason: 'Severe Flooding / Water logging', status: 'Blocked', clearTime: '2 hours' },
    { road: 'Bannerghatta Road (Near MICO layout)', reason: 'Water accumulation & stalled bus', status: 'Partially Blocked', clearTime: '1.5 hours' },
    { road: 'Outer Ring Road (Hebbal Underpass)', reason: 'Heavy rainfall overflow', status: 'Blocked', clearTime: '45 mins' }
  ];

  // Active weather data representation
  const activeWeather = liveWeather || {
    temperature: weatherData.temperature,
    rainfall_mm: weatherData.rainfall_mm,
    flood_risk: weatherData.flood_risk,
    storm_alerts: weatherData.storm_alerts,
    humidity: 65,
    wind_speed: 12,
    rain_probability: 40,
    weather_condition: weatherData.rainfall_mm > 0 ? 'Rainy' : 'Partly Cloudy',
    source: 'Default Meter',
    timestamp: new Date().toISOString()
  };

  return (
    <div className="animate-fade-in text-left space-y-6">

      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-blue-600" />
              Bengaluru Citizen Traffic App
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Interactive mobile simulator and telemetry panels for public traffic reports
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-[10px] font-bold text-blue-600">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              Telemetry Sync Active
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Mobile App, Right Analytics Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT COLUMN: Interactive Mobile Simulator (5 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col items-center">
            <div className="w-full flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-lg">
                  <Smartphone className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800">Mobile Simulator</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Fully functional interactive interface</p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 font-bold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                LIGHT CONTEXT
              </span>
            </div>

            {/* Embedded Mobile Device with responsive scaling/overflow support */}
            <div className="w-full overflow-hidden pb-2 flex justify-center items-center min-h-[610px] sm:min-h-[700px]">
              <div className="scale-[0.85] xs:scale-90 sm:scale-100 origin-center transition-all duration-300">
                <CitizenMobile 
                  weatherData={activeWeather}
                  onReportIncident={handleCitizenReport}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Operational Telemetry & Information (7 cols) */}
        <div className="lg:col-span-7 space-y-6">

          {/* 1. Live Weather Integration Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 h-24 w-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-start border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                  <CloudRain className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Live Bengaluru Weather</h4>
                  <p className="text-[10px] text-slate-400 font-medium">Tomorrow.io weather API integration</p>
                </div>
              </div>
              <button 
                onClick={fetchLiveWeather}
                disabled={loadingWeather}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-500 hover:text-slate-800 disabled:opacity-50 flex items-center gap-1 text-[10px] font-bold border border-slate-200"
              >
                <RefreshCw className={`h-3 w-3 ${loadingWeather ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Temperature</span>
                <strong className="text-xl font-black text-slate-800">{activeWeather.temperature.toFixed(1)}°C</strong>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Condition</span>
                <strong className="text-xs font-extrabold text-blue-600 block leading-tight mt-1 truncate">
                  {activeWeather.weather_condition || 'Partly Cloudy'}
                </strong>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Rain Intensity</span>
                <strong className="text-xl font-black text-slate-800">{activeWeather.rainfall_mm.toFixed(1)} mm</strong>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Rain Probability</span>
                <strong className="text-xl font-black text-slate-800">{activeWeather.rain_probability ?? 40}%</strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-600">
              <div className="flex justify-between items-center bg-slate-50/60 p-2.5 rounded-lg border border-slate-100">
                <span className="flex items-center gap-1.5 font-bold"><Droplets className="h-3.5 w-3.5 text-blue-500" /> Humidity:</span>
                <span className="font-bold text-slate-800">{activeWeather.humidity ?? 65}%</span>
              </div>
              <div className="flex justify-between items-center bg-slate-50/60 p-2.5 rounded-lg border border-slate-100">
                <span className="flex items-center gap-1.5 font-bold"><Wind className="h-3.5 w-3.5 text-slate-500" /> Wind Speed:</span>
                <span className="font-bold text-slate-800">{(activeWeather.wind_speed ?? 12).toFixed(1)} km/h</span>
              </div>
            </div>

            {/* Warnings Alert Banner */}
            {activeWeather.storm_alerts && activeWeather.storm_alerts !== 'None' && (
              <div className="bg-rose-50 border border-rose-250 text-rose-700 text-xs p-3 rounded-xl mt-4 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <div>
                  <strong className="font-extrabold block">Meteorological Warning:</strong>
                  <span className="font-medium text-rose-650">{activeWeather.storm_alerts}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono mt-3">
              <span>Source: <strong className="text-slate-500">{activeWeather.source || 'Meteorological API'}</strong></span>
              <span>Updated: <strong className="text-slate-500">{lastRefreshed || 'Just Now'}</strong></span>
            </div>
          </div>

          {/* 2. Citizen Report Statistics */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3.5 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              Citizen Reports Statistics
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <strong className="text-2xl font-black text-slate-700 block leading-tight">{statsTotal}</strong>
                <span className="text-[9px] uppercase font-bold text-slate-450 block mt-0.5">Total Filed</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <strong className="text-2xl font-black text-amber-600 block leading-tight">{statsOpen}</strong>
                <span className="text-[9px] uppercase font-bold text-slate-450 block mt-0.5">Pending Review</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <strong className="text-2xl font-black text-blue-600 block leading-tight">{statsInvestigating}</strong>
                <span className="text-[9px] uppercase font-bold text-slate-450 block mt-0.5">Investigating</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <strong className="text-2xl font-black text-emerald-600 block leading-tight">{statsResolved}</strong>
                <span className="text-[9px] uppercase font-bold text-slate-450 block mt-0.5">Resolved</span>
              </div>
            </div>

            {/* Recent Submissions Feed */}
            {citizenIncidents.length > 0 ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <span className="text-[10px] font-black uppercase text-slate-400 block mb-2 tracking-wider">Latest Citizen Submissions</span>
                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {citizenIncidents.slice(0, 3).map((ci, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-600">{ci.id}</span>
                          <span className="text-slate-400 font-medium">| {ci.nearest_junction}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-medium mt-1 truncate max-w-[280px]">{ci.description}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        ci.status === 'PENDING' ? 'text-amber-600 bg-amber-50 border-amber-200' :
                        ci.status === 'RESOLVED' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
                        'text-blue-600 bg-blue-50 border-blue-200'
                      }`}>
                        {ci.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 font-medium text-center py-4.5">
                No reports submitted by citizens in the current session. Use the mobile app simulator to submit a report!
              </p>
            )}
          </div>

          {/* 3. Traffic Alerts & Active Road Closures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Traffic Alerts Panel */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[300px]">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4.5 w-4.5 text-rose-500" />
                  Active Traffic Alerts
                </h4>
                <div className="space-y-4">
                  {activeAlerts.length > 0 ? (
                    activeAlerts.map((alert, index) => {
                      const severity = alert.risk_level?.toUpperCase() || 'MEDIUM';
                      let severityBadge: string;
                      let severityEmoji: string;
                      let badgeStyle: string;
                      
                      if (severity === 'CRITICAL') {
                        severityBadge = 'Critical';
                        severityEmoji = '🔴';
                        badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200';
                      } else if (severity === 'HIGH') {
                        severityBadge = 'High';
                        severityEmoji = '🟠';
                        badgeStyle = 'bg-orange-50 text-orange-700 border-orange-200';
                      } else if (severity === 'MEDIUM') {
                        severityBadge = 'Medium';
                        severityEmoji = '🟡';
                        badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200';
                      } else {
                        severityBadge = 'Low';
                        severityEmoji = '🟢';
                        badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      }

                      return (
                        <div key={alert.id || index} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col gap-2 transition-all hover:border-slate-300">
                          {/* Top Row: Severity Badge and Status */}
                          <div className="flex items-center justify-between">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wider flex items-center gap-1 ${badgeStyle}`}>
                              <span>{severityEmoji}</span>
                              <span>{severityBadge}</span>
                            </span>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                              alert.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                              alert.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {alert.status}
                            </span>
                          </div>

                          {/* Middle: Location name (16-18px) and Icon */}
                          <div className="flex items-start gap-2.5">
                            <span className="text-base shrink-0 mt-0.5">🚨</span>
                            <div className="min-w-0">
                              <h5 className="text-[16px] sm:text-[17px] font-extrabold text-slate-900 leading-tight">
                                {alert.nearest_junction}
                              </h5>
                              <p className="text-xs font-semibold text-slate-800 mt-1 leading-normal">
                                {alert.description}
                              </p>
                            </div>
                          </div>

                          {/* Footer: Timestamp */}
                          <div className="flex justify-between items-center border-t border-slate-100 pt-2 text-[10px] text-slate-500 font-medium">
                            <span className="font-mono">
                              {new Date(alert.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono">
                              ID: {alert.id}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-400 font-medium py-3">No active high-risk traffic alerts.</p>
                  )}
                </div>
              </div>
              {activeAlerts.length > 0 && (
                <div className="border-t border-slate-100 pt-3 mt-4 text-right">
                  <span className="text-[10px] text-slate-500 font-extrabold">Total Active Hotspots: {incidents.length}</span>
                </div>
              )}
            </div>

            {/* Road Closures Panel */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Radio className="h-4 w-4 text-purple-600" />
                  Road Closures
                </h4>
                <div className="space-y-3">
                  {roadClosures.map((closure, idx) => (
                    <div key={idx} className="text-xs border-b border-slate-50 pb-2 last:border-b-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <strong className="text-slate-800 font-bold leading-tight">{closure.road.split(' ')[0]} {closure.road.split(' ')[1] || ''}</strong>
                        <span className="text-[8px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1 py-0.5 rounded leading-none shrink-0">
                          {closure.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">{closure.reason}</span>
                      <div className="flex justify-between text-[9px] text-slate-450 mt-1">
                        <span>Clear in:</span>
                        <span className="font-bold text-slate-700">{closure.clearTime}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* 4. SOS Operations & Emergency Units Dispatch status */}
          <div className="bg-gradient-to-br from-rose-50/40 to-slate-50 border border-rose-100 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-100 text-rose-600 rounded-lg animate-pulse">
                  <Siren className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Emergency SOS Log</h4>
                  <p className="text-[10px] text-slate-400 font-medium">Real-time status of emergency dispatches</p>
                </div>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 animate-pulse">
                Monitor Live
              </span>
            </div>

            {activeSosIncidents.length > 0 ? (
              <div className="space-y-3 text-xs">
                {activeSosIncidents.map((sos, index) => (
                  <div key={index} className="bg-white border border-rose-100 rounded-xl p-3 flex justify-between items-center shadow-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-rose-600">🚨 SOS ACTIVE</span>
                        <span className="text-slate-400 font-medium">| {sos.nearest_junction}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-bold mt-1">{sos.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono text-rose-600 font-extrabold block">Assigned Unit</span>
                      <span className="text-[10.5px] font-extrabold text-slate-800 block mt-0.5">{sos.assigned_resource || 'Pending Rescue...'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 bg-white/50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500 font-medium">
                No active SOS signals detected. Click the **Emergency Help** button in the mobile app mockup to simulate a live rescue dispatch sequence.
              </div>
            )}
          </div>

          {/* 5. Nearby Critical Services Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3.5 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              Bengaluru Emergency Contact Summary
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <div>
                  <strong className="text-slate-800 font-bold block">Traffic Police HQ</strong>
                  <span className="text-[10px] text-slate-550 block font-mono">📞 080-22943015</span>
                </div>
                <span className="text-[10px] font-bold text-blue-600">Available</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <div>
                  <strong className="text-slate-800 font-bold block">Trauma / Ambulance HQ</strong>
                  <span className="text-[10px] text-slate-550 block font-mono">📞 080-22065000</span>
                </div>
                <span className="text-[10px] font-bold text-blue-600">Available</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <div>
                  <strong className="text-slate-800 font-bold block">Towing Command Fleet</strong>
                  <span className="text-[10px] text-slate-550 block font-mono">📞 1800-425-0100</span>
                </div>
                <span className="text-[10px] font-bold text-blue-600">Active</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                <div>
                  <strong className="text-slate-800 font-bold block">BBMP Water Pump Dispatch</strong>
                  <span className="text-[10px] text-slate-550 block font-mono">📞 080-22221188</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-600">Standby</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default CitizenAppPage;
