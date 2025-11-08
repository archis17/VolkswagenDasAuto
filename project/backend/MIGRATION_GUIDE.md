# Database Migration Guide for NeonDB

## Overview

This guide will help you migrate your NeonDB database to include all the new features:
- MQTT publish logging
- Geofence zones and broadcasting
- Device subscriptions
- Analytics cache

## Migration Steps

### Option 1: Run the Migration Script (Recommended)

The `db_init.py` script has been updated to automatically apply all schema files:

```bash
cd project/backend
python db_init.py
```

This will:
1. Apply the base schema (`db_schema.sql`)
2. Apply the GPS update schema (`db_schema_gps_update.sql`)
3. Apply the extended schema (`db_schema_extended.sql`) - **NEW**

### Option 2: Manual Migration via NeonDB Console

If you prefer to run SQL manually:

1. Go to your NeonDB dashboard
2. Open the SQL Editor
3. Copy and paste the contents of `db_schema_extended.sql`
4. Execute the SQL

### Verify Migration

After running the migration, verify it completed successfully:

```bash
cd project/backend
python verify_migration.py
```

This will check:
- ✅ All required tables exist
- ✅ All required functions exist
- ✅ PostGIS extension is enabled

## Required Tables

After migration, you should have these tables:

1. **hazard_reports** - User-reported hazards
2. **hazard_detections** - Automatic detections from WebSocket
3. **mqtt_publish_log** - MQTT publishing history
4. **geofence_zones** - Geofence zone definitions
5. **geofence_broadcasts** - Broadcast tracking
6. **device_subscriptions** - Device/user subscriptions
7. **analytics_cache** - Analytics query cache (optional)

## Required Functions

1. **get_nearby_hazards** - Find hazards near a location
2. **is_point_in_geofence** - Check if point is in a zone
3. **find_geofence_zones_for_point** - Find zones containing a point
4. **get_device_subscriptions_for_zone** - Get subscriptions for a zone
5. **cleanup_expired_analytics_cache** - Clean expired cache entries
6. **update_geofence_zones_updated_at** - Auto-update timestamp trigger

## Troubleshooting

### If migration fails:

1. **Check PostGIS Extension**: Ensure PostGIS is enabled
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

2. **Check existing tables**: Some tables might already exist
   - The script uses `IF NOT EXISTS` so it's safe to run multiple times

3. **Check permissions**: Ensure your database user has CREATE privileges

### Common Issues:

- **"relation already exists"**: This is normal if tables already exist. The script will skip them.
- **"function already exists"**: Functions are created with `CREATE OR REPLACE`, so this is safe.
- **PostGIS errors**: Make sure PostGIS extension is enabled in your NeonDB project.

## After Migration

Once migration is complete:

1. Restart your backend server
2. Verify MQTT connection (if enabled)
3. Test analytics endpoints: `/api/analytics/stats`
4. Test geofence creation via API (if needed)

## Rollback

If you need to rollback (not recommended):

The migration uses `IF NOT EXISTS` and `CREATE OR REPLACE`, so you can:
- Drop specific tables if needed
- Functions can be dropped and recreated

**Note**: Dropping tables will delete data. Always backup before rollback.

