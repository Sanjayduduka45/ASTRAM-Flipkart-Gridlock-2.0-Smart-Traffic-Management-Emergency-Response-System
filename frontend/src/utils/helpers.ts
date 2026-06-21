
export const getZoneForJunction = (junction: string): string => {
  if (junction.includes("Silk Board")) return "Silk Board Area";
  if (junction.includes("Hebbal")) return "Hebbal Corridor";
  if (junction.includes("KR Puram")) return "Whitefield";
  if (junction.includes("Mekhri")) return "Hebbal Corridor";
  if (junction.includes("Yeshwanthpur")) return "Yeshwanthpur";
  if (junction.includes("Nagavara")) return "Hebbal Corridor";
  if (junction.includes("Mysore")) return "Majestic Center";
  if (junction.includes("Ayyappa")) return "Koramangala";
  if (junction.includes("Whitefield")) return "Whitefield";
  return "Unknown Zone";
};

export interface ResourceItem {
  quantity: number;
  unit: string;
  capacity: number;
  costPerHour: number;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  description: string;
}

export interface ResourcePlan {
  police: ResourceItem;
  barricades: ResourceItem;
  marshals: ResourceItem;
  emergency: ResourceItem;
  totalCost: number;
  utilization: number;
}

export const getJunctionCoordinates = (junctionName: string): [number, number] => {
  const normalized = junctionName.toLowerCase();
  if (normalized.includes("silk board")) return [12.9176, 77.6244];
  if (normalized.includes("hebbal")) return [13.0354, 77.5978];
  if (normalized.includes("kr puram") || normalized.includes("hanging bridge")) return [13.0135, 77.6914];
  if (normalized.includes("majestic")) return [12.9757, 77.5728];
  if (normalized.includes("itpl") || normalized.includes("whitefield")) return [12.9785, 77.7123];
  if (normalized.includes("electronic city")) return [12.845, 77.66];
  if (normalized.includes("marathahalli")) return [12.9562, 77.698];
  if (normalized.includes("bellandur")) return [12.9279, 77.6804];
  return [12.9716, 77.5946];
};

export const getSmartResourcePlan = (junction: string, crowdSize: number = 10000, durationHours: number = 4): ResourcePlan => {
  const scale = crowdSize > 25000 ? 'CRITICAL' : crowdSize > 12000 ? 'HIGH' : 'MEDIUM';
  
  let pQty: number;
  let bQty: number;
  let mQty: number;
  let eQty: number;
  
  if (junction.includes("Silk Board")) {
    pQty = scale === 'CRITICAL' ? 18 : scale === 'HIGH' ? 12 : 8;
    bQty = scale === 'CRITICAL' ? 80 : scale === 'HIGH' ? 50 : 30;
    mQty = scale === 'CRITICAL' ? 25 : scale === 'HIGH' ? 15 : 8;
    eQty = scale === 'CRITICAL' ? 3 : scale === 'HIGH' ? 2 : 1;
  } else if (junction.includes("Hebbal")) {
    pQty = scale === 'CRITICAL' ? 14 : scale === 'HIGH' ? 10 : 6;
    bQty = scale === 'CRITICAL' ? 60 : scale === 'HIGH' ? 40 : 20;
    mQty = scale === 'CRITICAL' ? 18 : scale === 'HIGH' ? 12 : 6;
    eQty = scale === 'CRITICAL' ? 2 : scale === 'HIGH' ? 2 : 1;
  } else if (junction.includes("KR Puram")) {
    pQty = scale === 'CRITICAL' ? 20 : scale === 'HIGH' ? 12 : 8;
    bQty = scale === 'CRITICAL' ? 70 : scale === 'HIGH' ? 45 : 25;
    mQty = scale === 'CRITICAL' ? 30 : scale === 'HIGH' ? 18 : 10;
    eQty = scale === 'CRITICAL' ? 3 : scale === 'HIGH' ? 2 : 1;
  } else {
    pQty = scale === 'CRITICAL' ? 10 : scale === 'HIGH' ? 8 : 4;
    bQty = scale === 'CRITICAL' ? 40 : scale === 'HIGH' ? 25 : 15;
    mQty = scale === 'CRITICAL' ? 12 : scale === 'HIGH' ? 8 : 4;
    eQty = 1;
  }
  
  const policeItem: ResourceItem = {
    quantity: pQty,
    unit: 'Officers',
    capacity: 50,
    costPerHour: 250,
    priority: scale === 'CRITICAL' ? 'Critical' : scale === 'HIGH' ? 'High' : 'Medium',
    description: junction.includes("Silk Board")
      ? 'Stationed at Hosur Road merge, Outer Ring Road underpass, and HSR slip lane.'
      : junction.includes("Hebbal")
      ? 'Stationed at ORR approach flyover bifurcation and Outer Ring Road entry.'
      : junction.includes("KR Puram")
      ? 'Stationed at KR Puram metro crossing and Hanging Bridge entry ramps.'
      : 'Point duty coverage at primary traffic conflict spots.'
  };
  
  const barricadesItem: ResourceItem = {
    quantity: bQty,
    unit: 'Steel Barriers',
    capacity: 200,
    costPerHour: 50,
    priority: scale === 'CRITICAL' ? 'High' : 'Medium',
    description: junction.includes("Silk Board")
      ? 'Deployed for slip road lane closures and HSR bypass channelization.'
      : junction.includes("Hebbal")
      ? 'Positioned for dynamic lane segregation at the flyover bottleneck.'
      : junction.includes("KR Puram")
      ? 'Positioned at bus priority lanes and Outer Ring Road merge lanes.'
      : 'Deployed for speed moderation and queue control.'
  };
  
  const marshalsItem: ResourceItem = {
    quantity: mQty,
    unit: 'Civilian Marshals',
    capacity: 80,
    costPerHour: 150,
    priority: scale === 'CRITICAL' ? 'Medium' : 'Low',
    description: junction.includes("Silk Board")
      ? 'Assigned to manage traffic flow around service lanes and dropping zones.'
      : junction.includes("Hebbal")
      ? 'Deployed at local bus bays and underpass pedestrian crossing junctions.'
      : junction.includes("KR Puram")
      ? 'Deployed to regulate pedestrian crossings and avoid auto queue build-ups.'
      : 'Routine patrol at busy crosswalks and intersections.'
  };
  
  const emergencyItem: ResourceItem = {
    quantity: eQty,
    unit: 'Standby Squads',
    capacity: 8,
    costPerHour: 1000,
    priority: scale === 'CRITICAL' ? 'Critical' : 'High',
    description: junction.includes("Silk Board")
      ? 'Heavy Tow Truck Alpha on standby at Silk Board Depot; BBMP Water Pumping Unit ready.'
      : junction.includes("Hebbal")
      ? 'Heavy Tow Truck Beta at Hebbal flyover depot; BBMP Drainage Rescue Team standby.'
      : junction.includes("KR Puram")
      ? 'Emergency Pumping Crew (East) & Horticulture recovery team on standby for tree fall clearance.'
      : '1 Patrol vehicle standby, 1 Tow Asset en route.'
  };
  
  const totalCost = (pQty * 250 + bQty * 50 + mQty * 150 + eQty * 1000) * durationHours;
  const avgUtilization = Math.round(((pQty / 50 + bQty / 200 + mQty / 80 + eQty / 8) / 4) * 100);
  
  return {
    police: policeItem,
    barricades: barricadesItem,
    marshals: marshalsItem,
    emergency: emergencyItem,
    totalCost,
    utilization: avgUtilization
  };
};

export interface PoliceStation {
  name: string;
  latitude: number;
  longitude: number;
  phone: string;
}

export const BENGALURU_POLICE_STATIONS: PoliceStation[] = [
  { name: 'Madiwala Traffic Police Station', latitude: 12.9220, longitude: 77.6210, phone: '080-22943015' },
  { name: 'Hebbal Traffic Police Station', latitude: 13.0370, longitude: 77.5980, phone: '080-22943016' },
  { name: 'Whitefield Traffic Police Station', latitude: 12.9690, longitude: 77.7500, phone: '080-22943017' },
  { name: 'Yelahanka Traffic Police Station', latitude: 13.1000, longitude: 77.5960, phone: '080-22943018' },
  { name: 'HAL Airport Traffic Police Station', latitude: 12.9560, longitude: 77.6760, phone: '080-22943019' },
  { name: 'Shivajinagar Traffic Police Station', latitude: 12.9860, longitude: 77.6050, phone: '080-22943020' }
];

export const getNearestPoliceStation = (lat: number, lon: number): { name: string; distance: number; phone: string } => {
  let nearest = BENGALURU_POLICE_STATIONS[0];
  let minDistance = Infinity;

  BENGALURU_POLICE_STATIONS.forEach(station => {
    const dist = Math.sqrt(Math.pow(station.latitude - lat, 2) + Math.pow(station.longitude - lon, 2)) * 111;
    if (dist < minDistance) {
      minDistance = dist;
      nearest = station;
    }
  });

  return {
    name: nearest.name,
    distance: parseFloat(minDistance.toFixed(1)),
    phone: nearest.phone
  };
};

export const calculateEventRiskScore = (crowdSize: number, durationMins: number, locationName: string, weather: string): number => {
  let crowdPoints = 5;
  if (crowdSize >= 50000) crowdPoints = 40;
  else if (crowdSize >= 30000) crowdPoints = 30;
  else if (crowdSize >= 15000) crowdPoints = 20;
  else if (crowdSize >= 5000) crowdPoints = 10;

  let durationPoints = 5;
  if (durationMins >= 240) durationPoints = 20;
  else if (durationMins >= 150) durationPoints = 15;
  else if (durationMins >= 90) durationPoints = 10;

  let locationPoints = 10;
  if (["Silk Board Junction", "Hebbal Flyover Junction", "KR Puram Hanging Bridge"].includes(locationName)) {
    locationPoints = 25;
  } else if (["Mekhri Circle", "Nagavara ORR Junction", "Mysore Road Toll"].includes(locationName)) {
    locationPoints = 15;
  }

  let weatherPoints = 2;
  if (["Stormy", "Heavy Rain"].includes(weather)) weatherPoints = 15;
  else if (["Rainy", "Foggy"].includes(weather)) weatherPoints = 10;

  return Math.min(100, crowdPoints + durationPoints + locationPoints + weatherPoints);
};
