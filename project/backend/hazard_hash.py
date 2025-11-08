"""
Hazard Hash Key Generator
Generates unique hash keys for hazard events to enable duplicate detection
"""
import hashlib
import json
from typing import Dict, Optional, Any
from datetime import datetime


def generate_hazard_hash(
    location: Dict[str, float],
    hazard_type: str,
    timestamp: Optional[datetime] = None,
    bounding_box: Optional[list] = None,
    precision: int = 4
) -> str:
    """
    Generate a unique hash key for a hazard event
    
    The hash is based on:
    - Location (rounded to specified precision)
    - Hazard type
    - Optional timestamp (rounded to nearest minute for time window)
    - Optional bounding box (normalized)
    
    Args:
        location: Dictionary with 'lat' and 'lng' keys
        hazard_type: Type of hazard (e.g., 'pothole', 'person', 'dog')
        timestamp: Optional datetime for time-based deduplication
        bounding_box: Optional bounding box coordinates [x1, y1, x2, y2]
        precision: Decimal precision for location rounding (default: 4 = ~11m accuracy)
    
    Returns:
        SHA256 hash string as the unique key
    """
    # Round location to specified precision (4 decimal places ≈ 11 meters)
    rounded_lat = round(location.get('lat', 0), precision)
    rounded_lng = round(location.get('lng', 0), precision)
    
    # Prepare hash components
    hash_data = {
        'location': {
            'lat': rounded_lat,
            'lng': rounded_lng
        },
        'type': hazard_type.lower().strip()
    }
    
    # Add timestamp window (round to nearest minute for time-based deduplication)
    if timestamp:
        if isinstance(timestamp, str):
            # Try to parse if string
            try:
                timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            except:
                timestamp = datetime.now()
        
        # Round to nearest minute for time window
        minute_timestamp = timestamp.replace(second=0, microsecond=0)
        hash_data['time_window'] = minute_timestamp.isoformat()
    
    # Optionally add bounding box (normalized) if provided
    if bounding_box and len(bounding_box) >= 4:
        # Normalize bounding box to 0-1 range (assuming frame dimensions)
        # This is optional and can help distinguish similar locations
        hash_data['bbox'] = [
            round(bounding_box[0], 2),
            round(bounding_box[1], 2),
            round(bounding_box[2], 2),
            round(bounding_box[3], 2)
        ]
    
    # Create deterministic JSON string
    json_str = json.dumps(hash_data, sort_keys=True, separators=(',', ':'))
    
    # Generate SHA256 hash
    hash_key = hashlib.sha256(json_str.encode('utf-8')).hexdigest()
    
    # Prefix with namespace for organization
    return f"hazard:{hash_key}"


def generate_simple_hash(location: Dict[str, float], hazard_type: str, precision: int = 4) -> str:
    """
    Generate a simple hash key without timestamp (for location+type only)
    
    Useful for checking if a hazard of the same type exists at a location
    regardless of time.
    
    Args:
        location: Dictionary with 'lat' and 'lng' keys
        hazard_type: Type of hazard
        precision: Decimal precision for location rounding
    
    Returns:
        SHA256 hash string
    """
    return generate_hazard_hash(location, hazard_type, timestamp=None, bounding_box=None, precision=precision)


def generate_time_bounded_hash(
    location: Dict[str, float],
    hazard_type: str,
    timestamp: datetime,
    time_window_minutes: int = 5,
    precision: int = 4
) -> str:
    """
    Generate a hash key with time window for deduplication
    
    This will consider hazards within the same time window as duplicates.
    
    Args:
        location: Dictionary with 'lat' and 'lng' keys
        hazard_type: Type of hazard
        timestamp: Timestamp of the hazard
        time_window_minutes: Time window in minutes (default: 5)
        precision: Decimal precision for location rounding
    
    Returns:
        SHA256 hash string
    """
    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except:
            timestamp = datetime.now()
    
    # Round to nearest time window
    minutes_to_round = timestamp.minute // time_window_minutes * time_window_minutes
    windowed_timestamp = timestamp.replace(minute=minutes_to_round, second=0, microsecond=0)
    
    return generate_hazard_hash(location, hazard_type, timestamp=windowed_timestamp, precision=precision)

