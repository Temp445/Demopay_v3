import { useState, useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer, 
  Marker,
  Circle, 
  useMapEvents, 
  useMap,
  ZoomControl 
} from 'react-leaflet';
import { Search, MapPin, LocateFixed, X, Lightbulb, Maximize, Minimize } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LocationSearchResult } from '../../../types/workLocation';
import MapLibre3DPicker from './MapLibre3DPicker';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Marker Icon Generator
const getMarkerIcon = (color: string = '#4f46e5') => L.divIcon({
  className: 'custom-indigo-marker',
  html: `<div style="display: flex; justify-content: center; align-items: flex-end; width: 100%; height: 100%; drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
           <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="${color}" stroke="none">
             <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
             <circle cx="12" cy="10" r="3" fill="#ffffff" />
           </svg>
         </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

interface LocationMapPickerProps {
  initialLat?: number;
  initialLng?: number;
  /** Controlled lat — when provided, the map pin moves to this position */
  lat?: number;
  /** Controlled lng — when provided, the map pin moves to this position */
  lng?: number;
  onLocationSelect: (data: {
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    formatted_address?: string;
  }) => void;
  showSearch?: boolean;
  height?: string;
  readOnly?: boolean;
  radius?: number;
  markerColor?: string;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(map.getContainer());
    return () => resizeObserver.disconnect();
  }, [map]);
  return null;
}

export default function LocationMapPicker({
  initialLat = 13.0827,
  initialLng = 80.2707,
  lat,
  lng,
  onLocationSelect,
  showSearch = true,
  height = '400px',
  readOnly = false,
  radius,
  markerColor = '#4f46e5',
}: LocationMapPickerProps) {
  const [position, setPosition] = useState<[number, number]>([
    lat !== undefined && !isNaN(lat) ? lat : initialLat,
    lng !== undefined && !isNaN(lng) ? lng : initialLng
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [mapType, setMapType] = useState<'street' | 'satellite' | '3d'>('street');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const mapRef = useRef<L.Map | null>(null);
  // Track whether mount-time geolocation has finished so we don't fight it
  const mountedRef = useRef(false);
  // Ref mirror of selectedAddress — lets the debounce read the latest value
  // without selectedAddress being a dependency (which caused the re-open bug)
  const selectedAddressRef = useRef('');

  // --- CONTROLLED POSITION: move pin when parent changes lat/lng props ---
  useEffect(() => {
    if (!mountedRef.current) return; // skip on first render — geolocation handles initial position
    if (lat === undefined || lng === undefined) return;
    if (isNaN(lat) || isNaN(lng)) return;
    setPosition([lat, lng]);
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], mapRef.current.getZoom());
    }
  }, [lat, lng]);

  // --- AUTO SEARCH DEBOUNCE EFFECT ---
  // NOTE: selectedAddress is intentionally NOT in the dep array.
  // We read it via ref to avoid the bug where reverseGeocode resolving
  // with a new address re-fired this effect with a stale searchQuery,
  // causing the suggestion box to open after pin drag.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 3 && showSearch && searchQuery !== selectedAddressRef.current) {
        searchLocation(searchQuery, false);
      } else if (searchQuery.trim().length === 0) {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, showSearch]);

  // ---- FIXED: Using Photon API specifically built for Autocomplete & Companies ----
  const searchLocation = async (query: string, autoSelectFirst = false) => {
    if (!query.trim()) return;

    setSearching(true);
    try {
      // Photon is highly tolerant of typos and supports autocomplete without blocking
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=en`
      );
      
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const mappedResults: LocationSearchResult[] = data.features.map((feature: any) => {
          const props = feature.properties;
          const coords = feature.geometry.coordinates; // Photon returns [lon, lat]
          
          // Construct a clean, readable address focusing on the company/POI name first
          const name = props.name || '';
          const street = [props.housenumber, props.street].filter(Boolean).join(' ');
          const city = props.city || props.town || props.village || props.county || '';
          const state = props.state || '';
          
          // Build display name array and remove duplicates/empty strings
          const displayNameParts = [name, street, city, state, props.postcode, props.country].filter(p => p && p.trim() !== '');
          const displayName = Array.from(new Set(displayNameParts)).join(', ');

          return {
            lat: coords[1].toString(),
            lon: coords[0].toString(),
            display_name: displayName || query,
            address: {
              road: street,
              city: city,
              state: state,
              country: props.country || '',
              postcode: props.postcode || '',
            }
          };
        });

        // Filter out duplicate display names to avoid cluttered dropdown
        const uniqueResults = mappedResults.filter((v, i, a) => 
          a.findIndex(t => t.display_name === v.display_name) === i
        );

        setSearchResults(uniqueResults);

        if (autoSelectFirst && uniqueResults.length > 0) {
          handleResultSelect(uniqueResults[0]);
        } else {
          setShowResults(true);
        }
      } else {
        // No results found
        setSearchResults([]);
        setShowResults(true);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=en`
      );
      const data = await response.json();

      const addressData = {
        latitude: lat,
        longitude: lng,
        address: data.address?.road || '',
        city: data.address?.city || data.address?.town || data.address?.village || data.address?.county || '',
        state: data.address?.state || '',
        country: data.address?.country || '',
        postal_code: data.address?.postcode || '',
        formatted_address: data.display_name || '',
      };

      selectedAddressRef.current = data.display_name || '';
      setSelectedAddress(data.display_name || '');
      onLocationSelect(addressData);
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
      onLocationSelect({
        latitude: lat,
        longitude: lng,
      });
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  const handleMapClick = (lat: number, lng: number) => {
    setPosition([lat, lng]);
    reverseGeocode(lat, lng);
    clearSearch();
  };

  const handleResultSelect = (result: LocationSearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setPosition([lat, lng]);
    selectedAddressRef.current = result.display_name;
    setSelectedAddress(result.display_name);
    setShowResults(false);
    // Keep the selected address visible in the search box for clarity.
    // Re-open bug is prevented by selectedAddressRef (not by clearing the query).
    setSearchQuery(result.display_name);

    const addressData = {
      latitude: lat,
      longitude: lng,
      address: result.address?.road || '',
      city: result.address?.city || result.address?.county || '',
      state: result.address?.state || '',
      country: result.address?.country || '',
      postal_code: result.address?.postcode || '',
      formatted_address: result.display_name,
    };

    onLocationSelect(addressData);

    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 16);
    }
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setPosition([lat, lng]);
          reverseGeocode(lat, lng);
          clearSearch();

          if (mapRef.current) {
            mapRef.current.setView([lat, lng], 16);
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
        }
      );
    }
  };

  useEffect(() => {
    // If parent has already supplied controlled coordinates, use those directly
    const controlledLat = lat !== undefined && !isNaN(lat) ? lat : null;
    const controlledLng = lng !== undefined && !isNaN(lng) ? lng : null;

    if (controlledLat !== null && controlledLng !== null) {
      setPosition([controlledLat, controlledLng]);
      reverseGeocode(controlledLat, controlledLng);
      if (mapRef.current) {
        mapRef.current.setView([controlledLat, controlledLng], 15);
      }
      mountedRef.current = true;
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const geoLat = pos.coords.latitude;
          const geoLng = pos.coords.longitude;
          setPosition([geoLat, geoLng]);
          reverseGeocode(geoLat, geoLng);
          if (mapRef.current) {
            mapRef.current.setView([geoLat, geoLng], 15);
          }
          mountedRef.current = true;
        },
        () => {
          setPosition([initialLat, initialLng]);
          reverseGeocode(initialLat, initialLng);
          mountedRef.current = true;
        }
      );
    } else {
      setPosition([initialLat, initialLng]);
      reverseGeocode(initialLat, initialLng);
      mountedRef.current = true;
    }
  }, []);

  return (
    <div className={isFullscreen 
      ? "fixed inset-0 z-[9999] bg-white flex flex-col w-full h-[100dvh]" 
      : `flex flex-col space-y-3 w-full ${height === '100%' ? 'h-full' : ''}`
    }>
      
      {/* 1. TOP SECTION: Search & Hint */}
      {showSearch && (
        <div className={`flex flex-col space-y-2 relative z-10 ${isFullscreen ? 'p-3 pb-0' : ''}`}>
          <div className="bg-white rounded-lg shadow-sm border border-gray-300 flex items-center px-3 sm:px-4 py-2 sm:py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
            <Search className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchLocation(searchQuery, true); 
              }}
              placeholder="Search for a city, company, or landmark..."
              className="flex-1 w-full pl-3 pr-2 bg-transparent border-none focus:outline-none text-gray-700 placeholder-gray-400 text-sm sm:text-base"
            />
            
            <div className="flex items-center gap-2 flex-shrink-0">
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {searching && (
                <div className="flex space-x-1 w-6 justify-center">
                  <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start sm:items-center gap-1.5 px-1">
            <Lightbulb className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-amber-500 flex-shrink-0 mt-0.5 sm:mt-0" />
            <span className="text-[11px] sm:text-xs text-gray-500 leading-tight">
              If a specific company doesn't appear, search for the street or city, then drag the pin exactly to the building.
            </span>
          </div>

          {showResults && (
            <div className="absolute top-12 left-0 right-0 bg-white rounded-lg shadow-xl border border-gray-200 max-h-60 overflow-y-auto overflow-x-hidden z-[1001]">
              {searchResults.length > 0 ? (
                searchResults.map((result, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleResultSelect(result)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors flex items-start gap-3"
                  >
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-700 leading-snug">{result.display_name}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-4 text-center">
                  <p className="text-sm text-gray-600 font-medium">No exact matches found.</p>
                  <p className="text-xs text-gray-500 mt-1">Try searching for the street name or city, then click the map manually.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. MIDDLE SECTION: The Map */}
      <div className={`relative w-full overflow-hidden shadow-sm border-gray-300 z-0 ${isFullscreen ? 'flex-1 border-y' : 'rounded-xl border'} ${!isFullscreen && height === '100%' ? 'flex-1' : (!isFullscreen && height === '400px' ? 'h-[300px] sm:h-[400px]' : '')}`} style={{ height: (isFullscreen || height === '100%' || height === '400px') ? undefined : height }}>
        
        {/* Fullscreen Toggle Button */}
        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="absolute top-2 left-2 sm:top-4 sm:left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-md shadow-md h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-colors border border-gray-200"
          title={isFullscreen ? "Exit Fullscreen" : "View Fullscreen"}
        >
          {isFullscreen ? <Minimize className="h-4 w-4 sm:h-5 sm:w-5" /> : <Maximize className="h-4 w-4 sm:h-5 sm:w-5" />}
        </button>

        {/* Map Style Toggle Buttons — shown in all modes */}
        <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-[1000] flex bg-white rounded-md shadow-md overflow-hidden border border-gray-300">
          <button
            type="button"
            onClick={() => setMapType('street')}
            className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors ${mapType === 'street' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setMapType('satellite')}
            className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors ${mapType === 'satellite' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => setMapType('3d')}
            className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors ${mapType === '3d' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            3D
          </button>
        </div>

        {/* 3D MapLibre view */}
        {mapType === '3d' && (
          <MapLibre3DPicker
            lat={position[0]}
            lng={position[1]}
            onLocationChange={(newLat, newLng) => {
              if (readOnly) return;
              setPosition([newLat, newLng]);
              reverseGeocode(newLat, newLng);
            }}
            height={isFullscreen || height === '100%' ? '100%' : (height || '400px')}
            readOnly={readOnly}
            radius={radius}
          />
        )}

        {/* Leaflet view (Map + Satellite) — hidden but kept mounted so it doesn't reset */}
        <div style={{ display: mapType === '3d' ? 'none' : 'block', height: '100%', position: 'relative' }}>
          {!readOnly && (
            <div className="absolute right-2 sm:right-3 bottom-20 sm:bottom-24 z-[1000]">
              <button
                type="button"
                onClick={getCurrentLocation}
                className="bg-white h-9 w-9 sm:h-10 sm:w-10 rounded-full shadow-md flex items-center justify-center text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-all border border-gray-200"
                title="Use current location"
              >
                <LocateFixed className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>
          )}

          <MapContainer
            center={position}
            zoom={13}
            maxZoom={21}
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
            attributionControl={false}
            zoomControl={false}
          >
            <ZoomControl position="bottomright" />
            <MapResizeHandler />

            <TileLayer
              maxZoom={21}
              url={mapType === 'street'
                ? "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                : "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"}
              attribution='&copy; Google Maps'
            />

            <MapClickHandler onClick={readOnly ? () => {} : handleMapClick} />

            <Marker
              position={position}
              draggable={!readOnly}
              icon={getMarkerIcon(markerColor)}
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target;
                  const newPos = marker.getLatLng();
                  const lat = newPos.lat;
                  const lng = newPos.lng;
                  setPosition([lat, lng]);
                  reverseGeocode(lat, lng);
                  clearSearch();
                },
              }}
            />
            {radius && radius > 0 && (
              <Circle
                center={position}
                radius={radius}
                pathOptions={{
                  color: '#4f46e5',
                  fillColor: '#4f46e5',
                  fillOpacity: 0.15,
                  weight: 2,
                  dashArray: '4 4'
                }}
              />
            )}
          </MapContainer>
        </div>
      </div>

      {/* 3. BOTTOM SECTION: Selected Result */}
      {selectedAddress && (
        <div className={`w-full bg-blue-50/50 border-blue-100 p-3 flex items-start gap-2 sm:gap-3 animate-in fade-in duration-300 ${isFullscreen ? 'border-t' : 'rounded-xl border sm:p-4'}`}>
          <div className="mt-0.5">
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">{readOnly ? 'Location Details' : 'Confirm Location'}</h3>
            <p className="text-xs sm:text-sm text-gray-700 mt-1 leading-relaxed">{selectedAddress}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 font-mono bg-white inline-block px-1.5 py-0.5 rounded border border-gray-200">
              {position[0].toFixed(5)}, {position[1].toFixed(5)}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}