# Configuration settings

# Thresholds for object detection
DETECTION_THRESHOLDS = {
    # Road hazard model thresholds (yolov12.pt)
    "class_0": 0.35,  # Pothole
    "class_1": 0.65,  # Speedbump
    
    # Standard object detection thresholds (yolov8n.pt)
    "person": 0.50,   # Person
    "dog": 0.50,      # Dog
    "cow": 0.50       # Cow
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
