import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Calendar, User, Navigation, Map as MapIcon, RefreshCw, AlertCircle, Info, Loader2 } from 'lucide-react';
import { useWorkLocationsStore } from '../../../stores/workLocationsStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useTenant } from '../../../contexts/TenantContext';
import type { WorkLocation } from '../../../types/workLocation';
import { GoogleMap, MarkerF, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';

const libraries: ('places' | 'geocoding')[] = ['places', 'geocoding'];

interface RouteOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RouteOptimizerModal({ isOpen, onClose }: RouteOptimizerModalProps) {
  const { currentTenant } = useTenant();
  const { workLocations } = useWorkLocationsStore();
  const { items: employees } = useEmployeesStore();
  const { companySettings } = useSettingsStore();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [startPointId, setStartPointId] = useState('hq'); 
  const [endPointId, setEndPointId] = useState('hq'); 
  
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState<google.maps.DirectionsResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [waypointOrder, setWaypointOrder] = useState<number[]>([]);
  
  const hqLocation = companySettings?.branch_locations?.[0]; // Default to first branch as HQ

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: companySettings?.google_maps_api_key || '',
    libraries,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
    if (window.google) {
      directionsService.current = new window.google.maps.DirectionsService();
    }
  }, []);

  // Filter locations for selected employee and date
  const todaysLocations = React.useMemo(() => {
    if (!selectedEmployeeId || !selectedDate) return [];
    return workLocations.filter(loc => {
      const isSameEmp = loc.employee_id === selectedEmployeeId;
      // We assume assignment_date is comparable as YYYY-MM-DD
      const isSameDate = loc.assignment_date?.split('T')[0] === selectedDate;
      const hasCoords = loc.latitude !== null && loc.longitude !== null;
      const isActive = loc.status !== 'cancelled' && loc.status !== 'completed'; 
      return isSameEmp && isSameDate && hasCoords && isActive;
    });
  }, [workLocations, selectedEmployeeId, selectedDate]);

  const handleOptimize = () => {
    if (!directionsService.current) return;
    if (todaysLocations.length === 0) {
      setRouteError("No active work locations found for this employee on the selected date.");
      return;
    }
    
    setIsOptimizing(true);
    setRouteError(null);
    setOptimizedRoute(null);

    // Build the request
    let origin: google.maps.LatLngLiteral;
    let destination: google.maps.LatLngLiteral;
    
    // Determine start point
    if (startPointId === 'hq' && hqLocation) {
      origin = { lat: hqLocation.latitude, lng: hqLocation.longitude };
    } else {
      const startLoc = todaysLocations[0];
      origin = { lat: startLoc.latitude, lng: startLoc.longitude };
    }
    
    // Determine end point
    if (endPointId === 'hq' && hqLocation) {
      destination = { lat: hqLocation.latitude, lng: hqLocation.longitude };
    } else {
      const endLoc = todaysLocations[todaysLocations.length - 1];
      destination = { lat: endLoc.latitude, lng: endLoc.longitude };
    }

    // Determine intermediate waypoints
    const waypoints: google.maps.DirectionsWaypoint[] = todaysLocations
      .filter(loc => {
        // Exclude start/end points if they perfectly match the selection, to avoid duplicate points
        if (startPointId !== 'hq' && loc.id === todaysLocations[0].id) return false;
        if (endPointId !== 'hq' && loc.id === todaysLocations[todaysLocations.length - 1].id) return false;
        return true;
      })
      .map(loc => ({
        location: { lat: loc.latitude, lng: loc.longitude },
        stopover: true,
      }));

    if (waypoints.length > 25) {
      setRouteError("Too many locations. Google Maps supports a maximum of 25 waypoints for optimization.");
      setIsOptimizing(false);
      return;
    }

    directionsService.current.route(
      {
        origin,
        destination,
        waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        setIsOptimizing(false);
        if (status === google.maps.DirectionsStatus.OK && result) {
          setOptimizedRoute(result);
          setWaypointOrder(result.routes[0].waypoint_order);
        } else {
          setRouteError(`Failed to optimize route. Status: ${status}`);
        }
      }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Navigation className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Daily Route Optimizer</h2>
              <p className="text-sm text-gray-500">Solve the Traveling Salesperson Problem for multiple visits</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Panel: Controls & List */}
          <div className="w-full md:w-1/3 border-r border-gray-200 flex flex-col bg-white overflow-y-auto">
            <div className="p-4 space-y-4 border-b border-gray-100">
              
              {!companySettings?.enable_directions_api && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-amber-800">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <div className="text-xs">
                    <strong>Directions API is disabled.</strong> Please enable the Directions API in Company Settings to use the TSP solver.
                  </div>
                </div>
              )}

              {/* Employee Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <User className="h-4 w-4 text-gray-400" /> Employee
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => { setSelectedEmployeeId(e.target.value); setOptimizedRoute(null); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Employee...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              {/* Date Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-gray-400" /> Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => { setSelectedDate(e.target.value); setOptimizedRoute(null); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Start & End Points */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Start Point</label>
                  <select
                    value={startPointId}
                    onChange={(e) => { setStartPointId(e.target.value); setOptimizedRoute(null); }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50"
                  >
                    <option value="hq">Headquarters</option>
                    <option value="first">First Worksite</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">End Point</label>
                  <select
                    value={endPointId}
                    onChange={(e) => { setEndPointId(e.target.value); setOptimizedRoute(null); }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50"
                  >
                    <option value="hq">Headquarters</option>
                    <option value="last">Last Worksite</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleOptimize}
                disabled={!selectedEmployeeId || isOptimizing || !companySettings?.enable_directions_api || todaysLocations.length === 0}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors mt-4 shadow-sm"
              >
                {isOptimizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
                Optimize Route
              </button>

              {routeError && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-100 flex items-start gap-1">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{routeError}</span>
                </div>
              )}
            </div>

            {/* Results List */}
            <div className="flex-1 p-4 bg-gray-50 overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
                {optimizedRoute ? "Optimized Visit Order" : `Assigned Visits (${todaysLocations.length})`}
              </h3>
              
              {!selectedEmployeeId ? (
                <p className="text-sm text-gray-500 text-center mt-8">Select an employee to view their assigned worksites.</p>
              ) : todaysLocations.length === 0 ? (
                <p className="text-sm text-gray-500 text-center mt-8">No active assignments on this date.</p>
              ) : optimizedRoute ? (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex gap-3">
                    <div className="h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">A</div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Start: {startPointId === 'hq' ? 'Headquarters' : 'First Visit'}</p>
                    </div>
                  </div>
                  
                  {waypointOrder.map((originalIndex, i) => {
                    const originalLoc = todaysLocations.filter(loc => {
                      if (startPointId !== 'hq' && loc.id === todaysLocations[0].id) return false;
                      if (endPointId !== 'hq' && loc.id === todaysLocations[todaysLocations.length - 1].id) return false;
                      return true;
                    })[originalIndex];
                    
                    if (!originalLoc) return null;
                    
                    return (
                      <div key={originalLoc.id} className="bg-white border border-gray-200 p-3 rounded-lg shadow-sm flex gap-3">
                        <div className="h-6 w-6 rounded-full bg-gray-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{originalLoc.location_name}</p>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{originalLoc.formatted_address || `${originalLoc.latitude}, ${originalLoc.longitude}`}</p>
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex gap-3">
                    <div className="h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">B</div>
                    <div>
                      <p className="text-sm font-medium text-emerald-900">End: {endPointId === 'hq' ? 'Headquarters' : 'Final Visit'}</p>
                    </div>
                  </div>
                  
                  <div className="mt-6 bg-gray-900 rounded-xl p-4 text-white shadow-lg">
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Optimized Trip Summary</p>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-2xl font-bold">{(optimizedRoute.routes[0].legs.reduce((acc, leg) => acc + (leg.distance?.value || 0), 0) / 1000).toFixed(1)} km</p>
                        <p className="text-sm text-gray-400">Total Distance</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{Math.round(optimizedRoute.routes[0].legs.reduce((acc, leg) => acc + (leg.duration?.value || 0), 0) / 60)} min</p>
                        <p className="text-sm text-gray-400">Driving Time</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {todaysLocations.map((loc, i) => (
                    <div key={loc.id} className="bg-white border border-gray-200 p-3 rounded-lg shadow-sm flex gap-3">
                      <div className="h-6 w-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-medium text-xs shrink-0">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{loc.location_name}</p>
                        <p className="text-xs text-gray-500 line-clamp-1">{loc.formatted_address || `${loc.latitude}, ${loc.longitude}`}</p>
                      </div>
                    </div>
                  ))}
                  {todaysLocations.length > 1 && (
                    <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-lg mt-4 flex gap-2">
                      <Info className="h-4 w-4 flex-shrink-0" />
                      <span>Click 'Optimize Route' to reorder these visits for the fastest total driving time.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Map */}
          <div className="w-full md:w-2/3 bg-gray-100 relative">
            {!isLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : !companySettings?.enable_directions_api ? (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
                 <MapIcon className="h-16 w-16 text-gray-300 mb-4" />
                 <p className="text-gray-500 font-medium">Optimization API is disabled.</p>
               </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={hqLocation ? { lat: hqLocation.latitude, lng: hqLocation.longitude } : { lat: todaysLocations[0]?.latitude || 13.0827, lng: todaysLocations[0]?.longitude || 80.2707 }}
                zoom={10}
                onLoad={onMapLoad}
                options={{
                  mapTypeControl: true,
                  mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_LEFT },
                  streetViewControl: false,
                  fullscreenControl: true,
                }}
              >
                {!optimizedRoute && todaysLocations.map((loc, i) => (
                  <MarkerF
                    key={loc.id}
                    position={{ lat: loc.latitude, lng: loc.longitude }}
                    label={(i + 1).toString()}
                  />
                ))}

                {optimizedRoute && (
                  <DirectionsRenderer
                    directions={optimizedRoute}
                    options={{
                      suppressMarkers: false,
                      polylineOptions: {
                        strokeColor: '#2563eb',
                        strokeWeight: 5,
                        strokeOpacity: 0.8,
                      },
                    }}
                  />
                )}
              </GoogleMap>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
