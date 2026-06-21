import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Incident, CameraData, WeatherData, HotspotData } from '../types';
import { BENGALURU_LOCATIONS } from '../mockData';
import { Layers, ChevronDown, ChevronUp, Search, X, Maximize2, Minimize2, Plus, Minus } from 'lucide-react';

interface MapViewerProps {
  incidents: Incident[];
  onSelectIncident?: (incident: Incident) => void;
  selectedIncident?: Incident | null;
  activeLayers: {
    incidents?: boolean;
    events: boolean;
    congestion: boolean;
    closures: boolean;
    diversions: boolean;
    police: boolean;
    emergency: boolean;
    barricades: boolean;
    marshals?: boolean;
    heatmap?: boolean;
    weather?: boolean;
    cameras?: boolean;
  };
  onToggleLayer?: (layerId: string) => void;
  heatmapTypeFilter?: string;
  onSelectHotspot?: (hotspot: HotspotData) => void;
  weatherData?: WeatherData;
  cameras?: CameraData[];
  centerCoords?: [number, number];
}

interface UnifiedSearchResult {
  type: 'incident' | 'junction';
  id: string;
  title: string;
  subtitle: string;
  description: string;
  coords: [number, number];
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  incidentData?: Incident;
}

export const MapViewer: React.FC<MapViewerProps> = React.memo(({
  incidents,
  onSelectIncident,
  selectedIncident,
  activeLayers,
  onToggleLayer,
  heatmapTypeFilter = 'all',
  onSelectHotspot,
  weatherData,
  cameras,
  centerCoords
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(12);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState<boolean>(false);
  const [isAdvancedLayersOpen, setIsAdvancedLayersOpen] = useState<boolean>(false);
  const [useClustering, setUseClustering] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<UnifiedSearchResult[]>([]);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [highlightCoords, setHighlightCoords] = useState<[number, number] | null>(null);

  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const eventGroupRef = useRef<L.LayerGroup | null>(null);
  const congestionGroupRef = useRef<L.LayerGroup | null>(null);
  const closureGroupRef = useRef<L.LayerGroup | null>(null);
  const diversionGroupRef = useRef<L.LayerGroup | null>(null);
  const policeGroupRef = useRef<L.LayerGroup | null>(null);
  const emergencyGroupRef = useRef<L.LayerGroup | null>(null);
  const barricadeGroupRef = useRef<L.LayerGroup | null>(null);
  const marshalGroupRef = useRef<L.LayerGroup | null>(null);
  const heatmapGroupRef = useRef<L.LayerGroup | null>(null);
  const weatherGroupRef = useRef<L.LayerGroup | null>(null);
  const cameraGroupRef = useRef<L.LayerGroup | null>(null);
  const highlightGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 12,
      minZoom: 10,
      maxZoom: 16,
      zoomControl: false // Disable default zoom
    });

    const markerGroup = L.layerGroup().addTo(map);
    const eventGroup = L.layerGroup().addTo(map);
    const congestionGroup = L.layerGroup().addTo(map);
    const closureGroup = L.layerGroup().addTo(map);
    const diversionGroup = L.layerGroup().addTo(map);
    const policeGroup = L.layerGroup().addTo(map);
    const emergencyGroup = L.layerGroup().addTo(map);
    const barricadeGroup = L.layerGroup().addTo(map);
    const marshalGroup = L.layerGroup().addTo(map);
    const heatmapGroup = L.layerGroup().addTo(map);
    const weatherGroup = L.layerGroup().addTo(map);
    const cameraGroup = L.layerGroup().addTo(map);
    const highlightGroup = L.layerGroup().addTo(map);

    map.on('zoomend', () => {
      setZoomLevel(map.getZoom());
    });

    mapRef.current = map;
    markerGroupRef.current = markerGroup;
    eventGroupRef.current = eventGroup;
    congestionGroupRef.current = congestionGroup;
    closureGroupRef.current = closureGroup;
    diversionGroupRef.current = diversionGroup;
    policeGroupRef.current = policeGroup;
    emergencyGroupRef.current = emergencyGroup;
    barricadeGroupRef.current = barricadeGroup;
    marshalGroupRef.current = marshalGroup;
    heatmapGroupRef.current = heatmapGroup;
    weatherGroupRef.current = weatherGroup;
    cameraGroupRef.current = cameraGroup;
    highlightGroupRef.current = highlightGroup;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Sync / Handle Fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      const activeFullscreen = document.fullscreenElement === mapWrapperRef.current;
      setIsFullscreen(activeFullscreen);
      
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 150);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Update tile layers on theme change
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Remove existing TileLayers
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      className: 'light-tiles',
      maxZoom: 19
    }).addTo(map);
  }, []);

  // Update pulsing highlight layer
  useEffect(() => {
    if (!mapRef.current || !highlightGroupRef.current) return;

    highlightGroupRef.current.clearLayers();

    if (highlightCoords) {
      L.circle(highlightCoords, {
        radius: 400,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.22,
        weight: 3,
        className: 'pulse-highlight'
      }).addTo(highlightGroupRef.current);

      mapRef.current.setView(highlightCoords, 14, { animate: true });

      const timer = setTimeout(() => {
        setHighlightCoords(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [highlightCoords]);

  // Pan to centerCoords when updated
  useEffect(() => {
    if (mapRef.current && centerCoords) {
      mapRef.current.setView(centerCoords, 14, { animate: true });
    }
  }, [centerCoords]);

  // ═══════════════════════════════════════════════════
  // Update all markers & overlays when data/layers change
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    if (!mapRef.current) return;

    const colorMap = {
      CRITICAL: '#ef4444',
      HIGH: '#f97316',
      MEDIUM: '#eab308',
      LOW: '#10b981',
    };

    if (activeLayers.incidents) {
      // Calculate clustering threshold based on zoom level and preference
      let threshold = 0;
      if (useClustering) {
        if (zoomLevel <= 11) threshold = 0.04;
        else if (zoomLevel === 12) threshold = 0.02;
        else if (zoomLevel === 13) threshold = 0.01;
        else if (zoomLevel === 14) threshold = 0.005;
      }

      const clusters: { center: [number, number]; incidents: Incident[] }[] = [];

      incidents.forEach((incident) => {
        let found = false;
        if (threshold > 0) {
          for (const cluster of clusters) {
            const distLat = Math.abs(cluster.center[0] - incident.latitude);
            const distLng = Math.abs(cluster.center[1] - incident.longitude);
            if (distLat < threshold && distLng < threshold) {
              cluster.incidents.push(incident);
              cluster.center[0] = (cluster.center[0] * (cluster.incidents.length - 1) + incident.latitude) / cluster.incidents.length;
              cluster.center[1] = (cluster.center[1] * (cluster.incidents.length - 1) + incident.longitude) / cluster.incidents.length;
              found = true;
              break;
            }
          }
        }
        if (!found) {
          clusters.push({
            center: [incident.latitude, incident.longitude],
            incidents: [incident]
          });
        }
      });

      clusters.forEach((cluster) => {
        if (cluster.incidents.length === 1) {
          const incident = cluster.incidents[0];
          const isCitizen = incident.id.startsWith('CIT-');
          const isSelected = selectedIncident && selectedIncident.id === incident.id;
          const color = colorMap[incident.risk_level as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'] || '#10b981';
          
          let markerHtml = `
            <div class="relative flex items-center justify-center" style="width: 36px; height: 36px;">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style="background-color: ${color}; width: 24px; height: 24px;"></span>
              <span class="relative inline-flex rounded-full border border-white  shadow-md transition-transform duration-200 ${isSelected ? 'scale-125 ring-2 ring-blue-500/40' : 'hover:scale-110'}" 
                    style="background-color: ${color}; width: 14px; height: 14px;"></span>
            </div>
          `;

          if (isCitizen) {
            markerHtml = `
              <div class="relative flex items-center justify-center" style="width: 36px; height: 36px;">
                <span class="animate-pulse absolute inline-flex h-full w-full rounded-full bg-orange-500/30" style="width: 28px; height: 28px;"></span>
                <div class="relative inline-flex rounded-xl border border-white  shadow-md transition-transform duration-200 bg-gradient-to-br from-amber-500 to-orange-600 text-white items-center justify-center ${isSelected ? 'scale-120 ring-2 ring-orange-500/45' : 'hover:scale-110'}" 
                     style="width: 20px; height: 20px;">
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </div>
              </div>
            `;
          }

          const icon = L.divIcon({
            className: isCitizen ? 'citizen-marker' : 'custom-marker',
            html: markerHtml,
            iconSize: isCitizen ? [36, 36] : [36, 36],
            iconAnchor: isCitizen ? [18, 18] : [18, 18],
          });

          const marker = L.marker([incident.latitude, incident.longitude], { icon });

          let recommendationText = "Sync signal timing outbound.";
          if (incident.event_cause.includes("breakdown")) {
            recommendationText = "Deploy heavy recovery towing asset from depot immediately.";
          } else if (incident.event_cause.includes("flooding")) {
            recommendationText = "Close flooded arterial lanes and deploy pumping crew.";
          } else if (incident.event_cause.includes("accident")) {
            recommendationText = "Dispatch emergency medical/patrol squad. Set dynamic reroutes.";
          } else if (incident.event_cause.includes("construction")) {
            recommendationText = "Extend green-phase timing outbound by 15s to prevent gridlock.";
          }

          let popupContent = `
            <div class="p-3 font-sans max-w-[260px] text-slate-800  font-medium">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[9.5px] font-bold text-slate-450  font-mono tracking-wider">${incident.id}</span>
                <span class="text-[9px] font-extrabold px-2 py-0.5 rounded-full border" style="background-color: ${color}15; border-color: ${color}30; color: ${color}">${incident.risk_level}</span>
              </div>
              <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${incident.nearest_junction}</h4>
              <p class="text-[11px] text-slate-650  leading-relaxed mb-3">${incident.description}</p>
          `;

          if (isCitizen && incident.translated_description) {
            popupContent += `
              <div class="p-2 bg-blue-50/50  border border-blue-100/30 rounded-xl mb-3 text-[10px]">
                <span class="text-[8px] font-black text-blue-600  block uppercase mb-0.5">AI Translated</span>
                <p class="text-slate-650  italic font-semibold">"${incident.translated_description}"</p>
              </div>
            `;
          }

          if (isCitizen && incident.image) {
            popupContent += `
              <div class="mb-3 rounded-lg overflow-hidden border border-slate-150  aspect-video max-h-24">
                <img src="${incident.image}" alt="Incident evidence" class="w-full h-full object-cover" />
              </div>
            `;
          }

          popupContent += `
              <div class="grid grid-cols-2 gap-2 bg-slate-50  p-2 rounded border border-slate-150  mb-3 text-[10px]">
                <div>
                  <span class="text-[9px] uppercase text-slate-400 font-bold block">Congestion</span>
                  <strong class="text-slate-800 ">${incident.congestion_score}/100</strong>
                </div>
                <div>
                  <span class="text-[9px] uppercase text-slate-400 font-bold block">Status</span>
                  <strong class="text-blue-650 ">${incident.status}</strong>
                </div>
              </div>
              <div class="border-t border-slate-200  pt-2 text-[11px]">
                <span class="text-[9px] uppercase font-bold text-blue-600  block mb-0.5">${isCitizen ? 'Assigned Patrol Authority' : 'Recommendation'}</span>
                <p class="text-slate-700  font-semibold leading-normal">${isCitizen ? `${incident.assigned_resource} (${incident.nearest_junction_dist_km} km away)` : recommendationText}</p>
              </div>
            </div>
          `;

          marker.bindPopup(popupContent, { closeButton: false, className: 'custom-popup-box' });
          marker.on('click', () => { if (onSelectIncident) onSelectIncident(incident); });
          markerGroupRef.current?.addLayer(marker);
        } else {
          const maxRisk = cluster.incidents.reduce((max, inc) => {
            const weights = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
            const currentWeight = weights[inc.risk_level as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'] || 1;
            const maxWeight = weights[max as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'] || 1;
            return currentWeight > maxWeight ? inc.risk_level : max;
          }, 'LOW');
          const color = colorMap[maxRisk as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'] || '#ef4444';
          const count = cluster.incidents.length;

          const clusterHtml = `
            <div class="relative flex items-center justify-center animate-pulse" style="width: 40px; height: 40px;">
              <span class="absolute inline-flex h-full w-full rounded-full opacity-35" style="background-color: ${color}; width: 34px; height: 34px;"></span>
              <div class="relative inline-flex rounded-full border-2 border-white  shadow-2xl text-white font-extrabold text-[11px] items-center justify-center font-mono cursor-pointer animate-scale-up" 
                   style="background-color: ${color}; width: 26px; height: 26px;">
                ${count}
              </div>
            </div>
          `;

          const icon = L.divIcon({
            className: 'incident-cluster-marker',
            html: clusterHtml,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          });

          const marker = L.marker(cluster.center, { icon });
          
          let popupContent = `
            <div class="p-3 font-sans max-w-[260px] text-slate-800  font-medium">
              <span class="text-[9px] uppercase font-extrabold text-blue-500 font-mono tracking-wider block mb-1">Incident Cluster</span>
              <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-2">${count} incidents in this area</h4>
              <div class="max-h-[140px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 ">
          `;

          cluster.incidents.forEach((inc) => {
            const incColor = colorMap[inc.risk_level as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'] || '#10b981';
            popupContent += `
              <div class="pt-1.5 first:pt-0">
                <div class="flex justify-between items-center text-[10px]">
                  <strong class="text-slate-800  truncate pr-2">${inc.id} (${inc.event_cause})</strong>
                  <span class="font-bold shrink-0 text-[9px]" style="color: ${incColor}">${inc.risk_level}</span>
                </div>
                <p class="text-[10.5px] text-slate-550  line-clamp-1">${inc.description}</p>
              </div>
            `;
          });

          popupContent += `
              </div>
              <div class="mt-2.5 border-t border-slate-100  pt-2 text-[9px] text-center text-blue-650  font-extrabold">
                Click cluster to zoom in
              </div>
            </div>
          `;

          marker.bindPopup(popupContent, { closeButton: false });
          marker.on('click', () => {
            if (mapRef.current) {
              mapRef.current.setView(cluster.center, mapRef.current.getZoom() + 2, { animate: true });
            }
          });
          markerGroupRef.current?.addLayer(marker);
        }
      });
    }

    // ─────────────────────────────────────────
    // 2. EVENT MARKERS
    // ─────────────────────────────────────────
    if (eventGroupRef.current) {
      eventGroupRef.current.clearLayers();
      if (activeLayers.events) {
        const mockEvents = BENGALURU_LOCATIONS.filter(loc => loc.baseScore >= 72).map((loc, idx) => {
          const type = idx % 4 === 0 ? "Sports" : idx % 4 === 1 ? "Concert" : idx % 4 === 2 ? "Exhibition" : "Rally";
          const crowd = idx % 3 === 0 ? "25,000+" : idx % 3 === 1 ? "15,000+" : "35,000+";
          const delayVal = idx % 2 === 0 ? "+25m" : "+35m";
          return {
            id: `EV-00${idx + 1}`,
            name: `${loc.name.replace(" Junction", "").replace(" Bridge", "")} Event`,
            location: loc.name,
            lat: loc.lat + 0.001,
            lon: loc.lon + 0.001,
            type,
            crowd,
            time: "17:00 — 22:00",
            delay: delayVal,
            risk: loc.risk,
            officers: Math.round(loc.baseScore / 8),
            barricades: Math.round(loc.baseScore / 2)
          };
        });


        mockEvents.forEach((ev) => {
          const eventColor = ev.risk === 'CRITICAL' ? '#ef4444' : ev.risk === 'HIGH' ? '#f97316' : '#eab308';
          const icon = L.divIcon({
            className: 'event-marker',
            html: `
              <div class="relative flex items-center justify-center" style="width: 42px; height: 42px;">
                <span class="animate-ping absolute inline-flex rounded-full opacity-50" style="background-color: ${eventColor}; width: 36px; height: 36px;"></span>
                <div class="relative rounded-full border-2 border-white  shadow-xl flex items-center justify-center text-white" 
                     style="background-color: ${eventColor}; width: 32px; height: 32px;">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [42, 42],
            iconAnchor: [21, 21],
          });

          L.marker([ev.lat, ev.lon], { icon })
            .addTo(eventGroupRef.current!)
            .bindPopup(`
              <div class="p-3 font-sans max-w-[280px] text-slate-800 ">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[9px] font-bold text-slate-400 font-mono tracking-wider">${ev.id}</span>
                  <span class="text-[9px] font-extrabold px-2 py-0.5 rounded border" style="background-color: ${eventColor}15; border-color: ${eventColor}30; color: ${eventColor}">${ev.risk} RISK</span>
                </div>
                <h4 class="font-extrabold text-sm text-slate-900  leading-tight mb-1">${ev.name}</h4>
                <p class="text-[11px] text-slate-500 mb-2">📍 ${ev.location} &nbsp;•&nbsp; ${ev.type}</p>
                <div class="grid grid-cols-2 gap-2 bg-slate-50  p-2.5 rounded-lg border border-slate-150  mb-2 text-[10.5px]">
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Expected Crowd</span>
                    <strong class="text-slate-800 ">${ev.crowd}</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Time Window</span>
                    <strong class="text-slate-800 ">${ev.time}</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Officers Deployed</span>
                    <strong class="text-blue-600">${ev.officers}</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Barricades Placed</span>
                    <strong class="text-amber-600">${ev.barricades}</strong>
                  </div>
                </div>
                <div class="text-[10px] font-semibold text-rose-500">⏱️ Expected Additional Delay: ${ev.delay}</div>
              </div>
            `, { closeButton: false });
        });
      }
    }

    // ─────────────────────────────────────────
    // 3. CONGESTION ZONES (heatmap rings)
    // ─────────────────────────────────────────
    if (congestionGroupRef.current) {
      congestionGroupRef.current.clearLayers();
      if (activeLayers.congestion) {
        const hotspots = BENGALURU_LOCATIONS.map(loc => ({
          name: loc.name,
          lat: loc.lat,
          lon: loc.lon,
          risk: loc.risk === 'CRITICAL' ? 'CRITICAL' : loc.risk === 'HIGH' ? 'HIGH' : loc.baseScore >= 50 ? 'MODERATE' : 'LOW',
          score: loc.baseScore,
          delay: loc.delay
        }));


        hotspots.forEach((spot) => {
          let color = '#10b981';
          if (spot.risk === 'CRITICAL') color = '#ef4444';
          else if (spot.risk === 'HIGH') color = '#f97316';
          else if (spot.risk === 'MODERATE') color = '#eab308';

          const radius = spot.risk === 'CRITICAL' ? 600 : spot.risk === 'HIGH' ? 450 : 300;

          const circle = L.circle([spot.lat, spot.lon], {
            radius,
            fillColor: color,
            fillOpacity: 0.06,
            color: color,
            weight: 0.8,
            dashArray: '4, 4'
          }).addTo(congestionGroupRef.current!);

          circle.bindPopup(`
            <div class="p-2.5 font-sans max-w-[220px] text-slate-800 ">
              <span class="text-[9px] uppercase font-bold text-slate-400 block mb-1">Congestion Hotspot</span>
              <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-2">${spot.name}</h4>
              <div class="space-y-1 text-[11px] text-slate-600 ">
                <div>Congestion Score: <strong class="text-slate-850 ">${spot.score}%</strong></div>
                <div>Risk: <strong style="color: ${color}">${spot.risk}</strong></div>
                <div>Est. Delay: <strong>${spot.delay} mins</strong></div>
              </div>
            </div>
          `, { closeButton: false });

          circle.on('click', () => { if (onSelectHotspot) onSelectHotspot(spot); });
        });
      }
    }

    // ─────────────────────────────────────────
    // 4. ROAD CLOSURES
    // ─────────────────────────────────────────
    if (closureGroupRef.current) {
      closureGroupRef.current.clearLayers();
      if (activeLayers.closures) {
        // Dynamic planned closures based on high baseScore locations in the dataset
        const plannedClosures = BENGALURU_LOCATIONS.filter(loc => loc.baseScore >= 80).map((loc, idx) => {
          const reasons = [
            "Metro Rail Girder Launching — Lanes Restricted",
            "Major Pothole Filling & Asphalt Repair",
            "VIP Motorcade Route Lockdown",
            "Underground Drainage Repair Work"
          ];
          const severity = idx % 2 === 0 ? "FULL" : "PARTIAL";
          const duration = idx % 2 === 0 ? "22:00 — 06:00" : "Active — Est. 2hrs";
          return {
            name: loc.name,
            lat: loc.lat - 0.0002,
            lon: loc.lon + 0.0002,
            reason: reasons[idx % reasons.length],
            duration,
            severity
          };
        });

        plannedClosures.forEach(closure => {
          const isFull = closure.severity === 'FULL';
          const closureIcon = L.divIcon({
            className: 'closure-marker',
            html: `
              <div class="relative flex items-center justify-center" style="width: 34px; height: 34px;">
                ${isFull ? '<span class="animate-ping absolute inline-flex rounded-full bg-rose-500 opacity-40" style="width: 30px; height: 30px;"></span>' : ''}
                <div class="${isFull ? 'bg-rose-600' : 'bg-orange-500'} text-white rounded-lg p-1 border-2 border-white  shadow-xl flex items-center justify-center" style="width: 28px; height: 28px;">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          });

          L.marker([closure.lat, closure.lon], { icon: closureIcon })
            .addTo(closureGroupRef.current!)
            .bindPopup(`
              <div class="p-3 font-sans max-w-[240px] text-slate-800 ">
                <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${isFull ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'} tracking-wider block w-fit mb-1.5">${closure.severity} CLOSURE</span>
                <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${closure.name}</h4>
                <p class="text-[11px] text-slate-500 mb-2">${closure.reason}</p>
                <div class="text-[10px] font-mono font-bold text-slate-600  bg-slate-50  px-2 py-1 rounded">🕐 ${closure.duration}</div>
              </div>
            `, { closeButton: false });
        });

        // Also render from high-probability incidents
        incidents.forEach((inc) => {
          if (inc.probability_closure > 0.70 || inc.status === 'ON_SCENE') {
            const hazardIcon = L.divIcon({
              className: 'closure-marker',
              html: `
                <div class="relative flex items-center justify-center" style="width: 32px; height: 32px;">
                  <div class="bg-rose-600 text-white rounded-lg p-1.5 border-2 border-white  shadow-xl flex items-center justify-center" style="width: 28px; height: 28px;">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                    </svg>
                  </div>
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            });

            L.marker([inc.latitude, inc.longitude], { icon: hazardIcon })
              .addTo(closureGroupRef.current!)
              .bindPopup(`
                <div class="p-2 text-xs font-sans max-w-[210px]">
                  <span class="bg-rose-100 text-rose-700 font-extrabold text-[9px] px-1.5 py-0.5 rounded tracking-wider block w-fit mb-1">ROAD CLOSED</span>
                  <h4 class="font-bold text-slate-900">${inc.nearest_junction}</h4>
                  <p class="text-[11px] text-slate-500 mt-1">Closure probability: <strong>${(inc.probability_closure * 100).toFixed(1)}%</strong>. Detours active. Officers dispatched.</p>
                </div>
              `, { closeButton: false });
          }
        });
      }
    }

    // ─────────────────────────────────────────
    // 5. DIVERSION ROUTES (glowing polylines)
    // ─────────────────────────────────────────
    if (diversionGroupRef.current) {
      diversionGroupRef.current.clearLayers();
      if (activeLayers.diversions) {
        const detours = BENGALURU_LOCATIONS.filter(loc => loc.baseScore >= 75).map((loc, idx) => {
          const lat = loc.lat;
          const lon = loc.lon;
          return {
            name: `${loc.name.replace(" Junction", "").replace(" Bridge", "")} Diversion`,
            points: [
              [lat - 0.005, lon - 0.005],
              [lat - 0.003, lon - 0.010],
              [lat + 0.002, lon - 0.008],
              [lat + 0.005, lon + 0.005]
            ] as [number, number][],
            desc: `Dynamic diversion routes active to bypass heavy congestion around ${loc.name}.`,
            savings: `${15 + idx * 3} mins saved`,
            status: idx % 2 === 0 ? "ACTIVE" : "STANDBY"
          };
        });


        detours.forEach((route) => {
          // Glow effect — wider background line
          L.polyline(route.points as L.LatLngExpression[], {
            color: route.status === 'ACTIVE' ? '#06b6d4' : '#94a3b8',
            weight: 10,
            opacity: 0.15,
          }).addTo(diversionGroupRef.current!);

          // Main dashed line
          const polyline = L.polyline(route.points as L.LatLngExpression[], {
            color: route.status === 'ACTIVE' ? '#06b6d4' : '#94a3b8',
            weight: 4,
            opacity: 0.9,
            dashArray: '10, 6'
          }).addTo(diversionGroupRef.current!);

          // Arrow markers along route
          const midIdx = Math.floor(route.points.length / 2);
          const midPoint = route.points[midIdx];
          const arrowIcon = L.divIcon({
            className: 'diversion-arrow',
            html: `
              <div style="width: 22px; height: 22px; background: ${route.status === 'ACTIVE' ? '#06b6d4' : '#94a3b8'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="white" stroke-width="3" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </div>
            `,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          L.marker(midPoint as L.LatLngExpression, { icon: arrowIcon }).addTo(diversionGroupRef.current!);

          polyline.bindPopup(`
            <div class="p-3 font-sans max-w-[240px] text-slate-800 ">
              <div class="flex items-center justify-between mb-1.5">
                <span class="bg-cyan-100 text-cyan-800 font-extrabold text-[9px] px-2 py-0.5 rounded tracking-wider">DETOUR PATH</span>
                <span class="text-[9px] font-bold ${route.status === 'ACTIVE' ? 'text-emerald-600' : 'text-slate-400'}">${route.status}</span>
              </div>
              <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${route.name}</h4>
              <p class="text-[11px] text-slate-500 leading-normal mb-2">${route.desc}</p>
              <div class="text-[11px] font-bold text-emerald-600  bg-emerald-50  px-2 py-1 rounded">⏱️ ${route.savings}</div>
            </div>
          `, { closeButton: false });
        });
      }
    }

    // ─────────────────────────────────────────
    // 6. POLICE DEPLOYMENT POINTS
    // ─────────────────────────────────────────
    if (policeGroupRef.current) {
      policeGroupRef.current.clearLayers();
      if (activeLayers.police) {
        // Dynamic Police Deployment Points based on coordinates from the dataset
        const policePoints = BENGALURU_LOCATIONS.map((loc, idx) => {
          let officers: number;
          let status: string;
          let duty: string;

          if (loc.risk === "CRITICAL") {
            officers = 6 + (idx % 3);
            status = "VIP PROTOCOL";
            duty = "Arterial clearance & intersection locking";
          } else if (loc.risk === "HIGH") {
            officers = 4 + (idx % 2);
            status = "MANUAL SIGNAL";
            duty = "Signal override & lane management";
          } else if (loc.baseScore > 50) {
            officers = 3;
            status = "EVENT DUTY";
            duty = "Flow monitoring & peak-hour management";
          } else {
            officers = 2;
            status = "PATROL";
            duty = "Routine surveillance & breakdown checks";
          }

          return {
            name: `${loc.name.replace(" Junction", "").replace(" Bridge", "")} Checkpoint`,
            lat: loc.lat - 0.0005,
            lon: loc.lon + 0.0005,
            officers,
            status,
            duty
          };
        });

        policePoints.forEach((pt) => {
          const statusColor = pt.status === 'VIP PROTOCOL' ? '#8b5cf6' : pt.status === 'MANUAL SIGNAL' ? '#f59e0b' : pt.status === 'EVENT DUTY' ? '#f97316' : '#3b82f6';
          const policeIcon = L.divIcon({
            className: 'police-marker',
            html: `
              <div class="relative flex items-center justify-center" style="width: 34px; height: 34px;">
                <div class="text-white rounded-full p-1 border-2 border-white  shadow-xl flex items-center justify-center" 
                     style="background-color: ${statusColor}; width: 28px; height: 28px;">
                  <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </div>
                <span class="absolute -top-1 -right-1 bg-white  text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center border shadow-sm" style="color: ${statusColor};">${pt.officers}</span>
              </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          });

          L.marker([pt.lat, pt.lon], { icon: policeIcon })
            .addTo(policeGroupRef.current!)
            .bindPopup(`
              <div class="p-3 font-sans max-w-[240px] text-slate-800 ">
                <span class="text-[9px] uppercase font-bold block mb-1.5" style="color: ${statusColor}">🛡️ Police Deployment Point</span>
                <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${pt.name}</h4>
                <div class="grid grid-cols-2 gap-2 bg-slate-50  p-2 rounded-lg border border-slate-150  mb-2 text-[10.5px]">
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Officers</span>
                    <strong style="color: ${statusColor}">${pt.officers}</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Status</span>
                    <strong style="color: ${statusColor}">${pt.status}</strong>
                  </div>
                </div>
                <p class="text-[10px] text-slate-500 italic">${pt.duty}</p>
              </div>
            `, { closeButton: false });
        });
      }
    }

    // ─────────────────────────────────────────
    // 7. BARRICADE LOCATIONS (NEW)
    // ─────────────────────────────────────────
    if (barricadeGroupRef.current) {
      barricadeGroupRef.current.clearLayers();
      if (activeLayers.barricades) {
        // Dynamic Barricade Locations based on dataset metrics
        const barricadePoints = BENGALURU_LOCATIONS.filter(loc => loc.baseScore >= 45).map((loc, idx) => {
          const count = Math.round(loc.baseScore / 3) + (idx % 5);
          const type = idx % 3 === 0 ? "Steel" : idx % 3 === 1 ? "Water-filled" : "Concrete";
          const status = loc.risk === "CRITICAL" || loc.risk === "HIGH" ? "DEPLOYED" : idx % 2 === 0 ? "READY" : "STANDBY";
          return {
            name: `${loc.name.replace(" Junction", "").replace(" Bridge", "")} Flow Splitter`,
            lat: loc.lat + 0.0006,
            lon: loc.lon - 0.0006,
            count,
            type,
            status,
            junction: loc.name
          };
        });

        barricadePoints.forEach((b) => {
          const isDeployed = b.status === 'DEPLOYED';
          const barricadeIcon = L.divIcon({
            className: 'barricade-marker',
            html: `
              <div class="relative flex items-center justify-center" style="width: 30px; height: 30px;">
                <div class="${isDeployed ? 'bg-amber-500' : 'bg-slate-400'} text-white rounded-md p-0.5 border-2 border-white  shadow-lg flex items-center justify-center" style="width: 24px; height: 24px;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="6" width="20" height="4" rx="1"></rect>
                    <line x1="6" y1="10" x2="6" y2="16"></line>
                    <line x1="18" y1="10" x2="18" y2="16"></line>
                    <line x1="2" y1="16" x2="22" y2="16"></line>
                  </svg>
                </div>
                <span class="absolute -top-1.5 -right-1.5 bg-white  text-[7px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center border shadow-sm ${isDeployed ? 'text-amber-600' : 'text-slate-400'}">${b.count}</span>
              </div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });

          L.marker([b.lat, b.lon], { icon: barricadeIcon })
            .addTo(barricadeGroupRef.current!)
            .bindPopup(`
              <div class="p-3 font-sans max-w-[230px] text-slate-800 ">
                <span class="text-[9px] uppercase font-bold text-amber-600 block mb-1.5">🚧 Barricade Location</span>
                <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${b.name}</h4>
                <div class="grid grid-cols-2 gap-2 bg-slate-50  p-2 rounded-lg border border-slate-150  mb-2 text-[10.5px]">
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Count</span>
                    <strong class="text-amber-600">${b.count} units</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Type</span>
                    <strong class="text-slate-700 ">${b.type}</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Status</span>
                    <strong class="${isDeployed ? 'text-emerald-600' : 'text-slate-400'}">${b.status}</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Junction</span>
                    <strong class="text-slate-700 ">${b.junction}</strong>
                  </div>
                </div>
              </div>
            `, { closeButton: false });
        });
      }
    }

    // ─────────────────────────────────────────
    // 8. EMERGENCY RESPONSE ZONES
    // ─────────────────────────────────────────
    if (emergencyGroupRef.current) {
      emergencyGroupRef.current.clearLayers();
      if (activeLayers.emergency) {
        // Dynamic Emergency Response Units based on locations and zones
        const erUnits = BENGALURU_LOCATIONS.filter(loc => loc.baseScore >= 55).map((loc, idx) => {
          const types = ["Towing", "Drainage", "Medical", "Fire", "Tree Clearance", "Command"];
          const type = types[idx % types.length];
          const icons = {
            "Towing": "🚛",
            "Drainage": "💧",
            "Medical": "🚑",
            "Fire": "🚒",
            "Tree Clearance": "🌳",
            "Command": "📡"
          };
          const unitNames = {
            "Towing": `Heavy Tow Truck ${idx + 1}`,
            "Drainage": `BBMP Pumping Unit ${idx + 1}`,
            "Medical": `Trauma Response Ambulance ${idx + 1}`,
            "Fire": `Emergency Fire Tender ${idx + 1}`,
            "Tree Clearance": `Horticulture Tree Clearer ${idx + 1}`,
            "Command": `Mobile Command Center ${idx + 1}`
          };
          
          let status = "AVAILABLE";
          if (loc.risk === "CRITICAL") {
            status = "DISPATCHED";
          } else if (loc.risk === "HIGH") {
            status = "ACTIVE";
          } else if (idx % 2 === 0) {
            status = "STANDBY";
          }

          return {
            name: unitNames[type as keyof typeof unitNames],
            type,
            status,
            base: `${loc.zone} Station`,
            lat: loc.lat - 0.0008,
            lon: loc.lon - 0.0008,
            icon: icons[type as keyof typeof icons] || "🚛"
          };
        });

        erUnits.forEach((unit) => {
          const isActive = unit.status === 'DISPATCHED' || unit.status === 'ACTIVE' || unit.status === 'DEPLOYED';
          const statusColor = isActive ? '#ef4444' : unit.status === 'STANDBY' ? '#f59e0b' : '#10b981';

          const unitIcon = L.divIcon({
            className: 'emergency-marker',
            html: `
              <div class="relative flex items-center justify-center" style="width: 36px; height: 36px;">
                ${isActive ? '<span class="animate-ping absolute inline-flex rounded-full opacity-40" style="background-color: ' + statusColor + '; width: 32px; height: 32px;"></span>' : ''}
                <div class="bg-white  rounded-full border-2 shadow-xl flex items-center justify-center" 
                     style="width: 30px; height: 30px; border-color: ${statusColor};">
                  <span style="font-size: 15px; line-height: 1;">${unit.icon}</span>
                </div>
                <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white " style="background-color: ${statusColor};"></span>
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });

          L.marker([unit.lat, unit.lon], { icon: unitIcon })
            .addTo(emergencyGroupRef.current!)
            .bindPopup(`
              <div class="p-3 font-sans max-w-[240px] text-slate-800 ">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[9px] uppercase font-bold text-amber-600">${unit.icon} Emergency Unit</span>
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded" style="background-color: ${statusColor}20; color: ${statusColor}">${unit.status}</span>
                </div>
                <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${unit.name}</h4>
                <div class="grid grid-cols-2 gap-2 bg-slate-50  p-2 rounded-lg border border-slate-150  text-[10.5px]">
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Type</span>
                    <strong class="text-slate-700 ">${unit.type}</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Base</span>
                    <strong class="text-slate-700 ">${unit.base}</strong>
                  </div>
                </div>
              </div>
            `, { closeButton: false });
        });
      }
    }

    // ─────────────────────────────────────────
    // 8.5. TRAFFIC MARSHALS DEPLOYMENT ZONES
    // ─────────────────────────────────────────
    if (marshalGroupRef.current) {
      marshalGroupRef.current.clearLayers();
      if (activeLayers.marshals) {
        const marshalPoints = BENGALURU_LOCATIONS.filter(loc => loc.baseScore >= 40).map((loc, idx) => {
          const count = Math.round(loc.baseScore / 8) + 1;
          const shift = idx % 2 === 0 ? "Day Shift" : "Night Shift";
          let status = "DEPLOYED";
          if (loc.risk === "CRITICAL") status = "VIP COORDINATION";
          return {
            name: `${loc.name.replace(" Junction", "").replace(" Bridge", "")} Marshal Post`,
            lat: loc.lat + 0.0004,
            lon: loc.lon + 0.0004,
            count,
            shift,
            status,
            junction: loc.name
          };
        });

        marshalPoints.forEach((m) => {
          const statusColor = '#10b981'; // Emerald
          const marshalIcon = L.divIcon({
            className: 'marshal-marker',
            html: `
              <div class="relative flex items-center justify-center" style="width: 32px; height: 32px;">
                <div class="bg-emerald-500 text-white rounded-full p-1 border-2 border-white  shadow-xl flex items-center justify-center" 
                     style="width: 26px; height: 26px;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </div>
                <span class="absolute -top-1 -right-1 bg-white  text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center border shadow-sm" style="color: ${statusColor};">${m.count}</span>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          L.marker([m.lat, m.lon], { icon: marshalIcon })
            .addTo(marshalGroupRef.current!)
            .bindPopup(`
              <div class="p-3 font-sans max-w-[230px] text-slate-800 ">
                <span class="text-[9px] uppercase font-bold text-emerald-600 block mb-1.5">👮 Traffic Marshal Deployment</span>
                <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${m.name}</h4>
                <div class="grid grid-cols-2 gap-2 bg-slate-50  p-2 rounded-lg border border-slate-150  mb-2 text-[10.5px]">
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Count</span>
                    <strong class="text-emerald-600">${m.count} marshals</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Shift</span>
                    <strong class="text-slate-700 ">${m.shift}</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Status</span>
                    <strong class="text-emerald-600">${m.status}</strong>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase text-slate-400 font-bold block">Junction</span>
                    <strong class="text-slate-700 ">${m.junction}</strong>
                  </div>
                </div>
              </div>
            `, { closeButton: false });
        });
      }
    }

    // ─────────────────────────────────────────
    // 9. INCIDENT HEATMAP (Concentric glowing circles)
    // ─────────────────────────────────────────
    if (heatmapGroupRef.current) {
      heatmapGroupRef.current.clearLayers();
      if (activeLayers.heatmap) {
        // Classifier function
        const getIncidentHotspotType = (inc: Incident): 'accident' | 'water_logging' | 'vehicle_breakdown' | 'tree_fall' | 'public_event' | 'other' => {
          const cause = inc.event_cause.toLowerCase();
          const desc = inc.description.toLowerCase();
          if (cause === 'accident' || desc.includes('accident') || desc.includes('collision') || desc.includes('crash')) {
            return 'accident';
          }
          if (cause === 'water_logging' || cause === 'flooding' || desc.includes('water') || desc.includes('flood') || desc.includes('rain') || desc.includes('logging') || desc.includes('loging')) {
            return 'water_logging';
          }
          if (cause === 'vehicle_breakdown' || cause === 'breakdown' || desc.includes('breakdown') || desc.includes('break down') || desc.includes('off road') || desc.includes('offroad') || desc.includes('puncture') || desc.includes('punctured') || desc.includes('starting problem') || desc.includes('stuck')) {
            return 'vehicle_breakdown';
          }
          if (cause === 'tree_fall' || desc.includes('tree') || desc.includes('branch') || desc.includes('uproot')) {
            return 'tree_fall';
          }
          if (cause === 'public_event' || cause === 'procession' || cause === 'rally' || cause === 'protest' || desc.includes('expo') || desc.includes('derby') || desc.includes('match') || desc.includes('rally') || desc.includes('protest') || desc.includes('procession') || desc.includes('festival') || desc.includes('sports') || desc.includes('concert') || desc.includes('exhibition')) {
            return 'public_event';
          }
          return 'other';
        };

        const colors = {
          accident: '#f43f5e',
          water_logging: '#06b6d4',
          vehicle_breakdown: '#f59e0b',
          tree_fall: '#10b981',
          public_event: '#a855f7',
          other: '#64748b'
        };

        const labels = {
          accident: 'Accident Hotspot',
          water_logging: 'Water Logging Hotspot',
          vehicle_breakdown: 'Vehicle Breakdown Hotspot',
          tree_fall: 'Tree Fall Hotspot',
          public_event: 'Public Event Hotspot',
          other: 'Incident Hotspot'
        };

        incidents.forEach((inc) => {
          const type = getIncidentHotspotType(inc);
          if (heatmapTypeFilter !== 'all' && type !== heatmapTypeFilter) return;

          const color = colors[type];
          const label = labels[type];

          // 1. Draw outer circle (broad, faint glow)
          L.circle([inc.latitude, inc.longitude], {
            radius: 800,
            fillColor: color,
            fillOpacity: 0.03,
            color: color,
            weight: 0
          }).addTo(heatmapGroupRef.current!);

          // 2. Draw mid circle (medium density)
          L.circle([inc.latitude, inc.longitude], {
            radius: 400,
            fillColor: color,
            fillOpacity: 0.07,
            color: color,
            weight: 0
          }).addTo(heatmapGroupRef.current!);

          // 3. Draw inner circle (hot core, interactive)
          const core = L.circle([inc.latitude, inc.longitude], {
            radius: 120,
            fillColor: color,
            fillOpacity: 0.22,
            color: color,
            weight: 0
          }).addTo(heatmapGroupRef.current!);

          core.bindPopup(`
            <div class="p-3 font-sans max-w-[240px] text-slate-800 ">
              <div class="flex items-center justify-between mb-1.5">
                <span class="font-extrabold text-[9px] px-2 py-0.5 rounded tracking-wider text-white" style="background-color: ${color}">${label}</span>
                <span class="text-[9px] font-mono text-slate-400 font-bold">${inc.id}</span>
              </div>
              <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${inc.nearest_junction || 'Bengaluru Corridor'}</h4>
              <p class="text-[11px] text-slate-650  leading-relaxed mb-2.5">${inc.description}</p>
              <div class="grid grid-cols-2 gap-1.5 bg-slate-50  p-2 rounded border border-slate-150  text-[10.5px]">
                <div>
                  <span class="text-[9px] uppercase text-slate-400 font-bold block">Congestion Score</span>
                  <strong class="text-slate-800 ">${inc.congestion_score}/100</strong>
                </div>
                <div>
                  <span class="text-[9px] uppercase text-slate-400 font-bold block">Risk Level</span>
                  <strong style="color: ${color}">${inc.risk_level}</strong>
                </div>
              </div>
              <div class="text-[9px] text-slate-400 mt-2 font-mono">📍 ${inc.latitude.toFixed(5)}, ${inc.longitude.toFixed(5)}</div>
            </div>
          `, { closeButton: false });
        });
      }
    }

    // 10. WEATHER ALERTS (Rain, Flood Risk alerts)
    if (weatherGroupRef.current) {
      weatherGroupRef.current.clearLayers();
      if (activeLayers.weather && weatherData) {
        const isFloodRisk = weatherData.flood_risk === 'HIGH' || weatherData.flood_risk === 'MEDIUM';
        const hasRain = weatherData.rainfall_mm > 0;
        
        if (isFloodRisk || hasRain) {
          const floodLocations = [
            {
              name: 'Mysore Road (Near Satellite Bus Stand)',
              lat: 12.9580,
              lng: 77.5189,
              description: 'Low-lying zone prone to heavy waterlogging and slow traffic during monsoons.',
              riskLevel: weatherData.flood_risk
            },
            {
              name: 'Bannerghatta Road (Near MICO Layout)',
              lat: 12.9255,
              lng: 77.5736,
              description: 'Drainage channel overflow vulnerability; expected severe delays during rain.',
              riskLevel: weatherData.flood_risk
            },
            {
              name: 'Outer Ring Road (Hebbal Underpass)',
              lat: 13.0350,
              lng: 77.5978,
              description: 'Underpass vulnerable to rapid localized rain water accumulation.',
              riskLevel: weatherData.flood_risk
            }
          ];

          floodLocations.forEach((loc) => {
            const riskColor = loc.riskLevel === 'HIGH' ? '#f43f5e' : '#eab308';
            
            // Outer glow circle
            L.circle([loc.lat, loc.lng], {
              radius: 500,
              fillColor: riskColor,
              fillOpacity: 0.12,
              color: riskColor,
              weight: 1.5,
              dashArray: '4, 4'
            }).addTo(weatherGroupRef.current!);

            // Flashing weather warning icon
            const weatherIcon = L.divIcon({
              className: 'weather-alert-marker',
              html: `
                <div class="relative flex items-center justify-center animate-bounce" style="width: 36px; height: 36px; animation-duration: 2s;">
                  <span class="animate-ping absolute inline-flex rounded-full opacity-50" style="background-color: ${riskColor}; width: 28px; height: 28px;"></span>
                  <div class="bg-blue-600  rounded-full border-2 shadow-2xl flex items-center justify-center" 
                       style="width: 30px; height: 30px; border-color: ${riskColor};">
                    <span style="font-size: 15px; line-height: 1;">🌧️</span>
                  </div>
                </div>
              `,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            });

            L.marker([loc.lat, loc.lng], { icon: weatherIcon })
              .addTo(weatherGroupRef.current!)
              .bindPopup(`
                <div class="p-3 font-sans max-w-[240px] text-slate-800 ">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[9px] uppercase font-extrabold text-blue-500 font-mono tracking-wider flex items-center gap-1">
                      ⚠️ Weather Alert
                    </span>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style="background-color: ${riskColor};">
                      ${loc.riskLevel} RISK
                    </span>
                  </div>
                  <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${loc.name}</h4>
                  <p class="text-[11px] text-slate-650  leading-relaxed mb-2.5">${loc.description}</p>
                  
                  <div class="space-y-1 bg-slate-50  p-2 rounded-lg border border-slate-150  text-[10px]">
                    <div class="flex justify-between">
                      <span class="text-slate-400 font-bold uppercase">Rain Intensity:</span>
                      <strong class="text-slate-700 ">${weatherData.rainfall_mm} mm/hr</strong>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-400 font-bold uppercase">Visibility:</span>
                      <strong class="text-slate-700 ">${weatherData.visibility_km} km</strong>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-400 font-bold uppercase">Temperature:</span>
                      <strong class="text-slate-700 ">${weatherData.temperature}°C</strong>
                    </div>
                  </div>
                  
                  <div class="text-[9px] text-rose-500 font-semibold mt-2 border-t border-slate-100  pt-1.5">
                    ℹ️ Pre-emptive pumping crew & staff deployed nearby.
                  </div>
                </div>
              `, { closeButton: false });
          });
        }
      }

      // 11. TRAFFIC CAMERAS
      if (cameraGroupRef.current) {
        cameraGroupRef.current.clearLayers();
        if (activeLayers.cameras && cameras) {
          cameras.forEach((cam) => {
            const isJammed = cam.density === 'JAMMED';
            const markerColor = isJammed ? '#ef4444' : cam.density === 'HEAVY' ? '#f59e0b' : '#10b981';
            
            const isZoomedOut = zoomLevel < 13;
            
            const cameraIcon = isZoomedOut
              ? L.divIcon({
                  className: 'camera-dot-marker',
                  html: `
                    <div class="relative flex items-center justify-center" style="width: 12px; height: 12px;">
                      <div class="rounded-full border border-white  shadow-md transition-transform duration-200" 
                           style="width: 8px; height: 8px; background-color: ${markerColor};"></div>
                    </div>
                  `,
                  iconSize: [12, 12],
                  iconAnchor: [6, 6],
                })
              : L.divIcon({
                  className: 'camera-marker',
                  html: `
                    <div class="relative flex items-center justify-center ${isJammed ? 'animate-pulse' : ''}" style="width: 32px; height: 32px; animation-duration: 3s;">
                      <div class="bg-zinc-900  rounded-lg border-2 shadow-2xl flex items-center justify-center text-white" 
                           style="width: 26px; height: 26px; border-color: ${markerColor};">
                        <span style="font-size: 13px; line-height: 1;">📷</span>
                      </div>
                    </div>
                  `,
                  iconSize: [32, 32],
                  iconAnchor: [16, 16],
                });

            const popupContent = `
              <div class="p-3 font-sans max-w-[240px] text-slate-800  font-medium">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[9px] uppercase font-extrabold text-blue-500 font-mono tracking-wider">
                    CCTV Live Node
                  </span>
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style="background-color: ${markerColor};">
                    ${cam.density}
                  </span>
                </div>
                <h4 class="font-extrabold text-xs text-slate-900  leading-tight mb-1">${cam.name}</h4>
                <span class="text-[9px] font-mono text-slate-400 font-bold block mb-2">${cam.id}</span>
                
                <div class="space-y-1 bg-slate-50  p-2 rounded-lg border border-slate-150  text-[10px]">
                  <div class="flex justify-between">
                    <span class="text-slate-400 font-bold uppercase">Queue Length:</span>
                    <strong class="text-slate-750 ">${cam.queue_length_m} meters</strong>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400 font-bold uppercase">Vehicles/Min:</span>
                    <strong class="text-slate-750 ">${cam.vehicle_count} units</strong>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400 font-bold uppercase">Incident Alert:</span>
                    <strong class="${cam.incident !== 'None' ? 'text-red-500 font-bold' : 'text-slate-500'}">${cam.incident}</strong>
                  </div>
                </div>
                
                <div class="mt-2.5">
                  <button 
                    onclick="window.dispatchEvent(new CustomEvent('viewCamera', { detail: '${cam.id}' }))"
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold py-1.5 rounded text-center transition-all cursor-pointer block"
                  >
                    📺 Switch to Live CCTV Feed
                  </button>
                </div>
              </div>
            `;

            L.marker([cam.latitude, cam.longitude], { icon: cameraIcon })
              .addTo(cameraGroupRef.current!)
              .bindPopup(popupContent, { closeButton: false });
          });
        }
      }
    }
  }, [incidents, selectedIncident, activeLayers, heatmapTypeFilter, weatherData, cameras, useClustering, zoomLevel, onSelectHotspot, onSelectIncident]);

  // Center map on selected incident
  useEffect(() => {
    if (!mapRef.current || !selectedIncident) return;
    mapRef.current.setView([selectedIncident.latitude, selectedIncident.longitude], 14, {
      animate: true,
      duration: 0.8,
    });
  }, [selectedIncident]);

  const handleToggleFullscreen = () => {
    if (!mapWrapperRef.current) return;
    if (!document.fullscreenElement) {
      mapWrapperRef.current.requestFullscreen().catch(err => {
        console.error("Fullscreen request failed", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  return (
    <div 
      ref={mapWrapperRef}
      className={`relative w-full rounded-xl overflow-hidden border border-slate-200  shadow-sm bg-slate-100  transition-all ${
        isFullscreen ? 'map-fullscreen-wrapper' : 'h-full'
      }`}
    >
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: isFullscreen ? '100vh' : '520px' }} />

      {/* ═══════════════════════════════════════
          QUICK SEARCH FLOATING BAR (Top-Left)
          ═══════════════════════════════════════ */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col w-72">
        <div className="bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-lg flex items-center px-3 py-2 gap-2 transition-all focus-within:ring-2 focus-within:ring-blue-500/40">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search junctions, IDs, causes..."
            value={searchQuery}
            onChange={(e) => {
              const query = e.target.value;
              setSearchQuery(query);
              if (query.trim() === '') {
                setSearchResults([]);
              } else {
                const matchedIncidents: UnifiedSearchResult[] = incidents
                  .filter(inc => 
                    inc.nearest_junction.toLowerCase().includes(query.toLowerCase()) ||
                    inc.id.toLowerCase().includes(query.toLowerCase()) ||
                    inc.event_cause.toLowerCase().includes(query.toLowerCase()) ||
                    inc.description.toLowerCase().includes(query.toLowerCase())
                  )
                  .map(inc => ({
                    type: 'incident',
                    id: inc.id,
                    title: inc.nearest_junction,
                    subtitle: inc.event_cause.toUpperCase(),
                    description: inc.description,
                    coords: [inc.latitude, inc.longitude],
                    risk_level: inc.risk_level,
                    incidentData: inc
                  }));

                const matchedJunctions: UnifiedSearchResult[] = BENGALURU_LOCATIONS
                  .filter(loc => 
                    loc.name.toLowerCase().includes(query.toLowerCase()) ||
                    loc.zone.toLowerCase().includes(query.toLowerCase())
                  )
                  .map((loc, idx) => ({
                    type: 'junction',
                    id: `JNC-${idx}`,
                    title: loc.name,
                    subtitle: `${loc.zone} (Risk: ${loc.risk})`,
                    description: `Delay: ${loc.delay} mins. Congestion score: ${loc.baseScore}%`,
                    coords: [loc.lat, loc.lon],
                    risk_level: loc.risk as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
                  }));

                setSearchResults([...matchedIncidents, ...matchedJunctions].slice(0, 6));
              }
            }}
            className="w-full text-xs bg-transparent border-none text-slate-800 focus:outline-none focus:ring-0 placeholder-slate-405"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="p-0.5 hover:bg-slate-150 rounded-full text-slate-400 transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-1 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl overflow-hidden text-left divide-y divide-slate-100">
            {searchResults.map((result) => {
              const riskColors = {
                LOW: '🟢',
                MEDIUM: '🟡',
                HIGH: '🟠',
                CRITICAL: '🔴'
              };
              const riskIndicator = riskColors[result.risk_level] || '🟢';
              const isJunction = result.type === 'junction';
              
              return (
                <button
                  key={result.id}
                  onClick={() => {
                    setHighlightCoords(result.coords);
                    if (result.type === 'incident' && result.incidentData && onSelectIncident) {
                      onSelectIncident(result.incidentData);
                    }
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="w-full px-3.5 py-2.5 hover:bg-slate-50 transition-colors flex flex-col gap-0.5 text-left font-sans cursor-pointer"
                >
                  <div className="flex items-center justify-between text-[9px] font-bold">
                    <span className="font-mono text-blue-600">{result.id}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[8px] uppercase tracking-wider ${isJunction ? 'bg-amber-100 text-amber-850  ' : 'bg-rose-100 text-rose-850  '}`}>
                      {isJunction ? '📍 Junction' : '🚨 Incident'}
                    </span>
                  </div>
                  <strong className="text-xs text-slate-800 leading-tight block truncate mt-0.5">
                    {riskIndicator} {result.title}
                  </strong>
                  <span className="text-[10px] text-slate-400 font-medium block truncate">
                    {result.subtitle}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate block mt-0.5">
                    {result.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Custom Fullscreen and Zoom Controls (Bottom-Left) */}
      <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-2">
        <button
          onClick={handleToggleFullscreen}
          className="custom-map-control p-2.5 rounded-xl shadow-lg cursor-pointer flex items-center justify-center h-10 w-10"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        
        <div className="flex border border-slate-200 rounded-xl overflow-hidden shadow-lg h-10">
          <button
            onClick={handleZoomIn}
            className="custom-map-control px-3.5 flex items-center justify-center cursor-pointer border-r border-slate-200"
            title="Zoom In"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="custom-map-control px-3.5 flex items-center justify-center cursor-pointer"
            title="Zoom Out"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          FLOATING COLLAPSIBLE LAYER PANEL (Top-Right)
          ═══════════════════════════════════════ */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col items-end">
        {!isLayerPanelOpen ? (
          <button
            onClick={() => setIsLayerPanelOpen(true)}
            className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200 shadow-lg text-slate-700 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer font-bold text-xs"
          >
            <Layers className="h-4 w-4" />
            <span>Map Layers</span>
          </button>
        ) : (
          <div className="bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-2xl w-64 overflow-hidden text-left flex flex-col font-sans transition-all animate-fade-in">
            {/* Panel Header */}
            <div className="bg-slate-50/50 px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-850 uppercase tracking-widest flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-blue-600" />
                Map Controls
              </span>
              <button
                onClick={() => setIsLayerPanelOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel Content */}
            <div className="p-3.5 space-y-4 max-h-[380px] overflow-y-auto custom-scrollbar">
              {/* Default Layers */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Visible Core Layers</span>
                <div className="space-y-1">
                  {[
                    { id: 'incidents', label: 'Incident Markers', desc: 'Active hazards', icon: '🚨' },
                    { id: 'congestion', label: 'Congestion Rings', desc: 'Dashed delay zones', icon: '🔴' },
                    { id: 'cameras', label: 'Live CCTV Cameras', desc: 'Camera node feeds', icon: '📷' }
                  ].map((layer) => (
                    <label key={layer.id} className="flex items-start gap-2.5 p-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={!!activeLayers[layer.id as keyof typeof activeLayers]}
                        onChange={() => onToggleLayer && onToggleLayer(layer.id)}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="text-[11px] leading-tight">
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <span>{layer.icon}</span>
                          {layer.label}
                        </span>
                        <span className="text-[9px] text-slate-400 block">{layer.desc}</span>
                      </div>
                    </label>
                  ))}

                  {/* Cluster Toggle */}
                  <label className="flex items-start gap-2.5 p-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors border-t border-slate-100 pt-2.5 mt-2">
                    <input
                      type="checkbox"
                      checked={useClustering}
                      onChange={() => setUseClustering(!useClustering)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="text-[11px] leading-tight">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        <span>📦</span>
                        Cluster Markers
                      </span>
                      <span className="text-[9px] text-slate-400 block">Group dense incidents</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Advanced Layers Toggle Section */}
              <div className="border-t border-slate-100 pt-3">
                <button
                  onClick={() => setIsAdvancedLayersOpen(!isAdvancedLayersOpen)}
                  className="w-full flex items-center justify-between text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider">Advanced Overlays</span>
                  {isAdvancedLayersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {isAdvancedLayersOpen && (
                  <div className="mt-2 space-y-1 pl-0.5 animate-slide-down">
                    {[
                      { id: 'events', label: 'Event Markers', desc: 'Planned public events', icon: '⭐' },
                      { id: 'police', label: 'Police Deployment', desc: 'Officer checkpoints', icon: '🛡️' },
                      { id: 'barricades', label: 'Barricade Locations', desc: 'Steel barrier positions', icon: '🚧' },
                      { id: 'emergency', label: 'Emergency Response', desc: 'Tow & medical crews', icon: '🚑' },
                      { id: 'marshals', label: 'Traffic Marshals', desc: 'Marshal deployments', icon: '👮' },
                      { id: 'closures', label: 'Road Closures', desc: 'Blocked street segments', icon: '⛔' },
                      { id: 'diversions', label: 'Diversion Routes', desc: 'Recommended diversions', icon: '↗️' },
                      { id: 'heatmap', label: 'Intensity Heatmap', desc: 'Density visualization', icon: '🔥' },
                      { id: 'weather', label: 'Weather Overlay', desc: 'Junction rain status', icon: '🌧️' }
                    ].map((layer) => (
                      <label key={layer.id} className="flex items-start gap-2.5 p-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={!!activeLayers[layer.id as keyof typeof activeLayers]}
                          onChange={() => onToggleLayer && onToggleLayer(layer.id)}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="text-[11px] leading-tight">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <span>{layer.icon}</span>
                            {layer.label}
                          </span>
                          <span className="text-[9px] text-slate-400 block">{layer.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Panel Footer */}
            <div className="bg-slate-50 px-3.5 py-2 border-t border-slate-200 text-[9px] text-slate-400 flex items-center justify-between">
              <span>{Object.values(activeLayers).filter(Boolean).length} layers active</span>
              <span className="font-mono">v1.2</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          PROFESSIONAL MAP LEGEND (Bottom-Right)
          ═══════════════════════════════════════ */}
      <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-2xl z-[1000] text-xs font-sans overflow-hidden" style={{ minWidth: '220px' }}>
        {/* Legend Header */}
        <div className="bg-slate-50 px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest">Map Legend</span>
          </div>
          <span className="text-[8px] font-mono text-slate-400">LIVE</span>
        </div>
        
        {/* Legend Content */}
        <div className="px-3.5 py-3 space-y-3">
          {/* Layer Markers Section */}
          <div className="space-y-2">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Overlay Markers</span>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { icon: '⭐', label: 'Event Marker', color: 'bg-orange-500' },
                { icon: '🛡️', label: 'Police Checkpoint', color: 'bg-blue-500' },
                { icon: '🚧', label: 'Barricade Position', color: 'bg-amber-500' },
                { icon: '🚑', label: 'Emergency Unit', color: 'bg-rose-500' },
                { icon: '👮', label: 'Traffic Marshal', color: 'bg-emerald-500' },
                { icon: '⛔', label: 'Road Closure', color: 'bg-red-600' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] w-4 text-center">{item.icon}</span>
                  <span className="text-[10px] font-semibold text-slate-700">{item.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <div className="w-4 flex justify-center">
                  <div className="w-3.5 h-0.5 bg-cyan-500 rounded" style={{ borderBottom: '2px dashed #06b6d4' }}></div>
                </div>
                <span className="text-[10px] font-semibold text-slate-700">Diversion Route</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100"></div>

          {/* Risk Index */}
          <div className="space-y-2">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Risk Classification</span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Critical', color: 'bg-rose-500', border: 'border-rose-600' },
                { label: 'High', color: 'bg-orange-500', border: 'border-orange-600' },
                { label: 'Moderate', color: 'bg-yellow-500', border: 'border-yellow-600' },
                { label: 'Low', color: 'bg-emerald-500', border: 'border-emerald-600' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.color} border ${item.border} shadow-sm`}></span>
                  <span className="text-[10px] font-semibold text-slate-700">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100"></div>

          {/* Heatmap Legend */}
          {activeLayers.heatmap && (
            <>
              <div className="space-y-2">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Heatmap Hotspots</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Accidents', color: '#f43f5e' },
                    { label: 'Water Log', color: '#06b6d4' },
                    { label: 'Breakdowns', color: '#f59e0b' },
                    { label: 'Tree Falls', color: '#10b981' },
                    { label: 'Events', color: '#a855f7' }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: item.color }}></span>
                      <span className="text-[10px] font-semibold text-slate-700">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Divider */}
              <div className="border-t border-slate-100"></div>
            </>
          )}

          {/* Unit Status */}
          <div className="space-y-2">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Unit Status</span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Available', color: 'bg-emerald-500' },
                { label: 'Standby', color: 'bg-amber-500' },
                { label: 'Dispatched', color: 'bg-rose-500' },
                { label: 'Deployed', color: 'bg-blue-500' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${item.color}`}></span>
                  <span className="text-[10px] text-slate-600">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend Footer */}
        <div className="bg-slate-50 px-3.5 py-1.5 border-t border-slate-200 text-center">
          <span className="text-[8px] text-slate-400 font-mono">ASTRAM • Bangalore Traffic Command</span>
        </div>
      </div>
    </div>
  );
});

export default MapViewer;
