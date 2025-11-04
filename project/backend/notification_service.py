import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Dict
from dotenv import load_dotenv
import asyncio

# Load environment variables
load_dotenv()

# MongoDB connection (fail fast if DB unreachable)
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=1000, connectTimeoutMS=1000)
try:
    # Trigger server selection once at startup (non-fatal)
    mongo_client.admin.command("ping")
    db = mongo_client["road_hazards"]
    hazard_reports = db["hazard_reports"]
except Exception:
    db = None
    hazard_reports = None

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
            
        # Check for an existing report (approx. 100m radius)
        if hazard_reports is not None:
            existing_report = hazard_reports.find_one({
            "location.lat": {"$gte": notification.location["lat"] - 0.001, "$lte": notification.location["lat"] + 0.001},
            "location.lng": {"$gte": notification.location["lng"] - 0.001, "$lte": notification.location["lng"] + 0.001},
            })
        else:
            existing_report = None
        
        if existing_report:
            report_time = existing_report.get("timestamp", datetime.min)
            if isinstance(report_time, str):
                report_time = datetime.fromisoformat(report_time.replace('Z', '+00:00'))
            days_difference = (datetime.now() - report_time).days
            if days_difference < 7:
                return {"success": False, "message": "Recent report exists for this location"}
        
        # Generate Google Maps link using received coordinates
        map_link = f"https://www.google.com/maps/search/?api=1&query={notification.location['lat']},{notification.location['lng']}"
        
        # Store in MongoDB without image_url field
        if hazard_reports is not None:
            report_id = hazard_reports.insert_one({
            "location": notification.location,
            "timestamp": notification.timestamp,
            "type": notification.type,
            "map_link": map_link,
            "status": "reported"
            }).inserted_id
        else:
            report_id = "local-dev"
        
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
        if hazard_reports is None:
            return []

        # Quick ping to avoid long hangs if DB went away
        mongo_client.admin.command("ping")

        # Fetch all reports, sort by timestamp descending (newest first)
        reports = list(hazard_reports.find({}, {'_id': 0}).sort('timestamp', -1))
        
        # Convert ObjectId to string for JSON serialization
        for report in reports:
            if '_id' in report:
                report['_id'] = str(report['_id'])
            
            # Ensure timestamp is serializable
            if 'timestamp' in report and isinstance(report['timestamp'], datetime):
                report['timestamp'] = report['timestamp'].isoformat()
        
        return reports
    except Exception as e:
        # Fail fast with empty array rather than hanging the UI
        return []

@router.delete("/cleanup-resolved-hazards")
async def cleanup_resolved_hazards():
    """Remove hazard reports that are older than 7 days and have no recent reports in the same location"""
    try:
        # Get the cutoff date (7 days ago)
        cutoff_date = datetime.now() - timedelta(days=7)
        
        # Find all reports older than 7 days
        old_reports = list(hazard_reports.find({
            "timestamp": {"$lt": cutoff_date}
        }))
        
        removed_count = 0
        
        for report in old_reports:
            # For each old report, check if there's a newer report within 100m
            has_newer_report = hazard_reports.find_one({
                "location.lat": {"$gte": report["location"]["lat"] - 0.001, "$lte": report["location"]["lat"] + 0.001},
                "location.lng": {"$gte": report["location"]["lng"] - 0.001, "$lte": report["location"]["lng"] + 0.001},
                "timestamp": {"$gte": cutoff_date}
            })
            
            # If no newer report exists, remove this old report
            if not has_newer_report:
                hazard_reports.delete_one({"_id": report["_id"]})
                removed_count += 1
        
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
        from bson.objectid import ObjectId
        
        # Convert string ID to MongoDB ObjectId
        result = hazard_reports.delete_one({"_id": ObjectId(report_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail=f"Hazard report with ID {report_id} not found")
        
        return {"success": True, "message": f"Hazard report {report_id} deleted successfully"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete hazard report: {str(e)}")