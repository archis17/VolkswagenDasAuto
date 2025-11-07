from ultralytics import YOLO

# Load both YOLO models
def load_models():
    try:
        # Load custom model for road hazards (potholes and speedbumps)
        road_hazard_model = YOLO("yolov12.pt")
        print("Custom road hazard model (yolov12.pt) loaded successfully")
        
        # Load standard YOLOv8n model for general objects
        standard_model = YOLO("yolov8n.pt")
        print("YOLOv8n model loaded successfully")
        
        return road_hazard_model, standard_model
    except Exception as e:
        print(f"Error loading YOLO models: {str(e)}")
        raise

# Load both models
road_model, standard_model = load_models()
