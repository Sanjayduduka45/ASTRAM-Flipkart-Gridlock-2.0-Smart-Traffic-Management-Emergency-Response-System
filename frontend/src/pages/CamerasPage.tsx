import React, { useState } from 'react';
import { CameraMonitor } from '../components/CameraMonitor';
import type { CameraData, Incident } from '../types';
import type { TMCNotification } from '../components/Layout';

interface CamerasPageProps {
  cameras: CameraData[];
  setCameras: React.Dispatch<React.SetStateAction<CameraData[]>>;
  setTmcNotifications: React.Dispatch<React.SetStateAction<TMCNotification[]>>;
  setIncidents: React.Dispatch<React.SetStateAction<Incident[]>>;
}

export const CamerasPage: React.FC<CamerasPageProps> = ({
  cameras,
  setCameras,
  setTmcNotifications,
  setIncidents
}) => {
  const [selectedCameraId, setSelectedCameraId] = useState<string>('CAM-SB-01');

  return (
    <div className="animate-fade-in text-left h-full">
      <CameraMonitor
        cameras={cameras}
        activeCamId={selectedCameraId}
        onSelectCam={(camId) => setSelectedCameraId(camId)}
        onSyncSignal={(camId) => {
          const newNotif: TMCNotification = {
            id: `notif-${Date.now()}`,
            type: 'dispatch',
            title: 'Signal Override Activated',
            body: `Synchronized outbound traffic signal phases for camera node ${camId}.`,
            timestamp: new Date().toISOString(),
            read: false,
            severity: 'low'
          };
          setTmcNotifications(prev => [newNotif, ...prev]);
        }}
        onReportIncident={(camId, type) => {
          setCameras(prev => prev.map(c => {
            if (c.id === camId) {
              const hasIncident = c.incident !== 'None';
              const newIncident = hasIncident ? 'None' : type;
              
              const newNotif: TMCNotification = {
                id: `notif-${Date.now()}`,
                type: hasIncident ? 'weather' : 'alert',
                title: hasIncident ? 'Incident Resolved' : 'CCTV Incident Flagged',
                body: hasIncident 
                  ? `Edge-AI reported incident on ${c.name} has been resolved.` 
                  : `Edge-AI detected ${type} at junction node ${c.id} (${c.name}).`,
                timestamp: new Date().toISOString(),
                read: false,
                severity: hasIncident ? 'low' : 'high'
              };
              setTmcNotifications(n => [newNotif, ...n]);

              if (!hasIncident) {
                const newInc: Incident = {
                  id: `INC-${Date.now().toString().slice(-4)}`,
                  start_datetime: new Date().toISOString(),
                  latitude: c.latitude,
                  longitude: c.longitude,
                  event_cause: 'breakdown',
                  description: `AI DETECTED: ${type} on CCTV stream ${c.id}.`,
                  veh_type: 'CAR',
                  duration_mins: 60,
                  num_lanes: 1,
                  risk_level: 'HIGH',
                  probability_closure: 0.5,
                  congestion_score: c.density === 'JAMMED' ? 85 : 55,
                  nearest_junction: c.name.split(' - ')[0],
                  nearest_junction_dist_km: 0.0,
                  status: 'PENDING'
                };
                setIncidents(i => [newInc, ...i]);
              } else {
                setIncidents(i => i.map(inc => {
                  if (inc.nearest_junction === c.name.split(' - ')[0] && inc.status !== 'RESOLVED') {
                    return { ...inc, status: 'RESOLVED' };
                  }
                  return inc;
                }));
              }

              return {
                ...c,
                incident: newIncident,
                vehicle_count: hasIncident ? Math.max(5, c.vehicle_count - 20) : c.vehicle_count + 15,
                density: hasIncident ? 'LOW' : 'JAMMED'
              };
            }
            return c;
          }));
        }}
      />
    </div>
  );
};

export default CamerasPage;
