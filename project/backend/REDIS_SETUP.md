# Quick Redis Setup Guide

## 1. Install Redis Server

### Windows
```powershell
# Option 1: Using Chocolatey
choco install redis-64

# Option 2: Download from GitHub
# https://github.com/microsoftarchive/redis/releases
```

### Linux
```bash
sudo apt-get update
sudo apt-get install redis-server
```

### macOS
```bash
brew install redis
```

## 2. Start Redis Server

### Windows
```powershell
redis-server
```

### Linux/macOS
```bash
redis-server

# Or as a service
sudo systemctl start redis
```

## 3. Verify Redis is Running

```bash
redis-cli ping
# Should return: PONG
```

## 4. Install Python Dependencies

```bash
cd project/backend
pip install -r requirements.txt
```

## 5. Configure Environment Variables

Create a `.env` file in `project/backend/` with:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
HAZARD_KEY_TTL=1800
```

## 6. Test the Setup

Start your FastAPI server:
```bash
python main.py
```

Check Redis status:
```bash
curl http://localhost:8000/api/redis/status
```

## That's It!

Redis is now integrated into your hazard detection system. See `REDIS_DOCUMENTATION.md` for detailed usage and configuration.

