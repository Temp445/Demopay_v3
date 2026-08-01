import React, { useState, useEffect, useMemo } from 'react';
import { Search, Clock, Calendar, RefreshCw, XCircle, MapPin, Map as MapIcon, X, Navigation, Image as ImageIcon } from 'lucide-react';
import { useEmployeesStore, type Employee } from '../../../stores/employeesStore';
import { useShiftsStore } from '../../../stores/shiftsStore';
import { useAttendanceTimestampStore } from '../../../stores/attendanceTimestampStore';
import ClockInOutCard from './ClockInOutCard';
import { format } from 'date-fns';
import { useRoleAccess } from '../../../hooks/useRoleAccess';
import MapPickerSwitch from '../location/MapPickerSwitch';
import TravelRouteViewer from '../location/TravelRouteViewer';

const timingStatusLabel: Record<'OK' | 'OUTSIDE_SHIFT' | 'NO_SHIFT_ASSIGNED', string> = {
  OK: 'Ok',
  OUTSIDE_SHIFT: 'Wrong Shift',
  NO_SHIFT_ASSIGNED: 'No Shift Assigned',
};

const timingStatusColor: Record<'OK' | 'OUTSIDE_SHIFT' | 'NO_SHIFT_ASSIGNED', string> = {
  OK: 'bg-green-100 text-green-800',
  OUTSIDE_SHIFT: 'bg-yellow-100 text-yellow-800',
  NO_SHIFT_ASSIGNED: 'bg-red-100 text-red-800',
};

// Component to display address from latitude and longitude
const LocationAddressDisplay = ({ lat, lng, fallback, preTranscribedAddress }: { lat: number | null | undefined, lng: number | null | undefined, fallback: string, preTranscribedAddress?: string | null }) => {
  const [address, setAddress] = useState<string | null>(preTranscribedAddress || null);
  const [loading, setLoading] = useState(!preTranscribedAddress);

  useEffect(() => {
    if (preTranscribedAddress) return;
    if (lat == null || lng == null) return;
    let isMounted = true;
    setLoading(true);
    
    // Using OpenStreetMap Nominatim for free reverse geocoding
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      }
    })
      .then(res => {
        if (!res.ok) throw new Error("Geocoding failed");
        return res.json();
      })
      .then(data => {
        if (isMounted && data.display_name) {
          // Keep it short for the table display
          const parts = data.display_name.split(', ');
          const shortAddress = parts.slice(0, 3).join(', '); 
          setAddress(shortAddress);
        } else if (isMounted) {
          // If no display_name, fallback to coordinates
          setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      })
      .catch(err => {
        console.error('Reverse geocoding error:', err);
        // Fallback to raw coordinates on rate limit / network error
        if (isMounted) {
          setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
      
    return () => { isMounted = false; };
  }, [lat, lng]);

  return (
    <div className="flex flex-col">
      <div className="text-sm text-gray-900">{fallback}</div>
      {lat != null && lng != null && (
        <div className="mt-0.5">
          {loading ? (
            <div className="text-xs text-gray-400 animate-pulse">Loading address...</div>
          ) : address ? (
            <div className="text-xs text-gray-500 whitespace-normal line-clamp-2" title={address}>{address}</div>
          ) : (
            <div className="text-xs text-gray-500 font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</div>
          )}
        </div>
      )}
    </div>
  );
};

// Helper function to get status badge color
const getStatusBadgeColor = (status: string): string => {
  const statusLower = status.toLowerCase();

  if (statusLower === 'active') return '';
  if (statusLower === 'terminated') return 'bg-red-100 text-red-800';
  if (statusLower === 'suspended') return 'bg-yellow-100 text-yellow-800';
  if (statusLower === 'relieved') return 'bg-orange-100 text-orange-800';
  if (statusLower === 'resigned') return 'bg-gray-100 text-gray-800';

  // Default for any other status
  return 'bg-blue-100 text-blue-800';
};

export default function AttendanceTimestamp() {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Custom searchable dropdown states
  const [employeeSearchText, setEmployeeSearchText] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedMapLocation, setSelectedMapLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedRouteEntry, setSelectedRouteEntry] = useState<any | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const { items: employees, fetchEmployees } = useEmployeesStore();
  const { items: shifts, fetchShifts } = useShiftsStore();
  const { items: timestamps, loading, fetchTimestampsByDateRange } = useAttendanceTimestampStore();
  
  // 1. Get role access details
  const { isEmployee, employeeId, canViewAllData, loading: roleLoading, role } = useRoleAccess();
  const showAdminView = canViewAllData && role !== 'Reporting Head';

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
  }, [fetchEmployees, fetchShifts]);

  // 2. Auto-select the employee if they are not an Admin/HR
  useEffect(() => {
    if (employees.length > 0 && !showAdminView && employeeId && !selectedEmployee) {
      const myEmployeeData = employees.find(emp => emp.id === employeeId);
      if (myEmployeeData) {
        setSelectedEmployee(myEmployeeData);
      }
    }
  }, [employees, showAdminView, employeeId, selectedEmployee]);

  useEffect(() => {
    if (selectedEmployee && startDate && endDate) {
      fetchTimestampsByDateRange(selectedEmployee.id, startDate, endDate);
    }
  }, [selectedEmployee, startDate, endDate, lastRefresh, fetchTimestampsByDateRange]);

  // Filter logic for the searchable dropdown
  const filteredEmployeeOptions = useMemo(() => {
    if (!employeeSearchText) return employees;
    const lowerSearch = employeeSearchText.toLowerCase();
    return employees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(lowerSearch) ||
        (emp.employee_code && emp.employee_code.toLowerCase().includes(lowerSearch))
    );
  }, [employees, employeeSearchText]);

  const handleAttendanceUpdated = () => {
    setLastRefresh(Date.now());
  };

  const handleRefresh = () => {
    setLastRefresh(Date.now());
  };

  if (roleLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="xl:py-6">
      <div className="max-w-7xl mx-auto px-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Attendance</h1>
            <p className="mt-1 text-sm text-gray-500">
              Clock in/out and view timestamp entries
            </p>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          {/* 3. Change title based on role */}
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            {showAdminView ? 'Employee Selection' : 'My Information'}
          </h2>

          {/* 4. Hide the select dropdown for standard employees */}
          {showAdminView && (
            <div className="mb-4">
              <label htmlFor="employee-search" className="block text-sm font-medium text-gray-700 mb-2">
                Search Employee
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  id="employee-search"
                  value={employeeSearchText}
                  onChange={(e) => {
                    setEmployeeSearchText(e.target.value);
                    setShowEmployeeDropdown(true);
                    // Clear the actual selected profile if they start typing to modify the selection
                    if (selectedEmployee) {
                      setSelectedEmployee(null);
                    }
                  }}
                  onFocus={() => setShowEmployeeDropdown(true)}
                  onBlur={() => {
                    // Slight delay to allow the onMouseDown event on the list items to fire first
                    setTimeout(() => setShowEmployeeDropdown(false), 150);
                  }}
                  className="block w-full pl-10 pr-10 py-2 border border-gray-300 text-base focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  placeholder="Search by name or code..."
                />
                
                {/* Clear Button */}
                {employeeSearchText && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmployeeSearchText("");
                      setSelectedEmployee(null);
                      setShowEmployeeDropdown(true);
                    }}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                )}

                {/* Custom Dropdown Options */}
                {showEmployeeDropdown && filteredEmployeeOptions.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                    {filteredEmployeeOptions.map((employee) => {
                      const statusBadgeColor = getStatusBadgeColor(employee.status);
                      const isActive = employee.status.toLowerCase() === 'active' || employee.status.toLowerCase() === 'rejoin';

                      return (
                        <li
                          key={employee.id}
                          onMouseDown={(e) => {
                            // Prevent default so the input doesn't lose focus immediately
                            e.preventDefault();
                            setSelectedEmployee(employee);
                            // Fill the input with the selected employee's info
                            setEmployeeSearchText(
                              `${employee.name} - ${employee.department} (${employee.employee_code || 'No ID'})`
                            );
                            setShowEmployeeDropdown(false);
                          }}
                          className="relative cursor-pointer select-none py-2 pl-3 pr-9 text-gray-900 hover:bg-indigo-600 hover:text-white group"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              {employee.name} - {employee.department}{" "}
                              <span className="text-xs opacity-75 ml-1">
                                ({employee.employee_code || 'No ID'})
                              </span>
                            </div>
                            {!isActive && (
                              <span
                                className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${statusBadgeColor} group-hover:bg-white group-hover:bg-opacity-20`}
                              >
                                {employee.status.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {selectedEmployee && (
            <div className={`${showAdminView ? 'mt-4' : ''} bg-white/80 backdrop-blur-md rounded-xl  transition-all hover:shadow-md`}>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                  {selectedEmployee.name.charAt(0).toUpperCase()}
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Employee Details</h3>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Name</label>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{selectedEmployee.name}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Employee ID</label>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {selectedEmployee.employee_code || 'Not Assigned'}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Department</label>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{selectedEmployee.department}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Status</label>
                  <p className="mt-1 text-sm font-semibold text-indigo-600">{selectedEmployee.status}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedEmployee && (
          <>
            <div className="mb-6">
              <ClockInOutCard
                onAttendanceUpdated={handleAttendanceUpdated}
                shifts={shifts}
                selectedEmployee={selectedEmployee}
                lastRefresh={lastRefresh}
                canViewAllData={showAdminView}
              />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
              {/* Header + Filter — stacks on mobile, inline on desktop */}
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Title */}
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Timestamp Entries</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Clock in/out records for selected date range</p>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                    {/* Date row on mobile: From + dash + To side by side */}
                    <div className="flex items-center gap-2">                       {/* From Date */}
                      <label className="flex-1 sm:flex-none flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs cursor-pointer hover:border-indigo-300 transition-colors focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400">
                        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <div className="flex flex-col leading-none">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">From</span>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="border-none outline-none appearance-none p-0 bg-transparent focus:ring-0 text-xs font-semibold text-slate-700 cursor-pointer w-full"
                          />
                        </div>
                      </label>

                      <span className="text-slate-300 font-bold text-sm shrink-0">—</span>

                      {/* To Date */}
                      <label className="flex-1 sm:flex-none flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs cursor-pointer hover:border-indigo-300 transition-colors focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400">
                        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <div className="flex flex-col leading-none">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">To</span>
                          <input
                            type="date"
                            value={endDate}
                            min={startDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="border-none outline-none appearance-none p-0 bg-transparent focus:ring-0 text-xs font-semibold text-slate-700 cursor-pointer w-full"
                          />
                        </div>
                      </label>
                    </div>
                    {/* Refresh — full width on mobile */}
                    <button
                      onClick={handleRefresh}
                      className="w-full sm:w-auto flex justify-center items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4">
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
                  </div>
                ) : timestamps.length === 0 ? (
                  <div className="text-center py-16 px-4">
                    <div className="mx-auto h-24 w-24 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                      <Clock className="h-10 w-10 text-indigo-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">No timestamps found</h3>
                    <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                      We couldn't find any clock in/out entries between <span className="font-semibold text-gray-700">{startDate ? format(new Date(startDate), 'MMM d, yyyy') : ''}</span> and <span className="font-semibold text-gray-700">{endDate ? format(new Date(endDate), 'MMM d, yyyy') : ''}</span>.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 md:space-y-0">
                    {/* Mobile View: Cards */}
                    <div className="block md:hidden space-y-4">
                      {timestamps.map((entry) => (
                        <div key={entry.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4 transition-all hover:shadow-md hover:border-indigo-200">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                               {entry.entry === 'IN' ? (
                                  <div className="h-12 w-12 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0 shadow-sm">
                                    <Clock className="h-6 w-6" />
                                  </div>
                                ) : (
                                  <div className="h-12 w-12 flex items-center justify-center rounded-full bg-rose-50 text-rose-600 border border-rose-100 shrink-0 shadow-sm">
                                    <Clock className="h-6 w-6" />
                                  </div>
                                )}
                                <div>
                                  <span className="text-sm font-extrabold text-gray-900 block tracking-tight">Clock {entry.entry === 'IN' ? 'In' : 'Out'}</span>
                                  <span className="text-xs font-semibold text-gray-500">{format(new Date(entry.timestamp), 'h:mm:ss a')}</span>
                                </div>
                            </div>
                            <span className={`px-3 py-1.5 inline-flex text-[10px] uppercase tracking-wider font-bold rounded-lg shadow-sm ${timingStatusColor[entry.timing_status]}`}>
                              {timingStatusLabel[entry.timing_status]}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50/50 p-3.5 rounded-xl border border-gray-100/80">
                            <div>
                              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Date</span>
                              <span className="font-semibold text-gray-800">{format(new Date(entry.timestamp), 'MMM d, yyyy')}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Shift</span>
                              <span className="font-semibold text-gray-800">{entry.shift_name || '-'}</span>
                            </div>
                            {showAdminView && (
                              <>
                                <div className="col-span-1">
                                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Mode</span>
                                  <span className="font-semibold text-gray-800">{entry.attendance_mode || '-'}</span>
                                </div>
                                <div className="col-span-1">
                                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Photo</span>
                                  {entry.captured_image ? (
                                    <button 
                                      onClick={() => setViewingImage(entry.captured_image)}
                                      className="inline-flex items-center px-2 py-1 text-[11px] font-medium rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                                    >
                                      <ImageIcon className="h-3 w-3 mr-1" /> View
                                    </button>
                                  ) : <span className="font-semibold text-gray-400">-</span>}
                                </div>
                              </>
                            )}
                          </div>
                          
                          {(showAdminView || entry.office_location_status) && (
                            <div className="text-sm px-1">
                               <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Location</span>
                               {showAdminView ? (
                                 <>
                                   <LocationAddressDisplay 
                                      lat={entry.latitude} 
                                      lng={entry.longitude} 
                                      fallback={entry.office_location_status || '-'} 
                                      preTranscribedAddress={entry.location_address}
                                    />
                                     {entry.distance_from_branch != null && (
                                      <div className="text-[11px] font-bold text-indigo-600 mt-1.5 flex items-center">
                                        <MapPin className="h-3 w-3 mr-1" />
                                        {entry.distance_from_branch >= 1000
                                          ? `${(entry.distance_from_branch / 1000).toFixed(2)}km`
                                          : `${Math.round(entry.distance_from_branch)}m`}{' '}
                                        away from branch
                                      </div>
                                    )}
                                    {entry.latitude != null && entry.longitude != null && (
                                      <>
                                        <button
                                          onClick={() => setSelectedMapLocation({ lat: entry.latitude!, lng: entry.longitude! })}
                                          className="mt-2 inline-flex items-center px-2 py-1 border border-indigo-200 text-[11px] font-medium rounded text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors mr-2"
                                        >
                                          <MapIcon className="h-3 w-3 mr-1" />
                                          View in Map
                                        </button>
                                        
                                        {entry.entry === 'IN' && entry.office_location_status === 'Outside Office' && (
                                          <button
                                            onClick={() => setSelectedRouteEntry(entry)}
                                            className="mt-2 inline-flex items-center px-2 py-1 border border-emerald-200 text-[11px] font-medium rounded text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                                          >
                                            <Navigation className="h-3 w-3 mr-1" />
                                            View Route
                                          </button>
                                        )}
                                      </>
                                    )}
                                 </>
                               ) : (
                                 <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                   entry.office_location_status === 'Office' 
                                     ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                     : entry.office_location_status === 'Outside Office'
                                     ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                     : 'bg-gray-50 text-gray-700 border border-gray-100'
                                 }`}>
                                   {entry.office_location_status || '-'}
                                 </span>
                               )}
                            </div>
                          )}

                          {showAdminView && entry.manual_reason && (
                            <div className="text-sm bg-yellow-50 p-2.5 rounded-lg border border-yellow-200 mt-1">
                               <span className="block text-[10px] font-bold text-yellow-700 uppercase tracking-widest mb-0.5">Manual Reason</span>
                               <span className="text-yellow-900 font-medium text-xs leading-relaxed">{entry.manual_reason}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Desktop View: Table */}
                    <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
                      <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/80 backdrop-blur-md border-b border-gray-100">
                          <tr>
                            <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                              Entry Type
                            </th>
                            <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                              Timestamp
                            </th>
                            <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                              Assigned Shift
                            </th>
                            <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                              Timing Status
                            </th>
                            {showAdminView && (
                              <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                                Mode
                              </th>
                            )}
                            <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                              Location
                            </th>
                            {showAdminView && (
                              <>
                                <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                                  Photo
                                </th>
                                <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                                  Reason
                                </th>
                              </>
                            )}
                          </tr>
                        </thead>
                      <tbody className="bg-white divide-y divide-gray-100/50">
                        {timestamps.map((entry) => (
                          <tr key={entry.id} className="hover:bg-gray-50/80 transition-colors group">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {entry.entry === 'IN' ? (
                                  <div className="flex items-center">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm group-hover:scale-105 transition-transform">
                                      <Clock className="h-5 w-5" />
                                    </div>
                                    <span className="ml-3 text-sm font-extrabold text-gray-900 tracking-tight">Clock In</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-rose-50 text-rose-600 border border-rose-100 shadow-sm group-hover:scale-105 transition-transform">
                                      <Clock className="h-5 w-5" />
                                    </div>
                                    <span className="ml-3 text-sm font-extrabold text-gray-900 tracking-tight">Clock Out</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {format(new Date(entry.timestamp), 'h:mm:ss a')}
                              </div>
                              <div className="text-sm font-medium text-gray-600 mt-0.5">
                                {format(new Date(entry.timestamp), 'MMMM d, yyyy')}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {entry.shift_name || '-'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${timingStatusColor[entry.timing_status]}`}>
                                {timingStatusLabel[entry.timing_status]}
                              </span>
                            </td>
                            {showAdminView && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {entry.attendance_mode || '-'}
                              </td>
                            )}
                            <td className="px-6 py-4">
                              {showAdminView ? (
                                <>
                                  <LocationAddressDisplay 
                                    lat={entry.latitude} 
                                    lng={entry.longitude} 
                                    fallback={entry.office_location_status || '-'} 
                                    preTranscribedAddress={entry.location_address}
                                  />
                                  {entry.distance_from_branch != null && (
                                    <div className="text-[11px] font-bold text-indigo-600 mt-1 flex items-center">
                                      <MapPin className="h-3 w-3 mr-1" />
                                      {entry.distance_from_branch >= 1000
                                        ? `${(entry.distance_from_branch / 1000).toFixed(2)}km`
                                        : `${Math.round(entry.distance_from_branch)}m`}{' '}
                                      away
                                    </div>
                                  )}
                                  {entry.latitude != null && entry.longitude != null && (
                                    <>
                                      <button
                                        onClick={() => setSelectedMapLocation({ lat: entry.latitude!, lng: entry.longitude! })}
                                        className="mt-1.5 inline-flex items-center px-2 py-1 border border-indigo-200 text-[10px] font-medium rounded text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors mr-2"
                                      >
                                        <MapIcon className="h-3 w-3 mr-1" />
                                        View in Map
                                      </button>
                                      
                                      {entry.entry === 'IN' && entry.office_location_status === 'Outside Office' && (
                                        <button
                                          onClick={() => setSelectedRouteEntry(entry)}
                                          className="mt-1.5 inline-flex items-center px-2 py-1 border border-emerald-200 text-[10px] font-medium rounded text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                                        >
                                          <Navigation className="h-3 w-3 mr-1" />
                                          View Route
                                        </button>
                                      )}
                                    </>
                                  )}
                                </>
                              ) : (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  entry.office_location_status === 'Office' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                    : entry.office_location_status === 'Outside Office'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                    : 'bg-gray-50 text-gray-700 border border-gray-100'
                                }`}>
                                  {entry.office_location_status || '-'}
                                </span>
                              )}
                            </td>
                            {showAdminView && (
                              <>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {entry.captured_image ? (
                                    <button 
                                      onClick={() => setViewingImage(entry.captured_image)}
                                      className="inline-flex items-center justify-center p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                      title="View Photo"
                                    >
                                      <ImageIcon size={16} />
                                    </button>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 truncate max-w-[150px]" title={entry.manual_reason || ''}>
                                  {entry.manual_reason ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-50 text-yellow-800 border border-yellow-200 truncate max-w-full">
                                      {entry.manual_reason}
                                    </span>
                                  ) : '-'}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* 5. Update fallback messaging based on role */}
        {!selectedEmployee && !roleLoading && (
          <div className="bg-white shadow rounded-lg p-12">
            <div className="text-center">
              <Search className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {showAdminView ? 'No Employee Selected' : 'Employee Record Not Found'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {showAdminView 
                  ? 'Please select an employee from the dropdown above to view clock in/out options and timestamp entries.'
                  : 'We could not link your account to an employee profile. Please contact HR.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Map Modal */}
      {selectedMapLocation && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div 
              className="fixed inset-0 transition-opacity bg-gray-500/75 backdrop-blur-sm" 
              aria-hidden="true" 
              onClick={() => setSelectedMapLocation(null)}
            ></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl sm:my-8 sm:align-middle sm:max-w-2xl w-full">
              <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center sm:px-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <MapPin className="h-5 w-5 mr-2 text-indigo-600" />
                  Clock Entry Location
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedMapLocation(null)}
                  className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 sm:p-6 bg-gray-50">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative">
                  <MapPickerSwitch
                    lat={selectedMapLocation.lat} 
                    lng={selectedMapLocation.lng} 
                    showSearch={false}
                    readOnly={true}
                    onLocationSelect={() => {}} 
                    height="400px" 
                  />
                </div>
              </div>
              <div className="bg-white px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedMapLocation(null)}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Travel Route Viewer Modal */}
      {selectedRouteEntry && (() => {
        // Find the very next timestamp entry for this employee after the outside-office clock-in
        const nextEntry = timestamps
          .filter(
            (t) =>
              t.employee_id === selectedRouteEntry.employee_id &&
              new Date(t.timestamp).getTime() > new Date(selectedRouteEntry.timestamp).getTime()
          )
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];

        const isOfficeArrival = nextEntry?.entry === 'IN';
        const endLabel = isOfficeArrival ? 'Clock In (Office)' : 'Clock Out';
          
        return (
          <TravelRouteViewer
            timestampId={selectedRouteEntry.id}
            employeeName={selectedRouteEntry.employee_name || 'Employee'}
            clockInTime={selectedRouteEntry.timestamp}
            clockOutTime={nextEntry?.timestamp}
            clockInLat={selectedRouteEntry.latitude}
            clockInLng={selectedRouteEntry.longitude}
            clockOutLat={nextEntry?.latitude}
            clockOutLng={nextEntry?.longitude}
            totalDistanceMeters={selectedRouteEntry.travel_distance_meters || 0}
            totalDurationSeconds={selectedRouteEntry.travel_duration_seconds || 0}
            plannedDistanceMeters={selectedRouteEntry.planned_distance_meters}
            roadsApiWarnings={selectedRouteEntry.roads_api_warnings}
            onClose={() => setSelectedRouteEntry(null)}
            clockOutLabel={endLabel}
          />
        );
      })()}

      {/* Image Viewing Modal */}
      {viewingImage && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-900/90 backdrop-blur-sm" onClick={() => setViewingImage(null)}>
          <div className="relative max-w-3xl w-full flex justify-center animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingImage(null)} className="absolute -top-12 right-0 md:-right-12 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
              <X size={24} />
            </button>
            <img 
              src={viewingImage} 
              alt="Captured face" 
              className="max-h-[85vh] w-auto rounded-2xl shadow-2xl border-4 border-white/10 object-contain select-none" 
              onContextMenu={(e) => e.preventDefault()}
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}