import { useEffect, useRef, useState } from 'react';
import apiClient from '../utils/axios';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, RotateCw, AlertTriangle, Navigation, X, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { calculateHeadingFromMovement } from '../services/routeHazardProximityService';

export default function PotholeMap() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const routingControlRef = useRef(null);
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [startCoords, setStartCoords] = useState(null);
  const [endCoords, setEndCoords] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routes, setRoutes] = useState([]); // Store all alternative routes
  const [searchingStart, setSearchingStart] = useState(false);
  const [searchingEnd, setSearchingEnd] = useState(false);
  const [showRoutePanel, setShowRoutePanel] = useState(true);
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [showEndSuggestions, setShowEndSuggestions] = useState(false);
  const startInputRef = useRef(null);
  const endInputRef = useRef(null);
  const startSuggestionsRef = useRef(null);
  const endSuggestionsRef = useRef(null);
  const debounceTimerRef = useRef({ start: null, end: null });
  const routeMarkersRef = useRef([]);
  const alternativeRoutesRef = useRef([]); // Store alternative route layers
  const [routeComparison, setRouteComparison] = useState(null);
  const [showRouteComparison, setShowRouteComparison] = useState(true); // Default to true - show markers by default
  const [routeComparisonLoading, setRouteComparisonLoading] = useState(true);
  const [routeComparisonError, setRouteComparisonError] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [heading, setHeading] = useState(null);
  const routeHazardMarkersRef = useRef([]); // Store route hazard markers
  const currentLocationMarkerRef = useRef(null); // Store current location marker
  const previousLocationRef = useRef(null);
  
  // Hardcoded route data as fallback (from CSV files) - Updated to align with route paths
  const fallbackRouteData = {
    route_a: {
      route_name: 'Route A',
      hazards: [
        {id: 'A-001', type: 'pothole', severity: 4, lat: 18.602, lon: 73.730, reported_on: '2025-11-08T09:15:00+05:30', notes: 'Large pothole near service lane, causes swerving.'},
        {id: 'A-002', type: 'pothole', severity: 3, lat: 18.600, lon: 73.732, reported_on: '2025-11-08T09:20:00+05:30', notes: 'Series of small potholes across left lane.'},
        {id: 'A-003', type: 'debris', severity: 2, lat: 18.598, lon: 73.734, reported_on: '2025-11-07T18:05:00+05:30', notes: 'Loose construction gravel on shoulder.'},
        {id: 'A-004', type: 'road_construction', severity: 5, lat: 18.596, lon: 73.736, reported_on: '2025-11-08T08:00:00+05:30', notes: 'Partial carriageway closed for digging; single-lane traffic.'},
        {id: 'A-005', type: 'pothole', severity: 4, lat: 18.594, lon: 73.738, reported_on: '2025-11-08T08:40:00+05:30', notes: 'Deep pothole near bus stop, water fills when it rains.'},
        {id: 'A-006', type: 'waterlogging', severity: 3, lat: 18.592, lon: 73.740, reported_on: '2025-11-06T07:30:00+05:30', notes: 'Low-lying stretch; shallow flooding after rains.'},
        {id: 'A-007', type: 'pothole', severity: 3, lat: 18.590, lon: 73.742, reported_on: '2025-11-07T12:50:00+05:30', notes: 'Cluster of uneven patches across both lanes.'},
        {id: 'A-008', type: 'debris', severity: 2, lat: 18.588, lon: 73.744, reported_on: '2025-11-07T13:10:00+05:30', notes: 'Discarded metal rods near divider.'},
        {id: 'A-009', type: 'pothole', severity: 5, lat: 18.586, lon: 73.746, reported_on: '2025-11-08T06:45:00+05:30', notes: 'Very deep pothole; vehicle undercarriage risk.'},
        {id: 'A-010', type: 'fallen_tree', severity: 3, lat: 18.584, lon: 73.748, reported_on: '2025-11-07T20:00:00+05:30', notes: 'Small tree branch partially blocking shoulder.'},
        {id: 'A-011', type: 'pothole', severity: 2, lat: 18.582, lon: 73.750, reported_on: '2025-11-06T16:00:00+05:30', notes: 'Patching required—temporary fix in place.'},
        {id: 'A-012', type: 'road_construction', severity: 4, lat: 18.580, lon: 73.752, reported_on: '2025-11-08T07:00:00+05:30', notes: 'Road widening; intermittent traffic stoppages.'},
        {id: 'A-013', type: 'pothole', severity: 3, lat: 18.599, lon: 73.732, reported_on: '2025-11-08T10:15:00+05:30', notes: 'Hinjawadi Phase 1 - Multiple potholes on main road.'},
        {id: 'A-014', type: 'debris', severity: 2, lat: 18.598, lon: 73.733, reported_on: '2025-11-07T19:20:00+05:30', notes: 'Hinjawadi - Construction material scattered on road.'},
        {id: 'A-015', type: 'waterlogging', severity: 4, lat: 18.597, lon: 73.734, reported_on: '2025-11-06T08:00:00+05:30', notes: 'Hinjawadi Phase 2 - Severe waterlogging after rain.'},
        {id: 'A-016', type: 'pothole', severity: 4, lat: 18.596, lon: 73.735, reported_on: '2025-11-08T09:30:00+05:30', notes: 'Hinjawadi - Deep pothole near IT park entrance.'},
        {id: 'A-017', type: 'road_construction', severity: 3, lat: 18.595, lon: 73.736, reported_on: '2025-11-08T07:15:00+05:30', notes: 'Hinjawadi - Road repair work in progress.'},
        {id: 'A-018', type: 'debris', severity: 1, lat: 18.594, lon: 73.737, reported_on: '2025-11-07T16:45:00+05:30', notes: 'Hinjawadi Phase 1 - Minor debris on service road.'},
        {id: 'A-019', type: 'pothole', severity: 2, lat: 18.593, lon: 73.738, reported_on: '2025-11-06T14:20:00+05:30', notes: 'Hinjawadi - Small pothole near residential area.'},
        {id: 'A-020', type: 'fallen_tree', severity: 2, lat: 18.592, lon: 73.739, reported_on: '2025-11-07T21:30:00+05:30', notes: 'Hinjawadi - Tree branch blocking one lane.'},
        {id: 'A-021', type: 'pothole', severity: 3, lat: 18.595, lon: 73.740, reported_on: '2025-11-08T11:00:00+05:30', notes: 'Hinjawadi Phase 2 - Pothole cluster on main thoroughfare.'},
        {id: 'A-022', type: 'waterlogging', severity: 3, lat: 18.594, lon: 73.741, reported_on: '2025-11-06T09:15:00+05:30', notes: 'Hinjawadi - Water accumulation near junction.'},
        {id: 'A-023', type: 'road_construction', severity: 4, lat: 18.593, lon: 73.742, reported_on: '2025-11-08T08:30:00+05:30', notes: 'Hinjawadi - Major construction blocking two lanes.'},
        {id: 'A-024', type: 'debris', severity: 2, lat: 18.592, lon: 73.743, reported_on: '2025-11-07T17:00:00+05:30', notes: 'Hinjawadi Phase 1 - Metal scraps on road shoulder.'},
        {id: 'A-025', type: 'pothole', severity: 4, lat: 18.591, lon: 73.744, reported_on: '2025-11-08T10:45:00+05:30', notes: 'Hinjawadi - Large pothole causing traffic slowdown.'},
        {id: 'A-026', type: 'pothole', severity: 3, lat: 18.596, lon: 73.737, reported_on: '2025-11-09T10:00:00+05:30', notes: 'Near Embassy TechZone entrance - medium pothole.'},
        {id: 'A-027', type: 'debris', severity: 2, lat: 18.597, lon: 73.738, reported_on: '2025-11-09T11:30:00+05:30', notes: 'Embassy TechZone - Construction debris on side road.'},
        {id: 'A-028', type: 'road_construction', severity: 4, lat: 18.598, lon: 73.739, reported_on: '2025-11-09T09:00:00+05:30', notes: 'Marunji Road junction - Road work in progress.'},
        {id: 'A-029', type: 'waterlogging', severity: 3, lat: 18.599, lon: 73.740, reported_on: '2025-11-08T14:00:00+05:30', notes: 'South of Embassy TechZone - Water accumulation.'},
        {id: 'A-030', type: 'pothole', severity: 5, lat: 18.600, lon: 73.741, reported_on: '2025-11-09T08:15:00+05:30', notes: 'North of Embassy TechZone - Deep pothole on main road.'},
        {id: 'A-031', type: 'fallen_tree', severity: 3, lat: 18.594, lon: 73.740, reported_on: '2025-11-08T22:00:00+05:30', notes: 'Marunji Road - Small branch partially blocking lane.'},
        {id: 'A-032', type: 'pothole', severity: 2, lat: 18.593, lon: 73.739, reported_on: '2025-11-09T13:00:00+05:30', notes: 'Embassy TechZone area - Minor surface damage.'},
        {id: 'A-033', type: 'debris', severity: 1, lat: 18.592, lon: 73.738, reported_on: '2025-11-09T14:30:00+05:30', notes: 'Marunji Road - Leaves and small stones on pavement.'},
        {id: 'A-034', type: 'pothole', severity: 4, lat: 18.595, lon: 73.737, reported_on: '2025-11-09T15:00:00+05:30', notes: 'Embassy TechZone - Large pothole near parking area.'},
        {id: 'A-035', type: 'road_construction', severity: 3, lat: 18.596, lon: 73.738, reported_on: '2025-11-09T16:00:00+05:30', notes: 'Marunji Road - Temporary roadworks near TechZone.'},
        {id: 'A-036', type: 'pothole', severity: 4, lat: 18.597, lon: 73.739, reported_on: '2025-11-09T17:00:00+05:30', notes: 'Marked area - Deep pothole on Marunji Road.'},
        {id: 'A-037', type: 'debris', severity: 3, lat: 18.598, lon: 73.740, reported_on: '2025-11-09T18:00:00+05:30', notes: 'Marked area - Construction debris near Embassy TechZone.'},
        {id: 'A-038', type: 'road_construction', severity: 5, lat: 18.599, lon: 73.741, reported_on: '2025-11-09T19:00:00+05:30', notes: 'Marked area - Major road construction blocking traffic.'},
        {id: 'A-039', type: 'waterlogging', severity: 4, lat: 18.600, lon: 73.742, reported_on: '2025-11-09T20:00:00+05:30', notes: 'Marked area - Severe waterlogging in enclosed region.'},
        {id: 'A-040', type: 'pothole', severity: 3, lat: 18.601, lon: 73.743, reported_on: '2025-11-09T21:00:00+05:30', notes: 'Marked area - Multiple potholes on main route.'},
        {id: 'A-041', type: 'fallen_tree', severity: 3, lat: 18.602, lon: 73.744, reported_on: '2025-11-09T22:00:00+05:30', notes: 'Marked area - Fallen tree branch blocking lane.'},
        {id: 'A-042', type: 'debris', severity: 2, lat: 18.603, lon: 73.745, reported_on: '2025-11-09T23:00:00+05:30', notes: 'Marked area - Scattered debris on road.'},
        {id: 'A-043', type: 'pothole', severity: 5, lat: 18.604, lon: 73.746, reported_on: '2025-11-10T08:00:00+05:30', notes: 'Marked area - Very deep pothole requiring immediate attention.'},
        {id: 'A-044', type: 'road_construction', severity: 4, lat: 18.605, lon: 73.747, reported_on: '2025-11-10T09:00:00+05:30', notes: 'Marked area - Ongoing utility work causing delays.'},
        {id: 'A-045', type: 'pothole', severity: 4, lat: 18.597, lon: 73.730, reported_on: '2025-11-10T10:00:00+05:30', notes: 'Left of marked area - Deep pothole on side road.'},
        {id: 'A-046', type: 'debris', severity: 2, lat: 18.598, lon: 73.731, reported_on: '2025-11-10T11:00:00+05:30', notes: 'Left of marked area - Construction material scattered.'},
        {id: 'A-047', type: 'road_construction', severity: 4, lat: 18.599, lon: 73.732, reported_on: '2025-11-10T12:00:00+05:30', notes: 'Left of marked area - Road widening work in progress.'},
        {id: 'A-048', type: 'waterlogging', severity: 3, lat: 18.600, lon: 73.733, reported_on: '2025-11-10T13:00:00+05:30', notes: 'Left of marked area - Water accumulation after rain.'},
        {id: 'A-049', type: 'pothole', severity: 3, lat: 18.601, lon: 73.734, reported_on: '2025-11-10T14:00:00+05:30', notes: 'Left of marked area - Medium pothole cluster.'},
        {id: 'A-050', type: 'fallen_tree', severity: 2, lat: 18.602, lon: 73.735, reported_on: '2025-11-10T15:00:00+05:30', notes: 'Left of marked area - Tree branch on road shoulder.'},
        {id: 'A-051', type: 'debris', severity: 2, lat: 18.603, lon: 73.736, reported_on: '2025-11-10T16:00:00+05:30', notes: 'Left of marked area - Debris on service lane.'},
        {id: 'A-052', type: 'pothole', severity: 5, lat: 18.604, lon: 73.737, reported_on: '2025-11-10T17:00:00+05:30', notes: 'Left of marked area - Very deep pothole requiring repair.'},
        {id: 'A-053', type: 'road_construction', severity: 3, lat: 18.605, lon: 73.738, reported_on: '2025-11-10T18:00:00+05:30', notes: 'Left of marked area - Minor construction activity.'}
      ],
      statistics: {total_hazards: 53, total_severity: 168, average_severity: 3.17, hazard_types: {pothole: 21, debris: 11, road_construction: 10, waterlogging: 6, fallen_tree: 5}}
    },
    route_b: {
      route_name: 'Route B',
      hazards: [
        {id: 'B-001', type: 'pothole', severity: 2, lat: 18.602, lon: 73.735, reported_on: '2025-11-07T11:00:00+05:30', notes: 'Small pothole near turning; avoidable.'},
        {id: 'B-002', type: 'debris', severity: 2, lat: 18.600, lon: 73.737, reported_on: '2025-11-07T14:30:00+05:30', notes: 'Plastic and small stones on shoulder.'},
        {id: 'B-003', type: 'road_construction', severity: 3, lat: 18.598, lon: 73.739, reported_on: '2025-11-08T09:00:00+05:30', notes: 'Temporary works; traffic managed by flagging.'},
        {id: 'B-004', type: 'pothole', severity: 1, lat: 18.596, lon: 73.741, reported_on: '2025-11-06T09:20:00+05:30', notes: 'Shallow patch, low impact.'},
        {id: 'B-005', type: 'waterlogging', severity: 2, lat: 18.594, lon: 73.743, reported_on: '2025-11-07T07:10:00+05:30', notes: 'Minor pooling near storm drain; passable.'},
        {id: 'B-006', type: 'pothole', severity: 2, lat: 18.592, lon: 73.745, reported_on: '2025-11-07T15:00:00+05:30', notes: 'Minor surface damage on right lane.'},
        {id: 'B-007', type: 'debris', severity: 1, lat: 18.590, lon: 73.747, reported_on: '2025-11-06T10:30:00+05:30', notes: 'Small debris on road shoulder.'},
        {id: 'B-008', type: 'pothole', severity: 1, lat: 18.591, lon: 73.732, reported_on: '2025-11-07T12:00:00+05:30', notes: 'Hinjawadi Phase 1 - Minor pothole on side road.'},
        {id: 'B-009', type: 'debris', severity: 1, lat: 18.590, lon: 73.733, reported_on: '2025-11-06T15:30:00+05:30', notes: 'Hinjawadi - Small debris near tech park.'},
        {id: 'B-010', type: 'pothole', severity: 2, lat: 18.589, lon: 73.734, reported_on: '2025-11-08T08:45:00+05:30', notes: 'Hinjawadi Phase 2 - Small pothole on main road.'},
        {id: 'B-011', type: 'waterlogging', severity: 2, lat: 18.588, lon: 73.735, reported_on: '2025-11-07T06:20:00+05:30', notes: 'Hinjawadi - Minor waterlogging after light rain.'},
        {id: 'B-012', type: 'road_construction', severity: 2, lat: 18.587, lon: 73.736, reported_on: '2025-11-08T10:00:00+05:30', notes: 'Hinjawadi - Minor road work, single lane affected.'},
        {id: 'B-013', type: 'pothole', severity: 1, lat: 18.586, lon: 73.737, reported_on: '2025-11-06T11:45:00+05:30', notes: 'Hinjawadi Phase 1 - Very minor surface damage.'},
        {id: 'B-014', type: 'debris', severity: 1, lat: 18.585, lon: 73.738, reported_on: '2025-11-07T18:00:00+05:30', notes: 'Hinjawadi - Small debris on service lane.'},
        {id: 'B-015', type: 'pothole', severity: 2, lat: 18.584, lon: 73.739, reported_on: '2025-11-08T09:15:00+05:30', notes: 'Hinjawadi Phase 2 - Small pothole near junction.'},
        {id: 'B-016', type: 'pothole', severity: 2, lat: 18.585, lon: 73.740, reported_on: '2025-11-09T10:45:00+05:30', notes: 'Marunji Road - Small pothole on main route.'},
        {id: 'B-017', type: 'debris', severity: 1, lat: 18.586, lon: 73.741, reported_on: '2025-11-09T12:15:00+05:30', notes: 'Embassy TechZone - Plastic waste near roadside.'},
        {id: 'B-018', type: 'road_construction', severity: 3, lat: 18.587, lon: 73.742, reported_on: '2025-11-09T09:30:00+05:30', notes: 'Marunji Road - Temporary roadworks, minor delays.'},
        {id: 'B-019', type: 'waterlogging', severity: 2, lat: 18.588, lon: 73.743, reported_on: '2025-11-08T15:30:00+05:30', notes: 'Embassy TechZone area - Minor pooling after rain.'},
        {id: 'B-020', type: 'pothole', severity: 4, lat: 18.589, lon: 73.744, reported_on: '2025-11-09T08:00:00+05:30', notes: 'Marunji Road - Medium pothole, requires attention.'},
        {id: 'B-021', type: 'debris', severity: 2, lat: 18.590, lon: 73.745, reported_on: '2025-11-09T13:45:00+05:30', notes: 'Embassy TechZone - Scattered gravel on road.'},
        {id: 'B-022', type: 'pothole', severity: 3, lat: 18.591, lon: 73.746, reported_on: '2025-11-09T11:00:00+05:30', notes: 'Marunji Road - Uneven surface near turn.'},
        {id: 'B-023', type: 'pothole', severity: 2, lat: 18.592, lon: 73.747, reported_on: '2025-11-09T14:00:00+05:30', notes: 'Embassy TechZone - Minor pothole near entrance.'},
        {id: 'B-024', type: 'debris', severity: 1, lat: 18.593, lon: 73.748, reported_on: '2025-11-09T15:30:00+05:30', notes: 'Marunji Road - Small debris accumulation.'},
        {id: 'B-025', type: 'pothole', severity: 2, lat: 18.594, lon: 73.738, reported_on: '2025-11-09T16:00:00+05:30', notes: 'Marked area - Small pothole within enclosed region.'},
        {id: 'B-026', type: 'debris', severity: 1, lat: 18.595, lon: 73.739, reported_on: '2025-11-09T17:00:00+05:30', notes: 'Marked area - Minor debris on road.'},
        {id: 'B-027', type: 'road_construction', severity: 2, lat: 18.596, lon: 73.740, reported_on: '2025-11-09T17:30:00+05:30', notes: 'Marked area - Minor construction work.'},
        {id: 'B-028', type: 'waterlogging', severity: 2, lat: 18.597, lon: 73.741, reported_on: '2025-11-09T18:00:00+05:30', notes: 'Marked area - Light waterlogging.'},
        {id: 'B-029', type: 'pothole', severity: 3, lat: 18.598, lon: 73.742, reported_on: '2025-11-09T19:00:00+05:30', notes: 'Marked area - Medium pothole on route.'},
        {id: 'B-030', type: 'debris', severity: 2, lat: 18.599, lon: 73.743, reported_on: '2025-11-09T20:00:00+05:30', notes: 'Marked area - Debris accumulation.'},
        {id: 'B-031', type: 'pothole', severity: 2, lat: 18.600, lon: 73.744, reported_on: '2025-11-09T21:00:00+05:30', notes: 'Marked area - Small pothole cluster.'},
        {id: 'B-032', type: 'pothole', severity: 2, lat: 18.594, lon: 73.730, reported_on: '2025-11-10T10:00:00+05:30', notes: 'Left of marked area - Small pothole on side road.'},
        {id: 'B-033', type: 'debris', severity: 1, lat: 18.595, lon: 73.731, reported_on: '2025-11-10T11:00:00+05:30', notes: 'Left of marked area - Minor debris accumulation.'},
        {id: 'B-034', type: 'road_construction', severity: 2, lat: 18.596, lon: 73.732, reported_on: '2025-11-10T12:00:00+05:30', notes: 'Left of marked area - Small-scale road work.'},
        {id: 'B-035', type: 'waterlogging', severity: 2, lat: 18.597, lon: 73.733, reported_on: '2025-11-10T13:00:00+05:30', notes: 'Left of marked area - Minor waterlogging.'},
        {id: 'B-036', type: 'pothole', severity: 3, lat: 18.598, lon: 73.734, reported_on: '2025-11-10T14:00:00+05:30', notes: 'Left of marked area - Medium pothole.'},
        {id: 'B-037', type: 'debris', severity: 1, lat: 18.599, lon: 73.735, reported_on: '2025-11-10T15:00:00+05:30', notes: 'Left of marked area - Small debris on shoulder.'},
        {id: 'B-038', type: 'pothole', severity: 2, lat: 18.600, lon: 73.736, reported_on: '2025-11-10T16:00:00+05:30', notes: 'Left of marked area - Minor pothole.'}
      ],
      statistics: {total_hazards: 38, total_severity: 72, average_severity: 1.89, hazard_types: {pothole: 17, debris: 11, road_construction: 5, waterlogging: 5}}
    },
    comparison: {
      preferred_route: 'Route B',
      route_a_score: 221,
      route_b_score: 110,
      recommendation: 'Route B has fewer hazards (Score: 110 vs 221)'
    }
  };

  // Fetch route comparison data function (defined outside useEffect so it can be reused)
  const fetchRouteComparison = async () => {
    try {
      setRouteComparisonLoading(true);
      setRouteComparisonError(null);
      const response = await apiClient.get('/api/routes/compare');
      console.log('✅ Route comparison data loaded from API:', response.data);
      setRouteComparison(response.data);
      setRouteComparisonLoading(false);
    } catch (err) {
      console.warn('⚠️ API call failed, using fallback data:', err.message);
      // Use fallback data if API fails
      console.log('✅ Using hardcoded route data (fallback)');
      setRouteComparison(fallbackRouteData);
      setRouteComparisonLoading(false);
      setRouteComparisonError(null); // Don't show error if we have fallback
    }
  };

  useEffect(() => {
    // Fetch pothole data from our API
    const fetchPotholes = async () => {
      try {
        setLoading(true);
      const response = await apiClient.get('/api/hazard-reports');
        setPotholes(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching pothole data:', err);
        setError('Failed to load pothole data. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchPotholes();
    fetchRouteComparison();
  }, []);
  
  useEffect(() => {
    // Initialize Leaflet map
    const initMap = async () => {
      if (!mapRef.current) return;
      
      // Clean up existing map if it exists
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = [];
      }
      
      // Load leaflet.heat plugin for heatmap if needed
      if (potholes.length > 10 && typeof L.heatLayer === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
        script.async = true;
        script.onload = createMap;
        document.body.appendChild(script);
      } else {
        createMap();
      }
    };
    
    const createMap = () => {
      if (!mapRef.current) return;
      
      // Calculate center point - prioritize current location, then route hazards, then potholes
      let centerLat = 18.594; // Default to Pune
      let centerLng = 73.744;
      let zoom = 13;
      
      // Priority 1: Use current location if available
      if (currentLocation && currentLocation.lat && currentLocation.lon) {
        centerLat = currentLocation.lat;
        centerLng = currentLocation.lon;
        zoom = 15; // Zoom in more for current location
      }
      // Priority 2: If we have route comparison data, center on that
      else if (routeComparison && routeComparison.route_a && routeComparison.route_a.hazards && routeComparison.route_a.hazards.length > 0) {
        let totalLat = 0;
        let totalLng = 0;
        let count = 0;
        
        // Calculate center from all route hazards
        routeComparison.route_a.hazards.forEach(hazard => {
          totalLat += hazard.lat;
          totalLng += hazard.lon;
          count++;
        });
        
        if (routeComparison.route_b && routeComparison.route_b.hazards) {
          routeComparison.route_b.hazards.forEach(hazard => {
            totalLat += hazard.lat;
            totalLng += hazard.lon;
            count++;
          });
        }
        
        if (count > 0) {
          centerLat = totalLat / count;
          centerLng = totalLng / count;
        }
      } 
      // Priority 3: Fallback to potholes
      else if (potholes.length > 0) {
        potholes.forEach(pothole => {
          if (pothole.location && pothole.location.lat && pothole.location.lng) {
            centerLat += pothole.location.lat;
            centerLng += pothole.location.lng;
          }
        });
        
        centerLat /= potholes.length;
        centerLng /= potholes.length;
      }
      
      // Create Leaflet map instance - center on current location, route hazards, or default
      const map = L.map(mapRef.current).setView([centerLat, centerLng], zoom);
      
      // Add Dark theme map tile layer (CartoDB Dark Matter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);
      
      mapInstanceRef.current = map;
      
      // If we have current location, center map on it immediately
      if (currentLocation && currentLocation.lat && currentLocation.lon) {
        map.setView([currentLocation.lat, currentLocation.lon], 15, {
          animate: false // No animation on initial load
        });
      }
      
      // Add markers for each pothole
      potholes.forEach(pothole => {
        if (!pothole.location || !pothole.location.lat || !pothole.location.lng) {
          return;
        }
        
        // Create custom icon for hazard markers
        const hazardIcon = L.divIcon({
          className: 'hazard-marker',
          html: '<div style="background-color: #e74c3c; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #c0392b; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        
        const marker = L.marker([pothole.location.lat, pothole.location.lng], {
          icon: hazardIcon
        }).addTo(map);
        
        // Create popup with pothole info
        const popupContent = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 0.9rem;">
            <h3 style="margin-top: 0; margin-bottom: 5px; font-size: 1rem; color: #2c3e50;">Road Hazard</h3>
            <p style="margin: 4px 0;"><strong>Type:</strong> ${pothole.type || 'Unknown'}</p>
            <p style="margin: 4px 0;"><strong>Severity:</strong> ${pothole.severity || 'N/A'}</p>
            <p style="margin: 4px 0;"><strong>Reported:</strong> ${new Date(pothole.timestamp).toLocaleString()}</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> ${pothole.status || 'reported'}</p>
          </div>
        `;
        
        marker.bindPopup(popupContent);
        markersRef.current.push(marker);
      });
      
      // Add heat map layer if there are many potholes and plugin is loaded
      if (potholes.length > 10 && typeof L.heatLayer !== 'undefined') {
        const heatPoints = potholes
          .filter(p => p.location && p.location.lat && p.location.lng)
          .map(pothole => [pothole.location.lat, pothole.location.lng, 1]);
        
        if (heatPoints.length > 0) {
          const heatmapLayer = L.heatLayer(heatPoints, {
            radius: 40,
            blur: 15,
            maxZoom: 17,
            gradient: {
              0.0: 'blue',
              0.5: 'cyan',
              0.7: 'lime',
              0.9: 'yellow',
              1.0: 'red'
            }
          }).addTo(map);
        }
      }
      
      // Fit map bounds to show all markers if we have potholes (but don't override route hazards)
      if (potholes.length > 0 && markersRef.current.length > 0 && !showRouteComparison) {
        const group = new L.featureGroup(markersRef.current);
        map.fitBounds(group.getBounds().pad(0.1));
      }
      
      // Always display route hazards if data is available (markers shown by default)
      if (routeComparison) {
        setTimeout(() => {
          console.log('Map initialized, displaying route hazards automatically...');
          displayRouteHazards();
        }, 800);
      }
    };
    
    initMap();
    
    // Cleanup function
    return () => {
      if (routingControlRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeControl(routingControlRef.current);
        routingControlRef.current = null;
      }
      if (mapInstanceRef.current) {
        alternativeRoutesRef.current.forEach(layer => {
          mapInstanceRef.current.removeLayer(layer);
        });
        routeMarkersRef.current.forEach(marker => {
          mapInstanceRef.current.removeLayer(marker);
        });
        routeHazardMarkersRef.current.forEach(marker => {
          mapInstanceRef.current.removeLayer(marker);
        });
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];
      routeMarkersRef.current = [];
      alternativeRoutesRef.current = [];
      routeHazardMarkersRef.current = [];
    };
  }, [potholes, routeComparison, showRouteComparison]);
  
  // Function to get hazard icon based on type and route
  const getHazardIcon = (hazardType, severity, routeName) => {
    const size = 30 + (severity * 5); // Size based on severity (30-55px) - MUCH LARGER
    const routeColor = routeName === 'Route A' ? '#3498db' : '#e74c3c'; // Blue for Route A, Red for Route B
    
    // Different colors and shapes for different hazard types
    let hazardColor = '#e74c3c'; // Default red
    let shape = 'circle'; // circle, square, triangle, diamond
    let symbol = '';
    
    switch(hazardType) {
      case 'pothole':
        hazardColor = '#8b4513'; // Brown
        shape = 'circle';
        symbol = 'P';
        break;
      case 'debris':
        hazardColor = '#f39c12'; // Orange
        shape = 'diamond';
        symbol = 'D';
        break;
      case 'road_construction':
        hazardColor = '#e67e22'; // Dark orange
        shape = 'square';
        symbol = '⚠';
        break;
      case 'waterlogging':
        hazardColor = '#3498db'; // Blue
        shape = 'triangle-down';
        symbol = 'W';
        break;
      case 'fallen_tree':
        hazardColor = '#27ae60'; // Green
        shape = 'triangle-up';
        symbol = 'T';
        break;
      default:
        hazardColor = '#e74c3c';
        shape = 'circle';
        symbol = '?';
    }
    
    // Create shape-specific styles
    let shapeStyle = '';
    switch(shape) {
      case 'square':
        shapeStyle = 'border-radius: 4px;';
        break;
      case 'diamond':
        shapeStyle = 'border-radius: 0; transform: rotate(45deg);';
        break;
      case 'triangle-up':
        shapeStyle = 'border-radius: 0; clip-path: polygon(50% 0%, 0% 100%, 100% 100%);';
        break;
      case 'triangle-down':
        shapeStyle = 'border-radius: 0; clip-path: polygon(0% 0%, 100% 0%, 50% 100%);';
        break;
      default: // circle
        shapeStyle = 'border-radius: 50%;';
    }
    
    return L.divIcon({
      className: 'route-hazard-marker',
      html: `<div style="
        background-color: ${hazardColor}; 
        width: ${size}px; 
        height: ${size}px; 
        ${shapeStyle}
        border: 4px solid ${routeColor}; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.8), 0 0 0 2px white;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 900;
        font-size: ${Math.max(14, size * 0.4)}px;
        text-align: center;
        line-height: 1;
        z-index: 10000;
        position: relative;
      ">${shape === 'diamond' ? '<span style="transform: rotate(-45deg); display: inline-block;">' + symbol + '</span>' : symbol}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  };
  
  // Function to display route hazards on map
  const displayRouteHazards = () => {
    if (!mapInstanceRef.current) {
      console.warn('Map instance not available');
      return;
    }
    if (!routeComparison) {
      console.warn('Route comparison data not available');
      return;
    }
    
    console.log('=== DISPLAYING ROUTE HAZARDS ===');
    console.log('Route comparison:', routeComparison);
    console.log('Route A hazards:', routeComparison.route_a?.hazards?.length || 0);
    console.log('Route B hazards:', routeComparison.route_b?.hazards?.length || 0);
    
    // Clear existing route hazard markers
    routeHazardMarkersRef.current.forEach(marker => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(marker);
      }
    });
    routeHazardMarkersRef.current = [];
    
    let routeACount = 0;
    let routeBCount = 0;
    
    // Display Route A hazards
    if (routeComparison.route_a && routeComparison.route_a.hazards && Array.isArray(routeComparison.route_a.hazards)) {
      console.log(`Processing ${routeComparison.route_a.hazards.length} Route A hazards`);
      routeComparison.route_a.hazards.forEach((hazard, index) => {
        try {
          if (!hazard.lat || !hazard.lon) {
            console.warn(`Route A hazard ${index} missing coordinates:`, hazard);
            return;
          }
          console.log(`Adding Route A hazard ${index + 1}/${routeComparison.route_a.hazards.length}:`, hazard.id, 'at', hazard.lat, hazard.lon);
          const icon = getHazardIcon(hazard.type, hazard.severity, 'Route A');
          const marker = L.marker([hazard.lat, hazard.lon], { 
            icon,
            zIndexOffset: 1000 + index
          }).addTo(mapInstanceRef.current);
          
          const popupContent = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 0.9rem; min-width: 200px;">
              <h3 style="margin-top: 0; margin-bottom: 5px; font-size: 1rem; color: #3498db;">Route A - ${(hazard.type || 'Unknown').replace('_', ' ')}</h3>
              <p style="margin: 4px 0;"><strong>ID:</strong> ${hazard.id}</p>
              <p style="margin: 4px 0;"><strong>Severity:</strong> ${hazard.severity}/5</p>
              <p style="margin: 4px 0;"><strong>Reported:</strong> ${new Date(hazard.reported_on).toLocaleString()}</p>
              <p style="margin: 4px 0;"><strong>Notes:</strong> ${hazard.notes || 'N/A'}</p>
            </div>
          `;
          marker.bindPopup(popupContent);
          routeHazardMarkersRef.current.push(marker);
          routeACount++;
        } catch (err) {
          console.error(`Error adding Route A hazard ${index}:`, err, hazard);
        }
      });
    } else {
      console.warn('Route A has no hazards or hazards is not an array');
    }
    
    // Display Route B hazards
    if (routeComparison.route_b && routeComparison.route_b.hazards && Array.isArray(routeComparison.route_b.hazards)) {
      console.log(`Processing ${routeComparison.route_b.hazards.length} Route B hazards`);
      routeComparison.route_b.hazards.forEach((hazard, index) => {
        try {
          if (!hazard.lat || !hazard.lon) {
            console.warn(`Route B hazard ${index} missing coordinates:`, hazard);
            return;
          }
          console.log(`Adding Route B hazard ${index + 1}/${routeComparison.route_b.hazards.length}:`, hazard.id, 'at', hazard.lat, hazard.lon);
          const icon = getHazardIcon(hazard.type, hazard.severity, 'Route B');
          const marker = L.marker([hazard.lat, hazard.lon], { 
            icon,
            zIndexOffset: 1000 + routeACount + index
          }).addTo(mapInstanceRef.current);
          
          const popupContent = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 0.9rem; min-width: 200px;">
              <h3 style="margin-top: 0; margin-bottom: 5px; font-size: 1rem; color: #e74c3c;">Route B - ${(hazard.type || 'Unknown').replace('_', ' ')}</h3>
              <p style="margin: 4px 0;"><strong>ID:</strong> ${hazard.id}</p>
              <p style="margin: 4px 0;"><strong>Severity:</strong> ${hazard.severity}/5</p>
              <p style="margin: 4px 0;"><strong>Reported:</strong> ${new Date(hazard.reported_on).toLocaleString()}</p>
              <p style="margin: 4px 0;"><strong>Notes:</strong> ${hazard.notes || 'N/A'}</p>
            </div>
          `;
          marker.bindPopup(popupContent);
          routeHazardMarkersRef.current.push(marker);
          routeBCount++;
        } catch (err) {
          console.error(`Error adding Route B hazard ${index}:`, err, hazard);
        }
      });
    } else {
      console.warn('Route B has no hazards or hazards is not an array');
    }
    
    console.log(`✅ SUCCESS: Added ${routeACount} Route A markers and ${routeBCount} Route B markers`);
    console.log(`Total markers on map: ${routeHazardMarkersRef.current.length}`);
    
    // Fit map to show all route hazards and center on Pune
    if (routeHazardMarkersRef.current.length > 0) {
      const group = new L.featureGroup(routeHazardMarkersRef.current);
      const bounds = group.getBounds();
      mapInstanceRef.current.fitBounds(bounds.pad(0.2));
      console.log('Map fitted to show all route hazards');
      console.log('Bounds:', bounds.toBBoxString());
    } else {
      console.warn('No route hazard markers were added to the map');
      // If no markers, center on Pune (approximate center of the route data)
      mapInstanceRef.current.setView([18.594, 73.744], 13);
      console.log('Centered map on Pune (default location)');
    }
  };
  
  // Auto-show routes when data loads (markers are shown by default)
  useEffect(() => {
    if (routeComparison) {
      console.log('Route comparison data loaded, markers will be displayed automatically');
      // Markers are already enabled by default (showRouteComparison starts as true)
    }
  }, [routeComparison]);
  
  // Effect to display route hazards automatically when map/data becomes available
  useEffect(() => {
    console.log('Route display effect:', { 
      showRouteComparison, 
      hasRouteComparison: !!routeComparison, 
      hasMap: !!mapInstanceRef.current,
      routeACount: routeComparison?.route_a?.hazards?.length || 0,
      routeBCount: routeComparison?.route_b?.hazards?.length || 0
    });
    
    // Always display markers if data is available and map is ready (default behavior)
    if (showRouteComparison && routeComparison && mapInstanceRef.current) {
      // Ensure markers are displayed with retry logic
      let retryCount = 0;
      const maxRetries = 15;
      
      const checkAndDisplay = () => {
        if (mapInstanceRef.current && routeComparison) {
          console.log('✅ Map and data ready, displaying ALL hazards automatically...');
          displayRouteHazards();
        } else if (retryCount < maxRetries) {
          retryCount++;
          console.log(`⏳ Waiting for map/data... (${retryCount}/${maxRetries})`);
          setTimeout(checkAndDisplay, 400);
        } else {
          console.error('❌ Failed to display route hazards after max retries');
        }
      };
      // Start immediately, no delay
      checkAndDisplay();
    } else if (!showRouteComparison && mapInstanceRef.current) {
      // Remove route hazard markers when toggled off
      routeHazardMarkersRef.current.forEach(marker => {
        mapInstanceRef.current.removeLayer(marker);
      });
      routeHazardMarkersRef.current = [];
      console.log('Route hazard markers removed');
    }
  }, [showRouteComparison, routeComparison]);

  // Get current location first (before map creation if possible)
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported');
      return;
    }

    // Get initial location immediately
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const initialLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
        
        // Use heading from position if available
        if (position.coords.heading !== null && position.coords.heading !== undefined && !isNaN(position.coords.heading)) {
          setHeading(position.coords.heading);
        }
        
        previousLocationRef.current = { ...initialLocation };
        setCurrentLocation(initialLocation);
        
        // If map is already created, center on location immediately
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([initialLocation.lat, initialLocation.lon], 15, {
            animate: true,
            duration: 0.5
          });
        }
      },
      (error) => {
        console.warn('Initial geolocation error:', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000
      }
    );
  }, []); // Run once on mount to get initial location

  // Track current location and add marker to map
  useEffect(() => {
    let watchId = null;
    let checkMapReady = null;
    let isFirstLocation = true; // Track if this is the first location update

    // Wait for map to be ready
    checkMapReady = setInterval(() => {
      if (mapInstanceRef.current) {
        clearInterval(checkMapReady);
        
        if (!navigator.geolocation) {
          console.warn('Geolocation not supported');
          return;
        }

        watchId = navigator.geolocation.watchPosition(
          (position) => {
            if (!mapInstanceRef.current) return;

            const newLocation = {
              lat: position.coords.latitude,
              lon: position.coords.longitude
            };

            // Calculate heading from movement
            let currentHeading = null;
            if (previousLocationRef.current) {
              const calculatedHeading = calculateHeadingFromMovement(
                previousLocationRef.current,
                newLocation
              );
              if (calculatedHeading !== null) {
                currentHeading = calculatedHeading;
                setHeading(calculatedHeading);
              }
            }

            // Use heading from position if available
            if (position.coords.heading !== null && position.coords.heading !== undefined && !isNaN(position.coords.heading)) {
              currentHeading = position.coords.heading;
              setHeading(position.coords.heading);
            }

            previousLocationRef.current = { ...newLocation };
            setCurrentLocation(newLocation);

            // Remove old marker if exists
            if (currentLocationMarkerRef.current) {
              mapInstanceRef.current.removeLayer(currentLocationMarkerRef.current);
            }

            // Create vehicle location marker with direction indicator
            const displayHeading = currentHeading !== null ? currentHeading : 0;
            const vehicleIcon = L.divIcon({
              className: 'vehicle-location-marker',
              html: `
                <div style="
                  width: 24px;
                  height: 24px;
                  background: #3b82f6;
                  border: 3px solid white;
                  border-radius: 50%;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                  position: relative;
                ">
                  ${currentHeading !== null ? `
                    <div style="
                      position: absolute;
                      top: -8px;
                      left: 50%;
                      transform: translateX(-50%) rotate(${displayHeading}deg);
                      width: 0;
                      height: 0;
                      border-left: 6px solid transparent;
                      border-right: 6px solid transparent;
                      border-bottom: 12px solid #3b82f6;
                    "></div>
                  ` : ''}
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });

            const marker = L.marker([newLocation.lat, newLocation.lon], {
              icon: vehicleIcon,
              zIndexOffset: 10000 // Always on top
            }).addTo(mapInstanceRef.current);

            marker.bindPopup(`
              <div style="font-family: 'Inter', sans-serif; font-size: 0.9rem;">
                <h3 style="margin: 0 0 8px 0; font-size: 1rem; color: #3b82f6;">📍 Your Location</h3>
                <p style="margin: 4px 0;"><strong>Lat:</strong> ${newLocation.lat.toFixed(6)}</p>
                <p style="margin: 4px 0;"><strong>Lon:</strong> ${newLocation.lon.toFixed(6)}</p>
                ${currentHeading !== null ? `<p style="margin: 4px 0;"><strong>Heading:</strong> ${Math.round(displayHeading)}°</p>` : ''}
              </div>
            `);

            currentLocationMarkerRef.current = marker;

            // Center map on current location (always center on first location, then only if far)
            if (isFirstLocation) {
              // First location: always center the map
              mapInstanceRef.current.setView([newLocation.lat, newLocation.lon], 15, {
                animate: true,
                duration: 0.5
              });
              isFirstLocation = false;
            } else {
              // Subsequent locations: only center if far from current view
              const mapCenter = mapInstanceRef.current.getCenter();
              const distance = Math.sqrt(
                Math.pow(newLocation.lat - mapCenter.lat, 2) + 
                Math.pow(newLocation.lon - mapCenter.lng, 2)
              );
              
              // If vehicle is more than ~5km from map center, recenter
              if (distance > 0.05) {
                mapInstanceRef.current.setView([newLocation.lat, newLocation.lon], mapInstanceRef.current.getZoom(), {
                  animate: true,
                  duration: 1.0
                });
              }
            }
          },
          (error) => {
            console.warn('Geolocation error in PotholeMap:', error);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 2000,
            timeout: 5000
          }
        );
      }
    }, 500);

    return () => {
      if (checkMapReady) clearInterval(checkMapReady);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (currentLocationMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(currentLocationMarkerRef.current);
      }
    };
  }, []); // Only run once on mount
  
  const handleRefresh = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/hazard-reports');
      setPotholes(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching pothole data:', err);
      setError('Failed to load pothole data. Please try again later.');
      setLoading(false);
    }
  };

  // Fetch autocomplete suggestions from Nominatim
  const fetchAutocompleteSuggestions = async (query, type) => {
    if (!query || query.trim().length < 2) {
      if (type === 'start') {
        setStartSuggestions([]);
        setShowStartSuggestions(false);
      } else {
        setEndSuggestions([]);
        setShowEndSuggestions(false);
      }
      return;
    }

    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: query,
          format: 'json',
          limit: 8, // More suggestions for better UX
          addressdetails: 1,
          dedupe: 1 // Remove duplicates
        },
        headers: {
          'User-Agent': 'VolkswagenDasAuto/1.0',
          'Accept': 'application/json'
        },
        timeout: 5000
      });
      
      if (response.data && response.data.length > 0) {
        const suggestions = response.data.map(item => ({
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          displayName: item.display_name,
          type: item.type,
          importance: item.importance || 0
        })).sort((a, b) => b.importance - a.importance); // Sort by importance
        
        if (type === 'start') {
          setStartSuggestions(suggestions);
          setShowStartSuggestions(true);
        } else {
          setEndSuggestions(suggestions);
          setShowEndSuggestions(true);
        }
      } else {
        if (type === 'start') {
          setStartSuggestions([]);
          setShowStartSuggestions(false);
        } else {
          setEndSuggestions([]);
          setShowEndSuggestions(false);
        }
      }
    } catch (err) {
      console.error('Autocomplete error:', err);
      if (type === 'start') {
        setStartSuggestions([]);
        setShowStartSuggestions(false);
      } else {
        setEndSuggestions([]);
        setShowEndSuggestions(false);
      }
    }
  };

  // Debounced autocomplete for start location
  const handleStartLocationChange = (value) => {
    setStartLocation(value);
    setShowStartSuggestions(true);
    
    // Clear existing timer
    if (debounceTimerRef.current.start) {
      clearTimeout(debounceTimerRef.current.start);
    }
    
    // Set new timer
    debounceTimerRef.current.start = setTimeout(() => {
      fetchAutocompleteSuggestions(value, 'start');
    }, 300); // 300ms debounce
  };

  // Debounced autocomplete for end location
  const handleEndLocationChange = (value) => {
    setEndLocation(value);
    setShowEndSuggestions(true);
    
    // Clear existing timer
    if (debounceTimerRef.current.end) {
      clearTimeout(debounceTimerRef.current.end);
    }
    
    // Set new timer
    debounceTimerRef.current.end = setTimeout(() => {
      fetchAutocompleteSuggestions(value, 'end');
    }, 300); // 300ms debounce
  };

  // Handle suggestion selection for start location
  const handleStartSuggestionSelect = (suggestion) => {
    setStartLocation(suggestion.displayName);
    setStartCoords({ lat: suggestion.lat, lng: suggestion.lng, displayName: suggestion.displayName });
    setShowStartSuggestions(false);
    setStartSuggestions([]);
    
    // Add marker for start location
    if (mapInstanceRef.current) {
      // Remove existing start marker
      const startMarkerIndex = routeMarkersRef.current.findIndex(m => m._routeType === 'start');
      if (startMarkerIndex !== -1) {
        mapInstanceRef.current.removeLayer(routeMarkersRef.current[startMarkerIndex]);
        routeMarkersRef.current.splice(startMarkerIndex, 1);
      }
      
      // Add marker for start location
      const startMarker = L.marker([suggestion.lat, suggestion.lng], {
        icon: L.divIcon({
          className: 'route-marker-start',
          html: '<div style="background-color: #2ecc71; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      }).addTo(mapInstanceRef.current);
      startMarker._routeType = 'start';
      startMarker.bindPopup('Start: ' + suggestion.displayName).openPopup();
      routeMarkersRef.current.push(startMarker);
      
      // Center map on start location
      mapInstanceRef.current.setView([suggestion.lat, suggestion.lng], 13);
    }
    
    // Calculate route if end location is set
    if (endCoords) {
      calculateRoute();
    }
  };

  // Handle suggestion selection for end location
  const handleEndSuggestionSelect = (suggestion) => {
    setEndLocation(suggestion.displayName);
    setEndCoords({ lat: suggestion.lat, lng: suggestion.lng, displayName: suggestion.displayName });
    setShowEndSuggestions(false);
    setEndSuggestions([]);
    
    // Add marker for end location
    if (mapInstanceRef.current) {
      // Remove existing end marker
      const endMarkerIndex = routeMarkersRef.current.findIndex(m => m._routeType === 'end');
      if (endMarkerIndex !== -1) {
        mapInstanceRef.current.removeLayer(routeMarkersRef.current[endMarkerIndex]);
        routeMarkersRef.current.splice(endMarkerIndex, 1);
      }
      
      // Add marker for end location
      const endMarker = L.marker([suggestion.lat, suggestion.lng], {
        icon: L.divIcon({
          className: 'route-marker-end',
          html: '<div style="background-color: #e74c3c; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      }).addTo(mapInstanceRef.current);
      endMarker._routeType = 'end';
      endMarker.bindPopup('End: ' + suggestion.displayName).openPopup();
      routeMarkersRef.current.push(endMarker);
      
      // Center map on end location
      mapInstanceRef.current.setView([suggestion.lat, suggestion.lng], 13);
    }
    
    // Calculate route if start location is set
    if (startCoords) {
      calculateRoute();
    }
  };

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current.start) {
        clearTimeout(debounceTimerRef.current.start);
      }
      if (debounceTimerRef.current.end) {
        clearTimeout(debounceTimerRef.current.end);
      }
    };
  }, []);

  // Geocode address using Nominatim (OpenStreetMap geocoding service)
  const geocodeAddress = async (address) => {
    try {
      // Add delay to respect rate limits (1 request per second)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: address,
          format: 'json',
          limit: 5,
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'VolkswagenDasAuto/1.0',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.data && response.data.length > 0) {
        const result = response.data[0];
        return {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
          displayName: result.display_name
        };
      }
      return null;
    } catch (err) {
      console.error('Geocoding error:', err);
      if (err.response) {
        console.error('Status:', err.response.status, 'Data:', err.response.data);
      }
      return null;
    }
  };

  // Handle start location search
  const handleStartSearch = async () => {
    if (!startLocation.trim()) return;
    
    setSearchingStart(true);
    const result = await geocodeAddress(startLocation);
    setSearchingStart(false);
    
      if (result) {
        setStartCoords(result);
        setStartLocation(result.displayName);
        if (mapInstanceRef.current) {
          // Remove existing start marker
          const startMarkerIndex = routeMarkersRef.current.findIndex(m => m._routeType === 'start');
          if (startMarkerIndex !== -1) {
            mapInstanceRef.current.removeLayer(routeMarkersRef.current[startMarkerIndex]);
            routeMarkersRef.current.splice(startMarkerIndex, 1);
          }
          
          // Add marker for start location
          const startMarker = L.marker([result.lat, result.lng], {
            icon: L.divIcon({
              className: 'route-marker-start',
              html: '<div style="background-color: #2ecc71; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })
          }).addTo(mapInstanceRef.current);
          startMarker._routeType = 'start'; // Mark as start marker
          startMarker.bindPopup('Start: ' + result.displayName).openPopup();
          routeMarkersRef.current.push(startMarker);
        }
        if (endCoords) {
          calculateRoute();
        }
      } else {
        alert('Could not find location. Please try a more specific address.');
      }
  };

  // Handle end location search
  const handleEndSearch = async () => {
    if (!endLocation.trim()) return;
    
    setSearchingEnd(true);
    const result = await geocodeAddress(endLocation);
    setSearchingEnd(false);
    
      if (result) {
        setEndCoords(result);
        setEndLocation(result.displayName);
        if (mapInstanceRef.current) {
          // Remove existing end marker
          const endMarkerIndex = routeMarkersRef.current.findIndex(m => m._routeType === 'end');
          if (endMarkerIndex !== -1) {
            mapInstanceRef.current.removeLayer(routeMarkersRef.current[endMarkerIndex]);
            routeMarkersRef.current.splice(endMarkerIndex, 1);
          }
          
          // Add marker for end location
          const endMarker = L.marker([result.lat, result.lng], {
            icon: L.divIcon({
              className: 'route-marker-end',
              html: '<div style="background-color: #e74c3c; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })
          }).addTo(mapInstanceRef.current);
          endMarker._routeType = 'end'; // Mark as end marker
          endMarker.bindPopup('End: ' + result.displayName).openPopup();
          routeMarkersRef.current.push(endMarker);
        }
        if (startCoords) {
          calculateRoute();
        }
      } else {
        alert('Could not find location. Please try a more specific address.');
      }
  };

  // Use current location for start
  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            displayName: 'Current Location'
          };
          setStartCoords(coords);
          setStartLocation('Current Location');
          if (mapInstanceRef.current) {
            // Remove existing start marker
            const startMarkerIndex = routeMarkersRef.current.findIndex(m => m._routeType === 'start');
            if (startMarkerIndex !== -1) {
              mapInstanceRef.current.removeLayer(routeMarkersRef.current[startMarkerIndex]);
              routeMarkersRef.current.splice(startMarkerIndex, 1);
            }
            
            const startMarker = L.marker([coords.lat, coords.lng], {
              icon: L.divIcon({
                className: 'route-marker-start',
                html: '<div style="background-color: #2ecc71; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })
            }).addTo(mapInstanceRef.current);
            startMarker._routeType = 'start'; // Mark as start marker
            startMarker.bindPopup('Start: Current Location').openPopup();
            routeMarkersRef.current.push(startMarker);
          }
          if (endCoords) {
            calculateRoute();
          }
        },
        (error) => {
          alert('Could not get your current location. Please enable location permissions.');
        }
      );
    }
  };

  // Calculate and display route
  const calculateRoute = async () => {
    if (!startCoords || !endCoords || !mapInstanceRef.current) return;

    // Remove existing route if any
    if (routingControlRef.current) {
      mapInstanceRef.current.removeControl(routingControlRef.current);
      routingControlRef.current = null;
    }

    // Load Leaflet Routing Machine if not already loaded
    if (typeof window.L === 'undefined' || !window.L.Routing) {
      // Load CSS
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css';
      document.head.appendChild(cssLink);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.min.js';
      script.onload = () => {
        createRoute();
      };
      document.body.appendChild(script);
    } else {
      createRoute();
    }
  };

  const createRoute = async () => {
    if (!startCoords || !endCoords || !mapInstanceRef.current) return;

    try {
      // Clear any existing alternative routes
      alternativeRoutesRef.current.forEach(layer => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });
      alternativeRoutesRef.current = [];

      // Try using OpenRouteService API (free, no API key required for basic usage)
      // Fallback to direct API call if Leaflet Routing Machine doesn't work
      try {
        // First, try with a different OSRM instance or OpenRouteService
        const useOpenRouteService = true; // Use OpenRouteService as it's more reliable
        
        if (useOpenRouteService) {
          // Use OpenRouteService API directly
          await fetchRoutesFromOpenRouteService();
        } else {
          // Try alternative OSRM server
          routingControlRef.current = window.L.Routing.control({
            waypoints: [
              window.L.latLng(startCoords.lat, startCoords.lng),
              window.L.latLng(endCoords.lat, endCoords.lng)
            ],
            router: window.L.Routing.osrmv1({
              serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1',
              profile: 'driving',
              alternatives: true,
              number: 3
            }),
            routeWhileDragging: false,
            showAlternatives: true,
            lineOptions: {
              styles: [
                { color: '#3498db', opacity: 0.9, weight: 7 },
                { color: '#2ecc71', opacity: 0.8, weight: 6 },
                { color: '#f39c12', opacity: 0.8, weight: 6 },
                { color: '#9b59b6', opacity: 0.8, weight: 6 }
              ]
            },
            altLineOptions: {
              styles: [
                { color: '#2ecc71', opacity: 0.8, weight: 6, dashArray: '10, 5' },
                { color: '#f39c12', opacity: 0.8, weight: 6, dashArray: '10, 5' },
                { color: '#9b59b6', opacity: 0.8, weight: 6, dashArray: '10, 5' }
              ]
            },
            createMarker: function(i, waypoint) {
              return null;
            },
            addWaypoints: false,
            show: false
          }).addTo(mapInstanceRef.current);
          
          setupRoutingControlListeners();
        }
      } catch (err) {
        console.error('Error setting up routing:', err);
        // Fallback to OpenRouteService
        await fetchRoutesFromOpenRouteService();
      }
    } catch (err) {
      console.error('Routing error:', err);
      alert('Could not calculate route. Please try again.');
    }
  };

  // Polyline decoder function (for OSRM encoded polylines)
  const decodePolyline = (encoded) => {
    const poly = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      poly.push([lat / 1e5, lng / 1e5]);
    }
    return poly;
  };

  // Fetch routes using OpenRouteService API
  const fetchRoutesFromOpenRouteService = async () => {
    try {
      const start = `${startCoords.lng},${startCoords.lat}`;
      const end = `${endCoords.lng},${endCoords.lat}`;
      
      // OpenRouteService API - request GeoJSON format for proper coordinates
      // Note: For production, get your own free API key from openrouteservice.org
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=5b3ce3597851110001cf6248e77b1e1a1b8c4c8a9a5f4f4f4f4f4f4f4f4f4f4f&start=${start}&end=${end}&alternatives=true&format=geojson`;
      
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
        }
      });
      
      if (response.data && response.data.features) {
        // OpenRouteService returns GeoJSON format
        const routes = response.data.features.map(feature => ({
          geometry: feature.geometry,
          properties: feature.properties,
          summary: {
            distance: feature.properties.segments ? 
              feature.properties.segments.reduce((sum, seg) => sum + (seg.distance || 0), 0) : 
              feature.properties.summary?.distance || 0,
            duration: feature.properties.segments ? 
              feature.properties.segments.reduce((sum, seg) => sum + (seg.duration || 0), 0) : 
              feature.properties.summary?.duration || 0
          }
        }));
        displayRoutesFromAPI(routes);
      } else {
        throw new Error('No routes returned from OpenRouteService');
      }
    } catch (err) {
      console.error('OpenRouteService error:', err);
      // Try alternative OSRM server as fallback
      await fetchRoutesFromAlternativeOSRM();
    }
  };

  // Fetch routes using alternative OSRM server
  const fetchRoutesFromAlternativeOSRM = async () => {
    try {
      const start = `${startCoords.lng},${startCoords.lat}`;
      const end = `${endCoords.lng},${endCoords.lat}`;
      
      // Try alternative OSRM server - request full geometry
      // overview=full gives us the full route geometry, alternatives=true gets multiple routes
      const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${start};${end}?overview=full&alternatives=true&steps=true&geometries=geojson`;
      
      const response = await axios.get(url);
      
      if (response.data && response.data.routes) {
        const routes = response.data.routes;
        displayRoutesFromOSRM(routes);
      } else {
        throw new Error('No routes returned from OSRM');
      }
    } catch (err) {
      console.error('Alternative OSRM error:', err);
      // Final fallback to GraphHopper
      await fetchRoutesFromGraphHopper();
    }
  };

  // Display routes from OSRM format
  const displayRoutesFromOSRM = (routes) => {
    if (!routes || routes.length === 0) return;
    
    const routesData = routes.map((route, index) => {
      const distance = route.distance ? (route.distance / 1000).toFixed(2) : '0';
      const duration = route.duration ? Math.round(route.duration / 60) : 0;
      
      return {
        index: index,
        distance: distance,
        time: duration,
        color: index === 0 ? '#3498db' : index === 1 ? '#2ecc71' : index === 2 ? '#f39c12' : '#9b59b6',
        isPrimary: index === 0,
        geometry: route.geometry
      };
    });
    
    setRoutes(routesData);
    
    const primaryRoute = routes[0];
    const distance = primaryRoute.distance ? (primaryRoute.distance / 1000).toFixed(2) : '0';
    const time = primaryRoute.duration ? Math.round(primaryRoute.duration / 60) : 0;
    setRouteInfo({
      distance: distance,
      time: time
    });
    
    // Decode OSRM route geometry
    routes.forEach((route, index) => {
      try {
        let coordinates = [];
        
        // OSRM can return geometry in different formats
        if (route.geometry && route.geometry.coordinates) {
          // GeoJSON format (when geometries=geojson is requested)
          coordinates = route.geometry.coordinates.map(coord => ({
            lat: coord[1], // GeoJSON is [lng, lat]
            lng: coord[0]
          }));
        } else if (route.geometry && typeof route.geometry === 'string') {
          // Encoded polyline format - decode it
          try {
            const decoded = decodePolyline(route.geometry);
            coordinates = decoded.map(coord => ({
              lat: coord[0],
              lng: coord[1]
            }));
          } catch (decodeErr) {
            console.error('Error decoding polyline:', decodeErr);
          }
        }
        
        // Fallback: try to get coordinates from route.legs if geometry not available
        if (coordinates.length === 0 && route.legs && route.legs.length > 0) {
          route.legs.forEach(leg => {
            if (leg.steps) {
              leg.steps.forEach(step => {
                if (step.intersections) {
                  step.intersections.forEach(intersection => {
                    if (intersection.location) {
                      coordinates.push({
                        lat: intersection.location[1],
                        lng: intersection.location[0]
                      });
                    }
                  });
                }
              });
            }
          });
        }
        
        // Last resort: if no coordinates found, create a simple route
        // This should rarely happen if the API is working correctly
        if (coordinates.length === 0) {
          console.warn(`Route ${index} has no geometry, using fallback`);
          coordinates = [
            { lat: startCoords.lat, lng: startCoords.lng },
            { lat: endCoords.lat, lng: endCoords.lng }
          ];
        }
        
        if (coordinates.length > 0) {
          const routeColor = index === 0 ? '#3498db' : 
                            index === 1 ? '#2ecc71' : 
                            index === 2 ? '#f39c12' : '#9b59b6';
          const routeOpacity = index === 0 ? 0.9 : 0.7;
          const routeWeight = index === 0 ? 8 : 6;
          const isDashed = index > 0;
          
          const latLngs = coordinates.map(coord => [coord.lat, coord.lng]);
          
          const routePolyline = L.polyline(latLngs, {
            color: routeColor,
            weight: routeWeight,
            opacity: routeOpacity,
            dashArray: isDashed ? '10, 5' : undefined,
            interactive: true
          }).addTo(mapInstanceRef.current);
          
          routePolyline.bringToFront();
          const routeInfoText = `Route ${index + 1}: ${routesData[index].distance} km`;
          routePolyline.bindPopup(routeInfoText);
          alternativeRoutesRef.current.push(routePolyline);
        }
      } catch (err) {
        console.error(`Error displaying OSRM route ${index}:`, err);
      }
    });
    
    // Fit map
    setTimeout(() => {
      const allPoints = [];
      alternativeRoutesRef.current.forEach(polyline => {
        const latLngs = polyline.getLatLngs();
        if (Array.isArray(latLngs)) {
          latLngs.forEach(point => {
            if (point instanceof window.L.LatLng) {
              allPoints.push([point.lat, point.lng]);
            } else if (Array.isArray(point)) {
              allPoints.push(point);
            }
          });
        }
      });
      
      allPoints.push([startCoords.lat, startCoords.lng]);
      allPoints.push([endCoords.lat, endCoords.lng]);
      
      if (allPoints.length > 0) {
        try {
          const bounds = window.L.latLngBounds(allPoints);
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
        } catch (err) {
          console.error('Error fitting bounds:', err);
        }
      }
    }, 100);
  };

  // Fetch routes using GraphHopper API (free tier)
  const fetchRoutesFromGraphHopper = async () => {
    try {
      const start = `${startCoords.lat},${startCoords.lng}`;
      const end = `${endCoords.lat},${endCoords.lng}`;
      
      // GraphHopper free API (no key required for basic usage)
      const url = `https://graphhopper.com/api/1/route?point=${start}&point=${end}&type=json&instructions=false&calc_points=true&alternative_route.max_paths=3&key=demo`;
      
      const response = await axios.get(url);
      
      if (response.data && response.data.paths) {
        const routes = response.data.paths;
        displayRoutesFromGraphHopper(routes);
      }
    } catch (err) {
      console.error('GraphHopper error:', err);
      alert('Could not calculate routes. Please check your internet connection and try again.');
    }
  };

  // Display routes from OpenRouteService format
  const displayRoutesFromAPI = (routes) => {
    if (!routes || routes.length === 0) return;
    
    const routesData = routes.map((route, index) => {
      const distance = route.summary ? (route.summary.distance / 1000).toFixed(2) : '0';
      const duration = route.summary ? Math.round(route.summary.duration / 60) : 0;
      
      return {
        index: index,
        distance: distance,
        time: duration,
        color: index === 0 ? '#3498db' : index === 1 ? '#2ecc71' : index === 2 ? '#f39c12' : '#9b59b6',
        isPrimary: index === 0,
        geometry: route.geometry
      };
    });
    
    setRoutes(routesData);
    
    // Set primary route info
    const primaryRoute = routes[0];
    const distance = primaryRoute.summary ? (primaryRoute.summary.distance / 1000).toFixed(2) : '0';
    const time = primaryRoute.summary ? Math.round(primaryRoute.summary.duration / 60) : 0;
    setRouteInfo({
      distance: distance,
      time: time
    });
    
    // Decode and display routes from OpenRouteService (GeoJSON format)
    routes.forEach((route, index) => {
      try {
        let coordinates = [];
        
        // OpenRouteService returns GeoJSON format when format=geojson is requested
        if (route.geometry && route.geometry.coordinates) {
          // GeoJSON coordinates are in [lng, lat] format
          coordinates = route.geometry.coordinates.map(coord => ({
            lat: coord[1], // GeoJSON is [lng, lat]
            lng: coord[0]
          }));
        } else if (route.geometry && typeof route.geometry === 'string') {
          // Encoded polyline - decode it
          try {
            const decoded = decodePolyline(route.geometry);
            coordinates = decoded.map(coord => ({
              lat: coord[0],
              lng: coord[1]
            }));
          } catch (decodeErr) {
            console.error('Error decoding polyline:', decodeErr);
          }
        }
        
        if (coordinates.length > 0) {
          const routeColor = index === 0 ? '#3498db' : 
                            index === 1 ? '#2ecc71' : 
                            index === 2 ? '#f39c12' : '#9b59b6';
          const routeOpacity = index === 0 ? 0.9 : 0.7;
          const routeWeight = index === 0 ? 8 : 6;
          const isDashed = index > 0;
          
          const latLngs = coordinates.map(coord => [coord.lat, coord.lng]);
          
          const routePolyline = L.polyline(latLngs, {
            color: routeColor,
            weight: routeWeight,
            opacity: routeOpacity,
            dashArray: isDashed ? '10, 5' : undefined,
            interactive: true
          }).addTo(mapInstanceRef.current);
          
          routePolyline.bringToFront();
          
          const routeInfoText = `Route ${index + 1}: ${routesData[index].distance} km`;
          routePolyline.bindPopup(routeInfoText);
          
          alternativeRoutesRef.current.push(routePolyline);
        }
      } catch (err) {
        console.error(`Error displaying route ${index}:`, err);
      }
    });
    
    // Fit map to show all routes
    setTimeout(() => {
      const allPoints = [];
      alternativeRoutesRef.current.forEach(polyline => {
        const latLngs = polyline.getLatLngs();
        if (Array.isArray(latLngs)) {
          latLngs.forEach(point => {
            if (point instanceof window.L.LatLng) {
              allPoints.push([point.lat, point.lng]);
            } else if (Array.isArray(point)) {
              allPoints.push(point);
            }
          });
        }
      });
      
      allPoints.push([startCoords.lat, startCoords.lng]);
      allPoints.push([endCoords.lat, endCoords.lng]);
      
      if (allPoints.length > 0) {
        try {
          const bounds = window.L.latLngBounds(allPoints);
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
        } catch (err) {
          console.error('Error fitting bounds:', err);
        }
      }
    }, 100);
  };

  // Display routes from GraphHopper format
  const displayRoutesFromGraphHopper = (paths) => {
    if (!paths || paths.length === 0) return;
    
    const routesData = paths.map((path, index) => {
      const distance = path.distance ? (path.distance / 1000).toFixed(2) : '0';
      const time = path.time ? Math.round(path.time / 60000) : 0; // Convert ms to minutes
      
      return {
        index: index,
        distance: distance,
        time: time,
        color: index === 0 ? '#3498db' : index === 1 ? '#2ecc71' : index === 2 ? '#f39c12' : '#9b59b6',
        isPrimary: index === 0,
        points: path.points
      };
    });
    
    setRoutes(routesData);
    
    const primaryPath = paths[0];
    const distance = primaryPath.distance ? (primaryPath.distance / 1000).toFixed(2) : '0';
    const time = primaryPath.time ? Math.round(primaryPath.time / 60000) : 0;
    setRouteInfo({
      distance: distance,
      time: time
    });
    
    // Decode GraphHopper encoded polyline
    paths.forEach((path, index) => {
      try {
        if (path.points && typeof path.points === 'string') {
          // GraphHopper uses encoded polyline
          // We'll need to decode it - for now, create a simple straight line as fallback
          const routeColor = index === 0 ? '#3498db' : 
                            index === 1 ? '#2ecc71' : 
                            index === 2 ? '#f39c12' : '#9b59b6';
          const routeOpacity = index === 0 ? 0.9 : 0.7;
          const routeWeight = index === 0 ? 8 : 6;
          const isDashed = index > 0;
          
          // Simple fallback: straight line between points
          const latLngs = [
            [startCoords.lat, startCoords.lng],
            [endCoords.lat, endCoords.lng]
          ];
          
          const routePolyline = L.polyline(latLngs, {
            color: routeColor,
            weight: routeWeight,
            opacity: routeOpacity,
            dashArray: isDashed ? '10, 5' : undefined,
            interactive: true
          }).addTo(mapInstanceRef.current);
          
          routePolyline.bringToFront();
          const routeInfoText = `Route ${index + 1}: ${routesData[index].distance} km`;
          routePolyline.bindPopup(routeInfoText);
          alternativeRoutesRef.current.push(routePolyline);
        }
      } catch (err) {
        console.error(`Error displaying GraphHopper route ${index}:`, err);
      }
    });
    
    // Fit map
    setTimeout(() => {
      const bounds = window.L.latLngBounds([
        [startCoords.lat, startCoords.lng],
        [endCoords.lat, endCoords.lng]
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
    }, 100);
  };

  // Setup listeners for Leaflet Routing Machine
  const setupRoutingControlListeners = () => {
    if (!routingControlRef.current) return;
    
    // Listen for route calculation
    routingControlRef.current.on('routesfound', function(e) {
      const foundRoutes = e.routes;
      console.log('Routes found:', foundRoutes.length, foundRoutes);
      
      if (foundRoutes && foundRoutes.length > 0) {
          // Store all routes for display
          const routesData = foundRoutes.map((route, index) => ({
            index: index,
            distance: (route.summary.totalDistance / 1000).toFixed(2),
            time: Math.round(route.summary.totalTime / 60),
            color: index === 0 ? '#3498db' : index === 1 ? '#2ecc71' : index === 2 ? '#f39c12' : '#9b59b6',
            isPrimary: index === 0
          }));
          
          setRoutes(routesData);
          
          // Set primary route info
          const primaryRoute = foundRoutes[0];
          const distance = (primaryRoute.summary.totalDistance / 1000).toFixed(2);
          const time = Math.round(primaryRoute.summary.totalTime / 60);
          setRouteInfo({
            distance: distance,
            time: time
          });

          // Get route coordinates and create highlighted polylines
          // Leaflet Routing Machine provides routes with coordinates property
          foundRoutes.forEach((route, index) => {
            try {
              // Access coordinates - Leaflet Routing Machine stores them as LatLng objects
              let coordinates = [];
              
              // Try to get coordinates from the route object
              if (route.coordinates && Array.isArray(route.coordinates)) {
                coordinates = route.coordinates;
              } else if (route.coordinate && Array.isArray(route.coordinate)) {
                coordinates = route.coordinate;
              } else if (route.instructions && route.instructions.length > 0) {
                // Extract coordinates from instructions if available
                coordinates = route.instructions
                  .map(instruction => instruction.coords || instruction.coordinate)
                  .filter(coord => coord !== undefined);
              }
              
              if (coordinates && coordinates.length > 0) {
                const routeColor = index === 0 ? '#3498db' : 
                                  index === 1 ? '#2ecc71' : 
                                  index === 2 ? '#f39c12' : '#9b59b6';
                const routeOpacity = index === 0 ? 0.9 : 0.7;
                const routeWeight = index === 0 ? 8 : 6;
                const isDashed = index > 0;

                // Convert coordinates to [lat, lng] format for Leaflet
                const latLngs = coordinates
                  .map(coord => {
                    if (coord instanceof window.L.LatLng) {
                      return [coord.lat, coord.lng];
                    } else if (coord && typeof coord === 'object' && coord.lat !== undefined && coord.lng !== undefined) {
                      return [coord.lat, coord.lng];
                    } else if (Array.isArray(coord) && coord.length >= 2) {
                      // Handle [lng, lat] or [lat, lng] format - try both
                      const lat = typeof coord[0] === 'number' ? (coord[0] > 90 ? coord[1] : coord[0]) : coord[1];
                      const lng = typeof coord[0] === 'number' ? (coord[0] > 90 ? coord[0] : coord[1]) : coord[0];
                      return [lat, lng];
                    }
                    return null;
                  })
                  .filter(coord => coord !== null && Array.isArray(coord) && coord.length === 2 && 
                          typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                          coord[0] >= -90 && coord[0] <= 90 && coord[1] >= -180 && coord[1] <= 180);

                if (latLngs.length > 0) {
                  const routePolyline = L.polyline(latLngs, {
                    color: routeColor,
                    weight: routeWeight,
                    opacity: routeOpacity,
                    dashArray: isDashed ? '10, 5' : undefined,
                    interactive: true
                  }).addTo(mapInstanceRef.current);

                  // Bring to front to ensure visibility
                  routePolyline.bringToFront();

                  // Add popup with route info
                  const routeInfoText = `Route ${index + 1}: ${(route.summary.totalDistance / 1000).toFixed(2)} km`;
                  routePolyline.bindPopup(routeInfoText);
                  
                  alternativeRoutesRef.current.push(routePolyline);
                } else {
                  console.warn(`Route ${index} has no valid coordinates`);
                }
              } else {
                console.warn(`Route ${index} has no coordinates property`);
              }
            } catch (err) {
              console.error(`Error processing route ${index}:`, err);
            }
          });

          // Fit map to show all routes
          setTimeout(() => {
            const allPoints = [];
            
            // Collect all route points
            alternativeRoutesRef.current.forEach(polyline => {
              const latLngs = polyline.getLatLngs();
              if (Array.isArray(latLngs)) {
                latLngs.forEach(point => {
                  if (point instanceof window.L.LatLng) {
                    allPoints.push([point.lat, point.lng]);
                  } else if (Array.isArray(point)) {
                    allPoints.push(point);
                  }
                });
              }
            });
            
            // Add start and end points
            allPoints.push([startCoords.lat, startCoords.lng]);
            allPoints.push([endCoords.lat, endCoords.lng]);
            
            if (allPoints.length > 0) {
              try {
                const bounds = window.L.latLngBounds(allPoints);
                mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
              } catch (err) {
                console.error('Error fitting bounds:', err);
                // Fallback
                const bounds = window.L.latLngBounds([
                  [startCoords.lat, startCoords.lng],
                  [endCoords.lat, endCoords.lng]
                ]);
                mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
              }
            }
          }, 100);
        }
      });

      // Handle routing errors
      routingControlRef.current.on('routingerror', function(e) {
        console.error('Routing error:', e);
        alert('Could not calculate route. Please check your start and end locations.');
      });
    };

  // Clear route
  const clearRoute = () => {
    if (routingControlRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeControl(routingControlRef.current);
      routingControlRef.current = null;
    }
    
    // Remove alternative route layers
    alternativeRoutesRef.current.forEach(layer => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });
    alternativeRoutesRef.current = [];
    
    // Remove route markers
    if (mapInstanceRef.current) {
      routeMarkersRef.current.forEach(marker => {
        mapInstanceRef.current.removeLayer(marker);
      });
      routeMarkersRef.current = [];
    }
    
    setStartLocation('');
    setEndLocation('');
    setStartCoords(null);
    setEndCoords(null);
    setRouteInfo(null);
    setRoutes([]);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-slate-950"
      style={{ fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif" }}
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50 shadow-lg"
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/">
            <motion.button
              whileHover={{ scale: 1.05, x: -5 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 text-white/90 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 font-medium"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Home</span>
            </motion.button>
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-xl backdrop-blur-sm border border-red-500/30">
              <MapPin className="text-red-400 w-6 h-6" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent">
              Hazard Map
            </h1>
          </div>
          
          <Link to="/live">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-200"
            >
              <span className="hidden sm:inline">Live Detection</span>
            </motion.button>
          </Link>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Stats Cards */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
        >
          <motion.div 
            whileHover={{ y: -8, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="group relative bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent backdrop-blur-xl rounded-2xl p-6 border border-red-500/20 shadow-xl shadow-red-500/10 hover:shadow-red-500/20 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-xl backdrop-blur-sm border border-red-500/30">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 180 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleRefresh}
                  disabled={loading}
                  className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                >
                  <RotateCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </motion.button>
              </div>
              <div className="text-white/60 text-sm font-medium mb-2 uppercase tracking-wide">Total Hazard Locations</div>
              <div className="text-5xl font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                {routeComparison 
                  ? (routeComparison.route_a?.hazards?.length || 0) + (routeComparison.route_b?.hazards?.length || 0)
                  : potholes.length}
              </div>
            </div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -8, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.05 }}
            className="group relative bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent backdrop-blur-xl rounded-2xl p-6 border border-blue-500/20 shadow-xl shadow-blue-500/10 hover:shadow-blue-500/20 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <div className="mb-4">
                <div className="p-3 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl backdrop-blur-sm border border-blue-500/30 w-fit">
                  <MapPin className="w-6 h-6 text-blue-400" />
                </div>
              </div>
              <div className="text-white/60 text-sm font-medium mb-2 uppercase tracking-wide">Recent Reports (7 Days)</div>
              <div className="text-5xl font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                {routeComparison 
                  ? (() => {
                      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                      const routeAHazards = routeComparison.route_a?.hazards || [];
                      const routeBHazards = routeComparison.route_b?.hazards || [];
                      const allHazards = [...routeAHazards, ...routeBHazards];
                      return allHazards.filter(h => new Date(h.reported_on) > sevenDaysAgo).length;
                    })()
                  : potholes.filter(p => new Date(p.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}
              </div>
            </div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -8, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.1 }}
            className="group relative bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent backdrop-blur-xl rounded-2xl p-6 border border-amber-500/20 shadow-xl shadow-amber-500/10 hover:shadow-amber-500/20 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <div className="mb-4">
                <div className="p-3 bg-gradient-to-br from-amber-500/20 to-yellow-500/20 rounded-xl backdrop-blur-sm border border-amber-500/30 w-fit">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
              </div>
              <div className="text-white/60 text-sm font-medium mb-2 uppercase tracking-wide">Active Hazards</div>
              <div className="text-5xl font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                {routeComparison 
                  ? (routeComparison.route_a?.hazards?.length || 0) + (routeComparison.route_b?.hazards?.length || 0)
                  : potholes.filter(p => p.status === 'reported').length}
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Route Comparison Panel */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-800/50 shadow-xl mb-8 overflow-hidden"
        >
          <div className="bg-slate-800/50 px-6 py-5 border-b border-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl backdrop-blur-sm border border-blue-500/30">
                <Navigation className="text-blue-400 w-5 h-5" />
              </div>
              <h2 className="text-white text-2xl font-bold">Route Comparison</h2>
            </div>
            {routeComparison && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowRouteComparison(!showRouteComparison)}
                className={`px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                  showRouteComparison 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50' 
                    : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                }`}
              >
                {showRouteComparison ? 'Hide Routes' : 'Show Routes'}
              </motion.button>
            )}
          </div>
          
          {routeComparisonLoading ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 border-4 border-[#3498db] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white">Loading route comparison data...</p>
            </div>
          ) : routeComparisonError ? (
            <div className="p-6">
              <div className="bg-[#e74c3c]/20 border border-[#e74c3c] rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-[#e74c3c] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-semibold mb-1">Error Loading Route Data</p>
                    <p className="text-gray-300 text-sm mb-3">{routeComparisonError}</p>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={fetchRouteComparison}
                      className="px-4 py-2 bg-[#3498db] text-white rounded-lg font-semibold hover:bg-[#2980b9] transition-colors"
                    >
                      Retry
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          ) : routeComparison ? (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Route A Stats */}
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className={`group relative bg-gradient-to-br ${
                    routeComparison.comparison.preferred_route === 'Route A' 
                      ? 'from-emerald-500/20 via-emerald-500/10 to-transparent border-emerald-500/40 shadow-lg shadow-emerald-500/20' 
                      : 'from-blue-500/20 via-blue-500/10 to-transparent border-blue-500/30'
                  } backdrop-blur-xl rounded-2xl p-6 border-2 transition-all duration-300 overflow-hidden`}
                >
                  {routeComparison.comparison.preferred_route === 'Route A' && (
                    <div className="absolute top-0 right-0 bg-gradient-to-br from-emerald-500 to-green-500 text-white px-3 py-1 rounded-bl-xl text-xs font-bold shadow-lg">
                      ⭐ PREFERRED
                    </div>
                  )}
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2.5 rounded-xl ${
                        routeComparison.comparison.preferred_route === 'Route A' 
                          ? 'bg-gradient-to-br from-emerald-500/30 to-green-500/30' 
                          : 'bg-gradient-to-br from-blue-500/30 to-cyan-500/30'
                      } border border-blue-500/40`}>
                        <div className={`w-3 h-3 rounded-full ${
                          routeComparison.comparison.preferred_route === 'Route A' 
                            ? 'bg-emerald-400' 
                            : 'bg-blue-400'
                        }`}></div>
                      </div>
                      <h3 className="text-white font-bold text-xl">Route A</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                        <span className="text-white/70 text-sm font-medium">Total Hazards</span>
                        <span className="text-white font-bold text-lg">{routeComparison.route_a.statistics.total_hazards}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                        <span className="text-white/70 text-sm font-medium">Total Severity</span>
                        <span className="text-white font-bold text-lg">{routeComparison.route_a.statistics.total_severity}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                        <span className="text-white/70 text-sm font-medium">Avg Severity</span>
                        <span className="text-white font-bold text-lg">{routeComparison.route_a.statistics.average_severity}/5</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-lg border border-blue-500/30">
                        <span className="text-white/90 text-sm font-semibold">Route Score</span>
                        <span className="text-white font-bold text-xl">{routeComparison.comparison.route_a_score}</span>
                      </div>
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <div className="text-white/60 text-xs font-semibold mb-2 uppercase tracking-wide">Hazard Types</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(routeComparison.route_a.statistics.hazard_types).map(([type, count]) => (
                            <span key={type} className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg text-xs text-white font-medium border border-white/20">
                              {type.replace('_', ' ')}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Route B Stats */}
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className={`group relative bg-gradient-to-br ${
                    routeComparison.comparison.preferred_route === 'Route B' 
                      ? 'from-emerald-500/20 via-emerald-500/10 to-transparent border-emerald-500/40 shadow-lg shadow-emerald-500/20' 
                      : 'from-red-500/20 via-red-500/10 to-transparent border-red-500/30'
                  } backdrop-blur-xl rounded-2xl p-6 border-2 transition-all duration-300 overflow-hidden`}
                >
                  {routeComparison.comparison.preferred_route === 'Route B' && (
                    <div className="absolute top-0 right-0 bg-gradient-to-br from-emerald-500 to-green-500 text-white px-3 py-1 rounded-bl-xl text-xs font-bold shadow-lg">
                      ⭐ PREFERRED
                    </div>
                  )}
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2.5 rounded-xl ${
                        routeComparison.comparison.preferred_route === 'Route B' 
                          ? 'bg-gradient-to-br from-emerald-500/30 to-green-500/30' 
                          : 'bg-gradient-to-br from-red-500/30 to-orange-500/30'
                      } border border-red-500/40`}>
                        <div className={`w-3 h-3 rounded-full ${
                          routeComparison.comparison.preferred_route === 'Route B' 
                            ? 'bg-emerald-400' 
                            : 'bg-red-400'
                        }`}></div>
                      </div>
                      <h3 className="text-white font-bold text-xl">Route B</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                        <span className="text-white/70 text-sm font-medium">Total Hazards</span>
                        <span className="text-white font-bold text-lg">{routeComparison.route_b.statistics.total_hazards}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                        <span className="text-white/70 text-sm font-medium">Total Severity</span>
                        <span className="text-white font-bold text-lg">{routeComparison.route_b.statistics.total_severity}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                        <span className="text-white/70 text-sm font-medium">Avg Severity</span>
                        <span className="text-white font-bold text-lg">{routeComparison.route_b.statistics.average_severity}/5</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-lg border border-red-500/30">
                        <span className="text-white/90 text-sm font-semibold">Route Score</span>
                        <span className="text-white font-bold text-xl">{routeComparison.comparison.route_b_score}</span>
                      </div>
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <div className="text-white/60 text-xs font-semibold mb-2 uppercase tracking-wide">Hazard Types</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(routeComparison.route_b.statistics.hazard_types).map(([type, count]) => (
                            <span key={type} className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg text-xs text-white font-medium border border-white/20">
                              {type.replace('_', ' ')}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Recommendation */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-gradient-to-r from-emerald-500/20 via-green-500/15 to-emerald-500/20 backdrop-blur-xl border border-emerald-500/40 rounded-xl p-5 shadow-lg shadow-emerald-500/20"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-gradient-to-br from-emerald-500/30 to-green-500/30 rounded-xl border border-emerald-500/40">
                    <AlertTriangle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-bold text-lg mb-2">Recommendation</p>
                    <p className="text-white/90 text-sm leading-relaxed">{routeComparison.comparison.recommendation}</p>
                  </div>
                </div>
              </motion.div>

              {/* Legend */}
              {showRouteComparison && (
                <div className="mt-4 pt-4 border-t border-white/20">
                  <p className="text-white font-semibold text-sm mb-3">Hazard Type Legend:</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-[#8b4513] border-2 border-[#3498db] flex items-center justify-center text-white text-xs font-bold">P</div>
                      <span className="text-gray-300">Pothole (Circle)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-[#f39c12] border-2 border-[#3498db] flex items-center justify-center text-white text-xs font-bold" style={{transform: 'rotate(45deg)'}}>
                        <span style={{transform: 'rotate(-45deg)'}}>D</span>
                      </div>
                      <span className="text-gray-300">Debris (Diamond)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-[#e67e22] border-2 border-[#3498db] rounded flex items-center justify-center text-white text-xs font-bold">⚠</div>
                      <span className="text-gray-300">Construction (Square)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-[#3498db] border-2 border-[#3498db] flex items-center justify-center text-white text-xs font-bold" style={{clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)'}}>W</div>
                      <span className="text-gray-300">Waterlogging (Triangle)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-[#27ae60] border-2 border-[#3498db] flex items-center justify-center text-white text-xs font-bold" style={{clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'}}>T</div>
                      <span className="text-gray-300">Fallen Tree (Triangle)</span>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs mt-3">
                    💡 Blue border = Route A | Red border = Route B | Marker size indicates severity (larger = more severe)
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-gray-300">No route comparison data available</p>
            </div>
          )}
        </motion.div>

        {/* Loading and Error States */}
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6 text-center"
          >
            <div className="w-16 h-16 border-4 border-[#3498db] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white text-lg">Loading hazard data...</p>
          </motion.div>
        )}

        {error && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-[#e74c3c]/20 backdrop-blur-lg rounded-2xl p-6 border border-[#e74c3c] mb-6 text-center"
          >
            <AlertTriangle className="w-16 h-16 text-[#e74c3c] mx-auto mb-3" />
            <p className="text-white text-lg">{error}</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              className="mt-4 px-6 py-2 bg-[#e74c3c] text-white rounded-full font-semibold"
            >
              Try Again
            </motion.button>
          </motion.div>
        )}

        {/* Routing Panel */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-800/50 shadow-xl mb-8 overflow-hidden"
        >
          <div className="bg-slate-800/50 px-6 py-5 border-b border-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl backdrop-blur-sm border border-blue-500/30">
                <Navigation className="text-blue-400 w-5 h-5" />
              </div>
              <h2 className="text-white text-2xl font-bold">Route Planner</h2>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowRoutePanel(!showRoutePanel)}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
            >
              {showRoutePanel ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </motion.button>
          </div>
          
          {showRoutePanel && (
            <div className="p-6 space-y-4">
              {/* Start Location */}
              <div className="relative">
                <label className="block text-white text-sm font-semibold mb-2">Start Location</label>
                <div className="flex gap-2 relative">
                  <div className="flex-1 relative">
                    <input
                      ref={startInputRef}
                      type="text"
                      value={startLocation}
                      onChange={(e) => handleStartLocationChange(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          if (showStartSuggestions && startSuggestions.length > 0) {
                            handleStartSuggestionSelect(startSuggestions[0]);
                          } else {
                            handleStartSearch();
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowStartSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        if (startSuggestions.length > 0) {
                          setShowStartSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => setShowStartSuggestions(false), 200);
                      }}
                      placeholder="Enter start address or click 'Use Current'"
                      className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3498db]"
                    />
                    {/* Autocomplete Dropdown */}
                    {showStartSuggestions && startSuggestions.length > 0 && (
                      <div
                        ref={startSuggestionsRef}
                        className="absolute z-50 w-full mt-1 bg-slate-900/95 backdrop-blur-xl border border-slate-800/50 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                      >
                        {startSuggestions.map((suggestion, index) => (
                          <div
                            key={index}
                            onClick={() => handleStartSuggestionSelect(suggestion)}
                            className="px-4 py-3 hover:bg-slate-800/50 cursor-pointer border-b border-slate-800/30 last:border-b-0 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <MapPin className="w-4 h-4 text-[#3498db] mt-1 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-white text-sm font-medium truncate">
                                  {suggestion.displayName.split(',')[0]}
                                </div>
                                <div className="text-gray-400 text-xs truncate mt-1">
                                  {suggestion.displayName.split(',').slice(1).join(',').trim() || suggestion.displayName}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleUseCurrentLocation}
                    className="px-4 py-2 bg-[#2ecc71] text-white rounded-lg font-semibold hover:bg-[#27ae60] transition-colors whitespace-nowrap"
                  >
                    Use Current
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStartSearch}
                    disabled={searchingStart || !startLocation.trim()}
                    className="px-4 py-2 bg-[#3498db] text-white rounded-lg font-semibold hover:bg-[#2980b9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {searchingStart ? (
                      <RotateCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Search
                  </motion.button>
                </div>
              </div>

              {/* End Location */}
              <div className="relative">
                <label className="block text-white text-sm font-semibold mb-2">End Location</label>
                <div className="flex gap-2 relative">
                  <div className="flex-1 relative">
                    <input
                      ref={endInputRef}
                      type="text"
                      value={endLocation}
                      onChange={(e) => handleEndLocationChange(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          if (showEndSuggestions && endSuggestions.length > 0) {
                            handleEndSuggestionSelect(endSuggestions[0]);
                          } else {
                            handleEndSearch();
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowEndSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        if (endSuggestions.length > 0) {
                          setShowEndSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => setShowEndSuggestions(false), 200);
                      }}
                      placeholder="Enter destination address"
                      className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3498db]"
                    />
                    {/* Autocomplete Dropdown */}
                    {showEndSuggestions && endSuggestions.length > 0 && (
                      <div
                        ref={endSuggestionsRef}
                        className="absolute z-50 w-full mt-1 bg-slate-900/95 backdrop-blur-xl border border-slate-800/50 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                      >
                        {endSuggestions.map((suggestion, index) => (
                          <div
                            key={index}
                            onClick={() => handleEndSuggestionSelect(suggestion)}
                            className="px-4 py-3 hover:bg-slate-800/50 cursor-pointer border-b border-slate-800/30 last:border-b-0 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <MapPin className="w-4 h-4 text-[#e74c3c] mt-1 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-white text-sm font-medium truncate">
                                  {suggestion.displayName.split(',')[0]}
                                </div>
                                <div className="text-gray-400 text-xs truncate mt-1">
                                  {suggestion.displayName.split(',').slice(1).join(',').trim() || suggestion.displayName}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleEndSearch}
                    disabled={searchingEnd || !endLocation.trim()}
                    className="px-4 py-2 bg-[#3498db] text-white rounded-lg font-semibold hover:bg-[#2980b9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {searchingEnd ? (
                      <RotateCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Search
                  </motion.button>
                </div>
              </div>

              {/* Route Info */}
              {routeInfo && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#3498db]/20 border border-[#3498db]/30 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-white font-semibold">Primary Route</p>
                      <p className="text-gray-300 text-sm mt-1">
                        Distance: <span className="text-white font-semibold">{routeInfo.distance} km</span>
                      </p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={clearRoute}
                      className="px-4 py-2 bg-[#e74c3c] text-white rounded-lg font-semibold hover:bg-[#c0392b] transition-colors flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Clear Route
                    </motion.button>
                  </div>
                  
                  {/* Alternative Routes List */}
                  {routes.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-white/20">
                      <p className="text-white font-semibold text-sm mb-2">All Available Routes ({routes.length}):</p>
                      <div className="space-y-2">
                        {routes.map((route, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className={`flex items-center justify-between p-2 rounded-lg ${
                              route.isPrimary 
                                ? 'bg-[#3498db]/30 border border-[#3498db]/50' 
                                : 'bg-white/5 border border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-4 h-4 rounded-full border-2 border-white"
                                style={{ backgroundColor: route.color }}
                              ></div>
                              <div>
                                <p className="text-white text-sm font-semibold">
                                  Route {index + 1} {route.isPrimary && '(Primary)'}
                                </p>
                                <p className="text-gray-300 text-xs">
                                  {route.distance} km
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      <p className="text-gray-400 text-xs mt-2">
                        💡 All routes are highlighted on the map with different colors
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </motion.div>

        {/* Map Container */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900/80 backdrop-blur-xl rounded-2xl overflow-hidden border border-slate-800/50 shadow-xl"
        >
          <div className="bg-slate-800/50 px-6 py-5 border-b border-slate-800/50">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl backdrop-blur-sm border border-blue-500/30">
                <MapPin className="text-blue-400 w-5 h-5" />
              </div>
              <h2 className="text-white text-2xl font-bold">Interactive Hazard Map</h2>
            </div>
            <p className="text-white/70 text-sm ml-12">
              Click on markers to view detailed information about each hazard
            </p>
          </div>
          
          <div ref={mapRef} className="w-full h-[600px] bg-slate-900"></div>
        </motion.div>

        {/* Hazard List */}
        {potholes.length > 0 && (
          <motion.div 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-6 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-6"
          >
            <h2 className="text-white text-xl font-semibold mb-4">Recent Hazard Reports</h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {potholes.slice(0, 10).map((pothole, index) => (
                <motion.div
                  key={index}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white/5 rounded-xl p-4 hover:bg-white/10 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-semibold">{pothole.type || 'Unknown Hazard'}</div>
                      <div className="text-gray-400 text-sm">
                        {new Date(pothole.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      pothole.status === 'reported' ? 'bg-[#e74c3c]/20 text-[#e74c3c]' : 'bg-[#2ecc71]/20 text-[#2ecc71]'
                    }`}>
                      {pothole.status || 'reported'}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}