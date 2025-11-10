# Configuration settings

# Thresholds for object detection (optimized for accuracy)
DETECTION_THRESHOLDS = {
    # Road hazard model thresholds (yolov12.pt)
    "class_0": 0.40,  # Pothole - increased from 0.35 for better precision
    "class_1": 0.60,  # Speedbump - decreased from 0.65 for better recall
    
    # Standard object detection thresholds (yolov8n.pt)
    "person": 0.45,   # Person - slightly lowered for better detection
    "dog": 0.45,      # Dog - slightly lowered for better detection
    "cow": 0.45       # Cow - slightly lowered for better detection
}

# NMS (Non-Maximum Suppression) parameters for better accuracy
NMS_CONFIG = {
    "iou_threshold": 0.45,  # IoU threshold for NMS (lower = more strict)
    "conf_threshold": 0.25,  # Base confidence threshold
    "max_detections": 300,  # Maximum detections per image
    "agnostic_nms": False,   # Class-aware NMS (better accuracy)
}

# Model inference optimization settings
INFERENCE_CONFIG = {
    "imgsz": 640,  # Input image size (640 is optimal for YOLO)
    "half_precision": True,  # Use FP16 if CUDA available (faster)
    "augment": False,  # Disable augmentation for inference (faster, more consistent)
    "retina_masks": False,  # Disable for faster inference
}

# Default camera index
DEFAULT_CAMERA = 2

# Distance estimation parameters
DISTANCE_ESTIMATION = {
    "focal_length": 1000,  # Approximate focal length in pixels
    "known_width": {
        "person": 0.5,     # Average width of a person in meters
        "dog": 0.4,        # Average width of a dog in meters
        "cow": 0.8         # Average width of a cow in meters
    }
}

# MQTT Configuration
import os
from dotenv import load_dotenv
load_dotenv()

MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", None)
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", None)
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "roadguard-ai-backend")
MQTT_ENABLED = os.getenv("MQTT_ENABLED", "false").lower() == "true"

# Geofence Configuration
GEOFENCE_DEFAULT_RADIUS = float(os.getenv("GEOFENCE_DEFAULT_RADIUS", "5000"))  # 5km default