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
from typing import Optional, Dict
from datetime import datetime
import json
from gps_extractor import gps_extractor
from neon_db import neon_db

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
    current_gps = None  # GPS location from client
    frame_number = 0
    
    try:
        # Start receiving messages (including GPS updates)
        async def receive_messages():
            nonlocal current_gps
            while True:
                try:
                    # Receive message - could be text (JSON) or bytes
                    message = await websocket.receive()
                    
                    # Handle text messages (JSON)
                    if 'text' in message:
                        data = json.loads(message['text'])
                        # Handle GPS updates from client
                        if 'gps' in data:
                            gps_data = data['gps']
                            if 'lat' in gps_data and 'lng' in gps_data:
                                gps_extractor.set_gps_location(
                                    gps_data['lat'],
                                    gps_data['lng']
                                )
                                current_gps = gps_data
                                # Verify coordinate order: latitude should be between -90 and 90, longitude between -180 and 180
                                lat = gps_data['lat']
                                lng = gps_data['lng']
                                if abs(lat) > 90 or abs(lng) > 180:
                                    # Coordinates might be swapped
                                    print(f"⚠️ Warning: GPS coordinates may be swapped! Received: lat={lat:.6f}, lng={lng:.6f}")
                                    # Auto-correct if swapped
                                    if abs(lat) <= 180 and abs(lng) <= 90:
                                        print(f"🔄 Auto-correcting swapped coordinates")
                                        current_gps = {'lat': lng, 'lng': lat}
                                        gps_extractor.set_gps_location(lng, lat)
                                else:
                                    print(f"📍 GPS updated: lat={lat:.6f}, lng={lng:.6f}")
                    # Ignore binary messages (video frames from client)
                    elif 'bytes' in message:
                        pass
                except Exception as e:
                    # Connection closed or error
                    break
        
        # Start receiving messages in background
        receive_task = asyncio.create_task(receive_messages())
        
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
                frame_number += 1
                
                # Get GPS location (priority: client GPS > GPS extractor > frame metadata)
                gps_location = current_gps
                if not gps_location:
                    gps_location = gps_extractor.get_current_gps()
                if not gps_location:
                    # Try to extract from frame
                    video_path = video_file_manager.video_path if current_mode == "video" else None
                    gps_location = gps_extractor.extract_from_frame(frame, video_path)
                
                # Process the frame with both YOLO models
                results, driver_lane_hazard_count, vis_frame, hazard_distances = process_frame_with_models(frame)
                
                # Store detections with GPS in database
                if results and len(results) > 0:
                    await store_hazard_detections(
                        results=results,
                        driver_lane_hazard_count=driver_lane_hazard_count,
                        hazard_distances=hazard_distances,
                        gps_location=gps_location,
                        frame_number=frame_number,
                        current_mode=current_mode
                    )
                
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
                            "video_progress": video_progress,
                            "gps_available": gps_location is not None
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
        # Cancel receive task
        if 'receive_task' in locals():
            receive_task.cancel()
        # Cleanup
        try:
            await websocket.close()
        except:
            pass


async def store_hazard_detections(
    results: list,
    driver_lane_hazard_count: int,
    hazard_distances: list,
    gps_location: Optional[Dict[str, float]],
    frame_number: int,
    current_mode: str
):
    """Store hazard detections with GPS in database"""
    if not neon_db._pool:
        await neon_db.connect()
    
    try:
        # Validate and correct GPS coordinates if needed
        validated_gps = None
        if gps_location:
            lat = gps_location.get('lat', 0)
            lng = gps_location.get('lng', 0)
            
            # Check if coordinates might be swapped
            if abs(lat) > 90 or abs(lng) > 180:
                if abs(lat) <= 180 and abs(lng) <= 90:
                    # Coordinates are swapped, correct them
                    validated_gps = {'lat': lng, 'lng': lat}
                    print(f"🔄 GPS coordinates corrected: {lat:.6f},{lng:.6f} → {lng:.6f},{lat:.6f}")
                else:
                    validated_gps = None  # Invalid coordinates
            else:
                validated_gps = gps_location
        
        for i, detection in enumerate(results):
            hazard_type = detection.get('type', detection.get('class_name', 'unknown'))
            confidence = detection.get('conf', 0.0)
            bounding_box = detection.get('box', None)
            
            # Get distance if available
            distance = None
            is_driver_lane = False
            if i < len(hazard_distances):
                distance = hazard_distances[i].get('distance')
                is_driver_lane = hazard_distances[i].get('inDriverLane', False)
            
            # Store detection in database with validated GPS
            await neon_db.insert_hazard_detection(
                location=validated_gps,
                hazard_type=hazard_type,
                timestamp=datetime.now(),
                detection_confidence=confidence,
                bounding_box=bounding_box,
                driver_lane=is_driver_lane,
                distance_meters=distance,
                frame_number=frame_number,
                video_path=video_file_manager.video_path if current_mode == "video" else None,
                source="websocket"
            )
    except Exception as e:
        # Don't fail the entire process if database storage fails
        import traceback
        print(f"Error storing hazard detection: {e}")
        print(traceback.format_exc())

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