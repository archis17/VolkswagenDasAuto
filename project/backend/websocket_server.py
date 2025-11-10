import asyncio
import cv2
import torch
import numpy as np
import time
import json
import queue
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
from mqtt_client import mqtt_client
from geofence_service import geofence_service

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

# WebSocket configuration - optimized for higher FPS and smoother playback
TARGET_FPS = 60  # Target 60 FPS for smooth video
FRAME_INTERVAL = 1.0 / TARGET_FPS  # ~0.0167 seconds
JPEG_QUALITY = 60  # Reduced for faster encoding and smoother streaming
MAX_QUEUE_SIZE = 1  # Reduced queue for lower latency
FRAME_SKIP_THRESHOLD = 0.05  # Skip frame if encoding takes longer than this

def get_current_mode():
    """Get the current detection mode"""
    return mode_state.detection_mode

# Global cache variables for detection results
cached_results = []
cached_driver_lane_hazard_count = 0
cached_hazard_distances = []
cached_mode = "live"
cached_vis_frame = None

async def _handle_detection_result(detection_task, frame_index, current_mode, current_gps_location):
    """Handle detection result asynchronously"""
    global cached_results, cached_driver_lane_hazard_count, cached_hazard_distances, cached_mode, cached_vis_frame
    try:
        results, driver_lane_hazard_count, vis_frame, hazard_distances = await detection_task
        # Update cached results
        cached_results = results
        cached_driver_lane_hazard_count = driver_lane_hazard_count
        cached_hazard_distances = hazard_distances
        cached_mode = current_mode
        cached_vis_frame = vis_frame.copy() if vis_frame is not None else None
        
        # Store detections in database and publish to MQTT (non-blocking)
        if results:  # Only store if we have detections
            asyncio.create_task(store_and_publish_detections(
                results=results,
                driver_lane_hazard_count=driver_lane_hazard_count,
                hazard_distances=hazard_distances,
                gps_location=current_gps_location,
                frame_number=frame_index,
                current_mode=current_mode
            ))
    except Exception as e:
        print(f"Error in detection handling: {e}")

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
    global cached_results, cached_driver_lane_hazard_count, cached_hazard_distances, cached_mode, cached_vis_frame
    await websocket.accept()
    # Dynamic throttle settings - adapt to video FPS
    frame_interval_s = 0.0167  # Default ~60 FPS, will adapt to video FPS
    json_interval_s = 0.20   # 5 Hz for JSON telemetry
    ping_interval_s = 20.0   # keepalive ping

    last_frame_sent = 0.0
    last_json_sent = 0.0
    last_ping_sent = 0.0

    # Optimized detection interval - run detection every 15 frames for smoother streaming
    detect_interval = 15  # Detection frequency
    frame_index = 0
    video_fps = None  # Will be set based on video file
    # Use global cache variables
    
    # GPS location tracking (updated from client messages)
    current_gps_location: Optional[Dict[str, float]] = None
    
    # Task to receive messages from client (GPS updates)
    async def receive_messages():
        """Receive messages from client (GPS updates)"""
        nonlocal current_gps_location
        try:
            while True:
                try:
                    # Wait for message with timeout
                    message = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    try:
                        data = json.loads(message)
                        if 'gps' in data:
                            gps_data = data['gps']
                            if isinstance(gps_data, dict) and 'lat' in gps_data and 'lng' in gps_data:
                                current_gps_location = {
                                    'lat': float(gps_data['lat']),
                                    'lng': float(gps_data['lng'])
                                }
                    except (json.JSONDecodeError, KeyError, ValueError) as e:
                        # Ignore invalid messages
                        pass
                except asyncio.TimeoutError:
                    # Timeout is expected, continue loop
                    continue
                except Exception:
                    # Connection closed or error
                    break
        except Exception:
            pass
    
    # Start receiving messages task
    receive_task = asyncio.create_task(receive_messages())

    try:
        while True:
            loop_start = time.time()
            current_mode = get_current_mode()
            
            # Initialize frame to None at start of each loop
            frame = None

            # Get the latest frame based on current mode
            if current_mode == "video":
                # For video mode, adapt frame interval to video FPS for smooth playback
                if video_fps is None:
                    video_fps = video_file_manager.fps
                    if video_fps > 0:
                        frame_interval_s = 1.0 / video_fps
                        print(f"🎬 Video FPS detected: {video_fps:.2f}, frame interval: {frame_interval_s:.4f}s")
                
                # Get frame from queue (don't drop all - allow some buffering for smooth playback)
                if not video_file_manager.frame_queue.empty():
                    # Get the latest frame, but keep some in queue for smooth playback
                    frames_to_drop = max(0, video_file_manager.frame_queue.qsize() - 2)
                    for _ in range(frames_to_drop):
                        try:
                            video_file_manager.frame_queue.get_nowait()
                        except queue.Empty:
                            break
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

                # Start detection in background if needed (non-blocking)
                if run_detection:
                    # Run detection in executor without blocking frame sending
                    loop = asyncio.get_event_loop()
                    detection_task = loop.run_in_executor(
                        executor, process_frame_with_models, frame
                    )
                    # Don't await - let it run in background
                    asyncio.create_task(_handle_detection_result(
                        detection_task, frame_index, current_mode, current_gps_location
                    ))

                # Use cached frame/results for immediate sending (don't wait for detection)
                vis_frame = cached_vis_frame if cached_vis_frame is not None else frame
                results = cached_results if cached_results else []
                driver_lane_hazard_count = cached_driver_lane_hazard_count
                hazard_distances = cached_hazard_distances if cached_hazard_distances else []
                
                try:
                    # Ensure we have a valid frame
                    if vis_frame is None:
                        vis_frame = frame
                    
                    if vis_frame is None or len(vis_frame.shape) < 2:
                        continue  # Skip if no valid frame
                    
                    # Optimized frame processing - resize for faster encoding/transmission
                    # Use higher resolution for video mode to maintain quality
                    max_width = 1280 if current_mode == "video" else 960
                    if vis_frame.shape[1] > max_width:
                        ratio = max_width / float(vis_frame.shape[1])
                        new_size = (int(vis_frame.shape[1] * ratio), int(vis_frame.shape[0] * ratio))
                        # Use INTER_LINEAR for better quality in video mode
                        interpolation = cv2.INTER_LINEAR if current_mode == "video" else cv2.INTER_NEAREST
                        vis_frame = cv2.resize(vis_frame, new_size, interpolation=interpolation)

                    # JPEG compress with optimized quality (using TurboJPEG if available)
                    # Run encoding in executor to avoid blocking
                    loop = asyncio.get_event_loop()
                    jpeg_bytes = await loop.run_in_executor(
                        executor, encode_jpeg_bgr, vis_frame, JPEG_QUALITY
                    )
                    
                    send_start = asyncio.get_event_loop().time()
                    await websocket.send_bytes(jpeg_bytes)
                    last_frame_sent = now
                    
                    # Adaptive frame pacing - only adjust for live mode, keep video at native FPS
                    if current_mode != "video":
                        send_time = asyncio.get_event_loop().time() - send_start
                        if send_time > 0.025:  # If sending takes too long, reduce FPS
                            frame_interval_s = min(0.05, frame_interval_s + 0.003)  # Increase interval (lower FPS)
                        elif send_time < 0.008:  # If very fast, can increase FPS
                            frame_interval_s = max(0.014, frame_interval_s - 0.0005)  # Decrease interval (higher FPS)
                    # For video mode, keep frame_interval_s at native video FPS (don't adjust)
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

            # Minimal sleep for lower latency - optimized for smooth streaming
            if frame is None:
                await asyncio.sleep(0.002)  # Small sleep when no frame
            # If we have a frame, continue immediately (no sleep for maximum throughput)

    except WebSocketDisconnect:
        print(f"Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
    finally:
        # Cancel receive task
        if 'receive_task' in locals():
            receive_task.cancel()
            try:
                await receive_task
            except Exception:
                pass
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


async def store_and_publish_detections(
    results: list,
    driver_lane_hazard_count: int,
    hazard_distances: list,
    gps_location: Optional[Dict[str, float]],
    frame_number: int,
    current_mode: str
):
    """
    Store detections in database, publish to MQTT, and broadcast to geofences
    """
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
                    validated_gps = {'lat': lng, 'lng': lat}
                else:
                    validated_gps = None
            else:
                validated_gps = gps_location
        
        detection_ids = []
        
        # Store each detection
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
            
            # Store detection in database
            detection_id = await neon_db.insert_hazard_detection(
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
            
            if detection_id:
                detection_ids.append({
                    'id': detection_id,
                    'detection': detection,
                    'location': validated_gps,
                    'confidence': confidence,
                    'hazard_type': hazard_type,
                    'distance': distance,
                    'driver_lane': is_driver_lane
                })
        
        # Publish to MQTT and broadcast to geofences for each stored detection
        for det_data in detection_ids:
            detection_id = det_data['id']
            hazard_type = det_data['hazard_type']
            location = det_data['location']
            confidence = det_data['confidence']
            
            # Publish to MQTT
            if mqtt_client.is_connected() or await mqtt_client.ensure_connected():
                await mqtt_client.publish_detection(
                    detection_id=detection_id,
                    hazard_type=hazard_type,
                    location=location,
                    confidence=confidence,
                    timestamp=datetime.now()
                )
            
            # Broadcast to geofences if location is available
            if location:
                await geofence_service.broadcast_to_geofence(
                    detection_id=detection_id,
                    hazard_type=hazard_type,
                    location=location,
                    additional_data={
                        "confidence": confidence,
                        "driver_lane": det_data['driver_lane'],
                        "distance_meters": det_data['distance']
                    }
                )
                
    except Exception as e:
        # Don't fail the entire process if storage/publishing fails
        import traceback
        print(f"Error in store_and_publish_detections: {e}")
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