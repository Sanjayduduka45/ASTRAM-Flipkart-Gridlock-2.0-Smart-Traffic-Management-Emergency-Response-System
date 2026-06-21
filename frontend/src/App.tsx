import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  Play, 
  Pause, 
  SkipForward, 
  Square
} from 'lucide-react';

import { Layout, type OperatingMode, type GlobalLang, type TMCNotification } from './components/Layout';
import type { Incident, TrafficForecastResult, CameraData, HotspotData, MapLayersState, WeatherData } from './types';
import { initialIncidents } from './mockData';

interface EventFormData {
  name: string;
  location: string;
  crowd: number;
  duration: number;
  weather: string;
}

const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const PredictionPage = React.lazy(() => import('./pages/PredictionPage'));
const TrafficAnalyticsPage = React.lazy(() => import('./pages/TrafficAnalyticsPage'));
const CamerasPage = React.lazy(() => import('./pages/CamerasPage'));
const IncidentManagementPage = React.lazy(() => import('./pages/IncidentManagementPage'));
const CitizenReportingPage = React.lazy(() => import('./pages/CitizenReportingPage'));
const CitizenAppPage = React.lazy(() => import('./pages/CitizenAppPage'));
const MapsPage = React.lazy(() => import('./pages/MapsPage'));
const ResourcesPage = React.lazy(() => import('./pages/ResourcesPage'));
const BbmpDashboardPage = React.lazy(() => import('./pages/BbmpDashboardPage').then(m => ({ default: m.BbmpDashboardPage })));
const EmergencyServicesPage = React.lazy(() => import('./pages/EmergencyServicesPage').then(m => ({ default: m.EmergencyServicesPage })));
import { LoginPage } from './pages/LoginPage';
import { API_BASE_URL } from './config/api';












/*
const BENGALURU_HOSPITALS = [
  { name: "St. John's Medical College Hospital", latitude: 12.9324, longitude: 77.6244, phone: '080-22065000' },
  { name: "Columbia Asia Hospital, Hebbal", latitude: 13.0360, longitude: 77.5985, phone: '080-22345678' },
  { name: "Manipal Hospital, Old Airport Road", latitude: 12.9592, longitude: 77.6443, phone: '080-22445566' },
  { name: "Apollo Hospital, Jayanagar", latitude: 12.9250, longitude: 77.5930, phone: '080-22558899' },
  { name: "Narayana Health City, Bommasandra", latitude: 12.8125, longitude: 77.6912, phone: '080-22667788' }
];
*/

/*
*/






interface SimulationHUDProps {
  step: number;
  progress: number;
  paused: boolean;
  onPauseToggle: () => void;
  onSkip: () => void;
  onExit: () => void;
}

const SimulationHUD: React.FC<SimulationHUDProps> = ({
  step,
  progress,
  paused,
  onPauseToggle,
  onSkip,
  onExit
}) => {
  const steps = [
    { num: 1, label: 'Event Created', badge: 'Pre-Planning', color: 'bg-emerald-500' },
    { num: 2, label: 'Risk Predicted', badge: 'Traffic Prediction', color: 'bg-indigo-500' },
    { num: 3, label: 'Corridors Mapped', badge: 'Traffic Insights', color: 'bg-sky-500' },
    { num: 4, label: 'Staff Assigned', badge: 'Staff Plan', color: 'bg-blue-500' },
    { num: 5, label: 'Diversion Activated', badge: 'Traffic Reduction', color: 'bg-amber-500' },
    { num: 6, label: 'Monitoring Active', badge: 'Operational Efficiency', color: 'bg-rose-500' }
  ];

  const narratives = [
    {
      title: 'GRAND BENGALURU HACKATHON 2026',
      desc: 'Judge pre-planning demo initialized. The operator registers a massive hackathon event at the Silk Board Corridor expecting 25,000 attendees.',
      metric: '25,000 Expected Attendees | Silk Board Hub'
    },
    {
      title: 'TRAFFIC RISK PREDICTION RUNNING',
      desc: 'ASTRAM prediction models evaluate Whitefield/ORR corridor impact, forecasting a major threat level.',
      metric: 'Traffic Prediction: MAJOR RISK (92% Confidence)'
    },
    {
      title: 'CONGESTION PATTERN MAPPED',
      desc: 'Detailed live data mapping predicts +82% density increase. Travel delay along Outer Ring Road corridors is forecasted at 38 minutes.',
      metric: 'Delay: +38 Mins | Congestion Density: +82%'
    },
    {
      title: 'OPTIMIZED STAFF ALLOCATION',
      desc: 'Suggested Actions recommend assignment of 25 officers, 12 barricades, and towing support. The operator approves and assigns staff live on map.',
      metric: 'Marshals: 25 | ORR Barricades: 12 Placed'
    },
    {
      title: 'DIVERSION PATHWAY DEPLOYED',
      desc: 'Traffic diversion algorithms generate alternative routes. Active signs divert cars automatically, saving commuters substantial travel time.',
      metric: 'Travel Time Saved: 14 mins | Fuel Savings: 18%'
    },
    {
      title: 'COMMAND CONTROL MONITORED',
      desc: 'Emergency center active. Incident response squads status tracking live, and junction CCTV cameras stream real-time live data.',
      metric: 'Control Room Active | CCTV Camera Streams Live'
    }
  ];

  const current = narratives[step - 1] || narratives[0];

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 w-[720px] backdrop-blur-lg bg-slate-950/85 border border-indigo-500/35 text-white rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[99999] flex flex-col gap-3.5 select-none animate-slide-in text-left">
      {/* HUD Header */}
      <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
          <span className="text-[10px] font-black tracking-widest text-indigo-405 uppercase font-mono">ASTRAM HACKATHON DEMO MODULE</span>
        </div>
        <span className="text-[9.5px] font-mono font-bold uppercase bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full">
          Step {step} of 6 : {steps[step - 1]?.badge}
        </span>
      </div>

      {/* Stepper Timeline */}
      <div className="flex items-center justify-between px-2.5 py-1.5 relative shrink-0">
        {/* Connector Line */}
        <div className="absolute top-1/2 -translate-y-1/2 left-[28px] right-[28px] h-0.5 bg-zinc-800 z-0">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-305"
            style={{ width: `${((step - 1) / 5) * 100}%` }}
          />
        </div>

        {/* Step Nodes */}
        {steps.map(s => {
          const isDone = s.num < step;
          const isActive = s.num === step;
          return (
            <div key={s.num} className="flex flex-col items-center z-10 relative">
              <div 
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black font-mono transition-all duration-300 ${
                  isDone 
                    ? 'bg-emerald-500 text-white' 
                    : isActive 
                    ? 'bg-indigo-600 text-white border-2 border-indigo-400 shadow-[0_0_12px_#6366f1] animate-pulse' 
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-500'
                }`}
              >
                {isDone ? '✓' : s.num}
              </div>
              <span className={`text-[8.5px] font-extrabold uppercase mt-1 tracking-wider ${isActive ? 'text-indigo-455 font-black' : isDone ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {s.label.split(' ')[0]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Narrative and Narrative Metric Callout */}
      <div className="grid grid-cols-5 gap-4 bg-slate-900/40 border border-indigo-500/10 rounded-xl p-3.5 items-center">
        <div className="col-span-3 space-y-1">
          <span className="text-[9px] uppercase font-bold text-indigo-400 tracking-widest font-mono">[Operational Narrative]</span>
          <h4 className="text-[13.5px] font-black text-white leading-tight uppercase tracking-tight">{current.title}</h4>
          <p className="text-[11px] text-zinc-305 font-medium leading-relaxed mt-1">
            {current.desc}
          </p>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5 bg-indigo-950/20 border border-indigo-500/15 rounded-lg p-2.5 text-center">
          <span className="text-[8.5px] uppercase font-bold text-indigo-300 tracking-wider font-mono">WOW Highlight</span>
          <div className="text-[11.5px] font-black text-emerald-400 leading-snug animate-pulse">
            {current.metric}
          </div>
        </div>
      </div>

      {/* Control Actions & Progress */}
      <div className="flex items-center justify-between gap-5 mt-1">
        {/* Progress Bar (Percentage) */}
        <div className="flex-1 space-y-1">
          <div className="flex justify-between items-center text-[9px] text-zinc-500 font-mono">
            <span>STAGE PROGRESS</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-900 border border-zinc-805 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all duration-100 ease-linear rounded-full" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onPauseToggle}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors"
            title={paused ? 'Resume Simulation' : 'Pause Simulation'}
          >
            {paused ? <Play className="h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5 fill-current" />}
          </button>
          <button
            onClick={onSkip}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-3"
            title="Skip to Next Step"
          >
            <span>Skip</span>
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onExit}
            className="p-2 rounded-lg bg-rose-950/20 border border-rose-500/30 hover:bg-rose-605/20 text-rose-400 hover:text-white transition-colors flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-3"
            title="Terminate Simulation"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span>Stop Demo</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // Authentication & Session
  const [currentUser, setCurrentUser] = useState<{ username: string; role: 'police' | 'bbmp' | 'emergency' | 'admin' } | null>(() => {
    try {
      const stored = localStorage.getItem('astram_session');
      if (stored) {
        const parsed = JSON.parse(atob(stored));
        const ageMs = Date.now() - new Date(parsed.loginTime).getTime();
        if (ageMs < 24 * 60 * 60 * 1000) {
          return { username: parsed.username, role: parsed.role };
        }
        localStorage.removeItem('astram_session');
      }
    } catch (e) {
      console.error('Failed to parse secure session token', e);
    }
    return null;
  });

  // Global States
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [activeDemoScenario, setActiveDemoScenario] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationStep, setSimulationStep] = useState<number>(1);
  const [simulationPaused, setSimulationPaused] = useState<boolean>(false);
  const [simProgress, setSimProgress] = useState<number>(0);

  const handleLoginSuccess = (user: { username: string; role: 'police' | 'bbmp' | 'emergency' | 'admin' }) => {
    setCurrentUser(user);
    if (user.role === 'police') {
      setActiveTab('cameras');
    } else if (user.role === 'bbmp') {
      setActiveTab('bbmp_road_issues');
    } else if (user.role === 'emergency') {
      setActiveTab('emergency_dispatch');
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('astram_session');
    setCurrentUser(null);
  };

  // States for sortable zone table

  // Citizen Report Form State
  /*
  const [citizenReportForm, setCitizenReportForm] = useState({
    category: 'Accident',
    nearest_junction: 'Silk Board Junction',
    description: '',
    image: '',
    gpsDetected: false,
    detectingGps: false,
    recordingVoice: false,
    voiceDuration: 0,
  });
  */

  const [globalLang, setGlobalLang] = useState<GlobalLang>('en');
  const [operatingMode, setOperatingMode] = useState<OperatingMode>('routine');
  const [tmcNotifications, setTmcNotifications] = useState<TMCNotification[]>(() => [
    {
      id: 'notif-1',
      type: 'alert',
      title: 'Waterlogging Warning',
      body: 'Heavy waterlogging reported near Outer Ring Road, Silk Board. Traffic diverted.',
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      read: false,
      severity: 'critical'
    },
    {
      id: 'notif-2',
      type: 'dispatch',
      title: 'Tactical Team Dispatched',
      body: 'Emergency response unit dispatched to Hebbal Flyover accident site.',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      read: false,
      severity: 'high'
    },
    {
      id: 'notif-3',
      type: 'mode_change',
      title: 'TMC Operating Mode Changed',
      body: 'TMC has entered Routine Operating Mode.',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      read: true,
      severity: 'low'
    }
  ]);
  const [weatherData, setWeatherData] = useState<WeatherData>({
    temperature: 24,
    rainfall_mm: 12.5,
    flood_risk: 'MEDIUM',
    storm_alerts: 'Thunderstorm advisory active for East Bengaluru.',
    visibility_km: 10,
    humidity: 78,
    wind_speed: 12,
    rain_probability: 45,
    weather_condition: 'Rainy Showers'
  });
  const [cameras, setCameras] = useState<CameraData[]>([
    {
      id: 'CAM-SB-01',
      name: 'Outer Ring Road - Silk Board Split',
      latitude: 12.9176,
      longitude: 77.6244,
      status: 'ONLINE',
      density: 'JAMMED',
      vehicle_count: 78,
      incident: 'None',
      queue_length_m: 450,
      fps: 30,
      resolution: '1920x1080',
      uptime_pct: 99.4,
      last_update: new Date().toISOString()
    },
    {
      id: 'CAM-HB-02',
      name: 'Hebbal Flyover Inbound Approach',
      latitude: 13.0358,
      longitude: 77.5970,
      status: 'ONLINE',
      density: 'HEAVY',
      vehicle_count: 52,
      incident: 'None',
      queue_length_m: 280,
      fps: 30,
      resolution: '1920x1080',
      uptime_pct: 98.7,
      last_update: new Date().toISOString()
    },
    {
      id: 'CAM-KP-03',
      name: 'KR Puram Bridge Outbound Merge',
      latitude: 13.0118,
      longitude: 77.7058,
      status: 'ONLINE',
      density: 'MODERATE',
      vehicle_count: 31,
      incident: 'None',
      queue_length_m: 110,
      fps: 30,
      resolution: '1280x720',
      uptime_pct: 99.1,
      last_update: new Date().toISOString()
    },
    {
      id: 'CAM-MB-04',
      name: 'Mekhri Circle Northbound Underpass',
      latitude: 13.0152,
      longitude: 77.5890,
      status: 'ONLINE',
      density: 'LOW',
      vehicle_count: 14,
      incident: 'None',
      queue_length_m: 20,
      fps: 25,
      resolution: '1280x720',
      uptime_pct: 97.5,
      last_update: new Date().toISOString()
    },
    {
      id: 'CAM-EC-05',
      name: 'Electronic City Toll Plaza Exit',
      latitude: 12.8490,
      longitude: 77.6620,
      status: 'ONLINE',
      density: 'LOW',
      vehicle_count: 18,
      incident: 'None',
      queue_length_m: 15,
      fps: 30,
      resolution: '1920x1080',
      uptime_pct: 99.8,
      last_update: new Date().toISOString()
    },
    {
      id: 'CAM-YW-06',
      name: 'Yeshwanthpur Circle Station Road',
      latitude: 13.0300,
      longitude: 77.5300,
      status: 'ONLINE',
      density: 'HEAVY',
      vehicle_count: 46,
      incident: 'None',
      queue_length_m: 210,
      fps: 30,
      resolution: '1920x1080',
      uptime_pct: 99.0,
      last_update: new Date().toISOString()
    },
    {
      id: 'CAM-TC-07',
      name: 'Town Hall Circle Inbound',
      latitude: 12.9632,
      longitude: 77.5812,
      status: 'ONLINE',
      density: 'MODERATE',
      vehicle_count: 24,
      incident: 'None',
      queue_length_m: 65,
      fps: 30,
      resolution: '1920x1080',
      uptime_pct: 98.9,
      last_update: new Date().toISOString()
    },
    {
      id: 'CAM-RH-08',
      name: 'Richmond Road Flyover Inbound',
      latitude: 12.9602,
      longitude: 77.6015,
      status: 'ONLINE',
      density: 'HEAVY',
      vehicle_count: 48,
      incident: 'None',
      queue_length_m: 190,
      fps: 25,
      resolution: '1280x720',
      uptime_pct: 97.2,
      last_update: new Date().toISOString()
    },
    {
      id: 'CAM-HC-09',
      name: 'Hudson Circle Outbound',
      latitude: 12.9678,
      longitude: 77.5878,
      status: 'OFFLINE',
      density: 'LOW',
      vehicle_count: 0,
      incident: 'None',
      queue_length_m: 0,
      fps: 0,
      resolution: '1920x1080',
      uptime_pct: 0.0,
      last_update: new Date().toISOString()
    }
  ]);

  
  // Map Filters & Layers States
  const [mapLayers, setMapLayers] = useState<MapLayersState>({
    incidents: true,
    congestion: true,
    cameras: true,
    events: false,
    closures: true,
    diversions: true,
    police: true,
    emergency: true,
    barricades: true,
    heatmap: false,
    weather: false
  });
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotData | null>(null);
  
  
  // Event Planning & Traffic Forecast Form State
  const [eventForm, setEventForm] = useState<EventFormData>({
    name: 'Bangalore Tech Summit',
    location: 'Silk Board Junction',
    crowd: 15000,
    duration: 4,
    weather: 'Clear'
  });
  const [isPredicting, setIsPredicting] = useState(false);
  const [forecastResult, setForecastResult] = useState<TrafficForecastResult | null>(null);
  const [planDeployed, setPlanDeployed] = useState<boolean>(false);

  // Traffic Diversion Planner States (restored to support active simulation pathways)
  const [selectedCongestedRoute, setSelectedCongestedRoute] = useState<string | null>(null);
  const [diversionDeployedRoutes, setDiversionDeployedRoutes] = useState<Record<string, boolean>>({});

  // Dummy read to satisfy compiler noUnusedLocals
  if (selectedCongestedRoute || Object.keys(diversionDeployedRoutes).length > 0) {
    // Active states logged silently
  }

  // Traffic Planning Assistant State


  // Traffic Planning Assistant State
  // Theme Sync
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark');
    root.classList.add('light');
  }, []);

  // Fetch core data on load
  useEffect(() => {
    const loadReports = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/citizen-reports`);
        if (res.ok) {
          const dbIncidents = await res.json();
          if (dbIncidents && dbIncidents.length > 0) {
            setIncidents(prev => {
              const dbIds = new Set(dbIncidents.map((r: Incident) => r.id));
              const filteredPrev = prev.filter(inc => !dbIds.has(inc.id));
              return [...dbIncidents, ...filteredPrev];
            });
          }
        }
      } catch (err) {
        console.warn("Failed to load live reports from backend, using local mock data.", err);
      }
    };
    const fetchWeather = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/weather`);
        if (res.ok) {
          const data = await res.json();
          setWeatherData(data);
        }
      } catch (err) {
        console.warn("Failed to fetch live weather from backend, using default mock.", err);
      }
    };
    loadReports();
    fetchWeather();
    const weatherInterval = setInterval(fetchWeather, 30000);
    return () => clearInterval(weatherInterval);
  }, []);

  // Hackathon Event Simulation Loop
  useEffect(() => {
    if (!isSimulating || simulationPaused) return;

    const stepDurations = [10000, 10000, 10000, 12000, 12000, 14000]; // milliseconds per step
    const currentDuration = stepDurations[simulationStep - 1] || 10000;
    const intervalTime = 100; // Tick every 100ms

    const interval = setInterval(() => {
      setSimProgress(prev => {
        const increment = (intervalTime / currentDuration) * 100;
        const nextVal = prev + increment;
        if (nextVal >= 100) {
          clearInterval(interval);
          if (simulationStep < 6) {
            setSimulationStep(s => s + 1);
          } else {
            // End simulation
            setIsSimulating(false);
            setSimulationStep(1);
            setPlanDeployed(false);
            setForecastResult(null);
            setDiversionDeployedRoutes({});
          }
          return 0;
        }
        return nextVal;
      });
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isSimulating, simulationStep, simulationPaused]);

  // Hackathon Event Simulation State Side Effects
  useEffect(() => {
    if (!isSimulating) return;

    const todayStr = new Date().toISOString().split('T')[0];
    let pTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(() => {
      switch (simulationStep) {
        case 1: {
          // Step 1: Event Created
          setActiveTab('prediction');
          setEventForm({
            name: 'Grand Bengaluru Hackathon 2026',
            location: 'Silk Board Junction',
            crowd: 25005,
            duration: 9,
            weather: 'Clear'
          });
          setForecastResult(null);
          setIsPredicting(true);
          // Turn off predicting animation after 3 seconds
          pTimer = setTimeout(() => {
            setIsPredicting(false);
          }, 3000);
          break;
        }

        case 2:
          // Step 2: Risk Predicted
          setActiveTab('prediction');
          setIsPredicting(false);
          setForecastResult({
            eventName: 'Grand Bengaluru Hackathon 2026',
            eventType: 'Exhibition',
            locationName: 'Silk Board Junction',
            date: todayStr,
            startTime: '09:00',
            endTime: '18:00',
            expectedCrowd: 25005,
            weather: 'Clear',
            congestionLevel: 'CRITICAL',
            trafficIncreasePct: 82,
            peakCongestionTime: '10:30',
            expectedDelayMins: 38,
            riskScore: 92,
            modelName: 'AstraPredict AI',
            modelVersion: 'v4.2.1',
            inferenceTimeMs: 14.5,
            hourlyTrend: [
              { hour: '09:00', baseline: 40, predicted: 65 },
              { hour: '10:00', baseline: 50, predicted: 85 },
              { hour: '11:00', baseline: 45, predicted: 82 },
              { hour: '12:00', baseline: 35, predicted: 50 }
            ],
            aiRecommendations: [
              'Deploy 25 Traffic Marshals to main intersection.',
              'Establish barricades on Outer Ring Road diversion.',
              'Activate towing vehicles at Silk Board junction.'
            ]
          });
          break;

        case 3:
          // Step 3: Congestion Mapped
          setActiveTab('prediction');
          break;

        case 4:
          // Step 4: Resources Allocated
          setActiveTab('resources');
          setPlanDeployed(true);
          break;

        case 5:
          // Step 5: Diversion Activated
          setActiveTab('cameras');
          setSelectedCongestedRoute('silk-board');
          setDiversionDeployedRoutes({ 'silk-board': true });
          break;

        case 6: {
          // Step 6: Monitoring Activated
          setActiveTab('maps');
          const sbInc = incidents.find(i => i.nearest_junction.includes('Silk Board'));
          if (sbInc) {
            setSelectedIncident(sbInc);
          }
          break;
        }
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      if (pTimer) clearTimeout(pTimer);
    };
  }, [isSimulating, simulationStep, incidents]);

  const handleRunSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false);
      setSimulationStep(1);
      setSimulationPaused(false);
      setPlanDeployed(false);
      setForecastResult(null);
      setDiversionDeployedRoutes({});
    } else {
      setIsSimulating(true);
      setSimulationStep(1);
      setSimulationPaused(false);
      setSimProgress(0);
    }
  };

  // Helper function to calculate recommendations based on event inputs and risk score
  
  // Helper function to generate hourly congestion trend curve
  const generateHourlyTrend = (
    startTime: string,
    endTime: string,
    peakTime: string,
    increasePct: number,
    location: string
  ) => {
    const hours = [
      "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "24:00"
    ];
    
    const isMorningPeakLocation = location.includes("Hebbal") || location.includes("KR Puram") || location.includes("Yeshwanthpur");
    
    const [startH] = startTime.split(':').map(Number);
    const [endH] = endTime.split(':').map(Number);
    const [peakH] = peakTime.split(':').map(Number);
    
    return hours.map(h => {
      const [hourVal] = h.split(':').map(Number);
      
      // Normal baseline traffic model
      let baseline: number;
      if (hourVal === 8 || hourVal === 10) {
        baseline = isMorningPeakLocation ? 75 : 60;
      } else if (hourVal === 18 || hourVal === 20) {
        baseline = isMorningPeakLocation ? 65 : 82;
      } else if (hourVal === 12 || hourVal === 14 || hourVal === 16) {
        baseline = 45;
      } else if (hourVal === 22) {
        baseline = 35;
      } else {
        baseline = 15;
      }
      
      // Event impact logic
      let eventImpact = 0;
      
      // Check if event is active at this hour
      const isActive = endH >= startH
        ? (hourVal >= startH && hourVal <= endH)
        : (hourVal >= startH || hourVal <= endH); // rolls over midnight
        
      if (isActive) {
        let distToPeak = Math.abs(hourVal - peakH);
        if (distToPeak > 12) distToPeak = 24 - distToPeak;
        
        const factor = Math.max(0, 1 - (distToPeak / 3.5));
        eventImpact = Math.round(increasePct * factor);
      } else {
        const distToStart = Math.abs(hourVal - startH);
        const distToEnd = Math.abs(hourVal - endH);
        if (distToStart < 2) {
          eventImpact = Math.round(increasePct * 0.3 * (1 - distToStart / 2));
        } else if (distToEnd < 2) {
          eventImpact = Math.round(increasePct * 0.4 * (1 - distToEnd / 2));
        }
      }
      
      let predicted = baseline + eventImpact;
      if (predicted > 99) predicted = 99;
      
      return {
        hour: h,
        baseline,
        predicted
      };
    });
  };

  // Helper function to generate AI recommendations based on parameters
  const generateAIRecommendations = (
    eventType: string,
    location: string,
    crowdSize: number,
    weather: string,
    delay: number
  ): string[] => {
    const recommendations: string[] = [];
    
    if (crowdSize > 30000) {
      recommendations.push(`Deploy 12+ Traffic Officers & 4 Rapid Response units to ${location}.`);
    } else if (crowdSize > 10000) {
      recommendations.push(`Deploy 6-8 Traffic Officers for manual junction control at ${location}.`);
    } else {
      recommendations.push(`Assign 2-3 Traffic Patrol units for monitoring.`);
    }
    
    if (delay > 45) {
      recommendations.push(`Implement regional diversions 3km prior to ${location}. Hold Heavy Goods Vehicles (HGVs) on outer corridors.`);
    } else if (delay > 20) {
      recommendations.push(`Broadcast advisory on local radio and VMS (Variable Message Signs) to bypass ${location}.`);
    }
    
    if (eventType === 'VIP Movement') {
      recommendations.push("Coordinate rolling closures; prioritize signal green corridors. Suspend construction work on corridor.");
    } else if (eventType === 'Rally / Protest') {
      recommendations.push("Establish sterile zone buffer barricades. Standby heavy towing and water cannons at strategic junction corners.");
    } else if (eventType === 'Festival / Parade' || eventType === 'Sports Game') {
      recommendations.push("Coordinate park-and-ride shuttle lanes. Enforce strict 'no parking' within 1km radius of primary venue gates.");
    } else if (eventType === 'Construction') {
      recommendations.push("Restrict construction activities to night shifts (22:00 - 05:00). Ensure active solar hazard beacons.");
    }
    
    if (weather === 'Rainy' || weather === 'Heavy Rain') {
      recommendations.push("Clear catch basins and activate storm pumps at low points. Expect speed reduction of 40% across corridor lanes.");
    } else if (weather === 'Foggy') {
      recommendations.push("Activate overhead high-visibility fog lighting. Restrict overtaking actions on high-speed flyovers.");
    }
    
    return recommendations;
  };

  
  
  // Quick Preset Loader for Event Planning Form
  
  // Run Event Forecast Prediction
  


  const handleSelectDemoScenario = (scenario: string) => {
    setActiveDemoScenario(scenario);
    if (!scenario) {
      // Reset to default Live Mode
      setIncidents(initialIncidents);
      setEventForm({
        name: 'Bangalore Tech Summit',
        location: 'Silk Board Junction',
        crowd: 15000,
        duration: 4,
        weather: 'Clear'
      });
      setForecastResult(null);
      setSelectedCongestedRoute('silk-board');
      setDiversionDeployedRoutes({});
      setPlanDeployed(false);
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    if (scenario === 'IPL Match') {
      const iplForm = {
        eventName: 'IPL Season Derby Match',
        eventType: 'Sports Game',
        locationName: 'Hebbal Flyover Junction',
        date: todayStr,
        startTime: '16:00',
        endTime: '21:00',
        expectedCrowd: 45000,
        weather: 'Clear'
      };
      setEventForm({ name: iplForm.eventName, location: iplForm.locationName, crowd: iplForm.expectedCrowd, duration: 5, weather: iplForm.weather });

      const iplForecast: TrafficForecastResult = {
        ...iplForm,
        congestionLevel: 'CRITICAL',
        trafficIncreasePct: 78,
        peakCongestionTime: '18:30',
        expectedDelayMins: 45,
        riskScore: 88,
        modelName: 'Traffic Intelligence Engine (Demo)',
        modelVersion: 'v1.0.0-demo',
        inferenceTimeMs: 1.85,
        hourlyTrend: generateHourlyTrend('16:00', '21:00', '18:30', 78, 'Hebbal Flyover Junction'),
        aiRecommendations: generateAIRecommendations('Sports Game', 'Hebbal Flyover Junction', 45000, 'Clear', 45)
      };
      setForecastResult(iplForecast);
      setSelectedCongestedRoute('hebbal');
      setDiversionDeployedRoutes({ 'hebbal': true });
      setPlanDeployed(true);

      const iplIncident: Incident = {
        id: 'EV-DEMO-IPL',
        start_datetime: `${todayStr}T16:00:00+05:30`,
        latitude: 12.9980,
        longitude: 77.5920,
        event_cause: 'public_event',
        description: 'PLANNED EVENT: [IPL Season Derby Match] - Expected: 45k crowd, Clear weather. Heavy Airport corridor spillback.',
        veh_type: 'CAR',
        duration_mins: 300,
        num_lanes: 3,
        risk_level: 'CRITICAL',
        probability_closure: 0.85,
        congestion_score: 88,
        nearest_junction: 'Hebbal Flyover Junction',
        nearest_junction_dist_km: 0.05,
        status: 'PENDING'
      };
      setIncidents([iplIncident, ...initialIncidents]);
    } 
    else if (scenario === 'Political Rally') {
      const rallyForm = {
        eventName: 'Vidhana Soudha Political Protest',
        eventType: 'Rally / Protest',
        locationName: 'Mekhri Circle',
        date: todayStr,
        startTime: '10:00',
        endTime: '14:30',
        expectedCrowd: 35000,
        weather: 'Clear'
      };
      setEventForm({ name: rallyForm.eventName, location: rallyForm.locationName, crowd: rallyForm.expectedCrowd, duration: 4.5, weather: rallyForm.weather });

      const rallyForecast: TrafficForecastResult = {
        ...rallyForm,
        congestionLevel: 'CRITICAL',
        trafficIncreasePct: 82,
        peakCongestionTime: '11:45',
        expectedDelayMins: 52,
        riskScore: 92,
        modelName: 'Traffic Intelligence Engine (Demo)',
        modelVersion: 'v1.0.0-demo',
        inferenceTimeMs: 1.95,
        hourlyTrend: generateHourlyTrend('10:00', '14:30', '11:45', 82, 'Mekhri Circle'),
        aiRecommendations: generateAIRecommendations('Rally / Protest', 'Mekhri Circle', 35000, 'Clear', 52)
      };
      setForecastResult(rallyForecast);
      setSelectedCongestedRoute('hudson-circle');
      setDiversionDeployedRoutes({ 'hudson-circle': true });
      setPlanDeployed(true);

      const rallyIncident: Incident = {
        id: 'EV-DEMO-RALLY',
        start_datetime: `${todayStr}T10:00:00+05:30`,
        latitude: 13.0076,
        longitude: 77.5896,
        event_cause: 'protest',
        description: 'PLANNED EVENT: [Vidhana Soudha Political Protest] - Expected: 35k protestors. Sterile barricading active.',
        veh_type: 'CAR',
        duration_mins: 270,
        num_lanes: 2,
        risk_level: 'CRITICAL',
        probability_closure: 0.90,
        congestion_score: 92,
        nearest_junction: 'Mekhri Circle',
        nearest_junction_dist_km: 0.05,
        status: 'PENDING'
      };
      setIncidents([rallyIncident, ...initialIncidents]);
    }
    else if (scenario === 'Festival') {
      const festivalForm = {
        eventName: 'Ganesh Visarjan Festival Parade',
        eventType: 'Festival / Parade',
        locationName: 'Silk Board Junction',
        date: todayStr,
        startTime: '14:00',
        endTime: '20:00',
        expectedCrowd: 25000,
        weather: 'Rainy'
      };
      setEventForm({ name: festivalForm.eventName, location: festivalForm.locationName, crowd: festivalForm.expectedCrowd, duration: 6, weather: festivalForm.weather });

      const festivalForecast: TrafficForecastResult = {
        ...festivalForm,
        congestionLevel: 'HIGH',
        trafficIncreasePct: 68,
        peakCongestionTime: '17:30',
        expectedDelayMins: 38,
        riskScore: 78,
        modelName: 'Traffic Intelligence Engine (Demo)',
        modelVersion: 'v1.0.0-demo',
        inferenceTimeMs: 1.62,
        hourlyTrend: generateHourlyTrend('14:00', '20:00', '17:30', 68, 'Silk Board Junction'),
        aiRecommendations: generateAIRecommendations('Festival / Parade', 'Silk Board Junction', 25000, 'Rainy', 38)
      };
      setForecastResult(festivalForecast);
      setSelectedCongestedRoute('silk-board');
      setDiversionDeployedRoutes({ 'silk-board': true });
      setPlanDeployed(true);

      const festivalIncident: Incident = {
        id: 'EV-DEMO-FESTIVAL',
        start_datetime: `${todayStr}T14:00:00+05:30`,
        latitude: 12.9176,
        longitude: 77.6244,
        event_cause: 'procession',
        description: 'PLANNED EVENT: [Ganesh Visarjan Festival Parade] - Expected: 25k crowd. Monsoon showers causing waterlogging.',
        veh_type: 'CAR',
        duration_mins: 360,
        num_lanes: 2,
        risk_level: 'HIGH',
        probability_closure: 0.70,
        congestion_score: 78,
        nearest_junction: 'Silk Board Junction',
        nearest_junction_dist_km: 0.05,
        status: 'PENDING'
      };
      setIncidents([festivalIncident, ...initialIncidents]);
    }
    else if (scenario === 'Construction') {
      const constructionForm = {
        eventName: 'Metro Pillar Launching Work',
        eventType: 'Construction',
        locationName: 'KR Puram Hanging Bridge',
        date: todayStr,
        startTime: '22:00',
        endTime: '05:00',
        expectedCrowd: 500,
        weather: 'Clear'
      };
      setEventForm({ name: constructionForm.eventName, location: constructionForm.locationName, crowd: constructionForm.expectedCrowd, duration: 7, weather: constructionForm.weather });

      const constructionForecast: TrafficForecastResult = {
        ...constructionForm,
        congestionLevel: 'MEDIUM',
        trafficIncreasePct: 45,
        peakCongestionTime: '01:00',
        expectedDelayMins: 25,
        riskScore: 68,
        modelName: 'Traffic Intelligence Engine (Demo)',
        modelVersion: 'v1.0.0-demo',
        inferenceTimeMs: 1.55,
        hourlyTrend: generateHourlyTrend('22:00', '05:00', '01:00', 45, 'KR Puram Hanging Bridge'),
        aiRecommendations: generateAIRecommendations('Construction', 'KR Puram Hanging Bridge', 500, 'Clear', 25)
      };
      setForecastResult(constructionForecast);
      setSelectedCongestedRoute('kr-puram');
      setDiversionDeployedRoutes({ 'kr-puram': true });
      setPlanDeployed(true);

      const constructionIncident: Incident = {
        id: 'EV-DEMO-CONSTRUCTION',
        start_datetime: `${todayStr}T22:00:00+05:30`,
        latitude: 13.0000,
        longitude: 77.6750,
        event_cause: 'construction',
        description: 'PLANNED EVENT: [Metro Pillar Launching Work] - Scheduled night shifts. Active solar warning beacons.',
        veh_type: 'CAR',
        duration_mins: 420,
        num_lanes: 2,
        risk_level: 'MEDIUM',
        probability_closure: 0.55,
        congestion_score: 68,
        nearest_junction: 'KR Puram Hanging Bridge',
        nearest_junction_dist_km: 0.05,
        status: 'PENDING'
      };
      setIncidents([constructionIncident, ...initialIncidents]);
    }
  };

  const handleUpdateStatus = (incidentId: string, newStatus: 'PENDING' | 'DISPATCHED' | 'ON_SCENE' | 'RESOLVED', assignedResource?: string) => {
    setIncidents(prev => 
      prev.map(inc => {
        if (inc.id === incidentId) {
          return { 
            ...inc, 
            status: newStatus,
            assigned_resource: assignedResource !== undefined ? assignedResource : inc.assigned_resource
          };
        }
        return inc;
      })
    );

    // Sync with backend / Supabase if it's a citizen report
    if (incidentId.startsWith('CIT-')) {
      fetch(`${API_BASE_URL}/api/citizen-reports/${incidentId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          assigned_resource: assignedResource || null
        })
      }).catch(err => {
        console.error("Failed to sync status update to backend:", err);
      });
    }

    if (selectedIncident && selectedIncident.id === incidentId) {
      setSelectedIncident(prev => prev ? { 
        ...prev, 
        status: newStatus,
        assigned_resource: assignedResource !== undefined ? assignedResource : prev.assigned_resource
      } : null);
    }
  };

  // AI Chat Messages Send

  // PDF Download Trigger
  const handleMarkAllNotificationsRead = () => {
    setTmcNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  
  // Helper values
  const activeIncidentsList = incidents.filter(i => i.status !== 'RESOLVED');



  if (!currentUser) {
    return (
      <React.Suspense fallback={
        <div className="flex items-center justify-center min-h-[400px] text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-xs font-semibold font-mono">Loading App...</span>
          </div>
        </div>
      }>
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </React.Suspense>
    );
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      incidentCount={activeIncidentsList.length}
      activeDemoScenario={activeDemoScenario}
      onSelectDemoScenario={handleSelectDemoScenario}
      onRunSimulation={handleRunSimulation}
      isSimulating={isSimulating}
      globalLang={globalLang}
      setGlobalLang={setGlobalLang}
      operatingMode={operatingMode}
      setOperatingMode={setOperatingMode}
      notifications={tmcNotifications}
      onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
      currentUser={currentUser}
      onLogout={handleLogout}
    >
      {/* ─────────────────────────────────────────────────────────────
          1. TAB: EXECUTIVE DASHBOARD
          ───────────────────────────────────────────────────────────── */}
            <React.Suspense fallback={
        <div className="flex items-center justify-center min-h-[400px] text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-xs font-semibold font-mono">Loading Page...</span>
          </div>
        </div>
      }>
        {activeTab === 'dashboard' && (
          <DashboardPage
            activeIncidentsList={activeIncidentsList}
            forecastResult={forecastResult}
            activeDemoScenario={activeDemoScenario}
            selectedIncident={selectedIncident}
            setSelectedIncident={setSelectedIncident}
            mapLayers={mapLayers}
            setMapLayers={setMapLayers}
            setSelectedHotspot={setSelectedHotspot}
            cameras={cameras}
            weatherData={weatherData}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'prediction' && (
          <PredictionPage
            forecastResult={forecastResult}
            setForecastResult={setForecastResult}
            activeDemoScenario={activeDemoScenario}
            eventForm={eventForm}
            setEventForm={setEventForm}
            isPredicting={isPredicting}
            setIsPredicting={setIsPredicting}
          />
        )}
        {activeTab === 'traffic_analytics' && (
          <TrafficAnalyticsPage />
        )}
        {activeTab === 'cameras' && (
          <CamerasPage
            cameras={cameras}
            setCameras={setCameras}
            setTmcNotifications={setTmcNotifications}
            setIncidents={setIncidents}
          />
        )}
        {activeTab === 'incident_management' && (
          <IncidentManagementPage
            incidents={incidents}
            handleUpdateStatus={handleUpdateStatus}
          />
        )}
        {activeTab === 'citizen_reporting' && (
          <CitizenReportingPage
            incidents={incidents}
            setIncidents={setIncidents}
            weatherData={weatherData}
            setTmcNotifications={setTmcNotifications}
            handleUpdateStatus={handleUpdateStatus}
          />
        )}
        {activeTab === 'citizen_app' && (
          <CitizenAppPage
            weatherData={weatherData}
            setIncidents={setIncidents}
            setTmcNotifications={setTmcNotifications}
            incidents={incidents}
          />
        )}
        {activeTab === 'maps' && (
          <MapsPage
            incidents={incidents}
            selectedIncident={selectedIncident}
            setSelectedIncident={setSelectedIncident}
            selectedHotspot={selectedHotspot}
            setSelectedHotspot={setSelectedHotspot}
            mapLayers={mapLayers}
            setMapLayers={setMapLayers}
            cameras={cameras}
            weatherData={weatherData}
          />
        )}
        {activeTab === 'resources' && (
          <ResourcesPage
            forecastResult={forecastResult}
            planDeployed={planDeployed}
            setPlanDeployed={setPlanDeployed}
            incidents={incidents}
            selectedIncident={selectedIncident}
            setSelectedIncident={setSelectedIncident}
            cameras={cameras}
            weatherData={weatherData}
            setActiveTab={setActiveTab}
          />
        )}
        {(activeTab === 'bbmp_road_issues' || activeTab === 'bbmp_waterlogging' || activeTab === 'bbmp_infrastructure') && (
          <BbmpDashboardPage
            activeTab={activeTab}
            incidents={incidents}
            handleUpdateStatus={handleUpdateStatus}
            weatherData={weatherData}
          />
        )}
        {(activeTab === 'emergency_dispatch' || activeTab === 'emergency_queue') && (
          <EmergencyServicesPage
            activeTab={activeTab}
            incidents={incidents}
            handleUpdateStatus={handleUpdateStatus}
          />
        )}
      </React.Suspense>
      {isSimulating && (
        <SimulationHUD 
          step={simulationStep}
          progress={simProgress}
          paused={simulationPaused}
          onPauseToggle={() => setSimulationPaused(!simulationPaused)}
          onSkip={() => {
            setSimProgress(0);
            if (simulationStep < 6) {
              setSimulationStep(s => s + 1);
            } else {
              // End simulation
              setIsSimulating(false);
              setSimulationStep(1);
              setPlanDeployed(false);
              setForecastResult(null);
              setDiversionDeployedRoutes({});
            }
          }}
          onExit={handleRunSimulation}
        />
      )}

    </Layout>
  );
};

export default App;
