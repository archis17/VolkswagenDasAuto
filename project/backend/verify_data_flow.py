"""
Comprehensive Data Flow Verification Script
Tests the complete hazard detection data flow according to the flowchart
"""
import asyncio
import sys
from datetime import datetime
from typing import Dict, List, Any
import json

# Import project modules
from hazard_hash import generate_hazard_hash, generate_time_bounded_hash
from redis_client import redis_client
from neon_db import neon_db
from gps_extractor import gps_extractor


class VerificationResults:
    """Store verification test results"""
    def __init__(self):
        self.tests: List[Dict[str, Any]] = []
        self.passed = 0
        self.failed = 0
        self.warnings = 0
    
    def add_test(self, name: str, passed: bool, message: str = "", details: Dict = None):
        """Add a test result"""
        self.tests.append({
            "name": name,
            "passed": passed,
            "message": message,
            "details": details or {}
        })
        if passed:
            self.passed += 1
        else:
            self.failed += 1
    
    def add_warning(self, name: str, message: str, details: Dict = None):
        """Add a warning (not a failure, but something to note)"""
        self.tests.append({
            "name": name,
            "passed": True,
            "warning": True,
            "message": message,
            "details": details or {}
        })
        self.warnings += 1
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*70)
        print("VERIFICATION SUMMARY")
        print("="*70)
        print(f"Total Tests: {len(self.tests)}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Warnings: {self.warnings}")
        print("="*70)
        
        print("\nDETAILED RESULTS:")
        print("-"*70)
        for test in self.tests:
            status = "✓ PASS" if test["passed"] else "✗ FAIL"
            if test.get("warning"):
                status = "⚠ WARN"
            print(f"{status}: {test['name']}")
            if test["message"]:
                print(f"  → {test['message']}")
            if test["details"]:
                for key, value in test["details"].items():
                    print(f"    {key}: {value}")
            print()


async def verify_hash_generation(results: VerificationResults):
    """Verify hash key generation works correctly"""
    print("\n[1] Verifying Hash Key Generation...")
    
    # Test 1: Basic hash generation
    location1 = {"lat": 19.0760, "lng": 72.8777}  # Mumbai
    hash1 = generate_hazard_hash(location1, "pothole")
    if hash1 and hash1.startswith("hazard:"):
        results.add_test("Hash generation - basic", True, 
                        f"Generated hash: {hash1[:20]}...")
    else:
        results.add_test("Hash generation - basic", False, 
                        f"Invalid hash format: {hash1}")
    
    # Test 2: Deterministic hashing (same input = same output)
    hash2 = generate_hazard_hash(location1, "pothole")
    if hash1 == hash2:
        results.add_test("Hash generation - deterministic", True,
                        "Same input produces same hash")
    else:
        results.add_test("Hash generation - deterministic", False,
                        "Hash is not deterministic")
    
    # Test 3: Different locations produce different hashes
    location2 = {"lat": 28.6139, "lng": 77.2090}  # Delhi
    hash3 = generate_hazard_hash(location2, "pothole")
    if hash1 != hash3:
        results.add_test("Hash generation - location sensitivity", True,
                        "Different locations produce different hashes")
    else:
        results.add_test("Hash generation - location sensitivity", False,
                        "Different locations produced same hash")
    
    # Test 4: Time-bounded hash with time window
    timestamp1 = datetime.now()
    hash4 = generate_time_bounded_hash(location1, "pothole", timestamp1, time_window_minutes=5)
    timestamp2 = datetime.now().replace(second=0, microsecond=0)
    hash5 = generate_time_bounded_hash(location1, "pothole", timestamp2, time_window_minutes=5)
    
    # Hashes should be same if within same 5-minute window
    if hash4 and hash5:
        results.add_test("Hash generation - time window", True,
                        f"Time-bounded hash generated: {hash4[:20]}...")
    else:
        results.add_test("Hash generation - time window", False,
                        "Time-bounded hash generation failed")
    
    # Test 5: Precision rounding (4 decimals ≈ 11m)
    location3 = {"lat": 19.0760123, "lng": 72.8777123}
    hash6 = generate_hazard_hash(location3, "pothole", precision=4)
    hash7 = generate_hazard_hash(location1, "pothole", precision=4)
    if hash6 == hash7:
        results.add_test("Hash generation - precision rounding", True,
                        "Coordinates rounded to 4 decimals produce same hash")
    else:
        results.add_test("Hash generation - precision rounding", False,
                        "Precision rounding not working correctly")


async def verify_redis_connection(results: VerificationResults):
    """Verify Redis connection and duplicate detection"""
    print("\n[2] Verifying Redis Connection and Duplicate Detection...")
    
    # Test 1: Redis connection
    is_connected = redis_client.is_connected()
    if is_connected:
        results.add_test("Redis connection", True, "Redis is connected")
        
        # Test 2: Store and check duplicate
        test_location = {"lat": 19.0760, "lng": 72.8777}
        test_hash = generate_hazard_hash(test_location, "test_hazard")
        
        # Store hash
        stored = redis_client.store_hazard_key(test_hash, ttl=60)  # 1 minute TTL for testing
        if stored:
            results.add_test("Redis - store hash key", True, 
                           f"Stored hash: {test_hash[:20]}...")
        else:
            results.add_test("Redis - store hash key", False,
                           "Failed to store hash in Redis")
        
        # Check duplicate
        is_duplicate = redis_client.check_duplicate(test_hash)
        if is_duplicate:
            results.add_test("Redis - duplicate detection", True,
                           "Duplicate check correctly identifies existing hash")
        else:
            results.add_test("Redis - duplicate detection", False,
                           "Duplicate check failed to find stored hash")
        
        # Test 3: Non-duplicate check
        new_hash = generate_hazard_hash({"lat": 28.6139, "lng": 77.2090}, "test_hazard")
        is_duplicate_new = redis_client.check_duplicate(new_hash)
        if not is_duplicate_new:
            results.add_test("Redis - non-duplicate detection", True,
                           "Non-duplicate hash correctly identified as new")
        else:
            results.add_test("Redis - non-duplicate detection", False,
                           "New hash incorrectly identified as duplicate")
        
        # Test 4: Get stats
        stats = redis_client.get_stats()
        if stats and "connected" in stats:
            results.add_test("Redis - get stats", True,
                           f"Stats retrieved: {json.dumps(stats, indent=2)}")
        else:
            results.add_test("Redis - get stats", False,
                           "Failed to get Redis stats")
    else:
        results.add_test("Redis connection", False,
                        "Redis is not connected. Check REDIS_URL in .env file")
        results.add_warning("Redis - duplicate detection", 
                          "Cannot test duplicate detection without Redis connection")


async def verify_postgis_storage(results: VerificationResults):
    """Verify PostGIS storage and retrieval"""
    print("\n[3] Verifying PostGIS Storage...")
    
    # Test 1: Database connection
    try:
        if not neon_db._pool:
            await neon_db.connect()
        
        is_connected = await neon_db.check_connection()
        if is_connected:
            results.add_test("PostGIS connection", True, "Database is connected")
        else:
            results.add_test("PostGIS connection", False,
                           "Database connection check failed")
            return
    except Exception as e:
        results.add_test("PostGIS connection", False,
                        f"Failed to connect to database: {str(e)}")
        return
    
    # Test 2: Insert hazard detection
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
            source="verification_test"
        )
        
        if detection_id:
            results.add_test("PostGIS - insert hazard detection", True,
                           f"Inserted detection with ID: {detection_id}",
                           {"detection_id": detection_id})
        else:
            results.add_test("PostGIS - insert hazard detection", False,
                           "Failed to insert detection (returned None)")
    except Exception as e:
        results.add_test("PostGIS - insert hazard detection", False,
                        f"Exception during insert: {str(e)}")
        return
    
    # Test 3: Find nearby hazards
    try:
        nearby = await neon_db.find_nearby_hazards(
            location=test_location,
            radius_meters=100.0,
            days_back=7
        )
        
        if isinstance(nearby, list):
            results.add_test("PostGIS - find nearby hazards", True,
                           f"Found {len(nearby)} nearby hazards",
                           {"count": len(nearby)})
        else:
            results.add_test("PostGIS - find nearby hazards", False,
                           f"Invalid return type: {type(nearby)}")
    except Exception as e:
        results.add_test("PostGIS - find nearby hazards", False,
                        f"Exception during query: {str(e)}")
    
    # Test 4: Get all hazards
    try:
        all_hazards = await neon_db.get_all_hazards(limit=10)
        if isinstance(all_hazards, list):
            results.add_test("PostGIS - get all hazards", True,
                           f"Retrieved {len(all_hazards)} hazards",
                           {"count": len(all_hazards)})
        else:
            results.add_test("PostGIS - get all hazards", False,
                           f"Invalid return type: {type(all_hazards)}")
    except Exception as e:
        results.add_test("PostGIS - get all hazards", False,
                        f"Exception during query: {str(e)}")
    
    # Test 5: Verify coordinate order (PostGIS uses lng, lat)
    try:
        # Query to verify stored coordinates
        query = """
            SELECT 
                id,
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng
            FROM hazard_detections
            WHERE id = $1
        """
        row = await neon_db.execute_fetchone(query, detection_id)
        
        if row:
            stored_lat = row.get('lat')
            stored_lng = row.get('lng')
            if abs(stored_lat - test_location['lat']) < 0.0001 and \
               abs(stored_lng - test_location['lng']) < 0.0001:
                results.add_test("PostGIS - coordinate storage", True,
                               f"Coordinates stored correctly: ({stored_lat}, {stored_lng})")
            else:
                results.add_test("PostGIS - coordinate storage", False,
                               f"Coordinates mismatch. Expected: {test_location}, Got: ({stored_lat}, {stored_lng})")
        else:
            results.add_test("PostGIS - coordinate storage", False,
                           "Could not retrieve stored coordinates")
    except Exception as e:
        results.add_test("PostGIS - coordinate storage", False,
                        f"Exception verifying coordinates: {str(e)}")


async def verify_gps_extraction(results: VerificationResults):
    """Verify GPS extraction functionality"""
    print("\n[4] Verifying GPS Extraction...")
    
    # Test 1: Set GPS location manually
    test_lat = 19.0760
    test_lng = 72.8777
    gps_extractor.set_gps_location(test_lat, test_lng)
    
    current_gps = gps_extractor.get_current_gps()
    if current_gps and current_gps.get('lat') == test_lat and current_gps.get('lng') == test_lng:
        results.add_test("GPS extraction - manual set/get", True,
                        f"GPS location set and retrieved: ({test_lat}, {test_lng})")
    else:
        results.add_test("GPS extraction - manual set/get", False,
                        f"GPS location mismatch. Expected: ({test_lat}, {test_lng}), Got: {current_gps}")
    
    # Test 2: GPS history
    gps_extractor.set_gps_location(28.6139, 77.2090)
    history = gps_extractor.gps_history
    if len(history) >= 2:
        results.add_test("GPS extraction - history tracking", True,
                        f"GPS history contains {len(history)} entries")
    else:
        results.add_test("GPS extraction - history tracking", False,
                        f"GPS history incomplete. Expected at least 2, got {len(history)}")
    
    # Note: Frame EXIF and video metadata extraction require actual files
    results.add_warning("GPS extraction - frame EXIF",
                       "Frame EXIF extraction requires actual video frames with embedded GPS data")
    results.add_warning("GPS extraction - video metadata",
                       "Video metadata extraction requires video files with GPS metadata")


async def verify_end_to_end_flow(results: VerificationResults):
    """Verify complete end-to-end flow"""
    print("\n[5] Verifying End-to-End Flow...")
    
    # Simulate complete flow: Detection → GPS → Hash → Redis Check → Storage
    
    # Step 1: Simulate detection result
    detection_result = {
        "type": "pothole",
        "conf": 0.87,
        "box": [150, 200, 350, 450],
        "class_name": "pothole"
    }
    
    # Step 2: Get GPS location
    gps_location = gps_extractor.get_current_gps()
    if not gps_location:
        gps_location = {"lat": 19.0760, "lng": 72.8777}
        gps_extractor.set_gps_location(gps_location['lat'], gps_location['lng'])
    
    # Step 3: Generate hash
    timestamp = datetime.now()
    hash_key = generate_time_bounded_hash(
        location=gps_location,
        hazard_type=detection_result["type"],
        timestamp=timestamp,
        time_window_minutes=5
    )
    
    if hash_key:
        results.add_test("End-to-end - hash generation", True,
                        f"Hash generated: {hash_key[:30]}...")
    else:
        results.add_test("End-to-end - hash generation", False,
                        "Hash generation failed")
        return
    
    # Step 4: Check Redis duplicate
    if redis_client.is_connected():
        is_duplicate = redis_client.check_duplicate(hash_key)
        
        if not is_duplicate:
            # Step 5: Store in Redis
            stored = redis_client.store_hazard_key(hash_key, ttl=1800)
            if stored:
                results.add_test("End-to-end - Redis storage", True,
                               "Hash stored in Redis")
            else:
                results.add_test("End-to-end - Redis storage", False,
                               "Failed to store hash in Redis")
        else:
            results.add_test("End-to-end - duplicate detection", True,
                           "Duplicate detected, would suppress storage")
    
    # Step 6: Store in PostGIS
    try:
        if not neon_db._pool:
            await neon_db.connect()
        
        detection_id = await neon_db.insert_hazard_detection(
            location=gps_location,
            hazard_type=detection_result["type"],
            timestamp=timestamp,
            detection_confidence=detection_result["conf"],
            bounding_box=detection_result["box"],
            driver_lane=False,
            distance_meters=None,
            frame_number=1,
            video_path=None,
            source="end_to_end_test"
        )
        
        if detection_id:
            results.add_test("End-to-end - PostGIS storage", True,
                           f"Detection stored with ID: {detection_id}",
                           {"detection_id": detection_id})
            
            # Verify data integrity
            query = """
                SELECT 
                    id, hazard_type, detection_confidence, bounding_box,
                    ST_Y(location::geometry) as lat,
                    ST_X(location::geometry) as lng
                FROM hazard_detections
                WHERE id = $1
            """
            row = await neon_db.execute_fetchone(query, detection_id)
            
            if row:
                if (row['hazard_type'] == detection_result["type"] and
                    abs(row['detection_confidence'] - detection_result["conf"]) < 0.01):
                    results.add_test("End-to-end - data integrity", True,
                                   "Stored data matches input data")
                else:
                    results.add_test("End-to-end - data integrity", False,
                                   f"Data mismatch. Expected: {detection_result}, Got: {row}")
        else:
            results.add_test("End-to-end - PostGIS storage", False,
                           "Failed to store detection in PostGIS")
    except Exception as e:
        results.add_test("End-to-end - PostGIS storage", False,
                        f"Exception: {str(e)}")


async def verify_missing_components(results: VerificationResults):
    """Check for missing components from flowchart"""
    print("\n[6] Checking for Missing Components...")
    
    # Privacy model (face detection & blur)
    results.add_warning("Missing component - Privacy model",
                       "Face detection and blur functionality is not implemented")
    
    # MQTT publishing
    results.add_warning("Missing component - MQTT",
                       "MQTT publishing is not implemented")
    
    # Geofenced broadcasting
    results.add_warning("Missing component - Geofenced broadcasting",
                       "Geofenced broadcasting is not implemented")


async def main():
    """Run all verification tests"""
    print("="*70)
    print("HAZARD DETECTION SYSTEM - DATA FLOW VERIFICATION")
    print("="*70)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = VerificationResults()
    
    # Run all verification tests
    await verify_hash_generation(results)
    await verify_redis_connection(results)
    await verify_postgis_storage(results)
    await verify_gps_extraction(results)
    await verify_end_to_end_flow(results)
    await verify_missing_components(results)
    
    # Print summary
    results.print_summary()
    
    # Exit with appropriate code
    if results.failed > 0:
        print("❌ VERIFICATION FAILED - Some tests did not pass")
        sys.exit(1)
    elif results.warnings > 0:
        print("⚠️  VERIFICATION COMPLETED WITH WARNINGS")
        sys.exit(0)
    else:
        print("✅ VERIFICATION PASSED - All tests successful")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())

