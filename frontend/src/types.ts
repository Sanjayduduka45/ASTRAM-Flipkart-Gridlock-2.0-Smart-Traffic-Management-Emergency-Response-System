export interface Incident {
  id: string;
  start_datetime: string;
  latitude: number;
  longitude: number;
  event_cause: string;
  description: string;
  veh_type?: string;
  duration_mins?: number;
  num_lanes?: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  probability_closure: number;
  congestion_score: number;
  nearest_junction: string;
  nearest_junction_dist_km: number;
  status: 'PENDING' | 'DISPATCHED' | 'ON_SCENE' | 'RESOLVED';
  assigned_resource?: string | null;
  image?: string;
  original_language?: string;
  translated_description?: string;
}

export interface PredictionOutput {
  predicted_label: number;
  probability_closure: number;
  probability_no_closure: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: string;
  model_name: string;
  model_version: string;
  features_used: number;
  threshold_used: number;
  congestion_score?: number;
  nearest_junction?: string;
  nearest_junction_dist_km?: number;
}

export interface TrafficForecastResult {
  eventName: string;
  eventType: string;
  locationName: string;
  date: string;
  startTime: string;
  endTime: string;
  expectedCrowd: number;
  weather: string;
  congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trafficIncreasePct: number;
  peakCongestionTime: string;
  expectedDelayMins: number;
  riskScore: number;
  modelName: string;
  modelVersion: string;
  inferenceTimeMs: number;
  hourlyTrend: Array<{ hour: string; baseline: number; predicted: number }>;
  aiRecommendations: string[];
}

export interface ChatMessage {
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface RouteDetails {
  name: string;
  distance: string;
  travelTime: string;
  expectedDelay: string;
  congestionScore: number;
  description: string;
  best?: boolean;
}

export interface CongestedRoute {
  id: string;
  name: string;
  zone: string;
  center: [number, number];
  redRoute: [number, number][];
  blueRoute: [number, number][];
  greenRoute: [number, number][];
  stats: {
    vehiclesRedirected: string;
    travelTimeSaved: string;
    congestionReduction: number;
  };
  current: {
    route: string;
    distance: string;
    travelTime: string;
    expectedDelay: string;
    congestionScore: number;
  };
  reductionPercentage: number;
  alternatives: {
    A: RouteDetails;
    B: RouteDetails;
    C: RouteDetails;
  };
}

export interface CameraData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  density: string;
  vehicle_count: number;
  incident: string;
  queue_length_m: number;
  fps: number;
  resolution: string;
  uptime_pct: number;
  last_update: string;
}

export interface WeatherData {
  temperature: number;
  rainfall_mm: number;
  flood_risk: string;
  storm_alerts: string;
  visibility_km?: number;
  humidity?: number;
  wind_speed?: number;
  rain_probability?: number;
  weather_condition?: string;
  source?: string;
  timestamp?: string;
}

export interface HotspotData {
  name: string;
  lat: number;
  lon: number;
  risk: string;
  score: number;
  delay: string | number;
}

export interface CitizenReportInput {
  category: string;
  nearest_junction: string;
  description: string;
  status: string;
  image?: string;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface RouteResult {
  travelTime: string;
  expectedDelay: string;
  problemSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detourRoute: string;
}

export interface MapLayersState {
  incidents: boolean;
  congestion: boolean;
  cameras: boolean;
  events: boolean;
  closures: boolean;
  diversions: boolean;
  police: boolean;
  emergency: boolean;
  barricades: boolean;
  heatmap: boolean;
  weather: boolean;
  marshals?: boolean;
}

