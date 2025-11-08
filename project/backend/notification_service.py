import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Dict
from dotenv import load_dotenv
import asyncio
from redis_client import redis_client
from hazard_hash import generate_time_bounded_hash
from neon_db import neon_db

# Load environment variables
load_dotenv()

# Email configuration
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USER = os.getenv("EMAIL_USER", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
AUTHORITY_EMAIL = os.getenv("AUTHORITY_EMAIL", "local.authority@example.com")

# Create router
router = APIRouter()

# Updated HazardNotification model (image_url removed)
class HazardNotification(BaseModel):
    location: Dict[str, float]
    timestamp: datetime
    type: str

@router.post("/hazard-notification")
async def send_hazard_notification(notification: HazardNotification = Body(...)):
    try:
        # Only process pothole notifications
        if notification.type.lower() != "pothole":
            return {"success": False, "message": "Only pothole hazards are reported to authorities"}
        
        # Generate hash key for duplicate detection
        hash_key = generate_time_bounded_hash(
            location=notification.location,
            hazard_type=notification.type,
            timestamp=notification.timestamp,
            time_window_minutes=5  # 5-minute window for duplicates
        )
        
        # Check Redis for duplicate (fast lookup)
        if redis_client.check_duplicate(hash_key):
            return {
                "success": False,
                "message": "Duplicate hazard detected (already processed recently)",
                "duplicate": True
            }
        
        # Check PostGIS for existing report within 100m radius (fallback)
        nearby_hazards = await neon_db.find_nearby_hazards(
            location=notification.location,
            radius_meters=100.0,
            days_back=7
        )
        
        if nearby_hazards:
            # Check if any nearby hazard is recent (within 7 days)
            for hazard in nearby_hazards:
                hazard_time = hazard.get('timestamp')
                if isinstance(hazard_time, str):
                    hazard_time = datetime.fromisoformat(hazard_time.replace('Z', '+00:00'))
                elif isinstance(hazard_time, datetime):
                    pass
                else:
                    continue
                
                days_difference = (datetime.now(hazard_time.tzinfo) - hazard_time).days
                if days_difference < 7:
                    return {"success": False, "message": "Recent report exists for this location"}
        
        # Store hash key in Redis (30 minute TTL)
        redis_client.store_hazard_key(hash_key, ttl=1800)
        
        # Generate Google Maps link using received coordinates
        # Google Maps uses lat,lng format
        lat = notification.location['lat']
        lng = notification.location['lng']
        
        # Validate coordinates
        if abs(lat) > 90 or abs(lng) > 180:
            # Coordinates might be swapped
            if abs(lat) <= 180 and abs(lng) <= 90:
                lat, lng = lng, lat  # Swap them
        
        map_link = f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
        
        # Ensure database connection
        if not neon_db._pool:
            await neon_db.connect()
        
        # Store in PostGIS database
        report_id = await neon_db.insert_hazard_report(
            location=notification.location,
            hazard_type=notification.type,
            timestamp=notification.timestamp,
            map_link=map_link,
            hash_key=hash_key,
            status="reported"
        )
        
        # Send email notification with the map link
        await send_email_to_authority(notification, str(report_id), map_link)
        
        return {"success": True, "report_id": str(report_id)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process notification: {str(e)}")

# Updated email sending functions
async def send_email_to_authority(notification, report_id, map_link):
    try:
        asyncio.create_task(_send_email_async(notification, report_id, map_link))
        return True
    except Exception as e:
        print(f"Error scheduling email: {str(e)}")
        return False

async def _send_email_async(notification, report_id, map_link):
    try:
        email_host = os.getenv("EMAIL_HOST")
        email_port = int(os.getenv("EMAIL_PORT", "587"))
        email_user = os.getenv("EMAIL_USER")
        email_password = os.getenv("EMAIL_PASSWORD")
        authority_email = os.getenv("AUTHORITY_EMAIL")
        sender_email = os.getenv("SENDER_EMAIL")
        
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = authority_email
        msg['Subject'] = f"Road Hazard Alert: {notification.type.capitalize()} Detected"
        
        # Directly convert the timestamp to IST (UTC+5:30)
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        ts_ist = notification.timestamp.astimezone(ist_tz)
        indian_time_str = ts_ist.strftime("%Y-%m-%d %I:%M:%S %p IST")
        
        body = f"""
        <html>
        <body>
            <h2>Road Hazard Alert</h2>
            <p><strong>Type:</strong> {notification.type.capitalize()}</p>
            <p><strong>Location:</strong> Lat: {notification.location['lat']}, Lng: {notification.location['lng']}</p>
            <p><strong>Date & Time:</strong> {indian_time_str}</p>
            <p><strong>Map:</strong> <a href="{map_link}">View Location</a></p>
            <p>There is a possible road hazard at the specified location. Please take appropriate action.</p>
        </body>
        </html>
        """
        msg.attach(MIMEText(body, 'html'))
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: _send_smtp_email(
            email_host, email_port, email_user, email_password,
            sender_email, authority_email, msg.as_string()
        ))
        
        print(f"Email sent for report {report_id}")
        return True
    except Exception as e:
        print(f"Email send error: {e}")
        return False

def _send_smtp_email(host, port, user, password, sender, recipient, message):
    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(sender, recipient, message)

@router.get("/hazard-reports")
async def get_hazard_reports():
    """Get all hazard reports from the database"""
    try:
        # Ensure database connection
        if not neon_db._pool:
            await neon_db.connect()
        
        # Fetch all reports from PostGIS
        reports = await neon_db.get_all_hazards(limit=1000)
        
        # Convert timestamps to ISO format for JSON serialization and handle None values
        for report in reports:
            if 'timestamp' in report and report['timestamp'] is not None:
                if isinstance(report['timestamp'], datetime):
                    report['timestamp'] = report['timestamp'].isoformat()
            if 'created_at' in report and report['created_at'] is not None:
                if isinstance(report['created_at'], datetime):
                    report['created_at'] = report['created_at'].isoformat()
            # Ensure lat/lng are floats or None
            if 'lat' in report:
                report['lat'] = float(report['lat']) if report['lat'] is not None else None
            if 'lng' in report:
                report['lng'] = float(report['lng']) if report['lng'] is not None else None
        
        return reports
    except Exception as e:
        # Fail fast with empty array rather than hanging the UI
        return []
        import traceback
        error_details = traceback.format_exc()
        print(f"Error fetching hazard reports: {error_details}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch hazard reports: {str(e)}")

@router.delete("/cleanup-resolved-hazards")
async def cleanup_resolved_hazards():
    """Remove hazard reports that are older than 7 days and have no recent reports in the same location"""
    try:
        # Ensure database connection
        if not neon_db._pool:
            await neon_db.connect()
        
        # Use PostGIS cleanup method
        removed_count = await neon_db.cleanup_old_hazards(days=7)
        
        return {
            "success": True, 
            "message": f"Removed {removed_count} resolved hazards",
            "removed_count": removed_count
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cleanup resolved hazards: {str(e)}")

# Also add a specific endpoint to delete a single hazard by ID
@router.delete("/hazard-reports/{report_id}")
async def delete_hazard_report(report_id: str):
    """Delete a specific hazard report by ID"""
    try:
        # Ensure database connection
        if not neon_db._pool:
            await neon_db.connect()
        
        # Convert string ID to integer
        try:
            report_id_int = int(report_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid report ID format: {report_id}")
        
        # Check if report exists
        report = await neon_db.get_hazard_by_id(report_id_int)
        if not report:
            raise HTTPException(status_code=404, detail=f"Hazard report with ID {report_id} not found")
        
        # Delete the report
        deleted = await neon_db.delete_hazard(report_id_int)
        
        if deleted:
            return {"success": True, "message": f"Hazard report {report_id} deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete hazard report")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete hazard report: {str(e)}")