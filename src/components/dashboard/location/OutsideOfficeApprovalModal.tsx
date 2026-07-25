import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, X, Loader2, MapPin, ExternalLink, Info } from 'lucide-react';
import type { OutsideOfficeApproval } from '../../../stores/outsideOfficeApprovalsStore';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import { supabase } from '../../../lib/supabase';
import JourneyMapSwitch from './JourneyMapSwitch';
import { format } from 'date-fns';
import { getTravelLogs } from '../../../lib/travelTrackingService';

interface Props {
  item: OutsideOfficeApproval;
  onClose: () => void;
  onApprove: (id: string, distanceMeters: number, allowanceAmount: number, allowanceUnit: string) => Promise<void>;
}

export default function OutsideOfficeApprovalModal({ item, onClose, onApprove }: Props) {
  const { settings, fetchSettings } = useLocationSettingsStore();
  
  const [journeyLogs, setJourneyLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  
  const [submitting, setSubmitting] = useState(false);
  const [allowanceAmount, setAllowanceAmount] = useState<string>('');

  // Calculate duration
  const totalDurationSeconds = useMemo(() => {
    const endTime = item.inside_office_clock_in_time || item.clock_out_time;
    if (!endTime) return 0;
    return Math.floor((new Date(endTime).getTime() - new Date(item.clock_in_time).getTime()) / 1000);
  }, [item.clock_in_time, item.clock_out_time, item.inside_office_clock_in_time]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  };

  useEffect(() => {
    fetchSettings(item.tenant_id);
  }, [item.tenant_id, fetchSettings]);

  useEffect(() => {
    let active = true;
    const fetchLogs = async () => {
      setLoadingLogs(true);
      try {
        const data = await getTravelLogs(item.timestamp_id);
        if (!active) return;
        
        let finalLogs = [...data];
        let finalClockInLat = null;
        let finalClockInLng = null;
        let finalClockOutLat = null;
        let finalClockOutLng = null;

        const { data: tsData } = await supabase
          .from('attendance_timestamp')
          .select('latitude, longitude')
          .eq('id', item.timestamp_id)
          .single();
          
        if (tsData) {
          if (tsData.latitude != null) finalClockInLat = tsData.latitude;
          if (tsData.longitude != null) finalClockInLng = tsData.longitude;
        }

        const endTime = item.inside_office_clock_in_time || item.clock_out_time;
        if (endTime) {
          const { data: outTsData } = await supabase
            .from('attendance_timestamp')
            .select('latitude, longitude')
            .eq('employee_id', item.employee_id)
            .eq('timestamp', endTime)
            .maybeSingle();
            
          if (outTsData) {
            if (outTsData.latitude != null) finalClockOutLat = outTsData.latitude;
            if (outTsData.longitude != null) finalClockOutLng = outTsData.longitude;
          }
        }

        if (finalClockInLat != null && finalClockInLng != null) {
          const hasStart = finalLogs.length > 0 && Math.abs(new Date(finalLogs[0].recorded_at).getTime() - new Date(item.clock_in_time).getTime()) < 60000;
          if (!hasStart) {
            finalLogs.unshift({
              id: 'synthetic-in',
              latitude: finalClockInLat,
              longitude: finalClockInLng,
              cumulative_distance_meters: 0,
              recorded_at: item.clock_in_time,
            } as any);
          }
        }

        if (endTime && finalClockOutLat != null && finalClockOutLng != null) {
          const hasEnd = finalLogs.length > 0 && Math.abs(new Date(finalLogs[finalLogs.length - 1].recorded_at).getTime() - new Date(endTime).getTime()) < 60000;
          if (!hasEnd) {
            let maxDist = finalLogs.length > 0 ? finalLogs[finalLogs.length - 1].cumulative_distance_meters : 0;
            
            // If there were no intermediate logs, calculate straight-line distance between in/out
            if (finalLogs.length === 1 && finalLogs[0].id === 'synthetic-in' && finalClockInLat != null && finalClockInLng != null) {
              const R = 6371000; // Earth radius in meters
              const dLat = (finalClockOutLat - finalClockInLat) * Math.PI / 180;
              const dLon = (finalClockOutLng - finalClockInLng) * Math.PI / 180;
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(finalClockInLat * Math.PI / 180) * Math.cos(finalClockOutLat * Math.PI / 180) *
                        Math.sin(dLon/2) * Math.sin(dLon/2);
              maxDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            }

            finalLogs.push({
              id: 'synthetic-out',
              latitude: finalClockOutLat,
              longitude: finalClockOutLng,
              cumulative_distance_meters: maxDist,
              recorded_at: endTime,
            } as any);
          }
        }

        const mappedLogs = finalLogs.map(log => ({
          latitude: log.latitude,
          longitude: log.longitude,
          timestamp: log.recorded_at,
          cumulative_distance_meters: log.cumulative_distance_meters
        }));

        setJourneyLogs(mappedLogs);
      } catch (err) {
        console.error('Failed to fetch journey logs for outside office:', err);
      } finally {
        if (active) setLoadingLogs(false);
      }
    };
    fetchLogs();
    return () => { active = false; };
  }, [item]);

  // Calculate distance from logs
  const totalDistanceMeters = useMemo(() => {
    let distance = item.distance_meters || 0;
    if (journeyLogs.length > 0) {
      const maxDist = Math.max(...journeyLogs.map(l => l.cumulative_distance_meters || 0));
      if (maxDist > distance) {
        distance = maxDist;
      }
    }
    return distance;
  }, [journeyLogs, item.distance_meters]);

  const totalDistanceKm = totalDistanceMeters / 1000;

  // Auto-calculate initial allowance
  useEffect(() => {
    if (settings && !allowanceAmount && totalDistanceKm > 0) {
      if (settings.travel_allowance_method === 'distance') {
        const amt = totalDistanceKm * settings.travel_allowance_rate;
        setAllowanceAmount(amt.toFixed(2));
      } else if (settings.travel_allowance_method === 'fixed') {
        setAllowanceAmount(settings.travel_allowance_rate.toFixed(2));
      } else {
        setAllowanceAmount('0.00');
      }
    }
  }, [settings, totalDistanceKm, allowanceAmount]);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await onApprove(
        item.id, 
        totalDistanceMeters, 
        Number(allowanceAmount) || 0,
        settings?.travel_allowance_method === 'distance' ? 'km' : 'fixed'
      );
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Build map data
  const mapPoints = journeyLogs
    .filter(log => log.latitude != null && log.longitude != null)
    .map((log, i, arr) => ({
      lat: log.latitude,
      lng: log.longitude,
      type: i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'traveling',
      time: log.timestamp
    }));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center  z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Review & Approve Outside Office</h2>
            <p className="text-sm text-gray-500 mt-0.5">{item.employee_name}'s Request on {format(new Date(item.clock_in_time), 'dd MMM yyyy')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Map Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-indigo-500" />
                GPS Tracking Route
              </h3>
              
              <div className="h-[300px] bg-gray-100 rounded-xl overflow-hidden border border-gray-200 relative">
                {loadingLogs ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                ) : mapPoints.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                    <MapPin className="h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-sm">No GPS track available for this period.</p>
                  </div>
                ) : (
                  <JourneyMapSwitch
                    points={mapPoints}
                    workLat={mapPoints[0].lat}
                    workLng={mapPoints[0].lng}
                    hideWorkSite={true}
                  />
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex flex-col justify-center text-sm">
                  <span className="text-indigo-800 font-medium mb-1">Distance Traveled</span>
                  <span className="text-indigo-900 font-bold text-lg">{formatDistance(totalDistanceMeters)}</span>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex flex-col justify-center text-sm">
                  <span className="text-indigo-800 font-medium mb-1">Duration</span>
                  <span className="text-indigo-900 font-bold text-lg">{formatDuration(totalDurationSeconds)}</span>
                </div>
              </div>
            </div>

            {/* Allowance Section */}
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Allowance Calculation</h3>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Travel Allowance Amount (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={allowanceAmount}
                      onChange={(e) => setAllowanceAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                      placeholder="e.g. 500"
                    />
                    <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      {settings?.travel_allowance_method === 'distance' 
                        ? `Calculated based on ${formatDistance(totalDistanceMeters)} at ₹${settings?.travel_allowance_rate}/km.`
                        : settings?.travel_allowance_method === 'fixed'
                        ? `Fixed travel allowance of ₹${settings?.travel_allowance_rate}.`
                        : 'Manual entry required.'}
                    </p>
                  </div>
                  
                  {item.reason && (
                    <div className="pt-4 border-t border-gray-200">
                      <div className="text-sm font-medium text-gray-700 mb-1">Employee Reason</div>
                      <p className="text-sm text-gray-600 bg-white p-3 rounded border border-gray-200">
                        {item.reason}
                      </p>
                    </div>
                  )}

                </div>
              </div>
              
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium text-sm"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Approve & Save Allowance
          </button>
        </div>

      </div>
    </div>
  );
}
