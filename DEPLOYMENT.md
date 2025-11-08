# Deployment Guide

This guide covers deploying the Volkswagen Das Auto backend to free hosting platforms, with a focus on **Render.com** (recommended).

## Platform Recommendation: Render.com

**Why Render.com?**
- ✅ Free tier supports FastAPI + WebSockets
- ✅ Automatic HTTPS
- ✅ Environment variable management
- ✅ No credit card required
- ✅ Supports Python 3.13
- ✅ WebSocket support out of the box

**Alternative Platforms:**
- **Railway.app** - Similar features, also supports WebSockets
- **Fly.io** - Good for global distribution
- **Heroku** - Requires credit card for free tier (not recommended)

## Prerequisites

1. **Neon Database Account** (Free tier available)
   - Sign up at https://neon.tech
   - Create a new project
   - Copy your connection string (PostgreSQL URL)

2. **GitHub Repository**
   - Push your code to GitHub
   - Ensure model files (`yolov12.pt`, `yolov8n.pt`) are committed

3. **Optional Services** (can be added later):
   - Redis (for duplicate detection) - Free tier available on Redis Cloud
   - MQTT Broker (for IoT) - Free tier available on HiveMQ Cloud

## Step-by-Step Deployment on Render.com

### 1. Create Render Account
- Go to https://render.com
- Sign up with GitHub (recommended)

### 2. Create New Web Service
- Click "New +" → "Web Service"
- Connect your GitHub repository
- Select the repository containing this project

### 3. Configure Service Settings

**Basic Settings:**
- **Name**: `volksw-backend` (or your preferred name)
- **Region**: Choose closest to your users (e.g., `Oregon`)
- **Branch**: `main` (or your deployment branch)
- **Root Directory**: Leave empty (or set to `project/backend` if deploying only backend)

**Build & Deploy:**
- **Environment**: `Python 3`
- **Build Command**: 
  ```bash
  cd project/backend && pip install -r requirements.txt
  ```
- **Start Command**: 
  ```bash
  cd project/backend && python main.py
  ```

**OR use the `render.yaml` file:**
- If you have `render.yaml` in your repo root, Render will auto-detect it
- You can skip manual configuration

### 4. Configure Environment Variables

In Render dashboard, go to **Environment** tab and add:

**Required:**
```
NEON_DATABASE_URL=postgresql://user:password@hostname/database?sslmode=require
```

**Optional (with defaults):**
```
HOST=0.0.0.0
PORT=10000
```

**Optional Services:**
```
# Redis (for duplicate detection)
REDIS_URL=redis://:password@hostname:port/db
# OR
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# MQTT (for IoT integration)
MQTT_ENABLED=false
MQTT_BROKER_HOST=your-broker.hivemq.cloud
MQTT_BROKER_PORT=8883
MQTT_USERNAME=your-username
MQTT_PASSWORD=your-password
MQTT_CLIENT_ID=hazard-eye-backend

# Geofence
GEOFENCE_DEFAULT_RADIUS=5000
```

### 5. Deploy

- Click "Create Web Service"
- Render will:
  1. Clone your repository
  2. Install dependencies
  3. Start your application
  4. Provide a URL (e.g., `https://volksw-backend.onrender.com`)

### 6. Verify Deployment

1. **Health Check**: Visit `https://your-app.onrender.com/health`
   - Should return: `{"status": "ok"}`

2. **API Docs**: Visit `https://your-app.onrender.com/docs`
   - Should show FastAPI Swagger UI

3. **WebSocket Test**: Use a WebSocket client to connect to:
   - `wss://your-app.onrender.com/ws`
   - Should accept connection

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEON_DATABASE_URL` | PostgreSQL connection string from Neon | `postgresql://user:pass@host/db?sslmode=require` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server host (usually set by platform) |
| `PORT` | `8000` | Server port (usually set by platform) |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_URL` | - | Redis connection URL (overrides host/port) |
| `REDIS_PASSWORD` | - | Redis password |
| `REDIS_DB` | `0` | Redis database number |
| `HAZARD_KEY_TTL` | `1800` | TTL for hazard keys (seconds) |
| `MQTT_ENABLED` | `false` | Enable MQTT features |
| `MQTT_BROKER_HOST` | `localhost` | MQTT broker hostname |
| `MQTT_BROKER_PORT` | `1883` | MQTT broker port |
| `MQTT_USERNAME` | - | MQTT username |
| `MQTT_PASSWORD` | - | MQTT password |
| `MQTT_CLIENT_ID` | `hazard-eye-backend` | MQTT client ID |
| `GEOFENCE_DEFAULT_RADIUS` | `5000` | Default geofence radius (meters) |

## Deployment Limitations & Considerations

### ⚠️ Important Limitations

1. **Ephemeral File Storage**
   - Uploaded video files are stored in `uploads/` directory
   - **Files are lost when the service restarts** (free tier limitation)
   - **Solution**: For production, use cloud storage (S3, Cloudinary, etc.)
   - **Workaround**: Process videos immediately and delete after processing

2. **No Camera Access**
   - Cloud platforms don't have access to physical cameras
   - **Live camera mode will not work** on deployed instances
   - **Video upload mode works perfectly** - users can upload videos for processing

3. **Model Loading Time**
   - YOLO models (`yolov12.pt`, `yolov8n.pt`) are ~11MB total
   - First request may be slow while models load
   - Models are cached in memory after first load

4. **Free Tier Limitations**
   - **Render.com**: Service spins down after 15 minutes of inactivity
   - First request after spin-down takes ~30-60 seconds (cold start)
   - **Solution**: Use a monitoring service to ping `/health` every 10 minutes

5. **Resource Limits**
   - Free tier has limited CPU/RAM
   - Heavy ML inference may be slower than local
   - Consider upgrading for production use

### ✅ What Works Perfectly

- ✅ FastAPI REST API endpoints
- ✅ WebSocket connections (`/ws`)
- ✅ Database operations (Neon PostgreSQL)
- ✅ Video file upload and processing
- ✅ Real-time hazard detection
- ✅ Analytics endpoints
- ✅ Health checks

### 🔧 Optional Services

These services are **optional** and the system works without them:

- **Redis**: Used for duplicate detection. Falls back to database if unavailable.
- **MQTT**: Used for IoT integration. System works without it.
- **Email**: Used for notifications. System works without it.

## Troubleshooting

### Service Won't Start

1. **Check Logs**: In Render dashboard, check "Logs" tab
2. **Common Issues**:
   - Missing `NEON_DATABASE_URL` → Add environment variable
   - Port conflict → Render sets PORT automatically, don't override
   - Model files missing → Ensure `yolov12.pt` and `yolov8n.pt` are in git

### WebSocket Connection Fails

1. **Check URL**: Use `wss://` (secure WebSocket) not `ws://`
2. **Check CORS**: CORS is configured to allow all origins
3. **Check Render Logs**: Look for WebSocket connection errors

### Database Connection Issues

1. **Verify Connection String**: Must include `?sslmode=require`
2. **Check Neon Dashboard**: Ensure database is active
3. **Test Connection**: Use `psql` or Neon's SQL editor

### Slow Performance

1. **Cold Starts**: First request after spin-down is slow (normal)
2. **Model Loading**: First detection takes longer (models load into memory)
3. **Resource Limits**: Free tier has limited resources

## Post-Deployment Checklist

- [ ] Health endpoint responds: `/health`
- [ ] API docs accessible: `/docs`
- [ ] WebSocket connects: `/ws`
- [ ] Database connection works (check logs)
- [ ] Video upload works (test with small file)
- [ ] Hazard detection works (test with sample video)
- [ ] Frontend can connect to backend URL
- [ ] CORS allows frontend domain (if different)

## Updating Deployment

1. **Push to GitHub**: Changes automatically trigger redeployment
2. **Manual Deploy**: In Render dashboard, click "Manual Deploy"
3. **Rollback**: Use "Rollback" option if deployment fails

## Monitoring

### Health Check Endpoint
- URL: `https://your-app.onrender.com/health`
- Use with uptime monitoring services (UptimeRobot, etc.)

### Service Status Endpoint
- URL: `https://your-app.onrender.com/api/health`
- Returns detailed status of all services (DB, Redis, MQTT)

## Support

For issues specific to:
- **Render.com**: Check Render documentation or support
- **Neon Database**: Check Neon documentation
- **Application**: Check application logs in Render dashboard

## Next Steps

1. **Set up monitoring**: Use UptimeRobot to ping `/health` every 10 minutes
2. **Configure custom domain**: Add your domain in Render settings
3. **Set up Redis**: For better duplicate detection performance
4. **Configure MQTT**: If you need IoT integration
5. **Optimize for production**: Consider upgrading from free tier for better performance

