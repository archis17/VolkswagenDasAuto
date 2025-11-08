import { useEffect, useRef, useState } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import apiClient from '../utils/axios';
import { getWebSocketEndpoint } from '../config/api';
import { motion } from 'framer-motion';
import { ArrowLeft, Camera, Video, Upload, StopCircle, MapPin, Wifi, WifiOff, Activity, AlertTriangle, Zap, TrendingUp } from 'lucide-react';
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
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (locationWarningToastId) {
            toast.dismiss(locationWarningToastId);
            locationWarningToastId = null;
          }
          
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(newLocation);
          
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              gps: newLocation
            }));
          }
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            locationWarningToastId = toast.warning("Location access is needed for hazard reporting. Please enable location permissions in your browser settings.", {
              autoClose: false,
              closeOnClick: true,
            });
          } else {
            console.warn("Location error:", error.message);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000
        }
      );

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (locationWarningToastId) {
            toast.dismiss(locationWarningToastId);
            locationWarningToastId = null;
          }

          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(newLocation);
          
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              gps: newLocation
            }));
          }
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            if (!locationWarningToastId) {
              locationWarningToastId = toast.warning("Location access is needed for hazard reporting. Please enable location permissions in your browser settings.", {
                autoClose: false,
                closeOnClick: true,
              });
            }
          } else {
            console.warn("Location watch error:", error.message);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000
        }
      );
    } else {
      toast.warning("Geolocation is not supported by this browser");
    }

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

    // Use configured WebSocket URL
    const wsURL = getWebSocketEndpoint();
    wsRef.current = new WebSocket(wsURL);
    try { wsRef.current.binaryType = 'arraybuffer'; } catch {}

    wsRef.current.onopen = () => {
      setIsConnected(true);
      
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
          if (e.data === 'ping') return;
          const parsedData = JSON.parse(e.data);
          const driverLaneHazardCount = parsedData.driver_lane_hazard_count;
          const hazardDistances = parsedData.hazard_distances || [];
          setHazardDetected({ type: parsedData.hazard_type });
          setDriverLaneHazardCount(driverLaneHazardCount);
          setHazardDistances(hazardDistances);
          
          if (parsedData.mode) {
            setDetectionMode(parsedData.mode);
          }
          if (parsedData.video_progress !== undefined) {
            setVideoProgress(parsedData.video_progress);
          }
    
          if (driverLaneHazardCount > 0) {
            if (!alertRef.current) {
              const hazardType = parsedData.hazard_type || 'road hazard';
              const hazardDistance = hazardDistances.length > 0 ? hazardDistances[0]?.distance : null;
              
              const voiceMessage = getHazardMessage(
                hazardType,
                hazardDistance ? Math.round(hazardDistance) : null,
                true
              );
              
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
          
          if (videoRef.current) {
            videoRef.current.style.display = 'none';
          }

          createImageBitmap(blob).then((bitmap) => {
            if (!canvas || !ctx) return;
            
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            const imageAspect = bitmap.width / bitmap.height;
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
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();

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
      const base = 1000;
      const maxDelay = 30000;
      const delay = Math.min(maxDelay, Math.round(base * Math.pow(2, Math.min(retry, 6)) + Math.random() * 500));
      if (retry % 3 === 0) {
        console.warn(`WebSocket closed. Reconnecting in ${Math.round(delay/1000)}s...`);
      }
      setIsConnected(false);
      setTimeout(() => connectWebSocket(retry + 1), delay);
    };
  };

  useEffect(() => {
    const fetchMode = async () => {
      try {
        const response = await apiClient.get('/api/get-mode');
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
      
      const canvas = document.getElementById('processed-canvas');
      if (canvas) {
        canvas.remove();
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
      const response = await apiClient.post('/api/set-mode', { mode });
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

      const allowedTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|avi|mov|mkv|webm|flv|wmv)$/i)) {
        toast.error('Unsupported file format. Please upload MP4, AVI, MOV, MKV, WEBM, FLV, or WMV files.');
        return;
      }

      setUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post('/api/upload-video', formData, {
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
      const response = await apiClient.post('/api/stop-video');
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

  if (error && !isConnected && !uploading) {
    console.error('Component error state:', error);
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gradient-to-br from-[#0a0e27] via-[#1a1a2e] to-[#16213e] relative overflow-hidden"
    >
      {/* Animated background grid */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(52, 152, 219, .1) 25%, rgba(52, 152, 219, .1) 26%, transparent 27%, transparent 74%, rgba(52, 152, 219, .1) 75%, rgba(52, 152, 219, .1) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(52, 152, 219, .1) 25%, rgba(52, 152, 219, .1) 26%, transparent 27%, transparent 74%, rgba(52, 152, 219, .1) 75%, rgba(52, 152, 219, .1) 76%, transparent 77%, transparent)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Header */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10 shadow-2xl"
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/">
            <motion.button
              whileHover={{ scale: 1.05, x: -5 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 text-white/90 hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="font-semibold">Back to Home</span>
            </motion.button>
          </Link>
          
          <motion.h1 
            className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-white via-[#3498db] to-white bg-clip-text text-transparent"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            Road Hazard Detection
          </motion.h1>
          
          <Link to="/pothole-map">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#3498db] to-[#2980b9] text-white rounded-full font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              <MapPin className="w-5 h-5" />
              <span className="hidden sm:inline">View Map</span>
            </motion.button>
          </Link>
        </div>
      </motion.div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        {/* Status Cards - Modern Design */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-6"
        >
          {/* Connection Status */}
          <motion.div 
            whileHover={{ scale: 1.02, y: -2 }}
            className={`relative overflow-hidden rounded-2xl p-5 border backdrop-blur-xl ${
              isConnected 
                ? 'bg-gradient-to-br from-[#2ecc71]/20 to-[#27ae60]/10 border-[#2ecc71]/30' 
                : 'bg-gradient-to-br from-[#e74c3c]/20 to-[#c0392b]/10 border-[#e74c3c]/30'
            } shadow-xl`}
          >
            <div className="flex items-center justify-between mb-2">
              {isConnected ? (
                <Wifi className="w-5 h-5 text-[#2ecc71]" />
              ) : (
                <WifiOff className="w-5 h-5 text-[#e74c3c]" />
              )}
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#2ecc71]' : 'bg-[#e74c3c]'} animate-pulse`}></span>
            </div>
            <div className="text-xs text-gray-400 mb-1">Connection</div>
            <div className={`text-xl font-bold ${isConnected ? 'text-[#2ecc71]' : 'text-[#e74c3c]'}`}>
              {isConnected ? 'Online' : 'Offline'}
            </div>
          </motion.div>

          {/* Mode Status */}
          <motion.div 
            whileHover={{ scale: 1.02, y: -2 }}
            className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-white/10 to-white/5 border border-white/20 backdrop-blur-xl shadow-xl"
          >
            <div className="flex items-center justify-between mb-2">
              {detectionMode === 'live' ? (
                <Camera className="text-[#3498db] w-5 h-5" />
              ) : (
                <Video className="text-[#9b59b6] w-5 h-5" />
              )}
            </div>
            <div className="text-xs text-gray-400 mb-1">Mode</div>
            <div className="text-xl font-bold text-white">
              {detectionMode === 'live' ? 'Live' : 'Video'}
            </div>
          </motion.div>

          {/* FPS */}
          <motion.div 
            whileHover={{ scale: 1.02, y: -2 }}
            className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-white/10 to-white/5 border border-white/20 backdrop-blur-xl shadow-xl"
          >
            <div className="flex items-center justify-between mb-2">
              <Activity className="text-[#3498db] w-5 h-5" />
            </div>
            <div className="text-xs text-gray-400 mb-1">FPS</div>
            <div className="text-xl font-bold text-white">{fps}</div>
          </motion.div>

          {/* Video Progress (conditional) */}
          {detectionMode === 'video' && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-white/10 to-white/5 border border-white/20 backdrop-blur-xl shadow-xl"
            >
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="text-[#9b59b6] w-5 h-5" />
              </div>
              <div className="text-xs text-gray-400 mb-1">Progress</div>
              <div className="text-xl font-bold text-white">
                {videoProgress ? `${videoProgress.toFixed(1)}%` : '—'}
              </div>
            </motion.div>
          )}

          {/* Lane Hazards */}
          <motion.div 
            whileHover={{ scale: 1.02, y: -2 }}
            className={`relative overflow-hidden rounded-2xl p-5 border backdrop-blur-xl ${
              driverLaneHazardCount > 0 
                ? 'bg-gradient-to-br from-[#e74c3c]/20 to-[#c0392b]/10 border-[#e74c3c]/30' 
                : 'bg-gradient-to-br from-[#2ecc71]/20 to-[#27ae60]/10 border-[#2ecc71]/30'
            } shadow-xl`}
          >
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className={`w-5 h-5 ${driverLaneHazardCount > 0 ? 'text-[#e74c3c]' : 'text-[#2ecc71]'}`} />
            </div>
            <div className="text-xs text-gray-400 mb-1">Lane Hazards</div>
            <div className={`text-xl font-bold ${driverLaneHazardCount > 0 ? 'text-[#e74c3c]' : 'text-[#2ecc71]'}`}>
              {driverLaneHazardCount}
            </div>
          </motion.div>
        </motion.div>

        {/* Mode Control Panel - Enhanced */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Zap className="text-[#f39c12] w-6 h-6" />
            <h2 className="text-white text-xl font-bold">Detection Mode</h2>
          </div>
          
          <div className="flex flex-wrap gap-4 mb-4">
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className={`flex-1 min-w-[180px] px-6 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 ${
                detectionMode === 'live' 
                  ? 'bg-gradient-to-r from-[#3498db] to-[#2980b9] text-white shadow-xl shadow-[#3498db]/30' 
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
              } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => handleModeSwitch('live')}
              disabled={uploading}
            >
              <Camera className="w-6 h-6" />
              <span>Live Camera</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className={`flex-1 min-w-[180px] px-6 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 ${
                detectionMode === 'video' 
                  ? 'bg-gradient-to-r from-[#9b59b6] to-[#8e44ad] text-white shadow-xl shadow-[#9b59b6]/30' 
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
              className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/10"
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
                className={`flex-1 min-w-[180px] px-6 py-3 rounded-2xl font-bold cursor-pointer transition-all flex items-center justify-center gap-3 ${
                  uploading 
                    ? 'bg-white/10 text-gray-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-[#2ecc71] to-[#27ae60] text-white hover:shadow-xl shadow-lg shadow-[#2ecc71]/30'
                }`}
              >
                <Upload className="w-5 h-5" />
                <span>{uploading ? 'Uploading...' : 'Upload Video'}</span>
              </label>

              {videoProgress > 0 && (
                <motion.button 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 min-w-[180px] px-6 py-3 rounded-2xl font-bold bg-gradient-to-r from-[#e74c3c] to-[#c0392b] text-white hover:shadow-xl shadow-lg shadow-[#e74c3c]/30 transition-all flex items-center justify-center gap-3"
                  onClick={handleStopVideo}
                >
                  <StopCircle className="w-5 h-5" />
                  <span>Stop Video</span>
                </motion.button>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Video and Map Grid - Enhanced */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Processed Stream - Modern Design */}
          <motion.div 
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white/5 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
          >
            <div className="bg-gradient-to-r from-white/10 to-white/5 px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-3 text-lg">
                <div className="p-2 bg-[#3498db]/20 rounded-lg">
                  <Camera className="text-[#3498db] w-5 h-5" />
                </div>
                Processed Stream
              </h3>
              <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#2ecc71]' : 'bg-[#e74c3c]'} animate-pulse`}></span>
                <span className="text-white font-semibold">{fps} fps</span>
              </div>
            </div>
            
            <div 
              ref={canvasContainerRef}
              className="relative w-full h-[450px] bg-gradient-to-br from-black/60 to-black/40 overflow-hidden"
            >
              {!isConnected && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="text-center">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-16 h-16 border-4 border-[#3498db] border-t-transparent rounded-full mx-auto mb-4"
                    ></motion.div>
                    <p className="text-white/80 text-lg">Connecting to stream...</p>
                  </div>
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center z-20 bg-red-900/20 backdrop-blur-sm">
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
            </div>

            {/* Legend - Enhanced */}
            <div className="bg-white/5 px-6 py-4 flex gap-6 text-sm border-t border-white/10">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-[#00ff00] shadow-lg shadow-[#00ff00]/50"></span>
                <span className="text-gray-300 font-medium">Road hazards</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-[#00ffff] shadow-lg shadow-[#00ffff]/50"></span>
                <span className="text-gray-300 font-medium">Standard objects</span>
              </div>
            </div>
          </motion.div>

          {/* Hazard Map - Enhanced */}
          <motion.div 
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white/5 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
          >
            <div className="bg-gradient-to-r from-white/10 to-white/5 px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-3 text-lg">
                <div className="p-2 bg-[#e74c3c]/20 rounded-lg">
                  <MapPin className="text-[#e74c3c] w-5 h-5" />
                </div>
                Hazard Map
              </h3>
            </div>
            
            <iframe
              src="/Map.html"
              title="Road Hazard Map"
              className="w-full h-[450px] border-none bg-white/5"
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

        <NearbyHazardNotifier currentLocation={currentLocation} />

        <EmergencyBrakeNotifier 
          hazardDistances={hazardDistances}
          driverLaneHazardCount={driverLaneHazardCount}
        />
      </div>
      
      <ToastContainer 
        position="bottom-right"
        theme="dark"
        toastClassName="backdrop-blur-xl bg-white/10 border border-white/20"
        progressClassName="bg-gradient-to-r from-[#3498db] to-[#2ecc71]"
      />
    </motion.div>
  );
}
