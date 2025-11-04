# Neon DB Quick Start Guide

## 1. Get Your Connection URL

1. Go to https://console.neon.tech
2. Create a project or select existing one
3. Copy your connection string (looks like):
   ```
   postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```

## 2. Add to .env File

Add this line to `project/backend/.env`:

```env
NEON_DATABASE_URL=your_connection_string_here
```

## 3. Install Dependencies

```bash
cd project/backend
pip install -r requirements.txt
```

## 4. Initialize Database

```bash
python db_init.py
```

## 5. Start Server

```bash
python main.py
```

## 6. Verify Setup

Check health:
```bash
curl http://localhost:8000/api/health
```

Check database status:
```bash
curl http://localhost:8000/api/database/status
```

## Done! ✅

Your Neon DB with PostGIS is now set up and ready to use.

For detailed documentation, see `NEON_DB_SETUP.md`.

