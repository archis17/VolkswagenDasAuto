"""
MQTT Client Module for Road Hazard Detection System
Handles MQTT publishing and subscribing for real-time hazard communication
"""
import os
import json
import logging
from typing import Optional, Dict, Any, Callable
from datetime import datetime
from dotenv import load_dotenv
import paho.mqtt.client as mqtt
from threading import Lock

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# MQTT Configuration
MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", None)
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", None)
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", f"hazard_detection_{os.getpid()}")
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "60"))
MQTT_QOS = int(os.getenv("MQTT_QOS", "1"))  # Quality of Service: 0, 1, or 2

# MQTT Topics
TOPIC_HAZARD_DETECTIONS = "hazards/detections"
TOPIC_HAZARD_ALERTS = "hazards/alerts"
TOPIC_HAZARD_REPORTS = "hazards/reports"
TOPIC_HAZARD_NEARBY = "hazards/nearby"  # For location-based subscriptions
TOPIC_SYSTEM_STATUS = "system/status"


class MQTTClient:
    """MQTT client singleton for publishing and subscribing to hazard messages"""
    
    _instance: Optional['MQTTClient'] = None
    _client: Optional[mqtt.Client] = None
    _lock = Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MQTTClient, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            self._connected = False
            self._connection_attempted = False
            self._subscribed_topics = set()
            self._message_callbacks: Dict[str, list] = {}  # topic -> [callbacks]
            self._reconnect_delay = 1.0
            self._max_reconnect_delay = 60.0
    
    def _on_connect(self, client, userdata, flags, rc):
        """Callback for when the client receives a CONNACK response from the server"""
        if rc == 0:
            self._connected = True
            logger.info(f"✅ MQTT connected to {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}")
            
            # Resubscribe to all previously subscribed topics
            for topic in self._subscribed_topics:
                client.subscribe(topic, qos=MQTT_QOS)
                logger.info(f"📡 Resubscribed to topic: {topic}")
            
            # Publish system status
            self.publish_system_status("online")
        else:
            self._connected = False
            error_messages = {
                1: "incorrect protocol version",
                2: "invalid client identifier",
                3: "server unavailable",
                4: "bad username or password",
                5: "not authorised"
            }
            error_msg = error_messages.get(rc, f"unknown error code {rc}")
            logger.error(f"❌ MQTT connection failed: {error_msg}")
    
    def _on_disconnect(self, client, userdata, rc):
        """Callback for when the client disconnects from the server"""
        self._connected = False
        if rc != 0:
            logger.warning(f"⚠️ MQTT unexpected disconnection (rc={rc})")
        else:
            logger.info("MQTT disconnected")
    
    def _on_message(self, client, userdata, msg):
        """Callback for when a PUBLISH message is received from the server"""
        try:
            topic = msg.topic
            payload = msg.payload.decode('utf-8')
            
            # Parse JSON payload
            try:
                data = json.loads(payload)
            except json.JSONDecodeError:
                logger.warning(f"Received non-JSON message on topic {topic}: {payload}")
                return
            
            # Call registered callbacks for this topic
            if topic in self._message_callbacks:
                for callback in self._message_callbacks[topic]:
                    try:
                        callback(topic, data)
                    except Exception as e:
                        logger.error(f"Error in MQTT message callback: {e}")
            
            # Also call callbacks for wildcard matches
            for registered_topic, callbacks in self._message_callbacks.items():
                if self._topic_matches(registered_topic, topic):
                    for callback in callbacks:
                        try:
                            callback(topic, data)
                        except Exception as e:
                            logger.error(f"Error in MQTT message callback: {e}")
            
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")
    
    def _on_publish(self, client, userdata, mid):
        """Callback for when a message that was to be sent is actually sent"""
        # Optional: can be used for message confirmation
        pass
    
    def _on_subscribe(self, client, userdata, mid, granted_qos):
        """Callback for when the broker responds to a SUBSCRIBE request"""
        logger.debug(f"Subscribed with QoS: {granted_qos}")
    
    def _topic_matches(self, pattern: str, topic: str) -> bool:
        """Check if a topic matches a pattern (supports + and # wildcards)"""
        if pattern == topic:
            return True
        
        # Simple wildcard matching (can be enhanced)
        pattern_parts = pattern.split('/')
        topic_parts = topic.split('/')
        
        if len(pattern_parts) != len(topic_parts):
            # Check for # wildcard at the end
            if pattern.endswith('/#') and len(topic_parts) >= len(pattern_parts) - 1:
                pattern_parts = pattern_parts[:-1]
                return pattern_parts == topic_parts[:len(pattern_parts)]
            return False
        
        for p, t in zip(pattern_parts, topic_parts):
            if p == '+':
                continue
            if p == '#':
                return True
            if p != t:
                return False
        
        return True
    
    def connect(self):
        """Establish MQTT connection"""
        if self._connection_attempted and self._connected:
            return
        
        self._connection_attempted = True
        
        try:
            # Create MQTT client
            self._client = mqtt.Client(
                client_id=MQTT_CLIENT_ID,
                clean_session=True,
                protocol=mqtt.MQTTv311
            )
            
            # Set callbacks
            self._client.on_connect = self._on_connect
            self._client.on_disconnect = self._on_disconnect
            self._client.on_message = self._on_message
            self._client.on_publish = self._on_publish
            self._client.on_subscribe = self._on_subscribe
            
            # Set username and password if provided
            if MQTT_USERNAME and MQTT_PASSWORD:
                self._client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
            
            # Connect to broker
            try:
                self._client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, MQTT_KEEPALIVE)
                self._client.loop_start()  # Start network loop in background thread
                logger.info(f"🔌 Connecting to MQTT broker at {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}...")
            except Exception as e:
                logger.error(f"❌ Failed to connect to MQTT broker: {e}")
                logger.warning("System will continue without MQTT. MQTT features will be disabled.")
                self._client = None
                self._connected = False
        
        except Exception as e:
            logger.error(f"Error initializing MQTT client: {e}")
            self._client = None
            self._connected = False
    
    def disconnect(self):
        """Disconnect from MQTT broker"""
        if self._client:
            try:
                self.publish_system_status("offline")
                self._client.loop_stop()
                self._client.disconnect()
                self._connected = False
                logger.info("MQTT disconnected")
            except Exception as e:
                logger.error(f"Error disconnecting MQTT client: {e}")
    
    def is_connected(self) -> bool:
        """Check if MQTT is connected"""
        if not self._client:
            return False
        return self._connected
    
    def publish(self, topic: str, payload: Dict[str, Any], qos: Optional[int] = None) -> bool:
        """
        Publish a message to an MQTT topic
        
        Args:
            topic: MQTT topic to publish to
            payload: Dictionary to publish as JSON
            qos: Quality of Service (0, 1, or 2). Defaults to MQTT_QOS
            
        Returns:
            True if published successfully, False otherwise
        """
        if not self.is_connected():
            logger.debug(f"MQTT not connected, skipping publish to {topic}")
            return False
        
        try:
            qos = qos if qos is not None else MQTT_QOS
            json_payload = json.dumps(payload, default=str)
            result = self._client.publish(topic, json_payload, qos=qos)
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.debug(f"📤 Published to {topic}: {payload.get('type', 'unknown')}")
                return True
            else:
                logger.error(f"Failed to publish to {topic}: error code {result.rc}")
                return False
        
        except Exception as e:
            logger.error(f"Error publishing MQTT message: {e}")
            return False
    
    def subscribe(self, topic: str, callback: Callable[[str, Dict[str, Any]], None], qos: Optional[int] = None) -> bool:
        """
        Subscribe to an MQTT topic
        
        Args:
            topic: MQTT topic to subscribe to (supports + and # wildcards)
            callback: Function to call when message is received (topic, data)
            qos: Quality of Service (0, 1, or 2). Defaults to MQTT_QOS
            
        Returns:
            True if subscribed successfully, False otherwise
        """
        if not self.is_connected():
            logger.warning(f"MQTT not connected, cannot subscribe to {topic}")
            return False
        
        try:
            qos = qos if qos is not None else MQTT_QOS
            
            # Register callback
            if topic not in self._message_callbacks:
                self._message_callbacks[topic] = []
            self._message_callbacks[topic].append(callback)
            
            # Subscribe to topic
            result, mid = self._client.subscribe(topic, qos=qos)
            
            if result == mqtt.MQTT_ERR_SUCCESS:
                self._subscribed_topics.add(topic)
                logger.info(f"📡 Subscribed to topic: {topic}")
                return True
            else:
                logger.error(f"Failed to subscribe to {topic}: error code {result}")
                return False
        
        except Exception as e:
            logger.error(f"Error subscribing to MQTT topic: {e}")
            return False
    
    def unsubscribe(self, topic: str) -> bool:
        """Unsubscribe from an MQTT topic"""
        if not self.is_connected():
            return False
        
        try:
            self._client.unsubscribe(topic)
            self._subscribed_topics.discard(topic)
            if topic in self._message_callbacks:
                del self._message_callbacks[topic]
            logger.info(f"Unsubscribed from topic: {topic}")
            return True
        except Exception as e:
            logger.error(f"Error unsubscribing from MQTT topic: {e}")
            return False
    
    def publish_hazard_detection(
        self,
        hazard_type: str,
        location: Optional[Dict[str, float]],
        confidence: float,
        driver_lane: bool = False,
        distance_meters: Optional[float] = None,
        bounding_box: Optional[list] = None,
        timestamp: Optional[datetime] = None
    ) -> bool:
        """
        Publish a hazard detection event
        
        Args:
            hazard_type: Type of hazard (pothole, speedbump, person, etc.)
            location: GPS coordinates {'lat': float, 'lng': float}
            confidence: Detection confidence score
            driver_lane: Whether hazard is in driver's lane
            distance_meters: Distance to hazard in meters
            bounding_box: Bounding box coordinates [x1, y1, x2, y2]
            timestamp: Detection timestamp
            
        Returns:
            True if published successfully
        """
        payload = {
            "type": "hazard_detection",
            "hazard_type": hazard_type,
            "location": location,
            "confidence": confidence,
            "driver_lane": driver_lane,
            "distance_meters": distance_meters,
            "bounding_box": bounding_box,
            "timestamp": (timestamp or datetime.now()).isoformat(),
            "source": "hazard_detection_system"
        }
        
        return self.publish(TOPIC_HAZARD_DETECTIONS, payload)
    
    def publish_hazard_alert(
        self,
        hazard_type: str,
        location: Dict[str, float],
        severity: str = "medium",
        message: Optional[str] = None,
        timestamp: Optional[datetime] = None
    ) -> bool:
        """
        Publish a hazard alert (for critical hazards requiring immediate attention)
        
        Args:
            hazard_type: Type of hazard
            location: GPS coordinates
            severity: Alert severity (low, medium, high, critical)
            message: Optional alert message
            timestamp: Alert timestamp
            
        Returns:
            True if published successfully
        """
        payload = {
            "type": "hazard_alert",
            "hazard_type": hazard_type,
            "location": location,
            "severity": severity,
            "message": message,
            "timestamp": (timestamp or datetime.now()).isoformat(),
            "source": "hazard_detection_system"
        }
        
        return self.publish(TOPIC_HAZARD_ALERTS, payload)
    
    def publish_hazard_report(
        self,
        hazard_type: str,
        location: Dict[str, float],
        report_id: Optional[int] = None,
        map_link: Optional[str] = None,
        timestamp: Optional[datetime] = None
    ) -> bool:
        """
        Publish a hazard report (when reported to authorities)
        
        Args:
            hazard_type: Type of hazard
            location: GPS coordinates
            report_id: Database report ID
            map_link: Google Maps link
            timestamp: Report timestamp
            
        Returns:
            True if published successfully
        """
        payload = {
            "type": "hazard_report",
            "hazard_type": hazard_type,
            "location": location,
            "report_id": report_id,
            "map_link": map_link,
            "timestamp": (timestamp or datetime.now()).isoformat(),
            "source": "hazard_detection_system"
        }
        
        return self.publish(TOPIC_HAZARD_REPORTS, payload)
    
    def publish_system_status(self, status: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        Publish system status
        
        Args:
            status: Status string (online, offline, error, etc.)
            metadata: Optional additional status information
            
        Returns:
            True if published successfully
        """
        payload = {
            "type": "system_status",
            "status": status,
            "timestamp": datetime.now().isoformat(),
            "client_id": MQTT_CLIENT_ID
        }
        
        if metadata:
            payload.update(metadata)
        
        return self.publish(TOPIC_SYSTEM_STATUS, payload, qos=0)  # QoS 0 for status updates
    
    def subscribe_to_nearby_hazards(
        self,
        location: Dict[str, float],
        radius_km: float = 1.0,
        callback: Optional[Callable[[str, Dict[str, Any]], None]] = None
    ) -> bool:
        """
        Subscribe to nearby hazard alerts based on location
        
        Args:
            location: GPS coordinates {'lat': float, 'lng': float}
            radius_km: Radius in kilometers (for topic routing, actual filtering done in callback)
            callback: Optional callback function (topic, data)
            
        Returns:
            True if subscribed successfully
        """
        # Subscribe to nearby alerts topic
        # In a real implementation, you might use geohash-based topics
        topic = f"{TOPIC_HAZARD_NEARBY}/+"
        
        def default_callback(topic, data):
            # Filter by distance if location provided
            if 'location' in data and location:
                # Simple distance check (can be enhanced with proper geospatial calculation)
                alert_lat = data['location'].get('lat')
                alert_lng = data['location'].get('lng')
                if alert_lat and alert_lng:
                    # Rough distance calculation (Haversine would be better)
                    lat_diff = abs(alert_lat - location['lat'])
                    lng_diff = abs(alert_lng - location['lng'])
                    distance_approx = ((lat_diff ** 2 + lng_diff ** 2) ** 0.5) * 111  # km
                    
                    if distance_approx <= radius_km:
                        logger.info(f"🚨 Nearby hazard alert: {data.get('hazard_type')} at {distance_approx:.2f}km")
                        if callback:
                            callback(topic, data)
            else:
                if callback:
                    callback(topic, data)
        
        return self.subscribe(topic, callback or default_callback)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get MQTT client statistics"""
        stats = {
            "connected": self.is_connected(),
            "broker_host": MQTT_BROKER_HOST,
            "broker_port": MQTT_BROKER_PORT,
            "client_id": MQTT_CLIENT_ID,
            "subscribed_topics": list(self._subscribed_topics),
            "qos": MQTT_QOS
        }
        
        if self._client:
            try:
                stats["keepalive"] = MQTT_KEEPALIVE
            except:
                pass
        
        return stats


# Global MQTT client instance
mqtt_client = MQTTClient()

