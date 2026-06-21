import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { TrendingDown, Shield, Search, X, Layers, Maximize2, Minimize2, Plus, Minus } from 'lucide-react';

interface DiversionMapProps {
  routeId: string;
  center: [number, number];
  redRoute: [number, number][];
  blueRoute: [number, number][];
  greenRoute: [number, number][];
  stats: {
    vehiclesRedirected: string;
    travelTimeSaved: string;
    congestionReduction: number;
  };
}

export const DiversionMap: React.FC<DiversionMapProps> = React.memo(({
  routeId,
  center,
  redRoute,
  blueRoute,
  greenRoute,
  stats
}) => {
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const highlightGroupRef = useRef<L.LayerGroup | null>(null);

  // UI Control States
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCongestedRoute, setShowCongestedRoute] = useState(true);
  const [showAlternativeA, setShowAlternativeA] = useState(true);
  const [showAlternativeB, setShowAlternativeB] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; coords: [number, number]; desc: string }>>([]);
  const [highlightCoords, setHighlightCoords] = useState<[number, number] | null>(null);
  const initialCenterRef = useRef(center);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: initialCenterRef.current,
      zoom: 13,
      minZoom: 11,
      maxZoom: 15,
      zoomControl: false // Disable default zoom
    });

    const layersGroup = L.layerGroup().addTo(map);
    layersGroupRef.current = layersGroup;

    const highlightGroup = L.layerGroup().addTo(map);
    highlightGroupRef.current = highlightGroup;

    mapRef.current = map;

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
      
      // Invalidate Leaflet size to adapt to container changes
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

  // Update map tile layers on theme change
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

  // Update routes, markers and zoom when routeId or toggles change
  useEffect(() => {
    if (!mapRef.current || !layersGroupRef.current) return;

    const map = mapRef.current;
    const layersGroup = layersGroupRef.current;

    // Clear previous shapes
    layersGroup.clearLayers();

    // Fly to the center
    map.setView(center, 13, { animate: true, duration: 1.2 });

    // 1. Red Route (Congested)
    if (showCongestedRoute && redRoute.length > 0) {
      // Glow/Background line
      L.polyline(redRoute, {
        color: '#ef4444',
        weight: 10,
        opacity: 0.25
      }).addTo(layersGroup);

      // Core line
      L.polyline(redRoute, {
        color: '#b91c1c',
        weight: 5,
        opacity: 0.9
      }).addTo(layersGroup)
        .bindTooltip("<b>Congested Route</b><br/>Heavy delays & bumper-to-bumper queue", {
          sticky: true,
          className: 'custom-map-tooltip'
        });
    }

    // 2. Blue Route (Recommended Detour A)
    if (showAlternativeA && blueRoute.length > 0) {
      // Glow/Background line
      L.polyline(blueRoute, {
        color: '#06b6d4',
        weight: 12,
        opacity: 0.3
      }).addTo(layersGroup);

      // Core line
      L.polyline(blueRoute, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.95,
        dashArray: '8, 6'
      }).addTo(layersGroup)
        .bindTooltip("<b>Recommended Detour (Alternative A)</b><br/>Fastest flow, dynamic VMS active", {
          sticky: true,
          className: 'custom-map-tooltip'
        });
    }

    // 3. Green Route (Secondary Alternative B)
    if (showAlternativeB && greenRoute.length > 0) {
      // Glow/Background line
      L.polyline(greenRoute, {
        color: '#10b981',
        weight: 10,
        opacity: 0.25
      }).addTo(layersGroup);

      // Core line
      L.polyline(greenRoute, {
        color: '#047857',
        weight: 4,
        opacity: 0.85
      }).addTo(layersGroup)
        .bindTooltip("<b>Secondary Alternative (Alternative B)</b><br/>Steady flow, minor delays", {
          sticky: true,
          className: 'custom-map-tooltip'
        });
    }

    // Markers (Origin and Merge)
    if (showMarkers) {
      const originPoint = redRoute[0];
      if (originPoint) {
        const originIcon = L.divIcon({
          className: 'origin-marker',
          html: `
            <div class="relative flex items-center justify-center animate-pulse" style="width: 24px; height: 24px;">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-40"></span>
              <div class="rounded-full bg-rose-600 border-2 border-white shadow-md flex items-center justify-center font-bold text-white text-[9px] w-4 h-4">
                !
               </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        L.marker(originPoint, { icon: originIcon })
          .addTo(layersGroup)
          .bindPopup("<b>Divergence Point</b><br/>Bottleneck starts here. Rerouting logic triggered.");
      }

      const mergePoint = redRoute[redRoute.length - 1];
      if (mergePoint) {
        const mergeIcon = L.divIcon({
          className: 'merge-marker',
          html: `
            <div class="relative flex items-center justify-center" style="width: 24px; height: 24px;">
              <div class="rounded-full bg-blue-600 border-2 border-white shadow-md flex items-center justify-center font-bold text-white text-[9px] w-4 h-4">
                ✓
              </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        L.marker(mergePoint, { icon: mergeIcon })
          .addTo(layersGroup)
          .bindPopup("<b>Re-merge Point</b><br/>Alternative diversion routes merge back to main route.");
      }
    }
  }, [routeId, center, redRoute, blueRoute, greenRoute, showCongestedRoute, showAlternativeA, showAlternativeB, showMarkers]);

  // Update pulsing highlight layer
  useEffect(() => {
    if (!mapRef.current || !highlightGroupRef.current) return;

    highlightGroupRef.current.clearLayers();

    if (highlightCoords) {
      L.circle(highlightCoords, {
        radius: 350,
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

  // Compile searchable points in this diversion map
  const getSearchItems = () => {
    const items = [];
    if (redRoute && redRoute.length > 0) {
      items.push({ name: 'Origin / Divergence Point', coords: redRoute[0], desc: 'Bottleneck starting intersection' });
      items.push({ name: 'Destination / Re-merge Point', coords: redRoute[redRoute.length - 1], desc: 'Diversion reunion intersection' });
    }
    if (blueRoute && blueRoute.length > 0) {
      items.push({ name: 'Diversion Alternative A (Midpoint)', coords: blueRoute[Math.floor(blueRoute.length / 2)], desc: 'Recommended diversion route' });
    }
    if (greenRoute && greenRoute.length > 0) {
      items.push({ name: 'Diversion Alternative B (Midpoint)', coords: greenRoute[Math.floor(greenRoute.length / 2)], desc: 'Secondary diversion route' });
    }
    return items;
  };

  // Zoom handlers
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  // Fullscreen toggle
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

  return (
    <div 
      ref={mapWrapperRef}
      className={`relative w-full rounded-2xl border border-slate-200  overflow-hidden shadow-inner bg-slate-100  transition-all ${
        isFullscreen ? 'map-fullscreen-wrapper' : 'h-[380px]'
      }`}
    >
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full z-0" style={{ height: isFullscreen ? '100vh' : '100%' }} />

      {/* Search Overlay (Top-Left) */}
      <div className="absolute top-4 left-4 z-[400] flex flex-col w-[260px] font-sans">
        <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg flex items-center px-3 py-2 gap-2 focus-within:ring-2 focus-within:ring-blue-500/40">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search diversion nodes..."
            value={searchQuery}
            onChange={(e) => {
              const query = e.target.value;
              setSearchQuery(query);
              if (query.trim() === '') {
                setSearchResults([]);
              } else {
                const list = getSearchItems();
                const filtered = list.filter(item => 
                  item.name.toLowerCase().includes(query.toLowerCase()) ||
                  item.desc.toLowerCase().includes(query.toLowerCase())
                );
                setSearchResults(filtered);
              }
            }}
            className="w-full text-[11px] bg-transparent border-none text-slate-800 focus:outline-none placeholder-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Search dropdown list */}
        {searchResults.length > 0 && (
          <div className="mt-1 bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-xl overflow-hidden divide-y divide-slate-100">
            {searchResults.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  setHighlightCoords(item.coords);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="w-full px-3.5 py-2 hover:bg-slate-50 transition-colors flex flex-col text-left cursor-pointer"
              >
                <strong className="text-xs text-slate-800">{item.name}</strong>
                <span className="text-[9px] text-slate-450">{item.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Layers Panel (Top-Right, next to Fullscreen) */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col items-end font-sans">
        {!showLayersPanel ? (
          <button
            onClick={() => setShowLayersPanel(true)}
            className="custom-map-control px-2.5 py-2 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer shadow-md"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Routes</span>
          </button>
        ) : (
          <div className="bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-2xl p-2.5 w-44 text-left animate-fade-in flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1.5">
              <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Toggles</span>
              <button 
                onClick={() => setShowLayersPanel(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[10px] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCongestedRoute}
                  onChange={() => setShowCongestedRoute(!showCongestedRoute)}
                  className="rounded text-red-600 focus:ring-red-500 cursor-pointer"
                />
                <span>Congested Route</span>
              </label>

              <label className="flex items-center gap-2 text-[10px] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAlternativeA}
                  onChange={() => setShowAlternativeA(!showAlternativeA)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Alternative A</span>
              </label>

              <label className="flex items-center gap-2 text-[10px] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAlternativeB}
                  onChange={() => setShowAlternativeB(!showAlternativeB)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span>Alternative B</span>
              </label>

              <label className="flex items-center gap-2 text-[10px] text-slate-700 cursor-pointer border-t border-slate-100 pt-1.5">
                <input
                  type="checkbox"
                  checked={showMarkers}
                  onChange={() => setShowMarkers(!showMarkers)}
                  className="rounded text-blue-650 focus:ring-blue-500 cursor-pointer"
                />
                <span>Map Markers</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Floating Live Data Stats Overlay (Only show if not fullscreen or absolute positioned top left) */}
      {!isFullscreen && (
        <div className="absolute top-16 left-4 z-[400] w-[260px] bg-white/90 backdrop-blur border border-slate-200 rounded-xl p-4 shadow-xl space-y-3 pointer-events-auto">
          <div className="border-b border-slate-100 pb-2">
            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest block">detour live data</span>
            <h3 className="text-xs font-bold text-slate-800">Live Traffic Control Sync</h3>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-medium">Vehicles Redirected:</span>
              <span className="text-xs font-extrabold text-blue-600">{stats.vehiclesRedirected}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-medium">Travel Time Saved:</span>
              <span className="text-xs font-extrabold text-emerald-600">{stats.travelTimeSaved}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-medium">Congestion Relief:</span>
              <div className="flex items-center gap-1 text-emerald-600 font-extrabold text-xs">
                <TrendingDown className="h-3.5 w-3.5" />
                <span>-{stats.congestionReduction}%</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[9px] text-slate-400">
            <Shield className="h-3 w-3 text-emerald-500" />
            <span>Active dynamic signal sync on route</span>
          </div>
        </div>
      )}

      {/* Floating Map Legend */}
      <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur border border-slate-200 rounded-lg p-2.5 shadow-md space-y-1.5 text-[9.5px]">
        <div className="flex items-center gap-2">
          <span className="w-4 h-1.5 rounded-full bg-rose-600 inline-block"></span>
          <span className="text-slate-700 font-bold">Congested Bottleneck</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1.5 rounded-full bg-blue-600 inline-block border-t border-dashed border-white"></span>
          <span className="text-slate-700 font-bold">Recommended Detour (Alt A)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1.5 rounded-full bg-emerald-600 inline-block"></span>
          <span className="text-slate-700 font-bold">Secondary Detour (Alt B)</span>
        </div>
      </div>

      {/* Fullscreen Button (Bottom-Right, above zoom controls) */}
      <div className="absolute bottom-24 right-4 z-[400]">
        <button
          onClick={handleToggleFullscreen}
          className="custom-map-control p-2 rounded-xl shadow-md cursor-pointer flex items-center justify-center"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Custom React Zoom Control Buttons (Bottom-Right) */}
      <div className="absolute bottom-4 right-4 z-[400] flex flex-col border border-slate-200 rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={handleZoomIn}
          className="custom-map-control p-2.5 border-b border-slate-200 flex items-center justify-center cursor-pointer"
          title="Zoom In"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="custom-map-control p-2.5 flex items-center justify-center cursor-pointer"
          title="Zoom Out"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

export default DiversionMap;
