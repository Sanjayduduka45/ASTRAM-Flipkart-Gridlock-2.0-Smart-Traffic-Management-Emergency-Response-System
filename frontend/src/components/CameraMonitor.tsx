import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Camera, 
  Settings, 
  AlertTriangle, 
  Activity, 
  CheckCircle, 
  RefreshCw, 
  Play, 
  Pause,
  AlertCircle,
  Clock,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  ShieldCheck,
  BarChart3
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';
import type { CameraData } from '../types';

interface CameraMonitorProps {
  cameras: CameraData[];
  onReportIncident?: (camId: string, type: string) => void;
  onSyncSignal?: (camId: string) => void;
  activeCamId?: string;
  onSelectCam?: (camId: string) => void;
}

interface Vehicle {
  x: number;
  y: number;
  speed: number;
  width: number;
  height: number;
  color: string;
  label: string;
  confidence: number;
  isIncident?: boolean;
}

// ── CCTV Animated Canvas Component ──────────────────────────────────────────
const CameraLiveFeed: React.FC<{ camera: CameraData; isSelected: boolean }> = ({ camera, isSelected }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Don't animate offline cameras
    if (camera.status !== 'ONLINE') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      setTimeout(() => setHasError(true), 0);
      return;
    }
    if (!ctx) { setTimeout(() => setHasError(true), 0); return; }

    canvas.width = 480;
    canvas.height = 270;

    // Initialize vehicles if empty
    if (vehiclesRef.current.length === 0) {
      const numVehicles = camera.density === 'JAMMED' ? 18 : camera.density === 'HEAVY' ? 12 : 6;
      for (let i = 0; i < numVehicles; i++) {
        vehiclesRef.current.push({
          y: Math.random() * canvas.height,
          x: 100 + (i % 3) * 60 + Math.random() * 10,
          speed: 1.2 + Math.random() * 1.5,
          width: 22,
          height: 38,
          color: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#a855f7', '#6366f1'][i % 6],
          label: ['Car', 'SUV', 'Bus', 'Taxi', 'Auto', 'Bike'][i % 6],
          confidence: Math.round(88 + Math.random() * 11)
        });
      }
      if (camera.incident !== 'None' && camera.incident.toLowerCase().includes('stall')) {
        vehiclesRef.current.push({
          y: 120, x: 160, speed: 0, width: 24, height: 42,
          color: '#ef4444', label: 'STALLED VEHICLE', confidence: 96, isIncident: true
        });
      }
    }

    const render = () => {
      if (!ctx || !canvas) return;
      try {
        ctx.fillStyle = '#1e1e24';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, 80, canvas.height);
        ctx.fillRect(canvas.width - 80, 0, 80, canvas.height);
        ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(80, 0); ctx.lineTo(80, canvas.height);
        ctx.moveTo(canvas.width - 80, 0); ctx.lineTo(canvas.width - 80, canvas.height);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([15, 15]);
        [150, 230, 310].forEach(x => { ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, canvas.height); ctx!.stroke(); });
        ctx.setLineDash([]);

        ctx.strokeStyle = camera.density === 'JAMMED' ? '#ef4444' : '#eab308';
        ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(80, 80); ctx.lineTo(canvas.width - 80, 80); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = camera.density === 'JAMMED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.1)';
        ctx.fillRect(80, 80, canvas.width - 160, canvas.height - 80);
        ctx.fillStyle = camera.density === 'JAMMED' ? '#ef4444' : '#eab308';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`AI QUEUE DETECTION ZONE: >${camera.queue_length_m}m`, 86, 74);

        const stopY = 90;
        vehiclesRef.current.forEach((veh) => {
          if (!veh.isIncident) {
            let targetSpeed = veh.speed;
            if (camera.density === 'JAMMED' && veh.y > stopY - 30) {
              const ahead = vehiclesRef.current.find(o => o !== veh && o.x === veh.x && o.y > veh.y && o.y - veh.y < 50);
              targetSpeed = (ahead || veh.y < stopY + 80) ? 0.15 : 0.3;
            } else if (camera.density === 'HEAVY' && veh.y > stopY - 20) {
              targetSpeed = veh.speed * 0.4;
            }
            veh.y += targetSpeed;
            if (veh.y > canvas.height + 20) { veh.y = -40; veh.speed = 1.2 + Math.random() * 1.5; }
          }
          ctx!.fillStyle = veh.color;
          ctx!.fillRect(veh.x, veh.y, veh.width, veh.height);
          ctx!.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx!.fillRect(veh.x + 2, veh.y + 4, veh.width - 4, 8);
          ctx!.strokeStyle = veh.isIncident ? '#ef4444' : '#22c55e'; ctx!.lineWidth = 1.5;
          ctx!.strokeRect(veh.x - 3, veh.y - 3, veh.width + 6, veh.height + 6);
          ctx!.fillStyle = veh.isIncident ? '#ef4444' : '#22c55e'; ctx!.font = 'bold 8px monospace';
          ctx!.fillText(`${veh.label} [${veh.confidence}%]`, veh.x - 3, veh.y - 6);
          if (veh.isIncident) {
            ctx!.strokeStyle = '#ef4444'; ctx!.beginPath();
            ctx!.arc(veh.x + veh.width / 2, veh.y - 20, 6, 0, Math.PI * 2); ctx!.stroke();
            ctx!.fillStyle = '#ef4444'; ctx!.font = 'bold 9px sans-serif';
            ctx!.fillText('!', veh.x + veh.width / 2 - 2, veh.y - 17);
          }
        });

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, 0, canvas.width, 24);
        ctx.fillRect(0, canvas.height - 24, canvas.width, 24);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9.5px monospace';
        ctx.fillText(`● REC [${camera.id}]`, 12, 16);
        ctx.fillText(new Date().toISOString().replace('T', ' ').substring(0, 19), canvas.width - 150, 16);
        ctx.fillStyle = '#a1a1aa'; ctx.font = '9px monospace';
        ctx.fillText(`LOC: ${camera.name.toUpperCase()}`, 12, canvas.height - 8);
        ctx.fillText(`FPS: ${camera.fps} | RES: ${camera.resolution}`, canvas.width - 150, canvas.height - 8);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        for (let i = 0; i < canvas.height; i += 4) { ctx.fillRect(0, i, canvas.width, 1.5); }
        if (camera.incident !== 'None' && Math.floor(Date.now() / 600) % 2 === 0) {
          ctx.fillStyle = '#ef4444'; ctx.beginPath();
          ctx.arc(canvas.width - 170, 13, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillText('AI ALERT', canvas.width - 222, 16);
        }
        animationRef.current = requestAnimationFrame(render);
      } catch {
        setTimeout(() => setHasError(true), 0);
      }
    };
    render();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [camera]);

  // Offline / error fallback
  if (camera.status !== 'ONLINE' || hasError) {
    return (
      <div className={`relative aspect-video rounded-xl border-2 flex flex-col items-center justify-center bg-slate-100 text-slate-500 text-xs font-bold text-center p-4 transition-all ${
        isSelected ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}>
        <WifiOff className="h-8 w-8 text-slate-400 mb-2" />
        <span className="text-slate-700 text-sm font-bold">Live camera feed unavailable</span>
        <span className="text-[10px] text-slate-400 mt-1 font-mono font-medium">Node: {camera.id}</span>
      </div>
    );
  }

  return (
    <div className={`relative rounded-xl border-2 overflow-hidden shadow-lg bg-zinc-950 transition-all ${
      isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-zinc-800 hover:border-zinc-600'
    }`}>
      <canvas ref={canvasRef} className="w-full h-auto block" />
      {camera.incident !== 'None' && (
        <div className="absolute top-8 left-3 bg-red-500/90 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-lg animate-pulse border border-red-400">
          ⚠️ {camera.incident} Detected
        </div>
      )}
    </div>
  );
};

// ── Main Camera Monitor Module Component ─────────────────────────────────────
export const CameraMonitor: React.FC<CameraMonitorProps> = ({
  cameras,
  onReportIncident,
  onSyncSignal,
  activeCamId,
  onSelectCam
}) => {
  const [selectedId, setSelectedId] = useState<string>(activeCamId || 'CAM-SB-01');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showAIConfig, setShowAIConfig] = useState<boolean>(false);
  const [aiSettings, setAiSettings] = useState({
    confidenceThreshold: 75,
    queueMaxMeters: 500,
    sensitivity: 85
  });

  const [historicalData, setHistoricalData] = useState<{ time: string; queueLength: number; densityPct: number }[]>(() => {
    const initialCam = activeCamId ? (cameras.find(c => c.id === activeCamId) || cameras[0]) : cameras[0];
    const baseLength = initialCam?.queue_length_m || 200;
    const dataPoints: { time: string; queueLength: number; densityPct: number }[] = [];
    const now = new Date();
    for (let i = 9; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60000);
      const randomOffset = Math.round((Math.random() - 0.45) * (baseLength * 0.15));
      dataPoints.push({
        time: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`,
        queueLength: Math.max(20, baseLength + randomOffset),
        densityPct: Math.round((initialCam?.vehicle_count || 30) + (Math.random() - 0.5) * 8)
      });
    }
    return dataPoints;
  });

  const selectedCam = cameras.find(c => c.id === selectedId) || cameras[0];

  // Sync activeCamId prop
  const [prevActiveCamId, setPrevActiveCamId] = useState<string | undefined>(activeCamId);
  if (activeCamId !== prevActiveCamId) {
    setPrevActiveCamId(activeCamId);
    if (activeCamId) setSelectedId(activeCamId);
  }

  useEffect(() => {
    if (!selectedCam) return;
    const baseLength = selectedCam.queue_length_m;
    const dataPoints: { time: string; queueLength: number; densityPct: number }[] = [];
    const now = new Date();
    for (let i = 9; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60000);
      const randomOffset = Math.round((Math.random() - 0.45) * (baseLength * 0.15));
      dataPoints.push({
        time: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`,
        queueLength: Math.max(20, baseLength + randomOffset),
        densityPct: Math.round(selectedCam.vehicle_count + (Math.random() - 0.5) * 8)
      });
    }
    const timer = setTimeout(() => setHistoricalData(dataPoints), 0);
    return () => clearTimeout(timer);
  }, [selectedId, selectedCam]);

  const handleCamSelect = (id: string) => {
    setSelectedId(id);
    if (onSelectCam) onSelectCam(id);
  };

  // Live polling simulation
  useEffect(() => {
    if (!isPlaying || !selectedCam) return;
    const interval = setInterval(() => {
      setHistoricalData(prev => {
        const nextTime = new Date();
        const nextTimeStr = `${nextTime.getHours().toString().padStart(2, '0')}:${nextTime.getMinutes().toString().padStart(2, '0')}`;
        const offset = Math.round((Math.random() - 0.48) * (selectedCam.queue_length_m * 0.1));
        return [...prev.slice(1), {
          time: nextTimeStr,
          queueLength: Math.max(20, selectedCam.queue_length_m + offset),
          densityPct: Math.min(100, Math.max(5, selectedCam.vehicle_count + Math.round((Math.random() - 0.5) * 6)))
        }];
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [selectedCam, isPlaying]);

  const densityColorMap: Record<string, string> = {
    'JAMMED': 'text-rose-600 bg-rose-50 border-rose-200',
    'HEAVY': 'text-orange-600 bg-orange-50 border-orange-200',
    'MODERATE': 'text-yellow-600 bg-yellow-50 border-yellow-200',
    'LOW': 'text-emerald-600 bg-emerald-50 border-emerald-200'
  };

  // ── Bottom Section: Computed Data ──────────────────────────────────────────
  const onlineCameras = useMemo(() => cameras.filter(c => c.status === 'ONLINE'), [cameras]);
  const avgUptime = useMemo(() => {
    if (onlineCameras.length === 0) return 0;
    return (onlineCameras.reduce((sum, c) => sum + c.uptime_pct, 0) / onlineCameras.length).toFixed(1);
  }, [onlineCameras]);

  const totalVehicles = useMemo(() => cameras.reduce((sum, c) => sum + c.vehicle_count, 0), [cameras]);
  const avgQueue = useMemo(() => {
    if (onlineCameras.length === 0) return 0;
    return Math.round(onlineCameras.reduce((sum, c) => sum + c.queue_length_m, 0) / onlineCameras.length);
  }, [onlineCameras]);
  const worstCam = useMemo(() => {
    if (cameras.length === 0) return null;
    return [...cameras].sort((a, b) => b.queue_length_m - a.queue_length_m)[0];
  }, [cameras]);
  const incidentCams = useMemo(() => cameras.filter(c => c.incident !== 'None'), [cameras]);

  // Estimated travel delay based on density
  const getEstimatedDelay = (cam: CameraData): string => {
    if (cam.density === 'JAMMED') return `${Math.round(cam.queue_length_m / 10)} min`;
    if (cam.density === 'HEAVY') return `${Math.round(cam.queue_length_m / 18)} min`;
    if (cam.density === 'MODERATE') return `${Math.round(cam.queue_length_m / 30)} min`;
    return '< 2 min';
  };

  // Empty state guard
  if (!cameras || cameras.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-140px)] bg-slate-50 rounded-xl border border-slate-200">
        <div className="text-center">
          <WifiOff className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-700">Live camera feed unavailable</h3>
          <p className="text-sm text-slate-400 mt-1">No camera data available. Please check system connections.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] overflow-hidden text-slate-800">

      {/* ── Top Section: Left Grid + Right Details ── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">

        {/* ── LEFT: Camera Grid (≈65%) ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col p-4 overflow-y-auto border-r border-slate-200 min-w-0">

          {/* Module Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3 mb-4 shrink-0">
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900 flex items-center gap-2">
                <Camera className="h-5 w-5 text-blue-600" />
                Live Traffic Camera Monitoring
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {onlineCameras.length} of {cameras.length} cameras active · Real-time traffic detection
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 transition-all"
              >
                {isPlaying ? <><Pause className="h-3.5 w-3.5 text-amber-500" /> Pause</> : <><Play className="h-3.5 w-3.5 text-emerald-500" /> Resume</>}
              </button>
              <button
                onClick={() => setShowAIConfig(!showAIConfig)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  showAIConfig ? 'bg-blue-600 text-white border-blue-700' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" /> Settings
              </button>
            </div>
          </div>

          {/* AI Calibration Controls */}
          {showAIConfig && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 shadow-inner mb-4 shrink-0">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
                <Settings className="h-3.5 w-3.5" /> Detection Settings
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-500">Confidence Threshold:</span>
                    <span className="text-blue-600">{aiSettings.confidenceThreshold}%</span>
                  </div>
                  <input type="range" min="50" max="95" value={aiSettings.confidenceThreshold}
                    onChange={(e) => setAiSettings({...aiSettings, confidenceThreshold: Number(e.target.value)})}
                    className="w-full accent-blue-600 cursor-pointer" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-500">Queue Calibration:</span>
                    <span className="text-blue-600">{aiSettings.queueMaxMeters}m</span>
                  </div>
                  <input type="range" min="100" max="800" step="50" value={aiSettings.queueMaxMeters}
                    onChange={(e) => setAiSettings({...aiSettings, queueMaxMeters: Number(e.target.value)})}
                    className="w-full accent-blue-600 cursor-pointer" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-500">Alert Sensitivity:</span>
                    <span className="text-blue-600">{aiSettings.sensitivity}%</span>
                  </div>
                  <input type="range" min="30" max="100" value={aiSettings.sensitivity}
                    onChange={(e) => setAiSettings({...aiSettings, sensitivity: Number(e.target.value)})}
                    className="w-full accent-blue-600 cursor-pointer" />
                </div>
              </div>
            </div>
          )}

          {/* Camera Grid (3 columns) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 flex-1">
            {cameras.map((cam) => (
              <div key={cam.id} onClick={() => handleCamSelect(cam.id)} className="cursor-pointer group">
                <CameraLiveFeed camera={cam} isSelected={selectedId === cam.id} />
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {cam.status === 'ONLINE' ? (
                      <Wifi className="h-3 w-3 text-emerald-500 shrink-0" />
                    ) : (
                      <WifiOff className="h-3 w-3 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs text-slate-700 font-bold truncate">{cam.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border font-bold ${densityColorMap[cam.density] || ''}`}>
                      {cam.density}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">{cam.vehicle_count} veh</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Selected Camera Details (≈35%) ──────────────────────── */}
        <div className="w-full lg:w-[380px] bg-slate-50/60 p-4 flex flex-col overflow-y-auto space-y-4 shrink-0">

          {/* Selected Camera Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[9px] font-mono text-slate-400 font-black block uppercase tracking-widest">Selected Camera</span>
                <h3 className="font-extrabold text-sm text-slate-900 mt-0.5">{selectedCam.name}</h3>
                <span className="text-[9.5px] font-mono text-blue-600 font-bold">{selectedCam.id}</span>
              </div>
              <span className="flex h-2.5 w-2.5 relative">
                {selectedCam.status === 'ONLINE' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400" />
                )}
              </span>
            </div>

            <hr className="border-slate-100" />

            {/* Metrics 2x2 Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Traffic Density</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded border inline-block ${densityColorMap[selectedCam.density] || ''}`}>
                  {selectedCam.density}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Travel Delay</span>
                <strong className="text-sm font-black text-slate-800">{getEstimatedDelay(selectedCam)}</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Queue Length</span>
                <strong className="text-sm font-black text-slate-800">{selectedCam.queue_length_m}m</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Active Incident</span>
                <span className={`text-[10px] font-black flex items-center gap-1 leading-none mt-1 ${
                  selectedCam.incident !== 'None' ? 'text-red-500' : 'text-emerald-600'
                }`}>
                  {selectedCam.incident !== 'None' ? (
                    <><AlertCircle className="h-3 w-3" /> {selectedCam.incident}</>
                  ) : (
                    <><CheckCircle className="h-3 w-3" /> None Detected</>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Queue Length Trend Graph */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-blue-600" /> Queue Length Trend (10 min)
            </h4>
            <div className="h-[130px] w-full text-[10px] font-mono">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historicalData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="queueColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <YAxis domain={['auto', 'auto']} stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '8px', fontSize: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                  <Area type="monotone" dataKey="queueLength" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#queueColor)" name="Queue (m)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Diagnostics */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-blue-600" /> Camera Diagnostics
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-medium">
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-400">Lat:</span>
                <strong className="text-slate-700 font-mono">{selectedCam.latitude.toFixed(4)}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-400">Lon:</span>
                <strong className="text-slate-700 font-mono">{selectedCam.longitude.toFixed(4)}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-400">Connection:</span>
                <strong className={`font-bold ${selectedCam.status === 'ONLINE' ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {selectedCam.status}
                </strong>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-400">Uptime:</span>
                <strong className="text-slate-700 font-mono">{selectedCam.uptime_pct}%</strong>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1 col-span-2">
                <span className="text-slate-400">Resolution / FPS:</span>
                <strong className="text-slate-700 font-mono">{selectedCam.resolution} @ {selectedCam.fps}fps</strong>
              </div>
            </div>
          </div>

          {/* Signal Override Controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              🚨 Signal Override Controls
            </h4>
            <div className="space-y-2">
              <button
                onClick={() => onSyncSignal && onSyncSignal(selectedCam.id)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Sync Signal Phase
              </button>
              <button
                onClick={() => onReportIncident && onReportIncident(selectedCam.id, selectedCam.incident !== 'None' ? 'Resolve Detection' : 'Stalled Vehicle')}
                className={`w-full text-xs font-bold py-2 rounded-lg transition-all border flex items-center justify-center gap-1.5 ${
                  selectedCam.incident !== 'None'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {selectedCam.incident !== 'None' ? 'Resolve Active Alert' : 'Report Incident'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM: Alerts, Health, Activity Summary ──────────────────────── */}
      <div className="shrink-0 border-t border-slate-200 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-200">

          {/* Recent Camera Alerts */}
          <div className="p-4 space-y-2.5">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Recent Camera Alerts
            </h4>
            <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
              {incidentCams.length > 0 ? incidentCams.map(cam => (
                <div key={cam.id} className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-700 truncate">{cam.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded shrink-0">{cam.incident}</span>
                </div>
              )) : (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[11px] font-bold text-emerald-700">No active alerts — all cameras clear</span>
                </div>
              )}
              {/* Show offline cameras too */}
              {cameras.filter(c => c.status !== 'ONLINE').map(cam => (
                <div key={`offline-${cam.id}`} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <WifiOff className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-600 truncate">{cam.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">OFFLINE</span>
                </div>
              ))}
            </div>
          </div>

          {/* Camera Health Status */}
          <div className="p-4 space-y-2.5">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> Camera Health Status
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-center">
                <span className="text-lg font-black text-blue-700">{onlineCameras.length}/{cameras.length}</span>
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Active</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5 text-center">
                <span className="text-lg font-black text-emerald-700">{avgUptime}%</span>
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Avg Uptime</span>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-center">
                <span className="text-lg font-black text-amber-700">{incidentCams.length}</span>
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Alerts</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {cameras.map(cam => (
                <span key={cam.id} className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                  cam.status === 'ONLINE' 
                    ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                    : 'text-slate-400 bg-slate-50 border-slate-200 line-through'
                }`}>
                  {cam.id}
                </span>
              ))}
            </div>
          </div>

          {/* Junction Activity Summary */}
          <div className="p-4 space-y-2.5">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-500" /> Junction Activity Summary
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2.5 text-center">
                <span className="text-lg font-black text-indigo-700">{totalVehicles}</span>
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Total Vehicles</span>
              </div>
              <div className="bg-sky-50 border border-sky-100 rounded-lg p-2.5 text-center">
                <span className="text-lg font-black text-sky-700">{avgQueue}m</span>
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Avg Queue</span>
              </div>
            </div>
            {worstCam && (
              <div className="bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 mt-1">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Busiest Junction</span>
                <span className="text-[11px] font-black text-slate-800">{worstCam.name}</span>
                <span className="text-[10px] text-rose-600 font-bold block">Queue: {worstCam.queue_length_m}m · {worstCam.vehicle_count} vehicles · {worstCam.density}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraMonitor;
