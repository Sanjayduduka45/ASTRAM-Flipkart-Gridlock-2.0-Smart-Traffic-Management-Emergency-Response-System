-- ASTRAM Database Schema Initialization
-- Paste this script into the Supabase SQL Editor (https://supabase.com)
-- or run it via psql using your Direct Connection String.

-- 1. Create the Citizen Reports table
CREATE TABLE IF NOT EXISTS public.citizen_reports (
    id VARCHAR(50) PRIMARY KEY,
    start_datetime VARCHAR(50) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    event_cause VARCHAR(100),
    description TEXT,
    original_language VARCHAR(10),
    translated_description TEXT,
    veh_type VARCHAR(50),
    duration_mins DOUBLE PRECISION,
    num_lanes INTEGER,
    risk_level VARCHAR(50),
    probability_closure DOUBLE PRECISION,
    congestion_score INTEGER,
    nearest_junction VARCHAR(255),
    nearest_junction_dist_km DOUBLE PRECISION,
    status VARCHAR(50) DEFAULT 'PENDING',
    assigned_resource VARCHAR(255),
    image TEXT
);

-- 2. Configure Row Level Security (RLS) for public access
-- Since this is a prototype using anonymous publishable key REST endpoints, we disable RLS to allow direct CRUD operations.
ALTER TABLE public.citizen_reports DISABLE ROW LEVEL SECURITY;

-- (Optional) If you prefer keeping RLS enabled, uncomment the following policies instead:
-- ALTER TABLE public.citizen_reports ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable read access for all users" ON public.citizen_reports FOR SELECT USING (true);
-- CREATE POLICY "Enable insert access for all users" ON public.citizen_reports FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Enable update access for all users" ON public.citizen_reports FOR UPDATE USING (true);

-- 3. Pre-seed the table with some initial live reports (optional)
INSERT INTO public.citizen_reports (
    id, start_datetime, latitude, longitude, event_cause, description, 
    original_language, translated_description, veh_type, duration_mins, 
    num_lanes, risk_level, probability_closure, congestion_score, 
    nearest_junction, nearest_junction_dist_km, status, assigned_resource, image
) VALUES 
('CIT-2026-8314', '2026-06-19T23:06:48.314639Z', 12.9176, 77.6244, 'tree_fall', 'Giant tree fell across the main road, blocking all traffic lanes.', 'en', 'Giant tree fell across the main road, blocking all traffic lanes.', 'NONE', 60, 3, 'HIGH', 0.65, 65, 'Silk Board Junction', 2.91, 'PENDING', 'Adugodi Traffic PS', 'https://images.unsplash.com/photo-1542385151-efd9000785a0?q=80&w=400&auto=format&fit=crop'),
('CIT-2026-7572', '2026-06-19T22:54:27.572030Z', 13.0392, 77.5181, 'broken_signal', 'Traffic signal broken down near Jalahalli Cross.', 'en', 'Traffic signal broken down near Jalahalli Cross.', 'NONE', 60, 3, 'MEDIUM', 0.40, 40, 'Peenya Jalahalli Cross', 1.63, 'PENDING', 'Peenya Traffic PS', 'https://images.unsplash.com/photo-1510935579979-509cb709b1f7?q=80&w=400&auto=format&fit=crop')
ON CONFLICT (id) DO NOTHING;
