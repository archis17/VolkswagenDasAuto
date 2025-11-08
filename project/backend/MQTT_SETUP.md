# MQTT Setup Guide

## Current Status

MQTT is **disabled by default**. The warning message indicates MQTT is not enabled in your environment.

## Quick Setup

### Option 1: Enable MQTT (Recommended for Production)

1. **Add to your `.env` file** in `project/backend/`:

```env
# MQTT Configuration
MQTT_ENABLED=true
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_CLIENT_ID=hazard-eye-backend

# Optional: If your MQTT broker requires authentication
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
```

2. **Restart your backend server**

### Option 2: Use a Cloud MQTT Broker

Popular options:
- **Eclipse Mosquitto** (Free, self-hosted): `mosquitto.org`
- **HiveMQ Cloud** (Free tier available): `hivemq.com`
- **AWS IoT Core** (Pay-as-you-go)
- **Azure IoT Hub** (Pay-as-you-go)
- **Google Cloud IoT Core** (Deprecated, use alternatives)

Example for HiveMQ Cloud:
```env
MQTT_ENABLED=true
MQTT_BROKER_HOST=your-broker.hivemq.cloud
MQTT_BROKER_PORT=8883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
MQTT_CLIENT_ID=hazard-eye-backend
```

### Option 3: Local MQTT Broker (For Testing)

Install Mosquitto locally:

**Windows:**
```bash
# Download from: https://mosquitto.org/download/
# Or use Chocolatey:
choco install mosquitto
```

**Linux/Mac:**
```bash
# Ubuntu/Debian
sudo apt-get install mosquitto mosquitto-clients

# Mac
brew install mosquitto
```

Then start the broker:
```bash
mosquitto -v
```

## MQTT Topics

When enabled, the system publishes to these topics:

- **Detections**: `hazard-eye/detections/{hazard_type}/{lat}/{lng}`
- **Geofence Broadcasts**: `hazard-eye/geofence/{zone_id}/hazards`
- **Device Subscriptions**: `hazard-eye/devices/{device_id}/hazards`

## Testing MQTT Connection

1. **Check status via API:**
   ```bash
   curl http://localhost:8000/api/mqtt/status
   ```

2. **Subscribe to topics** (using mosquitto client):
   ```bash
   mosquitto_sub -h localhost -p 1883 -t "hazard-eye/+/+"
   ```

## Current Behavior

- **MQTT Disabled (Default)**: 
  - Detections are still stored in database
  - Geofence broadcasting is skipped
  - No MQTT publishing occurs
  - System works normally without MQTT

- **MQTT Enabled**:
  - All detections are published to MQTT
  - Geofence broadcasts are sent via MQTT
  - MQTT publish logs are stored in database
  - Enables IoT device integration

## Troubleshooting

### Connection Failed
- Check if MQTT broker is running
- Verify host and port are correct
- Check firewall settings
- For cloud brokers, verify credentials

### Authentication Errors
- Ensure `MQTT_USERNAME` and `MQTT_PASSWORD` are set correctly
- Some brokers require TLS (port 8883) instead of plain (1883)

### No Messages Published
- Check `/api/mqtt/status` endpoint
- Verify detections are being stored (check database)
- Check MQTT publish log table: `mqtt_publish_log`

