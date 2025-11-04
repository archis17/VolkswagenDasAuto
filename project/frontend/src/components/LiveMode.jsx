import { useEffect, useRef, useState } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './LiveMode.css';
import axios from 'axios';
import HazardNotifier from './HazardNotifier';
import NearbyHazardNotifier from './NearbyHazardNotifier';
import EmergencyBrakeNotifier from './EmergencyBrakeNotifier';

export default function LiveMode() {
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const alertRef = useRef(null);
  const cooldownRef = useRef(null);
  const alertSoundRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hazardDetected, setHazardDetected] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [hazardDistances, setHazardDistances] = useState([]);
  const [driverLaneHazardCount, setDriverLaneHazardCount] = useState(0);
  const [detectionMode, setDetectionMode] = useState('live');
  const [videoProgress, setVideoProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Initialize alert sound
  useEffect(() => {
    alertSoundRef.current = new Audio('/alert.mp3');
    alertSoundRef.current.loop = true;
    
    return () => {
      if (alertSoundRef.current) {
        alertSoundRef.current.pause();
        alertSoundRef.current = null;
      }
    };
  }, []);

  // Get current location and send to WebSocket
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(newLocation);
          
          // Send GPS to WebSocket server if connected
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              gps: newLocation
            }));
          }
        },
        (error) => {
          console.error("Error getting location:", error);
          toast.warning("Location access is needed for hazard reporting");
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,  // Accept cached position up to 5 seconds old
          timeout: 10000
        }
      );
    } else {
      toast.warning("Geolocation is not supported by this browser");
    }
  }, []);

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Use proxy in development (Vite dev server), direct connection in production
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let wsURL;
    
    if (isDev) {
      // In dev, use the Vite proxy
      wsURL = window.location.origin.replace(/^http/, 'ws') + '/ws';
    } else {
      // In production, connect directly to backend
      wsURL = 'ws://127.0.0.1:8000/ws';
    }
    
    wsRef.current = new WebSocket(wsURL);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      
      // Send GPS location to server when WebSocket opens
      if (currentLocation) {
        wsRef.current.send(JSON.stringify({
          gps: {
            lat: currentLocation.lat,
            lng: currentLocation.lng
          }
        }));
      }
    };

    wsRef.current.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const parsedData = JSON.parse(e.data);
          const driverLaneHazardCount = parsedData.driver_lane_hazard_count;
          const hazardDistances = parsedData.hazard_distances || [];
          setHazardDetected({ type: parsedData.hazard_type });
          setDriverLaneHazardCount(driverLaneHazardCount);
          setHazardDistances(hazardDistances);
          
          // Update mode and video progress if present
          if (parsedData.mode) {
            setDetectionMode(parsedData.mode);
          }
          if (parsedData.video_progress !== undefined) {
            setVideoProgress(parsedData.video_progress);
          }
    
          if (driverLaneHazardCount > 0) {
            if (!alertRef.current) {
              alertRef.current = toast.warning(`⚠️ Road Hazard Detected in Your Lane! \n
                Reducing Speed ......
                `, {
                autoClose: false,
                closeOnClick: false,
                draggable: false,
                onOpen: () => {
                  if (alertSoundRef.current) {
                    alertSoundRef.current.play().catch(err => console.error("Error playing sound:", err));
                  }
                },
                onClose: () => {
                  if (alertSoundRef.current) {
                    alertSoundRef.current.pause();
                    alertSoundRef.current.currentTime = 0;
                  }
                }
              });
            }
            if (cooldownRef.current) {
              clearTimeout(cooldownRef.current);
              cooldownRef.current = null;
            }
          } else {
            if (!cooldownRef.current) {
              cooldownRef.current = setTimeout(() => {
                if (alertRef.current) {
                  toast.dismiss(alertRef.current);
                  alertRef.current = null;
                  if (alertSoundRef.current) {
                    alertSoundRef.current.pause();
                    alertSoundRef.current.currentTime = 0;
                  }
                }
                cooldownRef.current = null;
              }, 3000);
            }
          }
        } catch (err) {
          console.error("WebSocket JSON Error:", err);
        }
      } else if (e.data instanceof Blob) {
        const url = URL.createObjectURL(e.data);
        let processedImg = document.getElementById('processed-feed');
        if (!processedImg) {
          processedImg = document.createElement('img');
          processedImg.id = 'processed-feed';
          processedImg.className = 'processed-feed';
          videoRef.current.after(processedImg);
        }
        
        if (processedImg.src) {
          URL.revokeObjectURL(processedImg.src);
        }
        processedImg.src = url;
      }
    };

    wsRef.current.onerror = () => {
      console.error("WebSocket error. Attempting to reconnect...");
      setIsConnected(false);
    };

    wsRef.current.onclose = () => {
      console.warn("WebSocket closed. Reconnecting in 3 seconds...");
      setIsConnected(false);
      setTimeout(connectWebSocket, 3000);
    };
  };

  // Fetch current mode on mount
  useEffect(() => {
    const fetchMode = async () => {
      try {
        const response = await axios.get('/api/get-mode');
        setDetectionMode(response.data.mode);
      } catch (error) {
        console.error('Error fetching mode:', error);
      }
    };
    fetchMode();
  }, []);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      
      const processedImg = document.getElementById('processed-feed');
      if (processedImg) {
        if (processedImg.src) {
          URL.revokeObjectURL(processedImg.src);
        }
        processedImg.remove();
      }
    };
  }, []);

  const handleNotificationSent = (hazard, response) => {
    if (response.success) {
      toast.success(`Hazard reported to authorities (ID: ${response.report_id.substring(0, 8)})`);
    }
  };

  const handleModeSwitch = async (mode) => {
    try {
      const response = await axios.post('/api/set-mode', { mode });
      if (response.data.success) {
        setDetectionMode(mode);
        toast.info(`Switched to ${mode === 'live' ? 'Live Camera' : 'Video File'} mode`);
      }
    } catch (error) {
      console.error('Error switching mode:', error);
      toast.error('Failed to switch mode');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|avi|mov|mkv|webm|flv|wmv)$/i)) {
      toast.error('Unsupported file format. Please upload MP4, AVI, MOV, MKV, WEBM, FLV, or WMV files.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/upload-video', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          toast.info(`Uploading: ${percentCompleted}%`);
        },
      });

      if (response.data.success) {
        setDetectionMode('video');
        toast.success(`Video uploaded successfully: ${response.data.filename}`);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (error) {
      console.error('Error uploading video:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload video');
    } finally {
      setUploading(false);
    }
  };

  const handleStopVideo = async () => {
    try {
      const response = await axios.post('/api/stop-video');
      if (response.data.success) {
        setDetectionMode('live');
        setVideoProgress(0);
        toast.info('Video stopped. Switched to Live Camera mode.');
      }
    } catch (error) {
      console.error('Error stopping video:', error);
      toast.error('Failed to stop video');
    }
  };

  return (
    <div className="live-container">
      <h1>Road Hazard Detection</h1>
      
      {/* Mode Toggle */}
      <div className="mode-controls">
        <div className="mode-toggle">
          <button
            className={`mode-btn ${detectionMode === 'live' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('live')}
            disabled={uploading}
          >
            📹 Live Camera
          </button>
          <button
            className={`mode-btn ${detectionMode === 'video' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('video')}
            disabled={uploading}
          >
            🎬 Video File
          </button>
        </div>

        {/* File Upload Section */}
        {detectionMode === 'video' && (
          <div className="upload-section">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="video-upload-input"
              disabled={uploading}
            />
            <label htmlFor="video-upload-input" className="upload-btn">
              {uploading ? 'Uploading...' : '📁 Upload Video'}
            </label>
            {detectionMode === 'video' && videoProgress > 0 && (
              <button className="stop-video-btn" onClick={handleStopVideo}>
                ⏹ Stop Video
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status Display */}
      <div className={`camera-status ${detectionMode === 'live' ? 'live-mode' : 'video-mode'}`}>
        {detectionMode === 'live' 
          ? '🔴 Live Camera (YOLO Detection Active)' 
          : `🎬 Video File Mode ${videoProgress > 0 ? `- ${videoProgress.toFixed(1)}%` : ''}`}
      </div>

      <div className="content-grid">
        <div className="feed-column">
          <div className="video-container">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="live-feed"
            />
          </div>
        </div>

        <div className="map-column">
          <iframe
            src="/Map.html"
            title="Road Hazard Map"
            className="map-iframe"
            allowFullScreen
          />
        </div>
      </div>

      <HazardNotifier 
        isConnected={isConnected}
        hazardDetected={hazardDetected}
        currentLocation={currentLocation}
        onNotificationSent={handleNotificationSent}
      />

      {/* NearbyHazardNotifier now handles pothole notifications */}
      <NearbyHazardNotifier currentLocation={currentLocation} />

      <EmergencyBrakeNotifier 
        hazardDistances={hazardDistances}
        driverLaneHazardCount={driverLaneHazardCount}
      />
      
      <ToastContainer />
    </div>
  );
}