import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, CircleF } from '@react-google-maps/api';
import { useGoogleMaps } from '../../../contexts/GoogleMapsContext';
import { Search, MapPin, LocateFixed, X, Lightbulb } from 'lucide-react';
import type { LocationSearchResult } from '../../../types/workLocation';

const MAP_ID = 'DEMO_MAP_ID';



interface GoogleMapsMapPickerProps {
  apiKey: string;
  initialLat?: number;
  initialLng?: number;
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
  lat?: number;
  lng?: number;
  radius?: number;
}

export default function GoogleMapsMapPicker({
  apiKey,
  initialLat = 13.0827,
  initialLng = 80.2707,
  onLocationSelect,
  showSearch = true,
  height = '400px',
  lat,
  lng,
  radius,
}: GoogleMapsMapPickerProps) {
  const { isLoaded } = useGoogleMaps();

  const [position, setPosition] = useState({ lat: lat !== undefined ? lat : initialLat, lng: lng !== undefined ? lng : initialLng });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState('');
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    geocoderRef.current = new google.maps.Geocoder();
    // Create the draggable AdvancedMarker (replaces deprecated MarkerF)
    if (google.maps.marker?.AdvancedMarkerElement) {
      const m = new google.maps.marker.AdvancedMarkerElement({
        map,
        position,
        gmpDraggable: true,
      });
      m.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setPosition({ lat, lng });
        reverseGeocode(lat, lng);
        setSearchQuery('');
        setSearchResults([]);
        setShowResults(false);
      });
      markerRef.current = m;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setPosition({ lat, lng });
          reverseGeocode(lat, lng);
          mapRef.current?.panTo({ lat, lng });
          mapRef.current?.setZoom(15);
        },
        () => {
          setPosition({ lat: initialLat, lng: initialLng });
          reverseGeocode(initialLat, initialLng);
        }
      );
    }
  }, [isLoaded]);

  // Update position if controlled lat/lng change
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) {
      setPosition({ lat, lng });
      mapRef.current?.panTo({ lat, lng });
    }
  }, [lat, lng]);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 3 && searchQuery !== selectedAddress) {
        searchLocation(searchQuery);
      } else if (searchQuery.trim().length === 0) {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, isLoaded, selectedAddress]);

  const reverseGeocode = (lat: number, lng: number) => {
    if (!geocoderRef.current) return;
    geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const r = results[0];
        const getComponent = (type: string) =>
          r.address_components?.find(c => c.types.includes(type))?.long_name || '';

        const addressData = {
          latitude: lat,
          longitude: lng,
          address: getComponent('route'),
          city: getComponent('locality') || getComponent('sublocality') || getComponent('administrative_area_level_2'),
          state: getComponent('administrative_area_level_1'),
          country: getComponent('country'),
          postal_code: getComponent('postal_code'),
          formatted_address: r.formatted_address || '',
        };
        const formatted = r.formatted_address || '';
        setSelectedAddress(formatted);
        setSearchQuery(formatted);
        onLocationSelect(addressData);
      } else {
        onLocationSelect({ latitude: lat, longitude: lng });
      }
    });
  };

  const searchLocation = async (query: string) => {
    if (!isLoaded) return;
    setSearching(true);
    try {
      // Use the new AutocompleteSuggestion API (replaces deprecated AutocompleteService)
      const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
      });
      const mapped: LocationSearchResult[] = (suggestions || []).map(s => ({
        display_name: s.placePrediction?.text?.toString() ?? s.placePrediction?.mainText?.toString() ?? query,
        lat: '0',
        lon: '0',
        _placeId: s.placePrediction?.placeId,
      } as any));
      setSearchResults(mapped);
      setShowResults(mapped.length > 0);
    } catch {
      // Silently fail if suggestions not available
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleResultSelect = async (result: any) => {
    if (!geocoderRef.current) return;
    const placeId = result._placeId;
    if (placeId) {
      geocoderRef.current.geocode({ placeId }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const r = results[0];
          const loc = r.geometry.location;
          const lat = loc.lat();
          const lng = loc.lng();

          const newPos = { lat, lng };
          setPosition(newPos);
          if (markerRef.current) markerRef.current.position = newPos;

          // Prefer the autocomplete display name because it contains the actual Company/POI name
          const formatted = result.display_name || r.formatted_address || '';
          // Set both exactly the same to prevent the useEffect from triggering a new search
          setSearchQuery(formatted);
          setSelectedAddress(formatted);
          setShowResults(false);

          const getComponent = (type: string) =>
            r.address_components?.find(c => c.types.includes(type))?.long_name || '';

          const addressData = {
            latitude: lat,
            longitude: lng,
            address: getComponent('route'),
            city: getComponent('locality') || getComponent('sublocality') || getComponent('administrative_area_level_2'),
            state: getComponent('administrative_area_level_1'),
            country: getComponent('country'),
            postal_code: getComponent('postal_code'),
            formatted_address: formatted,
          };

          onLocationSelect(addressData);

          mapRef.current?.panTo({ lat, lng });
          mapRef.current?.setZoom(16);
        }
      });
    }
  };

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    const newPos = { lat, lng };
    setPosition(newPos);
    if (markerRef.current) markerRef.current.position = newPos;
    reverseGeocode(lat, lng);
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const newPos = { lat, lng };
        setPosition(newPos);
        if (markerRef.current) markerRef.current.position = newPos;
        reverseGeocode(lat, lng);
        setSearchQuery('');
        setSearchResults([]);
        setShowResults(false);
        mapRef.current?.panTo(newPos);
        mapRef.current?.setZoom(16);
      });
    }
  };

  // handleMarkerDragEnd is now handled inside the AdvancedMarker listener in onMapLoad

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3 w-full mx-auto">
      {showSearch && (
        <div className="flex flex-col space-y-2 relative z-10">
          <div className="bg-white rounded-lg shadow-sm border border-gray-300 flex items-center px-4 py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
            <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a city, area, or landmark..."
              className="flex-1 w-full pl-3 pr-2 bg-transparent border-none focus:outline-none text-gray-700 placeholder-gray-400 text-sm sm:text-base"
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setSearchResults([]); setShowResults(false); }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
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
          <div className="flex items-center gap-1.5 px-1">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-gray-500">
              If the location is not listed in search, select the nearest area and reposition the pin to the exact location.
            </span>
          </div>
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-12 left-0 right-0 bg-white rounded-lg shadow-xl border border-gray-200 max-h-60 overflow-y-auto overflow-x-hidden z-[1001]">
              {searchResults.map((result, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleResultSelect(result)}
                  className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors flex items-start gap-3"
                >
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700 leading-snug">{result.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedAddress && (
        <div className="w-full bg-blue-50/50 rounded-xl border border-blue-100 p-4 flex items-start gap-3 animate-in fade-in duration-300">
          <div className="mt-0.5">
            <MapPin className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Confirm Location</h3>
            <p className="text-sm text-gray-700 mt-1 leading-relaxed">{selectedAddress}</p>
            <p className="text-xs text-gray-500 mt-1.5 font-mono bg-white inline-block px-1.5 py-0.5 rounded border border-gray-200">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </p>
          </div>
        </div>
      )}

      <div className="relative w-full rounded-xl overflow-hidden shadow-sm border border-gray-300 z-0" style={{ height }}>
        <div className="absolute right-3 bottom-48 z-[400]">
          <button
            type="button"
            onClick={getCurrentLocation}
            className="bg-white h-10 w-10 rounded-full shadow-md flex items-center justify-center text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-all border border-gray-200"
            title="Use current location"
          >
            <LocateFixed className="h-5 w-5" />
          </button>
        </div>

        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={position}
          zoom={13}
          onClick={handleMapClick}
          onLoad={onMapLoad}
          options={{
            mapId: MAP_ID,
            mapTypeControl: true,
            mapTypeControlOptions: {
              position: google.maps.ControlPosition.TOP_LEFT,
              style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            },
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,
            zoomControlOptions: {
              position: google.maps.ControlPosition.RIGHT_BOTTOM,
            },
          }}
        >
          {/* Marker is managed imperatively via AdvancedMarkerElement in onMapLoad */}
          {radius && (
            <CircleF
              center={lat !== undefined && lng !== undefined ? { lat, lng } : position}
              radius={radius}
              options={{
                fillColor: '#22c55e',
                fillOpacity: 0.15,
                strokeColor: '#22c55e',
                strokeWeight: 2,
              }}
            />
          )}
        </GoogleMap>
      </div>
    </div>
  );
}
