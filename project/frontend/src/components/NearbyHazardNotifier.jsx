import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import voiceAlertService from '../services/voiceAlertService';
import { getWarningMessage } from '../config/voiceMessages';
import { API_BASE_URL } from '../config/api';

export default function NearbyHazardNotifier({ currentLocation }) {
  const [nearbyPotholes, setNearbyPotholes] = useState([]);
  const nearbyPotholeAlertRef = useRef(null);
  const potholeCheckIntervalRef = useRef(null);
  const lastWarningAlertRef = useRef(null);

  useEffect(() => {
    if (!currentLocation) return;
    
    const checkNearbyPotholes = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${API_BASE_URL}/api/hazard-reports`, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error('Failed to fetch pothole data');
        
        const potholes = await response.json();
        
        const nearby = potholes.filter(pothole => {
          const distance = calculateDistance(
            currentLocation.lat, 
            currentLocation.lng,
            pothole.location.lat,
            pothole.location.lng
          );
          return distance <= 0.1; // 0.1 km = 100 meters
        });
        
        setNearbyPotholes(nearby);
        
        if (nearby.length > 0 && !nearbyPotholeAlertRef.current) {
          // Get warning voice message
          const warningMessage = getWarningMessage('pothole', nearby.length, '100');
          
          // Trigger warning voice alert (lower priority than emergency/hazard)
          if (warningMessage && (!lastWarningAlertRef.current || Date.now() - lastWarningAlertRef.current > 30000)) {
            voiceAlertService.warning(warningMessage);
            lastWarningAlertRef.current = Date.now();
          }
          
          nearbyPotholeAlertRef.current = toast.warning(
            `⚠️ Drive carefully! ${nearby.length} pothole${nearby.length > 1 ? 's' : ''} ${nearby.length > 1 ? 'were' : 'was'} detected nearby.`, 
            {
              autoClose: 7000,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
              onClose: () => {
                setTimeout(() => {
                  nearbyPotholeAlertRef.current = null;
                }, 30000);
              }
            }
          );
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error("Error checking nearby potholes:", error);
        }
      }
    };
    
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Radius in km
      const dLat = deg2rad(lat2 - lat1);
      const dLon = deg2rad(lon2 - lon1);
      const a = 
        Math.sin(dLat / 2) ** 2 +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };
    
    const deg2rad = (deg) => deg * (Math.PI / 180);
    
    checkNearbyPotholes();
    
    if (!potholeCheckIntervalRef.current) {
      potholeCheckIntervalRef.current = setInterval(checkNearbyPotholes, 30000);
    }
    
    return () => {
      if (potholeCheckIntervalRef.current) {
        clearInterval(potholeCheckIntervalRef.current);
        potholeCheckIntervalRef.current = null;
      }
    };
  }, [currentLocation]);

  return null;
}