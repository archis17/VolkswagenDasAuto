# Neon DB Setup Guide with PostGIS

## Overview

This guide will help you set up Neon DB (serverless PostgreSQL) with PostGIS extension as the main database for the Hazard Detection and Reporting System. Neon DB replaces MongoDB and provides powerful geospatial capabilities through PostGIS.

## Prerequisites

1. A Neon DB account (sign up at https://neon.tech)
2. Python 3.8+ installed
3. All Python dependencies installed

## Step 1: Create Neon DB Project

1. Go to https://console.neon.tech
2. Sign up or log in
3. Create a new project
4. Choose a region closest to your users
5. Note your connection string (it will look like):
   ```
   postgresql://username:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```

## Step 2: Enable PostGIS Extension

PostGIS is required for geospatial operations. You can enable it via the Neon console:

1. Go to your project in Neon console
2. Click on "SQL Editor"
3. Run this command:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

Alternatively, the application will automatically enable PostGIS on first connection.

## Step 3: Install Dependencies

```bash
cd project/backend
pip install -r requirements.txt
```

This installs:
- `asyncpg` - Async PostgreSQL driver
- `psycopg2-binary` - PostgreSQL adapter
- `sqlalchemy` - SQL toolkit
- `geoalchemy2` - PostGIS extension for SQLAlchemy

## Step 4: Configure Environment Variables

Create or update your `.env` file in `project/backend/`:

```env
# Neon DB Connection (REQUIRED)
NEON_DATABASE_URL=postgresql://username:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require

# Other existing variables...
REDIS_HOST=localhost
REDIS_PORT=6379
# ... etc
```

**Important**: Replace the connection string with your actual Neon DB connection URL.

## Step 5: Initialize Database Schema

Run the database initialization script:

```bash
cd project/backend
python db_init.py
```

This will:
- Enable PostGIS extension
- Create the `hazard_reports` table
- Create necessary indexes for performance
- Create helper functions for geospatial queries

Expected output:
```
✓ Executed: CREATE EXTENSION IF NOT EXISTS postgis
✓ Executed: CREATE TABLE IF NOT EXISTS hazard_reports...
✅ Database schema initialized successfully!
✅ PostGIS version: 3.x.x
```

## Step 6: Verify Setup

Start your FastAPI server:

```bash
python main.py
```

Check the health endpoint:

```bash
curl http://localhost:8000/api/health
```

You should see:
```json
{
  "status": "healthy",
  "redis": true,
  "database": true,
  "mode": "live",
  ...
}
```

Check database status:

```bash
curl http://localhost:8000/api/database/status
```

## Database Schema

### hazard_reports Table

```sql
CREATE TABLE hazard_reports (
    id SERIAL PRIMARY KEY,
    location GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS geography type
    hazard_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    map_link TEXT,
    hash_key VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'reported',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

- **GIST index on location**: Fast geospatial queries
- **Index on timestamp**: Fast sorting by date
- **Index on hash_key**: Fast duplicate detection
- **Index on hazard_type**: Fast filtering by type
- **Index on status**: Fast status filtering

## PostGIS Features Used

### 1. Geography Type
- Uses `GEOGRAPHY(POINT, 4326)` for accurate distance calculations
- Automatically handles Earth's curvature
- Coordinates stored as (longitude, latitude)

### 2. Spatial Functions

#### ST_MakePoint
Creates a point from longitude and latitude:
```sql
ST_MakePoint(lng, lat)
```

#### ST_SetSRID
Sets the spatial reference system (WGS84):
```sql
ST_SetSRID(ST_MakePoint(lng, lat), 4326)
```

#### ST_DWithin
Finds points within a distance:
```sql
ST_DWithin(
    location::geography,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    radius_in_meters
)
```

#### ST_X / ST_Y
Extracts coordinates from geometry:
```sql
ST_X(location::geometry) as lng
ST_Y(location::geometry) as lat
```

## Migration from MongoDB

The application has been migrated from MongoDB to Neon DB/PostGIS. Key changes:

1. **Location Storage**: 
   - MongoDB: `{lat: 28.6139, lng: 77.2090}`
   - PostGIS: `GEOGRAPHY(POINT, 4326)` with spatial indexing

2. **Duplicate Detection**:
   - MongoDB: Range queries on lat/lng
   - PostGIS: Spatial queries using `ST_DWithin` (more accurate)

3. **Data Types**:
   - MongoDB: ObjectId for IDs
   - PostGIS: SERIAL (auto-incrementing integer)

## API Endpoints

### Get All Hazards
```bash
GET /api/hazard-reports
```

Returns all hazards sorted by timestamp (newest first).

### Get Database Status
```bash
GET /api/database/status
```

Returns database connection status and statistics.

### Health Check
```bash
GET /api/health
```

Returns health status of all services including database.

## Troubleshooting

### Connection Issues

**Problem**: `NEON_DATABASE_URL environment variable is not set`

**Solution**: 
1. Verify `.env` file exists in `project/backend/`
2. Check that `NEON_DATABASE_URL` is set correctly
3. Ensure connection string is complete (includes `?sslmode=require`)

**Problem**: `Connection refused` or `Timeout`

**Solution**:
1. Verify Neon DB project is active
2. Check firewall/network settings
3. Verify connection string is correct
4. Try connecting via Neon console SQL editor

### PostGIS Extension Issues

**Problem**: `PostGIS extension not found`

**Solution**:
1. Enable PostGIS via Neon console SQL editor:
   ```sql
   CREATE EXTENSION postgis;
   ```
2. Or run `python db_init.py` again

**Problem**: `permission denied for extension postgis`

**Solution**: Contact Neon support or check if your plan supports PostGIS (it should be available on all plans).

### Schema Issues

**Problem**: `relation "hazard_reports" does not exist`

**Solution**: Run the initialization script:
```bash
python db_init.py
```

### Performance Issues

**Problem**: Slow queries

**Solution**:
1. Verify indexes are created:
   ```sql
   SELECT * FROM pg_indexes WHERE tablename = 'hazard_reports';
   ```
2. Use `EXPLAIN ANALYZE` to check query plans
3. Consider increasing Neon DB compute units for better performance

## Best Practices

1. **Connection Pooling**: The application uses connection pooling (min: 2, max: 10 connections)
2. **Indexes**: All spatial and common query columns are indexed
3. **Geography vs Geometry**: Using `GEOGRAPHY` type for accurate distance calculations
4. **Coordinate Order**: PostGIS uses (longitude, latitude) order, not (lat, lng)
5. **Timezone**: All timestamps stored with timezone information

## Performance Tips

1. **Spatial Queries**: Use `ST_DWithin` with geography type for accurate distance calculations
2. **Index Usage**: GIST index on location enables fast spatial queries
3. **Connection Pooling**: Adjust pool size based on your workload
4. **Query Optimization**: Use `LIMIT` and `OFFSET` for pagination

## Monitoring

### Check Connection Status
```bash
curl http://localhost:8000/api/database/status
```

### Check Total Hazards
```sql
SELECT COUNT(*) FROM hazard_reports;
```

### Check Recent Hazards
```sql
SELECT * FROM hazard_reports 
ORDER BY timestamp DESC 
LIMIT 10;
```

### Check Spatial Index Usage
```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans
FROM pg_stat_user_indexes
WHERE tablename = 'hazard_reports';
```

## Support

For issues:
1. Check Neon DB console for connection status
2. Review application logs
3. Verify environment variables
4. Test connection via Neon SQL editor
5. Check Neon DB documentation: https://neon.tech/docs

## Additional Resources

- [Neon DB Documentation](https://neon.tech/docs)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [asyncpg Documentation](https://magicstack.github.io/asyncpg/current/)
- [PostGIS Spatial Functions](https://postgis.net/docs/reference.html)

