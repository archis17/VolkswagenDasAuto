-- PostGIS Extension (must be enabled first)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Hazard Reports Table
CREATE TABLE IF NOT EXISTS hazard_reports (
    id SERIAL PRIMARY KEY,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    hazard_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    map_link TEXT,
    hash_key VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'reported',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_hazard_reports_location ON hazard_reports USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_timestamp ON hazard_reports(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_hash_key ON hazard_reports(hash_key);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_type ON hazard_reports(hazard_type);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_status ON hazard_reports(status);

-- Function to get nearby hazards (optional helper function)
CREATE OR REPLACE FUNCTION get_nearby_hazards(
    p_lng DOUBLE PRECISION,
    p_lat DOUBLE PRECISION,
    p_radius_meters DOUBLE PRECISION,
    p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
    id INTEGER,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    hazard_type VARCHAR,
    timestamp TIMESTAMP WITH TIME ZONE,
    map_link TEXT,
    status VARCHAR,
    distance_meters DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hr.id,
        ST_Y(hr.location::geometry) as lat,
        ST_X(hr.location::geometry) as lng,
        hr.hazard_type,
        hr.timestamp,
        hr.map_link,
        hr.status,
        ST_Distance(
            hr.location::geography,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        ) as distance_meters
    FROM hazard_reports hr
    WHERE ST_DWithin(
        hr.location::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_meters
    )
    AND hr.timestamp >= (CURRENT_TIMESTAMP - (p_days_back || ' days')::INTERVAL)
    ORDER BY hr.timestamp DESC;
END;
$$ LANGUAGE plpgsql;

