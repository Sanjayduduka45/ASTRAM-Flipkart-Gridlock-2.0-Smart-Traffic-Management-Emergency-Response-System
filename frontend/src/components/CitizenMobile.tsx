import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Navigation, 
  PhoneCall, 
  Map, 
  Search, 
  Check, 
  Activity, 
  ChevronLeft, 
  Plus, 
  Home, 
  Siren, 
  AlertTriangle,
  Radio,
  Phone,
  PhoneOff,
  Play,
  Square
} from 'lucide-react';
import type { CitizenReportInput, WeatherData } from '../types';

interface NearbyService {
  category: string;
  name: string;
  distance: string;
  phone: string;
  status: string;
}

interface CitizenMobileProps {
  onReportIncident: (incidentData: CitizenReportInput) => void;
  weatherData: WeatherData; // Weather details from the parent (could contain live fields)
}

interface CustomRoute {
  id: string;
  name: string;
  distance: string;
  travelTime: string;
  expectedDelay: string;
  congestion: 'CLEAR' | 'MODERATE' | 'HEAVY' | 'JAMMED';
  points: [number, number][]; // SVG coordinates
  directions: string[];
  recommendation?: string;
}

const BENGALURU_NODES = [
  { name: 'Hebbal Flyover Junction', coords: [150, 40] },
  { name: 'Majestic Central Hub', coords: [100, 130] },
  { name: 'KR Puram Hanging Bridge', coords: [250, 90] },
  { name: 'Indiranagar 100 Feet Rd', coords: [200, 130] },
  { name: 'Whitefield ITPL', coords: [280, 110] },
  { name: 'Silk Board Junction', coords: [180, 260] },
  { name: 'Electronic City Toll', coords: [190, 290] },
  { name: 'Chinnaswamy Stadium', coords: [150, 140] },
  { name: 'Marathahalli Bridge', coords: [260, 170] },
  { name: 'Koramangala Water Tank', coords: [170, 210] }
];

const generateDynamicRoutes = (origName: string, destName: string): CustomRoute[] => {
  const origNode = BENGALURU_NODES.find(n => n.name === origName) || BENGALURU_NODES[0];
  const destNode = BENGALURU_NODES.find(n => n.name === destName) || BENGALURU_NODES[5];
  
  const pStart = origNode.coords;
  const pEnd = destNode.coords;
  
  // Midpoints for routes
  const mid1_A: [number, number] = [
    Math.round(pStart[0] + (pEnd[0] - pStart[0]) * 0.4 + 15),
    Math.round(pStart[1] + (pEnd[1] - pStart[1]) * 0.4 - 10)
  ];
  const mid2_A: [number, number] = [
    Math.round(pStart[0] + (pEnd[0] - pStart[0]) * 0.7 - 10),
    Math.round(pStart[1] + (pEnd[1] - pStart[1]) * 0.7 + 15)
  ];

  const mid1_B: [number, number] = [
    Math.round(pStart[0] + (pEnd[0] - pStart[0]) * 0.3 - 25),
    Math.round(pStart[1] + (pEnd[1] - pStart[1]) * 0.3 + 20)
  ];
  const mid2_B: [number, number] = [
    Math.round(pStart[0] + (pEnd[0] - pStart[0]) * 0.6 - 35),
    Math.round(pStart[1] + (pEnd[1] - pStart[1]) * 0.6 - 15)
  ];

  const mid1_C: [number, number] = [
    Math.round(pStart[0] + (pEnd[0] - pStart[0]) * 0.5 + 35),
    Math.round(pStart[1] + (pEnd[1] - pStart[1]) * 0.5 + 35)
  ];
  
  const distanceBase = Math.sqrt(Math.pow(pEnd[0] - pStart[0], 2) + Math.pow(pEnd[1] - pStart[1], 2)) * 0.08;
  
  return [
    {
      id: 'route-a',
      name: 'ORR Express Corridor (Fastest)',
      distance: `${(distanceBase + 3.2).toFixed(1)} km`,
      travelTime: `${Math.round(distanceBase * 1.5 + 10)} mins`,
      expectedDelay: 'None',
      congestion: 'CLEAR',
      points: [pStart as [number, number], mid1_A, mid2_A, pEnd as [number, number]],
      directions: [
        `Depart from ${origNode.name.split(' ')[0]}.`,
        'Head onto the ORR Express corridor lane.',
        'Keep right at the junction split.',
        `Merge safely onto ${destNode.name.split(' ')[0]} approach.`
      ],
      recommendation: '⭐ Best Route: Fastest & clear of incidents'
    },
    {
      id: 'route-b',
      name: 'Town Core Arterial Bypass',
      distance: `${(distanceBase + 5.1).toFixed(1)} km`,
      travelTime: `${Math.round(distanceBase * 2.2 + 15)} mins`,
      expectedDelay: `+${Math.round(distanceBase * 0.8)} mins`,
      congestion: 'MODERATE',
      points: [pStart as [number, number], mid1_B, mid2_B, pEnd as [number, number]],
      directions: [
        `Depart from ${origNode.name.split(' ')[0]}.`,
        'Take early left slip road bypass.',
        'Proceed through local checkpoints.',
        `Arrived at ${destNode.name.split(' ')[0]}.`
      ],
      recommendation: 'Alternative bypass: avoiding center delays'
    },
    {
      id: 'route-c',
      name: 'Central Junction Core (Congested)',
      distance: `${(distanceBase + 2.1).toFixed(1)} km`,
      travelTime: `${Math.round(distanceBase * 3.5 + 20)} mins`,
      expectedDelay: `+${Math.round(distanceBase * 1.8 + 5)} mins`,
      congestion: 'JAMMED',
      points: [pStart as [number, number], mid1_C, pEnd as [number, number]],
      directions: [
        `Depart from ${origNode.name.split(' ')[0]}.`,
        'Enter Central Circle underpass.',
        'Expect heavy queue delays near city center.',
        `Slow flow approaching ${destNode.name.split(' ')[0]}.`
      ],
      recommendation: '🛑 High congestion - avoid unless necessary'
    }
  ];
};

export const CitizenMobile: React.FC<CitizenMobileProps> = ({ 
  onReportIncident, 
  weatherData
}) => {
  const [currentScreen, setCurrentScreen] = useState<string>('home');
  
  // Navigation State
  const [routeForm, setRouteForm] = useState({
    origin: 'Hebbal Flyover Junction',
    destination: 'Silk Board Junction'
  });
  
  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-a');
  const [showRouteDetail, setShowRouteDetail] = useState<boolean>(false);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [navStep, setNavStep] = useState<number>(0);
  const [carPosition, setCarPosition] = useState<[number, number]>([150, 40]);
  
  // SOS Panic State
  const [emergencyActive, setEmergencyActive] = useState<boolean>(false);
  const [emergencyStep, setEmergencyStep] = useState<number>(0);
  
  // Nearby Services State
  const [servicesTab, setServicesTab] = useState<string>('All');
  const [dialingService, setDialingService] = useState<NearbyService | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  
  // Check Traffic State
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Report Form State
  const [reportForm, setReportForm] = useState({
    category: 'Accident',
    nearest_junction: 'Silk Board Junction',
    description: '',
    photoAttached: false,
    severity: 'Medium'
  });

  const [submittedReport, setSubmittedReport] = useState<{
    id: string;
    time: string;
    status: string;
    category: string;
    location: string;
    description: string;
    severity: string;
    image?: string;
  } | null>(null);
  
  const [showSuccessToast, setShowSuccessToast] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showCaptureToast, setShowCaptureToast] = useState<boolean>(false);

  // Timers Refs
  const navIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mock Bengaluru Corridors Data
  const trafficCorridors = [
    { name: 'Silk Board Junction', level: 'JAMMED', delay: '38 mins', speed: '12 km/h' },
    { name: 'Hebbal Flyover Junction', level: 'HEAVY', delay: '27 mins', speed: '19 km/h' },
    { name: 'KR Puram Hanging Bridge', level: 'HEAVY', delay: '19 mins', speed: '22 km/h' },
    { name: 'Majestic Central Hub', level: 'JAMMED', delay: '45 mins', speed: '8 km/h' },
    { name: 'ITPL Main Road (Whitefield)', level: 'JAMMED', delay: '39 mins', speed: '14 km/h' },
    { name: 'Electronic City Phase 1 Toll', level: 'CLEAR', delay: '0 mins', speed: '55 km/h' },
    { name: 'Marathahalli Bridge Junction', level: 'JAMMED', delay: '35 mins', speed: '11 km/h' },
    { name: 'Bellandur ORR Crossing', level: 'JAMMED', delay: '32 mins', speed: '13 km/h' },
    { name: 'Indiranagar 100 Feet Rd Junction', level: 'HEAVY', delay: '18 mins', speed: '24 km/h' },
    { name: 'Koramangala Water Tank Junction', level: 'MODERATE', delay: '10 mins', speed: '32 km/h' }
  ];

  // List of Road Closures
  const roadClosures = [
    { road: 'Mysore Road (Arterial lanes)', reason: 'Severe Flooding / Water logging', status: 'Blocked', clearTime: '2 hours' },
    { road: 'Bannerghatta Road (Near MICO layout)', reason: 'Water accumulation & stalled bus', status: 'Partially Blocked', clearTime: '1.5 hours' },
    { road: 'Outer Ring Road (Hebbal Underpass)', reason: 'Heavy rainfall overflow', status: 'Blocked', clearTime: '45 mins' }
  ];

  // Nearby Services Contacts (Including Fuel Stations)
  const nearbyServices = [
    { category: 'Police Stations', name: 'Yelahanka Traffic Police Station', distance: '1.8 km', phone: '080-22943015', status: 'Available' },
    { category: 'Police Stations', name: 'HAL Airport Traffic Police Station', distance: '2.4 km', phone: '080-22943019', status: 'Busy' },
    { category: 'Hospitals', name: 'St. John’s Medical College Hospital', distance: '0.9 km', phone: '080-22065000', status: 'Available' },
    { category: 'Hospitals', name: 'Manipal Hospital (Old Airport Road)', distance: '2.8 km', phone: '080-22445566', status: 'Available' },
    { category: 'Towing Services', name: 'ASTRAM Command Center Heavy Tow Unit', distance: '3.1 km', phone: '1800-425-0100', status: 'Active' },
    { category: 'Towing Services', name: 'HSR Layout Towing Fleet', distance: '1.5 km', phone: '080-22558899', status: 'Available' },
    { category: 'Fuel Stations', name: 'Shell Fuel Station - Silk Board', distance: '1.4 km', phone: '080-25783451', status: 'Open 24/7' },
    { category: 'Fuel Stations', name: 'Indian Oil Bunk - Hebbal', distance: '2.1 km', phone: '080-23412586', status: 'Open' },
    { category: 'Fuel Stations', name: 'HP Petrol Pump - Koramangala', distance: '0.8 km', phone: '080-25536482', status: 'Open' }
  ];

  // Helper mapping to locate service nearest destination nodes
  const getServiceDestinationNode = (srvName: string): string => {
    if (srvName.includes("St. John’s")) return "Koramangala Water Tank";
    if (srvName.includes("Manipal")) return "Chinnaswamy Stadium";
    if (srvName.includes("Towing")) return "Silk Board Junction";
    if (srvName.includes("HSR")) return "Koramangala Water Tank";
    if (srvName.includes("Shell")) return "Silk Board Junction";
    if (srvName.includes("Indian Oil")) return "Hebbal Flyover Junction";
    if (srvName.includes("HP Petrol")) return "Koramangala Water Tank";
    if (srvName.includes("Yelahanka")) return "Hebbal Flyover Junction";
    if (srvName.includes("HAL Airport")) return "Marathahalli Bridge";
    return "Silk Board Junction";
  };

  // Generate routes dynamically based on selected Origin & Destination
  const simulatedRoutes = React.useMemo(() => {
    return generateDynamicRoutes(routeForm.origin, routeForm.destination);
  }, [routeForm.origin, routeForm.destination]);

  const activeRoute = simulatedRoutes.find(r => r.id === selectedRouteId) || simulatedRoutes[0];

  // Route Planning Calculation
  const handleCalculateRoute = () => {
    if (routeForm.origin === routeForm.destination) {
      alert("Origin and destination cannot be identical.");
      return;
    }
    setShowRouteDetail(true);
    setIsNavigating(false);
    setNavStep(0);
    setCarPosition(activeRoute.points[0]);
  };

  // Start Navigation Simulation
  const startNavigation = () => {
    setIsNavigating(true);
    setNavStep(0);
    let stepIndex = 0;
    
    if (navIntervalRef.current) clearInterval(navIntervalRef.current);
    
    navIntervalRef.current = setInterval(() => {
      if (stepIndex < activeRoute.points.length - 1) {
        stepIndex++;
        setNavStep(stepIndex);
        setCarPosition(activeRoute.points[stepIndex]);
      } else {
        setIsNavigating(false);
        if (navIntervalRef.current) {
          clearInterval(navIntervalRef.current);
          navIntervalRef.current = null;
        }
        alert("Destination reached safely!");
      }
    }, 3000);
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    if (navIntervalRef.current) {
      clearInterval(navIntervalRef.current);
      navIntervalRef.current = null;
    }
  };

  // Trigger Dialing Service
  const handleCallService = (srv: NearbyService) => {
    setDialingService(srv);
    setCallDuration(0);
    
    if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    
    callIntervalRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const handleEndCall = () => {
    setDialingService(null);
    if (callIntervalRef.current) {
      clearInterval(callIntervalRef.current);
      callIntervalRef.current = null;
    }
  };

  // Trigger SOS Panic Dispatches
  const handleActivateEmergency = () => {
    setEmergencyActive(true);
    setEmergencyStep(0);
  };

  const handleDeactivateEmergency = () => {
    setEmergencyActive(false);
    setEmergencyStep(0);
  };

  // SOS Simulation Loop
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (emergencyActive && emergencyStep < 3) {
      timer = setTimeout(() => {
        setEmergencyStep(prev => {
          const next = prev + 1;
          // Dynamically report rescue dispatches to the parent app array
          if (next === 1) {
            onReportIncident({
              category: 'SOS Emergency',
              nearest_junction: 'Silk Board Junction',
              description: 'SOS: Citizen panic trigger. GPS Lock verified. Dispatching Patrol Unit 08.',
              status: 'DISPATCHED'
            });
          } else if (next === 2) {
            onReportIncident({
              category: 'SOS Emergency',
              nearest_junction: 'Silk Board Junction',
              description: 'SOS: Ambulance Unit 04 dispatched to coordinates.',
              status: 'ON_SCENE'
            });
          }
          return next;
        });
      }, 3000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [emergencyActive, emergencyStep, onReportIncident]);

  // Clean intervals on unmount
  useEffect(() => {
    return () => {
      if (navIntervalRef.current) clearInterval(navIntervalRef.current);
      if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    };
  }, []);

  const startCamera = async () => {
    setShowCamera(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      setCameraStream(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error("Camera access error: ", err);
      setCameraError('Camera Access Error: Ensure permissions are granted and camera is connected.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg');
        setSelectedImage(base64);
        setImageError(null);
        stopCamera();
        setShowCaptureToast(true);
        setTimeout(() => setShowCaptureToast(false), 2000);
      }
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setImageError('Invalid format. Select JPG, JPEG, PNG, or WEBP.');
      setSelectedImage(null);
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB limit
    if (file.size > maxSize) {
      setImageError('File is too large. Max size is 10 MB.');
      setSelectedImage(null);
      return;
    }

    setImageError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setShowCaptureToast(true);
      setTimeout(() => setShowCaptureToast(false), 2000);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImageError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (mobileCameraInputRef.current) {
      mobileCameraInputRef.current.value = '';
    }
  };

  // Submit Incident Report
  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportForm.description.trim()) {
      alert("Please describe the problem.");
      return;
    }

    const reportId = `CIT-${Math.floor(100000 + Math.random() * 900000)}`;
    const submissionTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + new Date().toLocaleDateString();

    onReportIncident({
      category: reportForm.category,
      nearest_junction: reportForm.nearest_junction,
      description: reportForm.description,
      status: 'PENDING',
      image: selectedImage || undefined,
      severity: reportForm.severity as 'Low' | 'Medium' | 'High' | 'Critical'
    });

    setSubmittedReport({
      id: reportId,
      time: submissionTime,
      status: 'PENDING',
      category: reportForm.category,
      location: reportForm.nearest_junction,
      description: reportForm.description,
      severity: reportForm.severity,
      image: selectedImage || undefined
    });

    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);

    setReportForm({
      category: 'Accident',
      nearest_junction: 'Silk Board Junction',
      description: '',
      photoAttached: false,
      severity: 'Medium'
    });
    setSelectedImage(null);
    setImageError(null);
  };

  // Color mappings
  const levelColors = {
    'JAMMED': 'text-red-700 bg-red-100 border-red-300',
    'HEAVY': 'text-orange-700 bg-orange-100 border-orange-300',
    'MODERATE': 'text-amber-700 bg-amber-100 border-amber-300',
    'CLEAR': 'text-emerald-700 bg-emerald-100 border-emerald-300'
  };

  const filteredCorridors = trafficCorridors.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col items-center justify-center bg-transparent w-full">
      
      {/* Success Alert Toast */}
      {showSuccessToast && (
        <div className="absolute top-28 z-[5000] bg-emerald-600 text-white font-sans text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-500 animate-bounce">
          <Check className="h-4 w-4 bg-white/20 p-0.5 rounded-full" />
          Report filed! Dispatch team is notified.
        </div>
      )}

      {/* Capture Success Toast */}
      {showCaptureToast && (
        <div className="absolute top-28 z-[5000] bg-emerald-600 text-white font-sans text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-500 animate-bounce">
          <Check className="h-4 w-4 bg-white/20 p-0.5 rounded-full" />
          Photo captured successfully!
        </div>
      )}

      {/* ── Outer Mobile Device Shell Container ─────────────────────────────── */}
      <div className="relative w-[340px] h-[680px] bg-slate-900 rounded-[48px] p-3 shadow-xl border-[6px] border-slate-700 ring-10 ring-slate-800/40 overflow-hidden shrink-0 flex flex-col">
        
        {/* Device Notch positioned over internal status bar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-[18px] bg-slate-900 rounded-b-xl z-[3000] flex items-center justify-center">
          <div className="w-8 h-1.5 bg-slate-800 rounded-full"></div>
        </div>

        {/* ── Internal Mobile App Screen (Light Theme Layout) ───────────────── */}
        <div className="flex-1 bg-slate-50 text-slate-800 flex flex-col min-h-0 relative font-sans select-none rounded-[36px] overflow-hidden border border-slate-200 shadow-inner">
          
          {/* Device Status Bar INSIDE internal screen to prevent clipping */}
          <div className="px-6 pt-5 pb-1 bg-white flex items-center justify-between text-[10px] font-black text-slate-800 select-none shrink-0 z-[2000] border-b border-slate-100">
            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <div className="flex items-center gap-1.5">
              <span>📶</span>
              <span>LTE</span>
              <span>🔋 92%</span>
            </div>
          </div>
          
          {/* Header Panel */}
          <header className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 select-none shadow-xs min-h-[48px]">
            {currentScreen !== 'home' ? (
              <button 
                onClick={() => {
                  setCurrentScreen('home');
                  setShowRouteDetail(false);
                  stopNavigation();
                  handleDeactivateEmergency();
                  setSearchQuery('');
                  stopCamera();
                  setSubmittedReport(null);
                }}
                className="text-blue-600 hover:text-blue-800 flex items-center text-xs font-black gap-0.5 min-h-[44px] min-w-[44px] px-1 focus:ring-2 focus:ring-blue-500/20 rounded-lg outline-none transition-all cursor-pointer"
              >
                <ChevronLeft className="h-4.5 w-4.5 stroke-[3px]" />
                Back
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <img 
                  src="/logo.jpg" 
                  alt="ASTRAM Logo" 
                  className="h-5 w-5 rounded object-cover bg-white border border-slate-200"
                />
                <span className="text-xs font-black tracking-tight text-slate-900 uppercase">ASTRAM Bangalore</span>
              </div>
            )}
            
            {/* Quick Status Light */}
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[9px] font-black text-slate-600 uppercase">Live GPS</span>
            </div>
          </header>

          {/* Dialing Screen Overlay */}
          {dialingService && (
            <div className="absolute inset-0 bg-slate-900/95 text-white z-[4000] flex flex-col items-center justify-between p-8 font-sans animate-fade-in">
              <div className="text-center mt-12 space-y-4">
                <div className="h-20 w-20 bg-rose-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
                  <Phone className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black">{dialingService.name}</h3>
                  <span className="text-xs text-rose-400 font-bold block mt-1">{dialingService.category}</span>
                </div>
                <span className="text-xl font-mono block tracking-wider mt-4">
                  {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div className="text-center space-y-3 w-full mb-10">
                <span className="text-xs text-slate-400 font-bold block">Simulating Emergency Voice Line...</span>
                <button 
                  onClick={handleEndCall}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3.5 rounded-2xl text-xs font-black uppercase flex items-center justify-center gap-2"
                >
                  <PhoneOff className="h-4 w-4" /> End Call
                </button>
              </div>
            </div>
          )}

          {/* Screen Content Wrapper */}
          <main className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0 select-none">
            
            {/* 1. SCREEN: HOME */}
            {currentScreen === 'home' && (
              <div className="space-y-4">
                
                {/* Weather Alert Banner */}
                {weatherData && (
                  <div className={`p-3 rounded-xl border flex items-center gap-3 bg-white shadow-xs ${
                    weatherData.flood_risk === 'HIGH' ? 'border-rose-350' : 'border-slate-200'
                  }`}>
                    <span className="text-2xl shrink-0">⛈️</span>
                    <div className="text-xs flex-1">
                      <div className="flex justify-between items-center">
                        <strong className="font-extrabold text-slate-900">Weather Status:</strong>
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">Live</span>
                      </div>
                      <p className="text-[10px] text-slate-700 mt-0.5 font-semibold">
                        {weatherData.temperature.toFixed(1)}°C · {weatherData.weather_condition || 'Heavy Showers'}
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium mt-0.5">
                        Humidity: {weatherData.humidity}% · Wind: {weatherData.wind_speed} km/h
                      </p>
                    </div>
                  </div>
                )}

                {/* Main Feature Menu Buttons Grid */}
                <span className="text-[9px] font-black text-slate-450 uppercase tracking-widest block mb-0.5">App Menu</span>
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Traffic Check Button */}
                  <button 
                    onClick={() => setCurrentScreen('traffic')}
                    className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left flex flex-col justify-between min-h-[104px] w-full transition-all shadow-xs cursor-pointer"
                  >
                    <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg w-fit shrink-0">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div className="mt-2.5 min-w-0">
                      <strong className="text-[11.5px] font-black text-slate-900 block leading-tight break-words">Check Traffic</strong>
                      <span className="text-[9.5px] text-slate-500 font-bold block leading-tight mt-0.5 break-words">Junction speeds</span>
                    </div>
                  </button>

                  {/* Plan Route Button */}
                  <button 
                    onClick={() => {
                      setCurrentScreen('route');
                      setShowRouteDetail(false);
                      setIsNavigating(false);
                    }}
                    className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left flex flex-col justify-between min-h-[104px] w-full transition-all shadow-xs cursor-pointer"
                  >
                    <div className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg w-fit shrink-0">
                      <Navigation className="h-4 w-4" />
                    </div>
                    <div className="mt-2.5 min-w-0">
                      <strong className="text-[11.5px] font-black text-slate-900 block leading-tight break-words">Plan Route</strong>
                      <span className="text-[9.5px] text-slate-500 font-bold block leading-tight mt-0.5 break-words">Directions map</span>
                    </div>
                  </button>

                  {/* Report Incident Button */}
                  <button 
                    onClick={() => setCurrentScreen('report')}
                    className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left flex flex-col justify-between min-h-[104px] w-full transition-all shadow-xs cursor-pointer"
                  >
                    <div className="bg-orange-100 text-orange-600 p-1.5 rounded-lg w-fit shrink-0">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="mt-2.5 min-w-0">
                      <strong className="text-[11.5px] font-black text-slate-900 block leading-tight break-words">Report Problem</strong>
                      <span className="text-[9.5px] text-slate-500 font-bold block leading-tight mt-0.5 break-words">File complaints</span>
                    </div>
                  </button>

                  {/* Road Closures Button */}
                  <button 
                    onClick={() => setCurrentScreen('closures')}
                    className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left flex flex-col justify-between min-h-[104px] w-full transition-all shadow-xs cursor-pointer"
                  >
                    <div className="bg-purple-100 text-purple-600 p-1.5 rounded-lg w-fit shrink-0">
                      <Radio className="h-4 w-4" />
                    </div>
                    <div className="mt-2.5 min-w-0">
                      <strong className="text-[11.5px] font-black text-slate-900 block leading-tight break-words">Closures List</strong>
                      <span className="text-[9.5px] text-slate-500 font-bold block leading-tight mt-0.5 break-words">Blocked corridors</span>
                    </div>
                  </button>

                  {/* Nearby Services Button */}
                  <button 
                    onClick={() => {
                      setCurrentScreen('services');
                      setServicesTab('All');
                    }}
                    className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left flex flex-col justify-between min-h-[104px] w-full transition-all shadow-xs cursor-pointer"
                  >
                    <div className="bg-teal-100 text-teal-600 p-1.5 rounded-lg w-fit shrink-0">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="mt-2.5 min-w-0">
                      <strong className="text-[11.5px] font-black text-slate-900 block leading-tight break-words">Nearby Services</strong>
                      <span className="text-[9.5px] text-slate-500 font-bold block leading-tight mt-0.5 break-words">Rescue & medical</span>
                    </div>
                  </button>

                  {/* Emergency Panic Button */}
                  <button 
                    onClick={() => {
                      setCurrentScreen('emergency');
                      handleActivateEmergency();
                    }}
                    className="bg-rose-100 hover:bg-rose-200 border border-rose-250 rounded-2xl p-3 text-left flex flex-col justify-between min-h-[104px] w-full transition-all shadow-xs cursor-pointer animate-pulse"
                  >
                    <div className="bg-rose-600 text-white p-1.5 rounded-lg w-fit shrink-0">
                      <Siren className="h-4 w-4" />
                    </div>
                    <div className="mt-2.5 min-w-0">
                      <strong className="text-[11.5px] font-black text-rose-700 block leading-tight break-words">Emergency Help</strong>
                      <span className="text-[9.5px] text-rose-600 font-bold block leading-tight mt-0.5 break-words">One-tap SOS dispatch</span>
                    </div>
                  </button>

                </div>

                {/* System Status Ticker */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-center text-xs shadow-xs">
                  <span className="text-slate-500 font-bold">ASTRAM Government Server:</span>
                  <strong className="text-emerald-700 block mt-0.5">Online & Synced with TMC</strong>
                </div>
              </div>
            )}

            {/* 2. SCREEN: CHECK TRAFFIC */}
            {currentScreen === 'traffic' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Bengaluru Junction Traffic</h3>
                  <p className="text-[10px] text-slate-500 font-bold">Real-time delays & congestion speeds</p>
                </div>

                {/* Search input */}
                <div className="relative">
                  <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-500 stroke-[3px]" />
                  <input 
                    type="text" 
                    placeholder="Search corridor or junction..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs pl-8.5 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-blue-500 focus:outline-none text-slate-800 font-semibold"
                  />
                </div>

                {/* Corridor Status List */}
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {filteredCorridors.map((c, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 flex justify-between items-center text-xs shadow-xs">
                      <div>
                        <strong className="text-slate-900 block font-bold truncate max-w-[170px]">{c.name}</strong>
                        <span className="text-[9.5px] text-slate-500 font-bold block mt-0.5">Avg speed: <strong className="text-slate-700">{c.speed}</strong></span>
                      </div>
                      <div className="text-right">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border block w-fit ml-auto mb-1 ${levelColors[c.level as keyof typeof levelColors]}`}>
                          {c.level}
                        </span>
                        <span className="text-[10px] font-bold font-mono text-slate-800">{c.delay !== '0 mins' ? `+${c.delay}` : 'No Delay'}</span>
                      </div>
                    </div>
                  ))}
                  {filteredCorridors.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-5">No search results found.</p>
                  )}
                </div>
              </div>
            )}

            {/* 3. SCREEN: PLAN ROUTE */}
            {currentScreen === 'route' && (
              <div className="space-y-4">
                <div className="space-y-1 text-left">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Best Route Planning</h3>
                  <p className="text-[10px] text-slate-500 font-bold">Simulates live navigation along alternative routes</p>
                </div>

                <div className="space-y-2 bg-white border border-slate-200 p-3 rounded-2xl shadow-xs">
                  <div>
                    <label className="text-[9px] text-slate-500 uppercase font-black tracking-widest block mb-0.5">Start Origin</label>
                    <select 
                      value={routeForm.origin}
                      onChange={(e) => {
                        setRouteForm({...routeForm, origin: e.target.value});
                        setShowRouteDetail(false);
                      }}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 focus:outline-none text-slate-800 font-bold"
                    >
                      <option value="Hebbal Flyover Junction">📍 Hebbal Flyover Junction</option>
                      <option value="Majestic Central Hub">📍 Majestic Central Hub</option>
                      <option value="Indiranagar 100 Feet Rd">📍 Indiranagar 100 Feet Rd</option>
                      <option value="KR Puram Hanging Bridge">📍 KR Puram Hanging Bridge</option>
                      <option value="Whitefield ITPL">📍 Whitefield ITPL</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 uppercase font-black tracking-widest block mb-0.5">Destination</label>
                    <select 
                      value={routeForm.destination}
                      onChange={(e) => {
                        setRouteForm({...routeForm, destination: e.target.value});
                        setShowRouteDetail(false);
                      }}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 focus:outline-none text-slate-800 font-bold"
                    >
                      <option value="Silk Board Junction">🏁 Silk Board Junction</option>
                      <option value="Electronic City Toll">🏁 Electronic City Toll</option>
                      <option value="Chinnaswamy Stadium">🏁 Chinnaswamy Stadium</option>
                      <option value="Marathahalli Bridge">🏁 Marathahalli Bridge</option>
                      <option value="Koramangala Water Tank">🏁 Koramangala Water Tank</option>
                    </select>
                  </div>
                  <button 
                    onClick={handleCalculateRoute}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2.5 rounded-xl transition-all shadow-md mt-1 cursor-pointer"
                  >
                    Calculate Alternative Routes
                  </button>
                </div>

                {/* Route Selector & SVG Map Simulator */}
                {showRouteDetail && (
                  <div className="space-y-4 text-left">
                    
                    {/* Alternate Route Selector tabs */}
                    <div className="space-y-2">
                      <span className="text-[9px] font-black text-slate-450 uppercase tracking-widest block">Select Route Option</span>
                      <div className="space-y-2">
                        {simulatedRoutes.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              setSelectedRouteId(r.id);
                              setIsNavigating(false);
                              setCarPosition(r.points[0]);
                              setNavStep(0);
                            }}
                            className={`w-full text-left p-3 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                              selectedRouteId === r.id 
                                ? 'bg-blue-50/80 border-blue-550 shadow-sm font-extrabold' 
                                : 'bg-white border-slate-200 hover:bg-slate-50'
                            } ${r.id === 'route-a' ? 'ring-2 ring-emerald-500/20' : ''}`}
                          >
                            <div className="flex justify-between items-start w-full">
                              <div className="min-w-0">
                                <strong className="text-xs font-extrabold text-slate-900 block leading-tight truncate">{r.name}</strong>
                                <span className="text-[10px] text-slate-650 font-semibold block mt-0.5">
                                  Distance: {r.distance} · Delay: <strong className="text-slate-800">{r.expectedDelay}</strong>
                                </span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-xs font-black text-blue-700 block">{r.travelTime}</span>
                                <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase mt-1 inline-block ${
                                  r.congestion === 'CLEAR' ? 'bg-emerald-100 text-emerald-800' :
                                  r.congestion === 'MODERATE' ? 'bg-amber-100 text-amber-800' :
                                  'bg-rose-100 text-rose-800'
                                }`}>
                                  {r.congestion}
                                </span>
                              </div>
                            </div>
                            {/* Recommendation & Highlight label */}
                            <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 mt-0.5 w-full">
                              <span className="text-[9px] text-slate-600 font-bold italic leading-tight">
                                {r.recommendation}
                              </span>
                              {r.id === 'route-a' && (
                                <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded uppercase border border-emerald-200">
                                  Best Choice
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* SVG Map Path Simulator Container */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-2 relative shadow-xs">
                      <span className="text-[9px] font-black text-slate-450 uppercase tracking-widest block mb-2 px-1">ASTRAM Live Route Map</span>
                      
                      {/* Live ETA Floating Banner */}
                      {isNavigating && (
                        <div className="absolute top-10 left-3 right-3 bg-slate-900/90 text-white rounded-xl p-2 flex items-center justify-between shadow-lg backdrop-blur-xs z-50 border border-slate-800 text-[10px] font-mono leading-none animate-slide-down">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="font-bold text-slate-100">ETA:</span>
                            <span className="text-emerald-400 font-extrabold">
                              {Math.max(1, activeRoute.points.length - navStep) * 4}m left
                            </span>
                          </div>
                          <span className="text-slate-405 font-bold">
                            {(Math.max(1, activeRoute.points.length - navStep) * 2.1).toFixed(1)} km left
                          </span>
                        </div>
                      )}

                      {/* SVG Canvas */}
                      <svg viewBox="0 0 300 300" className="w-full h-[180px] bg-slate-50 rounded-xl border border-slate-200">
                        {/* Grids / Roads Network */}
                        <line x1="150" y1="10" x2="150" y2="290" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="3,3" />
                        <line x1="10" y1="150" x2="290" y2="150" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="3,3" />
                        
                        {/* Background Road Lines (Bypass/Ring) */}
                        {simulatedRoutes.map((r) => {
                          const pathData = r.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
                          return (
                            <path 
                              key={r.id} 
                              d={pathData} 
                              fill="none" 
                              stroke={selectedRouteId === r.id ? '#2563EB' : '#94A3B8'} 
                              strokeWidth={selectedRouteId === r.id ? '5' : '2.5'} 
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="transition-all duration-300"
                            />
                          );
                        })}

                        {/* Origin Node Circle */}
                        {(() => {
                          const startN = BENGALURU_NODES.find(n => n.name === routeForm.origin) || BENGALURU_NODES[0];
                          const endN = BENGALURU_NODES.find(n => n.name === routeForm.destination) || BENGALURU_NODES[5];
                          return (
                            <>
                              <circle cx={startN.coords[0]} cy={startN.coords[1]} r="7" fill="#10B981" stroke="white" strokeWidth="2" />
                              <circle cx={startN.coords[0]} cy={startN.coords[1]} r="2" fill="white" />
                              <text x={startN.coords[0] + 10} y={startN.coords[1] + 4} fontSize="8" fontWeight="extrabold" fill="#065F46" className="font-sans select-none">{startN.name.split(' ')[0]}</text>
                              
                              <circle cx={endN.coords[0]} cy={endN.coords[1]} r="7" fill="#EF4444" stroke="white" strokeWidth="2" />
                              <circle cx={endN.coords[0]} cy={endN.coords[1]} r="2" fill="white" />
                              <text x={endN.coords[0] + 10} y={endN.coords[1] + 4} fontSize="8" fontWeight="extrabold" fill="#991B1B" className="font-sans select-none">{endN.name.split(' ')[0]}</text>
                            </>
                          );
                        })()}

                        {/* Animated Car Icon Point */}
                        <circle cx={carPosition[0]} cy={carPosition[1]} r="7" fill="#1E3A8A" stroke="#FFFFFF" strokeWidth="2" className="animate-pulse" />
                        <circle cx={carPosition[0]} cy={carPosition[1]} r="2" fill="#FFFFFF" />
                      </svg>

                      {/* Navigation controls */}
                      <div className="flex justify-between items-center mt-2.5 px-1">
                        {!isNavigating ? (
                          <button
                            onClick={startNavigation}
                            className="bg-blue-600 hover:bg-blue-750 text-white text-[10px] font-black px-3.5 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all w-full justify-center shadow-sm min-h-[40px]"
                          >
                            <Play className="h-3.5 w-3.5 fill-white" /> Start Navigation
                          </button>
                        ) : (
                          <button
                            onClick={stopNavigation}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black px-3.5 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all w-full justify-center shadow-sm min-h-[40px]"
                          >
                            <Square className="h-3.5 w-3.5 fill-white" /> Stop Navigation
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Turn-by-Turn Instruction HUD overlay */}
                    <div className="bg-slate-900 text-white p-3 rounded-2xl space-y-1.5 font-mono text-[10.5px]">
                      <div className="flex justify-between items-center text-blue-400 font-bold border-b border-slate-800 pb-1.5">
                        <span>🛰️ GPS STEP NAVIGATION</span>
                        <span>{navStep + 1} / {activeRoute.points.length}</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1 font-sans">
                        <span className="text-sm shrink-0">
                          {(() => {
                            const dirText = (activeRoute.directions[navStep] || '').toLowerCase();
                            if (dirText.includes("left")) return "⬅️";
                            if (dirText.includes("right")) return "➡️";
                            return "⬆️";
                          })()}
                        </span>
                        <p className="text-white font-bold leading-normal">
                          {activeRoute.directions[navStep] || 'Calculating next routing phase...'}
                        </p>
                      </div>
                      {isNavigating && (
                        <span className="text-emerald-400 font-bold block mt-1 animate-pulse font-sans text-[9px]">
                          ● Syncing dynamic signal overrides on route...
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. SCREEN: REPORT PROBLEM */}
            {currentScreen === 'report' && (
              showCamera ? (
                /* CAMERA VIEWPORT HUD SCREEN */
                <div className="space-y-4 text-center bg-slate-900 text-white rounded-2xl p-4 flex flex-col items-center justify-between min-h-[380px] animate-fade-in relative shadow-md">
                  <div className="w-full flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">📷 ASTRAM Live Camera</span>
                    <button 
                      type="button" 
                      onClick={stopCamera} 
                      className="text-xs text-rose-500 font-black hover:text-rose-400 cursor-pointer min-h-[44px] min-w-[44px]"
                    >
                      Cancel
                    </button>
                  </div>

                  {cameraError ? (
                    <div className="space-y-3.5 flex-1 flex flex-col justify-center py-6 px-2">
                      <p className="text-xs font-bold text-rose-400 leading-tight">
                        {cameraError}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          fileInputRef.current?.click();
                          stopCamera();
                        }}
                        className="bg-blue-600 hover:bg-blue-750 text-white text-[10.5px] font-black py-2.5 px-4 rounded-xl mx-auto transition-all cursor-pointer shadow-md min-h-[44px] flex items-center justify-center"
                      >
                        📁 Choose File instead
                      </button>
                    </div>
                  ) : (
                    <div className="relative w-full h-[220px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                      {!cameraStream && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-slate-450 space-y-2 z-10 bg-slate-950">
                          <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                          <span>Connecting device camera...</span>
                        </div>
                      )}
                      <video 
                        ref={videoRef}
                        autoPlay 
                        playsInline 
                        muted
                        className="w-full h-full object-cover" 
                      />
                    </div>
                  )}

                  {!cameraError && cameraStream && (
                    <div className="w-full flex flex-col items-center gap-2">
                      {/* Capture Trigger Shutter */}
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="h-14 w-14 rounded-full border-4 border-white bg-slate-100/90 active:bg-slate-350 hover:scale-105 transition-all shadow-lg flex items-center justify-center cursor-pointer min-h-[44px]"
                        aria-label="Capture photo"
                      >
                        <span className="h-10 w-10 bg-rose-600 rounded-full"></span>
                      </button>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Tap to snap live photo
                      </span>
                    </div>
                  )}
                </div>
              ) : submittedReport ? (
                /* RECEIPT REPORT SUCCESS SCREEN */
                <div className="flex-1 flex flex-col justify-between min-h-0 animate-fade-in text-center p-1">
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {/* Checkmark animation header */}
                    <div className="py-6 flex flex-col items-center justify-center">
                      <div className="h-16 w-16 bg-emerald-100 border border-emerald-200 rounded-full flex items-center justify-center text-emerald-600 shadow-sm animate-bounce mb-3">
                        <Check className="h-9 w-9 stroke-[3px]" />
                      </div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Report Submitted Successfully</h3>
                      <p className="text-[10px] text-slate-500 font-bold mt-1">Logged into ASTRAM Command Console</p>
                    </div>

                    {/* Receipt Details Table */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 text-left text-xs space-y-3 shadow-xs font-mono">
                      <div className="border-b border-dashed border-slate-200 pb-2 flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-bold uppercase">Report ID:</span>
                        <strong className="text-blue-700 font-black tracking-wide">{submittedReport.id}</strong>
                      </div>
                      <div className="border-b border-dashed border-slate-200 pb-2 flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-bold uppercase">Submission Time:</span>
                        <span className="text-slate-700 font-bold">{submittedReport.time}</span>
                      </div>
                      <div className="border-b border-dashed border-slate-200 pb-2 flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-bold uppercase">Current Status:</span>
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-black text-[9px] uppercase tracking-wide animate-pulse">
                          {submittedReport.status}
                        </span>
                      </div>
                      <div className="border-b border-dashed border-slate-200 pb-2 flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-bold uppercase">Report Type:</span>
                        <span className="text-slate-800 font-bold">{submittedReport.category}</span>
                      </div>
                      <div className="border-b border-dashed border-slate-200 pb-2 flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-bold uppercase">Location:</span>
                        <span className="text-slate-800 font-bold truncate max-w-[130px]">{submittedReport.location}</span>
                      </div>
                      <div className="border-b border-dashed border-slate-200 pb-2 flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-bold uppercase">Severity:</span>
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wide ${
                          submittedReport.severity === 'Low' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                          submittedReport.severity === 'Medium' ? 'bg-amber-50 text-amber-805 border-amber-255' :
                          submittedReport.severity === 'High' ? 'bg-orange-50 text-orange-800 border-orange-200' :
                          'bg-rose-50 text-rose-800 border-rose-200'
                        }`}>
                          {submittedReport.severity}
                        </span>
                      </div>
                      <div className="text-[10px] space-y-1">
                        <span className="text-slate-500 font-bold uppercase block">Description:</span>
                        <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-150 leading-relaxed font-sans font-semibold italic break-words">
                          "{submittedReport.description}"
                        </p>
                      </div>

                      {submittedReport.image && (
                        <div className="pt-2 text-[10px] space-y-1">
                          <span className="text-slate-500 font-bold uppercase block">Evidence Attached:</span>
                          <img 
                            src={submittedReport.image} 
                            alt="Submitted Evidence" 
                            className="w-full h-24 object-cover rounded-xl border border-slate-200 shadow-sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 shrink-0">
                    <button 
                      onClick={() => {
                        setSubmittedReport(null);
                        setCurrentScreen('home');
                      }}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-black py-3.5 rounded-xl transition-all shadow-md uppercase tracking-wider cursor-pointer min-h-[44px] flex items-center justify-center"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                </div>
              ) : (
                /* REPORT FORM SCREEN */
                <form onSubmit={handleSubmitReport} className="flex-1 flex flex-col justify-between min-h-0">
                  <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-4">
                    {/* Header Seal */}
                    <div className="bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-center flex items-center justify-center gap-2">
                      <span className="text-lg">🏛️</span>
                      <div className="text-left">
                        <strong className="text-[9px] font-extrabold text-slate-800 tracking-wider uppercase block">Karnataka CIRS Portal</strong>
                        <span className="text-[8px] font-bold text-slate-500 block">Civic Incident Reporting System</span>
                      </div>
                    </div>

                    {/* Category Selection Dropdown */}
                    <div>
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-wide block mb-1.5">
                        Report Type <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <select 
                        value={reportForm.category}
                        onChange={(e) => setReportForm({...reportForm, category: e.target.value})}
                        className="w-full text-xs bg-white border border-slate-350 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-800 font-bold transition-all shadow-xs min-h-[44px]"
                      >
                        <option value="Accident">🚨 Accident / Collision</option>
                        <option value="Waterlogging">🌧️ Waterlogging / Flooding</option>
                        <option value="Breakdown">🚗 Vehicle Breakdown</option>
                        <option value="Obstruction">🚧 Road Obstruction</option>
                        <option value="Road Damage">🕳️ Pothole / Road Damage</option>
                        <option value="Signal Failure">🚦 Traffic Signal Failure</option>
                      </select>
                    </div>

                    {/* Location Selection Dropdown */}
                    <div>
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-wide block mb-1.5">
                        Location <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <select 
                        value={reportForm.nearest_junction}
                        onChange={(e) => setReportForm({...reportForm, nearest_junction: e.target.value})}
                        className="w-full text-xs bg-white border border-slate-355 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-800 font-bold transition-all shadow-xs min-h-[44px]"
                      >
                        {trafficCorridors.map((c, i) => (
                          <option key={i} value={c.name}>📍 {c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Severity radio choice buttons */}
                    <div>
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-wide block mb-1.5">
                        Severity <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl">
                        {[
                          { val: 'Low', label: 'Low', colorClass: 'peer-checked:bg-emerald-600 peer-checked:text-white text-emerald-700 bg-emerald-50 border-emerald-200' },
                          { val: 'Medium', label: 'Med', colorClass: 'peer-checked:bg-amber-500 peer-checked:text-white text-amber-700 bg-amber-50 border-amber-200' },
                          { val: 'High', label: 'High', colorClass: 'peer-checked:bg-orange-600 peer-checked:text-white text-orange-700 bg-orange-50 border-orange-200' },
                          { val: 'Critical', label: 'Crit', colorClass: 'peer-checked:bg-rose-600 peer-checked:text-white text-rose-700 bg-rose-50 border-rose-200' }
                        ].map((sev) => (
                          <label key={sev.val} className="relative cursor-pointer text-center select-none min-h-[38px] flex items-center justify-center">
                            <input 
                              type="radio" 
                              name="severity" 
                              value={sev.val}
                              checked={reportForm.severity === sev.val}
                              onChange={() => setReportForm({...reportForm, severity: sev.val})}
                              className="sr-only peer" 
                            />
                            <div className={`text-[10px] font-black py-2.5 rounded-lg border w-full transition-all uppercase ${sev.colorClass} peer-checked:shadow-sm flex items-center justify-center`}>
                              {sev.label}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Description Area */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-wide block">
                          Description <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <span className={`text-[9px] font-black font-mono ${
                          reportForm.description.length >= 220 
                            ? 'text-rose-605 animate-pulse' 
                            : reportForm.description.length >= 180 
                            ? 'text-amber-600' 
                            : 'text-slate-400'
                        }`}>
                          {reportForm.description.length} / 250
                        </span>
                      </div>
                      <textarea 
                        maxLength={250}
                        rows={3}
                        placeholder="Specify details, blocked lanes, hazards, or risks..."
                        value={reportForm.description}
                        onChange={(e) => setReportForm({...reportForm, description: e.target.value})}
                        className="w-full text-xs bg-white border border-slate-350 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-800 placeholder-slate-400 resize-none font-bold transition-all shadow-xs"
                      />
                    </div>

                    {/* Photo Attachments Options */}
                    <div>
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-wide block mb-1.5">
                        Evidence Attachment
                      </label>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            type="button"
                            onClick={startCamera}
                            className="bg-slate-50 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-black py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer min-h-[44px]"
                          >
                            📷 Capture Photo
                          </button>
                          <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-slate-50 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-black py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer min-h-[44px]"
                          >
                            📁 Upload Photo
                          </button>
                        </div>

                        {/* Hidden Inputs */}
                        <input 
                          type="file"
                          ref={fileInputRef}
                          accept="image/png, image/jpeg, image/jpg, image/webp"
                          onChange={handleImageChange}
                          className="hidden"
                        />
                        <input 
                          type="file"
                          ref={mobileCameraInputRef}
                          accept="image/*"
                          capture="environment"
                          onChange={handleImageChange}
                          className="hidden"
                        />

                        {imageError && (
                          <div className="text-[9.5px] font-bold text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl leading-tight">
                            ⚠️ {imageError}
                          </div>
                        )}

                        {selectedImage && (
                          <div className="relative border border-emerald-350 bg-emerald-50/20 rounded-xl p-3 flex items-center gap-3 animate-fade-in shadow-inner">
                            <img 
                              src={selectedImage} 
                              alt="Incident Preview" 
                              className="w-14 h-14 rounded-lg object-cover border border-emerald-250 shadow-sm" 
                            />
                            <div className="text-[10px] flex-1">
                              <strong className="text-emerald-800 font-extrabold block">✓ Photo Attached</strong>
                              <span className="text-slate-500 block truncate max-w-[130px]">Evidence package ready</span>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                              <button 
                                type="button"
                                onClick={startCamera}
                                className="text-[9px] font-black px-2 py-1 bg-white hover:bg-slate-50 text-slate-750 border border-slate-300 rounded-lg transition-all min-h-[30px]"
                              >
                                Retake
                              </button>
                              <button 
                                type="button"
                                onClick={handleRemoveImage}
                                className="text-[9px] font-black px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-all min-h-[30px]"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fixed Submit Button at Bottom */}
                  <div className="pt-3 border-t border-slate-200 bg-slate-50 shrink-0">
                    <button 
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-755 text-white text-xs font-black py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider min-h-[44px]"
                    >
                      Submit Report to TMC
                    </button>
                  </div>
                </form>
              )
            )}

            {/* 5. SCREEN: EMERGENCY HELP */}
            {currentScreen === 'emergency' && (
              <div className="space-y-4 text-center">
                <div className="space-y-1 text-left">
                  <h3 className="text-xs font-black text-rose-600 uppercase tracking-tight">SOS Panic Alert</h3>
                  <p className="text-[10px] text-slate-500 font-bold">Alerting nearest active dispatch patrols</p>
                </div>

                {/* Radar SOS pulse */}
                <div className="py-4 flex flex-col items-center">
                  <div className="relative flex items-center justify-center h-28 w-28">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500/20 opacity-75"></span>
                    <div className="relative rounded-full h-24 w-24 bg-rose-600 border-4 border-rose-500 shadow-xl flex flex-col items-center justify-center text-white">
                      <Siren className="h-8 w-8 animate-bounce text-white" />
                      <span className="text-[9px] font-black uppercase mt-1">SOS ACTIVE</span>
                    </div>
                  </div>
                  
                  <span className="text-[10px] text-slate-600 font-mono mt-3.5 block font-bold">
                    GPS LOCK: 12.9176° N, 77.6244° E
                  </span>
                </div>

                {/* Live emergency tracker */}
                <div className="bg-white border border-slate-200 p-3.5 rounded-2xl text-xs text-left space-y-2.5 shadow-xs">
                  <strong className="text-slate-800 font-black uppercase tracking-wider text-[9px] block">Live Dispatch Tracker</strong>
                  <div className="space-y-2.5 font-bold text-slate-700">
                    <div className="flex items-start gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1.5"></span>
                      <span className="text-[11px] leading-tight flex-1 break-words">Command locks GPS coordinates</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${emergencyStep >= 1 ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                      <span className={`text-[11px] leading-tight flex-1 break-words ${emergencyStep >= 1 ? 'text-slate-900' : 'text-slate-450 font-medium'}`}>
                        Patrol Unit 08 Dispatched (3 mins)
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${emergencyStep >= 2 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                      <span className={`text-[11px] leading-tight flex-1 break-words ${emergencyStep >= 2 ? 'text-slate-900 font-black' : 'text-slate-450 font-medium'}`}>
                        {emergencyStep >= 2 ? '🚑 Ambulance Unit 04 Dispatched (5 mins)' : 'Awaiting medical dispatch response'}
                      </span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    handleDeactivateEmergency();
                    setCurrentScreen('home');
                  }}
                  className="w-full bg-white border border-slate-250 hover:bg-slate-50 text-slate-800 text-xs font-black py-2 rounded-xl transition-all shadow-xs"
                >
                  Cancel SOS / False Alarm
                </button>
              </div>
            )}

            {/* 6. SCREEN: ROAD CLOSURES */}
            {currentScreen === 'closures' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Active Road Closures</h3>
                  <p className="text-[10px] text-slate-500 font-bold">Tracked by the astram command console</p>
                </div>

                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {roadClosures.map((cl, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3.5 text-xs space-y-2 shadow-xs">
                      <div className="flex justify-between items-start">
                        <strong className="text-slate-900 font-bold max-w-[180px]">{cl.road}</strong>
                        <span className="text-[8px] font-black uppercase text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded leading-none">
                          {cl.status}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-650 leading-normal font-bold italic">"Reason: {cl.reason}"</p>
                      <div className="flex justify-between text-[10px] border-t border-slate-100 pt-2 text-slate-500 font-semibold">
                        <span>Expected Clearance:</span>
                        <strong className="text-slate-800 font-mono">{cl.clearTime}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. SCREEN: NEARBY SERVICES */}
            {currentScreen === 'services' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Locate Services</h3>
                  <p className="text-[10px] text-slate-500 font-bold">Critical rescue teams near you</p>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-none">
                  {['All', 'Police Stations', 'Hospitals', 'Towing Services', 'Fuel Stations'].map((cat) => {
                    const isSelected = servicesTab === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setServicesTab(cat)}
                        className={`text-[9.5px] font-black uppercase tracking-wider px-3.5 py-2 rounded-full border shrink-0 transition-all min-h-[44px] flex items-center justify-center ${
                          isSelected 
                            ? 'bg-blue-600 text-white border-blue-700 shadow-xs' 
                            : 'bg-white text-slate-700 border-slate-205 hover:bg-slate-100'
                        }`}
                      >
                        {cat.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>

                {/* Services list */}
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {nearbyServices
                    .filter(s => servicesTab === 'All' || s.category === servicesTab)
                    .map((s, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 flex justify-between items-center text-xs shadow-xs">
                        <div className="space-y-0.5">
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 font-mono block">
                            {s.category}
                          </span>
                          <strong className="text-slate-900 font-bold block max-w-[150px] leading-tight">{s.name}</strong>
                          <span className="text-[10px] text-slate-700 font-bold block mt-0.5 font-mono">📞 {s.phone}</span>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <span className="text-[10px] font-mono text-blue-600 font-extrabold block">{s.distance}</span>
                          <div className="flex gap-1.5">
                            <button 
                              onClick={() => handleCallService(s)}
                              className="bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-200 rounded-xl px-3 py-1.5 text-[9px] font-black transition-all cursor-pointer min-h-[44px] flex items-center justify-center"
                            >
                              Call
                            </button>
                            <button 
                              onClick={() => {
                                // Load service on the route screen
                                setCurrentScreen('route');
                                const destNode = getServiceDestinationNode(s.name);
                                const newOrigin = routeForm.origin === destNode 
                                  ? (destNode === 'Hebbal Flyover Junction' ? 'Silk Board Junction' : 'Hebbal Flyover Junction')
                                  : routeForm.origin;
                                setRouteForm({ origin: newOrigin, destination: destNode });
                                setShowRouteDetail(true);
                                setIsNavigating(false);
                                const startCoords = BENGALURU_NODES.find(n => n.name === newOrigin)?.coords || [150, 40];
                                setCarPosition(startCoords as [number, number]);
                                setNavStep(0);
                                alert(`Routing navigation path to ${s.name} (Destination: ${destNode})...`);
                              }}
                              className="bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-250 rounded-xl px-3 py-1.5 text-[9px] font-black transition-all cursor-pointer min-h-[44px] flex items-center justify-center"
                            >
                              Route
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

          </main>

          {/* Navigation Tab Bar */}
          <footer className="h-12 bg-white border-t border-slate-200 flex items-center justify-around text-slate-400 select-none shrink-0 z-[2000] rounded-b-[36px] shadow-xs">
            <button 
              onClick={() => {
                setCurrentScreen('home');
                setShowRouteDetail(false);
                stopNavigation();
                handleDeactivateEmergency();
                setSearchQuery('');
                setSubmittedReport(null);
              }}
              className={`flex flex-col items-center justify-center w-12 h-11 transition-all rounded-xl focus:outline-none focus:bg-slate-50 ${
                currentScreen === 'home' ? 'text-blue-600 font-black' : 'hover:text-slate-800'
              }`}
            >
              <Home className="h-4.5 w-4.5 stroke-[2.5px]" />
              <span className="text-[8px] font-bold mt-0.5">Home</span>
            </button>
            
            <button 
              onClick={() => {
                setCurrentScreen('traffic');
                stopNavigation();
                setSubmittedReport(null);
              }}
              className={`flex flex-col items-center justify-center w-12 h-11 transition-all rounded-xl focus:outline-none focus:bg-slate-50 ${
                currentScreen === 'traffic' ? 'text-blue-600 font-black' : 'hover:text-slate-800'
              }`}
            >
              <Map className="h-4.5 w-4.5 stroke-[2.5px]" />
              <span className="text-[8px] font-bold mt-0.5">Traffic</span>
            </button>

            <button 
              onClick={() => {
                setCurrentScreen('report');
                stopNavigation();
                setSubmittedReport(null);
              }}
              className={`flex flex-col items-center justify-center w-12 h-11 transition-all rounded-xl focus:outline-none focus:bg-slate-50 ${
                currentScreen === 'report' ? 'text-blue-600 font-black' : 'hover:text-slate-800'
              }`}
            >
              <Plus className="h-5 w-5 bg-blue-600 text-white rounded-full p-0.5 shadow-sm hover:bg-blue-700" />
              <span className="text-[8px] font-bold mt-0.5">Report</span>
            </button>

            <button 
              onClick={() => {
                setCurrentScreen('services');
                setServicesTab('All');
                stopNavigation();
                setSubmittedReport(null);
              }}
              className={`flex flex-col items-center justify-center w-12 h-11 transition-all rounded-xl focus:outline-none focus:bg-slate-50 ${
                currentScreen === 'services' ? 'text-blue-600 font-black' : 'hover:text-slate-800'
              }`}
            >
              <MapPin className="h-4.5 w-4.5 stroke-[2.5px]" />
              <span className="text-[8px] font-bold mt-0.5">Services</span>
            </button>
          </footer>

        </div>

        {/* Smartphone Home Indicator Bar */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-slate-700 rounded-full z-[3000]"></div>
      </div>

      {/* Simulator Helper Card */}
      <div className="mt-5 w-full text-left text-xs bg-blue-50/50 border border-blue-150 p-4.5 rounded-xl shadow-xs leading-relaxed text-slate-700">
        <h4 className="text-xs font-black text-blue-800 mb-1.5 uppercase flex items-center gap-1.5">
          <PhoneCall className="h-4 w-4 text-blue-600 animate-pulse" />
          Interactive Mobile Device
        </h4>
        <p className="mb-2 font-semibold">
          This panel simulates the ASTRAM citizen mobile application. You can:
        </p>
        <ul className="list-disc pl-4 space-y-1 text-slate-650 font-medium">
          <li>Check Live traffic speeds and expected delays across Bengaluru.</li>
          <li>Plan routes with dynamic path selection, map rendering, and vehicle movement simulation.</li>
          <li>Report traffic problems (accidents, waterlogging) that instantly feed into general department lists.</li>
          <li>Trigger SOS panic alarms to verify ambulance and police dispatches on telemetry panels.</li>
          <li>Call emergency service contacts or route directly to their units.</li>
        </ul>
      </div>

    </div>
  );
};

export default CitizenMobile;
