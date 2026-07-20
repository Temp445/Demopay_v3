import { useState, useEffect, useMemo } from 'react';
import { MapPin, Calendar, Users, Target, X, Loader2, ExternalLink, Trash2, Map, AlertTriangle, Info, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useWorkLocationsStore } from '../../../stores/workLocationsStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useTenant } from '../../../contexts/TenantContext';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import MapViewerSwitch from './MapViewerSwitch';
import type { WorkLocation } from '../../../types/workLocation';

export default function WorkLocationAssignmentPage() {
  const { currentTenant } = useTenant();
  const { items: employees, loading: employeesLoading, fetchEmployees } = useEmployeesStore();
  const { workLocations, loading, fetchWorkLocations, deleteWorkLocation } = useWorkLocationsStore();
  const { settings: locationSettings, fetchSettings: fetchLocationSettings, initialized: locationSettingsInitialized } = useLocationSettingsStore();

  const [showViewModal, setShowViewModal] = useState(false);
  const [journeyPoints, setJourneyPoints] = useState<any[]>([]);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const [selectedLocation, setSelectedLocation] = useState<WorkLocation | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState(''); 
  const [submitting, setSubmitting] = useState(false);

  // Search, Filter, and Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (currentTenant?.id) {
        setIsInitialLoad(true);
        await Promise.all([
          fetchWorkLocations(currentTenant.id),
          fetchEmployees(),
          ...(locationSettingsInitialized ? [] : [fetchLocationSettings(currentTenant.id)]),
        ]);

        if (isMounted) {
          setIsInitialLoad(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [currentTenant?.id, fetchWorkLocations, fetchEmployees]);

  useEffect(() => {
    if (!currentTenant?.id) return;

    const channel = supabase
      .channel('assignment-page-work-locations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_locations',
        filter: `tenant_id=eq.${currentTenant.id}`,
      }, () => {
        fetchWorkLocations(currentTenant.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTenant?.id, fetchWorkLocations]);

  // Reset to first page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handleDeleteLocation = async () => {
    if (!selectedLocation) return;

    setSubmitting(true);
    try {
      const { data: wlData } = await supabase.from('work_locations').select('gate_pass_id').eq('id', selectedLocation.id).single();
      const gatePassId = wlData?.gate_pass_id || selectedLocation.gate_pass_id;
      
      await deleteWorkLocation(selectedLocation.id);

      if (gatePassId) {
        await supabase.from('gate_pass_requests').delete().eq('id', gatePassId);
      }

      toast.success('Work location and associated gate pass deleted successfully');
      setShowDeleteModal(false);
      setSelectedLocation(null);
      setDeleteConfirmationName('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete work location. It might have tracking history attached.');
    } finally {
      setSubmitting(false);
    }
  };

  const openViewModal = async (location: WorkLocation) => {
    setSelectedLocation(location);
    setShowViewModal(true);
    setJourneyPoints([]);
    setJourneyLoading(true);
    try {
      const { data, error } = await supabase
        .from('journey_tracking_logs')
        .select('event_type, latitude, longitude, timestamp')
        .eq('work_location_id', location.id)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('timestamp', { ascending: true });

      if (data && !error) {
        const labelMap: Record<string, string> = {
          START_JOURNEY: '🚶 Start Journey',
          LIVE_TRACK_JOURNEY: '📍 Traveling',
          REACHED_LOCATION: '📌 Reached Location',
          START_WORK: '🔨 Start Work',
          LIVE_TRACK_WORK: '📍 Working',
          PAUSE_WORK: '⏸ Pause Work',
          RESUME_WORK: '▶️ Resume Work',
          COMPLETE_WORK: '✅ Complete Work',
          START_RETURN_JOURNEY: '🔄 Return Journey',
          REACHED_ENDPOINT: '🏁 Reached End Point',
        };

        setJourneyPoints(data.map(row => ({
          lat: Number(row.latitude),
          lng: Number(row.longitude),
          type: labelMap[row.event_type] || row.event_type,
          time: new Date(row.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        })));
      }
    } catch (err) {
      console.error('Failed to fetch journey logs:', err);
    } finally {
      setJourneyLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'approved': return 'bg-purple-100 text-purple-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const activeEmployeeNameForDelete = selectedLocation 
    ? (selectedLocation.employee_name || employees.find(e => e.id === selectedLocation.employee_id)?.name || 'Unknown Employee') 
    : '';

  // Extract unique statuses for the filter dropdown
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(workLocations.map(wl => wl.status));
    return Array.from(statuses).sort();
  }, [workLocations]);

  // Derived state for filtering and searching
  const filteredLocations = useMemo(() => {
    return workLocations.filter((location) => {
      const assignedEmployee = employees.find(emp => emp.id === location.employee_id);
      const empName = (location.employee_name || assignedEmployee?.name || '').toLowerCase();
      const empCode = (location.employee_code || assignedEmployee?.employee_code || '').toLowerCase();
      const locName = (location.location_name || '').toLowerCase();
      const search = searchTerm.toLowerCase();

      const matchesSearch = empName.includes(search) || empCode.includes(search) || locName.includes(search);
      const matchesStatus = statusFilter === 'all' || location.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [workLocations, employees, searchTerm, statusFilter]);

  // Derived state for pagination
  const totalPages = Math.ceil(filteredLocations.length / itemsPerPage);
  const safeCurrentPage = Math.max(1, Math.min(currentPage, Math.max(1, totalPages)));
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const paginatedLocations = filteredLocations.slice(startIndex, startIndex + itemsPerPage);

  if (isInitialLoad || loading || employeesLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MapPin className="h-6 w-6 text-blue-600" />
          Assigned Work Locations
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          View work locations assigned to employees with GPS tracking and radius monitoring
        </p>
      </div>

      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-blue-800">
        <Info className="h-5 w-5 flex-shrink-0 text-blue-600 mt-0.5" />
        <div className="text-sm">
          <strong>Note:</strong> To assign a new work location to an employee, please go to Gate Pass creation, select the <strong>Paid</strong> gate pass type, and assign the location.
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by employee, code, or location name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[150px]"
          >
            <option value="all">All Statuses</option>
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>
                {status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {workLocations.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No work locations assigned</h3>
            <p className="text-gray-500">Locations assigned via Paid Gate Passes will appear here.</p>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No matches found</h3>
            <p className="text-gray-500">Try adjusting your search or filter criteria.</p>
            <button 
              onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
              className="mt-4 text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location & Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignment Date</th>
                  {locationSettings.radius_monitoring_enabled && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Radius</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  {/* <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th> */}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedLocations.map((location) => {
                  
                  const assignedEmployee = employees.find(emp => emp.id === location.employee_id);
                  const displayEmployeeName = location.employee_name || assignedEmployee?.name || 'Unknown Employee';
                  const displayEmployeeCode = location.employee_code || assignedEmployee?.employee_code || '';

                  return (
                    <tr key={location.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {displayEmployeeName}
                            </div>
                            <div className="text-sm text-gray-500">{displayEmployeeCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{location.location_name}</div>
                        {location.formatted_address ? (
                          <button
                            onClick={() => openViewModal(location)}
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mt-1"
                          >
                            {location.formatted_address.length > 50
                              ? location.formatted_address.substring(0, 50) + '...'
                              : location.formatted_address}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ) : (
                          <div className="text-sm text-gray-500">
                            {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {format(new Date(location.assignment_date), 'MMM d, yyyy')}
                        </div>
                      </td>
                      {locationSettings.radius_monitoring_enabled && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center gap-1">
                            <Target className="h-4 w-4 text-gray-400" />
                            {location.allowed_radius_meters}m
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(location.status)}`}>
                          {location.status.replace('_', ' ')}
                        </span>
                      </td>
                      {/* <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => { 
                              setSelectedLocation(location); 
                              setDeleteConfirmationName(''); 
                              setShowDeleteModal(true); 
                            }}
                            className="text-red-600 hover:text-red-800 p-1 rounded-md hover:bg-red-50 transition-colors"
                            title="Delete Location"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td> */}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing <span className="font-medium">{startIndex + 1}</span> to <span className="font-medium">{Math.min(startIndex + itemsPerPage, filteredLocations.length)}</span> of <span className="font-medium">{filteredLocations.length}</span> results
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeCurrentPage === 1}
                    className="p-1 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-sm text-gray-700 px-2">
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage === totalPages}
                    className="p-1 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* STRICT DELETE MODAL WITH CONFIRMATION INPUT */}
      {showDeleteModal && selectedLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-red-50 rounded-t-lg">
              <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Permanent Deletion
              </h2>
              <button 
                onClick={() => { 
                  setShowDeleteModal(false); 
                  setSelectedLocation(null); 
                  setDeleteConfirmationName(''); 
                }} 
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-800 font-bold mb-2 uppercase tracking-wide">
                  Warning: Cannot be undone
                </p>
                <p className="text-sm text-red-700">
                  You are about to permanently delete the assignment for <strong>{activeEmployeeNameForDelete}</strong> at <strong>{selectedLocation.location_name}</strong>. This data will be completely removed and <strong>cannot be recovered</strong>.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  Please type <strong>{activeEmployeeNameForDelete}</strong> to confirm.
                </label>
                <input
                  type="text"
                  value={deleteConfirmationName}
                  onChange={(e) => setDeleteConfirmationName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder={activeEmployeeNameForDelete}
                  autoComplete="off"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => { 
                    setShowDeleteModal(false); 
                    setSelectedLocation(null); 
                    setDeleteConfirmationName(''); 
                  }} 
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteLocation} 
                  disabled={submitting || deleteConfirmationName !== activeEmployeeNameForDelete} 
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors font-medium"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} 
                  Delete Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Location Map Modal */}
      {showViewModal && selectedLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Map className="h-5 w-5 text-blue-600" />
                  Location Details — {selectedLocation.location_name}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Employee: {selectedLocation.employee_name} &nbsp;·&nbsp; {selectedLocation.formatted_address || `${selectedLocation.latitude.toFixed(5)}, ${selectedLocation.longitude.toFixed(5)}`}
                </p>
              </div>
              <button onClick={() => { setShowViewModal(false); setSelectedLocation(null); setJourneyPoints([]); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {journeyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                </div>
              ) : (
                <MapViewerSwitch
                  latitude={Number(selectedLocation.latitude)}
                  longitude={Number(selectedLocation.longitude)}
                  locationName={selectedLocation.location_name}
                  address={selectedLocation.formatted_address || ''}
                  radius={selectedLocation.allowed_radius_meters}
                  height="460px"
                  journeyLogs={journeyPoints}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}