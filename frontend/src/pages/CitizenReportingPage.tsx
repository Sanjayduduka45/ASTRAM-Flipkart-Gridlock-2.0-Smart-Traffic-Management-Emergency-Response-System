import React, { useState, useMemo } from 'react';
import { 
  Megaphone, 
  Siren, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  FileText,
  MapPin,
  Upload,
  X,
  Search,
  AlertTriangle,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { getNearestPoliceStation } from '../utils/helpers';
import type { Incident, WeatherData } from '../types';
import type { TMCNotification } from '../components/Layout';

interface CitizenReportingPageProps {
  incidents: Incident[];
  setIncidents: React.Dispatch<React.SetStateAction<Incident[]>>;
  weatherData: WeatherData;
  setTmcNotifications: React.Dispatch<React.SetStateAction<TMCNotification[]>>;
  handleUpdateStatus: (incidentId: string, newStatus: 'PENDING' | 'DISPATCHED' | 'ON_SCENE' | 'RESOLVED', assignedResource?: string) => void;
}

const JUNCTIONS = [
  'Silk Board Junction',
  'Hebbal Flyover Junction',
  'KR Puram Hanging Bridge',
  'Majestic Central Hub',
  'ITPL Main Road (Whitefield)',
  'Electronic City Phase 1 Toll',
  'Marathahalli Bridge Junction',
  'Bellandur ORR Crossing',
  'Indiranagar 100 Feet Rd Junction',
  'Koramangala Water Tank Junction',
  'Mekhri Circle',
  'Yeshwanthpur Circle',
  'Town Hall Circle',
  'Hudson Circle'
];

const REPORT_TYPES = [
  { value: 'Accident', label: 'Accident / Collision', emoji: '🚨' },
  { value: 'Waterlogging', label: 'Waterlogging / Flooding', emoji: '🌧️' },
  { value: 'Breakdown', label: 'Vehicle Breakdown', emoji: '🚙' },
  { value: 'Tree Fall', label: 'Tree Fall / Obstruction', emoji: '🌳' },
  { value: 'Signal Fault', label: 'Signal Malfunction', emoji: '🚦' },
  { value: 'Pothole', label: 'Pothole / Road Damage', emoji: '🕳️' },
];

const SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Low', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'MEDIUM', label: 'Medium', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  { value: 'HIGH', label: 'High', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: 'CRITICAL', label: 'Critical', color: 'text-rose-600 bg-rose-50 border-rose-200' },
];

const getRelativeTime = (isoString: string, now: number) => {
  const diffMins = Math.floor((now - new Date(isoString).getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

const generateCitizenIncident = (
  category: string,
  junction: string,
  description: string,
  severity: string
): Incident => {
  const riskMap: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
    'LOW': 'LOW', 'MEDIUM': 'MEDIUM', 'HIGH': 'HIGH', 'CRITICAL': 'CRITICAL'
  };
  return {
    id: `CIT-${Date.now().toString().slice(-4)}`,
    start_datetime: new Date().toISOString(),
    latitude: 12.9716 + (Math.random() - 0.5) * 0.05,
    longitude: 77.5946 + (Math.random() - 0.5) * 0.05,
    event_cause: category.toLowerCase(),
    description: `CITIZEN REPORT: ${description}`,
    veh_type: 'CAR',
    duration_mins: 120,
    num_lanes: 1,
    risk_level: riskMap[severity] || 'MEDIUM',
    probability_closure: severity === 'CRITICAL' ? 0.7 : 0.35,
    congestion_score: severity === 'CRITICAL' ? 75 : 45,
    nearest_junction: junction,
    nearest_junction_dist_km: 0.1,
    status: 'PENDING'
  };
};

const generateNotification = (category: string, description: string, severity: string): TMCNotification => {
  return {
    id: `notif-${Date.now()}`,
    type: 'report',
    title: `New Citizen Report: ${category}`,
    body: description,
    timestamp: new Date().toISOString(),
    read: false,
    severity: severity === 'CRITICAL' ? 'critical' : severity === 'HIGH' ? 'high' : 'medium'
  };
};

export const CitizenReportingPage: React.FC<CitizenReportingPageProps> = ({
  incidents,
  setIncidents,
  setTmcNotifications,
  handleUpdateStatus
}) => {
  const [now] = useState(() => Date.now());
  // Report form state
  const [reportForm, setReportForm] = useState({
    category: 'Accident',
    nearest_junction: 'Silk Board Junction',
    description: '',
    severity: 'MEDIUM',
    photoAttached: false
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Selected report for detail view
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // All citizen reports
  const citizenReports = useMemo(() => incidents.filter(inc => inc.id.startsWith('CIT-')), [incidents]);
  
  // Filtered reports
  const filteredReports = useMemo(() => {
    return citizenReports.filter(r => {
      const matchesSearch = searchQuery === '' || 
        r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.nearest_junction.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [citizenReports, searchQuery, statusFilter]);

  const selectedReport = selectedReportId ? incidents.find(i => i.id === selectedReportId) : null;

  // Statistics
  const stats = useMemo(() => {
    const open = citizenReports.filter(r => r.status !== 'RESOLVED').length;
    const resolved = citizenReports.filter(r => r.status === 'RESOLVED').length;
    const highPriority = citizenReports.filter(r => r.risk_level === 'HIGH' || r.risk_level === 'CRITICAL').length;
    const today = citizenReports.filter(r => {
      const d = new Date(r.start_datetime);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    return { open, resolved, highPriority, today };
  }, [citizenReports]);

  // Removed old getRelativeTime from here to keep render pure

  const getTypeBadge = (cause: string) => {
    const c = cause.toLowerCase();
    if (c.includes('accident') || c.includes('collision')) return { text: 'Accident', color: 'text-rose-600 bg-rose-50 border-rose-200' };
    if (c.includes('water') || c.includes('flood')) return { text: 'Waterlogging', color: 'text-sky-600 bg-sky-50 border-sky-200' };
    if (c.includes('breakdown')) return { text: 'Breakdown', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' };
    if (c.includes('tree')) return { text: 'Tree Fall', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
    if (c.includes('signal')) return { text: 'Signal Fault', color: 'text-violet-600 bg-violet-50 border-violet-200' };
    if (c.includes('pothole')) return { text: 'Pothole', color: 'text-amber-600 bg-amber-50 border-amber-200' };
    return { text: 'Other', color: 'text-slate-600 bg-slate-50 border-slate-200' };
  };

  const statusColors: Record<string, string> = {
    PENDING: 'text-rose-600 bg-rose-50 border-rose-200',
    DISPATCHED: 'text-blue-600 bg-blue-50 border-blue-200',
    ON_SCENE: 'text-amber-600 bg-amber-50 border-amber-200',
    RESOLVED: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  };

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportForm.description.trim()) return;

    const newIncident = generateCitizenIncident(
      reportForm.category,
      reportForm.nearest_junction,
      reportForm.description,
      reportForm.severity
    );
    setIncidents(prev => [newIncident, ...prev]);

    const newNotif = generateNotification(
      reportForm.category,
      reportForm.description,
      reportForm.severity
    );
    setTmcNotifications(prev => [newNotif, ...prev]);

    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    handleClearForm();
  };

  const handleClearForm = () => {
    setReportForm({
      category: 'Accident',
      nearest_junction: 'Silk Board Junction',
      description: '',
      severity: 'MEDIUM',
      photoAttached: false
    });
  };

  return (
    <div className="animate-fade-in text-left space-y-5">

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[5000] bg-emerald-600 text-white font-sans text-xs font-bold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-500">
          <CheckCircle className="h-4 w-4" />
          Report submitted successfully. Dispatch team has been alerted!
        </div>
      )}

      {/* ── Top Statistics Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open Reports</span>
            <div className="p-1.5 bg-rose-50 rounded-lg"><AlertCircle className="h-4 w-4 text-rose-500" /></div>
          </div>
          <span className="text-2xl font-black text-slate-900">{stats.open}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Awaiting resolution</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resolved</span>
            <div className="p-1.5 bg-emerald-50 rounded-lg"><CheckCircle className="h-4 w-4 text-emerald-500" /></div>
          </div>
          <span className="text-2xl font-black text-slate-900">{stats.resolved}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Cases closed</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">High Priority</span>
            <div className="p-1.5 bg-amber-50 rounded-lg"><AlertTriangle className="h-4 w-4 text-amber-500" /></div>
          </div>
          <span className="text-2xl font-black text-slate-900">{stats.highPriority}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Urgent attention needed</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reports Today</span>
            <div className="p-1.5 bg-blue-50 rounded-lg"><TrendingUp className="h-4 w-4 text-blue-500" /></div>
          </div>
          <span className="text-2xl font-black text-slate-900">{stats.today}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Received today</span>
        </div>
      </div>

      {/* ── Main Content: Feed + Form/Details ────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* LEFT: Citizen Reports Feed (2/3) */}
        <div className="xl:col-span-2 space-y-4">
          {/* Feed Header */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-blue-600" />
                  Citizen Reports Feed
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Incoming public complaints · Verification queue · Status tracking
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-600 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="DISPATCHED">Dispatched</option>
                  <option value="ON_SCENE">On Scene</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute top-1/2 -translate-y-1/2 left-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search reports..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none w-[180px]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Reports List */}
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {filteredReports.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center min-h-[200px]">
                <FileText className="h-10 w-10 text-slate-300 mb-3" />
                <strong className="text-sm text-slate-600">No Reports Found</strong>
                <p className="text-[11px] text-slate-400 mt-1 max-w-md">
                  {citizenReports.length === 0
                    ? 'No citizen reports have been submitted yet. Use the form on the right to submit a test report.'
                    : 'No reports match your current search and filter criteria.'}
                </p>
              </div>
            ) : (
              filteredReports.map(inc => {
                const badge = getTypeBadge(inc.event_cause);
                const nearestPS = getNearestPoliceStation(inc.latitude, inc.longitude);
                const isSelected = selectedReportId === inc.id;
                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedReportId(inc.id)}
                    className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? 'border-blue-300 ring-1 ring-blue-200 bg-blue-50/30' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[9px] font-bold text-slate-400">{inc.id}</span>
                          <span className={`px-1.5 py-0.5 rounded border text-[8.5px] font-black uppercase tracking-wider ${statusColors[inc.status]}`}>
                            {inc.status.replace('_', ' ')}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded border text-[8.5px] font-bold ${badge.color}`}>
                            {badge.text}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 truncate">{inc.nearest_junction}</h4>
                        <p className="text-xs text-slate-500 line-clamp-2">{inc.description}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">{getRelativeTime(inc.start_datetime, now)}</span>
                    </div>
                    <div className="border-t border-slate-100 mt-3 pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 text-[9.5px] block">Response Hub</span>
                        <strong className="text-slate-700">{inc.assigned_resource || nearestPS.name}</strong>
                        <span className="text-[9.5px] text-blue-500 font-mono font-bold ml-1">({nearestPS.distance} km)</span>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {inc.status === 'PENDING' && (
                          <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(inc.id, 'DISPATCHED', nearestPS.name); }}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 text-[10px]">
                            <Siren className="h-3 w-3" /> Dispatch
                          </button>
                        )}
                        {inc.status === 'DISPATCHED' && (
                          <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(inc.id, 'ON_SCENE'); }}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 text-[10px]">
                            <Clock className="h-3 w-3" /> On Scene
                          </button>
                        )}
                        {inc.status === 'ON_SCENE' && (
                          <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(inc.id, 'RESOLVED'); }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 text-[10px]">
                            <CheckCircle className="h-3 w-3" /> Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Report Form + Selected Details (1/3) */}
        <div className="xl:col-span-1 space-y-4">

          {/* Selected Report Detail Panel */}
          {selectedReport && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-blue-600" /> Report Details
                </h4>
                <button onClick={() => setSelectedReportId(null)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-400 font-medium">Report ID</span>
                  <span className="font-mono font-bold text-slate-700">{selectedReport.id}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-400 font-medium">Type</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${getTypeBadge(selectedReport.event_cause).color}`}>
                    {getTypeBadge(selectedReport.event_cause).text}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-400 font-medium">Location</span>
                  <span className="font-bold text-slate-700 text-right max-w-[160px] truncate">{selectedReport.nearest_junction}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-400 font-medium">Priority</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                    selectedReport.risk_level === 'CRITICAL' ? 'text-rose-600 bg-rose-50 border-rose-200' :
                    selectedReport.risk_level === 'HIGH' ? 'text-orange-600 bg-orange-50 border-orange-200' :
                    selectedReport.risk_level === 'MEDIUM' ? 'text-yellow-600 bg-yellow-50 border-yellow-200' :
                    'text-emerald-600 bg-emerald-50 border-emerald-200'
                  }`}>{selectedReport.risk_level}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-400 font-medium">Status</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${statusColors[selectedReport.status]}`}>
                    {selectedReport.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-400 font-medium">Submitted</span>
                  <span className="font-mono text-slate-600">{getRelativeTime(selectedReport.start_datetime, now)}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block mb-1">Description</span>
                  <p className="text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-[11px] leading-relaxed">{selectedReport.description}</p>
                </div>

                {selectedReport.image && (
                  <div className="mt-2.5">
                    <span className="text-slate-400 font-medium block mb-1">Attached Evidence</span>
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 flex items-center justify-center p-1">
                      <img 
                        src={selectedReport.image} 
                        alt="Citizen evidence preview" 
                        className="max-w-full max-h-[160px] object-contain rounded" 
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {selectedReport.status !== 'RESOLVED' && (
                  <div className="pt-2 space-y-1.5">
                    {selectedReport.status === 'PENDING' && (
                      <button onClick={() => { const ps = getNearestPoliceStation(selectedReport.latitude, selectedReport.longitude); handleUpdateStatus(selectedReport.id, 'DISPATCHED', ps.name); }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-1.5">
                        <Siren className="h-3.5 w-3.5" /> Acknowledge & Dispatch
                      </button>
                    )}
                    {selectedReport.status === 'DISPATCHED' && (
                      <button onClick={() => handleUpdateStatus(selectedReport.id, 'ON_SCENE')}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Mark Team On Scene
                      </button>
                    )}
                    {selectedReport.status === 'ON_SCENE' && (
                      <button onClick={() => handleUpdateStatus(selectedReport.id, 'RESOLVED')}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5" /> Mark Resolved
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Report Submission Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <Megaphone className="h-3.5 w-3.5 text-blue-600" /> Submit New Report
            </h4>

            <form onSubmit={handleSubmitReport} className="space-y-3">
              {/* Report Type */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Report Type</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {REPORT_TYPES.map((type) => (
                    <button key={type.value} type="button"
                      onClick={() => setReportForm({...reportForm, category: type.value})}
                      className={`text-[10px] font-bold py-2 px-2 rounded-lg border transition-all text-left flex items-center gap-1.5 ${
                        reportForm.category === type.value
                          ? 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{type.emoji}</span>
                      <span className="truncate">{type.label.split(' / ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  <MapPin className="h-3 w-3 inline mr-0.5" /> Location
                </label>
                <select value={reportForm.nearest_junction}
                  onChange={(e) => setReportForm({...reportForm, nearest_junction: e.target.value})}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 focus:outline-none">
                  {JUNCTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Description</label>
                <textarea rows={3} placeholder="Describe the issue in detail..."
                  value={reportForm.description}
                  onChange={(e) => setReportForm({...reportForm, description: e.target.value})}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder-slate-400 resize-none" />
              </div>

              {/* Upload Image */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  <Upload className="h-3 w-3 inline mr-0.5" /> Attach Image
                </label>
                <button type="button"
                  onClick={() => setReportForm({...reportForm, photoAttached: !reportForm.photoAttached})}
                  className={`w-full text-xs font-bold py-2 rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                    reportForm.photoAttached
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}>
                  {reportForm.photoAttached ? <><CheckCircle className="h-3.5 w-3.5" /> Photo Attached</> : <><Upload className="h-3.5 w-3.5" /> Upload Photo</>}
                </button>
              </div>

              {/* Severity */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Severity Level</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {SEVERITY_OPTIONS.map((sev) => (
                    <button key={sev.value} type="button"
                      onClick={() => setReportForm({...reportForm, severity: sev.value})}
                      className={`text-[9px] font-bold py-1.5 rounded-lg border transition-all ${
                        reportForm.severity === sev.value
                          ? `${sev.color} ring-1 ring-current/20`
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {sev.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-1">
                <button type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5">
                  <Megaphone className="h-3.5 w-3.5" /> Submit Report
                </button>
                <button type="button" onClick={handleClearForm}
                  className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-lg transition-all border border-slate-200">
                  Clear
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ── Bottom: Recent Citizen Reports Table ─────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-blue-600" /> Recent Citizen Reports
          </h4>
          <span className="text-[10px] text-slate-400 font-mono font-bold">{citizenReports.length} total records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Report ID</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Type</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Location</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Priority</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Status</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {citizenReports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    No citizen reports on record yet.
                  </td>
                </tr>
              ) : (
                citizenReports.slice(0, 15).map(inc => {
                  const badge = getTypeBadge(inc.event_cause);
                  return (
                    <tr key={inc.id} className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedReportId(inc.id)}>
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-600">{inc.id}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${badge.color}`}>{badge.text}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 max-w-[200px] truncate">{inc.nearest_junction}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                          inc.risk_level === 'CRITICAL' ? 'text-rose-600 bg-rose-50 border-rose-200' :
                          inc.risk_level === 'HIGH' ? 'text-orange-600 bg-orange-50 border-orange-200' :
                          inc.risk_level === 'MEDIUM' ? 'text-yellow-600 bg-yellow-50 border-yellow-200' :
                          'text-emerald-600 bg-emerald-50 border-emerald-200'
                        }`}>{inc.risk_level}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${statusColors[inc.status]}`}>
                          {inc.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{getRelativeTime(inc.start_datetime, now)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CitizenReportingPage;
