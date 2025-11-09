import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import voiceAlertService, { PRIORITY } from '../services/voiceAlertService';
import { findNearbyHazardsInDirection, calculateHeadingFromMovement, getHazardNotificationMessage } from '../services/routeHazardProximityService';
import { API_BASE_URL } from '../config/api';

/**
 * RouteHazardNotifier Component
 * Monitors proximity to route hazards and sends notifications based on direction of travel
 */
export default function RouteHazardNotifier({ 
  currentLocation, 
  heading = null, 
  routeComparison = null,
  enabled = true 
}) {
  const [nearbyHazards, setNearbyHazards] = useState([]);
  const [lastNotifiedHazard, setLastNotifiedHazard] = useState(null);
  const previousLocationRef = useRef(null);
  const calculatedHeadingRef = useRef(null);
  const checkIntervalRef = useRef(null);
  const notificationCooldownRef = useRef({});

  useEffect(() => {
    if (!enabled || !currentLocation) {
      return;
    }

    // Calculate heading from movement if not provided
    let currentHeading = heading;
    if (!currentHeading && previousLocationRef.current) {
      const calculatedHeading = calculateHeadingFromMovement(
        previousLocationRef.current,
        currentLocation
      );
      if (calculatedHeading !== null) {
        calculatedHeadingRef.current = calculatedHeading;
        currentHeading = calculatedHeading;
      } else {
        currentHeading = calculatedHeadingRef.current; // Use last known heading
      }
    }

    // Update previous location
    previousLocationRef.current = { ...currentLocation };

    // Check for nearby hazards
    const checkNearbyHazards = async () => {
      try {
        // Get route hazards from routeComparison or fetch from API
        let allHazards = [];
        
        if (routeComparison) {
          // Combine hazards from both routes
          if (routeComparison.route_a?.hazards) {
            allHazards = [...allHazards, ...routeComparison.route_a.hazards];
          }
          if (routeComparison.route_b?.hazards) {
            allHazards = [...allHazards, ...routeComparison.route_b.hazards];
          }
        } else {
          // Fallback: fetch from API
          try {
            const response = await fetch(`${API_BASE_URL}/api/routes/compare`);
            if (response.ok) {
              const data = await response.json();
              if (data.route_a?.hazards) {
                allHazards = [...allHazards, ...data.route_a.hazards];
              }
              if (data.route_b?.hazards) {
                allHazards = [...allHazards, ...data.route_b.hazards];
              }
            }
          } catch (error) {
            console.warn('Failed to fetch route hazards:', error);
          }
        }

        if (allHazards.length === 0) {
          return;
        }

        // Find nearby hazards in direction of travel
        // Use heading if available, otherwise use a wider tolerance
        const tolerance = currentHeading !== null ? 45 : 90; // Wider tolerance if no heading
        const nearby = findNearbyHazardsInDirection(
          currentLocation,
          currentHeading || 0, // Default to 0 if no heading
          allHazards,
          0.5, // 500 meters max distance
          tolerance
        );

        setNearbyHazards(nearby);

        // Send notifications for new hazards
        nearby.forEach(hazard => {
          const hazardId = hazard.id;
          const now = Date.now();
          const cooldownKey = `${hazardId}_${hazard.distanceCategory}`;
          
          // Check cooldown (don't notify same hazard too frequently)
          const lastNotification = notificationCooldownRef.current[cooldownKey];
          if (lastNotification && (now - lastNotification) < 10000) { // 10 second cooldown
            return;
          }

          // Don't notify if it's the same hazard we just notified
          if (lastNotifiedHazard?.id === hazardId && 
              Math.abs(lastNotifiedHazard.distance - hazard.distance) < 20) {
            return;
          }

          const notification = getHazardNotificationMessage(hazard, hazard.distance);
          
          // Determine notification type based on urgency
          let toastType = toast.info;
          let autoClose = 5000;
          
          if (notification.urgency === 'immediate' || notification.severity >= 4) {
            toastType = toast.error;
            autoClose = 8000;
          } else if (notification.urgency === 'very_close' || notification.severity >= 3) {
            toastType = toast.warning;
            autoClose = 6000;
          }

          // Show toast notification
          toastType(
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                {notification.title}
              </div>
              <div style={{ fontSize: '0.9rem' }}>
                {notification.message}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                Distance: {Math.round(hazard.distance)}m
              </div>
            </div>,
            {
              autoClose,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            }
          );

          // Voice alert for critical hazards
          if (notification.urgency === 'immediate' || notification.severity >= 4) {
            const voiceMessage = `Warning! ${notification.title} ${Math.round(hazard.distance)} meters ahead. ${hazard.notes || 'Drive carefully.'}`;
            voiceAlertService.alert(voiceMessage, PRIORITY.HIGH);
          } else if (notification.urgency === 'very_close' || notification.severity >= 3) {
            const voiceMessage = `${notification.title} ${Math.round(hazard.distance)} meters ahead.`;
            voiceAlertService.warning(voiceMessage);
          }

          // Update cooldown and last notified
          notificationCooldownRef.current[cooldownKey] = now;
          setLastNotifiedHazard({ ...hazard });
        });

      } catch (error) {
        console.error('Error checking nearby route hazards:', error);
      }
    };

    // Initial check
    checkNearbyHazards();

    // Set up interval to check every 2 seconds (for real-time updates)
    if (!checkIntervalRef.current) {
      checkIntervalRef.current = setInterval(checkNearbyHazards, 2000);
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [currentLocation, heading, routeComparison, enabled]);

  // Expose nearby hazards for parent component
  useEffect(() => {
    if (window.routeHazardNotifier) {
      window.routeHazardNotifier.setNearbyHazards(nearbyHazards);
    }
  }, [nearbyHazards]);

  return null; // This component doesn't render anything
}

