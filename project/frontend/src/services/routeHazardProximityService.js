/**
 * Route Hazard Proximity Service
 * Checks proximity to route hazards considering vehicle direction
 */

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// Calculate bearing from point A to point B
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = deg2rad(lon2 - lon1);
  const lat1Rad = deg2rad(lat1);
  const lat2Rad = deg2rad(lat2);
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  const bearing = Math.atan2(y, x);
  return (bearing * 180 / Math.PI + 360) % 360; // Convert to degrees (0-360)
}

// Check if hazard is in the direction of travel
function isHazardInDirection(vehicleLat, vehicleLon, vehicleHeading, hazardLat, hazardLon, toleranceDegrees = 45) {
  const bearingToHazard = calculateBearing(vehicleLat, vehicleLon, hazardLat, hazardLon);
  
  // Calculate the difference between heading and bearing to hazard
  let angleDiff = Math.abs(bearingToHazard - vehicleHeading);
  
  // Handle wrap-around (e.g., 350° and 10° are only 20° apart)
  if (angleDiff > 180) {
    angleDiff = 360 - angleDiff;
  }
  
  return angleDiff <= toleranceDegrees;
}

/**
 * Find nearby hazards considering direction of travel
 * @param {Object} currentLocation - {lat, lon}
 * @param {Number} heading - Vehicle heading in degrees (0-360)
 * @param {Array} routeHazards - Array of hazard objects with lat, lon, type, severity
 * @param {Number} maxDistance - Maximum distance in km (default: 0.5km = 500m)
 * @param {Number} directionTolerance - Tolerance in degrees for direction check (default: 45°)
 * @returns {Array} Array of nearby hazards in direction of travel
 */
export function findNearbyHazardsInDirection(
  currentLocation,
  heading,
  routeHazards,
  maxDistance = 0.5, // 500 meters
  directionTolerance = 45
) {
  if (!currentLocation || !routeHazards || routeHazards.length === 0) {
    return [];
  }

  const nearbyHazards = routeHazards
    .map(hazard => {
      const distance = calculateDistance(
        currentLocation.lat,
        currentLocation.lon,
        hazard.lat,
        hazard.lon
      );

      if (distance <= maxDistance) {
        const bearingToHazard = calculateBearing(
          currentLocation.lat,
          currentLocation.lon,
          hazard.lat,
          hazard.lon
        );

        const isInDirection = isHazardInDirection(
          currentLocation.lat,
          currentLocation.lon,
          heading,
          hazard.lat,
          hazard.lon,
          directionTolerance
        );

        return {
          ...hazard,
          distance: distance * 1000, // Convert to meters
          bearing: bearingToHazard,
          isInDirection,
          distanceCategory: getDistanceCategory(distance * 1000)
        };
      }
      return null;
    })
    .filter(hazard => hazard !== null && hazard.isInDirection)
    .sort((a, b) => a.distance - b.distance); // Sort by distance (closest first)

  return nearbyHazards;
}

/**
 * Get distance category for notification urgency
 */
function getDistanceCategory(distanceMeters) {
  if (distanceMeters <= 50) return 'immediate'; // 0-50m
  if (distanceMeters <= 100) return 'very_close'; // 50-100m
  if (distanceMeters <= 200) return 'close'; // 100-200m
  if (distanceMeters <= 300) return 'approaching'; // 200-300m
  return 'nearby'; // 300-500m
}

/**
 * Calculate heading from two consecutive GPS positions
 * @param {Object} prevLocation - Previous location {lat, lon}
 * @param {Object} currentLocation - Current location {lat, lon}
 * @returns {Number} Heading in degrees (0-360) or null if insufficient data
 */
export function calculateHeadingFromMovement(prevLocation, currentLocation) {
  if (!prevLocation || !currentLocation) {
    return null;
  }

  return calculateBearing(
    prevLocation.lat,
    prevLocation.lon,
    currentLocation.lat,
    currentLocation.lon
  );
}

/**
 * Get notification message based on hazard and distance
 */
export function getHazardNotificationMessage(hazard, distanceMeters) {
  const hazardType = hazard.type?.replace('_', ' ') || 'hazard';
  const distance = distanceMeters < 1000 
    ? `${Math.round(distanceMeters)}m` 
    : `${(distanceMeters / 1000).toFixed(1)}km`;
  
  const severity = hazard.severity || 1;
  const severityText = severity >= 4 ? 'severe' : severity >= 3 ? 'moderate' : 'minor';
  
  return {
    title: `⚠️ ${severityText.charAt(0).toUpperCase() + severityText.slice(1)} ${hazardType} ahead`,
    message: `${hazardType} detected ${distance} ahead. ${hazard.notes || 'Drive carefully.'}`,
    distance: distanceMeters,
    severity: severity,
    type: hazard.type,
    urgency: getDistanceCategory(distanceMeters)
  };
}

export default {
  findNearbyHazardsInDirection,
  calculateHeadingFromMovement,
  getHazardNotificationMessage,
  calculateDistance,
  calculateBearing
};

