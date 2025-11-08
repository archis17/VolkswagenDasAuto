"""
MQTT Client Module for Hazard Eye
Handles MQTT publishing for hazard detections and IoT integration
"""
import asyncio
import json
import logging
import ssl
from typing import Optional, Dict, Any
from datetime import datetime
from aiomqtt import Client, MqttError
from config import (
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    MQTT_USERNAME,
    MQTT_PASSWORD,
    MQTT_CLIENT_ID,
    MQTT_ENABLED
)
from neon_db import neon_db

logger = logging.getLogger(__name__)


class MQTTClient:
    """Async MQTT client for publishing hazard detections"""
    
    _instance: Optional['MQTTClient'] = None
    _client: Optional[Client] = None
    _connected: bool = False
    _reconnect_task: Optional[asyncio.Task] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MQTTClient, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not MQTT_ENABLED:
            logger.info("MQTT is disabled in configuration")
            return
        
        self.broker_host = MQTT_BROKER_HOST
        self.broker_port = MQTT_BROKER_PORT
        self.username = MQTT_USERNAME
        self.password = MQTT_PASSWORD
        self.client_id = MQTT_CLIENT_ID
    
    async def connect(self):
        """Connect to MQTT broker"""
        if not MQTT_ENABLED:
            return
        
        if self._connected and self._client:
            return
        
        try:
            # Create client with authentication if provided
            client_kwargs = {
                "hostname": self.broker_host,
                "port": self.broker_port,
                "identifier": self.client_id,
                "keepalive": 60
            }
            
            # Enable TLS/SSL for secure ports (typically 8883)
            if self.broker_port == 8883 or self.broker_port == 8884:
                # Create SSL context for TLS connection
                tls_context = ssl.create_default_context()
                # Try both parameter names (tls_context is more common in aiomqtt)
                client_kwargs["tls_context"] = tls_context
            
            if self.username and self.password:
                client_kwargs["username"] = self.username
                client_kwargs["password"] = self.password
            
            self._client = Client(**client_kwargs)
            # Use asyncio.wait_for to add an additional timeout layer
            await asyncio.wait_for(self._client.__aenter__(), timeout=5.0)
            self._connected = True
            logger.info(f"Connected to MQTT broker at {self.broker_host}:{self.broker_port}")
            
        except asyncio.TimeoutError:
            logger.warning(f"MQTT connection timeout: Could not connect to broker at {self.broker_host}:{self.broker_port} within 5 seconds. MQTT features will be disabled.")
            self._connected = False
            self._client = None
        except MqttError as e:
            logger.error(f"MQTT connection error: {e}")
            self._connected = False
            self._client = None
        except Exception as e:
            logger.error(f"Failed to connect to MQTT broker: {e}")
            self._connected = False
            self._client = None
    
    async def disconnect(self):
        """Disconnect from MQTT broker"""
        if self._client and self._connected:
            try:
                await self._client.__aexit__(None, None, None)
                self._connected = False
                logger.info("Disconnected from MQTT broker")
            except Exception as e:
                logger.error(f"Error disconnecting from MQTT broker: {e}")
            finally:
                self._client = None
    
    async def ensure_connected(self):
        """Ensure MQTT connection is active, reconnect if needed"""
        if not MQTT_ENABLED:
            return False
        
        if not self._connected or not self._client:
            await self.connect()
        
        return self._connected
    
    async def publish_detection(
        self,
        detection_id: int,
        hazard_type: str,
        location: Optional[Dict[str, float]],
        confidence: float,
        timestamp: datetime,
        qos: int = 1
    ) -> bool:
        """
        Publish a hazard detection to MQTT
        
        Args:
            detection_id: Database ID of the detection
            hazard_type: Type of hazard detected
            location: GPS location dict with 'lat' and 'lng'
            confidence: Detection confidence score
            timestamp: Detection timestamp
            qos: MQTT QoS level (0, 1, or 2)
            
        Returns:
            True if published successfully, False otherwise
        """
        if not MQTT_ENABLED:
            return False
        
        if not await self.ensure_connected():
            logger.warning("MQTT not connected, cannot publish detection")
            await self._log_publish_attempt(detection_id, None, "failed", "Not connected")
            return False
        
        try:
            # Build topic: hazard-eye/detections/{hazard_type}/{lat}/{lng}
            if location and 'lat' in location and 'lng' in location:
                lat = round(location['lat'], 6)
                lng = round(location['lng'], 6)
                topic = f"hazard-eye/detections/{hazard_type}/{lat}/{lng}"
            else:
                topic = f"hazard-eye/detections/{hazard_type}/unknown"
            
            # Build payload
            payload = {
                "detection_id": detection_id,
                "hazard_type": hazard_type,
                "location": location,
                "confidence": confidence,
                "timestamp": timestamp.isoformat(),
                "source": "hazard-eye-backend"
            }
            
            payload_json = json.dumps(payload)
            
            # Publish message
            await self._client.publish(topic, payload_json, qos=qos)
            
            # Log successful publish
            await self._log_publish_attempt(detection_id, topic, "published", None)
            
            logger.debug(f"Published detection {detection_id} to topic {topic}")
            return True
            
        except MqttError as e:
            logger.error(f"MQTT publish error: {e}")
            await self._log_publish_attempt(detection_id, topic if 'topic' in locals() else None, "failed", str(e))
            self._connected = False
            return False
        except Exception as e:
            logger.error(f"Unexpected error publishing to MQTT: {e}")
            await self._log_publish_attempt(detection_id, topic if 'topic' in locals() else None, "failed", str(e))
            return False
    
    async def publish_geofence_broadcast(
        self,
        zone_id: int,
        detection_id: int,
        hazard_type: str,
        location: Dict[str, float],
        payload_data: Dict[str, Any],
        qos: int = 2
    ) -> bool:
        """
        Publish a geofence broadcast to MQTT
        
        Args:
            zone_id: Geofence zone ID
            detection_id: Database ID of the detection
            hazard_type: Type of hazard
            location: GPS location
            payload_data: Additional payload data
            qos: MQTT QoS level (default: 2 for critical broadcasts)
            
        Returns:
            True if published successfully, False otherwise
        """
        if not MQTT_ENABLED:
            return False
        
        if not await self.ensure_connected():
            logger.warning("MQTT not connected, cannot publish geofence broadcast")
            return False
        
        try:
            topic = f"hazard-eye/geofence/{zone_id}/hazards"
            
            payload = {
                "detection_id": detection_id,
                "hazard_type": hazard_type,
                "location": location,
                "zone_id": zone_id,
                "timestamp": datetime.now().isoformat(),
                **payload_data
            }
            
            payload_json = json.dumps(payload)
            
            await self._client.publish(topic, payload_json, qos=qos)
            
            logger.info(f"Published geofence broadcast for zone {zone_id} to topic {topic}")
            return True
            
        except Exception as e:
            logger.error(f"Error publishing geofence broadcast: {e}")
            return False
    
    async def _log_publish_attempt(
        self,
        detection_id: int,
        topic: Optional[str],
        status: str,
        error_message: Optional[str]
    ):
        """Log MQTT publish attempt to database"""
        try:
            if not neon_db._pool:
                await neon_db.connect()
            
            query = """
                INSERT INTO mqtt_publish_log 
                (detection_id, topic, payload, qos, published_at, status, error_message)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            """
            
            payload_json = json.dumps({"detection_id": detection_id}) if detection_id else None
            
            await neon_db.execute_command(
                query,
                detection_id,
                topic,
                payload_json,
                1,  # Default QoS
                datetime.now(),
                status,
                error_message
            )
        except Exception as e:
            logger.error(f"Failed to log MQTT publish attempt: {e}")
    
    def is_connected(self) -> bool:
        """Check if MQTT client is connected"""
        return self._connected and MQTT_ENABLED
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get MQTT client statistics"""
        stats = {
            "enabled": MQTT_ENABLED,
            "connected": self.is_connected(),
            "broker_host": self.broker_host if MQTT_ENABLED else None,
            "broker_port": self.broker_port if MQTT_ENABLED else None
        }
        
        if MQTT_ENABLED and neon_db._pool:
            try:
                # Get publish statistics from database
                query = """
                    SELECT 
                        COUNT(*) as total_publishes,
                        COUNT(CASE WHEN status = 'published' THEN 1 END) as successful,
                        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
                    FROM mqtt_publish_log
                """
                result = await neon_db.execute_fetchone(query)
                if result:
                    stats.update({
                        "total_publishes": result.get('total_publishes', 0),
                        "successful_publishes": result.get('successful', 0),
                        "failed_publishes": result.get('failed', 0)
                    })
            except Exception as e:
                logger.error(f"Error getting MQTT stats: {e}")
        
        return stats


# Global MQTT client instance
mqtt_client = MQTTClient()

