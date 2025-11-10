# Video Processing Script

A standalone script to process videos through YOLO models and generate detection results.

## Features

- ✅ Processes video files through both YOLO models (road hazards + standard objects)
- ✅ Generates detailed JSON results with all detections
- ✅ Optional annotated video output with bounding boxes
- ✅ Progress bar and summary statistics
- ✅ Distance estimation for detected objects
- ✅ Driver lane hazard detection

## Installation

Make sure you have the required dependencies:

```bash
pip install opencv-python tqdm
```

## Usage

### Basic Usage (JSON output only)

```bash
cd project/backend
python process_video.py video.mp4
```

This will:
- Process the video through the models
- Generate a JSON file with all detection results (saved as `video_results.json`)

### Save Annotated Video

```bash
python process_video.py video.mp4 --annotated
```

This will:
- Process the video
- Save an annotated video with bounding boxes drawn (`video_annotated.mp4`)
- Generate JSON results

### Custom Output Paths

```bash
python process_video.py video.mp4 --output annotated_output.mp4 --json results.json
```

### Full Example

```bash
python process_video.py /path/to/your/video.mp4 --annotated --output /path/to/output/annotated.mp4 --json /path/to/output/results.json
```

## Output Format

### JSON Results Structure

```json
{
  "video_file": "video.mp4",
  "video_properties": {
    "fps": 30.0,
    "width": 1920,
    "height": 1080,
    "total_frames": 900,
    "duration_seconds": 30.0
  },
  "processing_date": "2024-01-01T12:00:00",
  "summary": {
    "total_frames_processed": 900,
    "total_detections": 150,
    "total_driver_lane_hazards": 45,
    "detections_by_type": {
      "pothole": 80,
      "person": 50,
      "dog": 20
    },
    "average_detections_per_frame": 0.17
  },
  "frame_results": [
    {
      "frame_number": 1,
      "timestamp": 0.033,
      "total_detections": 2,
      "driver_lane_hazards": 1,
      "detections": [
        {
          "type": "pothole",
          "class_id": 0,
          "confidence": 0.85,
          "bbox": {
            "x1": 100.5,
            "y1": 200.3,
            "x2": 150.2,
            "y2": 250.1,
            "width": 49.7,
            "height": 49.8
          },
          "model": "road_hazard",
          "in_driver_lane": true
        }
      ],
      "hazard_distances": []
    }
  ]
}
```

## Detection Types

### Road Hazards (from yolov12.pt)
- **Pothole** (class_0)
- **Speedbump** (class_1)

### Standard Objects (from yolov8n.pt)
- **Person**
- **Dog**
- **Cow**

Each detection includes:
- Bounding box coordinates
- Confidence score
- Distance estimation (for standard objects)
- Driver lane status (whether it's in the middle 50% of the frame)

## Command Line Options

```
positional arguments:
  video_path            Path to input video file

optional arguments:
  -h, --help           Show help message
  --output, -o         Path for annotated output video
  --json, -j           Path for JSON results file
  --annotated, -a      Save annotated video with bounding boxes
```

## Notes

- The script uses the same models and configuration as the main application
- Processing time depends on video length and hardware (GPU recommended)
- Annotated videos use the same codec as the input video
- JSON files can be large for long videos - consider processing in chunks if needed

