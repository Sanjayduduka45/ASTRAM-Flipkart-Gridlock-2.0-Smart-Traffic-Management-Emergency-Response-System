import React, { useState } from 'react';
import { Siren, Shield, Search, Users, Activity, CheckCircle, Clock } from 'lucide-react';
import { getNearestPoliceStation } from '../utils/helpers';
import type { Incident } from '../types';

interface IncidentManagementPageProps {
  incidents: Incident[];
  handleUpdateStatus: (incidentId: string, newStatus: 'PENDING' | 'DISPATCHED' | 'ON_SCENE' | 'RESOLVED', assignedResource?: string) => void;
}

export const IncidentManagementPage: React.FC<IncidentManagementPageProps> = ({
  incidents,
  handleUpdateStatus
}) => {
  // Localized feed filter states
  const [incidentSubTab, setIncidentSubTab] = useState<'dispatch' | 'feed'>('dispatch');
  const [feedSearchQuery, setFeedSearchQuery] = useState<string>('');
  const [feedCategoryFilter, setFeedCategoryFilter] = useState<string>('All');
  const [feedPriorityFilter, setFeedPriorityFilter] = useState<string>('All');
  const [feedStatusFilter, setFeedStatusFilter] = useState<string>('All');
  const [dispatchingIncidentId, setDispatchingIncidentId] = useState<string | null>(null);

  const getRelativeTime = (isoString: string) => {
    const rTime = new Date(isoString).getTime();
    const now = new Date().getTime();
    const diffMins = Math.floor((now - rTime) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getIncidentBadge = (eventCause: string) => {
    const cause = eventCause.toLowerCase();
    if (cause.includes('accident') || cause.includes('collision')) {
      return { text: 'Accident / Vehicle Crash', emoji: '🚨', color: 'text-rose-600 bg-rose-50  border-rose-100 ' };
    }
    if (cause.includes('waterlogging') || cause.includes('flood') || cause.includes('water')) {
      return { text: 'Waterlogging / Flooding', emoji: '🌧️', color: 'text-sky-600 bg-sky-50  border-sky-100 ' };
    }
    if (cause.includes('breakdown')) {
      return { text: 'Broken Down Vehicle', emoji: '🚙', color: 'text-yellow-600 bg-yellow-50  border-yellow-100 ' };
    }
    if (cause.includes('tree')) {
      return { text: 'Tree Fall Obstruction', emoji: '🌳', color: 'text-emerald-600 bg-emerald-50  border-emerald-100 ' };
    }
    if (cause.includes('construction') || cause.includes('roadwork')) {
      return { text: 'Construction / Roadwork', emoji: '🚧', color: 'text-slate-655 bg-slate-550/10  border-slate-200 ' };
    }
    return { text: 'Road Obstruction', emoji: '⚠️', color: 'text-zinc-655 bg-zinc-50  border-zinc-200 ' };
  };

  const severityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  
  const sortIncidents = (list: Incident[]) => {
    return [...list].sort((a, b) => {
      const weightA = severityWeight[a.risk_level as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'] || 0;
      const weightB = severityWeight[b.risk_level as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'] || 0;
      if (weightB !== weightA) return weightB - weightA;
      return new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime();
    });
  };

  const sortedNew = sortIncidents(incidents.filter(inc => inc.status === 'PENDING'));
  const sortedAssigned = sortIncidents(incidents.filter(inc => inc.status === 'DISPATCHED'));
  const sortedInProgress = sortIncidents(incidents.filter(inc => inc.status === 'ON_SCENE'));

  const filteredFeedIncidents = incidents.filter(inc => {
    const matchesSearch = inc.id.toLowerCase().includes(feedSearchQuery.toLowerCase()) || 
      inc.nearest_junction.toLowerCase().includes(feedSearchQuery.toLowerCase()) ||
      inc.description.toLowerCase().includes(feedSearchQuery.toLowerCase());

    const matchesCategory = feedCategoryFilter === 'All' || inc.event_cause.toLowerCase().includes(feedCategoryFilter.toLowerCase());
    const matchesPriority = feedPriorityFilter === 'All' || inc.risk_level === feedPriorityFilter;
    const matchesStatus = feedStatusFilter === 'All' || inc.status === feedStatusFilter;

    return matchesSearch && matchesCategory && matchesPriority && matchesStatus;
  });

  const totalActiveFeed = incidents.filter(i => i.status !== 'RESOLVED').length;
  const totalCriticalFeed = incidents.filter(i => i.risk_level === 'CRITICAL' && i.status !== 'RESOLVED').length;
  const totalClearedFeed = incidents.filter(i => i.status === 'RESOLVED').length;

  const priorityQueueIncidents = sortedNew;
  const activeIncidents = [...sortedAssigned, ...sortedInProgress];

  const riskColorMap: Record<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', string> = {
    CRITICAL: 'text-rose-600 bg-rose-50 border-rose-100  ',
    HIGH: 'text-orange-600 bg-orange-50 border-orange-100  ',
    MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-100  ',
    LOW: 'text-emerald-600 bg-emerald-50 border-emerald-100  '
  };

  const getIncidentETA = (inc: Incident) => {
    if (inc.status === 'RESOLVED') return 'Resolved';
    if (inc.status === 'ON_SCENE') return 'On Scene';
    const baseMins = Math.max(5, Math.round(inc.nearest_junction_dist_km * 8));
    const priorityModifier = inc.risk_level === 'CRITICAL' ? 0.7 : inc.risk_level === 'HIGH' ? 0.9 : inc.risk_level === 'MEDIUM' ? 1.2 : 1.5;
    return `${Math.round(baseMins * priorityModifier)} mins`;
  };

  const responseTeams = [
    { id: 'TP-12', name: 'Traffic Patrol TP-12', type: 'Police Patrol', area: 'Silk Board' },
    { id: 'AM-09', name: 'Trauma Ambulance AM-09', type: 'Medical Squad', area: 'Central' },
    { id: 'HT-03', name: 'Heavy Tow Unit HT-03', type: 'Towing Unit', area: 'KR Puram' },
    { id: 'DR-05', name: 'BBMP Dewatering Squad DR-05', type: 'Dewatering Crew', area: 'Hebbal' },
    { id: 'HC-08', name: 'Horticulture Squad HC-08', type: 'Tree Clearance', area: 'Yeshwanthpur' },
    { id: 'LP-04', name: 'Local Police Patrol LP-04', type: 'Local Police', area: 'Nagavara' }
  ];

  const getTeamStatus = (teamName: string) => {
    const activeAssignment = incidents.find(i => i.status !== 'RESOLVED' && i.assigned_resource === teamName);
    if (!activeAssignment) return { status: 'AVAILABLE', label: 'Available', color: 'bg-emerald-500', incident: null };
    if (activeAssignment.status === 'DISPATCHED') {
      return { status: 'EN_ROUTE', label: 'En Route', color: 'bg-blue-500 animate-pulse', incident: activeAssignment };
    }
    return { status: 'ON_SCENE', label: 'On Scene', color: 'bg-amber-500 animate-pulse', incident: activeAssignment };
  };

  const getChronologicalLogs = () => {
    const logs: Array<{ id: string; time: string; timestamp: number; text: string; type: 'alert' | 'dispatch' | 'scene' | 'resolved' }> = [];
    
    incidents.forEach(inc => {
      const startTime = new Date(inc.start_datetime).getTime();
      
      // 1. Reported
      logs.push({
        id: `${inc.id}-rep`,
        time: new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: startTime,
        text: `[ALERT] ${inc.id} - ${inc.event_cause} reported at ${inc.nearest_junction} (${inc.risk_level})`,
        type: 'alert'
      });
      
      // 2. Dispatched
      if (inc.status === 'DISPATCHED' || inc.status === 'ON_SCENE' || inc.status === 'RESOLVED') {
        const dispatchTime = startTime + 30000; // 30s later
        logs.push({
          id: `${inc.id}-disp`,
          time: new Date(dispatchTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          timestamp: dispatchTime,
          text: `[DISPATCH] ${inc.assigned_resource || 'Patrol Unit'} deployed to ${inc.id} at ${inc.nearest_junction}`,
          type: 'dispatch'
        });
      }
      
      // 3. Arrived On Scene
      if (inc.status === 'ON_SCENE' || inc.status === 'RESOLVED') {
        const sceneTime = startTime + 180000; // 3 mins later
        logs.push({
          id: `${inc.id}-scene`,
          time: new Date(sceneTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          timestamp: sceneTime,
          text: `[ON SCENE] ${inc.assigned_resource || 'Patrol Unit'} arrived at ${inc.nearest_junction} for ${inc.id}`,
          type: 'scene'
        });
      }
      
      // 4. Resolved
      if (inc.status === 'RESOLVED') {
        const resolvedTime = startTime + 600000; // 10 mins later
        logs.push({
          id: `${inc.id}-res`,
          time: new Date(resolvedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          timestamp: resolvedTime,
          text: `[RESOLVED] ${inc.id} at ${inc.nearest_junction} cleared. Route restored.`,
          type: 'resolved'
        });
      }
    });
    
    return logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
  };

  const logsList = getChronologicalLogs();

  return (
    <div className="space-y-5 animate-fade-in text-left">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Siren className="h-6 w-6 text-blue-600" />
            Incident Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tactical Operations Room for direct emergency vehicle dispatch and comprehensive live chronological logging.
          </p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
          <button
            onClick={() => setIncidentSubTab('dispatch')}
            className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
              incidentSubTab === 'dispatch'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'text-slate-650  hover:text-slate-900 '
            }`}
          >
            Tactical Dispatch
          </button>
          <button
            onClick={() => setIncidentSubTab('feed')}
            className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
              incidentSubTab === 'feed'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'text-slate-655  hover:text-slate-900 '
            }`}
          >
            Incident Log Feed
          </button>
        </div>
      </div>

      {incidentSubTab === 'dispatch' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 h-[calc(100vh-210px)] min-h-[580px] items-stretch text-left">
          
          {/* PANEL 1: PRIORITY QUEUE */}
          <div className="lg:col-span-1 flex flex-col bg-slate-100/50 border border-slate-200 rounded-xl p-3 h-full overflow-hidden">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                <h3 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Priority Queue</h3>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
                {priorityQueueIncidents.length} Pending
              </span>
            </div>

            <div className="space-y-2.5 overflow-y-auto flex-1 pr-1 custom-scrollbar">
              {priorityQueueIncidents.length === 0 ? (
                <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center flex flex-col items-center justify-center min-h-[150px] text-slate-400 h-full">
                  <Shield className="h-7 w-7 text-slate-350 mb-1.5 opacity-60" />
                  <span className="text-[10px] font-bold tracking-wide uppercase">Queue Clear</span>
                </div>
              ) : (
                priorityQueueIncidents.map(inc => {
                  const badge = getIncidentBadge(inc.event_cause);
                  const isDispatching = dispatchingIncidentId === inc.id;

                  return (
                    <div key={inc.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-all relative border-l-3 border-l-rose-500 space-y-2.5">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[9px] font-black text-slate-455">{inc.id}</span>
                          <span className="text-[9px] text-slate-400 font-mono">({getRelativeTime(inc.start_datetime)})</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded border text-[8px] font-black tracking-wider uppercase ${riskColorMap[inc.risk_level]}`}>
                          {inc.risk_level}
                        </span>
                      </div>

                      {/* Cause Title */}
                      <div>
                        <h4 className="font-extrabold text-[11px] text-slate-805 truncate flex items-center gap-1">
                          <span>{badge.emoji}</span>
                          <span>{badge.text}</span>
                        </h4>
                        <p className="text-[10.5px] text-slate-500 line-clamp-2 leading-normal mt-1 font-semibold">
                          {inc.description}
                        </p>
                      </div>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 gap-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg text-[9px] leading-tight">
                        <div>
                          <span className="text-slate-400 block text-[7.5px] font-bold uppercase tracking-wider">Severity</span>
                          <span className={`font-black uppercase ${
                            inc.risk_level === 'CRITICAL' ? 'text-rose-500' :
                            inc.risk_level === 'HIGH' ? 'text-orange-500' :
                            inc.risk_level === 'MEDIUM' ? 'text-yellow-500' : 'text-emerald-500'
                          }`}>{inc.risk_level}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[7.5px] font-bold uppercase tracking-wider">Location</span>
                          <span className="font-extrabold text-slate-700 truncate block">📍 {inc.nearest_junction}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[7.5px] font-bold uppercase tracking-wider">ETA</span>
                          <span className="font-extrabold text-slate-700">{getIncidentETA(inc)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[7.5px] font-bold uppercase tracking-wider">Assigned Unit</span>
                          <span className="text-slate-455 font-bold italic truncate block">Unassigned</span>
                        </div>
                      </div>

                      {/* Action */}
                      <div className="pt-1.5 border-t border-slate-100">
                        {isDispatching ? (
                          <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 animate-slide-in">
                            <span className="text-[8px] uppercase font-bold text-slate-500 block mb-1">Responders List</span>
                            <div className="max-h-24 overflow-y-auto space-y-1 custom-scrollbar">
                              {responseTeams.map(team => {
                                const teamState = getTeamStatus(team.name);
                                const isAssigned = teamState.status !== 'AVAILABLE';
                                return (
                                  <button
                                    key={team.id}
                                    onClick={() => {
                                      handleUpdateStatus(inc.id, 'DISPATCHED', team.name);
                                      setDispatchingIncidentId(null);
                                    }}
                                    className={`w-full text-left px-2 py-1 text-[9.5px] rounded flex items-center justify-between transition-colors ${
                                      isAssigned 
                                        ? 'opacity-40 hover:bg-slate-200  cursor-not-allowed text-slate-400'
                                        : 'bg-white  border border-slate-200  hover:border-blue-500  hover:bg-blue-50/20 text-slate-750  font-bold cursor-pointer'
                                    }`}
                                    disabled={isAssigned}
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      <span className={`w-1.5 h-1.5 rounded-full ${isAssigned ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                      <span className="truncate">{team.name}</span>
                                    </div>
                                    <span className="text-[7px] font-mono uppercase bg-slate-100 px-1 rounded text-slate-400 shrink-0">
                                      {isAssigned ? 'Busy' : team.area}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <button 
                              onClick={() => setDispatchingIncidentId(null)}
                              className="w-full text-center py-1 text-[8.5px] text-rose-500 font-bold border border-rose-500/20 rounded hover:bg-rose-500/10 transition-colors mt-1 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDispatchingIncidentId(inc.id)}
                            className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black shadow-sm transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <Siren className="h-3 w-3" />
                            <span>Dispatch Team</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* PANEL 2: ACTIVE INCIDENTS */}
          <div className="lg:col-span-2 flex flex-col bg-slate-100/50 border border-slate-200 rounded-xl p-3 h-full overflow-hidden">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                <h3 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Active Incidents</h3>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-650 border border-blue-500/20">
                {activeIncidents.length} Active Operations
              </span>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar">
              {activeIncidents.length === 0 ? (
                <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center flex flex-col items-center justify-center min-h-[200px] text-slate-400 h-full">
                  <CheckCircle className="h-9 w-9 text-emerald-500 mb-2 opacity-60 animate-bounce" />
                  <span className="text-[10.5px] font-bold tracking-wide uppercase text-slate-600">All Operations Clear</span>
                  <p className="text-[9.5px] text-slate-400 max-w-xs mt-1 leading-relaxed font-semibold">No active incidents are undergoing responder management at this moment.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2">
                  {activeIncidents.map(inc => {
                    const badge = getIncidentBadge(inc.event_cause);
                    const isEnRoute = inc.status === 'DISPATCHED';

                    return (
                      <div key={inc.id} className={`bg-white  border border-slate-200  rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all relative border-l-3 space-y-2.5 flex flex-col justify-between ${
                        isEnRoute ? 'border-l-blue-500' : 'border-l-amber-500'
                      }`}>
                        <div className="space-y-2">
                          {/* Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[9px] font-black text-slate-455">{inc.id}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[7.5px] font-black tracking-wider uppercase ${
                                isEnRoute 
                                  ? 'bg-blue-500/10 text-blue-500 ' 
                                  : 'bg-amber-500/10 text-amber-500 '
                              }`}>
                                {isEnRoute ? 'En Route' : 'On Scene'}
                              </span>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded border text-[8px] font-black tracking-wider uppercase ${riskColorMap[inc.risk_level]}`}>
                              {inc.risk_level}
                            </span>
                          </div>

                          {/* Cause */}
                          <div>
                            <h4 className="font-extrabold text-[11px] text-slate-805 truncate flex items-center gap-1">
                              <span>{badge.emoji}</span>
                              <span>{badge.text}</span>
                            </h4>
                            <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed mt-0.5 font-semibold">
                              {inc.description}
                            </p>
                          </div>

                          {/* Metrics Grid */}
                          <div className="grid grid-cols-2 gap-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg text-[9px] leading-tight">
                            <div>
                              <span className="text-slate-400 block text-[7.5px] font-bold uppercase tracking-wider">Severity</span>
                              <span className={`font-black uppercase ${
                                inc.risk_level === 'CRITICAL' ? 'text-rose-500' :
                                inc.risk_level === 'HIGH' ? 'text-orange-500' :
                                inc.risk_level === 'MEDIUM' ? 'text-yellow-500' : 'text-emerald-500'
                              }`}>{inc.risk_level}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[7.5px] font-bold uppercase tracking-wider">Location</span>
                              <span className="font-extrabold text-slate-700 truncate block">📍 {inc.nearest_junction}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[7.5px] font-bold uppercase tracking-wider">ETA Status</span>
                              <span className="font-extrabold text-slate-700">
                                {isEnRoute ? `En Route (${getIncidentETA(inc)})` : 'Arrived On Scene'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[7.5px] font-bold uppercase tracking-wider">Assigned Unit</span>
                              <span className="text-slate-800 font-extrabold truncate block">{inc.assigned_resource || 'None Assigned'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-2 border-t border-slate-100">
                          {isEnRoute ? (
                            <button
                              onClick={() => handleUpdateStatus(inc.id, 'ON_SCENE')}
                              className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-black shadow-sm transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                            >
                              <Clock className="h-3 w-3" />
                              <span>Mark On Scene</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateStatus(inc.id, 'RESOLVED')}
                              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black shadow-sm transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                            >
                              <CheckCircle className="h-3 w-3" />
                              <span>Resolve Incident</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* PANEL 3 & 4: TEAMS & STATUS TRACKING (STACKED) */}
          <div className="lg:col-span-1 flex flex-col gap-4 h-full overflow-hidden">
            
            {/* RESPONSE TEAMS PANEL */}
            <div className="flex-[4_4_0%] flex flex-col bg-slate-100/50 border border-slate-200 rounded-xl p-3 overflow-hidden">
              <div className="flex items-center justify-between mb-2.5 px-1 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-blue-600" />
                  <h3 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Response Teams</h3>
                </div>
              </div>

              <div className="space-y-1.5 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                {responseTeams.map(team => {
                  const statusInfo = getTeamStatus(team.name);
                  return (
                    <div key={team.id} className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2 text-left">
                      <div className="min-w-0">
                        <span className="font-black text-[10px] text-slate-800 block truncate">{team.name}</span>
                        <span className="text-[8px] text-slate-400 block font-semibold">{team.type} • {team.area}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[7.5px] font-mono uppercase bg-slate-100 px-1 rounded text-slate-455 font-bold">
                          {statusInfo.label}
                        </span>
                        <span className={`w-2 h-2 rounded-full ${statusInfo.color}`}></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* STATUS TRACKING PANEL */}
            <div className="flex-[6_6_0%] flex flex-col bg-slate-100/50 border border-slate-200 rounded-xl p-3 overflow-hidden">
              <div className="flex items-center justify-between mb-2.5 px-1 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
                  <h3 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Status Tracking</h3>
                </div>
              </div>

              <div className="font-mono text-[9px] text-emerald-400 bg-black/90 p-2.5 rounded-lg border border-zinc-850 overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-2 leading-relaxed shadow-inner">
                {logsList.length === 0 ? (
                  <div className="text-zinc-650 text-center py-8">[NO SYSTEM LOGS RECORDED]</div>
                ) : (
                  logsList.map(log => {
                    let typeColor = 'text-sky-405';
                    if (log.type === 'alert') typeColor = 'text-rose-500 font-bold';
                    if (log.type === 'scene') typeColor = 'text-amber-500';
                    if (log.type === 'resolved') typeColor = 'text-emerald-500 font-bold';
                    
                    return (
                      <div key={log.id} className="border-b border-zinc-900/60 pb-1 last:border-0">
                        <span className="text-zinc-500 mr-1">[{log.time}]</span>
                        <span className={typeColor}>{log.text}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {incidentSubTab === 'feed' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Active Operations</span>
              <strong className="text-2xl font-black text-slate-800 mt-1 block">{totalActiveFeed} Open</strong>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm text-left">
              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest block">Critical Threats</span>
              <strong className="text-2xl font-black text-rose-600 mt-1 block">{totalCriticalFeed} Alerted</strong>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm text-left">
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block">Improved Today</span>
              <strong className="text-2xl font-black text-emerald-600 mt-1 block">{totalClearedFeed} Cleared</strong>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1 text-left font-semibold">Search Logs</label>
              <div className="relative font-bold">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ID, desc, junction..."
                  value={feedSearchQuery}
                  onChange={(e) => setFeedSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8.5 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1 text-left font-semibold">Category</label>
              <select
                value={feedCategoryFilter}
                onChange={(e) => setFeedCategoryFilter(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-semibold"
              >
                {['All', 'Accident', 'Pothole', 'Waterlogging', 'Signal', 'Traffic', 'Tree', 'Breakdown', 'Construction'].map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1 text-left font-semibold">Priority</label>
              <select
                value={feedPriorityFilter}
                onChange={(e) => setFeedPriorityFilter(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-semibold"
              >
                {[
                  { code: 'All', label: 'All Priorities' },
                  { code: 'CRITICAL', label: '🔴 Severe' },
                  { code: 'HIGH', label: '🟠 Major' },
                  { code: 'MEDIUM', label: '🟡 Moderate' },
                  { code: 'LOW', label: '🟢 Minor' }
                ].map(opt => (
                  <option key={opt.code} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1 text-left font-semibold">Status</label>
              <select
                value={feedStatusFilter}
                onChange={(e) => setFeedStatusFilter(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-semibold"
              >
                {[
                  { code: 'All', label: 'All Statuses' },
                  { code: 'PENDING', label: '⏳ Received' },
                  { code: 'DISPATCHED', label: '🚓 En Route' },
                  { code: 'ON_SCENE', label: '👮 Managing' },
                  { code: 'RESOLVED', label: '✅ Cleared' }
                ].map(opt => (
                  <option key={opt.code} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {filteredFeedIncidents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500 font-semibold border-dashed">
                No incidents match the active search and filter parameters.
              </div>
            ) : (
              filteredFeedIncidents.map(inc => {
                const badge = getIncidentBadge(inc.event_cause);
                const nearestPS = getNearestPoliceStation(inc.latitude, inc.longitude);
                
                const riskColorMap: Record<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', string> = {
                  CRITICAL: 'text-rose-605 bg-rose-50 border-rose-100  ',
                  HIGH: 'text-orange-605 bg-orange-50 border-orange-100  ',
                  MEDIUM: 'text-yellow-605 bg-yellow-50 border-yellow-100  ',
                  LOW: 'text-emerald-605 bg-emerald-50 border-emerald-100  '
                };

                const statusBadge = {
                  PENDING: { text: '⏳ RECEIVED', color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
                  DISPATCHED: { text: '🚓 EN ROUTE', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
                  ON_SCENE: { text: '👮 MANAGING', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
                  RESOLVED: { text: '✅ CLEARED', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' }
                }[inc.status];

                return (
                  <div key={inc.id} className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm space-y-3 hover:shadow-md transition-all text-left">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] font-bold text-slate-400">{inc.id}</span>
                        <span className={`px-2 py-0.5 rounded border text-[8.5px] font-black tracking-wider ${riskColorMap[inc.risk_level]}`}>
                          {inc.risk_level}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border text-[8.5px] font-black tracking-wider ${statusBadge.color}`}>
                          {statusBadge.text}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{new Date(inc.start_datetime).toLocaleString()}</span>
                    </div>

                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1 mt-0.5">
                        <span>{badge.emoji}</span>
                        <span>{badge.text} at {inc.nearest_junction}</span>
                      </h4>
                      <p className="text-xs text-slate-600 mt-1 font-semibold">{inc.description}</p>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-50 pt-2 flex-wrap gap-2 font-medium">
                      <span>Assigned Command Unit: <strong className="text-slate-600">{inc.assigned_resource || nearestPS.name}</strong></span>
                      <span>Report Delay: <strong className="text-slate-650">+{inc.congestion_score}% impact</strong></span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentManagementPage;
