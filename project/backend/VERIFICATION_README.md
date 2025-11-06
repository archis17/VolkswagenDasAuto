# Data Flow Verification - Quick Start Guide

## Overview

This directory contains verification scripts to test the hazard detection system's data flow according to the flowchart. The scripts verify:

1. Hash key generation
2. Redis duplicate detection
3. PostGIS storage and retrieval
4. GPS extraction
5. End-to-end data flow

## Prerequisites

1. **Environment Variables** - Ensure `.env` file exists with:
   - `REDIS_URL` - Redis Cloud connection string
   - `NEON_DATABASE_URL` - Neon DB connection string

2. **Dependencies** - All required packages should be installed:
   ```bash
   pip install -r requirements.txt
   ```

3. **Database Schema** - Ensure `hazard_detections` table exists:
   ```bash
   # Run schema migration if needed
   psql $NEON_DATABASE_URL -f db_schema_gps_update.sql
   ```

## Running Verification Scripts

### 1. Full Verification (Recommended)

Runs all tests and provides comprehensive report:

```bash
cd project/backend
python verify_data_flow.py
```

**Output:**
- Tests each component individually
- Verifies end-to-end flow
- Reports missing components
- Provides pass/fail summary

### 2. Redis Duplicate Detection Test

Tests only Redis functionality:

```bash
python test_redis_duplicate.py
```

**Tests:**
- Redis connection
- Hash storage
- Duplicate detection
- TTL verification

### 3. PostGIS Storage Test

Tests only database functionality:

```bash
python test_postgis_storage.py
```

**Tests:**
- Database connection
- Hazard detection insertion
- Coordinate storage (lng, lat order)
- Spatial queries
- Data retrieval

## Expected Results

### Successful Run

```
✅ VERIFICATION PASSED - All tests successful
```

### With Warnings

```
⚠️  VERIFICATION COMPLETED WITH WARNINGS
```

Warnings indicate:
- Missing components (Privacy model, MQTT, Geofencing)
- Optional features not tested (Frame EXIF, Video metadata)

### Failed Run

```
❌ VERIFICATION FAILED - Some tests did not pass
```

Check the detailed output for specific failures.

## Common Issues

### Redis Connection Failed

**Error:** `Redis is not connected`

**Solution:**
1. Check `REDIS_URL` in `.env` file
2. Verify Redis Cloud is accessible
3. Test connection: `redis-cli -u $REDIS_URL ping`

### Database Connection Failed

**Error:** `Database connection failed`

**Solution:**
1. Check `NEON_DATABASE_URL` in `.env` file
2. Verify database is accessible
3. Check network connectivity

### Missing Table

**Error:** `relation "hazard_detections" does not exist`

**Solution:**
```bash
psql $NEON_DATABASE_URL -f db_schema_gps_update.sql
```

## Test Data

The scripts create test data in:
- **Redis:** Test hash keys with 60-second TTL (for testing)
- **Database:** Test hazard detections with source="verification_test" or "postgis_test"

You can clean up test data manually if needed.

## Integration with CI/CD

For automated testing:

```bash
# Exit code 0 = success, 1 = failure
python verify_data_flow.py
if [ $? -eq 0 ]; then
    echo "Verification passed"
else
    echo "Verification failed"
    exit 1
fi
```

## Next Steps

After verification:

1. Review `VERIFICATION_NOTES.md` for identified gaps
2. Implement missing automatic storage in WebSocket flow
3. Add Redis duplicate check before database storage
4. Consider implementing missing components (Privacy, MQTT, Geofencing)

