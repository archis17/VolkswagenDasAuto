"""
MQTT Dummy Data Generator
Creates and publishes dummy hazard detection data to MQTT for testing purposes
"""
import asyncio
import sys
import json
import random
from datetime import datetime, timedelta
from typing import Dict, Any
from mqtt_client import mqtt_client
from config import MQTT_ENABLED

# Fix Windows asyncio compatibility
# On Windows, we need to use WindowsSelectorEventLoopPolicy for aiomqtt to work
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Sample hazard types
HAZARD_TYPES = ["pothole", "speedbump", "debris", "crack", "obstruction"]

# Sample locations (you can modify these to your area)
SAMPLE_LOCATIONS = [
    {"lat": 40.7128, "lng": -74.0060},  # New York City
    {"lat": 34.0522, "lng": -118.2437},  # Los Angeles
    {"lat": 41.8781, "lng": -87.6298},  # Chicago
    {"lat": 29.7604, "lng": -95.3698},  # Houston
    {"lat": 33.4484, "lng": -112.0740},  # Phoenix
    {"lat": 25.7617, "lng": -80.1918},  # Miami
    {"lat": 39.9526, "lng": -75.1652},  # Philadelphia
    {"lat": 32.7767, "lng": -96.7970},  # Dallas
    {"lat": 37.7749, "lng": -122.4194},  # San Francisco
    {"lat": 47.6062, "lng": -122.3321},  # Seattle
]

# Geofence zones for testing
GEOFENCE_ZONES = [
    {"zone_id": 1, "name": "Downtown Zone"},
    {"zone_id": 2, "name": "Highway Zone"},
    {"zone_id": 3, "name": "Residential Zone"},
]


async def generate_dummy_detection(detection_id: int) -> Dict[str, Any]:
    """Generate a single dummy hazard detection"""
    hazard_type = random.choice(HAZARD_TYPES)
    location = random.choice(SAMPLE_LOCATIONS)
    
    # Add slight random variation to location
    location = {
        "lat": location["lat"] + random.uniform(-0.01, 0.01),
        "lng": location["lng"] + random.uniform(-0.01, 0.01)
    }
    
    confidence = round(random.uniform(0.65, 0.99), 2)
    timestamp = datetime.now() - timedelta(minutes=random.randint(0, 60))
    
    return {
        "detection_id": detection_id,
        "hazard_type": hazard_type,
        "location": location,
        "confidence": confidence,
        "timestamp": timestamp
    }


async def publish_dummy_detections(count: int = 10, delay: float = 1.0):
    """
    Publish multiple dummy detections to MQTT
    
    Args:
        count: Number of detections to publish
        delay: Delay between publications in seconds
    """
    if not MQTT_ENABLED:
        print("❌ MQTT is not enabled in configuration.")
        print("   Please set MQTT_ENABLED=true in your .env file")
        return
    
    print(f"🚀 Starting MQTT dummy data test...")
    print(f"   Publishing {count} dummy detections")
    print(f"   Delay between publications: {delay}s\n")
    
    # Connect to MQTT broker
    print("📡 Connecting to MQTT broker...")
    print(f"   Host: {mqtt_client.broker_host}")
    print(f"   Port: {mqtt_client.broker_port}")
    
    try:
        await mqtt_client.connect()
    except Exception as e:
        print(f"   ⚠️  Connection error: {e}")
    
    if not mqtt_client.is_connected():
        print("❌ Failed to connect to MQTT broker")
        print("   Please check:")
        print("   1. MQTT broker is running and accessible")
        print("   2. Network/firewall allows connection to the broker")
        print("   3. MQTT credentials are correct in .env file")
        print("   4. For cloud brokers (HiveMQ, etc.), verify the hostname and port")
        return
    
    print("✅ Connected to MQTT broker\n")
    
    # Generate and publish detections
    successful = 0
    failed = 0
    
    for i in range(1, count + 1):
        try:
            detection = await generate_dummy_detection(i)
            
            print(f"[{i}/{count}] Publishing detection {i}...")
            print(f"   Type: {detection['hazard_type']}")
            print(f"   Location: ({detection['location']['lat']:.6f}, {detection['location']['lng']:.6f})")
            print(f"   Confidence: {detection['confidence']}")
            
            result = await mqtt_client.publish_detection(
                detection_id=detection['detection_id'],
                hazard_type=detection['hazard_type'],
                location=detection['location'],
                confidence=detection['confidence'],
                timestamp=detection['timestamp']
            )
            
            if result:
                successful += 1
                print(f"   ✅ Published successfully\n")
            else:
                failed += 1
                print(f"   ❌ Failed to publish\n")
            
            # Wait before next publication
            if i < count:
                await asyncio.sleep(delay)
                
        except Exception as e:
            failed += 1
            print(f"   ❌ Error: {e}\n")
    
    # Print summary
    print("=" * 50)
    print("📊 Publication Summary:")
    print(f"   ✅ Successful: {successful}")
    print(f"   ❌ Failed: {failed}")
    print(f"   📈 Success Rate: {(successful/count)*100:.1f}%")
    print("=" * 50)
    
    # Get MQTT stats
    stats = await mqtt_client.get_stats()
    print("\n📡 MQTT Statistics:")
    print(f"   Connected: {stats.get('connected', False)}")
    print(f"   Total Publishes: {stats.get('total_publishes', 0)}")
    print(f"   Successful: {stats.get('successful_publishes', 0)}")
    print(f"   Failed: {stats.get('failed_publishes', 0)}")


async def publish_geofence_broadcast_test():
    """Test geofence broadcast functionality"""
    if not MQTT_ENABLED:
        print("❌ MQTT is not enabled in configuration.")
        return
    
    print("🚀 Testing geofence broadcast...")
    
    await mqtt_client.connect()
    
    if not mqtt_client.is_connected():
        print("❌ Failed to connect to MQTT broker")
        return
    
    zone = random.choice(GEOFENCE_ZONES)
    location = random.choice(SAMPLE_LOCATIONS)
    
    payload_data = {
        "confidence": round(random.uniform(0.7, 0.95), 2),
        "driver_lane": random.choice([True, False]),
        "distance_meters": random.randint(10, 100)
    }
    
    print(f"📡 Broadcasting to zone {zone['zone_id']} ({zone['name']})...")
    
    result = await mqtt_client.publish_geofence_broadcast(
        zone_id=zone['zone_id'],
        detection_id=999,
        hazard_type="pothole",
        location=location,
        payload_data=payload_data
    )
    
    if result:
        print("✅ Geofence broadcast successful")
    else:
        print("❌ Geofence broadcast failed")


async def main():
    """Main function to run MQTT tests"""
    import sys
    
    # Parse command line arguments
    count = 10
    delay = 1.0
    test_type = "detections"
    
    if len(sys.argv) > 1:
        try:
            count = int(sys.argv[1])
        except ValueError:
            print("Invalid count argument, using default: 10")
    
    if len(sys.argv) > 2:
        try:
            delay = float(sys.argv[2])
        except ValueError:
            print("Invalid delay argument, using default: 1.0")
    
    if len(sys.argv) > 3:
        test_type = sys.argv[3].lower()
    
    print("=" * 50)
    print("🧪 MQTT Dummy Data Test Script")
    print("=" * 50)
    print()
    
    if test_type == "geofence":
        await publish_geofence_broadcast_test()
    else:
        await publish_dummy_detections(count=count, delay=delay)
    
    # Disconnect
    await mqtt_client.disconnect()
    print("\n👋 Disconnected from MQTT broker")


if __name__ == "__main__":
    asyncio.run(main())

