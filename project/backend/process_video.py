#!/usr/bin/env python3
"""
Standalone video processing script
Takes a video file, processes it through YOLO models, and outputs detection results.

Usage:
    python process_video.py <video_path> [--output <output_path>] [--json <json_path>] [--annotated]
    
Examples:
    python process_video.py video.mp4
    python process_video.py video.mp4 --output annotated_video.mp4 --json results.json
    python process_video.py video.mp4 --annotated
"""

import cv2
import argparse
import json
import sys
import os
from pathlib import Path
from datetime import datetime
import torch
from tqdm import tqdm

# Add the backend directory to the path so we can import modules
sys.path.insert(0, str(Path(__file__).parent))

from model_loader import road_model, standard_model, MODEL_CONFIG
from config import DETECTION_THRESHOLDS, NMS_CONFIG, INFERENCE_CONFIG
from distance_estimator import DistanceEstimator

# Initialize distance estimator
distance_estimator = DistanceEstimator()

def process_frame(frame):
    """Process a single frame and return detection results"""
    # Get frame dimensions
    frame_height, frame_width = frame.shape[:2]
    
    # Calculate lane boundaries (middle 50%)
    left_boundary = int(frame_width * 0.25)
    right_boundary = int(frame_width * 0.75)
    
    # Optimized inference parameters
    device = MODEL_CONFIG['device'] or ("cuda" if torch.cuda.is_available() else "cpu")
    half_precision = MODEL_CONFIG['half'] and torch.cuda.is_available()
    
    # Process with road hazard model (potholes and speedbumps)
    road_results = road_model.predict(
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
    
    # Process with standard model (people, animals, vehicles)
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

    # Process results
    all_detections = []
    driver_lane_hazards = []
    hazard_distances = []
    
    # Process road hazards (potholes, speedbumps)
    if len(road_results[0].boxes.data) > 0:
        for r in road_results[0].boxes.data:
            x1, y1, x2, y2, conf, cls = r.tolist()
            cls_int = int(cls)
            threshold_key = f"class_{cls_int}"
            
            # Get class name from road hazard model
            class_name = road_model.names[cls_int] if cls_int in road_model.names else f"class_{cls_int}"
            
            # Apply class-specific threshold
            threshold = DETECTION_THRESHOLDS.get(threshold_key, NMS_CONFIG['conf_threshold'])
            
            # Additional filtering: minimum box size
            box_width = x2 - x1
            box_height = y2 - y1
            min_box_size = min(frame_width, frame_height) * 0.01
            
            if (conf >= threshold and 
                box_width >= min_box_size and 
                box_height >= min_box_size):
                
                box_center_x = (x1 + x2) / 2
                is_in_driver_lane = left_boundary <= box_center_x <= right_boundary
                
                detection = {
                    'type': class_name,
                    'class_id': cls_int,
                    'confidence': float(conf),
                    'bbox': {
                        'x1': float(x1),
                        'y1': float(y1),
                        'x2': float(x2),
                        'y2': float(y2),
                        'width': float(box_width),
                        'height': float(box_height)
                    },
                    'model': 'road_hazard',
                    'in_driver_lane': is_in_driver_lane
                }
                all_detections.append(detection)
                
                if is_in_driver_lane:
                    driver_lane_hazards.append(detection)
    
    # Process standard objects (people, animals, vehicles)
    if len(standard_results[0].boxes.data) > 0:
        for r in standard_results[0].boxes.data:
            x1, y1, x2, y2, conf, cls = r.tolist()
            cls_int = int(cls)
            
            # Get class name from standard model
            class_name = standard_model.names[cls_int] if cls_int in standard_model.names else f"class_{cls_int}"
            
            # Apply class-specific threshold
            threshold = DETECTION_THRESHOLDS.get(class_name, NMS_CONFIG['conf_threshold'])
            
            # Additional filtering
            box_width = x2 - x1
            box_height = y2 - y1
            min_box_size = min(frame_width, frame_height) * 0.01
            aspect_ratio = box_height / box_width if box_width > 0 else 0
            
            # Validate aspect ratios
            valid_aspect = True
            if class_name == 'person' and (aspect_ratio < 0.3 or aspect_ratio > 3.0):
                valid_aspect = False
            elif class_name in ['dog', 'cow'] and (aspect_ratio < 0.5 or aspect_ratio > 2.0):
                valid_aspect = False
            
            # Only process people, dogs, and cows
            if (class_name in ['person', 'dog', 'cow'] and 
                conf >= threshold and 
                box_width >= min_box_size and 
                box_height >= min_box_size and
                valid_aspect):
                
                # Calculate distance
                distance = distance_estimator.estimate_distance(class_name, box_width, frame_width)
                
                box_center_x = (x1 + x2) / 2
                is_in_driver_lane = left_boundary <= box_center_x <= right_boundary
                
                detection = {
                    'type': class_name,
                    'class_id': cls_int,
                    'confidence': float(conf),
                    'bbox': {
                        'x1': float(x1),
                        'y1': float(y1),
                        'x2': float(x2),
                        'y2': float(y2),
                        'width': float(box_width),
                        'height': float(box_height)
                    },
                    'model': 'standard',
                    'distance_meters': float(distance),
                    'in_driver_lane': is_in_driver_lane
                }
                all_detections.append(detection)
                
                hazard_distances.append({
                    'class': class_name,
                    'distance': float(distance),
                    'bbox': [float(x1), float(y1), float(x2), float(y2)],
                    'inDriverLane': is_in_driver_lane,
                    'confidence': float(conf)
                })
                
                if is_in_driver_lane:
                    driver_lane_hazards.append(detection)
    
    return {
        'detections': all_detections,
        'total_detections': len(all_detections),
        'driver_lane_hazards': len(driver_lane_hazards),
        'hazard_distances': hazard_distances
    }

def draw_detections(frame, detections):
    """Draw bounding boxes and labels on frame"""
    vis_frame = frame.copy()
    
    for det in detections:
        bbox = det['bbox']
        x1, y1, x2, y2 = int(bbox['x1']), int(bbox['y1']), int(bbox['x2']), int(bbox['y2'])
        class_name = det['type']
        conf = det['confidence']
        
        # Different colors for different models
        if det['model'] == 'road_hazard':
            color = (0, 165, 255)  # Orange for road hazards (BGR)
        else:
            color = (255, 255, 0)  # Cyan for standard objects (BGR)
        
        # Draw bounding box
        cv2.rectangle(vis_frame, (x1, y1), (x2, y2), color, 2)
        
        # Draw label with confidence
        label = f"{class_name} {conf:.2f}"
        if 'distance_meters' in det:
            label += f" ({det['distance_meters']:.1f}m)"
        
        cv2.putText(vis_frame, label, (x1, y1 - 10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    
    return vis_frame

def process_video(video_path, output_path=None, json_path=None, save_annotated=False):
    """Process video file and generate results"""
    
    # Check if video file exists
    if not os.path.exists(video_path):
        print(f"❌ Error: Video file not found: {video_path}")
        return False
    
    print(f"📹 Processing video: {video_path}")
    
    # Open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ Error: Could not open video file: {video_path}")
        return False
    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    
    print(f"   Resolution: {width}x{height}")
    print(f"   FPS: {fps:.2f}")
    print(f"   Total frames: {total_frames}")
    print(f"   Duration: {duration:.2f} seconds")
    print()
    
    # Initialize output video writer if needed
    out_writer = None
    if save_annotated:
        if output_path is None:
            # Generate output filename
            input_path = Path(video_path)
            output_path = input_path.parent / f"{input_path.stem}_annotated{input_path.suffix}"
        
        # Convert to absolute path for clarity
        output_path = Path(output_path).resolve()
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out_writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        print(f"📝 Saving annotated video to: {output_path}")
    
    # Process frames
    all_results = []
    frame_number = 0
    
    print("🔄 Processing frames...")
    with tqdm(total=total_frames, desc="Progress") as pbar:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_number += 1
            timestamp = frame_number / fps if fps > 0 else 0
            
            # Process frame
            result = process_frame(frame)
            result['frame_number'] = frame_number
            result['timestamp'] = timestamp
            all_results.append(result)
            
            # Draw detections if saving annotated video
            if save_annotated and out_writer:
                annotated_frame = draw_detections(frame, result['detections'])
                out_writer.write(annotated_frame)
            
            pbar.update(1)
    
    cap.release()
    if out_writer:
        out_writer.release()
    
    # Calculate summary statistics
    total_detections = sum(r['total_detections'] for r in all_results)
    total_driver_lane_hazard_count = sum(r['driver_lane_hazards'] for r in all_results)
    
    # Group detections by type
    detection_counts = {}
    for result in all_results:
        for det in result['detections']:
            det_type = det['type']
            detection_counts[det_type] = detection_counts.get(det_type, 0) + 1
    
    # Create summary
    summary = {
        'video_file': video_path,
        'video_properties': {
            'fps': float(fps),
            'width': width,
            'height': height,
            'total_frames': total_frames,
            'duration_seconds': float(duration)
        },
        'processing_date': datetime.now().isoformat(),
        'summary': {
            'total_frames_processed': frame_number,
            'total_detections': total_detections,
            'total_driver_lane_hazards': total_driver_lane_hazard_count,
            'detections_by_type': detection_counts,
            'average_detections_per_frame': total_detections / frame_number if frame_number > 0 else 0
        },
        'frame_results': all_results
    }
    
    # Save JSON results
    if json_path is None:
        input_path = Path(video_path)
        json_path = input_path.parent / f"{input_path.stem}_results.json"
    
    # Convert to absolute path for clarity
    json_path = Path(json_path).resolve()
    
    print(f"\n💾 Saving results to: {json_path}")
    with open(json_path, 'w') as f:
        json.dump(summary, f, indent=2)
    
    # Print summary
    print("\n" + "="*60)
    print("📊 PROCESSING SUMMARY")
    print("="*60)
    print(f"Total frames processed: {frame_number}")
    print(f"Total detections: {total_detections}")
    print(f"Driver lane hazards: {total_driver_lane_hazard_count}")
    print(f"Average detections per frame: {total_detections / frame_number if frame_number > 0 else 0:.2f}")
    print("\nDetections by type:")
    for det_type, count in sorted(detection_counts.items()):
        print(f"  - {det_type}: {count}")
    print("="*60)
    
    if save_annotated:
        print(f"\n✅ Annotated video saved to: {output_path}")
    print(f"✅ Results saved to: {json_path}")
    
    return True

def main():
    parser = argparse.ArgumentParser(
        description='Process video through YOLO models and generate detection results',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python process_video.py video.mp4
  python process_video.py video.mp4 --output annotated.mp4 --json results.json
  python process_video.py video.mp4 --annotated
        """
    )
    
    parser.add_argument('video_path', type=str, help='Path to input video file')
    parser.add_argument('--output', '-o', type=str, help='Path for annotated output video (optional)')
    parser.add_argument('--json', '-j', type=str, help='Path for JSON results file (optional)')
    parser.add_argument('--annotated', '-a', action='store_true', 
                       help='Save annotated video with bounding boxes drawn')
    
    args = parser.parse_args()
    
    # Check if models are loaded
    try:
        print("🔧 Loading models...")
        print(f"   Device: {MODEL_CONFIG['device']}")
        print("✅ Models loaded successfully\n")
    except Exception as e:
        print(f"❌ Error loading models: {e}")
        return 1
    
    # Process video
    success = process_video(
        args.video_path,
        output_path=args.output,
        json_path=args.json,
        save_annotated=args.annotated
    )
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())

