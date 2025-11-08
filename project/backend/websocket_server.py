import asyncio
import cv2
import torch
import numpy as np
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Optional, Dict
from fastapi import WebSocket, WebSocketDisconnect
from camera_manager import camera_manager
from video_file_manager import video_file_manager
from model_loader import road_model, standard_model, MODEL_CONFIG
from config import DETECTION_THRESHOLDS, NMS_CONFIG, INFERENCE_CONFIG  # Import optimized configs
from distance_estimator import DistanceEstimator
from neon_db import neon_db

# Optional faster JPEG encoder
try:
    from turbojpeg import TurboJPEG, TJPF_BGR
    _jpeg = TurboJPEG()
    def encode_jpeg_bgr(image, quality=55):
        return _jpeg.encode(image, pixel_format=TJPF_BGR, quality=quality)
except Exception:
    _jpeg = None
    def encode_jpeg_bgr(image, quality=55):
        _, jpeg = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return jpeg.tobytes()

# Import detection mode from mode_state
import mode_state

# Thread pool for CPU-intensive operations
executor = ThreadPoolExecutor(max_workers=2)

# WebSocket configuration - optimized for higher FPS
TARGET_FPS = 30  # Increased for smoother video
FRAME_INTERVAL = 1.0 / TARGET_FPS  # ~0.033 seconds
JPEG_QUALITY = 70  # Balanced quality and size for faster encoding
MAX_QUEUE_SIZE = 2  # Maximum frames to queue before dropping
FRAME_SKIP_THRESHOLD = 0.05  # Skip frame if encoding takes longer than this (reduced for responsiveness)

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
    # Optimized throttle settings for higher FPS
    frame_interval_s = 0.033  # Target ~30 FPS
    json_interval_s = 0.20   # 5 Hz for JSON telemetry
    ping_interval_s = 20.0   # keepalive ping

    last_frame_sent = 0.0
    last_json_sent = 0.0
    last_ping_sent = 0.0

    # Optimized detection interval - run detection every 3 frames for better FPS
    detect_interval = 3  # Reduced detection frequency for higher FPS
    frame_index = 0
    cached_results = []
    cached_driver_lane_hazard_count = 0
    cached_hazard_distances = []
    cached_mode = "live"
    cached_vis_frame = None  # Cache the last processed frame

    try:
        while True:
            loop_start = time.time()
            current_mode = get_current_mode()
            
            # Initialize frame to None at start of each loop
            frame = None

            # Get the latest frame based on current mode, dropping stale frames
            if current_mode == "video":
                # Get the most recent frame from video queue (drop older ones)
                while not video_file_manager.frame_queue.empty():
                    frame = video_file_manager.frame_queue.get()
            else:
                # Get the most recent frame from camera queue (drop older ones)
                if camera_manager.camera_available:
                    while not camera_manager.frame_queue.empty():
                        frame = camera_manager.frame_queue.get()

            now = asyncio.get_event_loop().time()

            # Only process and send a frame at the configured interval
            if frame is not None and (now - last_frame_sent) >= frame_interval_s:
                frame_index += 1

                # Decide whether to run detection on this frame
                run_detection = (frame_index % detect_interval) == 0

                if run_detection:
                    # Run detection and cache results
                    results, driver_lane_hazard_count, vis_frame, hazard_distances = process_frame_with_models(frame)
                    cached_results = results
                    cached_driver_lane_hazard_count = driver_lane_hazard_count
                    cached_hazard_distances = hazard_distances
                    cached_mode = current_mode
                    cached_vis_frame = vis_frame.copy() if vis_frame is not None else None
                else:
                    # Use cached results and frame for faster processing
                    vis_frame = cached_vis_frame if cached_vis_frame is not None else frame
                    results = cached_results
                    driver_lane_hazard_count = cached_driver_lane_hazard_count
                    hazard_distances = cached_hazard_distances
                    current_mode = cached_mode
                
                try:
                    # Optimized frame processing - only resize if needed
                    max_width = 960  # Increased for better quality while maintaining performance
                    if vis_frame.shape[1] > max_width:
                        ratio = max_width / float(vis_frame.shape[1])
                        new_size = (int(vis_frame.shape[1] * ratio), int(vis_frame.shape[0] * ratio))
                        vis_frame = cv2.resize(vis_frame, new_size, interpolation=cv2.INTER_LINEAR)  # Faster than INTER_AREA

                    # JPEG compress with optimized quality
                    jpeg_bytes = encode_jpeg_bgr(vis_frame, quality=JPEG_QUALITY)
                    send_start = asyncio.get_event_loop().time()
                    await websocket.send_bytes(jpeg_bytes)
                    last_frame_sent = now
                    
                    # Adaptive frame pacing based on send time - more aggressive optimization
                    send_time = asyncio.get_event_loop().time() - send_start
                    if send_time > 0.05:  # Reduced threshold for faster adaptation
                        frame_interval_s = min(0.10, frame_interval_s + 0.01)  # Faster backoff
                    elif send_time < 0.015:  # If very fast, can increase FPS
                        frame_interval_s = max(0.02, frame_interval_s - 0.002)  # More aggressive increase
                except Exception:
                    # If sending fails (client closed/slow), break the loop to close socket
                    break

                # Send compact JSON telemetry at its own cadence
                if (now - last_json_sent) >= json_interval_s:
                    total_hazard_count = len(results)
                    pothole_detected = any(detection.get('type', '').lower() == 'pothole' for detection in results)
                    video_progress = None
                    if current_mode == "video" and video_file_manager.is_active():
                        video_progress = video_file_manager.get_progress()

                    try:
                        await websocket.send_json({
                            "hazard_count": total_hazard_count,
                            "driver_lane_hazard_count": driver_lane_hazard_count,
                            "hazard_distances": hazard_distances,
                            "hazard_type": "pothole" if pothole_detected else "",
                            "mode": current_mode,
                            "video_progress": video_progress
                        })
                        last_json_sent = now
                    except Exception:
                        break

            # Lightweight keepalive to avoid idle disconnects
            if (now - last_ping_sent) >= ping_interval_s:
                try:
                    await websocket.send_text("ping")
                    last_ping_sent = now
                except Exception:
                    break

            # Reduced sleep for lower latency - only yield if no frame to process
            if frame is None:
                await asyncio.sleep(0.005)  # Reduced sleep time for faster response
            # If frame exists, continue immediately without sleep

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
    """Process a frame with both YOLO models and apply optimized filtering"""
    # Get frame dimensions
    frame_height, frame_width = frame.shape[:2]
    
    # Calculate lane boundaries (middle 50%)
    left_boundary = int(frame_width * 0.25)
    right_boundary = int(frame_width * 0.75)
    
    # Optimized inference parameters
    device = MODEL_CONFIG['device'] or ("cuda" if torch.cuda.is_available() else "cpu")
    half_precision = MODEL_CONFIG['half'] and torch.cuda.is_available()
    
    # Process with road hazard model (potholes and speedbumps) - optimized
    road_results = road_model.predict(
        frame,
        imgsz=INFERENCE_CONFIG['imgsz'],
        conf=NMS_CONFIG['conf_threshold'],  # Lower base conf, we'll filter later
        iou=NMS_CONFIG['iou_threshold'],     # Optimized IoU for NMS
        max_det=NMS_CONFIG['max_detections'],
        agnostic_nms=NMS_CONFIG['agnostic_nms'],
        device=device,
        half=half_precision,
        augment=INFERENCE_CONFIG['augment'],
        verbose=False
    )
    
    # Process with standard model (people, animals, vehicles) - optimized
    standard_results = standard_model.predict(
        frame,
        imgsz=INFERENCE_CONFIG['imgsz'],
        conf=NMS_CONFIG['conf_threshold'],
        iou=NMS_CONFIG['iou_threshold'],
        max_det=NMS_CONFIG['max_detections'],
        agnostic_nms=NMS_CONFIG['agnostic_nms'],
        device=device,
        half=half_precision,
        augment=INFERENCE_CONFIG['augment'],
        verbose=False
    )

    # Apply threshold filtering using values from config
    filtered_road_results = []
    filtered_standard_results = []
    driver_lane_hazards = []  # Hazards in the middle 50% (driver's lane)
    hazard_distances = []  # Store distances of detected hazards
    all_filtered_results = []
    
    # Process road hazards (potholes, speedbumps) with improved filtering
    if len(road_results[0].boxes.data) > 0:
        for r in road_results[0].boxes.data:
            x1, y1, x2, y2, conf, cls = r.tolist()
            cls_int = int(cls)
            threshold_key = f"class_{cls_int}"
            
            # Get class name from road hazard model
            class_name = road_model.names[cls_int] if cls_int in road_model.names else f"class_{cls_int}"
            
            # Apply class-specific threshold with confidence calibration
            threshold = DETECTION_THRESHOLDS.get(threshold_key, NMS_CONFIG['conf_threshold'])
            
            # Additional filtering: minimum box size to reduce false positives
            box_width = x2 - x1
            box_height = y2 - y1
            min_box_size = min(frame_width, frame_height) * 0.01  # At least 1% of frame
            
            if (conf >= threshold and 
                box_width >= min_box_size and 
                box_height >= min_box_size):
                filtered_road_results.append(r.unsqueeze(0))
                all_filtered_results.append({
                    'box': [x1, y1, x2, y2],
                    'conf': conf,
                    'cls': cls_int,
                    'class_name': class_name,
                    'model': 'road',
                    'type': class_name
                })
                
                # Check if hazard is in driver's lane (middle 50%)
                box_center_x = (x1 + x2) / 2
                if left_boundary <= box_center_x <= right_boundary:
                    driver_lane_hazards.append(r.unsqueeze(0))
    
    # Process standard objects (people, animals, vehicles) with improved filtering
    if len(standard_results[0].boxes.data) > 0:
        for r in standard_results[0].boxes.data:
            x1, y1, x2, y2, conf, cls = r.tolist()
            cls_int = int(cls)
            
            # Get class name from standard model
            class_name = standard_model.names[cls_int] if cls_int in standard_model.names else f"class_{cls_int}"
            
            # Apply class-specific threshold
            threshold = DETECTION_THRESHOLDS.get(class_name, NMS_CONFIG['conf_threshold'])
            
            # Additional filtering: minimum box size and aspect ratio validation
            box_width = x2 - x1
            box_height = y2 - y1
            min_box_size = min(frame_width, frame_height) * 0.01  # At least 1% of frame
            aspect_ratio = box_height / box_width if box_width > 0 else 0
            
            # Validate aspect ratios for different object types
            valid_aspect = True
            if class_name == 'person' and (aspect_ratio < 0.3 or aspect_ratio > 3.0):
                valid_aspect = False  # People should be roughly vertical
            elif class_name in ['dog', 'cow'] and (aspect_ratio < 0.5 or aspect_ratio > 2.0):
                valid_aspect = False  # Animals have more varied but reasonable ratios
            
            # Only process people, dogs, and cows with optimized thresholds
            if (class_name in ['person', 'dog', 'cow'] and 
                conf >= threshold and 
                box_width >= min_box_size and 
                box_height >= min_box_size and
                valid_aspect):
                filtered_standard_results.append(r.unsqueeze(0))
                all_filtered_results.append({
                    'box': [x1, y1, x2, y2],
                    'conf': conf,
                    'cls': cls_int,
                    'class_name': class_name,
                    'model': 'standard'
                })
                
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
                    'inDriverLane': is_in_driver_lane,
                    'confidence': conf  # Add confidence to distance info
                })
                
                if is_in_driver_lane:
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