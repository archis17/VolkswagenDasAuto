from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pathlib import Path
import uvicorn
import os
import shutil
import csv
from typing import Optional, List, Dict
from contextlib import asynccontextmanager

from camera_manager import camera_manager
from video_file_manager import video_file_manager
from websocket_server import websocket_endpoint
from model_loader import road_model, standard_model  # Updated import
from notification_service import router as notification_router
from redis_client import redis_client
from neon_db import neon_db
from mqtt_client import mqtt_client
import mode_state
import asyncio


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    print("🚀 Starting application...")
    
    # Initialize Neon DB connection
    try:
        await neon_db.connect()
        print("✅ Neon DB connected on startup")
    except Exception as e:
        print(f"⚠️  Warning: Could not connect to Neon DB on startup: {e}")
        print("   Database operations will connect on-demand")
    
    # Check Redis connection (silent failure is OK)
    if not redis_client.is_connected():
        print("⚠️  Warning: Redis is not connected. Duplicate detection will use database fallback.")
        print("   To enable Redis, start Redis server or configure connection in .env")
    else:
        print("✅ Redis connected on startup")
    
    # Initialize MQTT connection (if enabled)
    try:
        await mqtt_client.connect()
        if mqtt_client.is_connected():
            print("✅ MQTT connected on startup")
        else:
            print("⚠️  Warning: MQTT is disabled or connection failed. Set MQTT_ENABLED=true to enable.")
    except Exception as e:
        print(f"⚠️  Warning: MQTT connection error: {e}")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down application...")
    
    # Close Neon DB connection
    try:
        await neon_db.disconnect()
        print("✅ Neon DB disconnected on shutdown")
    except Exception as e:
        print(f"⚠️  Warning: Error disconnecting from Neon DB: {e}")
    
    # Close MQTT connection
    try:
        await mqtt_client.disconnect()
        print("✅ MQTT disconnected on shutdown")
    except Exception as e:
        print(f"⚠️  Warning: Error disconnecting from MQTT: {e}")


app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
app.include_router(notification_router, prefix="/api")
# Root redirect to Swagger for convenience
@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")

# Simple health endpoint (useful for checks and Swagger quick test)
@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}


# Video upload and mode management endpoints
@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file for processing (legacy endpoint - use chunked upload for large files)"""
    
    # Validate file type
    allowed_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Save uploaded file
    uploads_dir = Path(__file__).parent / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    
    # Generate unique filename
    import uuid
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = uploads_dir / unique_filename
    
    try:
        # Save file with streaming for better performance
        with open(file_path, "wb") as buffer:
            # Use larger buffer for faster writes
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                buffer.write(chunk)
        
        print(f"✅ Video file saved: {file_path}")
        
        # Load video into video manager
        video_file_manager.load_video(str(file_path))
        video_file_manager.start_processing()
        
        # Switch to video mode
        mode_state.detection_mode = "video"
        
        return JSONResponse({
            "success": True,
            "filename": file.filename,
            "file_path": str(file_path),
            "message": "Video uploaded and processing started"
        })
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Error processing video: {str(e)}")
        print(f"Traceback: {error_trace}")
        # Clean up on error
        if file_path.exists():
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing video: {str(e)}")

# Chunked video upload for better performance with large files
@app.post("/api/upload-video-chunk")
async def upload_video_chunk(
    chunk: UploadFile = File(...),
    chunk_index: int = Form(0),
    total_chunks: int = Form(1),
    file_id: Optional[str] = Form(None),
    filename: Optional[str] = Form(None)
):
    """Upload a video file in chunks for better performance"""
    import uuid
    
    # Validate file type
    allowed_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'}
    if filename:
        file_ext = Path(filename).suffix.lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format. Allowed: {', '.join(allowed_extensions)}"
            )
    else:
        file_ext = '.mp4'  # Default
    
    uploads_dir = Path(__file__).parent / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    
    # Generate or use existing file ID
    if not file_id:
        file_id = str(uuid.uuid4())
    
    # Temporary chunk file
    chunk_file = uploads_dir / f"{file_id}_chunk_{chunk_index}"
    final_file = uploads_dir / f"{file_id}{file_ext}"
    
    try:
        # Save chunk
        with open(chunk_file, "wb") as buffer:
            while data := await chunk.read(1024 * 1024):  # 1MB chunks
                buffer.write(data)
        
        print(f"✅ Chunk {chunk_index + 1}/{total_chunks} saved for file_id: {file_id}")
        
        # If this is the last chunk, combine all chunks
        if chunk_index == total_chunks - 1:
            print(f"📦 Combining {total_chunks} chunks into final file...")
            # Combine all chunks
            with open(final_file, "wb") as outfile:
                for i in range(total_chunks):
                    chunk_path = uploads_dir / f"{file_id}_chunk_{i}"
                    if chunk_path.exists():
                        with open(chunk_path, "rb") as infile:
                            while data := infile.read(1024 * 1024):
                                outfile.write(data)
                        # Clean up chunk file
                        chunk_path.unlink()
            
            # Load video into video manager
            video_file_manager.load_video(str(final_file))
            video_file_manager.start_processing()
            
            # Switch to video mode
            mode_state.detection_mode = "video"
            
            return JSONResponse({
                "success": True,
                "file_id": file_id,
                "filename": filename or f"video{file_ext}",
                "file_path": str(final_file),
                "message": "Video uploaded and processing started",
                "complete": True
            })
        else:
            return JSONResponse({
                "success": True,
                "file_id": file_id,
                "chunk_index": chunk_index,
                "message": f"Chunk {chunk_index + 1}/{total_chunks} uploaded"
            })
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Error uploading chunk: {str(e)}")
        print(f"Traceback: {error_trace}")
        # Clean up on error
        if chunk_file.exists():
            chunk_file.unlink()
        if final_file.exists():
            final_file.unlink()
        raise HTTPException(status_code=500, detail=f"Error uploading chunk: {str(e)}")

class ModeRequest(BaseModel):
    mode: str

@app.post("/api/set-mode")
async def set_mode(request: ModeRequest):
    """Switch between live and video modes"""
    mode = request.mode
    
    if mode not in ["live", "video"]:
        raise HTTPException(status_code=400, detail="Mode must be 'live' or 'video'")
    
    if mode == "live":
        # Stop video processing
        video_file_manager.stop_processing()
        # Ensure camera is running (if available)
        # start_stream() will find camera if active_camera is None
        if not camera_manager.running:
            camera_manager.start_stream()
        mode_state.detection_mode = "live"
    elif mode == "video":
        # Stop camera if running
        if camera_manager.running:
            camera_manager.stop_stream()
        # Ensure video is running
        if video_file_manager.video_path and not video_file_manager.running:
            video_file_manager.start_processing()
        mode_state.detection_mode = "video"
    
    return JSONResponse({"success": True, "mode": mode_state.detection_mode})

@app.get("/api/get-mode")
async def get_mode():
    """Get current detection mode"""
    return JSONResponse({"mode": mode_state.detection_mode})

@app.post("/api/stop-video")
async def stop_video():
    """Stop video processing and switch back to live mode"""
    video_file_manager.stop_processing()
    video_file_manager.cleanup_file()
    
    # Switch back to live mode
    if not camera_manager.running and camera_manager.active_camera is None:
        camera_manager.start_stream()
    mode_state.detection_mode = "live"
    
    return JSONResponse({"success": True, "mode": "live"})

@app.get("/api/redis/status")
async def get_redis_status():
    """Get Redis connection status and statistics"""
    stats = redis_client.get_stats()
    return JSONResponse(stats)

@app.get("/api/health")
async def health_check():
    """Health check endpoint for all services"""
    db_connected = False
    try:
        db_connected = await neon_db.check_connection()
    except:
        pass
    
    return JSONResponse({
        "status": "healthy",
        "redis": redis_client.is_connected(),
        "database": db_connected,
        "mode": mode_state.detection_mode,
        "camera_available": camera_manager.camera_available,
        "video_active": video_file_manager.is_active() if hasattr(video_file_manager, 'is_active') else False
    })

@app.get("/api/database/status")
async def get_database_status():
    """Get Neon DB connection status and statistics"""
    stats = await neon_db.get_stats()
    return JSONResponse(stats)

# Analytics endpoints
@app.get("/api/analytics/trends")
async def get_analytics_trends(days: int = 30, interval: str = 'day'):
    """
    Get hazard detection trends over time
    
    Args:
        days: Number of days to look back (default: 30)
        interval: Time interval - 'day', 'week', or 'hour' (default: 'day')
    """
    try:
        if interval not in ['day', 'week', 'hour']:
            interval = 'day'
        trends = await neon_db.get_analytics_trends(days=days, interval=interval)
        return JSONResponse(trends)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching trends: {str(e)}")

@app.get("/api/analytics/distribution")
async def get_analytics_distribution(days: int = 30):
    """
    Get hazard type distribution
    
    Args:
        days: Number of days to look back (default: 30)
    """
    try:
        distribution = await neon_db.get_analytics_distribution(days=days)
        return JSONResponse(distribution)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching distribution: {str(e)}")

@app.get("/api/analytics/stats")
async def get_analytics_stats():
    """Get overall analytics statistics"""
    try:
        stats = await neon_db.get_analytics_stats()
        return JSONResponse(stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stats: {str(e)}")

@app.get("/api/analytics/heatmap")
async def get_analytics_heatmap(days: int = 30, limit: int = 1000):
    """
    Get geographic heatmap data
    
    Args:
        days: Number of days to look back (default: 30)
        limit: Maximum number of points to return (default: 1000)
    """
    try:
        heatmap = await neon_db.get_analytics_heatmap(days=days, limit=limit)
        return JSONResponse(heatmap)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching heatmap: {str(e)}")

# MQTT endpoints
@app.get("/api/mqtt/status")
async def get_mqtt_status():
    """Get MQTT connection status and statistics"""
    try:
        stats = await mqtt_client.get_stats()
        return JSONResponse(stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching MQTT status: {str(e)}")

# Route comparison endpoints
@app.get("/api/routes/compare")
async def get_route_comparison():
    """Get both routes with hazards and comparison data"""
    try:
        data_dir = Path(__file__).parent / "Data"
        route_a_file = data_dir / "routeA_hazards.csv"
        route_b_file = data_dir / "routeB_hazards.csv"
        
        def read_route_csv(file_path: Path, route_name: str) -> Dict:
            hazards = []
            if file_path.exists():
                with open(file_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        hazards.append({
                            'id': row['id'],
                            'type': row['type'],
                            'severity': int(row['severity']),
                            'lat': float(row['lat']),
                            'lon': float(row['lon']),
                            'reported_on': row['reported_on'],
                            'notes': row['notes']
                        })
            
            # Calculate route statistics
            total_hazards = len(hazards)
            total_severity = sum(h['severity'] for h in hazards)
            avg_severity = total_severity / total_hazards if total_hazards > 0 else 0
            hazard_types = {}
            for h in hazards:
                hazard_types[h['type']] = hazard_types.get(h['type'], 0) + 1
            
            return {
                'route_name': route_name,
                'hazards': hazards,
                'statistics': {
                    'total_hazards': total_hazards,
                    'total_severity': total_severity,
                    'average_severity': round(avg_severity, 2),
                    'hazard_types': hazard_types
                }
            }
        
        route_a = read_route_csv(route_a_file, 'Route A')
        route_b = read_route_csv(route_b_file, 'Route B')
        
        # Determine preferred route (minimum hazards)
        route_a_score = route_a['statistics']['total_hazards'] + route_a['statistics']['total_severity']
        route_b_score = route_b['statistics']['total_hazards'] + route_b['statistics']['total_severity']
        
        preferred_route = 'Route A' if route_a_score < route_b_score else 'Route B'
        
        return {
            'route_a': route_a,
            'route_b': route_b,
            'comparison': {
                'preferred_route': preferred_route,
                'route_a_score': route_a_score,
                'route_b_score': route_b_score,
                'recommendation': f"{preferred_route} has fewer hazards (Score: {min(route_a_score, route_b_score)} vs {max(route_a_score, route_b_score)})"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading route data: {str(e)}")

# WebSocket Route
app.websocket("/ws")(websocket_endpoint)

# Static Files and SPA Fallback
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")
    
    @app.get("/{filename}")
    async def get_file(filename: str):
        file_path = frontend_dist / filename
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_dist / "index.html"))
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(str(frontend_dist / "index.html"))

# Start Camera Stream (will find available camera automatically)
# If no camera is found, video upload mode will still work
try:
    camera_manager.start_stream()
except Exception as e:
    print(f"Warning: Could not start camera stream: {e}")
    print("Video file upload mode will still work.")

if __name__ == "__main__":
    import os
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host=host, port=port)
