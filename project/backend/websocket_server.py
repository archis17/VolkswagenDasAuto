import asyncio
import cv2
import torch
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from camera_manager import camera_manager
from video_file_manager import video_file_manager
from model_loader import road_model, standard_model
from config import DETECTION_THRESHOLDS  # Import the thresholds from config
from distance_estimator import DistanceEstimator
from concurrent.futures import ThreadPoolExecutor
import time
from typing import Optional

# Import detection mode from mode_state
import mode_state

# Thread pool for CPU-intensive operations
executor = ThreadPoolExecutor(max_workers=2)

# WebSocket configuration
TARGET_FPS = 15  # Reduced from 30 to 15 for better performance
FRAME_INTERVAL = 1.0 / TARGET_FPS  # ~0.067 seconds
JPEG_QUALITY = 75  # Reduced from 80 for smaller file size
MAX_QUEUE_SIZE = 2  # Maximum frames to queue before dropping
FRAME_SKIP_THRESHOLD = 0.1  # Skip frame if encoding takes longer than this

def get_current_mode():
    """Get the current detection mode"""
    return mode_state.detection_mode

def encode_frame_sync(frame, quality=JPEG_QUALITY):
    """Synchronous frame encoding (runs in thread pool)"""
    try:
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
        success, jpeg = cv2.imencode('.jpg', frame, encode_params)
        if success:
            return jpeg.tobytes()
        return None
    except Exception as e:
        print(f"Frame encoding error: {e}")
        return None

async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Performance tracking
    last_frame_time = time.time()
    frame_count = 0
    skip_count = 0
    pending_frame = None
    
    try:
        while True:
            loop_start = time.time()
            current_mode = get_current_mode()
            frame = None
            
            # Get frame based on current mode (non-blocking)
            if current_mode == "video":
                # Get frame from video file manager
                if not video_file_manager.frame_queue.empty():
                    # Skip frames if queue is backing up
                    while video_file_manager.frame_queue.qsize() > MAX_QUEUE_SIZE:
                        try:
                            video_file_manager.frame_queue.get_nowait()
                            skip_count += 1
                        except:
                            break
                    if not video_file_manager.frame_queue.empty():
                        frame = video_file_manager.frame_queue.get()
            else:
                # Get frame from camera manager (live mode)
                if camera_manager.camera_available and not camera_manager.frame_queue.empty():
                    # Skip frames if queue is backing up
                    while camera_manager.frame_queue.qsize() > MAX_QUEUE_SIZE:
                        try:
                            camera_manager.frame_queue.get_nowait()
                            skip_count += 1
                        except:
                            break
                    if not camera_manager.frame_queue.empty():
                        frame = camera_manager.frame_queue.get()
            
            # Process frame if available
            if frame is not None:
                # Process the frame with both YOLO models
                results, driver_lane_hazard_count, vis_frame, hazard_distances = process_frame_with_models(frame)
                
                # Encode frame asynchronously in thread pool
                jpeg_bytes = await asyncio.get_event_loop().run_in_executor(
                    executor,
                    encode_frame_sync,
                    vis_frame,
                    JPEG_QUALITY
                )
                
                if jpeg_bytes:
                    try:
                        # Send processed frame
                        await websocket.send_bytes(jpeg_bytes)
                        
                        # Send both total and driver lane hazard counts
                        total_hazard_count = len(results)
                        
                        # Check if any detection is a pothole
                        pothole_detected = any(detection.get('type', '').lower() == 'pothole' for detection in results)
                        
                        # Get video progress if in video mode
                        video_progress = None
                        if current_mode == "video" and video_file_manager.is_active():
                            video_progress = video_file_manager.get_progress()
                        
                        # Send JSON data
                        await websocket.send_json({
                            "hazard_count": total_hazard_count,
                            "driver_lane_hazard_count": driver_lane_hazard_count,
                            "hazard_distances": hazard_distances,
                            "hazard_type": "pothole" if pothole_detected else "",
                            "mode": current_mode,
                            "video_progress": video_progress
                        })
                        
                        frame_count += 1
                        last_frame_time = time.time()
                        
                    except Exception as e:
                        print(f"WebSocket send error: {e}")
                        break  # Break on send error
            
            # Adaptive sleep based on actual frame processing time
            elapsed = time.time() - loop_start
            sleep_time = max(0.001, FRAME_INTERVAL - elapsed)
            await asyncio.sleep(sleep_time)
            
    except WebSocketDisconnect:
        print(f"Client disconnected (sent {frame_count} frames, skipped {skip_count} frames)")
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
    finally:
        # Cleanup
        try:
            await websocket.close()
        except:
            pass

# Initialize the distance estimator
distance_estimator = DistanceEstimator()

def process_frame_with_models(frame):
    """Process a frame with both YOLO models and apply filtering"""
    # Get frame dimensions
    frame_height, frame_width = frame.shape[:2]
    
    # Calculate lane boundaries (middle 50%)
    left_boundary = int(frame_width * 0.25)
    right_boundary = int(frame_width * 0.75)
    
    # Process with road hazard model (potholes and speedbumps)
    road_results = road_model.predict(
        frame,
        imgsz=640,
        device="cuda" if torch.cuda.is_available() else "cpu",
        half=torch.cuda.is_available(),
        verbose=False
    )
    
    # Process with standard model (people, animals, vehicles)
    standard_results = standard_model.predict(
        frame,
        imgsz=640,
        device="cuda" if torch.cuda.is_available() else "cpu",
        half=torch.cuda.is_available(),
        verbose=False
    )

    # Apply threshold filtering using values from config
    filtered_road_results = []
    filtered_standard_results = []
    driver_lane_hazards = []  # Hazards in the middle 50% (driver's lane)
    hazard_distances = []  # Store distances of detected hazards
    all_filtered_results = []
    
    # Process road hazards (potholes, speedbumps)
    if len(road_results[0].boxes.data) > 0:
        for r in road_results[0].boxes.data:
            x1, y1, x2, y2, conf, cls = r.tolist()
            cls_int = int(cls)
            threshold_key = f"class_{cls_int}"
            
            # Get class name from road hazard model
            class_name = road_model.names[cls_int] if cls_int in road_model.names else f"class_{cls_int}"
            
            if threshold_key in DETECTION_THRESHOLDS and conf >= DETECTION_THRESHOLDS[threshold_key]:
                filtered_road_results.append(r.unsqueeze(0))
                all_filtered_results.append({
                    'box': [x1, y1, x2, y2],
                    'conf': conf,
                    'cls': cls_int,
                    'class_name': class_name,
                    'model': 'road',
                    'type': class_name  # Add the type explicitly
                })
                
                # Check if hazard is in driver's lane (middle 50%)
                box_center_x = (x1 + x2) / 2
                if left_boundary <= box_center_x <= right_boundary:
                    driver_lane_hazards.append(r.unsqueeze(0))
    
    # Process standard objects (people, animals, vehicles)
    if len(standard_results[0].boxes.data) > 0:
        for r in standard_results[0].boxes.data:
            x1, y1, x2, y2, conf, cls = r.tolist()
            cls_int = int(cls)
            
            # Get class name from standard model
            class_name = standard_model.names[cls_int] if cls_int in standard_model.names else f"class_{cls_int}"
            
            # Only process people, dogs, and cows with confidence > 0.5
            if class_name in ['person', 'dog', 'cow'] and conf >= 0.5:
                filtered_standard_results.append(r.unsqueeze(0))
                all_filtered_results.append({
                    'box': [x1, y1, x2, y2],
                    'conf': conf,
                    'cls': cls_int,
                    'class_name': class_name,
                    'model': 'standard'
                })
                
                # Inside process_frame_with_models function, modify the hazard_distances creation:
                # Calculate distance for people, dogs, and cows
                bbox_width = x2 - x1
                distance = distance_estimator.estimate_distance(class_name, bbox_width, frame_width)
                
                # Check if hazard is in driver's lane (middle 50%)
                box_center_x = (x1 + x2) / 2
                is_in_driver_lane = left_boundary <= box_center_x <= right_boundary
                
                hazard_distances.append({
                    'class': class_name,
                    'distance': distance,
                    'bbox': [x1, y1, x2, y2],
                    'inDriverLane': is_in_driver_lane
                })
                
                # Check if hazard is in driver's lane (middle 50%)
                box_center_x = (x1 + x2) / 2
                if left_boundary <= box_center_x <= right_boundary:
                    driver_lane_hazards.append(r.unsqueeze(0))
    
    # Update road model results
    if filtered_road_results:
        road_results[0].boxes.data = torch.cat(filtered_road_results, dim=0)
    else:
        road_results[0].boxes.data = torch.empty((0, 6))
    
    # Update standard model results
    if filtered_standard_results:
        standard_results[0].boxes.data = torch.cat(filtered_standard_results, dim=0)
    else:
        standard_results[0].boxes.data = torch.empty((0, 6))
    
    # Count hazards in driver's lane
    driver_lane_hazard_count = len(driver_lane_hazards)
    
    # Create a copy of the original frame for visualization
    vis_frame = frame.copy()
    
    # Draw all detections on the visualization frame
    for result in all_filtered_results:
        x1, y1, x2, y2 = result['box']
        class_name = result['class_name']
        
        # Different colors for different types of objects
        if result['model'] == 'road':
            color = (0, 255, 0)
  # Orange for road hazards (BGR format)
        else:
           color = (0, 255, 255)
  # Blue for standard objects
        
        # Draw bounding box
        cv2.rectangle(vis_frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
        
        # Draw label without confidence
        label = f"{class_name}"
        cv2.putText(vis_frame, label, (int(x1), int(y1) - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    # Add distance information to the visualization for standard objects
    for hazard in hazard_distances:
        x1, y1, x2, y2 = hazard['bbox']
        cv2.putText(
            vis_frame, 
            f"{hazard['distance']:.1f}m", 
            (int(x1), int(y1) - 30), 
            cv2.FONT_HERSHEY_SIMPLEX, 
            0.5, 
            (0, 255, 0), 
            2
        )
    
    return all_filtered_results, driver_lane_hazard_count, vis_frame, hazard_distances