# Redis Setup and Configuration Documentation

## Overview

Redis is integrated into the Hazard Detection and Reporting System to provide fast duplicate detection for hazard events. This prevents redundant processing, storage, and notifications when the same hazard is detected multiple times within a short time window.

## Architecture

According to the system flowchart, Redis is used at the following point in the hazard detection pipeline:

1. **Video Frame Capture** → YOLOv8 Hazard Detection
2. **Hazard Detected?** → Yes → Privacy Model → Apply Blur → Extract GPS → **Generate Hash Key**
3. **Check Redis Duplicate?**
   - **Yes (Duplicate Found)**: Suppress event (do not store or notify)
   - **No (Unique Event)**: Store in PostGIS → Query Vehicles → Publish to MQTT

## Features

- **Fast Duplicate Detection**: O(1) lookup time for checking if a hazard has already been processed
- **Automatic Expiration**: Hash keys expire after 30 minutes (configurable)
- **Time-Windowed Deduplication**: Hazards within a 5-minute window at the same location are considered duplicates
- **Location-Based Hashing**: Uses GPS coordinates rounded to 4 decimal places (~11 meters accuracy)
- **Graceful Degradation**: System continues to work even if Redis is unavailable

## Installation

### 1. Install Redis Server

**Windows:**
```powershell
# Using Chocolatey
choco install redis-64

# Or download from: https://github.com/microsoftarchive/redis/releases
```

**Linux:**
```bash
sudo apt-get update
sudo apt-get install redis-server
```

**macOS:**
```bash
brew install redis
```

### 2. Start Redis Server

**Windows:**
```powershell
redis-server
```

**Linux/macOS:**
```bash
redis-server
```

Or as a service:
```bash
sudo systemctl start redis
sudo systemctl enable redis  # Enable on boot
```

### 3. Install Python Dependencies

```bash
cd project/backend
pip install -r requirements.txt
```

This will install:
- `redis>=5.0.0` - Redis Python client
- `hiredis>=2.2.0` - Fast Redis protocol parser

## Configuration

### Environment Variables

Create or update your `.env` file in `project/backend/`:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=          # Optional, leave empty if no password
REDIS_URL=               # Optional, full Redis URL (overrides host/port)
HAZARD_KEY_TTL=1800      # Time to live in seconds (default: 1800 = 30 minutes)
```

### Using Redis URL

You can also use a Redis URL for connection:

```env
REDIS_URL=redis://localhost:6379/0
REDIS_URL=rediss://user:password@host:6380/0  # SSL connection
```

## Usage

### Basic Operations

The Redis client is automatically initialized when imported:

```python
from redis_client import redis_client
from hazard_hash import generate_time_bounded_hash

# Check if Redis is connected
if redis_client.is_connected():
    print("Redis is connected")

# Generate a hash key for a hazard
location = {"lat": 28.6139, "lng": 77.2090}
hazard_type = "pothole"
timestamp = datetime.now()

hash_key = generate_time_bounded_hash(
    location=location,
    hazard_type=hazard_type,
    timestamp=timestamp,
    time_window_minutes=5
)

# Check if duplicate exists
if redis_client.check_duplicate(hash_key):
    print("Duplicate hazard detected")
else:
    # Store the hash key
    redis_client.store_hazard_key(hash_key, ttl=1800)
    print("New hazard, storing in Redis")
```

### Hash Key Generation

The system uses three hash generation methods:

#### 1. Time-Bounded Hash (Recommended)
```python
from hazard_hash import generate_time_bounded_hash

hash_key = generate_time_bounded_hash(
    location={"lat": 28.6139, "lng": 77.2090},
    hazard_type="pothole",
    timestamp=datetime.now(),
    time_window_minutes=5,  # 5-minute window
    precision=4  # 4 decimal places ≈ 11 meters
)
```

#### 2. Simple Hash (Location + Type Only)
```python
from hazard_hash import generate_simple_hash

hash_key = generate_simple_hash(
    location={"lat": 28.6139, "lng": 77.2090},
    hazard_type="pothole",
    precision=4
)
```

#### 3. Full Hash (With Bounding Box)
```python
from hazard_hash import generate_hazard_hash

hash_key = generate_hazard_hash(
    location={"lat": 28.6139, "lng": 77.2090},
    hazard_type="pothole",
    timestamp=datetime.now(),
    bounding_box=[100, 200, 300, 400],  # [x1, y1, x2, y2]
    precision=4
)
```

### Integration Points

#### 1. Notification Service

The `notification_service.py` automatically checks Redis before storing hazards:

```python
# In notification_service.py
hash_key = generate_time_bounded_hash(...)

if redis_client.check_duplicate(hash_key):
    return {"success": False, "message": "Duplicate detected"}
    
redis_client.store_hazard_key(hash_key, ttl=1800)
# Continue with storage...
```

#### 2. WebSocket Server (Future Integration)

For real-time duplicate checking during frame processing:

```python
# In websocket_server.py (when GPS data is available)
if hazard_detected:
    hash_key = generate_time_bounded_hash(
        location=current_location,
        hazard_type=hazard_type,
        timestamp=datetime.now()
    )
    
    if not redis_client.check_duplicate(hash_key):
        redis_client.store_hazard_key(hash_key)
        # Process and notify about new hazard
```

## API Endpoints

### Check Redis Status

```bash
GET /api/redis/status
```

Response:
```json
{
  "connected": true,
  "host": "localhost",
  "port": 6379,
  "db": 0,
  "used_memory": "2.5M",
  "connected_clients": 1,
  "total_keys": 42
}
```

### Health Check

```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "redis": true,
  "mode": "live",
  "camera_available": true,
  "video_active": false
}
```

## Hash Key Structure

Hash keys are prefixed with `hazard:` for organization:

```
hazard:abc123def456...
```

The hash is generated from:
- **Location**: GPS coordinates rounded to specified precision
- **Type**: Hazard type (normalized to lowercase)
- **Time Window**: Timestamp rounded to nearest time window (optional)
- **Bounding Box**: Normalized bounding box coordinates (optional)

Example hash data:
```json
{
  "location": {"lat": 28.6139, "lng": 77.2090},
  "type": "pothole",
  "time_window": "2024-01-15T14:30:00"
}
```

## Performance Considerations

### TTL (Time To Live)

- **Default**: 30 minutes (1800 seconds)
- **Purpose**: Automatically expire old hazard keys
- **Configurable**: Set `HAZARD_KEY_TTL` in `.env`

### Location Precision

- **4 decimal places**: ~11 meters accuracy (default)
- **3 decimal places**: ~111 meters accuracy
- **5 decimal places**: ~1.1 meters accuracy

Choose precision based on:
- Required accuracy for duplicate detection
- Expected hazard density in your area
- Storage/performance trade-offs

### Time Window

- **5 minutes**: Default window for considering duplicates
- **Shorter windows**: More sensitive to duplicates
- **Longer windows**: More tolerant of repeated detections

## Monitoring and Maintenance

### Check Redis Connection

```python
from redis_client import redis_client

if redis_client.is_connected():
    stats = redis_client.get_stats()
    print(f"Redis connected: {stats}")
```

### View Stored Keys

Using Redis CLI:
```bash
redis-cli
> KEYS hazard:*
> TTL hazard:abc123...
```

### Clear All Hazard Keys (Use with Caution!)

```python
from redis_client import redis_client

redis_client.flush_all()  # Clears entire database
```

### Monitor Memory Usage

```bash
redis-cli INFO memory
```

## Troubleshooting

### Connection Issues

**Problem**: Redis not connecting
```
Error: Redis connection error: Error connecting to Redis
```

**Solution**:
1. Verify Redis server is running: `redis-cli ping` (should return `PONG`)
2. Check host/port in `.env`
3. Check firewall settings
4. Verify Redis password if configured

### Performance Issues

**Problem**: Slow duplicate checks
- **Solution**: Use `hiredis` parser (already included)
- **Solution**: Consider Redis cluster for high-scale deployments
- **Solution**: Monitor memory usage and adjust TTL

### Memory Issues

**Problem**: Redis running out of memory
- **Solution**: Reduce `HAZARD_KEY_TTL` to expire keys faster
- **Solution**: Increase location precision (fewer unique keys)
- **Solution**: Implement key eviction policy in Redis config

### Graceful Degradation

The system is designed to work even if Redis is unavailable:
- Duplicate checks return `False` if Redis is disconnected
- System falls back to MongoDB duplicate checking
- No errors are raised, only warnings logged

## Best Practices

1. **Always Check Redis First**: Fast O(1) lookup before database queries
2. **Use Appropriate TTL**: Balance between memory usage and deduplication window
3. **Monitor Connection**: Check Redis status regularly
4. **Handle Failures Gracefully**: System should continue working if Redis is down
5. **Use Time Windows**: Consider hazards within time windows as duplicates
6. **Log Operations**: Monitor Redis operations for debugging

## Security Considerations

1. **Password Protection**: Set `REDIS_PASSWORD` in production
2. **Network Security**: Don't expose Redis to public internet
3. **SSL/TLS**: Use `rediss://` URL scheme for encrypted connections
4. **Firewall Rules**: Restrict access to Redis port (6379)

## Production Deployment

### Redis Configuration (`redis.conf`)

```conf
# Memory management
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence (optional)
save 900 1
save 300 10
save 60 10000

# Security
requirepass your_secure_password_here

# Network
bind 127.0.0.1
protected-mode yes
```

### Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    environment:
      - REDIS_PASSWORD=your_password

volumes:
  redis-data:
```

## Testing

### Test Redis Connection

```python
from redis_client import redis_client

# Test connection
assert redis_client.is_connected(), "Redis not connected"

# Test duplicate check
hash_key = "test:hazard:123"
redis_client.store_hazard_key(hash_key, ttl=60)
assert redis_client.check_duplicate(hash_key), "Should find duplicate"
assert not redis_client.check_duplicate("test:hazard:456"), "Should not find duplicate"
```

### Integration Test

```python
from hazard_hash import generate_time_bounded_hash
from redis_client import redis_client
from datetime import datetime

location = {"lat": 28.6139, "lng": 77.2090}
hash1 = generate_time_bounded_hash(location, "pothole", datetime.now())
hash2 = generate_time_bounded_hash(location, "pothole", datetime.now())

# Should be duplicates (same location, same time window)
assert hash1 == hash2

redis_client.store_hazard_key(hash1)
assert redis_client.check_duplicate(hash2)
```

## Additional Resources

- [Redis Documentation](https://redis.io/docs/)
- [Python Redis Client](https://redis-py.readthedocs.io/)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)

## Support

For issues or questions:
1. Check Redis logs: `redis-cli MONITOR`
2. Check application logs for Redis errors
3. Verify Redis connection: `redis-cli ping`
4. Review this documentation

