-- Extended Database Schema for Hazard Eye
-- Includes MQTT, Geofencing, and Analytics support

-- PostGIS Extension (must be enabled first)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- MQTT Publish Log Table
-- ============================================
CREATE TABLE IF NOT EXISTS mqtt_publish_log (
    id SERIAL PRIMARY KEY,
    detection_id INTEGER REFERENCES hazard_detections(id) ON DELETE SET NULL,
    topic VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    qos INTEGER DEFAULT 0 CHECK (qos IN (0, 1, 2)),
    published_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
    retry_count INTEGER DEFAULT 0,
    error_message TEXT
);

-- Indexes for mqtt_publish_log
CREATE INDEX IF NOT EXISTS idx_mqtt_publish_log_detection_id ON mqtt_publish_log(detection_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_publish_log_topic ON mqtt_publish_log(topic);
CREATE INDEX IF NOT EXISTS idx_mqtt_publish_log_status ON mqtt_publish_log(status);
CREATE INDEX IF NOT EXISTS idx_mqtt_publish_log_published_at ON mqtt_publish_log(published_at DESC);

-- ============================================
-- Geofence Zones Table
-- ============================================
CREATE TABLE IF NOT EXISTS geofence_zones (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    zone_type VARCHAR(50) NOT NULL CHECK (zone_type IN ('city', 'highway', 'custom')),
    center_location GEOGRAPHY(POINT, 4326) NOT NULL,
    radius_meters FLOAT NOT NULL CHECK (radius_meters > 0),
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for geofence_zones
CREATE INDEX IF NOT EXISTS idx_geofence_zones_location ON geofence_zones USING GIST(center_location);
CREATE INDEX IF NOT EXISTS idx_geofence_zones_type ON geofence_zones(zone_type);
CREATE INDEX IF NOT EXISTS idx_geofence_zones_active ON geofence_zones(is_active);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_geofence_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_geofence_zones_updated_at
    BEFORE UPDATE ON geofence_zones
    FOR EACH ROW
    EXECUTE FUNCTION update_geofence_zones_updated_at();

-- ============================================
-- Geofence Broadcasts Table
-- ============================================
CREATE TABLE IF NOT EXISTS geofence_broadcasts (
    id SERIAL PRIMARY KEY,
    detection_id INTEGER REFERENCES hazard_detections(id) ON DELETE SET NULL,
    geofence_zone_id INTEGER REFERENCES geofence_zones(id) ON DELETE CASCADE,
    broadcast_topic VARCHAR(255) NOT NULL,
    devices_notified INTEGER DEFAULT 0,
    broadcasted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    payload JSONB
);

-- Indexes for geofence_broadcasts
CREATE INDEX IF NOT EXISTS idx_geofence_broadcasts_detection_id ON geofence_broadcasts(detection_id);
CREATE INDEX IF NOT EXISTS idx_geofence_broadcasts_zone_id ON geofence_broadcasts(geofence_zone_id);
CREATE INDEX IF NOT EXISTS idx_geofence_broadcasts_broadcasted_at ON geofence_broadcasts(broadcasted_at DESC);

-- ============================================
-- Device Subscriptions Table
-- ============================================
CREATE TABLE IF NOT EXISTS device_subscriptions (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255), -- Optional, for authenticated users
    geofence_zone_id INTEGER REFERENCES geofence_zones(id) ON DELETE CASCADE,
    subscription_type VARCHAR(50) DEFAULT 'all' CHECK (subscription_type IN ('all', 'specific_types')),
    subscribed_hazard_types TEXT[], -- Array of hazard types
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE,
    metadata JSONB -- Additional device metadata
);

-- Indexes for device_subscriptions
CREATE INDEX IF NOT EXISTS idx_device_subscriptions_device_id ON device_subscriptions(device_id);
CREATE INDEX IF NOT EXISTS idx_device_subscriptions_user_id ON device_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_subscriptions_zone_id ON device_subscriptions(geofence_zone_id);
CREATE INDEX IF NOT EXISTS idx_device_subscriptions_active ON device_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_device_subscriptions_hazard_types ON device_subscriptions USING GIN(subscribed_hazard_types);

-- ============================================
-- Analytics Cache Table (Optional, for performance)
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    cache_data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for analytics_cache
CREATE INDEX IF NOT EXISTS idx_analytics_cache_key ON analytics_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_expires_at ON analytics_cache(expires_at);

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_analytics_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM analytics_cache WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Helper Functions
-- ============================================

-- Function to check if a point is within a geofence zone
CREATE OR REPLACE FUNCTION is_point_in_geofence(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    zone_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    zone_center GEOGRAPHY;
    zone_radius FLOAT;
    point_location GEOGRAPHY;
    distance_meters FLOAT;
BEGIN
    -- Get zone center and radius
    SELECT center_location, radius_meters INTO zone_center, zone_radius
    FROM geofence_zones
    WHERE id = zone_id AND is_active = TRUE;
    
    IF zone_center IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Create point from input coordinates
    point_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
    
    -- Calculate distance
    distance_meters := ST_Distance(zone_center, point_location);
    
    -- Check if within radius
    RETURN distance_meters <= zone_radius;
END;
$$ LANGUAGE plpgsql;

-- Function to find active geofence zones containing a point
CREATE OR REPLACE FUNCTION find_geofence_zones_for_point(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION
)
RETURNS TABLE (
    zone_id INTEGER,
    zone_name VARCHAR,
    zone_type VARCHAR,
    distance_meters FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gz.id,
        gz.name,
        gz.zone_type,
        ST_Distance(
            gz.center_location::geography,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        ) as distance_meters
    FROM geofence_zones gz
    WHERE gz.is_active = TRUE
    AND ST_DWithin(
        gz.center_location::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        gz.radius_meters
    )
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get device subscriptions for a geofence zone
CREATE OR REPLACE FUNCTION get_device_subscriptions_for_zone(
    p_zone_id INTEGER,
    p_hazard_type VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    device_id VARCHAR,
    user_id VARCHAR,
    subscription_type VARCHAR,
    subscribed_hazard_types TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ds.device_id,
        ds.user_id,
        ds.subscription_type,
        ds.subscribed_hazard_types
    FROM device_subscriptions ds
    WHERE ds.geofence_zone_id = p_zone_id
    AND ds.is_active = TRUE
    AND (
        ds.subscription_type = 'all' 
        OR (ds.subscription_type = 'specific_types' AND (p_hazard_type IS NULL OR p_hazard_type = ANY(ds.subscribed_hazard_types)))
    );
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE mqtt_publish_log IS 'Logs all MQTT publish attempts for tracking and debugging';
COMMENT ON TABLE geofence_zones IS 'Defines geographic zones for location-based hazard broadcasting';
COMMENT ON TABLE geofence_broadcasts IS 'Tracks geofence-based hazard broadcasts';
COMMENT ON TABLE device_subscriptions IS 'Manages device and user subscriptions to geofence zones';
COMMENT ON TABLE analytics_cache IS 'Caches analytics query results for performance optimization';

