/**
 * Voice Message Templates
 * Centralized message templates for different hazard types and scenarios
 */

/**
 * Get emergency alert message based on hazard type
 */
export function getEmergencyMessage(hazardType, distance = null) {
  const messages = {
    person: distance 
      ? `Emergency! Person detected ${distance} meters ahead. Apply brakes immediately.`
      : `Emergency! Person detected ahead. Apply brakes immediately.`,
    
    dog: distance
      ? `Emergency! Dog detected ${distance} meters ahead. Slow down now.`
      : `Emergency! Dog on road. Slow down now.`,
    
    cow: distance
      ? `Emergency! Large animal detected ${distance} meters ahead. Stop immediately.`
      : `Emergency! Large animal on road. Stop immediately.`,
    
    default: distance
      ? `Emergency! Obstacle detected ${distance} meters ahead in your lane. Stop immediately.`
      : `Emergency! Obstacle in your lane. Stop immediately.`
  };

  const normalizedType = hazardType?.toLowerCase() || 'default';
  return messages[normalizedType] || messages.default;
}

/**
 * Get hazard alert message based on hazard type
 */
export function getHazardMessage(hazardType, distance = null, inDriverLane = false) {
  const laneText = inDriverLane ? ' in your lane' : '';
  const distanceText = distance ? ` ${distance} meters ahead` : '';
  
  const messages = {
    pothole: distance
      ? `Pothole detected${distanceText}${laneText}. Slow down.`
      : `Pothole ahead${laneText}. Slow down.`,
    
    speedbump: distance
      ? `Speed bump detected${distanceText}${laneText}. Reduce speed.`
      : `Speed bump ahead${laneText}. Reduce speed.`,
    
    default: distance
      ? `Road hazard detected${distanceText}${laneText}. Reduce speed.`
      : `Road hazard detected${laneText}. Reduce speed.`
  };

  const normalizedType = hazardType?.toLowerCase() || 'default';
  return messages[normalizedType] || messages.default;
}

/**
 * Get warning message for nearby hazards
 */
export function getWarningMessage(hazardType, count = 1, distance = null) {
  if (count > 1) {
    return distance
      ? `${count} ${hazardType}s detected nearby within ${distance} meters. Drive carefully.`
      : `${count} ${hazardType}s detected nearby. Drive carefully.`;
  }
  
  return distance
    ? `${hazardType} detected nearby within ${distance} meters. Drive carefully.`
    : `${hazardType} detected nearby. Drive carefully.`;
}

/**
 * Get general road hazard message
 */
export function getRoadHazardMessage(hazardCount, inDriverLane = false) {
  if (hazardCount === 0) return null;
  
  const laneText = inDriverLane ? ' in your lane' : '';
  
  if (hazardCount === 1) {
    return `Road hazard detected${laneText}. Reduce speed.`;
  }
  
  return `Multiple hazards detected${laneText}. Stay alert and reduce speed.`;
}

/**
 * Get distance-based message with appropriate units
 */
export function formatDistance(meters) {
  if (!meters || meters < 0) return null;
  
  if (meters < 1) {
    return 'less than 1 meter';
  } else if (meters < 10) {
    return `${Math.round(meters)} meters`;
  } else if (meters < 100) {
    return `${Math.round(meters / 10) * 10} meters`;
  } else {
    return `${Math.round(meters / 100) / 10} kilometers`;
  }
}

/**
 * Get contextual message based on detection data
 */
export function getContextualMessage(detection) {
  const { type, distance, inDriverLane, priority } = detection;
  
  // Emergency priority (close range, driver's lane)
  if (priority === 'emergency' || (distance && distance < 12 && inDriverLane)) {
    return getEmergencyMessage(type, distance ? formatDistance(distance) : null);
  }
  
  // Hazard priority (in driver's lane)
  if (inDriverLane) {
    return getHazardMessage(type, distance ? formatDistance(distance) : null, true);
  }
  
  // Warning priority (nearby)
  return getWarningMessage(type, 1, distance ? formatDistance(distance) : null);
}

