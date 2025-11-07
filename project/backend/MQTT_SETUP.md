# MQTT Setup Guide

This document explains how to set up and use MQTT in the Road Hazard Detection System.

## Overview

MQTT (Message Queuing Telemetry Transport) is integrated into the system to enable:
- **Real-time hazard detection publishing**: All detected hazards are published to MQTT topics
- **Hazard alerts**: Critical hazards trigger MQTT alerts
- **Hazard reports**: When hazards are reported to authorities, they're published via MQTT
- **Nearby hazard subscriptions**: Subscribe to receive alerts about hazards near your location
- **System status**: Publish system status updates

## MQTT Topics

The system uses the following MQTT topics:

### Published Topics

1. **`hazards/detections`** - All hazard detections
   - Published when hazards are detected in video frames
   - Includes: hazard type, location, confidence, driver lane status, distance

2. **`hazards/alerts`** - Critical hazard alerts
   - Published for hazards in driver's lane
   - Includes: hazard type, location, severity, message

3. **`hazards/reports`** - Hazard reports to authorities
   - Published when hazards are reported via the notification API
   - Includes: hazard type, location, report ID, map link

4. **`system/status`** - System status updates
   - Published on connection/disconnection
   - Includes: status (online/offline), timestamp, client ID

### Subscribed Topics

1. **`hazards/nearby/+`** - Nearby hazard alerts
   - Subscribe to receive alerts about hazards in your area
   - Supports wildcard matching for location-based routing

## Configuration

Add the following environment variables to your `.env` file:

```env
# MQTT Broker Configuration
MQTT_BROKER_HOST=localhost          # MQTT broker hostname or IP
MQTT_BROKER_PORT=1883               # MQTT broker port (default: 1883)
MQTT_USERNAME=your_username          # Optional: MQTT username
MQTT_PASSWORD=your_password          # Optional: MQTT password
MQTT_CLIENT_ID=hazard_detection_1    # Unique client ID (auto-generated if not set)
MQTT_KEEPALIVE=60                    # Keepalive interval in seconds
MQTT_QOS=1                           # Quality of Service (0, 1, or 2)
```

## Installing MQTT Broker

### Option 1: Mosquitto (Recommended for Development)

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install mosquitto mosquitto-clients
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

**macOS:**
```bash
brew install mosquitto
brew services start mosquitto
```

**Docker:**
```bash
docker run -it -p 1883:1883 -p 9001:9001 eclipse-mosquitto
```

### Option 2: HiveMQ (Cloud/Enterprise)

1. Sign up at https://www.hivemq.com/
2. Create a cluster
3. Get your broker URL and credentials
4. Update `.env` with your HiveMQ credentials

### Option 3: AWS IoT Core

1. Create an IoT Thing in AWS IoT Core
2. Download certificates
3. Configure MQTT endpoint and credentials

## Testing MQTT Connection

### Using mosquitto_sub (Command Line)

Subscribe to all hazard topics:
```bash
mosquitto_sub -h localhost -p 1883 -t "hazards/#" -v
```

Subscribe to specific topic:
```bash
mosquitto_sub -h localhost -p 1883 -t "hazards/detections" -v
```

### Using Python Script

```python
import paho.mqtt.client as mqtt

def on_connect(client, userdata, flags, rc):
    print(f"Connected with result code {rc}")
    client.subscribe("hazards/#")

def on_message(client, userdata, msg):
    print(f"{msg.topic}: {msg.payload.decode()}")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
client.connect("localhost", 1883, 60)
client.loop_forever()
```

## Message Format

### Hazard Detection Message

```json
{
  "type": "hazard_detection",
  "hazard_type": "pothole",
  "location": {
    "lat": 28.6139,
    "lng": 77.2090
  },
  "confidence": 0.85,
  "driver_lane": true,
  "distance_meters": 15.5,
  "bounding_box": [100, 200, 300, 400],
  "timestamp": "2025-01-15T10:30:00",
  "source": "hazard_detection_system"
}
```

### Hazard Alert Message

```json
{
  "type": "hazard_alert",
  "hazard_type": "pothole",
  "location": {
    "lat": 28.6139,
    "lng": 77.2090
  },
  "severity": "high",
  "message": "pothole detected in driver's lane",
  "timestamp": "2025-01-15T10:30:00",
  "source": "hazard_detection_system"
}
```

### Hazard Report Message

```json
{
  "type": "hazard_report",
  "hazard_type": "pothole",
  "location": {
    "lat": 28.6139,
    "lng": 77.2090
  },
  "report_id": 12345,
  "map_link": "https://www.google.com/maps/search/?api=1&query=28.6139,77.2090",
  "timestamp": "2025-01-15T10:30:00",
  "source": "hazard_detection_system"
}
```

## Integration Examples

### Subscribe to Nearby Hazards

```python
from mqtt_client import mqtt_client

def on_nearby_hazard(topic, data):
    print(f"Nearby hazard: {data['hazard_type']} at {data['location']}")

mqtt_client.subscribe_to_nearby_hazards(
    location={"lat": 28.6139, "lng": 77.2090},
    radius_km=1.0,
    callback=on_nearby_hazard
)
```

### Publish Custom Hazard Detection

```python
from mqtt_client import mqtt_client

mqtt_client.publish_hazard_detection(
    hazard_type="pothole",
    location={"lat": 28.6139, "lng": 77.2090},
    confidence=0.9,
    driver_lane=True,
    distance_meters=20.0
)
```

## API Endpoints

### Get MQTT Status

```bash
curl http://localhost:8000/api/mqtt/status
```

Response:
```json
{
  "connected": true,
  "broker_host": "localhost",
  "broker_port": 1883,
  "client_id": "hazard_detection_12345",
  "subscribed_topics": ["hazards/nearby/+"],
  "qos": 1
}
```

### Health Check (includes MQTT status)

```bash
curl http://localhost:8000/api/health
```

## Troubleshooting

### MQTT Not Connecting

1. **Check broker is running:**
   ```bash
   sudo systemctl status mosquitto
   ```

2. **Check firewall:**
   ```bash
   sudo ufw allow 1883/tcp
   ```

3. **Test connection:**
   ```bash
   mosquitto_pub -h localhost -p 1883 -t "test" -m "hello"
   mosquitto_sub -h localhost -p 1883 -t "test" -v
   ```

4. **Check logs:**
   ```bash
   tail -f /var/log/mosquitto/mosquitto.log
   ```

### Authentication Issues

If using username/password:
1. Create password file:
   ```bash
   mosquitto_passwd -c /etc/mosquitto/passwd username
   ```

2. Update mosquitto config:
   ```
   allow_anonymous false
   password_file /etc/mosquitto/passwd
   ```

### High Message Volume

For high-frequency detections:
- Use QoS 0 for non-critical messages
- Implement message throttling
- Use retained messages for last known state
- Consider message batching

## Security Considerations

1. **Use TLS/SSL** for production:
   ```env
   MQTT_BROKER_HOST=mqtts://your-broker.com
   MQTT_BROKER_PORT=8883
   ```

2. **Enable authentication** with username/password

3. **Use topic ACLs** to restrict access

4. **Implement rate limiting** to prevent abuse

5. **Use unique client IDs** to avoid conflicts

## Performance Tips

1. **QoS Levels:**
   - QoS 0: Fire and forget (fastest, no guarantee)
   - QoS 1: At least once (default, reliable)
   - QoS 2: Exactly once (slowest, most reliable)

2. **Keepalive:** Set appropriate keepalive interval (default: 60s)

3. **Message Size:** Keep messages small (< 1MB recommended)

4. **Connection Pooling:** MQTT client handles connection pooling automatically

## Next Steps

- Set up MQTT broker
- Configure environment variables
- Test connection using mosquitto clients
- Monitor MQTT messages during detection
- Integrate with external systems via MQTT

For more information, see the [paho-mqtt documentation](https://www.eclipse.org/paho/clients/python/).

