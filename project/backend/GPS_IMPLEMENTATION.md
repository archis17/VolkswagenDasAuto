# GPS Extraction and Storage Implementation

## Overview

This document describes the fully working GPS extraction and storage system implemented for the Hazard Detection and Reporting System.

## Features

✅ **Automatic GPS Extraction**
- GPS from browser geolocation API (primary source)
- GPS from video frame metadata (EXIF)
- GPS from video file metadata (fallback)
- GPS history tracking for time-based lookups

✅ **Real-time GPS Updates**
- Frontend sends GPS coordinates via WebSocket
- Backend receives and stores GPS updates
- GPS associated with every hazard detection

✅ **Database Storage**
- All hazard detections stored with GPS coordinates
- Separate table for automatic detections vs manual reports
- PostGIS geography type for accurate spatial queries

## Architecture

### Data Flow

```
Frontend (Browser)
    ↓
navigator.geolocation.watchPosition()
    ↓
WebSocket.send({gps: {lat, lng}})
    ↓
Backend WebSocket Server
    ↓
gps_extractor.set_gps_location()
    ↓
Hazard Detection (YOLOv8)
    ↓
store_hazard_detections() with GPS
    ↓
Neon DB (PostGIS) - hazard_detections table
```

### Components

1. **gps_extractor.py** - GPS extraction module
   - Extracts GPS from video frames/metadata
   - Manages GPS location history
   - Provides GPS lookup methods

2. **websocket_server.py** - WebSocket handler
   - Receives GPS from frontend
   - Extracts GPS from frames
   - Stores detections with GPS

3. **neon_db.py** - Database operations
   - `insert_hazard_detection()` - Stores detections with GPS
   - Supports NULL location for cases without GPS

4. **Frontend (LiveMode.jsx)** - GPS provider
   - Uses browser geolocation API
   - Sends GPS updates via WebSocket
   - Updates GPS every position change

## Database Schema

### hazard_detections Table

```sql
CREATE TABLE hazard_detections (
    id SERIAL PRIMARY KEY,
    location GEOGRAPHY(POINT, 4326),  -- Nullable for cases without GPS
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
```

### Indexes

- GIST index on `location` for fast spatial queries
- Index on `timestamp` for time-based queries
- Index on `hazard_type` for filtering
- Index on `source` for tracking detection sources

## Usage

### Frontend GPS Updates

The frontend automatically sends GPS coordinates:

```javascript
// GPS is obtained via browser geolocation API
navigator.geolocation.watchPosition(
  (position) => {
    const location = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    
    // Send to WebSocket server
    ws.send(JSON.stringify({ gps: location }));
  }
);
```

### Backend GPS Storage

Every hazard detection is automatically stored with GPS:

```python
# In websocket_server.py
await store_hazard_detections(
    results=detections,
    gps_location=gps_location,  # From client or extracted
    frame_number=frame_number,
    current_mode=mode
)
```

### GPS Extraction Priority

1. **Client GPS** (from browser) - Highest priority
2. **GPS Extractor** (last known location)
3. **Frame Metadata** (EXIF from video frames)
4. **Video Metadata** (from video file)

## API Endpoints

### Get Detections with GPS

```python
# Query detections with GPS
SELECT 
    id,
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng,
    hazard_type,
    timestamp,
    detection_confidence
FROM hazard_detections
WHERE location IS NOT NULL
ORDER BY timestamp DESC;
```

### Find Nearby Detections

```python
# Find detections within radius
nearby = await neon_db.find_nearby_hazards(
    location={"lat": 28.6139, "lng": 77.2090},
    radius_meters=100.0,
    days_back=7
)
```

## Configuration

### Environment Variables

No additional environment variables needed for GPS extraction. The system uses:
- Browser geolocation API (frontend)
- Video metadata (if available)
- Database connection (existing NEON_DATABASE_URL)

### GPS Accuracy

- **Browser GPS**: Typically 10-50 meters (high accuracy)
- **Video Metadata**: Varies by camera (if available)
- **Fallback**: Uses last known GPS location

## Testing

### Verify GPS Storage

1. Start the application
2. Allow location access in browser
3. Detect hazards (they should include GPS)
4. Check database:

```sql
SELECT 
    COUNT(*) as total_detections,
    COUNT(location) as detections_with_gps
FROM hazard_detections;
```

### Test GPS Updates

1. Open browser console
2. Check WebSocket messages for GPS updates
3. Verify GPS is being sent to server

## Troubleshooting

### GPS Not Available

**Symptom**: Detections stored without GPS (location = NULL)

**Solutions**:
1. Check browser location permissions
2. Verify geolocation API is supported
3. Check if GPS is being sent via WebSocket
4. Review browser console for geolocation errors

### GPS Not Accurate

**Symptom**: GPS coordinates seem incorrect

**Solutions**:
1. Enable high accuracy mode (done automatically)
2. Check GPS signal strength
3. Verify browser geolocation settings
4. Use device GPS instead of network-based location

### Database Errors

**Symptom**: Errors storing detections

**Solutions**:
1. Verify database schema is updated (`python db_init.py`)
2. Check database connection
3. Verify PostGIS extension is enabled
4. Review error logs for specific issues

## Next Steps

Future enhancements:
- [ ] GPS accuracy validation
- [ ] GPS smoothing/filtering
- [ ] Historical GPS path tracking
- [ ] GPS-based vehicle speed calculation
- [ ] Integration with vehicle telemetry systems

## Summary

✅ GPS extraction is fully implemented and working
✅ GPS is automatically stored with every hazard detection
✅ Multiple GPS sources supported (browser, video, metadata)
✅ Database schema supports GPS with PostGIS
✅ Frontend sends GPS updates in real-time
✅ Backend stores GPS with all detections

The system is production-ready for GPS-based hazard tracking and geofenced broadcasting.

