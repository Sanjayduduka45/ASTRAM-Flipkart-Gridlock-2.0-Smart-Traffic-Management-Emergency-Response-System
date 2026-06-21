import React, { useState, useEffect, useMemo } from 'react';
import { 
  Siren, 
  MapPin, 
  CheckCircle, 
  AlertTriangle, 
  Search, 
  Navigation,
  ShieldAlert,
  Flame,
  Activity,
  PlusCircle
} from 'lucide-react';
import type { Incident } from '../types';

interface EmergencyServicesPageProps {
  activeTab: string;
  incidents: Incident[];
  handleUpdateStatus: (incidentId: string, newStatus: 'PENDING' | 'DISPATCHED' | 'ON_SCENE' | 'RESOLVED', assignedResource?: string) => void;
}

interface GreenCorridor {
  id: string;
  source: string;
  destination: string;
  vehicle: string;
  priority: 'CRITICAL' | 'HIGH';
  secondsRemaining: number;
  status: 'ACTIVE' | 'EXPIRED';
}

const EMERGENCY_VEHICLES = [
  { id: 'EV-01', name: 'Cardiac Care Ambulance AM-09 (Victoria Hosp Base)', type: 'Ambulance' },
  { id: 'EV-02', name: 'Trauma Response Ambulance AM-14 (St. Johns)', type: 'Ambulance' },
  { id: 'EV-03', name: 'KSP Rapid Patrol Interceptor P-24 (ORR)', type: 'Police Patrol' },
  { id: 'EV-04', name: 'SDRF Rescue Unit S-2 (Domlur HQ)', type: 'Rescue Vehicle' },
  { id: 'EV-05', name: 'Fire Engine Unit F-12 (Hebbal Station)', type: 'Fire Brigade' }
];

const JUNCTIONS = [
  'Silk Board Junction',
  'Hebbal Flyover Junction',
  'KR Puram Hanging Bridge',
  'Majestic Central Hub',
  'ITPL Main Road (Whitefield)',
  'Electronic City Phase 1 Toll',
  'Marathahalli Bridge Junction',
  'Bellandur ORR Crossing',
  'Indiranagar 100 Feet Rd Junction'
];

export const EmergencyServicesPage: React.FC<EmergencyServicesPageProps> = ({
  activeTab,
  incidents,
  handleUpdateStatus
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [assignVehicleId, setAssignVehicleId] = useState('');

  // Green Corridor Form State
  const [corridorSource, setCorridorSource] = useState(JUNCTIONS[0]);
  const [corridorDest, setCorridorDest] = useState(JUNCTIONS[1]);
  const [corridorVehicle, setCorridorVehicle] = useState(EMERGENCY_VEHICLES[0].name);
  const [corridorPriority, setCorridorPriority] = useState<'CRITICAL' | 'HIGH'>('HIGH');
  const [corridors, setCorridors] = useState<GreenCorridor[]>([
    {
      id: 'COR-702',
      source: 'Hebbal Flyover Junction',
      destination: 'Columbia Asia Hospital',
      vehicle: 'Trauma Response Ambulance AM-14',
      priority: 'CRITICAL',
      secondsRemaining: 185,
      status: 'ACTIVE'
    }
  ]);
  const [showToast, setShowToast] = useState(false);

  // Active Green Corridor Countdown Timer Loop
  useEffect(() => {
    const interval = setInterval(() => {
      setCorridors(prev => 
        prev.map(c => {
          if (c.secondsRemaining > 0 && c.status === 'ACTIVE') {
            const nextSec = c.secondsRemaining - 1;
            return {
              ...c,
              secondsRemaining: nextSec,
              status: nextSec === 0 ? 'EXPIRED' : 'ACTIVE'
            };
          }
          return c;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleCreateCorridor = (e: React.FormEvent) => {
    e.preventDefault();
    if (corridorSource === corridorDest) {
      alert('Source and destination cannot be the same junction.');
      return;
    }

    const newCorridor: GreenCorridor = {
      id: `COR-${Math.floor(100 + Math.random() * 900)}`,
      source: corridorSource,
      destination: corridorDest,
      vehicle: corridorVehicle,
      priority: corridorPriority,
      secondsRemaining: 300, // 5 minutes countdown
      status: 'ACTIVE'
    };

    setCorridors([newCorridor, ...corridors]);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);

    // Automatically trigger dispatch log in notification log or alert
    // Find matching incident to link if possible
    const matchingIncident = incidents.find(
      i => i.status !== 'RESOLVED' && 
      i.nearest_junction === corridorSource && 
      (i.risk_level === 'CRITICAL' || i.risk_level === 'HIGH')
    );
    if (matchingIncident) {
      handleUpdateStatus(matchingIncident.id, 'DISPATCHED', corridorVehicle);
    }
  };

  // Filter high severity incidents
  const emergencyIncidents = useMemo(() => {
    return incidents.filter(i => {
      const isHighPriority = i.risk_level === 'CRITICAL' || i.risk_level === 'HIGH';
      const isUnresolved = i.status !== 'RESOLVED';
      const matchesSearch = searchQuery === '' || 
        i.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.nearest_junction.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.id.toLowerCase().includes(searchQuery.toLowerCase());
      return isHighPriority && isUnresolved && matchesSearch;
    });
  }, [incidents, searchQuery]);

  const selectedIncident = useMemo(() => {
    return incidents.find(i => i.id === selectedIncidentId) || null;
  }, [incidents, selectedIncidentId]);

  const handleVehicleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentId || !assignVehicleId) return;

    const vehicleName = EMERGENCY_VEHICLES.find(v => v.id === assignVehicleId)?.name || 'Emergency Squad';
    handleUpdateStatus(selectedIncidentId, 'DISPATCHED', vehicleName);
    setAssignVehicleId('');
  };

  // Stats summaries
  const totalCriticalCount = incidents.filter(i => i.status !== 'RESOLVED' && i.risk_level === 'CRITICAL').length;
  const totalHighCount = incidents.filter(i => i.status !== 'RESOLVED' && i.risk_level === 'HIGH').length;
  const activeCorridorsCount = corridors.filter(c => c.status === 'ACTIVE').length;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getRiskColor = (risk: string) => {
    if (risk === 'CRITICAL') return 'text-rose-600 bg-rose-50 border-rose-200';
    return 'text-orange-600 bg-orange-50 border-orange-200';
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-5 right-5 bg-slate-900 border border-slate-700 text-white rounded-xl p-4 shadow-2xl z-[9999] flex items-center gap-3 animate-slide-in">
          <Navigation className="h-5 w-5 text-emerald-400 animate-pulse" />
          <div>
            <p className="text-xs font-bold">Green Corridor Activated</p>
            <p className="text-[10px] text-slate-400">Signal sequence prioritized for dispatched emergency unit.</p>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Critical Incidents</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{totalCriticalCount}</p>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
            <Flame className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-450 tracking-wider">High Risk Events</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{totalHighCount}</p>
          </div>
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Active Green Corridors</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCorridorsCount}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Navigation className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Standby Emergency Assets</p>
            <p className="text-2xl font-bold text-slate-700 mt-1">{EMERGENCY_VEHICLES.length}</p>
          </div>
          <div className="p-3 bg-slate-50 text-slate-650 rounded-lg">
            <Activity className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Main page toggle grids */}
      {activeTab === 'emergency_dispatch' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Dispatch Config Panel (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-[14px] font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <PlusCircle className="h-4.5 w-4.5 text-blue-600" />
              Configure Green Corridor
            </h3>

            <form onSubmit={handleCreateCorridor} className="space-y-4 text-left">
              {/* Emergency Asset selection */}
              <div>
                <label htmlFor="emergency-asset-select" className="block text-[11px] font-black uppercase text-slate-500 mb-1.5 tracking-wider">
                  Emergency Asset to Dispatch
                </label>
                <select
                  id="emergency-asset-select"
                  value={corridorVehicle}
                  onChange={(e) => setCorridorVehicle(e.target.value)}
                  className="w-full p-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 cursor-pointer"
                  required
                >
                  {EMERGENCY_VEHICLES.map(v => (
                    <option key={v.id} value={v.name}>{v.name}</option>
                  ))}
                </select>
              </div>

              {/* Source Junction selection */}
              <div>
                <label htmlFor="emergency-origin-select" className="block text-[11px] font-black uppercase text-slate-500 mb-1.5 tracking-wider">
                  Origin Dispatch Junction
                </label>
                <select
                  id="emergency-origin-select"
                  value={corridorSource}
                  onChange={(e) => setCorridorSource(e.target.value)}
                  className="w-full p-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 cursor-pointer"
                  required
                >
                  {JUNCTIONS.map(j => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </div>

              {/* Dest Junction selection */}
              <div>
                <label htmlFor="emergency-dest-select" className="block text-[11px] font-black uppercase text-slate-500 mb-1.5 tracking-wider">
                  Destination Corridor Junction / Medical Facility
                </label>
                <select
                  id="emergency-dest-select"
                  value={corridorDest}
                  onChange={(e) => setCorridorDest(e.target.value)}
                  className="w-full p-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 cursor-pointer"
                  required
                >
                  <option value="Columbia Asia Hospital">🏥 Columbia Asia Hospital, Hebbal</option>
                  <option value="St. Johns Medical College">🏥 St. John's Medical College Hospital</option>
                  <option value="Victoria Hospital">🏥 Victoria Hospital, Majestic</option>
                  {JUNCTIONS.map(j => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </div>

              {/* Priority Select */}
              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1.5 tracking-wider">
                  Dispatch Priority Level
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      checked={corridorPriority === 'CRITICAL'}
                      onChange={() => setCorridorPriority('CRITICAL')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span>🔴 Critical / Code-Red</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      checked={corridorPriority === 'HIGH'}
                      onChange={() => setCorridorPriority('HIGH')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span>🟡 High / Code-Amber</span>
                  </label>
                </div>
              </div>

              {/* Dispatch trigger */}
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10"
              >
                <Siren className="h-4.5 w-4.5" />
                <span>Establish Active Green Corridor</span>
              </button>
            </form>
          </div>

          {/* Active Corridor list (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-[14px] font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Navigation className="h-4.5 w-4.5 text-blue-600" />
              Active Signal Preemption & Corridor Tracking
            </h3>

            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {corridors.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 text-center border border-dashed border-slate-200 rounded-lg">
                  <ShieldAlert className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-xs font-semibold">No active corridors established.</p>
                </div>
              ) : (
                corridors.map(c => (
                  <div 
                    key={c.id} 
                    className={`border rounded-lg p-4 transition-all relative flex flex-col sm:flex-row justify-between gap-3 text-left ${
                      c.status === 'EXPIRED' 
                        ? 'bg-slate-50 border-slate-200 opacity-60' 
                        : 'bg-emerald-50/20 border-emerald-150 shadow-sm shadow-emerald-500/5'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-black text-slate-400">ID: {c.id}</span>
                        <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black tracking-wider border ${
                          c.priority === 'CRITICAL' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {c.priority} Priority
                        </span>
                      </div>
                      
                      <div className="text-xs text-slate-800 font-bold flex flex-wrap items-center gap-1">
                        <span>{c.source}</span>
                        <span className="text-slate-400">➜</span>
                        <span>{c.destination}</span>
                      </div>

                      <p className="text-[10px] text-slate-500 font-semibold">
                        Assigned Unit: <span className="text-slate-700 font-bold">{c.vehicle}</span>
                      </p>
                    </div>

                    <div className="flex flex-col justify-center items-end shrink-0 gap-1.5">
                      {c.status === 'ACTIVE' ? (
                        <>
                          <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
                            <span className="flex h-1.5 w-1.5 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs font-mono font-bold tracking-widest bg-emerald-100 px-2.5 py-1 rounded">
                              {formatTimer(c.secondsRemaining)}
                            </span>
                          </div>
                          <span className="text-[9px] uppercase tracking-wider font-extrabold text-emerald-600">Signal Priority Preempt</span>
                        </>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-bold text-slate-500 flex items-center gap-1 bg-slate-200 px-2 py-0.5 rounded">
                            <CheckCircle className="h-3.5 w-3.5" /> Completed
                          </span>
                          <span className="text-[9px] text-slate-400">Sequence completed</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Incident Queue Section (activeTab === 'emergency_queue') */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Incident Feed List (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <h3 className="text-[14px] font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-4.5 w-4.5 text-rose-600" />
                Critical & High-Severity Emergency Dispatch Queue
              </h3>

              <div className="relative w-full sm:w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  id="emergency-search-input"
                  aria-label="Search emergency queue"
                  type="text"
                  placeholder="Search emergency queue..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8.5 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                />
              </div>
            </div>

            <div className="overflow-hidden border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {emergencyIncidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <CheckCircle className="h-8 w-8 mb-2 opacity-30 text-emerald-500" />
                  <p className="text-xs font-semibold">Emergency queue is empty. Good job!</p>
                </div>
              ) : (
                emergencyIncidents.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedIncidentId(item.id)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-all flex items-start gap-4 ${
                      selectedIncidentId === item.id ? 'bg-rose-50/20 border-l-2 border-rose-600 pl-3.5' : ''
                    }`}
                  >
                    <span className="text-xl shrink-0 mt-0.5 select-none">🚨</span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400">#{item.id}</span>
                        <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black tracking-wider border ${getRiskColor(item.risk_level)}`}>
                          {item.risk_level}
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 font-bold leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {item.nearest_junction}
                        </span>
                        <span className="font-bold text-[9px] uppercase bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100">
                          Status: {item.status}
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Incident details & vehicle deployment actions (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
            <h3 className="text-[14px] font-bold text-slate-900 border-b border-slate-100 pb-3">
              Emergency Dispatch Action Desk
            </h3>

            {!selectedIncident ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 text-center border border-dashed border-slate-200 rounded-lg">
                <Siren className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-xs font-semibold">Select an incident from the queue to dispatch response vehicles or update status.</p>
              </div>
            ) : (
              <div className="space-y-4 text-left">
                {/* Details summary */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-black text-slate-500">INCIDENT #{selectedIncident.id}</span>
                    <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black tracking-wider border ${getRiskColor(selectedIncident.risk_level)}`}>
                      {selectedIncident.risk_level}
                    </span>
                  </div>

                  <p className="text-xs text-slate-800 font-black leading-normal">
                    {selectedIncident.description}
                  </p>

                  <div className="border-t border-slate-200/60 pt-2.5 space-y-2 text-[11px] font-semibold text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Junction Area</span>
                      <span className="flex items-center gap-1 font-bold text-slate-850">
                        <MapPin className="h-3 w-3" />
                        {selectedIncident.nearest_junction}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Vehicle Affected</span>
                      <span className="font-bold text-slate-800">{selectedIncident.veh_type || 'Multiple'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Estimated Delay</span>
                      <span className="font-bold text-rose-600">+{selectedIncident.congestion_score} Congestion Pct</span>
                    </div>
                    {selectedIncident.assigned_resource && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Dispatched Squad</span>
                        <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {selectedIncident.assigned_resource}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dispatch actions form */}
                {selectedIncident.status !== 'RESOLVED' ? (
                  <div className="space-y-3 pt-2">
                    <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-3">
                      <label htmlFor="emergency-vehicle-select" className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        Dispatch Emergency Services
                      </label>
                      <form onSubmit={handleVehicleDispatch} className="space-y-3">
                        <select
                          id="emergency-vehicle-select"
                          value={assignVehicleId}
                          onChange={(e) => setAssignVehicleId(e.target.value)}
                          className="w-full p-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 cursor-pointer"
                          required
                        >
                          <option value="">-- Select Response Vehicle --</option>
                          {EMERGENCY_VEHICLES.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          disabled={!assignVehicleId}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <Siren className="h-4 w-4" />
                          <span>Dispatch Selected Vehicle</span>
                        </button>
                      </form>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'ON_SCENE')}
                        className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-750 font-bold text-xs py-2 rounded-lg transition-colors"
                      >
                        Report Squad On Scene
                      </button>
                      <button
                        onClick={() => {
                          handleUpdateStatus(selectedIncident.id, 'RESOLVED');
                          setSelectedIncidentId(null);
                        }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span>Mark Resolved</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-250 text-emerald-800 p-4 rounded-lg text-center flex flex-col items-center justify-center gap-1.5">
                    <CheckCircle className="h-7 w-7 text-emerald-600" />
                    <p className="text-xs font-bold">This emergency event has been resolved.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
