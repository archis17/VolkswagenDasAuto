"""
Database Migration Verification Script
Checks if all required tables and functions exist in NeonDB
"""
import asyncio
import os
from dotenv import load_dotenv
from neon_db import neon_db

load_dotenv()


async def verify_migration():
    """Verify that all required database objects exist"""
    try:
        await neon_db.connect()
        
        print("Verifying database migration status...\n")
        
        # List of required tables
        required_tables = [
            'hazard_reports',
            'hazard_detections',
            'mqtt_publish_log',
            'geofence_zones',
            'geofence_broadcasts',
            'device_subscriptions',
            'analytics_cache'
        ]
        
        # List of required functions
        required_functions = [
            'get_nearby_hazards',
            'is_point_in_geofence',
            'find_geofence_zones_for_point',
            'get_device_subscriptions_for_zone',
            'cleanup_expired_analytics_cache',
            'update_geofence_zones_updated_at'
        ]
        
        missing_tables = []
        missing_functions = []
        
        # Check tables
        print("Checking tables...")
        for table in required_tables:
            query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                ) as exists
            """
            result = await neon_db.execute_fetchone(query, table)
            if result and result.get('exists'):
                print(f"  [OK] {table}")
            else:
                print(f"  [MISSING] {table}")
                missing_tables.append(table)
        
        # Check functions
        print("\nChecking functions...")
        for func in required_functions:
            query = """
                SELECT EXISTS (
                    SELECT FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = 'public' 
                    AND p.proname = $1
                ) as exists
            """
            result = await neon_db.execute_fetchone(query, func)
            if result and result.get('exists'):
                print(f"  [OK] {func}")
            else:
                print(f"  [MISSING] {func}")
                missing_functions.append(func)
        
        # Check PostGIS extension
        print("\nChecking PostGIS extension...")
        try:
            result = await neon_db.execute_fetchone("SELECT PostGIS_version() as version")
            if result:
                print(f"  [OK] PostGIS enabled (version: {result.get('version', 'Unknown')})")
            else:
                print("  [MISSING] PostGIS not enabled")
        except Exception as e:
            print(f"  [ERROR] PostGIS check failed: {e}")
        
        # Summary
        print("\n" + "="*50)
        if not missing_tables and not missing_functions:
            print("MIGRATION VERIFIED - All tables and functions exist!")
            return True
        else:
            print("MIGRATION INCOMPLETE")
            if missing_tables:
                print(f"\nMissing tables ({len(missing_tables)}):")
                for table in missing_tables:
                    print(f"   - {table}")
            if missing_functions:
                print(f"\nMissing functions ({len(missing_functions)}):")
                for func in missing_functions:
                    print(f"   - {func}")
            print("\nTo complete migration, run:")
            print("   python db_init.py")
            return False
        
    except Exception as e:
        print(f"Error verifying migration: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await neon_db.disconnect()


if __name__ == "__main__":
    success = asyncio.run(verify_migration())
    exit(0 if success else 1)

