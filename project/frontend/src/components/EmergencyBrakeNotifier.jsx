import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';

export default function EmergencyBrakeNotifier({ hazardDistances = [], driverLaneHazardCount = 0 }) {
  const emergencyBrakeAlertRef = useRef(null);
  const emergencyBrakeAudioRef = useRef(null);
  const [activeHazards, setActiveHazards] = useState([]);
  
  useEffect(() => {
    // Initialize emergency brake sound (updated track)
    emergencyBrakeAudioRef.current = new Audio('/volkswagen-das-auto-remix.mp3');
    emergencyBrakeAudioRef.current.loop = false;
    
    return () => {
      if (emergencyBrakeAudioRef.current) {
        emergencyBrakeAudioRef.current.pause();
        emergencyBrakeAudioRef.current = null;
      }
    };
  }, []);
  
  useEffect(() => {
    // Check if there are any close-range hazards in the driver's lane
    if (hazardDistances.length > 0) {
      // Filter for people, dogs, or cows within 12 meters in driver's lane
      const closeRangeHazards = hazardDistances.filter(hazard => 
        (hazard.class === 'person' || hazard.class === 'dog' || hazard.class === 'cow') && 
        hazard.distance < 12 &&
        hazard.inDriverLane === true
      );
      
      // Update active hazards
      setActiveHazards(closeRangeHazards);
      
      // Show alert if we have close range hazards and no alert is currently showing
      if (closeRangeHazards.length > 0 && !emergencyBrakeAlertRef.current) {
        // Play emergency brake sound
        if (emergencyBrakeAudioRef.current) {
          emergencyBrakeAudioRef.current.play().catch(err => 
            console.error("Error playing emergency brake sound:", err)
          );
        }
        
        // Show emergency brake toast
        emergencyBrakeAlertRef.current = toast.error(
          "⚠️ EMERGENCY! Applying emergency brake!", 
          {
            position: "top-center",
            autoClose: false, // Don't auto-close, we'll handle this manually
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            style: {
              backgroundColor: '#ff0000',
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '18px',
              textAlign: 'center'
            },
            onClose: () => {
              emergencyBrakeAlertRef.current = null;
            }
          }
        );
      }
    } else {
      // No hazards detected at all, clear active hazards
      setActiveHazards([]);
    }
  }, [hazardDistances]);
  
  // Effect to handle dismissing the alert when hazards are gone
  useEffect(() => {
    // If we have an active alert but no more active hazards, dismiss the alert
    if (emergencyBrakeAlertRef.current && activeHazards.length === 0) {
      // Stop the sound
      if (emergencyBrakeAudioRef.current) {
        emergencyBrakeAudioRef.current.pause();
        emergencyBrakeAudioRef.current.currentTime = 0;
      }
      
      // Dismiss the toast
      toast.dismiss(emergencyBrakeAlertRef.current);
      emergencyBrakeAlertRef.current = null;
    }
  }, [activeHazards]);
  
  return null; // This component doesn't render anything visible
}