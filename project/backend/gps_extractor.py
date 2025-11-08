"""
GPS Extraction Module
Extracts GPS coordinates from video frames, metadata, or external sources
"""
import cv2
import os
from typing import Optional, Dict, Tuple
from datetime import datetime
import logging
from pathlib import Path
import exifread
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

logger = logging.getLogger(__name__)


class GPSExtractor:
    """Extract GPS coordinates from various sources"""
    
    def __init__(self):
        self.last_gps_location: Optional[Dict[str, float]] = None
        self.gps_history: list = []  # Store recent GPS locations
        
    def extract_from_frame(self, frame, video_path: Optional[str] = None) -> Optional[Dict[str, float]]:
        """
        Extract GPS from video frame or metadata
        
        Args:
            frame: OpenCV frame (numpy array)
            video_path: Optional path to video file for metadata extraction
            
        Returns:
            Dictionary with 'lat' and 'lng' keys, or None
        """
        # Try to extract from video metadata first
        if video_path:
            gps = self.extract_from_video_metadata(video_path)
            if gps:
                return gps
        
        # Try to extract from frame EXIF if available
        gps = self.extract_from_frame_exif(frame)
        if gps:
            return gps
        
        # Return last known GPS if available
        return self.last_gps_location
    
    def extract_from_video_metadata(self, video_path: str) -> Optional[Dict[str, float]]:
        """
        Extract GPS coordinates from video file metadata
        
        Args:
            video_path: Path to video file
            
        Returns:
            Dictionary with 'lat' and 'lng' keys, or None
        """
        try:
            if not os.path.exists(video_path):
                return None
            
            # Use OpenCV to get video properties
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                return None
            
            # Try to get metadata (some cameras store GPS in video metadata)
            # Note: This depends on the video format and camera
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            
            # For now, we'll use a fallback method
            # In production, you might use ffprobe or similar tools
            cap.release()
            
            # Alternative: Check if video has embedded GPS data
            # This would require additional libraries like ffmpeg-python
            return None
            
        except Exception as e:
            logger.debug(f"Could not extract GPS from video metadata: {e}")
            return None
    
    def extract_from_frame_exif(self, frame) -> Optional[Dict[str, float]]:
        """
        Extract GPS from frame EXIF data (if available)
        
        Args:
            frame: OpenCV frame
            
        Returns:
            Dictionary with 'lat' and 'lng' keys, or None
        """
        try:
            # Convert OpenCV frame to PIL Image for EXIF extraction
            # Note: Most video frames don't have EXIF, but some cameras do embed it
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(frame_rgb)
            
            exif_data = pil_image._getexif()
            if not exif_data:
                return None
            
            # Extract GPS data from EXIF
            gps_data = {}
            for tag_id, value in exif_data.items():
                tag = TAGS.get(tag_id, tag_id)
                if tag == "GPSInfo":
                    for gps_tag_id, gps_value in value.items():
                        gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                        gps_data[gps_tag] = gps_value
                    
                    if gps_data:
                        return self._convert_gps_to_decimal(gps_data)
            
            return None
            
        except Exception as e:
            logger.debug(f"Could not extract GPS from frame EXIF: {e}")
            return None
    
    def _convert_gps_to_decimal(self, gps_data: Dict) -> Optional[Dict[str, float]]:
        """
        Convert GPS EXIF data to decimal degrees
        
        Args:
            gps_data: GPS data from EXIF
            
        Returns:
            Dictionary with 'lat' and 'lng' in decimal degrees
        """
        try:
            lat = self._dms_to_decimal(
                gps_data.get('GPSLatitude'),
                gps_data.get('GPSLatitudeRef', 'N')
            )
            lng = self._dms_to_decimal(
                gps_data.get('GPSLongitude'),
                gps_data.get('GPSLongitudeRef', 'E')
            )
            
            if lat and lng:
                return {'lat': lat, 'lng': lng}
            
            return None
            
        except Exception as e:
            logger.debug(f"Error converting GPS to decimal: {e}")
            return None
    
    def _dms_to_decimal(self, dms: Tuple, ref: str) -> Optional[float]:
        """
        Convert degrees, minutes, seconds to decimal degrees
        
        Args:
            dms: Tuple of (degrees, minutes, seconds)
            ref: Reference (N/S for latitude, E/W for longitude)
            
        Returns:
            Decimal degrees
        """
        if not dms:
            return None
        
        try:
            degrees = float(dms[0])
            minutes = float(dms[1]) if len(dms) > 1 else 0
            seconds = float(dms[2]) if len(dms) > 2 else 0
            
            decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
            
            if ref in ['S', 'W']:
                decimal = -decimal
            
            return decimal
            
        except Exception as e:
            logger.debug(f"Error converting DMS to decimal: {e}")
            return None
    
    def set_gps_location(self, lat: float, lng: float):
        """
        Set GPS location from external source (e.g., browser geolocation, vehicle telemetry)
        
        Args:
            lat: Latitude
            lng: Longitude
        """
        self.last_gps_location = {'lat': lat, 'lng': lng}
        
        # Store in history (keep last 100 locations)
        self.gps_history.append({
            'lat': lat,
            'lng': lng,
            'timestamp': datetime.now()
        })
        
        if len(self.gps_history) > 100:
            self.gps_history.pop(0)
    
    def get_current_gps(self) -> Optional[Dict[str, float]]:
        """
        Get current GPS location
        
        Returns:
            Dictionary with 'lat' and 'lng' keys, or None
        """
        return self.last_gps_location
    
    def get_gps_from_history(self, timestamp: datetime) -> Optional[Dict[str, float]]:
        """
        Get GPS location closest to a specific timestamp
        
        Args:
            timestamp: Target timestamp
            
        Returns:
            Dictionary with 'lat' and 'lng' keys, or None
        """
        if not self.gps_history:
            return self.last_gps_location
        
        # Find closest GPS location by timestamp
        closest = min(
            self.gps_history,
            key=lambda x: abs((x['timestamp'] - timestamp).total_seconds())
        )
        
        return {'lat': closest['lat'], 'lng': closest['lng']}


# Global GPS extractor instance
gps_extractor = GPSExtractor()

