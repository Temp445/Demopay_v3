import { useState, useEffect } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  Polyline, 
  Circle, 
  ZoomControl,
  useMap
} from 'react-leaflet';
import { MapPin, Navigation as NavigationIcon } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const currentLocationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const destinationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface LocationMapViewerProps {
  latitude: number;
  longitude: number;
  locationName: string;
  address?: string;
  showNavigation?: boolean;
  currentLat?: number;
  currentLng?: number;
  height?: string;
  radius?: number;
}

// Sub-component to perfectly fit the map bounds to the curved route
function MapBoundsFitter({ bounds }: { bounds: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, [map, bounds]);
  return null;
}

export default function LocationMapViewer({
  latitude,
  longitude,
  locationName,
  address,
  showNavigation = false,
  currentLat,
  currentLng,
  height = '400px',
  radius,
}: LocationMapViewerProps) {
  const center: [number, number] = [latitude, longitude];
  const currentPosition: [number, number] | undefined =
    showNavigation && currentLat && currentLng ? [currentLat, currentLng] : undefined;

  const [mapType, setMapType] = useState<'street' | 'satellite'>('street');
  
  // State to hold the snapped road route
  const [routedPositions, setRoutedPositions] = useState<[number, number][]>([]);

  // Fetch actual road directions when navigating
  useEffect(() => {
    if (showNavigation && currentLat && currentLng) {
      const fetchRoute = async () => {
        try {
          const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${currentLng},${currentLat};${longitude},${latitude}?overview=full&geometries=geojson`
          );
          const data = await response.json();
          if (data.routes && data.routes[0]) {
            const coords = data.routes[0].geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
            setRoutedPositions(coords);
          } else {
            setRoutedPositions([[currentLat, currentLng], [latitude, longitude]]); // Fallback straight line
          }
        } catch (error) {
          console.error('Error fetching route:', error);
          setRoutedPositions([[currentLat, currentLng], [latitude, longitude]]); // Fallback straight line
        }
      };
      fetchRoute();
    } else {
      setRoutedPositions([]);
    }
  }, [showNavigation, currentLat, currentLng, latitude, longitude]);

  const openInGoogleMaps = () => {
    if (showNavigation && currentLat && currentLng) {
      window.open(
        `http://googleusercontent.com/maps.google.com/?saddr=${currentLat},${currentLng}&daddr=${latitude},${longitude}`,
        '_blank'
      );
    } else {
      window.open(`http://googleusercontent.com/maps.google.com/?q=${latitude},${longitude}`, '_blank');
    }
  };

  const getMapBounds = (): [number, number][] | undefined => {
    if (showNavigation && routedPositions.length > 1) return routedPositions;
    if (showNavigation && currentPosition) return [center, currentPosition];
    return undefined;
  };

  const dynamicBounds = getMapBounds();

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-red-600" />
            {locationName}
          </h3>
          {address && (
            <p className="text-sm text-gray-600 mt-1">{address}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </p>
        </div>
        <button
          onClick={openInGoogleMaps}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
        >
          <NavigationIcon className="h-4 w-4" />
          {showNavigation ? 'Get Directions' : 'Open in Maps'}
        </button>
      </div>

      <div className="relative border border-gray-300 rounded-lg overflow-hidden" style={{ height }}>
        
        {/* Map Type Toggle Buttons */}
        <div className="absolute top-4 right-4 z-[1000] flex bg-white rounded-md shadow-md overflow-hidden border border-gray-300">
          <button 
            type="button"
            onClick={() => setMapType('street')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mapType === 'street' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Map
          </button>
          <button 
            type="button"
            onClick={() => setMapType('satellite')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mapType === 'satellite' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Satellite
          </button>
        </div>

        <MapContainer
          center={center}
          zoom={showNavigation && currentPosition ? 12 : 15}
          maxZoom={21}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          {dynamicBounds && <MapBoundsFitter bounds={dynamicBounds} />}
          <ZoomControl position="bottomright" />
          
          <TileLayer
            maxZoom={21}
            url={mapType === 'street' 
              ? "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" 
              : "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"}
            attribution='© Google Maps'
          />

          <Marker position={center} icon={destinationIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold mb-1">{locationName}</div>
                {address && <div className="text-gray-600 mb-1">{address}</div>}
                <div className="text-xs text-gray-500">
                  Destination: {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </div>
              </div>
            </Popup>
          </Marker>

          {radius && (
            <Circle
              center={center}
              radius={radius}
              pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1, weight: 2 }}
            />
          )}

          {showNavigation && currentPosition && (
            <>
              <Marker position={currentPosition} icon={currentLocationIcon}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold mb-1">Your Location</div>
                    <div className="text-xs text-gray-500">
                      {currentPosition[0].toFixed(6)}, {currentPosition[1].toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>

              {/* Uses the actual street road path instead of a straight line */}
              {routedPositions.length > 1 && (
                <Polyline
                  positions={routedPositions}
                  pathOptions={{ color: '#3B82F6', weight: 4, opacity: 0.8 }} // Solid line for roads
                />
              )}
            </>
          )}
        </MapContainer>
      </div>

      {showNavigation && currentPosition && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <NavigationIcon className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-900">
              Live route shown from your current location to the assigned site
            </span>
          </div>
        </div>
      )}
    </div>
  );
}