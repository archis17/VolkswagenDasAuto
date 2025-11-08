"""
Neon DB Client Module with PostGIS Support
Handles PostgreSQL/PostGIS database operations for Neon DB
"""
import os
import asyncpg
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from dotenv import load_dotenv
import logging
from contextlib import asynccontextmanager

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# Database configuration
NEON_DATABASE_URL = os.getenv("NEON_DATABASE_URL", "")


class NeonDB:
    """Neon DB client with PostGIS support for async operations"""
    
    _instance: Optional['NeonDB'] = None
    _pool: Optional[asyncpg.Pool] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(NeonDB, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._pool is None:
            self._database_url = NEON_DATABASE_URL
    
    async def connect(self):
        """Create database connection pool"""
        if not self._database_url:
            raise ValueError("NEON_DATABASE_URL environment variable is not set")
        
        try:
            self._pool = await asyncpg.create_pool(
                self._database_url,
                min_size=2,
                max_size=10,
                command_timeout=60
            )
            logger.info("Connected to Neon DB successfully")
            
            # Ensure PostGIS extension is enabled
            await self._ensure_postgis()
            
        except Exception as e:
            logger.error(f"Failed to connect to Neon DB: {e}")
            raise
    
    async def disconnect(self):
        """Close database connection pool"""
        if self._pool:
            await self._pool.close()
            self._pool = None
            logger.info("Disconnected from Neon DB")
    
    async def _ensure_postgis(self):
        """Ensure PostGIS extension is enabled"""
        try:
            async with self._pool.acquire() as conn:
                # Enable PostGIS extension if not already enabled
                await conn.execute("CREATE EXTENSION IF NOT EXISTS postgis")
                logger.info("PostGIS extension enabled")
        except Exception as e:
            logger.warning(f"Could not enable PostGIS extension: {e}")
    
    async def execute_query(self, query: str, *args) -> List[Dict[str, Any]]:
        """Execute a SELECT query and return results as list of dictionaries"""
        if not self._pool:
            await self.connect()
        
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, *args)
            return [dict(row) for row in rows]
    
    async def execute_command(self, query: str, *args) -> str:
        """Execute an INSERT/UPDATE/DELETE command and return the result"""
        if not self._pool:
            await self.connect()
        
        async with self._pool.acquire() as conn:
            result = await conn.execute(query, *args)
            return result
    
    async def execute_fetchone(self, query: str, *args) -> Optional[Dict[str, Any]]:
        """Execute a query and return a single row"""
        if not self._pool:
            await self.connect()
        
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, *args)
            return dict(row) if row else None
    
    @asynccontextmanager
    async def transaction(self):
        """Context manager for database transactions"""
        if not self._pool:
            await self.connect()
        
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                yield conn
    
    async def insert_hazard_report(
        self,
        location: Dict[str, float],
        hazard_type: str,
        timestamp: datetime,
        map_link: str,
        hash_key: str,
        status: str = "reported"
    ) -> int:
        """
        Insert a new hazard report into the database
        
        Args:
            location: Dictionary with 'lat' and 'lng' keys
            hazard_type: Type of hazard
            timestamp: Timestamp of the hazard
            map_link: Google Maps link
            hash_key: Hash key for duplicate detection
            status: Status of the report (default: "reported")
            
        Returns:
            The ID of the inserted report
        """
        query = """
            INSERT INTO hazard_reports (location, hazard_type, timestamp, map_link, hash_key, status)
            VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $5, $6, $7)
            RETURNING id
        """
        
        row = await self.execute_fetchone(
            query,
            location['lng'],  # Note: PostGIS uses (lng, lat) order
            location['lat'],
            hazard_type,
            timestamp,
            map_link,
            hash_key,
            status
        )
        
        return row['id'] if row else None
    
    async def insert_hazard_detection(
        self,
        location: Optional[Dict[str, float]],
        hazard_type: str,
        timestamp: datetime,
        detection_confidence: Optional[float] = None,
        bounding_box: Optional[list] = None,
        driver_lane: bool = False,
        distance_meters: Optional[float] = None,
        frame_number: Optional[int] = None,
        video_path: Optional[str] = None,
        source: str = "websocket"
    ) -> Optional[int]:
        """
        Insert a hazard detection into the database (automatic detection, not user report)
        
        Args:
            location: Dictionary with 'lat' and 'lng' keys (optional)
            hazard_type: Type of hazard
            timestamp: Timestamp of the detection
            detection_confidence: Confidence score of detection
            bounding_box: Bounding box coordinates [x1, y1, x2, y2]
            driver_lane: Whether hazard is in driver's lane
            distance_meters: Distance to hazard in meters
            frame_number: Frame number in video
            video_path: Path to video file
            source: Source of detection (default: "websocket")
            
        Returns:
            The ID of the inserted detection, or None if location is missing
        """
        import json
        
        # If no location, still store but with NULL location
        if location:
            query = """
                INSERT INTO hazard_detections 
                (location, hazard_type, timestamp, detection_confidence, bounding_box, 
                 driver_lane, distance_meters, frame_number, video_path, source)
                VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id
            """
            
            bbox_json = json.dumps(bounding_box) if bounding_box else None
            
            row = await self.execute_fetchone(
                query,
                location['lng'],  # PostGIS uses (lng, lat) order
                location['lat'],
                hazard_type,
                timestamp,
                detection_confidence,
                bbox_json,
                driver_lane,
                distance_meters,
                frame_number,
                video_path,
                source
            )
        else:
            # Store without location
            query = """
                INSERT INTO hazard_detections 
                (location, hazard_type, timestamp, detection_confidence, bounding_box, 
                 driver_lane, distance_meters, frame_number, video_path, source)
                VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            """
            
            bbox_json = json.dumps(bounding_box) if bounding_box else None
            
            row = await self.execute_fetchone(
                query,
                hazard_type,
                timestamp,
                detection_confidence,
                bbox_json,
                driver_lane,
                distance_meters,
                frame_number,
                video_path,
                source
            )
        
        return row['id'] if row else None
    
    async def find_nearby_hazards(
        self,
        location: Dict[str, float],
        radius_meters: float = 100.0,
        days_back: int = 7
    ) -> List[Dict[str, Any]]:
        """
        Find hazards within a specified radius using PostGIS
        
        Args:
            location: Dictionary with 'lat' and 'lng' keys
            radius_meters: Search radius in meters (default: 100m)
            days_back: Number of days to look back (default: 7)
            
        Returns:
            List of nearby hazard reports
        """
        cutoff_date = datetime.now() - timedelta(days=days_back)
        
        # Validate coordinates
        lat = location.get('lat', 0)
        lng = location.get('lng', 0)
        
        # Check if coordinates might be swapped
        if abs(lat) > 90 or abs(lng) > 180:
            # Coordinates might be swapped, auto-correct
            if abs(lat) <= 180 and abs(lng) <= 90:
                lat, lng = lng, lat  # Swap them
        
        query = """
            SELECT 
                id,
                CASE 
                    WHEN location IS NOT NULL THEN ST_Y(location::geometry)
                    ELSE NULL
                END as lat,
                CASE 
                    WHEN location IS NOT NULL THEN ST_X(location::geometry)
                    ELSE NULL
                END as lng,
                hazard_type,
                timestamp,
                map_link,
                hash_key,
                status,
                created_at
            FROM hazard_reports
            WHERE location IS NOT NULL
            AND ST_DWithin(
                location::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $3
            )
            AND timestamp >= $4
            ORDER BY timestamp DESC
        """
        
        return await self.execute_query(
            query,
            lng,  # PostGIS uses (lng, lat) order
            lat,
            radius_meters,
            cutoff_date
        )
    
    async def get_hazard_by_id(self, report_id: int) -> Optional[Dict[str, Any]]:
        """Get a hazard report by ID"""
        query = """
            SELECT 
                id,
                CASE 
                    WHEN location IS NOT NULL THEN ST_Y(location::geometry)
                    ELSE NULL
                END as lat,
                CASE 
                    WHEN location IS NOT NULL THEN ST_X(location::geometry)
                    ELSE NULL
                END as lng,
                hazard_type,
                timestamp,
                map_link,
                hash_key,
                status,
                created_at
            FROM hazard_reports
            WHERE id = $1
        """
        
        return await self.execute_fetchone(query, report_id)
    
    async def get_all_hazards(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """Get all hazard reports, sorted by timestamp (newest first)"""
        query = """
            SELECT 
                id,
                CASE 
                    WHEN location IS NOT NULL THEN ST_Y(location::geometry)
                    ELSE NULL
                END as lat,
                CASE 
                    WHEN location IS NOT NULL THEN ST_X(location::geometry)
                    ELSE NULL
                END as lng,
                hazard_type,
                timestamp,
                map_link,
                hash_key,
                status,
                created_at
            FROM hazard_reports
            ORDER BY timestamp DESC
            LIMIT $1 OFFSET $2
        """
        
        return await self.execute_query(query, limit, offset)
    
    async def delete_hazard(self, report_id: int) -> bool:
        """Delete a hazard report by ID"""
        query = "DELETE FROM hazard_reports WHERE id = $1"
        result = await self.execute_command(query, report_id)
        return "DELETE" in result
    
    async def cleanup_old_hazards(self, days: int = 7) -> int:
        """
        Remove old hazards that have no recent reports nearby
        
        Args:
            days: Number of days to look back for recent reports
            
        Returns:
            Number of hazards removed
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Find old hazards with coordinates extracted
        old_hazards_query = """
            SELECT 
                id,
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng,
                timestamp
            FROM hazard_reports
            WHERE timestamp < $1
        """
        
        old_hazards = await self.execute_query(old_hazards_query, cutoff_date)
        
        removed_count = 0
        
        for hazard in old_hazards:
            lat = hazard.get('lat')
            lng = hazard.get('lng')
            
            if lat and lng:
                # Check if there's a newer report within 100m
                nearby = await self.find_nearby_hazards(
                    {"lat": lat, "lng": lng},
                    radius_meters=100.0,
                    days_back=days
                )
                
                # Filter out the current hazard itself
                nearby = [h for h in nearby if h.get('id') != hazard['id']]
                
                # If no newer reports, delete this old one
                if not nearby or len(nearby) == 0:
                    await self.delete_hazard(hazard['id'])
                    removed_count += 1
        
        return removed_count
    
    async def check_connection(self) -> bool:
        """Check if database connection is active"""
        try:
            if not self._pool:
                await self.connect()
            
            async with self._pool.acquire() as conn:
                result = await conn.fetchval("SELECT 1")
                return result == 1
        except Exception as e:
            logger.error(f"Database connection check failed: {e}")
            return False
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get database statistics"""
        stats = {
            "connected": False,
            "total_hazards": 0
        }
        
        try:
            if await self.check_connection():
                stats["connected"] = True
                
                count_query = "SELECT COUNT(*) as count FROM hazard_reports"
                result = await self.execute_fetchone(count_query)
                if result:
                    stats["total_hazards"] = result.get('count', 0)
        except Exception as e:
            logger.error(f"Error getting database stats: {e}")
        
        return stats
    
    async def get_analytics_trends(self, days: int = 30, interval: str = 'day') -> List[Dict[str, Any]]:
        """
        Get hazard detection trends over time
        
        Args:
            days: Number of days to look back
            interval: Time interval ('day', 'week', 'hour')
            
        Returns:
            List of trend data points
        """
        if interval == 'day':
            date_trunc = "DATE_TRUNC('day', timestamp)"
        elif interval == 'week':
            date_trunc = "DATE_TRUNC('week', timestamp)"
        elif interval == 'hour':
            date_trunc = "DATE_TRUNC('hour', timestamp)"
        else:
            date_trunc = "DATE_TRUNC('day', timestamp)"
        
        cutoff_date = datetime.now() - timedelta(days=days)
        
        query = f"""
            SELECT 
                {date_trunc} as time_period,
                COUNT(*) as count,
                COUNT(DISTINCT hazard_type) as unique_types
            FROM hazard_detections
            WHERE timestamp >= $1
            GROUP BY time_period
            ORDER BY time_period ASC
        """
        
        return await self.execute_query(query, cutoff_date)
    
    async def get_analytics_distribution(self, days: int = 30) -> List[Dict[str, Any]]:
        """
        Get hazard type distribution
        
        Args:
            days: Number of days to look back
            
        Returns:
            List of hazard type counts
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        
        query = """
            SELECT 
                hazard_type,
                COUNT(*) as count,
                AVG(detection_confidence) as avg_confidence,
                COUNT(CASE WHEN driver_lane THEN 1 END) as driver_lane_count
            FROM hazard_detections
            WHERE timestamp >= $1
            GROUP BY hazard_type
            ORDER BY count DESC
        """
        
        return await self.execute_query(query, cutoff_date)
    
    async def get_analytics_stats(self) -> Dict[str, Any]:
        """
        Get overall analytics statistics
        
        Returns:
            Dictionary with various statistics
        """
        stats = {}
        
        # Total detections
        total_query = "SELECT COUNT(*) as count FROM hazard_detections"
        result = await self.execute_fetchone(total_query)
        stats['total_detections'] = result.get('count', 0) if result else 0
        
        # Total reports
        reports_query = "SELECT COUNT(*) as count FROM hazard_reports"
        result = await self.execute_fetchone(reports_query)
        stats['total_reports'] = result.get('count', 0) if result else 0
        
        # Detections in last 24 hours
        day_ago = datetime.now() - timedelta(days=1)
        day_query = "SELECT COUNT(*) as count FROM hazard_detections WHERE timestamp >= $1"
        result = await self.execute_fetchone(day_query, day_ago)
        stats['detections_last_24h'] = result.get('count', 0) if result else 0
        
        # Average confidence
        conf_query = "SELECT AVG(detection_confidence) as avg_conf FROM hazard_detections WHERE detection_confidence IS NOT NULL"
        result = await self.execute_fetchone(conf_query)
        stats['avg_confidence'] = float(result.get('avg_conf', 0)) if result and result.get('avg_conf') else 0
        
        # Driver lane hazards
        lane_query = "SELECT COUNT(*) as count FROM hazard_detections WHERE driver_lane = TRUE"
        result = await self.execute_fetchone(lane_query)
        stats['driver_lane_hazards'] = result.get('count', 0) if result else 0
        
        # Most common hazard type
        common_query = """
            SELECT hazard_type, COUNT(*) as count 
            FROM hazard_detections 
            GROUP BY hazard_type 
            ORDER BY count DESC 
            LIMIT 1
        """
        result = await self.execute_fetchone(common_query)
        if result:
            stats['most_common_type'] = result.get('hazard_type')
            stats['most_common_count'] = result.get('count', 0)
        else:
            stats['most_common_type'] = None
            stats['most_common_count'] = 0
        
        return stats
    
    async def get_analytics_heatmap(self, days: int = 30, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Get geographic heatmap data
        
        Args:
            days: Number of days to look back
            limit: Maximum number of points to return
            
        Returns:
            List of location points with counts
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        
        query = """
            SELECT 
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng,
                COUNT(*) as count,
                hazard_type
            FROM hazard_detections
            WHERE timestamp >= $1 AND location IS NOT NULL
            GROUP BY lat, lng, hazard_type
            ORDER BY count DESC
            LIMIT $2
        """
        
        return await self.execute_query(query, cutoff_date, limit)


# Global Neon DB instance
neon_db = NeonDB()

