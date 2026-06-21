import React, { useState, useMemo } from 'react';
import { 
  Wrench, 
  Droplets, 
  Settings, 
  MapPin, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Search, 
  UserCheck, 
  AlertCircle,
  Truck,
  Wind,
  ShieldCheck
} from 'lucide-react';
import type { Incident, WeatherData } from '../types';

interface BbmpDashboardPageProps {
  activeTab: string;
  incidents: Incident[];
  handleUpdateStatus: (incidentId: string, newStatus: 'PENDING' | 'DISPATCHED' | 'ON_SCENE' | 'RESOLVED', assignedResource?: string) => void;
  weatherData: WeatherData;
}

const BBMP_CREWS = {
  road: [
    { id: 'RC-01', name: 'BBMP Pothole Repair Crew P-1', type: 'Asphalt patching', area: 'Silk Board Area' },
    { id: 'RC-02', name: 'BBMP Debris Clearance Team T-2', type: 'Debris/Tree removal', area: 'Hebbal Corridor' },
    { id: 'RC-03', name: 'BBMP Emergency Road Squad R-3', type: 'General repairs', area: 'KR Puram Corridor' }
  ],
  water: [
    { id: 'WC-01', name: 'BBMP Dewatering Pump Unit D-1', type: 'High-power pump', area: 'Outer Ring Road' },
    { id: 'WC-02', name: 'BBMP Drainage Rescue Team D-2', type: 'Drain clearing', area: 'Koramangala Hub' },
    { id: 'WC-03', name: 'BBMP Flood Response Squad F-3', type: 'Mobile pump & rescue', area: 'Hebbal Area' }
  ],
  infra: [
    { id: 'IC-01', name: 'BBMP Traffic Signal Maintenance Team S-1', type: 'Signal repair', area: 'Majestic Central' },
    { id: 'IC-02', name: 'BBMP Electrical Maintenance Unit E-2', type: 'Street light/Wiring', area: 'Indiranagar Area' },
    { id: 'IC-03', name: 'BBMP Divider & Signage Crew V-3', type: 'Civil maintenance', area: 'Whitefield Area' }
  ]
};

export const BbmpDashboardPage: React.FC<BbmpDashboardPageProps> = ({
  activeTab,
  incidents,
  handleUpdateStatus,
  weatherData
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [dispatchCrewId, setDispatchCrewId] = useState('');

  // Classify active incident categories for BBMP
  const classifiedIncidents = useMemo(() => {
    return incidents.map(inc => {
      const desc = inc.description.toLowerCase();
      const cause = inc.event_cause.toLowerCase();
      
      let category: 'road' | 'water' | 'infra' | 'other' = 'other';
      
      if (
        cause === 'pothole' || 
        cause === 'tree_fall' || 
        cause === 'road_work' || 
        desc.includes('pothole') || 
        desc.includes('tree') || 
        desc.includes('road') || 
        desc.includes('divider')
      ) {
        category = 'road';
      }
      
      if (
        cause === 'water_logging' || 
        cause === 'flooding' || 
        desc.includes('water') || 
        desc.includes('flood') || 
        desc.includes('rain') || 
        desc.includes('logging') ||
        desc.includes('loging') ||
        desc.includes('drain')
      ) {
        category = 'water';
      }
      
      if (
        cause === 'signal_fault' || 
        desc.includes('signal') || 
        desc.includes('light') || 
        desc.includes('electric') || 
        desc.includes('pole') || 
        desc.includes('manhole')
      ) {
        category = 'infra';
      }
      
      return { ...inc, bbmpCategory: category };
    });
  }, [incidents]);

  // Determine current active section from tab
  const currentSection = useMemo<'road' | 'water' | 'infra'>(() => {
    if (activeTab === 'bbmp_waterlogging') return 'water';
    if (activeTab === 'bbmp_infrastructure') return 'infra';
    return 'road';
  }, [activeTab]);

  // Filter lists based on the selected section and search query
  const filteredList = useMemo(() => {
    return classifiedIncidents.filter(inc => {
      if (inc.bbmpCategory !== currentSection) return false;
      if (searchQuery.trim() === '') return true;
      return (
        inc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.nearest_junction.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [classifiedIncidents, currentSection, searchQuery]);

  const selectedIncident = useMemo(() => {
    return incidents.find(i => i.id === selectedIncidentId) || null;
  }, [incidents, selectedIncidentId]);

  // Calculate statistics for the current view
  const stats = useMemo(() => {
    const sectionIncidents = classifiedIncidents.filter(inc => inc.bbmpCategory === currentSection);
    const total = sectionIncidents.length;
    const pending = sectionIncidents.filter(i => i.status === 'PENDING').length;
    const active = sectionIncidents.filter(i => i.status === 'DISPATCHED' || i.status === 'ON_SCENE').length;
    const resolved = sectionIncidents.filter(i => i.status === 'RESOLVED').length;
    
    return { total, pending, active, resolved };
  }, [classifiedIncidents, currentSection]);

  const handleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentId || !dispatchCrewId) return;
    
    const crewName = [
      ...BBMP_CREWS.road,
      ...BBMP_CREWS.water,
      ...BBMP_CREWS.infra
    ].find(c => c.id === dispatchCrewId)?.name || 'BBMP Maintenance Squad';

    handleUpdateStatus(selectedIncidentId, 'DISPATCHED', crewName);
    setDispatchCrewId('');
  };

  const getStatusBadge = (status: Incident['status']) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 border border-rose-200 text-rose-700">Pending</span>;
      case 'DISPATCHED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 border border-blue-200 text-blue-700">Dispatched</span>;
      case 'ON_SCENE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 border border-amber-200 text-amber-700">On Scene</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700">Resolved</span>;
    }
  };

  const getCauseEmoji = (cause: string) => {
    switch (cause.toLowerCase()) {
      case 'pothole': return '🕳️';
      case 'tree_fall': return '🌳';
      case 'water_logging': return '🌧️';
      case 'flooding': return '🌊';
      case 'signal_fault': return '🚦';
      default: return '🚧';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Total Filed Reports</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Awaiting Dispatch</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{stats.pending}</p>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
            <Clock className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Active Crews Deployed</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.active}</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Truck className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Resolved Reports</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.resolved}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Side: Feed List (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <h3 className="text-[14px] font-bold text-slate-900 flex items-center gap-2">
              {currentSection === 'road' && <Wrench className="h-4.5 w-4.5 text-blue-600" />}
              {currentSection === 'water' && <Droplets className="h-4.5 w-4.5 text-blue-600" />}
              {currentSection === 'infra' && <Settings className="h-4.5 w-4.5 text-blue-600" />}
              {currentSection === 'road' && 'Road Infrastructure Issues'}
              {currentSection === 'water' && 'Waterlogging & Flooding Reports'}
              {currentSection === 'infra' && 'Civic Utility & Signal Faults'}
            </h3>
            
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                id="bbmp-search-input"
                aria-label="Search by ID or junction"
                type="text"
                placeholder="Search by ID or junction..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8.5 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>

          <div className="overflow-hidden border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
            {filteredList.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs font-semibold">No reports matching filters</p>
              </div>
            ) : (
              filteredList.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedIncidentId(item.id)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition-all flex items-start gap-4 ${
                    selectedIncidentId === item.id ? 'bg-blue-50/40 border-l-2 border-blue-600 pl-3.5' : ''
                  }`}
                >
                  <span className="text-xl shrink-0 mt-0.5 select-none">{getCauseEmoji(item.event_cause)}</span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-400">#{item.id}</span>
                      {getStatusBadge(item.status)}
                    </div>
                    <p className="text-xs text-slate-800 font-medium leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {item.nearest_junction}
                      </span>
                      <span className="font-bold text-[9px] uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        Risk: {item.risk_level}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Details & Actions (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
          <h3 className="text-[14px] font-bold text-slate-900 border-b border-slate-100 pb-3">
            Investigation & Action Desk
          </h3>

          {!selectedIncident ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 text-center border border-dashed border-slate-200 rounded-lg">
              <UserCheck className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-xs font-semibold">Select a filed complaint from the feed queue to dispatch teams or clear blockages.</p>
            </div>
          ) : (
            <div className="space-y-4 text-left">
              {/* Core summary card */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-black text-slate-500">REPORT #{selectedIncident.id}</span>
                  {getStatusBadge(selectedIncident.status)}
                </div>

                <p className="text-xs text-slate-800 font-bold leading-normal">
                  {selectedIncident.description}
                </p>

                <div className="border-t border-slate-200/60 pt-2.5 space-y-2 text-[11px] font-semibold text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Junction Area</span>
                    <span className="flex items-center gap-1 font-bold text-slate-800">
                      <MapPin className="h-3 w-3" />
                      {selectedIncident.nearest_junction}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Incident Severity</span>
                    <span className={`font-bold ${
                      selectedIncident.risk_level === 'CRITICAL' || selectedIncident.risk_level === 'HIGH' 
                        ? 'text-rose-600' : 'text-slate-700'
                    }`}>
                      {selectedIncident.risk_level}
                    </span>
                  </div>
                  {selectedIncident.assigned_resource && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Assigned Team</span>
                      <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {selectedIncident.assigned_resource}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* BBMP Specific contextual tools */}
              {currentSection === 'water' && (
                <div className="border border-sky-100 bg-sky-50/40 rounded-lg p-3 space-y-2">
                  <span className="text-[10px] font-black uppercase text-sky-750 tracking-wider flex items-center gap-1">
                    <Wind className="h-3.5 w-3.5" /> Environmental Diagnostics
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-650">
                    <div className="bg-white p-2 rounded border border-sky-100">
                      <p className="text-slate-400 font-medium">Local Rainfall</p>
                      <p className="text-slate-850 text-[13px] mt-0.5">{weatherData.rainfall_mm} mm</p>
                    </div>
                    <div className="bg-white p-2 rounded border border-sky-100">
                      <p className="text-slate-400 font-medium">Flood Risk Tier</p>
                      <p className="text-amber-600 text-[13px] mt-0.5">{weatherData.flood_risk}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action: Dispatch Squad Form */}
              {selectedIncident.status !== 'RESOLVED' ? (
                <div className="space-y-3 pt-2">
                  <div className="border border-slate-200/80 rounded-lg p-3 bg-white space-y-3">
                    <label htmlFor="bbmp-crew-select" className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Dispatch Municipal Crews
                    </label>
                    <form onSubmit={handleDispatch} className="space-y-3">
                      <select
                        id="bbmp-crew-select"
                        value={dispatchCrewId}
                        onChange={(e) => setDispatchCrewId(e.target.value)}
                        className="w-full p-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 cursor-pointer"
                        required
                      >
                        <option value="">-- Select Crew to Dispatch --</option>
                        {BBMP_CREWS[currentSection].map(crew => (
                          <option key={crew.id} value={crew.id}>
                            {crew.name} ({crew.type})
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={!dispatchCrewId}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Truck className="h-4 w-4" />
                        <span>Deploy Departmental Crew</span>
                      </button>
                    </form>
                  </div>

                  {/* Complete status update triggers */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateStatus(selectedIncident.id, 'ON_SCENE')}
                      className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-750 font-bold text-xs py-2 rounded-lg transition-colors"
                    >
                      Report Crew On Scene
                    </button>
                    <button
                      onClick={() => {
                        handleUpdateStatus(selectedIncident.id, 'RESOLVED');
                        setSelectedIncidentId(null);
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>Mark Resolved</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-250 text-emerald-800 p-4 rounded-lg text-center flex flex-col items-center justify-center gap-1.5">
                  <CheckCircle className="h-7 w-7 text-emerald-600" />
                  <p className="text-xs font-bold">This civic issue has been resolved.</p>
                  <p className="text-[10px] text-emerald-600">The assigned team has reported repair completion and normal traffic flows have resumed.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
