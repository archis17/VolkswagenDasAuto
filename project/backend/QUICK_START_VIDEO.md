# Quick Start: Video Processing

## Where to Put Your Video

You can place your video file **anywhere** on your computer. The script accepts any file path.

**Recommended locations:**
- `project/backend/uploads/` - If you want to keep it organized with other uploads
- Any folder on your computer - Just provide the full path

## How to Run

### Step 1: Open Terminal

Navigate to the backend directory:
```bash
cd /Users/rugvedkatkade/Desktop/VolkswagenDasAuto/project/backend
```

### Step 2: Run the Script

**Option A: Video in uploads folder**
```bash
python process_video.py uploads/your_video.mp4
```

**Option B: Video anywhere else (use full path)**
```bash
python process_video.py /path/to/your/video.mp4
```

**Option C: With annotated video output**
```bash
python process_video.py uploads/your_video.mp4 --annotated
```

## Where to Find the Output

### Default Output Location

By default, outputs are saved in the **same directory as your input video**:

- **JSON Results**: `your_video_results.json` (same folder as input video)
- **Annotated Video** (if using `--annotated`): `your_video_annotated.mp4` (same folder as input video)

### Example

If your video is at:
```
project/backend/uploads/my_video.mp4
```

The outputs will be:
```
project/backend/uploads/my_video_results.json
project/backend/uploads/my_video_annotated.mp4  (if using --annotated)
```

### Custom Output Locations

You can specify custom output paths:

```bash
python process_video.py uploads/video.mp4 \
  --output /path/to/output/annotated.mp4 \
  --json /path/to/output/results.json
```

## What You'll See

### 1. Processing Progress
The script shows a progress bar while processing:
```
📹 Processing video: uploads/video.mp4
   Resolution: 1920x1080
   FPS: 30.00
   Total frames: 900
   Duration: 30.00 seconds

🔄 Processing frames...
Progress: 100%|████████████| 900/900 [02:30<00:00,  6.00it/s]
```

### 2. Summary Statistics
After processing, you'll see:
```
============================================================
📊 PROCESSING SUMMARY
============================================================
Total frames processed: 900
Total detections: 150
Driver lane hazards: 45
Average detections per frame: 0.17

Detections by type:
  - pothole: 80
  - person: 50
  - dog: 20
============================================================

✅ Annotated video saved to: uploads/video_annotated.mp4
✅ Results saved to: uploads/video_results.json
```

## Viewing the Results

### JSON Results File
Open the `.json` file in any text editor or JSON viewer to see:
- All detections for every frame
- Bounding box coordinates
- Confidence scores
- Distance estimates
- Timestamps

### Annotated Video
Open the annotated video file (if created) to see:
- Original video with bounding boxes drawn
- Labels showing detection type and confidence
- Distance information for detected objects

## Example Commands

```bash
# Basic processing (JSON only)
python process_video.py uploads/test.mp4

# With annotated video
python process_video.py uploads/test.mp4 --annotated

# Custom output locations
python process_video.py uploads/test.mp4 \
  --annotated \
  --output ~/Desktop/annotated_test.mp4 \
  --json ~/Desktop/test_results.json
```

