"""
Geofence Service Module for Hazard Eye
Handles geofence zone management and location-based broadcasting
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from neon_db import neon_db
from mqtt_client import mqtt_client
from config import GEOFENCE_DEFAULT_RADIUS

logger = logging.getLogger(__name__)


class GeofenceService:
    """Service for managing geofence zones and broadcasting"""
    
    _instance: Optional['GeofenceService'] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GeofenceService, cls).__new__(cls)
        return cls._instance
    
    async def create_geofence_zone(
        self,
        name: str,
        center_lat: float,
        center_lng: float,
        radius_meters: float = GEOFENCE_DEFAULT_RADIUS,
        zone_type: str = 'custom',
        description: Optional[str] = None
    ) -> Optional[int]:
        """
        Create a new geofence zone
        
        Args:
            name: Zone name
            center_lat: Center latitude
            center_lng: Center longitude
            radius_meters: Radius in meters
            zone_type: Type of zone ('city', 'highway', 'custom')
            description: Optional description
            
        Returns:
            Zone ID if created successfully, None otherwise
        """
        try:
            if not neon_db._pool:
                await neon_db.connect()
            
            query = """
                INSERT INTO geofence_zones 
                (name, zone_type, center_location, radius_meters, description, is_active)
                VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, TRUE)
                RETURNING id
            """
            
            result = await neon_db.execute_fetchone(
                query,
                name,
                zone_type,
                center_lng,  # PostGIS uses (lng, lat) order
                center_lat,
                radius_meters,
                description
            )
            
            if result:
                zone_id = result.get('id')
                logger.info(f"Created geofence zone '{name}' with ID {zone_id}")
                return zone_id
            
            return None
            
        except Exception as e:
            logger.error(f"Error creating geofence zone: {e}")
            return None
    
    async def get_geofence_zones(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """
        Get all geofence zones
        
        Args:
            active_only: Only return active zones
            
        Returns:
            List of geofence zones
        """
        try:
            if not neon_db._pool:
                await neon_db.connect()
            
            if active_only:
                query = """
                    SELECT 
                        id,
                        name,
                        zone_type,
                        ST_Y(center_location::geometry) as center_lat,
                        ST_X(center_location::geometry) as center_lng,
                        radius_meters,
                        is_active,
                        description,
                        created_at,
                        updated_at
                    FROM geofence_zones
                    WHERE is_active = TRUE
                    ORDER BY name ASC
                """
            else:
                query = """
                    SELECT 
                        id,
                        name,
                        zone_type,
                        ST_Y(center_location::geometry) as center_lat,
                        ST_X(center_location::geometry) as center_lng,
                        radius_meters,
                        is_active,
                        description,
                        created_at,
                        updated_at
                    FROM geofence_zones
                    ORDER BY name ASC
                """
            
            return await neon_db.execute_query(query)
            
        except Exception as e:
            logger.error(f"Error getting geofence zones: {e}")
            return []
    
    async def find_zones_for_location(
        self,
        lat: float,
        lng: float
    ) -> List[Dict[str, Any]]:
        """
        Find all active geofence zones containing a location
        
        Args:
            lat: Latitude
            lng: Longitude
            
        Returns:
            List of zones containing the location
        """
        try:
            if not neon_db._pool:
                await neon_db.connect()
            
            query = """
                SELECT * FROM find_geofence_zones_for_point($1, $2)
            """
            
            return await neon_db.execute_query(query, lat, lng)
            
        except Exception as e:
            logger.error(f"Error finding zones for location: {e}")
            return []
    
    async def broadcast_to_geofence(
        self,
        detection_id: int,
        hazard_type: str,
        location: Dict[str, float],
        additional_data: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        Broadcast a hazard detection to all relevant geofence zones
        
        Args:
            detection_id: Database ID of the detection
            hazard_type: Type of hazard
            location: GPS location dict with 'lat' and 'lng'
            additional_data: Additional data to include in broadcast
            
        Returns:
            Number of zones broadcasted to
        """
        if not location or 'lat' not in location or 'lng' not in location:
            logger.warning("Cannot broadcast: invalid location")
            return 0
        
        try:
            # Find zones containing this location
            zones = await self.find_zones_for_location(location['lat'], location['lng'])
            
            if not zones:
                logger.debug(f"No geofence zones found for location {location}")
                return 0
            
            broadcast_count = 0
            
            for zone in zones:
                zone_id = zone.get('zone_id')
                zone_name = zone.get('zone_name')
                
                try:
                    # Get device subscriptions for this zone
                    subscriptions = await self.get_device_subscriptions_for_zone(
                        zone_id,
                        hazard_type
                    )
                    
                    # Build broadcast payload
                    payload = {
                        "hazard_type": hazard_type,
                        "location": location,
                        "zone_name": zone_name,
                        "zone_type": zone.get('zone_type'),
                        "distance_meters": zone.get('distance_meters'),
                        "device_count": len(subscriptions),
                        **(additional_data or {})
                    }
                    
                    # Publish to MQTT
                    success = await mqtt_client.publish_geofence_broadcast(
                        zone_id=zone_id,
                        detection_id=detection_id,
                        hazard_type=hazard_type,
                        location=location,
                        payload_data=payload
                    )
                    
                    if success:
                        # Log broadcast
                        await self._log_broadcast(
                            detection_id=detection_id,
                            zone_id=zone_id,
                            topic=f"hazard-eye/geofence/{zone_id}/hazards",
                            devices_notified=len(subscriptions)
                        )
                        broadcast_count += 1
                        logger.info(f"Broadcasted to geofence zone '{zone_name}' (ID: {zone_id})")
                    
                except Exception as e:
                    logger.error(f"Error broadcasting to zone {zone_id}: {e}")
                    continue
            
            return broadcast_count
            
        except Exception as e:
            logger.error(f"Error in geofence broadcast: {e}")
            return 0
    
    async def get_device_subscriptions_for_zone(
        self,
        zone_id: int,
        hazard_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get device subscriptions for a geofence zone
        
        Args:
            zone_id: Geofence zone ID
            hazard_type: Optional hazard type filter
            
        Returns:
            List of device subscriptions
        """
        try:
            if not neon_db._pool:
                await neon_db.connect()
            
            query = """
                SELECT * FROM get_device_subscriptions_for_zone($1, $2)
            """
            
            return await neon_db.execute_query(query, zone_id, hazard_type)
            
        except Exception as e:
            logger.error(f"Error getting device subscriptions: {e}")
            return []
    
    async def subscribe_device(
        self,
        device_id: str,
        zone_id: int,
        user_id: Optional[str] = None,
        subscription_type: str = 'all',
        hazard_types: Optional[List[str]] = None
    ) -> bool:
        """
        Subscribe a device to a geofence zone
        
        Args:
            device_id: Device identifier
            zone_id: Geofence zone ID
            user_id: Optional user ID
            subscription_type: 'all' or 'specific_types'
            hazard_types: List of hazard types (if subscription_type is 'specific_types')
            
        Returns:
            True if subscribed successfully
        """
        try:
            if not neon_db._pool:
                await neon_db.connect()
            
            # Check if subscription already exists
            check_query = """
                SELECT id FROM device_subscriptions
                WHERE device_id = $1 AND geofence_zone_id = $2
            """
            existing = await neon_db.execute_fetchone(check_query, device_id, zone_id)
            
            if existing:
                # Update existing subscription
                update_query = """
                    UPDATE device_subscriptions
                    SET subscription_type = $1,
                        subscribed_hazard_types = $2,
                        is_active = TRUE,
                        last_seen = CURRENT_TIMESTAMP
                    WHERE device_id = $3 AND geofence_zone_id = $4
                """
                await neon_db.execute_command(
                    update_query,
                    subscription_type,
                    hazard_types if hazard_types else [],
                    device_id,
                    zone_id
                )
            else:
                # Create new subscription
                insert_query = """
                    INSERT INTO device_subscriptions
                    (device_id, user_id, geofence_zone_id, subscription_type, subscribed_hazard_types, is_active, last_seen)
                    VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP)
                """
                await neon_db.execute_command(
                    insert_query,
                    device_id,
                    user_id,
                    zone_id,
                    subscription_type,
                    hazard_types if hazard_types else []
                )
            
            logger.info(f"Device {device_id} subscribed to zone {zone_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error subscribing device: {e}")
            return False
    
    async def _log_broadcast(
        self,
        detection_id: int,
        zone_id: int,
        topic: str,
        devices_notified: int
    ):
        """Log a geofence broadcast to the database"""
        try:
            if not neon_db._pool:
                await neon_db.connect()
            
            query = """
                INSERT INTO geofence_broadcasts
                (detection_id, geofence_zone_id, broadcast_topic, devices_notified, broadcasted_at)
                VALUES ($1, $2, $3, $4, $5)
            """
            
            await neon_db.execute_command(
                query,
                detection_id,
                zone_id,
                topic,
                devices_notified,
                datetime.now()
            )
            
        except Exception as e:
            logger.error(f"Error logging broadcast: {e}")


# Global geofence service instance
geofence_service = GeofenceService()

