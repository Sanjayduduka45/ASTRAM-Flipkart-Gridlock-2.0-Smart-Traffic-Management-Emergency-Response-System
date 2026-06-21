import React, { useState } from 'react';
import { Activity, Clock } from 'lucide-react';
import { BENGALURU_LOCATIONS } from '../mockData';
import type { Incident, HotspotData, MapLayersState, CameraData, WeatherData } from '../types';

const MapViewer = React.lazy(() => import('../components/MapViewer').then(m => ({ default: m.MapViewer })));

interface MapsPageProps {
  incidents: Incident[];
  selectedIncident: Incident | null;
  setSelectedIncident: (inc: Incident | null) => void;
  selectedHotspot: HotspotData | null;
  setSelectedHotspot: (spot: HotspotData | null) => void;
  mapLayers: MapLayersState;
  setMapLayers: React.Dispatch<React.SetStateAction<MapLayersState>>;
  cameras: CameraData[];
  weatherData: WeatherData;
}

export const MapsPage: React.FC<MapsPageProps> = ({
  incidents,
  selectedIncident,
  setSelectedIncident,
  selectedHotspot,
  setSelectedHotspot,
  mapLayers,
  setMapLayers,
  cameras,
  weatherData
}) => {
  // Map specific filter states
  const [mapZoneFilter, setMapZoneFilter] = useState<string>('all');
  const [mapTypeFilter, setMapTypeFilter] = useState<string>('all');
  const [mapRiskFilter, setMapRiskFilter] = useState<string>('all');

  // Compute filtered incidents list locally
  const filteredIncidents = incidents.filter(inc => {
    // 1. Zone filter (maps zones based on nearest_junction name)
    if (mapZoneFilter !== 'all') {
      const zone = inc.nearest_junction || '';
      if (zone.toLowerCase() !== mapZoneFilter.toLowerCase()) return false;
    }
    // 2. Type filter
    if (mapTypeFilter !== 'all') {
      if (inc.event_cause.toLowerCase() !== mapTypeFilter.toLowerCase()) return false;
    }
    // 3. Risk filter
    if (mapRiskFilter !== 'all') {
      if (inc.risk_level.toUpperCase() !== mapRiskFilter.toUpperCase()) return false;
    }
    return true;
  });

  // Find the top 5 high-risk zones from Central Bengaluru Locations
  const top5Zones = [...BENGALURU_LOCATIONS]
    .sort((a, b) => {
      const riskWeights: Record<string, number> = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      const diff = (riskWeights[b.risk] || 0) - (riskWeights[a.risk] || 0);
      if (diff !== 0) return diff;
      return b.baseScore - a.baseScore;
    })
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch h-[calc(100vh-120px)] min-h-[580px] animate-fade-in text-left">
      {/* Map Section (Columns 1-4, 80% width) */}
      <div className="lg:col-span-4 relative rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col bg-slate-550/5">
        <React.Suspense fallback={<div className="flex items-center justify-center h-full w-full bg-slate-100 text-slate-450 font-bold text-xs">Loading Live Maps Viewer...</div>}>
          <MapViewer 
            incidents={filteredIncidents}
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
            centerCoords={
              selectedIncident 
                ? [selectedIncident.latitude, selectedIncident.longitude]
                : selectedHotspot 
                ? [selectedHotspot.lat, selectedHotspot.lon]
                : undefined
            }
          />
        </React.Suspense>
        
        {/* Floating Map Panel (Top-Right) */}
        <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl p-3.5 shadow-xl space-y-3.5 w-60 text-left">
          <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
            <div>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block font-mono">astram console</span>
              <h3 className="text-xs font-extrabold text-slate-800">Operations Control</h3>
            </div>
            <Activity className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
          </div>
          
          {/* Section 1: Active Layers */}
          <div className="space-y-2">
            <span className="text-[8px] font-bold text-slate-405 uppercase tracking-widest block mb-1">map overlays</span>
            <div className="space-y-1.5 text-[11px]">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input 
                  type="checkbox" 
                  checked={mapLayers.incidents && mapLayers.congestion}
                  onChange={() => {
                    const nextVal = !(mapLayers.incidents && mapLayers.congestion);
                    setMapLayers((prev) => ({ ...prev, incidents: nextVal, congestion: nextVal }));
                  }}
                  className="rounded border-slate-350 text-blue-600 focus:ring-blue-500/40"
                />
                <span>Critical Zones</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input 
                  type="checkbox" 
                  checked={mapLayers.closures}
                  onChange={() => setMapLayers((prev) => ({ ...prev, closures: !prev.closures }))}
                  className="rounded border-slate-350 text-blue-600 focus:ring-blue-500/40"
                />
                <span>Road Closures</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input 
                  type="checkbox" 
                  checked={mapLayers.diversions}
                  onChange={() => setMapLayers((prev) => ({ ...prev, diversions: !prev.diversions }))}
                  className="rounded border-slate-350 text-blue-600 focus:ring-blue-500/40"
                />
                <span>Diversions</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input 
                  type="checkbox" 
                  checked={mapLayers.police && mapLayers.emergency && mapLayers.barricades}
                  onChange={() => {
                    const nextVal = !(mapLayers.police && mapLayers.emergency && mapLayers.barricades);
                    setMapLayers((prev) => ({ 
                      ...prev, 
                      police: nextVal, 
                      emergency: nextVal, 
                      barricades: nextVal 
                    }));
                  }}
                  className="rounded border-slate-350 text-blue-600 focus:ring-blue-500/40"
                />
                <span>Deployed Resources</span>
              </label>
            </div>
          </div>

          {/* Section 2: Spatial Filters */}
          <div className="border-t border-slate-100 pt-2.5 space-y-2">
            <span className="text-[8px] font-bold text-slate-405 uppercase tracking-widest block">filters</span>
            
            <div className="space-y-2">
              <div>
                <label className="text-[8.5px] font-bold text-slate-400 uppercase block mb-0.5 font-mono">Zone</label>
                <select 
                  value={mapZoneFilter} 
                  onChange={(e) => setMapZoneFilter(e.target.value)}
                  className="w-full text-[10.5px] bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500/40 focus:outline-none text-slate-700"
                >
                  <option value="all">All Zones</option>
                  <option value="Silk Board Area">Silk Board Area</option>
                  <option value="Hebbal Corridor">Hebbal Corridor</option>
                  <option value="Whitefield">Whitefield</option>
                  <option value="Majestic Center">Majestic Center</option>
                  <option value="Koramangala">Koramangala</option>
                  <option value="Indiranagar">Indiranagar</option>
                  <option value="Jayanagar">Jayanagar</option>
                </select>
              </div>

              <div>
                <label className="text-[8.5px] font-bold text-slate-400 uppercase block mb-0.5 font-mono">Cause</label>
                <select 
                  value={mapTypeFilter} 
                  onChange={(e) => setMapTypeFilter(e.target.value)}
                  className="w-full text-[10.5px] bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500/40 focus:outline-none text-slate-700"
                >
                  <option value="all">All Causes</option>
                  <option value="accident">Accident</option>
                  <option value="breakdown">Breakdown</option>
                  <option value="flooding">Flooding</option>
                  <option value="construction">Construction</option>
                  <option value="pothole">Pothole</option>
                  <option value="tree fall">Tree fall</option>
                  <option value="others">Others</option>
                </select>
              </div>

              <div>
                <label className="text-[8.5px] font-bold text-slate-400 uppercase block mb-0.5 font-mono">Risk</label>
                <select 
                  value={mapRiskFilter} 
                  onChange={(e) => setMapRiskFilter(e.target.value)}
                  className="w-full text-[10.5px] bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500/40 focus:outline-none text-slate-700"
                >
                  <option value="all">All Risks</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span>Plots: {filteredIncidents.length}</span>
            <button 
              onClick={() => {
                setMapZoneFilter('all');
                setMapTypeFilter('all');
                setMapRiskFilter('all');
                setSelectedHotspot(null);
                setSelectedIncident(null);
              }}
              className="text-blue-600 hover:underline font-bold"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Contextual Intelligence Panel (Column 5, 20% width) */}
      <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between overflow-y-auto h-full text-left">
        {!selectedHotspot && !selectedIncident ? (
          /* Default View: Top 5 High-Risk Zones */
          <div className="space-y-4">
            <div>
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5 font-mono">High Traffic Areas</h3>
              <h4 className="text-sm font-extrabold text-slate-855">Top 5 High-Risk Zones</h4>
              <p className="text-[10px] text-slate-500 mt-1">Select a hotspot zone below to focus and pan the maps console.</p>
            </div>
            
            <div className="space-y-3">
              {top5Zones.map((zone) => (
                <button
                  key={zone.name}
                  onClick={() => {
                    setSelectedHotspot({
                      name: zone.name,
                      lat: zone.lat,
                      lon: zone.lon,
                      risk: zone.risk,
                      score: zone.baseScore,
                      delay: zone.delay
                    });
                    setSelectedIncident(null);
                  }}
                  className="w-full text-left p-3.5 rounded-xl border border-slate-150/70 bg-slate-50/50 hover:bg-slate-100 transition-all flex flex-col gap-1.5 group cursor-pointer animate-fade-in"
                >
                  <div className="flex justify-between items-center w-full">
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                      zone.risk === 'CRITICAL' 
                        ? 'bg-rose-500/10 text-rose-600 ' 
                        : 'bg-amber-500/10 text-amber-600 '
                    }`}>
                      {zone.risk}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 font-mono">
                      {zone.baseScore}% Load
                    </span>
                  </div>
                  
                  <strong className="text-xs font-extrabold text-slate-800 group-hover:text-blue-600 transition-colors leading-tight">
                    {zone.name}
                  </strong>
                  
                  <span className="text-[10px] text-slate-505 flex items-center gap-1">
                    <Clock className="h-3 w-3 inline shrink-0" />
                    <span>Queue Delay: <strong>{zone.delay} mins</strong></span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Selected View: Context Details */
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest font-mono">
                Location Context
              </span>
              <button 
                onClick={() => {
                  setSelectedHotspot(null);
                  setSelectedIncident(null);
                }}
                className="text-[10px] font-extrabold text-rose-500 hover:underline cursor-pointer"
              >
                Clear Selection
              </button>
            </div>

            {selectedHotspot && (
              <div className="space-y-4">
                <div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold inline-block mb-1.5 ${
                    selectedHotspot.risk === 'CRITICAL' 
                      ? 'bg-rose-500/10 text-rose-600 ' 
                      : 'bg-amber-500/10 text-amber-600 '
                  }`}>
                    {selectedHotspot.risk}
                  </span>
                  <h4 className="text-sm font-black text-slate-900 leading-snug">{selectedHotspot.name}</h4>
                  <span className="text-[10px] text-slate-400 block font-mono mt-0.5">{selectedHotspot.lat.toFixed(4)}, {selectedHotspot.lon.toFixed(4)}</span>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Junction Congestion</span>
                    <strong className="text-sm font-mono text-slate-800">{selectedHotspot.score}/100</strong>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Travel Delay</span>
                    <strong className="text-sm font-mono text-slate-800">{selectedHotspot.delay} mins</strong>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Recommended Actions</span>
                    <span className="text-blue-600 font-bold block mt-0.5">Dynamic Signal Adjustment</span>
                  </div>
                </div>

                {/* Overlapping Incidents */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-2">Overlapping Incidents</span>
                  <div className="space-y-2">
                    {incidents.filter(inc => inc.nearest_junction === selectedHotspot.name).length === 0 ? (
                      <p className="text-[11px] text-slate-400">No active incidents overlapping this junction.</p>
                    ) : (
                      incidents.filter(inc => inc.nearest_junction === selectedHotspot.name).map(inc => (
                        <button 
                          key={inc.id}
                          onClick={() => setSelectedIncident(inc)}
                          className="w-full bg-slate-50/50 border border-slate-200 p-2.5 rounded-lg text-[11px] hover:border-blue-500 transition-colors flex items-center justify-between gap-3 text-slate-800 font-semibold cursor-pointer"
                        >
                          <span>{inc.id} ({inc.event_cause})</span>
                          <span className={`w-2 h-2 rounded-full ${
                            inc.risk_level === 'CRITICAL' ? 'bg-rose-500' : inc.risk_level === 'HIGH' ? 'bg-amber-500' : 'bg-yellow-500'
                          }`} />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedIncident && (
              <div className="space-y-4">
                <div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold inline-block mb-1.5 ${
                    selectedIncident.risk_level === 'CRITICAL' 
                      ? 'bg-rose-500/10 text-rose-600 ' 
                      : 'bg-amber-500/10 text-amber-600 '
                  }`}>
                    {selectedIncident.risk_level} Risk
                  </span>
                  <h4 className="text-sm font-black text-slate-900 leading-snug">Node: {selectedIncident.id}</h4>
                  <span className="text-[10px] text-slate-455 font-bold uppercase mt-1 block font-mono">Cause: {selectedIncident.event_cause}</span>
                </div>

                <p className="text-xs text-slate-650 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-150">
                  {selectedIncident.description}
                </p>

                <div className="space-y-3 pt-2 text-xs">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Junction Area</span>
                    <strong className="text-slate-800">{selectedIncident.nearest_junction}</strong>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Closure Probability</span>
                    <strong className="text-blue-600 text-sm font-mono">{(selectedIncident.probability_closure * 100).toFixed(1)}%</strong>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Congestion Index</span>
                    <strong className="text-slate-800 text-sm font-mono">{selectedIncident.congestion_score}/100</strong>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Active Dispatch</span>
                    <span className="text-slate-700 font-semibold">{selectedIncident.assigned_resource || "None (Awaiting Dispatch)"}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400 font-mono">
          <span>TMC FEED: OK</span>
          <span>v2.0.0</span>
        </div>
      </div>
    </div>
  );
};

export default MapsPage;
