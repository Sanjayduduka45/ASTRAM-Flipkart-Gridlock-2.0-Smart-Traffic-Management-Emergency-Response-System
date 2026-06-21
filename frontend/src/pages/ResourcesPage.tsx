import React from 'react';
import { ShieldAlert, Zap, Shield, TrendingDown, Activity, MapPin, Briefcase, Users, CheckCircle } from 'lucide-react';
import { getSmartResourcePlan, getJunctionCoordinates } from '../utils/helpers';
import type { Incident, TrafficForecastResult, CameraData, WeatherData } from '../types';

const MapViewer = React.lazy(() => import('../components/MapViewer').then(m => ({ default: m.MapViewer })));

interface ResourcesPageProps {
  forecastResult: TrafficForecastResult | null;
  planDeployed: boolean;
  setPlanDeployed: (deployed: boolean) => void;
  incidents: Incident[];
  selectedIncident: Incident | null;
  setSelectedIncident: (inc: Incident | null) => void;
  cameras: CameraData[];
  weatherData: WeatherData;
  setActiveTab: (tab: string) => void;
}

export const ResourcesPage: React.FC<ResourcesPageProps> = ({
  forecastResult,
  planDeployed,
  setPlanDeployed,
  incidents,
  selectedIncident,
  setSelectedIncident,
  cameras,
  weatherData,
  setActiveTab
}) => {
  const activeEventName = forecastResult?.eventName || "Bangalore Tech Summit";
  const activeEventJunction = forecastResult?.locationName || "Silk Board Junction";
  const activeEventCrowd = forecastResult?.expectedCrowd || 15000;
  const activeEventDate = forecastResult?.date || new Date().toISOString().split('T')[0];
  const activeEventStart = forecastResult?.startTime || "18:00";
  
  const getDurationMins = () => {
    if (!forecastResult) return 240;
    const [sh, sm] = forecastResult.startTime.split(':').map(Number);
    const [eh, em] = forecastResult.endTime.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    return diff || 60;
  };
  const activeEventDurationMins = getDurationMins();
  const durationHours = Math.max(1, Math.round(activeEventDurationMins / 60));
  const resourcePlan = getSmartResourcePlan(activeEventJunction, activeEventCrowd, durationHours);

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header Block */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className={`h-2.5 w-2.5 rounded-full ${planDeployed ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
            <span className={`text-[10px] font-black uppercase tracking-widest ${planDeployed ? 'text-emerald-500' : 'text-slate-400'}`}>
              {planDeployed ? 'Active & Deployed' : 'DRAFT OPERATIONAL PLAN'}
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mt-1 tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-blue-600" />
            Tactical Staff Allocation Console
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Assign, coordinate, and authorize physical field teams for the active planning target: <strong className="text-slate-700">{activeEventName}</strong> ({activeEventJunction}).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 text-center">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Junction Zone</span>
            <strong className="text-xs text-slate-700">{activeEventJunction.split(" Junction")[0]}</strong>
          </div>
          <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 text-center">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Date & Shift</span>
            <strong className="text-xs text-slate-700">{activeEventDate} ({activeEventStart})</strong>
          </div>
        </div>
      </div>

      {/* Row 1: Executive KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Estimated Cost */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-lg">
            <Zap className="h-6 w-6" />
          </div>
          <div className="text-left">
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Estimated Cost</span>
            <strong className="text-xl text-slate-800 font-mono">₹{resourcePlan.totalCost.toLocaleString('en-IN')}</strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">{durationHours} Hours operations @ {resourcePlan.utilization}% load</span>
          </div>
        </div>

        {/* Card 2: Expected Impact */}
        {(() => {
          const impactValue = activeEventCrowd > 25000 ? "Critical Bottlenecks Averted" : activeEventCrowd > 12000 ? "High Flow Efficiency" : "Moderate Congestion Improved";
          const impactDesc = activeEventCrowd > 25000 ? "92% flow efficiency achieved" : activeEventCrowd > 12000 ? "88% flow efficiency achieved" : "85% flow efficiency achieved";
          return (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 text-blue-600 rounded-lg">
                <Shield className="h-6 w-6" />
              </div>
              <div className="text-left">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Expected Impact</span>
                <strong className="text-lg font-extrabold text-slate-850 block truncate max-w-[220px]">{impactValue}</strong>
                <span className="text-[10px] text-slate-500 block mt-0.5">{impactDesc}</span>
              </div>
            </div>
          );
        })()}

        {/* Card 3: Congestion Reduction */}
        {(() => {
          const reductionPct = activeEventCrowd > 25000 ? 55 : activeEventCrowd > 12000 ? 45 : 35;
          const timeSaved = Math.round((forecastResult?.expectedDelayMins || 45) * (reductionPct / 100));
          return (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-rose-500/10 text-rose-600 rounded-lg">
                <TrendingDown className="h-6 w-6" />
              </div>
              <div className="text-left">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Congestion Reduction</span>
                <strong className="text-xl text-rose-500 font-mono">+{reductionPct}% Improved</strong>
                <span className="text-[10px] text-slate-500 block mt-0.5">Saves approx. {timeSaved} mins peak delay</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Row 2: Two-column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
        
        {/* Map Panel (Left, 3/5 width) */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-3 mb-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-blue-600" />
              Interactive Deployment Map
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Recommended positions for officers, barricades, emergency teams, and marshals plotted around {activeEventJunction}.
            </p>
          </div>
          <div className="flex-1 min-h-[460px] relative w-full rounded-lg overflow-hidden border border-slate-150 shadow-inner">
            <React.Suspense fallback={<div className="flex items-center justify-center h-full w-full bg-slate-100 text-xs text-slate-400 font-semibold">Loading map data...</div>}>
              <MapViewer 
                incidents={incidents}
                onSelectIncident={setSelectedIncident}
                selectedIncident={selectedIncident}
                activeLayers={{
                  incidents: true,
                  events: true,
                  congestion: true,
                  closures: false,
                  diversions: true,
                  police: true,
                  barricades: true,
                  emergency: true,
                  marshals: true,
                  heatmap: false,
                  weather: false
                }}
                cameras={cameras}
                weatherData={weatherData}
                centerCoords={getJunctionCoordinates(activeEventJunction)}
              />
            </React.Suspense>
          </div>
        </div>

        {/* Staff Allocation Console (Right, 2/5 width) */}
        <div className="lg:col-span-2 space-y-4 flex flex-col justify-between">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 flex-1">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-blue-600" />
                Staff Allocation Details
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Operational deployment cards mapping details of allocated units.
              </p>
            </div>

            <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
              {/* Police Officers */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 flex items-start gap-3 text-left">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="space-y-1.5 flex-1 text-xs">
                  <div className="flex justify-between items-center">
                    <strong className="text-slate-850">Traffic Officers</strong>
                    <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded font-mono">
                      {planDeployed ? resourcePlan.police.quantity : '0'} / {resourcePlan.police.capacity} Deployed
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-700" 
                      style={{ width: planDeployed ? `${(resourcePlan.police.quantity / resourcePlan.police.capacity) * 100}%` : '0%' }}
                    />
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-normal">{resourcePlan.police.description}</p>
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-100">
                    <span>Rate: ₹{resourcePlan.police.costPerHour}/hr</span>
                    <strong className="text-slate-600">Total: ₹{(resourcePlan.police.quantity * resourcePlan.police.costPerHour * durationHours).toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>

              {/* Barricades */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 flex items-start gap-3 text-left">
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                  <Activity className="h-5 w-5" />
                </div>
                <div className="space-y-1.5 flex-1 text-xs">
                  <div className="flex justify-between items-center">
                    <strong className="text-slate-855">Barricades</strong>
                    <span className="text-[10px] text-amber-650 font-bold bg-amber-50 px-2 py-0.5 rounded font-mono">
                      {planDeployed ? resourcePlan.barricades.quantity : '0'} / {resourcePlan.barricades.capacity} Placed
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-500 transition-all duration-700" 
                      style={{ width: planDeployed ? `${(resourcePlan.barricades.quantity / resourcePlan.barricades.capacity) * 100}%` : '0%' }}
                    />
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-normal">{resourcePlan.barricades.description}</p>
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-100">
                    <span>Rate: ₹{resourcePlan.barricades.costPerHour}/hr</span>
                    <strong className="text-slate-600">Total: ₹{(resourcePlan.barricades.quantity * resourcePlan.barricades.costPerHour * durationHours).toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>

              {/* Emergency Teams */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-155 flex items-start gap-3 text-left">
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg shrink-0">
                  <Zap className="h-5 w-5" />
                </div>
                <div className="space-y-1.5 flex-1 text-xs">
                  <div className="flex justify-between items-center">
                    <strong className="text-slate-850">Emergency Teams</strong>
                    <span className="text-[10px] text-purple-655 font-bold bg-purple-50 px-2 py-0.5 rounded font-mono">
                      {planDeployed ? resourcePlan.emergency.quantity : '0'} / {resourcePlan.emergency.capacity} Active
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 transition-all duration-700" 
                      style={{ width: planDeployed ? `${(resourcePlan.emergency.quantity / resourcePlan.emergency.capacity) * 100}%` : '0%' }}
                    />
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-normal">{resourcePlan.emergency.description}</p>
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-100">
                    <span>Rate: ₹{resourcePlan.emergency.costPerHour}/hr</span>
                    <strong className="text-slate-600 font-bold">Total: ₹{(resourcePlan.emergency.quantity * resourcePlan.emergency.costPerHour * durationHours).toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>

              {/* Marshals */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 flex items-start gap-3 text-left">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div className="space-y-1.5 flex-1 text-xs">
                  <div className="flex justify-between items-center">
                    <strong className="text-slate-850">Traffic Marshals</strong>
                    <span className="text-[10px] text-emerald-650 font-bold bg-emerald-50 px-2 py-0.5 rounded font-mono">
                      {planDeployed ? resourcePlan.marshals.quantity : '0'} / {resourcePlan.marshals.capacity} Assigned
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-700" 
                      style={{ width: planDeployed ? `${(resourcePlan.marshals.quantity / resourcePlan.marshals.capacity) * 100}%` : '0%' }}
                    />
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-normal">{resourcePlan.marshals.description}</p>
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-100">
                    <span>Rate: ₹{resourcePlan.marshals.costPerHour}/hr</span>
                    <strong className="text-slate-600">Total: ₹{(resourcePlan.marshals.quantity * resourcePlan.marshals.costPerHour * durationHours).toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Plan Authorization and CTAs Console (Footer) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="text-left space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Operational Authorization Status</span>
            {planDeployed ? (
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold leading-relaxed animate-fade-in">
                <CheckCircle className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                <span>TACTICAL PLAN LIVE: Staff assigned to the field. Detours and checkpoints active.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-650 text-xs leading-relaxed text-left font-semibold">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span>DRAFT STATE: Allocation plan pending authorization. Review deployment before going live.</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => setActiveTab('prediction')}
              className="flex-1 md:flex-none px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Modify Plan
            </button>
            <button
              onClick={() => setPlanDeployed(!planDeployed)}
              className={`flex-1 md:flex-none px-6 py-3 rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                planDeployed
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-fade-in'
                  : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-98'
              }`}
            >
              {planDeployed ? (
                <>
                  <CheckCircle className="h-4.5 w-4.5" />
                  <span>✓ Tactical Plan Live</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4.5 w-4.5" />
                  <span>Approve Deployment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourcesPage;
