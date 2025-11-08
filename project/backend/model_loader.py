from ultralytics import YOLO
import torch

# Model configuration for optimal performance
MODEL_CONFIG = {
    'conf': 0.25,  # Base confidence threshold (will be overridden by class-specific thresholds)
    'iou': 0.45,   # IoU threshold for NMS (Non-Maximum Suppression)
    'max_det': 300,  # Maximum detections per image
    'agnostic_nms': False,  # Class-agnostic NMS
    'half': True,  # Use FP16 precision if CUDA available
    'device': None,  # Will be set automatically
    'verbose': False
}

# Load both YOLO models with optimizations
def load_models():
    try:
        # Determine device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        MODEL_CONFIG['device'] = device
        
        print(f"Loading models on device: {device}")
        
        # Load custom model for road hazards (potholes and speedbumps)
        road_hazard_model = YOLO("yolov12.pt")
        
        # Warm up the model with a dummy inference for faster subsequent runs
        try:
            import numpy as np
            dummy_frame = np.zeros((640, 640, 3), dtype=np.uint8)
            _ = road_hazard_model.predict(
                dummy_frame,
                imgsz=640,
                device=device,
                half=MODEL_CONFIG['half'] if device == "cuda" else False,
                verbose=False
            )
            print("   Model warmup completed")
        except Exception as e:
            print(f"   Warning: Model warmup failed: {e}")
            pass  # Warmup failed, continue anyway
        
        print("✅ Custom road hazard model (yolov12.pt) loaded successfully")
        
        # Load standard YOLOv8n model for general objects
        standard_model = YOLO("yolov8n.pt")
        
        # Warm up standard model too
        try:
            import numpy as np
            dummy_frame = np.zeros((640, 640, 3), dtype=np.uint8)
            _ = standard_model.predict(
                dummy_frame,
                imgsz=640,
                device=device,
                half=MODEL_CONFIG['half'] if device == "cuda" else False,
                verbose=False
            )
            print("   Standard model warmup completed")
        except Exception as e:
            print(f"   Warning: Standard model warmup failed: {e}")
            pass
        
        print("✅ YOLOv8n model loaded successfully")
        
        # Set models to evaluation mode for inference
        if hasattr(road_hazard_model.model, 'eval'):
            road_hazard_model.model.eval()
        if hasattr(standard_model.model, 'eval'):
            standard_model.model.eval()
        
        return road_hazard_model, standard_model
    except Exception as e:
        print(f"❌ Error loading YOLO models: {str(e)}")
        raise

# Load both models
road_model, standard_model = load_models()
