"""
PostGIS Storage Test Script
Tests PostGIS database storage and retrieval functionality
"""
import asyncio
import sys
from datetime import datetime
from neon_db import neon_db


async def test_postgis_storage():
    """Test PostGIS storage and retrieval"""
    print("="*70)
    print("POSTGIS STORAGE TEST")
    print("="*70)
    
    # Test 1: Database connection
    print("\n[1] Checking database connection...")
    try:
        if not neon_db._pool:
            await neon_db.connect()
        
        is_connected = await neon_db.check_connection()
        if not is_connected:
            print("❌ Database connection failed")
            return False
        
        print("✅ Database is connected")
    except Exception as e:
        print(f"❌ Database connection error: {str(e)}")
        print("   Please check:")
        print("   - NEON_DATABASE_URL is set in .env file")
        print("   - Database is accessible")
        return False
    
    # Test 2: Insert hazard detection
    print("\n[2] Testing hazard detection insertion...")
    test_location = {"lat": 19.0760, "lng": 72.8777}
    test_timestamp = datetime.now()
    
    try:
        detection_id = await neon_db.insert_hazard_detection(
            location=test_location,
            hazard_type="pothole",
            timestamp=test_timestamp,
            detection_confidence=0.85,
            bounding_box=[100, 200, 300, 400],
            driver_lane=True,
            distance_meters=15.5,
            frame_number=123,
            video_path=None,
            source="postgis_test"
        )
        
        if detection_id:
            print(f"✅ Detection inserted with ID: {detection_id}")
        else:
            print("❌ Insertion returned None")
            return False
    except Exception as e:
        print(f"❌ Insertion failed: {str(e)}")
        return False
    
    # Test 3: Verify coordinate storage (PostGIS uses lng, lat order)
    print("\n[3] Verifying coordinate storage...")
    try:
        query = """
            SELECT 
                id,
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng,
                hazard_type,
                detection_confidence,
                bounding_box,
                driver_lane,
                distance_meters
            FROM hazard_detections
            WHERE id = $1
        """
        row = await neon_db.execute_fetchone(query, detection_id)
        
        if row:
            stored_lat = row.get('lat')
            stored_lng = row.get('lng')
            
            if abs(stored_lat - test_location['lat']) < 0.0001 and \
               abs(stored_lng - test_location['lng']) < 0.0001:
                print(f"✅ Coordinates stored correctly")
                print(f"   Expected: ({test_location['lat']}, {test_location['lng']})")
                print(f"   Stored: ({stored_lat}, {stored_lng})")
            else:
                print(f"❌ Coordinate mismatch")
                print(f"   Expected: ({test_location['lat']}, {test_location['lng']})")
                print(f"   Stored: ({stored_lat}, {stored_lng})")
                return False
            
            # Verify other fields
            if row['hazard_type'] == 'pothole' and \
               abs(row['detection_confidence'] - 0.85) < 0.01 and \
               row['driver_lane'] == True:
                print("✅ All fields stored correctly")
            else:
                print("❌ Field mismatch")
                print(f"   Row data: {row}")
                return False
        else:
            print("❌ Could not retrieve stored detection")
            return False
    except Exception as e:
        print(f"❌ Query failed: {str(e)}")
        return False
    
    # Test 4: Find nearby hazards
    print("\n[4] Testing spatial query (find nearby hazards)...")
    try:
        nearby = await neon_db.find_nearby_hazards(
            location=test_location,
            radius_meters=100.0,
            days_back=7
        )
        
        if isinstance(nearby, list):
            print(f"✅ Found {len(nearby)} nearby hazards")
            if len(nearby) > 0:
                print(f"   First result: {nearby[0].get('hazard_type', 'N/A')} at ({nearby[0].get('lat', 'N/A')}, {nearby[0].get('lng', 'N/A')})")
        else:
            print(f"❌ Invalid return type: {type(nearby)}")
            return False
    except Exception as e:
        print(f"❌ Spatial query failed: {str(e)}")
        return False
    
    # Test 5: Get all hazards
    print("\n[5] Testing get all hazards...")
    try:
        all_hazards = await neon_db.get_all_hazards(limit=10)
        if isinstance(all_hazards, list):
            print(f"✅ Retrieved {len(all_hazards)} hazards")
        else:
            print(f"❌ Invalid return type: {type(all_hazards)}")
            return False
    except Exception as e:
        print(f"❌ Get all hazards failed: {str(e)}")
        return False
    
    # Test 6: Test with NULL location (should still work)
    print("\n[6] Testing insertion without location...")
    try:
        detection_id_no_loc = await neon_db.insert_hazard_detection(
            location=None,
            hazard_type="speedbump",
            timestamp=datetime.now(),
            detection_confidence=0.75,
            bounding_box=None,
            driver_lane=False,
            distance_meters=None,
            frame_number=456,
            video_path=None,
            source="postgis_test"
        )
        
        if detection_id_no_loc:
            print(f"✅ Detection without location inserted with ID: {detection_id_no_loc}")
        else:
            print("❌ Insertion without location returned None")
            return False
    except Exception as e:
        print(f"❌ Insertion without location failed: {str(e)}")
        return False
    
    # Test 7: Verify PostGIS extension
    print("\n[7] Verifying PostGIS extension...")
    try:
        query = "SELECT PostGIS_version() as version"
        result = await neon_db.execute_fetchone(query)
        if result and result.get('version'):
            print(f"✅ PostGIS is enabled: {result['version']}")
        else:
            print("⚠️  PostGIS version query returned no result")
    except Exception as e:
        print(f"⚠️  PostGIS version check failed: {str(e)}")
    
    print("\n" + "="*70)
    print("✅ ALL POSTGIS TESTS PASSED")
    print("="*70)
    return True


if __name__ == "__main__":
    success = asyncio.run(test_postgis_storage())
    sys.exit(0 if success else 1)

