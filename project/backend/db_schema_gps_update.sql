-- Update schema to support GPS storage for all hazard detections

-- Add GPS-related columns to existing table (if not exists)
ALTER TABLE hazard_reports 
ADD COLUMN IF NOT EXISTS vehicle_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS detection_confidence FLOAT,
ADD COLUMN IF NOT EXISTS bounding_box JSONB,
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';  -- 'manual', 'auto', 'websocket'

-- Create a new table for automatic hazard detections (before reporting)
CREATE TABLE IF NOT EXISTS hazard_detections (
    id SERIAL PRIMARY KEY,
    location GEOGRAPHY(POINT, 4326),  -- Nullable for cases where GPS isn't available
    hazard_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    detection_confidence FLOAT,
    bounding_box JSONB,
    driver_lane BOOLEAN DEFAULT FALSE,
    distance_meters FLOAT,
    frame_number INTEGER,
    video_path TEXT,
    source VARCHAR(50) DEFAULT 'websocket',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for hazard_detections
CREATE INDEX IF NOT EXISTS idx_hazard_detections_location ON hazard_detections USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_hazard_detections_timestamp ON hazard_detections(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_hazard_detections_type ON hazard_detections(hazard_type);
CREATE INDEX IF NOT EXISTS idx_hazard_detections_source ON hazard_detections(source);

-- Update existing hazard_reports to track GPS source
COMMENT ON COLUMN hazard_reports.location IS 'GPS location of the hazard (PostGIS geography point)';
COMMENT ON COLUMN hazard_reports.source IS 'Source of the report: manual (user reported), auto (automatic detection), websocket (real-time detection)';

