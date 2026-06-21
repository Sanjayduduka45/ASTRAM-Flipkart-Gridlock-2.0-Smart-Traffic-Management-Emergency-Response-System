import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, X, Layers, Maximize2, Minimize2, Plus, Minus } from 'lucide-react';

interface ZoneData {
  name: string;
  active: number;
  resolved: number;
  highPriority: number;
  avgResolutionTime: number;
  mostCommonType: string;
  center: [number, number];
  color: string;
}

interface ZoneMapProps {
  zones: ZoneData[];
}

export const ZoneMap: React.FC<ZoneMapProps> = React.memo(({ zones }) => {
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const highlightGroupRef = useRef<L.LayerGroup | null>(null);

  // UI Control States
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ZoneData[]>([]);
  const [highlightCoords, setHighlightCoords] = useState<[number, number] | null>(null);

  // Initialize Map (once on mount)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 11,
      minZoom: 10,
      maxZoom: 14,
      zoomControl: false, // Disable default zoom control to use our custom React overlay
    });

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;

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

  // Update circles & markers when zones or toggles change
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;

    layerGroupRef.current.clearLayers();

    zones.forEach((zone) => {
      // 1. Draw boundary circle
      if (showBoundaries) {
        L.circle(zone.center, {
          radius: 4200,
          fillColor: zone.color,
          fillOpacity: 0.12,
          color: zone.color,
          weight: 2,
          dashArray: '8, 6'
        }).addTo(layerGroupRef.current!)
          .bindPopup(createPopupContent(zone), { closeButton: false });
      }

      // 2. Draw marker at the center
      if (showMarkers) {
        const icon = L.divIcon({
          className: 'zone-center-marker',
          html: `
            <div class="flex items-center justify-center rounded-full border-2 border-white shadow-2xl text-white font-black text-xs transition-transform hover:scale-110"
                 style="background-color: ${zone.color}; width: 36px; height: 36px; line-height: 36px;">
              ${zone.name[0]}Z
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });

        L.marker(zone.center, { icon })
          .addTo(layerGroupRef.current!)
          .bindPopup(createPopupContent(zone), { closeButton: false });
      }
    });
  }, [zones, showBoundaries, showMarkers]);

  // Update pulsing highlight layer
  useEffect(() => {
    if (!mapRef.current || !highlightGroupRef.current) return;

    highlightGroupRef.current.clearLayers();

    if (highlightCoords) {
      L.circle(highlightCoords, {
        radius: 4600, // slightly larger than boundary circle
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.18,
        weight: 3,
        className: 'pulse-highlight'
      }).addTo(highlightGroupRef.current);

      mapRef.current.setView(highlightCoords, 12, { animate: true });

      // Automatically remove highlight layer after 5s
      const timer = setTimeout(() => {
        setHighlightCoords(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [highlightCoords]);

  const createPopupContent = (zone: ZoneData) => {
    return `
      <div class="p-3 font-sans max-w-[240px] text-slate-800 ">
        <h4 class="font-extrabold text-sm mb-2" style="color: ${zone.color}">${zone.name} Operations</h4>
        <div class="space-y-1.5 text-[11px] leading-relaxed">
          <div class="flex justify-between"><span>🔴 Active Incidents:</span><strong>${zone.active}</strong></div>
          <div class="flex justify-between"><span>🟢 Resolved:</span><strong>${zone.resolved}</strong></div>
          <div class="flex justify-between"><span>⚠️ High Priority:</span><strong>${zone.highPriority}</strong></div>
          <div class="flex justify-between"><span>⏱️ Avg Resolution:</span><strong>${zone.avgResolutionTime} mins</strong></div>
          <div class="border-t border-slate-200  pt-1.5 mt-1.5 text-[10.5px]">
            <span class="text-slate-400 font-bold block">MOST COMMON TYPE</span>
            <strong class="text-slate-700 ">${zone.mostCommonType}</strong>
          </div>
        </div>
      </div>
    `;
  };

  // Fullscreen Trigger
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

  // Zoom Triggers
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };
  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  return (
    <div 
      ref={mapWrapperRef} 
      className={`relative w-full rounded-xl overflow-hidden border border-slate-200  shadow-sm bg-slate-100  transition-all ${
        isFullscreen ? 'map-fullscreen-wrapper' : 'h-full'
      }`}
    >
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: isFullscreen ? '100vh' : '520px' }} />

      {/* 1. Custom Floating Search Bar (Top-Left) */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col w-64 font-sans">
        <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg flex items-center px-3 py-2 gap-2 focus-within:ring-2 focus-within:ring-blue-500/40">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search zones..."
            value={searchQuery}
            onChange={(e) => {
              const query = e.target.value;
              setSearchQuery(query);
              if (query.trim() === '') {
                setSearchResults([]);
              } else {
                const filtered = zones.filter(z => 
                  z.name.toLowerCase().includes(query.toLowerCase()) ||
                  z.mostCommonType.toLowerCase().includes(query.toLowerCase())
                );
                setSearchResults(filtered);
              }
            }}
            className="w-full text-xs bg-transparent border-none text-slate-800 focus:outline-none placeholder-slate-400"
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

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-1 bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-xl overflow-hidden divide-y divide-slate-100">
            {searchResults.map((zone) => (
              <button
                key={zone.name}
                onClick={() => {
                  setHighlightCoords(zone.center);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="w-full px-3.5 py-2 hover:bg-slate-50 transition-colors flex items-center justify-between text-left cursor-pointer"
              >
                <div>
                  <strong className="text-xs text-slate-800 block">{zone.name}</strong>
                  <span className="text-[9.5px] text-slate-400">Common: {zone.mostCommonType}</span>
                </div>
                <span className="text-[10px] font-bold text-red-500">🔴 {zone.active}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Custom Floating Layer Toggle Panel (Top-Right) */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col items-end font-sans">
        {!showLayersPanel ? (
          <button
            onClick={() => setShowLayersPanel(true)}
            className="custom-map-control px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Layers className="h-4 w-4" />
            <span>Layers</span>
          </button>
        ) : (
          <div className="bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-2xl p-3 w-48 text-left animate-fade-in flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Layers</span>
              <button 
                onClick={() => setShowLayersPanel(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:text-blue-500">
                <input
                  type="checkbox"
                  checked={showBoundaries}
                  onChange={() => setShowBoundaries(!showBoundaries)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Zone Boundaries</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:text-blue-500">
                <input
                  type="checkbox"
                  checked={showMarkers}
                  onChange={() => setShowMarkers(!showMarkers)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Center Markers</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* 3. Fullscreen Button (Bottom-Right, above zooms) */}
      <div className="absolute bottom-24 right-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={handleToggleFullscreen}
          className="custom-map-control p-2.5 rounded-xl shadow-md cursor-pointer flex items-center justify-center"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* 4. Custom React Zoom Control Buttons (Bottom-Right) */}
      <div className="absolute bottom-4 right-4 z-[1000] flex flex-col border border-slate-200 rounded-xl overflow-hidden shadow-lg">
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

export default ZoneMap;
