"""
Redis Client Module for Hazard Detection System
Handles Redis connection and operations for duplicate detection
"""
import os
import redis
from typing import Optional, Dict, Any
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure logging - set to WARNING level to suppress connection errors
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)
logger.setLevel(logging.WARNING)  # Only show warnings and errors

# Redis configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)
REDIS_URL = os.getenv("REDIS_URL", None)

# Default TTL for hazard keys (30 minutes)
HAZARD_KEY_TTL = int(os.getenv("HAZARD_KEY_TTL", "1800"))  # 30 minutes in seconds


class RedisClient:
    """Redis client singleton for managing duplicate detection"""
    
    _instance: Optional['RedisClient'] = None
    _client: Optional[redis.Redis] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RedisClient, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            # Don't connect on initialization - connect lazily
            self._connection_attempted = False
            pass
    
    def _connect(self):
        """Establish Redis connection (lazy connection)"""
        if self._connection_attempted:
            return  # Already attempted
        
        self._connection_attempted = True
        
        try:
            if REDIS_URL:
                # Use Redis URL if provided
                self._client = redis.from_url(
                    REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_keepalive=True,
                    health_check_interval=30
                )
            else:
                # Use host/port configuration
                self._client = redis.Redis(
                    host=REDIS_HOST,
                    port=REDIS_PORT,
                    db=REDIS_DB,
                    password=REDIS_PASSWORD,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_keepalive=True,
                    health_check_interval=30
                )
            
            # Test connection
            self._client.ping()
            logger.info(f"Redis connected successfully to {REDIS_HOST}:{REDIS_PORT}")
        except (redis.ConnectionError, redis.TimeoutError, ConnectionRefusedError, OSError):
            # Silently handle connection errors - Redis is optional
            # The system will work without Redis, just without fast duplicate detection
            self._client = None
        except Exception as e:
            # Log unexpected errors but don't fail
            logger.debug(f"Redis connection issue: {e}. System will continue without Redis.")
            self._client = None
    
    def ensure_connected(self):
        """Ensure Redis connection is attempted"""
        if not self._connection_attempted:
            self._connect()
    
    def is_connected(self) -> bool:
        """Check if Redis is connected"""
        self.ensure_connected()  # Attempt connection if not tried yet
        if self._client is None:
            return False
        try:
            self._client.ping()
            return True
        except:
            return False
    
    def check_duplicate(self, hash_key: str) -> bool:
        """
        Check if a hazard hash key already exists in Redis
        
        Args:
            hash_key: The hash key to check
            
        Returns:
            True if duplicate exists, False otherwise
        """
        self.ensure_connected()
        if not self.is_connected():
            return False
        
        try:
            exists = self._client.exists(hash_key)
            return exists > 0
        except Exception as e:
            logger.error(f"Error checking duplicate in Redis: {e}")
            return False
    
    def store_hazard_key(self, hash_key: str, ttl: Optional[int] = None) -> bool:
        """
        Store a hazard hash key in Redis with TTL
        
        Args:
            hash_key: The hash key to store
            ttl: Time to live in seconds (default: HAZARD_KEY_TTL)
            
        Returns:
            True if stored successfully, False otherwise
        """
        self.ensure_connected()
        if not self.is_connected():
            return False
        
        try:
            ttl = ttl or HAZARD_KEY_TTL
            self._client.setex(hash_key, ttl, "1")
            return True
        except Exception as e:
            logger.error(f"Error storing hazard key in Redis: {e}")
            return False
    
    def get_hazard_key(self, hash_key: str) -> Optional[str]:
        """
        Get a hazard hash key value from Redis
        
        Args:
            hash_key: The hash key to retrieve
            
        Returns:
            The value if exists, None otherwise
        """
        if not self.is_connected():
            return None
        
        try:
            return self._client.get(hash_key)
        except Exception as e:
            logger.error(f"Error getting hazard key from Redis: {e}")
            return None
    
    def delete_hazard_key(self, hash_key: str) -> bool:
        """
        Delete a hazard hash key from Redis
        
        Args:
            hash_key: The hash key to delete
            
        Returns:
            True if deleted successfully, False otherwise
        """
        if not self.is_connected():
            return False
        
        try:
            return self._client.delete(hash_key) > 0
        except Exception as e:
            logger.error(f"Error deleting hazard key from Redis: {e}")
            return False
    
    def get_ttl(self, hash_key: str) -> int:
        """
        Get the remaining TTL for a hash key
        
        Args:
            hash_key: The hash key to check
            
        Returns:
            TTL in seconds, -1 if key doesn't exist, -2 if key exists but has no expiry
        """
        if not self.is_connected():
            return -1
        
        try:
            return self._client.ttl(hash_key)
        except Exception as e:
            logger.error(f"Error getting TTL from Redis: {e}")
            return -1
    
    def flush_all(self) -> bool:
        """
        Flush all keys from Redis (use with caution!)
        
        Returns:
            True if successful, False otherwise
        """
        if not self.is_connected():
            return False
        
        try:
            self._client.flushdb()
            logger.warning("Redis database flushed")
            return True
        except Exception as e:
            logger.error(f"Error flushing Redis: {e}")
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get Redis connection and statistics
        
        Returns:
            Dictionary with connection status and stats
        """
        stats = {
            "connected": self.is_connected(),
            "host": REDIS_HOST,
            "port": REDIS_PORT,
            "db": REDIS_DB
        }
        
        if self.is_connected():
            try:
                info = self._client.info()
                stats.update({
                    "used_memory": info.get("used_memory_human", "N/A"),
                    "connected_clients": info.get("connected_clients", 0),
                    "total_keys": self._client.dbsize()
                })
            except Exception as e:
                logger.error(f"Error getting Redis stats: {e}")
        
        return stats


# Global Redis client instance
redis_client = RedisClient()

