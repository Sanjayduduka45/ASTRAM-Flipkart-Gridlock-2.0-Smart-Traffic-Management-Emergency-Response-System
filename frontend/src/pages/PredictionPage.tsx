import React, { useState } from 'react';
import { 
  Sparkles, 
  Clock, 
  Users, 
  ShieldAlert, 
  Shuffle, 
  Zap, 
  CheckCircle, 
  RefreshCw, 
  Play, 
  AlertTriangle,
  TrendingUp
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { KPICard } from '../components/KPICard';
import { BENGALURU_LOCATIONS } from '../mockData';
import { 
  getSmartResourcePlan, 
  calculateEventRiskScore
} from '../utils/helpers';
import type { TrafficForecastResult } from '../types';

interface EventFormData {
  name: string;
  location: string;
  crowd: number;
  duration: number;
  weather: string;
}

interface PredictionPageProps {
  forecastResult: TrafficForecastResult | null;
  setForecastResult: (res: TrafficForecastResult | null) => void;
  activeDemoScenario: string;
  eventForm: EventFormData;
  setEventForm: React.Dispatch<React.SetStateAction<EventFormData>>;
  isPredicting: boolean;
  setIsPredicting: (predicting: boolean) => void;
}

export const PredictionPage: React.FC<PredictionPageProps> = ({
  forecastResult,
  setForecastResult,
  activeDemoScenario,
  eventForm,
  setEventForm,
  isPredicting,
  setIsPredicting
}) => {
  const [planDeployed, setPlanDeployed] = useState(false);
  const [diversionDeployed, setDiversionDeployed] = useState(false);

  // Auto-sync form if demo scenario is loaded
  React.useEffect(() => {
    if (activeDemoScenario) {
      setEventForm({
        name: `${activeDemoScenario} Operations`,
        location: activeDemoScenario.includes("IPL") ? 'Hebbal Flyover Junction' : 'Silk Board Junction',
        crowd: activeDemoScenario.includes("IPL") ? 45000 : activeDemoScenario.includes("Rally") ? 30000 : 15000,
        duration: activeDemoScenario.includes("IPL") ? 6 : 4,
        weather: activeDemoScenario.includes("Festival") ? 'Rainy' : 'Clear'
      });
    }
  }, [activeDemoScenario, setEventForm]);

  const handlePredict = () => {
    setIsPredicting(true);
    setPlanDeployed(false);
    setDiversionDeployed(false);
    
    setTimeout(() => {
      const risk = calculateEventRiskScore(eventForm.crowd, eventForm.duration * 60, eventForm.location, eventForm.weather);
      
      const newForecast: TrafficForecastResult = {
        eventName: eventForm.name,
        eventType: eventForm.crowd > 25000 ? 'Mega Public Gathering' : 'Public Event',
        locationName: eventForm.location,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        startTime: '16:00',
        endTime: `${16 + eventForm.duration}:00`,
        expectedCrowd: eventForm.crowd,
        weather: eventForm.weather,
        congestionLevel: risk >= 75 ? 'CRITICAL' : risk >= 50 ? 'HIGH' : risk >= 30 ? 'MEDIUM' : 'LOW',
        trafficIncreasePct: Math.round(risk * 0.9),
        peakCongestionTime: `${16 + Math.round(eventForm.duration / 2)}:30`,
        expectedDelayMins: Math.round(risk * 0.5),
        riskScore: risk,
        modelName: 'ASTRAM Risk Prediction Model',
        modelVersion: 'v2.4.1-ViteBuild',
        inferenceTimeMs: 12.8,
        hourlyTrend: Array.from({ length: 8 }, (_, i) => {
          const hour = 14 + i;
          const label = `${hour}:00`;
          const base = 40 + Math.sin(i / 1.5) * 15;
          const predicted = base + (i >= 2 && i <= 6 ? (risk * 0.7) * (1 - Math.abs(i - 4) / 3) : 0);
          return {
            hour: label,
            baseline: Math.round(base),
            predicted: Math.min(100, Math.round(predicted))
          };
        }),
        aiRecommendations: [
          `Deploy smart resource squads at the entry ramps of ${eventForm.location} to manage lane merge conflicts.`,
          `Set early dynamic VMS warning signs 3km prior to ${eventForm.location} to recommend alternative routes.`,
          `Coordinate with ${eventForm.location} traffic division to override automatic signals and allocate 15s extra green time.`
        ]
      };
      
      setForecastResult(newForecast);
      setIsPredicting(false);
    }, 1000);
  };

  const currentPlan = forecastResult
    ? getSmartResourcePlan(forecastResult.locationName, forecastResult.expectedCrowd, 4)
    : getSmartResourcePlan('Hebbal Flyover Junction', 10000, 4);

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Risk Predictor Form & KPI Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Sparkles className="h-4.5 w-4.5 text-blue-600" />
            <h3 className="text-xs font-black uppercase text-slate-800">
              Traffic Impact Checker
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Event Name</label>
              <input
                type="text"
                value={eventForm.name}
                onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                className="form-input"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Primary Location</label>
              <select
                value={eventForm.location}
                onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                className="form-input cursor-pointer"
              >
                {BENGALURU_LOCATIONS.map(loc => (
                  <option key={loc.name} value={loc.name}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expected Crowd</label>
                <input
                  type="number"
                  value={eventForm.crowd}
                  onChange={(e) => setEventForm({ ...eventForm, crowd: parseInt(e.target.value) || 0 })}
                  className="form-input"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duration (Hrs)</label>
                <input
                  type="number"
                  value={eventForm.duration}
                  onChange={(e) => setEventForm({ ...eventForm, duration: parseInt(e.target.value) || 1 })}
                  className="form-input"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Weather Conditions</label>
              <select
                value={eventForm.weather}
                onChange={(e) => setEventForm({ ...eventForm, weather: e.target.value })}
                className="form-input cursor-pointer"
              >
                <option value="Clear">Clear / Dry</option>
                <option value="Rainy">Light Rain</option>
                <option value="Heavy Rain">Heavy Monsoonal Rain</option>
                <option value="Stormy">Severe Storm Alerts</option>
                <option value="Foggy">Morning Fog / Low Visibility</option>
              </select>
            </div>
          </div>

          <button
            onClick={handlePredict}
            disabled={isPredicting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer h-[40px] shadow-sm"
          >
            {isPredicting ? (
              <>
                <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                <span>Running Simulation Models...</span>
              </>
            ) : (
              <>
                <Zap className="h-4.5 w-4.5" />
                <span>Run AI Predictor & Scheduler</span>
              </>
            )}
          </button>
        </div>

        {/* Prediction Results HUD */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          {!forecastResult ? (
            <div className="flex flex-col items-center justify-center text-center h-full min-h-[220px] text-slate-400 space-y-2">
              <AlertTriangle className="h-8 w-8 opacity-40 text-blue-500" />
              <strong className="text-xs">No active event simulation run yet.</strong>
              <p className="text-[11px] max-w-sm">Enter the event details in the predictor form and run scheduling models to see risk metrics and deploy tactical resources.</p>
            </div>
          ) : (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div>
                  <span className="text-[9px] uppercase font-bold text-blue-600 font-mono tracking-wider block">Traffic Forecast Result</span>
                  <h4 className="text-xs font-bold text-slate-800 leading-tight">
                    {forecastResult.eventName} @ {forecastResult.locationName}
                  </h4>
                </div>
                <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider border ${
                  forecastResult.congestionLevel === 'CRITICAL' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                  forecastResult.congestionLevel === 'HIGH' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                  'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                }`}>
                  {forecastResult.congestionLevel} RISK
                </span>
              </div>

              {/* Prediction Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KPICard 
                  title="Risk Score" 
                  value={`${forecastResult.riskScore}%`} 
                  icon={ShieldAlert}
                  subtext={`Model Confidence: 92%`} 
                />
                <KPICard 
                  title="Travel Delay" 
                  value={`+${forecastResult.expectedDelayMins} mins`} 
                  icon={Clock}
                  subtext="Commuter impact" 
                />
                <KPICard 
                  title="Traffic Rise" 
                  value={`+${forecastResult.trafficIncreasePct}%`} 
                  icon={TrendingUp}
                  subtext="Arterial grid increase" 
                />
                <KPICard 
                  title="Peak Jam Time" 
                  value={forecastResult.peakCongestionTime} 
                  icon={Users}
                  subtext="Estimated grid peak" 
                />
              </div>

              {/* Tactical Recommendations */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-150">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Recommended Actions</span>
                <ul className="space-y-1.5 text-xs text-slate-700 font-semibold list-disc list-inside">
                  {forecastResult.aiRecommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reroute & Deployment Schedules */}
      {forecastResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          {/* Recharts Hourly Flow Trend */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Predicted Hourly Flow Intensity Trend
              </h4>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">
                Comparison of typical baseline congestion levels vs. simulated event density
              </p>
            </div>
            
            <div className="h-56 w-full text-xs font-mono font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastResult.hourlyTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBaseline" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" stroke="#64748b" />
                  <YAxis stroke="#64748b" domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderColor: '#e2e8f0',
                      color: '#0f172a' 
                    }} 
                  />
                  <Area type="monotone" dataKey="baseline" name="Baseline Flow" stroke="#94a3b8" fillOpacity={1} fill="url(#colorBaseline)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="predicted" name="Event Simulated Flow" stroke="#3b82f6" fillOpacity={1} fill="url(#colorPredicted)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Smart Staff Dispatch HUD */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Smart Staff Plan
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                AI calculated staff allocation for {forecastResult.locationName} corridor
              </p>
            </div>

            <div className="space-y-2 text-xs">
              {[
                { title: 'Police Patrols', key: 'police', color: 'text-blue-500' },
                { title: 'Steel Barricades', key: 'barricades', color: 'text-amber-500' },
                { title: 'Traffic Marshals', key: 'marshals', color: 'text-emerald-500' },
                { title: 'Emergency Standby', key: 'emergency', color: 'text-rose-500' }
              ].map((item) => {
                const spec = currentPlan[item.key as 'police' | 'barricades' | 'marshals' | 'emergency'];
                return (
                  <div key={item.key} className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1 hover:border-slate-350 transition-colors">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-800">{item.title}</span>
                      <strong className={item.color}>{spec.quantity} {spec.unit}</strong>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal font-medium">{spec.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-150 pt-3 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Estimated Budget</span>
                <strong className="text-sm font-extrabold text-slate-800">
                  ₹{currentPlan.totalCost.toLocaleString()} INR
                </strong>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Asset Utilization</span>
                <strong className="text-sm font-extrabold text-indigo-600">
                  {currentPlan.utilization}%
                </strong>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPlanDeployed(true)}
                disabled={planDeployed}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/40 disabled:text-indigo-500/80 disabled:border-transparent text-white border border-transparent text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 h-[40px] cursor-pointer"
              >
                {planDeployed ? <CheckCircle className="h-4.5 w-4.5 text-emerald-500" /> : <Play className="h-4.5 w-4.5" />}
                <span>{planDeployed ? 'Deployed' : 'Assign Staff'}</span>
              </button>

              <button
                onClick={() => setDiversionDeployed(true)}
                disabled={diversionDeployed}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-800/40 disabled:text-cyan-500/80 disabled:border-transparent text-white border border-transparent text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 h-[40px] cursor-pointer"
              >
                {diversionDeployed ? <CheckCircle className="h-4.5 w-4.5 text-emerald-500" /> : <Shuffle className="h-4.5 w-4.5" />}
                <span>{diversionDeployed ? 'Active' : 'Create Diversion'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PredictionPage;
