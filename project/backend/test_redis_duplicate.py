"""
Redis Duplicate Detection Test Script
Tests Redis connection and duplicate detection functionality
"""
import asyncio
import sys
from datetime import datetime
from hazard_hash import generate_time_bounded_hash
from redis_client import redis_client


async def test_redis_duplicate_detection():
    """Test Redis duplicate detection"""
    print("="*70)
    print("REDIS DUPLICATE DETECTION TEST")
    print("="*70)
    
    # Test 1: Check Redis connection
    print("\n[1] Checking Redis connection...")
    is_connected = redis_client.is_connected()
    
    if not is_connected:
        print("❌ Redis is not connected!")
        print("   Please check:")
        print("   - REDIS_URL is set in .env file")
        print("   - Redis server is running (or Redis Cloud is accessible)")
        return False
    
    print("✅ Redis is connected")
    
    # Get Redis stats
    stats = redis_client.get_stats()
    print(f"   Host: {stats.get('host', 'N/A')}")
    print(f"   Port: {stats.get('port', 'N/A')}")
    print(f"   DB: {stats.get('db', 'N/A')}")
    if stats.get('connected_clients'):
        print(f"   Connected clients: {stats.get('connected_clients')}")
    
    # Test 2: Store a test hash
    print("\n[2] Testing hash storage...")
    test_location = {"lat": 19.0760, "lng": 72.8777}
    test_hash = generate_time_bounded_hash(
        location=test_location,
        hazard_type="pothole",
        timestamp=datetime.now(),
        time_window_minutes=5
    )
    
    print(f"   Generated hash: {test_hash[:50]}...")
    
    stored = redis_client.store_hazard_key(test_hash, ttl=60)  # 1 minute for testing
    if stored:
        print("✅ Hash stored successfully")
    else:
        print("❌ Failed to store hash")
        return False
    
    # Test 3: Check for duplicate
    print("\n[3] Testing duplicate detection...")
    is_duplicate = redis_client.check_duplicate(test_hash)
    
    if is_duplicate:
        print("✅ Duplicate detection works - hash found in Redis")
    else:
        print("❌ Duplicate detection failed - hash not found")
        return False
    
    # Test 4: Check non-duplicate
    print("\n[4] Testing non-duplicate detection...")
    different_location = {"lat": 28.6139, "lng": 77.2090}
    different_hash = generate_time_bounded_hash(
        location=different_location,
        hazard_type="pothole",
        timestamp=datetime.now(),
        time_window_minutes=5
    )
    
    is_duplicate_new = redis_client.check_duplicate(different_hash)
    if not is_duplicate_new:
        print("✅ Non-duplicate correctly identified as new")
    else:
        print("❌ Non-duplicate incorrectly identified as duplicate")
        return False
    
    # Test 5: TTL verification (check if key exists after storage)
    print("\n[5] Verifying TTL...")
    ttl = redis_client.get_ttl(test_hash)
    if ttl > 0:
        print(f"✅ TTL verified: {ttl} seconds remaining")
    else:
        print(f"⚠️  TTL check returned: {ttl} (key may not exist or has no expiry)")
    
    # Test 6: Store same hash again (should be duplicate)
    print("\n[6] Testing duplicate suppression...")
    is_duplicate_again = redis_client.check_duplicate(test_hash)
    if is_duplicate_again:
        print("✅ Duplicate correctly suppressed (hash already exists)")
    else:
        print("❌ Duplicate not suppressed")
        return False
    
    print("\n" + "="*70)
    print("✅ ALL REDIS TESTS PASSED")
    print("="*70)
    return True


if __name__ == "__main__":
    success = asyncio.run(test_redis_duplicate_detection())
    sys.exit(0 if success else 1)

