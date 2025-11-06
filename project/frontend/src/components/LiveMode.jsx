import { useEffect, useRef, useState } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ArrowLeft, Camera, Video, Upload, StopCircle, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import HazardNotifier from './HazardNotifier';
import NearbyHazardNotifier from './NearbyHazardNotifier';
import EmergencyBrakeNotifier from './EmergencyBrakeNotifier';
import voiceAlertService, { PRIORITY } from '../services/voiceAlertService';
import { getRoadHazardMessage, getHazardMessage } from '../config/voiceMessages';

export default function LiveMode() {
  const videoRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const wsRef = useRef(null);
  const alertRef = useRef(null);
  const cooldownRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastVoiceAlertRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hazardDetected, setHazardDetected] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [hazardDistances, setHazardDistances] = useState([]);
  const [driverLaneHazardCount, setDriverLaneHazardCount] = useState(0);
  const [detectionMode, setDetectionMode] = useState('live');
  const [videoProgress, setVideoProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState(null);
  const frameCounterRef = useRef({ count: 0, lastTs: performance.now() });

  // Cleanup voice alerts on unmount
  useEffect(() => {
    return () => {
      voiceAlertService.stop();
    };
  }, []);

  // Get current location and send to WebSocket
  useEffect(() => {
    let watchId = null;
    let locationWarningToastId = null;

    if (navigator.geolocation) {
      // First try to get current position (one-time check)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Successfully got location - clear any existing warnings
          if (locationWarningToastId) {
            toast.dismiss(locationWarningToastId);
            locationWarningToastId = null;
          }
          
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
          // Only show warning for permission denied (error code 1)
          if (error.code === error.PERMISSION_DENIED) {
            locationWarningToastId = toast.warning("Location access is needed for hazard reporting. Please enable location permissions in your browser settings.", {
              autoClose: false,
              closeOnClick: true,
            });
          } else {
            // Other errors (timeout, position unavailable) - just log, don't show warning
            console.warn("Location error:", error.message);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000
        }
      );

      // Then start watching position for updates
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          // Successfully got location - clear any existing warnings
          if (locationWarningToastId) {
            toast.dismiss(locationWarningToastId);
            locationWarningToastId = null;
          }

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
          // Only show warning for permission denied (error code 1)
          if (error.code === error.PERMISSION_DENIED) {
            // Only show warning if we don't already have one
            if (!locationWarningToastId) {
              locationWarningToastId = toast.warning("Location access is needed for hazard reporting. Please enable location permissions in your browser settings.", {
                autoClose: false,
                closeOnClick: true,
              });
            }
          } else {
            // Other errors (timeout, position unavailable) - just log, don't show warning
            console.warn("Location watch error:", error.message);
          }
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

    // Cleanup: stop watching position when component unmounts
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (locationWarningToastId) {
        toast.dismiss(locationWarningToastId);
      }
    };
  }, []);

  const connectWebSocket = (retry = 0) => {
    if (wsRef.current) {
      try { wsRef.current.onopen = null; wsRef.current.onmessage = null; wsRef.current.onerror = null; wsRef.current.onclose = null; } catch {}
      try { wsRef.current.close(); } catch {}
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
    // Prefer ArrayBuffer to cut Blob overhead
    try { wsRef.current.binaryType = 'arraybuffer'; } catch {}

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
          // Ignore keepalive pings
          if (e.data === 'ping') return;
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
              // Get hazard type from parsed data or use default
              const hazardType = parsedData.hazard_type || 'road hazard';
              const hazardDistance = hazardDistances.length > 0 ? hazardDistances[0]?.distance : null;
              
              // Get appropriate voice message
              const voiceMessage = getHazardMessage(
                hazardType,
                hazardDistance ? Math.round(hazardDistance) : null,
                true // inDriverLane
              );
              
              // Trigger voice alert
              if (voiceMessage && (!lastVoiceAlertRef.current || Date.now() - lastVoiceAlertRef.current > 10000)) {
                voiceAlertService.hazard(voiceMessage);
                lastVoiceAlertRef.current = Date.now();
              }
              
              alertRef.current = toast.warning(`⚠️ Road Hazard Detected in Your Lane! \n
                Reducing Speed ......
                `, {
                autoClose: false,
                closeOnClick: false,
                draggable: false
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
                }
                cooldownRef.current = null;
              }, 3000);
            }
          }
        } catch (err) {
          console.error("WebSocket JSON Error:", err);
        }
      } else if (e.data instanceof ArrayBuffer || e.data instanceof Blob) {
        try {
          const blob = e.data instanceof Blob ? e.data : new Blob([e.data], { type: 'image/jpeg' });
          const container = canvasContainerRef.current;
          if (!container) {
            console.error('Canvas container not found');
            return;
          }

          let canvas = document.getElementById('processed-canvas');
          if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'processed-canvas';
            canvas.className = 'absolute inset-0 w-full h-full object-cover';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '10';
            container.appendChild(canvas);
          }

          const ctx = canvas.getContext('2d');
          
          // Hide video element when canvas is active
          if (videoRef.current) {
            videoRef.current.style.display = 'none';
          }

          // Use createImageBitmap for faster decode and draw
          createImageBitmap(blob).then((bitmap) => {
            if (!canvas || !ctx) return;
            
            // Calculate aspect ratio and sizing
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            const imageAspect = bitmap.width / bitmap.height;
            const containerAspect = containerWidth / containerHeight;

            if (imageAspect > containerAspect) {
              // Image is wider - fit to width
              canvas.width = containerWidth;
              canvas.height = containerWidth / imageAspect;
              canvas.style.top = `${(containerHeight - canvas.height) / 2}px`;
              canvas.style.left = '0';
            } else {
              // Image is taller - fit to height
              canvas.height = containerHeight;
              canvas.width = containerHeight * imageAspect;
              canvas.style.left = `${(containerWidth - canvas.width) / 2}px`;
              canvas.style.top = '0';
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();

            // FPS estimation
            const fc = frameCounterRef.current;
            fc.count += 1;
            const now = performance.now();
            if (now - fc.lastTs >= 1000) {
              setFps(fc.count);
              fc.count = 0;
              fc.lastTs = now;
            }
          }).catch((err) => {
            console.error('Error creating image bitmap:', err);
            // Fallback path if createImageBitmap not supported
            const img = new Image();
            img.onload = () => {
              if (!canvas || !ctx) return;
              
              const containerWidth = container.clientWidth;
              const containerHeight = container.clientHeight;
              const imageAspect = img.width / img.height;
              const containerAspect = containerWidth / containerHeight;

              if (imageAspect > containerAspect) {
                canvas.width = containerWidth;
                canvas.height = containerWidth / imageAspect;
                canvas.style.top = `${(containerHeight - canvas.height) / 2}px`;
                canvas.style.left = '0';
              } else {
                canvas.height = containerHeight;
                canvas.width = containerHeight * imageAspect;
                canvas.style.left = `${(containerWidth - canvas.width) / 2}px`;
                canvas.style.top = '0';
              }

              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(img.src);

              const fc = frameCounterRef.current;
              fc.count += 1;
              const now = performance.now();
              if (now - fc.lastTs >= 1000) {
                setFps(fc.count);
                fc.count = 0;
                fc.lastTs = now;
              }
            };
            img.onerror = (err) => {
              console.error('Error loading image:', err);
              URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(blob);
          });
        } catch (err) {
          console.error('Error processing frame:', err);
          setError(err.message);
        }
      }
    };

    wsRef.current.onerror = () => {
      if (retry % 10 === 0) {
        console.error("WebSocket error. Attempting to reconnect...");
      }
      setIsConnected(false);
    };

    wsRef.current.onclose = () => {
      const base = 1000; // 1s
      const maxDelay = 30000; // 30s
      const delay = Math.min(maxDelay, Math.round(base * Math.pow(2, Math.min(retry, 6)) + Math.random() * 500));
      if (retry % 3 === 0) {
        console.warn(`WebSocket closed. Reconnecting in ${Math.round(delay/1000)}s...`);
      }
      setIsConnected(false);
      setTimeout(() => connectWebSocket(retry + 1), delay);
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
        try {
          wsRef.current.close();
        } catch (e) {
          console.error('Error closing WebSocket:', e);
        }
      }
      
      // Clean up canvas
      const canvas = document.getElementById('processed-canvas');
      if (canvas) {
        canvas.remove();
      }
      
      // Clean up any image URLs
      const processedImg = document.getElementById('processed-feed');
      if (processedImg) {
        if (processedImg.src) {
          URL.revokeObjectURL(processedImg.src);
        }
        processedImg.remove();
      }
    };
  }, []);

  // Clean up canvas when component unmounts or mode changes
  useEffect(() => {
    return () => {
      const canvas = document.getElementById('processed-canvas');
      if (canvas) {
        canvas.remove();
      }
    };
  }, [detectionMode]);

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
    try {
      const file = event.target.files[0];
      if (!file) return;

      // Validate file type
      const allowedTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|avi|mov|mkv|webm|flv|wmv)$/i)) {
        toast.error('Unsupported file format. Please upload MP4, AVI, MOV, MKV, WEBM, FLV, or WMV files.');
        return;
      }

      setUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/api/upload-video', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            toast.info(`Uploading: ${percentCompleted}%`);
          }
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
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to upload video';
      toast.error(errorMessage);
      setError(errorMessage);
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

  // Prevent white screen on errors
  if (error && !isConnected && !uploading) {
    console.error('Component error state:', error);
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white/10 backdrop-blur-lg border-b border-white/20"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/">
            <motion.button
              whileHover={{ scale: 1.05, x: -5 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 text-white hover:text-[#3498db] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold">Back to Home</span>
            </motion.button>
          </Link>
          
          <h1 className="text-2xl lg:text-3xl font-bold text-white">
            Road Hazard Detection
          </h1>
          
          <Link to="/pothole-map">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 bg-[#3498db] text-white rounded-full font-semibold shadow-lg"
            >
              <MapPin className="w-5 h-5" />
              <span className="hidden sm:inline">View Map</span>
            </motion.button>
          </Link>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Status Cards */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6"
        >
          <div className={`bg-white/10 backdrop-blur-lg rounded-xl p-4 border ${isConnected ? 'border-[#2ecc71]' : 'border-[#e74c3c]'}`}>
            <div className="text-xs text-gray-300 mb-1">Connection</div>
            <div className={`text-lg font-bold flex items-center gap-2 ${isConnected ? 'text-[#2ecc71]' : 'text-[#e74c3c]'}`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#2ecc71]' : 'bg-[#e74c3c]'} animate-pulse`}></span>
              {isConnected ? 'Online' : 'Offline'}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="text-xs text-gray-300 mb-1">Mode</div>
            <div className="text-lg font-bold text-white flex items-center gap-2">
              {detectionMode === 'live' ? <Camera className="text-[#3498db] w-5 h-5" /> : <Video className="text-[#9b59b6] w-5 h-5" />}
              {detectionMode === 'live' ? 'Live' : 'Video'}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="text-xs text-gray-300 mb-1">FPS</div>
            <div className="text-lg font-bold text-white">{fps}</div>
          </div>

          {detectionMode === 'video' && (
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
              <div className="text-xs text-gray-300 mb-1">Progress</div>
              <div className="text-lg font-bold text-white">
                {videoProgress ? `${videoProgress.toFixed(1)}%` : '—'}
              </div>
            </div>
          )}

          <div className={`bg-white/10 backdrop-blur-lg rounded-xl p-4 border ${driverLaneHazardCount > 0 ? 'border-[#e74c3c]' : 'border-[#2ecc71]'}`}>
            <div className="text-xs text-gray-300 mb-1">Lane Hazards</div>
            <div className={`text-lg font-bold ${driverLaneHazardCount > 0 ? 'text-[#e74c3c]' : 'text-[#2ecc71]'}`}>
              {driverLaneHazardCount}
            </div>
          </div>
        </motion.div>

        {/* Mode Control Panel */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6"
        >
          <h2 className="text-white text-lg font-semibold mb-4">Detection Mode</h2>
          
          <div className="flex flex-wrap gap-4 mb-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex-1 min-w-[150px] px-6 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-3 ${
                detectionMode === 'live' 
                  ? 'bg-gradient-to-r from-[#3498db] to-[#2980b9] text-white shadow-lg' 
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
              } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => handleModeSwitch('live')}
              disabled={uploading}
            >
              <Camera className="w-6 h-6" />
              <span>Live Camera</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex-1 min-w-[150px] px-6 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-3 ${
                detectionMode === 'video' 
                  ? 'bg-gradient-to-r from-[#9b59b6] to-[#8e44ad] text-white shadow-lg' 
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
              } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => handleModeSwitch('video')}
              disabled={uploading}
            >
              <Video className="w-6 h-6" />
              <span>Video File</span>
            </motion.button>
          </div>

          {/* File Upload Controls */}
          {detectionMode === 'video' && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/20"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id="video-upload-input"
                disabled={uploading}
              />
              <label 
                htmlFor="video-upload-input" 
                className={`flex-1 min-w-[150px] px-6 py-3 rounded-xl font-bold cursor-pointer transition-all flex items-center justify-center gap-3 ${
                  uploading 
                    ? 'bg-white/10 text-gray-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-[#2ecc71] to-[#27ae60] text-white hover:shadow-lg'
                }`}
              >
                <Upload className="w-5 h-5" />
                <span>{uploading ? 'Uploading...' : 'Upload Video'}</span>
              </label>

              {videoProgress > 0 && (
                <motion.button 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 min-w-[150px] px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-[#e74c3c] to-[#c0392b] text-white hover:shadow-lg transition-all flex items-center justify-center gap-3"
                  onClick={handleStopVideo}
                >
                  <StopCircle className="w-5 h-5" />
                  <span>Stop Video</span>
                </motion.button>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Video and Map Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Processed Stream */}
          <motion.div 
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
          >
            <div className="bg-white/5 px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Camera className="text-[#3498db] w-5 h-5" />
                Processed Stream
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#2ecc71]' : 'bg-[#e74c3c]'} animate-pulse`}></span>
                <span className="text-white">{fps} fps</span>
              </div>
            </div>
            
            <div 
              ref={canvasContainerRef}
              className="relative w-full h-[400px] bg-black/50 overflow-hidden"
            >
              {!isConnected && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-[#3498db] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-white">Connecting to stream...</p>
                  </div>
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center z-20 bg-red-900/20">
                  <div className="text-center p-4">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                </div>
              )}
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="absolute inset-0 w-full h-full object-cover z-0"
                style={{ display: isConnected ? 'block' : 'none' }}
              />
              {/* Canvas will be inserted here dynamically by WebSocket handler */}
            </div>

            {/* Legend */}
            <div className="bg-white/5 px-6 py-3 flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-[#00ff00]"></span>
                <span className="text-gray-300">Road hazards</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-[#00ffff]"></span>
                <span className="text-gray-300">Standard objects</span>
              </div>
            </div>
          </motion.div>

          {/* Hazard Map */}
          <motion.div 
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
          >
            <div className="bg-white/5 px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <MapPin className="text-[#e74c3c] w-5 h-5" />
                Hazard Map
              </h3>
            </div>
            
            <iframe
              src="/Map.html"
              title="Road Hazard Map"
              className="w-full h-[400px] border-none bg-white/5"
              allowFullScreen
            />
          </motion.div>
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
      </div>
      
      <ToastContainer 
        position="bottom-right"
        theme="dark"
        toastClassName="backdrop-blur-lg bg-white/10"
      />
    </motion.div>
  );
}