import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, RotateCw, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PotholeMap() {
  const mapRef = useRef(null);
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // Fetch pothole data from our API
    const fetchPotholes = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/hazard-reports');
        setPotholes(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching pothole data:', err);
        setError('Failed to load pothole data. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchPotholes();
  }, []);
  
  useEffect(() => {
    // Initialize TomTom map
    const initMap = async () => {
      if (!mapRef.current || potholes.length === 0) return;
      
      // Load TomTom SDK
      if (!window.tt) {
        const script = document.createElement('script');
        script.src = 'https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.23.0/maps/maps-web.min.js';
        script.async = true;
        script.onload = createMap;
        document.body.appendChild(script);
        
        // Load CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = 'https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.23.0/maps/maps.css';
        document.head.appendChild(link);
      } else {
        createMap();
      }
    };
    
    const createMap = () => {
      // Calculate center point from all potholes
      let centerLat = 0;
      let centerLng = 0;
      
      potholes.forEach(pothole => {
        centerLat += pothole.location.lat;
        centerLng += pothole.location.lng;
      });
      
      centerLat /= potholes.length;
      centerLng /= potholes.length;
      
      // Create map instance
      const map = window.tt.map({
        key: 'HONwvVKmEJdNAPsO358cGA7AhakHmuPV', // Replace with your TomTom API key
        container: mapRef.current,
        center: [centerLng, centerLat],
        zoom: 13
      });
      
      // Add markers for each pothole
      potholes.forEach(pothole => {
        const marker = new window.tt.Marker()
          .setLngLat([pothole.location.lng, pothole.location.lat])
          .addTo(map);
          
        // Create popup with pothole info
        const popup = new window.tt.Popup({ offset: 30 })
          .setHTML(`
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 0.9rem;">
              <h3 style="margin-top: 0; margin-bottom: 5px; font-size: 1rem;">Road Hazard</h3>
              <p style="margin: 4px 0;">Type: ${pothole.type}</p>
              <p style="margin: 4px 0;">Severity: ${pothole.severity}</p>
              <p style="margin: 4px 0;">Reported: ${new Date(pothole.timestamp).toLocaleString()}</p>
              <p style="margin: 4px 0;">Status: ${pothole.status}</p>
            </div>
          `);
          
        marker.setPopup(popup);
      });
      
      // Add heat map layer if there are many potholes
      if (potholes.length > 10) {
        const points = potholes.map(pothole => ({
          lng: pothole.location.lng,
          lat: pothole.location.lat,
          value: 1
        }));
        
        const heatmapLayer = new window.tt.HeatMap({
          data: points,
          radius: 40
        });
        
        map.addLayer(heatmapLayer);
      }
    };
    
    initMap();
  }, [potholes]);
  
  const handleRefresh = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/hazard-reports');
      setPotholes(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching pothole data:', err);
      setError('Failed to load pothole data. Please try again later.');
      setLoading(false);
    }
  };

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
          
          <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-3">
            <MapPin className="text-[#e74c3c] w-7 h-7" />
            Hazard Map
          </h1>
          
          <Link to="/live">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 bg-[#3498db] text-white rounded-full font-semibold shadow-lg"
            >
              <span className="hidden sm:inline">Live Detection</span>
            </motion.button>
          </Link>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Stats Cards */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6"
        >
          <motion.div 
            whileHover={{ y: -5 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="w-10 h-10 text-[#e74c3c]" />
              <motion.button
                whileHover={{ scale: 1.1, rotate: 180 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleRefresh}
                disabled={loading}
                className="text-white hover:text-[#3498db] transition-colors"
              >
                <RotateCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </motion.button>
            </div>
            <div className="text-gray-300 text-sm mb-1">Total Hazard Locations</div>
            <div className="text-4xl font-bold text-white">{potholes.length}</div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -5 }}
            transition={{ delay: 0.1 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="mb-2">
              <MapPin className="w-10 h-10 text-[#3498db]" />
            </div>
            <div className="text-gray-300 text-sm mb-1">Recent Reports (7 Days)</div>
            <div className="text-4xl font-bold text-white">
              {potholes.filter(p => new Date(p.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}
            </div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -5 }}
            transition={{ delay: 0.2 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="mb-2">
              <AlertTriangle className="w-10 h-10 text-[#f39c12]" />
            </div>
            <div className="text-gray-300 text-sm mb-1">Active Hazards</div>
            <div className="text-4xl font-bold text-white">
              {potholes.filter(p => p.status === 'reported').length}
            </div>
          </motion.div>
        </motion.div>

        {/* Loading and Error States */}
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6 text-center"
          >
            <div className="w-16 h-16 border-4 border-[#3498db] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white text-lg">Loading hazard data...</p>
          </motion.div>
        )}

        {error && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-[#e74c3c]/20 backdrop-blur-lg rounded-2xl p-6 border border-[#e74c3c] mb-6 text-center"
          >
            <AlertTriangle className="w-16 h-16 text-[#e74c3c] mx-auto mb-3" />
            <p className="text-white text-lg">{error}</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              className="mt-4 px-6 py-2 bg-[#e74c3c] text-white rounded-full font-semibold"
            >
              Try Again
            </motion.button>
          </motion.div>
        )}

        {/* Map Container */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
        >
          <div className="bg-white/5 px-6 py-4 border-b border-white/20">
            <h2 className="text-white text-xl font-semibold flex items-center gap-2">
              <MapPin className="text-[#3498db] w-6 h-6" />
              Interactive Hazard Map
            </h2>
            <p className="text-gray-300 text-sm mt-1">
              Click on markers to view detailed information about each hazard
            </p>
          </div>
          
          <div ref={mapRef} className="w-full h-[600px] bg-gray-900"></div>
        </motion.div>

        {/* Hazard List */}
        {potholes.length > 0 && (
          <motion.div 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-6 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-6"
          >
            <h2 className="text-white text-xl font-semibold mb-4">Recent Hazard Reports</h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {potholes.slice(0, 10).map((pothole, index) => (
                <motion.div
                  key={index}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white/5 rounded-xl p-4 hover:bg-white/10 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-semibold">{pothole.type || 'Unknown Hazard'}</div>
                      <div className="text-gray-400 text-sm">
                        {new Date(pothole.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      pothole.status === 'reported' ? 'bg-[#e74c3c]/20 text-[#e74c3c]' : 'bg-[#2ecc71]/20 text-[#2ecc71]'
                    }`}>
                      {pothole.status || 'reported'}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}