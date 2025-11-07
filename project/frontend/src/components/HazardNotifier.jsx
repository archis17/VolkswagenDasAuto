import { useEffect, useRef } from 'react';
import axios from 'axios';

export default function HazardNotifier({ 
  isConnected, 
  hazardDetected, 
  currentLocation,
  onNotificationSent 
}) {
  const lastNotificationRef = useRef(null);
  const notificationCooldownRef = useRef(30 * 60 * 1000); // 30 minutes cooldown
  const pendingNotificationsRef = useRef([]);
  
  // Process notifications with cooldown
  useEffect(() => {
    if (!isConnected || !hazardDetected) return;
    
    // Only proceed if the hazard type exists and is a pothole
    if (currentLocation && currentLocation.lat && currentLocation.lng && hazardDetected.type && hazardDetected.type.toLowerCase() === 'pothole') {
      const newHazard = {
        location: currentLocation,
        timestamp: new Date(),
        type: hazardDetected.type,
      };
      
      const isDuplicate = pendingNotificationsRef.current.some(hazard => 
        Math.abs(hazard.location.lat - currentLocation.lat) < 0.0001 && 
        Math.abs(hazard.location.lng - currentLocation.lng) < 0.0001
      );
      
      if (!isDuplicate) {
        pendingNotificationsRef.current.push(newHazard);
      }
    }
  }, [isConnected, hazardDetected, currentLocation]);
  
  // Periodically check if we can send notifications
  useEffect(() => {
    if (!isConnected) return;
    
    const checkInterval = setInterval(() => {
      const now = new Date();
      
      if (pendingNotificationsRef.current.length > 0 && 
          (!lastNotificationRef.current || 
           now - lastNotificationRef.current > notificationCooldownRef.current)) {
        
        const batchSize = Math.min(3, pendingNotificationsRef.current.length);
        const hazardsToReport = pendingNotificationsRef.current.splice(0, batchSize);
        
        hazardsToReport.forEach(hazard => {
          sendHazardNotification(hazard);
        });
        
        lastNotificationRef.current = new Date();
      }
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(checkInterval);
  }, [isConnected]);
  
  const sendHazardNotification = async (hazard) => {
    try {
      const response = await axios.post('/api/hazard-notification', hazard);
      
      if (response.data.success) {
        lastNotificationRef.current = new Date();
        if (onNotificationSent) {
          onNotificationSent(hazard, response.data);
        }
        console.log('Hazard notification sent successfully', hazard);
      }
    } catch (error) {
      console.error('Failed to send hazard notification:', error);
      pendingNotificationsRef.current.unshift(hazard);
    }
  };
  
  return null;
}