import { useEffect, useRef, useState } from 'react';
import apiClient from '../utils/axios';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, RotateCw, AlertTriangle, Navigation, X, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  const routeMarkersRef = useRef([]);
  const alternativeRoutesRef = useRef([]); // Store alternative route layers
  
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
      
      // Calculate center point from all potholes
      let centerLat = 0;
      let centerLng = 0;
      
      if (potholes.length > 0) {
        potholes.forEach(pothole => {
          if (pothole.location && pothole.location.lat && pothole.location.lng) {
            centerLat += pothole.location.lat;
            centerLng += pothole.location.lng;
          }
        });
        
        centerLat /= potholes.length;
        centerLng /= potholes.length;
      } else {
        // Default center (can be adjusted)
        centerLat = 0;
        centerLng = 0;
      }
      
      // Create Leaflet map instance
      const map = L.map(mapRef.current).setView([centerLat, centerLng], potholes.length > 0 ? 13 : 2);
      
      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);
      
      mapInstanceRef.current = map;
      
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
      
      // Fit map bounds to show all markers if we have potholes
      if (potholes.length > 0 && markersRef.current.length > 0) {
        const group = new L.featureGroup(markersRef.current);
        map.fitBounds(group.getBounds().pad(0.1));
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
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];
      routeMarkersRef.current = [];
      alternativeRoutesRef.current = [];
    };
  }, [potholes]);
  
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

  // Geocode address using Nominatim (OpenStreetMap geocoding service)
  const geocodeAddress = async (address) => {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: address,
          format: 'json',
          limit: 1,
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'HazardEye/1.0' // Required by Nominatim
        }
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
      className="min-h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white/10 backdrop-blur-lg border-b border-white/20"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/">
            <motion.button
              whileHover={{ scale: 1.05, x: -5 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 text-white hover:text-[#3498db] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold">Back to Home</span>
            </motion.button>
          </Link>
          
          <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-3">
            <MapPin className="text-[#e74c3c] w-7 h-7" />
            Hazard Map
          </h1>
          
          <Link to="/live">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 bg-[#3498db] text-white rounded-full font-semibold shadow-lg"
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
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6"
        >
          <motion.div 
            whileHover={{ y: -5 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="w-10 h-10 text-[#e74c3c]" />
              <motion.button
                whileHover={{ scale: 1.1, rotate: 180 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleRefresh}
                disabled={loading}
                className="text-white hover:text-[#3498db] transition-colors"
              >
                <RotateCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </motion.button>
            </div>
            <div className="text-gray-300 text-sm mb-1">Total Hazard Locations</div>
            <div className="text-4xl font-bold text-white">{potholes.length}</div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -5 }}
            transition={{ delay: 0.1 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="mb-2">
              <MapPin className="w-10 h-10 text-[#3498db]" />
            </div>
            <div className="text-gray-300 text-sm mb-1">Recent Reports (7 Days)</div>
            <div className="text-4xl font-bold text-white">
              {potholes.filter(p => new Date(p.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}
            </div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -5 }}
            transition={{ delay: 0.2 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="mb-2">
              <AlertTriangle className="w-10 h-10 text-[#f39c12]" />
            </div>
            <div className="text-gray-300 text-sm mb-1">Active Hazards</div>
            <div className="text-4xl font-bold text-white">
              {potholes.filter(p => p.status === 'reported').length}
            </div>
          </motion.div>
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
          className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 mb-6"
        >
          <div className="bg-white/5 px-6 py-4 border-b border-white/20 flex items-center justify-between">
            <h2 className="text-white text-xl font-semibold flex items-center gap-2">
              <Navigation className="text-[#3498db] w-6 h-6" />
              Route Planner
            </h2>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowRoutePanel(!showRoutePanel)}
              className="text-white hover:text-[#3498db] transition-colors"
            >
              {showRoutePanel ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </motion.button>
          </div>
          
          {showRoutePanel && (
            <div className="p-6 space-y-4">
              {/* Start Location */}
              <div>
                <label className="block text-white text-sm font-semibold mb-2">Start Location</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={startLocation}
                    onChange={(e) => setStartLocation(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleStartSearch()}
                    placeholder="Enter start address or click 'Use Current'"
                    className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3498db]"
                  />
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
              <div>
                <label className="block text-white text-sm font-semibold mb-2">End Location</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={endLocation}
                    onChange={(e) => setEndLocation(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleEndSearch()}
                    placeholder="Enter destination address"
                    className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3498db]"
                  />
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
          className="bg-white/10 backdrop-blur-lg rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
        >
          <div className="bg-white/5 px-6 py-4 border-b border-white/20">
            <h2 className="text-white text-xl font-semibold flex items-center gap-2">
              <MapPin className="text-[#3498db] w-6 h-6" />
              Interactive Hazard Map
            </h2>
            <p className="text-gray-300 text-sm mt-1">
              Click on markers to view detailed information about each hazard
            </p>
          </div>
          
          <div ref={mapRef} className="w-full h-[600px] bg-gray-900"></div>
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