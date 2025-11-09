import cv2
import threading
import queue
import os
import time
from pathlib import Path

class VideoFileManager:
    def __init__(self):
        self.video_path = None
        self.frame_queue = queue.Queue(maxsize=5)  # Larger buffer for smoother playback
        self.running = False
        self.thread = None
        self.cap = None
        self.fps = 30  # Default FPS
        self.total_frames = 0
        self.current_frame = 0
        self.uploads_dir = Path(__file__).parent / "uploads"
        self.uploads_dir.mkdir(exist_ok=True)
        self.last_frame_time = 0
        self.frame_times = []  # Track frame timing for smooth playback
    
    def load_video(self, video_path: str):
        """Load a video file for processing"""
        if self.running:
            self.stop_processing()
        
        self.video_path = video_path
        return True
    
    def start_processing(self):
        """Start processing the loaded video file"""
        if not self.video_path or not os.path.exists(self.video_path):
            raise ValueError("No video file loaded or file doesn't exist")
        
        if self.thread and self.thread.is_alive():
            self.stop_processing()
        
        self.running = True
        self.current_frame = 0
        self.thread = threading.Thread(target=self._process_frames, daemon=True)
        self.thread.start()
    
    def stop_processing(self):
        """Stop video processing"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2.0)
        if self.cap and self.cap.isOpened():
            self.cap.release()
        # Clear frame queue
        while not self.frame_queue.empty():
            try:
                self.frame_queue.get_nowait()
            except queue.Empty:
                break
    
    def _process_frames(self):
        """Process frames from video file - optimized for smooth native playback"""
        self.cap = cv2.VideoCapture(self.video_path)
        if not self.cap.isOpened():
            print(f"Error: Could not open video file {self.video_path}")
            self.running = False
            return
        
        # Get video properties - use native FPS for smooth playback
        original_fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.fps = original_fps  # Use native FPS, don't cap it
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        print(f"📹 Video loaded: {self.total_frames} frames @ {self.fps:.2f} FPS")
        
        # Optimize video capture settings for smooth playback
        try:
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)  # Small buffer for smooth playback
        except:
            pass
        
        # Calculate frame timing - use native video FPS
        frame_delay = 1.0 / self.fps if self.fps > 0 else 0.033
        self.last_frame_time = time.time()
        self.frame_times = []
        
        while self.running:
            frame_start = time.time()
            
            # Read frame at native rate - no frame skipping
            ret, frame = self.cap.read()
            if not ret:
                # End of video or error - loop back to start
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                self.current_frame = 0
                self.last_frame_time = time.time()
                self.frame_times = []  # Reset timing
                continue
            
            self.current_frame += 1
            
            # Pre-resize frame for faster processing (only if very large)
            if frame.shape[1] > 1920:
                ratio = 1920 / float(frame.shape[1])
                new_size = (int(frame.shape[1] * ratio), int(frame.shape[0] * ratio))
                frame = cv2.resize(frame, new_size, interpolation=cv2.INTER_LINEAR)
            
            # Manage queue - keep a small buffer for smooth playback (don't drop frames aggressively)
            # Only drop if queue is getting too full
            if self.frame_queue.qsize() >= 4:
                try:
                    self.frame_queue.get_nowait()  # Drop oldest frame only if queue is full
                except queue.Empty:
                    pass
            
            # Non-blocking put - queue frames for smooth playback
            try:
                self.frame_queue.put_nowait(frame)
            except queue.Full:
                # Queue full, drop oldest and add new
                try:
                    self.frame_queue.get_nowait()
                    self.frame_queue.put_nowait(frame)
                except queue.Empty:
                    pass
            
            # Precise timing control - maintain native video FPS
            elapsed = time.time() - frame_start
            sleep_time = frame_delay - elapsed
            
            # Track frame timing for smooth playback
            self.frame_times.append(time.time())
            if len(self.frame_times) > 30:
                self.frame_times.pop(0)
            
            # Sleep to maintain native FPS (smooth playback)
            if sleep_time > 0.0001:  # Only sleep if there's meaningful time left
                time.sleep(sleep_time)
            # If reading is slow, continue immediately (maintains real-time playback)
    
    def get_progress(self):
        """Get current playback progress"""
        if self.total_frames == 0:
            return 0.0
        return (self.current_frame / self.total_frames) * 100.0
    
    def is_active(self):
        """Check if video processing is active"""
        return self.running and self.video_path is not None
    
    def cleanup_file(self):
        """Remove the uploaded video file"""
        if self.video_path and os.path.exists(self.video_path):
            try:
                os.remove(self.video_path)
                self.video_path = None
            except Exception as e:
                print(f"Error cleaning up video file: {e}")

# Create a global instance
video_file_manager = VideoFileManager()

