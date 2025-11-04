import cv2
import threading
import queue
import time

class CameraManager:
    def __init__(self):
        self.active_camera = None
        self.frame_queue = queue.Queue(maxsize=1)
        self.running = False
        self.thread = None
        self.cap = None
        self.camera_available = False
        self.target_fps = 15  # capture pacing to reduce CPU and latency
        
    def _find_available_camera(self):
        """Try to find an available camera"""
        # Try camera indices 0, 1, 2
        for idx in [0, 1, 2]:
            try:
                cap = cv2.VideoCapture(idx)
                if cap.isOpened():
                    ret, _ = cap.read()
                    if ret:
                        cap.release()
                        return idx
                    cap.release()
            except:
                continue
        return None

    def start_stream(self):
        if self.thread and self.thread.is_alive():
            self.stop_stream()
        
        # Find available camera
        if self.active_camera is None:
            self.active_camera = self._find_available_camera()
        
        if self.active_camera is None:
            print("Warning: No camera found. Live camera mode will not work.")
            print("You can still use video file upload mode.")
            self.camera_available = False
            return
        
        self.camera_available = True
        self.running = True
        self.thread = threading.Thread(target=self._capture_frames, daemon=True)
        self.thread.start()

    def stop_stream(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2.0)
        if self.cap and self.cap.isOpened():
            self.cap.release()
        self.cap = None
    
    def is_active(self):
        """Check if camera is active and working"""
        return self.running and self.camera_available

    def _capture_frames(self):
        reconnect_delay = 1.0
        max_reconnect_attempts = 5
        reconnect_attempts = 0
        
        while self.running:
            try:
                if self.cap is None or not self.cap.isOpened():
                    self.cap = cv2.VideoCapture(self.active_camera)
                    if not self.cap.isOpened():
                        reconnect_attempts += 1
                        if reconnect_attempts >= max_reconnect_attempts:
                            print(f"Camera {self.active_camera} not available. Stopping camera stream.")
                            self.camera_available = False
                            break
                        time.sleep(reconnect_delay)
                        continue
                    
                    # Reduce internal buffering and set capture properties where supported
                    try:
                        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    except Exception:
                        pass
                    self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                    self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                    try:
                        self.cap.set(cv2.CAP_PROP_FPS, self.target_fps)
                    except Exception:
                        pass
                    reconnect_attempts = 0
                
                # Pace capture to target FPS
                start_ts = time.time()
                ret, frame = self.cap.read()
                if not ret:
                    reconnect_attempts += 1
                    if reconnect_attempts >= max_reconnect_attempts:
                        print(f"Camera {self.active_camera} stopped responding. Stopping camera stream.")
                        self.camera_available = False
                        break
                    self.cap.release()
                    self.cap = None
                    time.sleep(reconnect_delay)
                    continue
                
                reconnect_attempts = 0
                
                if not self.frame_queue.empty():
                    try:
                        self.frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                self.frame_queue.put(frame)
                
                # Sleep remaining time to maintain target FPS
                elapsed = time.time() - start_ts
                min_interval = 1.0 / float(self.target_fps)
                if elapsed < min_interval:
                    time.sleep(min_interval - elapsed)
            except Exception as e:
                print(f"Camera error: {e}")
                time.sleep(reconnect_delay)
                reconnect_attempts += 1
                if reconnect_attempts >= max_reconnect_attempts:
                    self.camera_available = False
                    break

# Create a global instance
camera_manager = CameraManager()
