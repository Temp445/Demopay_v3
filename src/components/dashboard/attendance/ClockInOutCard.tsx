import React, { useState, useEffect } from "react";
import {
  Clock,
  LogIn,
  LogOut,
  AlertCircle,
  Camera,
  User,
  Loader2,
  Navigation,
} from "lucide-react";
import { useAttendanceTimestampStore } from "../../../stores/attendanceTimestampStore";
import { useAuth } from "../../../contexts/AuthContext";
import type { Employee } from "../../../stores/employeesStore";
import { hasEnrolledFace } from "../../../lib/faceRecognition";
import FaceRecognitionModal from "./FaceRecognitionModal";
import { supabase } from "../../../lib/supabase";
import { useTenant } from '../../../contexts/TenantContext';
import { validateLocationAgainstBranches } from '../../../lib/locationService';
import * as travelService from '../../../lib/travelTrackingService';
import { registerDistanceCallback, unregisterDistanceCallback } from '../../../lib/travelTrackingService';

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface AssignedShift extends Shift {
  schedule_date: string;
}

interface ClockInOutCardProps {
  onAttendanceUpdated: () => void;
  shifts: Shift[]; // All shifts available in system (fallback)
  selectedEmployee?: Employee | null;
  lastRefresh: number; // Triggers re-fetch when parent refreshes
  canViewAllData?: boolean; // Added to handle role-based logic
}

export default function ClockInOutCard({
  onAttendanceUpdated,
  shifts,
  selectedEmployee,
  lastRefresh,
  canViewAllData = false, // Default to false if not provided
}: ClockInOutCardProps) {
  const [loading, setLoading] = useState(false);
  const [isConfigLoading, setIsConfigLoading] = useState(true); // Added to prevent flickering
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [manualMode, setManualMode] = useState(false);
  const [manualDateTime, setManualDateTime] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [manualTransientDateTime, setManualTransientDateTime] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [manualReason, setManualReason] = useState("");
  const [latestEntryType, setLatestEntryType] = useState<"IN" | "OUT" | null>(null);

  // States for shift tracking
  const [assignedShifts, setAssignedShifts] = useState<AssignedShift[]>([]);
  const [currentAssignedShift, setCurrentAssignedShift] = useState<AssignedShift | null>(null);
  const [currentTimeShift, setCurrentTimeShift] = useState<Shift | null>(null);

  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { createTimestamp, getLatestEntryType } = useAttendanceTimestampStore();

  const [isFaceRecognitionModalOpen, setIsFaceRecognitionModalOpen] = useState(false);
  const [faceRecognitionMode, setFaceRecognitionMode] = useState<"enroll" | "verify">("verify");
  const [hasFaceEnrolled, setHasFaceEnrolled] = useState(false);
  const [useFaceRecognition, setUseFaceRecognition] = useState(true); // Default to true

  const [allowManualClockIn, setAllowManualClockIn] = useState(false);
  const [hasFaceScreens, setHasFaceScreens] = useState(true);
  const [hasHikScreens, setHasHikScreens] = useState(false);
  
  // New Location requirements
  const [requireLocation, setRequireLocation] = useState(false);
  const [branchLocations, setBranchLocations] = useState<any[]>([]);

  // Travel tracking live badge state
  const [liveDistance, setLiveDistance] = useState<number>(0);
  const [isTracking, setIsTracking] = useState(false);

  // Register live distance callback from service so UI badge updates in real-time
  useEffect(() => {
    registerDistanceCallback((meters: number) => {
      setLiveDistance(meters);
    });
    // Restore badge if tracking was already active (e.g. user navigated away and came back)
    setIsTracking(travelService.isTravelTrackingActive());
    return () => {
      unregisterDistanceCallback();
    };
  }, []);

  // Fetch validation settings & tenant active screens to determine logic
  useEffect(() => {
    if (!currentTenant?.id) {
      setIsConfigLoading(false);
      return;
    }
    
    const fetchConfig = async () => {
      setIsConfigLoading(true);
      try {
        // 1. Fetch config for manual clock in and location requirement
        const { data: configData } = await supabase
          .from('attendance_validation_config')
          .select('allow_manual_clock_in_out, require_location')
          .eq('tenant_id', currentTenant.id)
          .eq('is_active', true)
          .maybeSingle();
          
        if (configData) {
          setAllowManualClockIn(!!configData.allow_manual_clock_in_out);
          setRequireLocation(!!configData.require_location);
        } else {
          setAllowManualClockIn(false);
          setRequireLocation(false);
        }

        // Fetch company settings branch locations
        const { data: companyData } = await supabase
          .from('company_settings')
          .select('branch_locations')
          .eq('tenant_id', currentTenant.id)
          .maybeSingle();
          
        if (companyData && companyData.branch_locations) {
          setBranchLocations(companyData.branch_locations);
        } else {
          setBranchLocations([]);
        }

        // 2. Fetch active screens for tenant
        const { data: screensData } = await supabase
          .from('application_screens')
          .select('screen_route')
          .eq('tenant_id', currentTenant.id)
          .eq('is_active', true);

        let faceEnabled = false;
        let hikEnabled = false;

        if (screensData) {
          const routes = screensData.map(s => s.screen_route);
          faceEnabled = routes.includes('/dashboard/attendance-face-verify') || routes.includes('/dashboard/attendance/face-enrollment');
          hikEnabled = routes.includes('/dashboard/attendance/hik-device-employees') || routes.includes('/dashboard/settings/hik-device-controller');
        }

        setHasFaceScreens(faceEnabled);
        setHasHikScreens(hikEnabled);
      } catch (err) {
        console.error("Failed to fetch tenant config:", err);
      } finally {
        setIsConfigLoading(false);
      }
    };
    
    fetchConfig();
  }, [currentTenant?.id]);

  // Set Default State Based on Rules
  useEffect(() => {
    // Determine default state for Face Recognition
    if (!hasFaceScreens && hasHikScreens) {
      setUseFaceRecognition(false);
    } else if (!hasFaceScreens && !hasHikScreens) {
      setUseFaceRecognition(false);
    } else if (hasFaceScreens) {
      setUseFaceRecognition(true);
    }

    if (!canViewAllData) {
      setManualMode(false); // Ensure historical manual mode is always disabled for employees
    }
  }, [canViewAllData, hasFaceScreens, hasHikScreens]);

  // Derived Visibility Rules
  const showFaceToggle = canViewAllData 
    ? hasFaceScreens 
    : (hasFaceScreens && allowManualClockIn);
    
  // UPDATED LOGIC: Ensure Admins ALWAYS see the actions so they can use Manual Mode
  let canShowClockInActions = true;
  if (canViewAllData) {
    canShowClockInActions = true;
  } else if (!hasFaceScreens) {
    // For employees: If face screens are disabled (whether no screens at all, or only Hikvision),
    // they can only see web actions if manual clock-in is explicitly allowed.
    canShowClockInActions = allowManualClockIn;
  } else {
    // For employees: If face screens are enabled, they can see the actions (Face verify)
    canShowClockInActions = true;
  }

  // Consolidated data fetch triggered by selectedEmployee or parent's lastRefresh
  useEffect(() => {
    const fetchCardData = async () => {
      if (!selectedEmployee) {
        setAssignedShifts([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 1. Fetch latest entry type
        const todayStrForEntry = manualMode
          ? new Date(manualDateTime).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        const latestEntry = await getLatestEntryType(selectedEmployee.id, todayStrForEntry);
        setLatestEntryType(latestEntry);

        // 2. Fetch face enrollment status
        const enrolled = await hasEnrolledFace(selectedEmployee.id);
        setHasFaceEnrolled(enrolled);

        // 3. Fetch assigned shifts (today and yesterday for night shifts)
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const todayStr = today.toISOString().split("T")[0];
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        const { data, error: shiftError } = await supabase
          .from("shift_assignments")
          .select(`
            schedule_date,
            shifts (id, name, start_time, end_time)
          `)
          .eq("employee_id", selectedEmployee.id)
          .in("schedule_date", [yesterdayStr, todayStr]);

        if (shiftError) throw shiftError;

        const assignments: AssignedShift[] = data.map((item: any) => ({
          id: item.shifts.id,
          name: item.shifts.name,
          start_time: item.shifts.start_time,
          end_time: item.shifts.end_time,
          schedule_date: item.schedule_date,
        }));

        setAssignedShifts(assignments);
      } catch (err) {
        console.error("Failed to fetch card data:", err);
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchCardData();
  }, [selectedEmployee, lastRefresh, manualMode, manualDateTime, getLatestEntryType]);

  // Helper 1: What shift is active right now based purely on the CLOCK?
  const getShiftByTime = (timestamp: Date, allShifts: Shift[]): Shift | null => {
    const timeString = timestamp.toTimeString().slice(0, 8); // "HH:MM:SS"
    return (
      allShifts.find((shift) => {
        if (shift.start_time < shift.end_time) {
          return timeString >= shift.start_time && timeString <= shift.end_time;
        } else {
          // Night shift spanning midnight
          return timeString >= shift.start_time || timeString <= shift.end_time;
        }
      }) || null
    );
  };

  // Helper 2: What shift is the employee ASSIGNED to today based on the DATE?
  const getAssignedShiftByDate = (timestamp: Date, assignments: AssignedShift[]): AssignedShift | null => {
    const timeString = timestamp.toTimeString().slice(0, 8);
    const currentDateStr = timestamp.toISOString().split("T")[0];

    const yesterday = new Date(timestamp);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Check for yesterday's night shift crossover
    const yesterdayNightShift = assignments.find(
      (shift) =>
        shift.schedule_date === yesterdayStr &&
        shift.start_time > shift.end_time
    );

    if (yesterdayNightShift && timeString <= yesterdayNightShift.end_time) {
      return yesterdayNightShift;
    }

    // Otherwise, return today's assigned shift
    return (
      assignments.find((shift) => shift.schedule_date === currentDateStr) || null
    );
  };

  // Update real-time clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Update display values when time changes
  useEffect(() => {
    setCurrentAssignedShift(getAssignedShiftByDate(currentTime, assignedShifts));
    setCurrentTimeShift(getShiftByTime(currentTime, shifts));
  }, [currentTime, assignedShifts, shifts]);

  const handleClockInOut = async (
    entryType: "IN" | "OUT",
    manual: boolean = false,
    faceVerified: boolean = false
  ) => {
    if (!user && !selectedEmployee) return;

    try {
      setLoading(true);
      setError(null);

      const employeeId = selectedEmployee?.id || user?.id;
      if (!employeeId) throw new Error("No employee selected");

      if (manual && !manualReason.trim()) {
        setError("Please provide a reason for the manual entry.");
        setLoading(false);
        return;
      }

      // Validate employee status before proceeding
      if (selectedEmployee) {
        const restrictedStatuses = ['relieved', 'suspended', 'terminated'];
        const employeeStatus = selectedEmployee.status?.toLowerCase();

        if (restrictedStatuses.includes(employeeStatus) && selectedEmployee.status_date) {
          const timestamp = manual ? new Date(manualDateTime) : new Date();
          const statusDate = new Date(selectedEmployee.status_date);

          // Set both dates to midnight for day-level comparison
          timestamp.setHours(0, 0, 0, 0);
          statusDate.setHours(0, 0, 0, 0);

          if (timestamp > statusDate) {
            const statusLabel = employeeStatus.charAt(0).toUpperCase() + employeeStatus.slice(1);
            setError(`Clock-in/out is not allowed. Employee status is ${statusLabel} effective from ${new Date(selectedEmployee.status_date).toLocaleDateString()}.`);
            setLoading(false);
            return;
          }
        }
      }

      if (useFaceRecognition && !manual && !faceVerified) {
        if (!hasFaceEnrolled) {
          setError("Please enroll your face first or use Manual Mode.");
          setLoading(false);
          return;
        }
        setIsFaceRecognitionModalOpen(true);
        setFaceRecognitionMode("verify");
        setLoading(false);
        return;
      }

      const timestamp = manual ? new Date(manualDateTime) : new Date();

      // Calculate active shifts at the exact moment of click
      const assignedShift = getAssignedShiftByDate(timestamp, assignedShifts);

      let finalShiftId: string | null = null;
      let timingStatus: "OK" | "OUTSIDE_SHIFT" | "NO_SHIFT_ASSIGNED" = "NO_SHIFT_ASSIGNED";

      if (assignedShift) {
        finalShiftId = assignedShift.id;

        const currentMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();

        const [startH, startM] = assignedShift.start_time.split(":").map(Number);
        const [endH, endM] = assignedShift.end_time.split(":").map(Number);

        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        const isInsideShift =
          startMinutes < endMinutes
            ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
            : currentMinutes >= startMinutes || currentMinutes <= endMinutes; // night shift

        timingStatus = isInsideShift ? "OK" : "OUTSIDE_SHIFT";
      } else {
        finalShiftId = null;
        timingStatus = "NO_SHIFT_ASSIGNED";
      }

      let locationData = {
        latitude: undefined as number | undefined,
        longitude: undefined as number | undefined,
        distanceMeters: undefined as number | undefined,
        status: undefined as 'Office' | 'Outside Office' | undefined,
        address: undefined as string | undefined,
      };

      if (requireLocation) {
        try {
          const locResult = await validateLocationAgainstBranches(branchLocations);
          let fetchedAddress: string | undefined = undefined;

          // Attempt to reverse geocode the location to save it permanently in the database
          if (locResult.latitude && locResult.longitude) {
            try {
              const res = await fetch(`https://photon.komoot.io/reverse?lon=${locResult.longitude}&lat=${locResult.latitude}&lang=en`);
              if (res.ok) {
                const data = await res.json();
                if (data.features && data.features.length > 0) {
                  const props = data.features[0].properties;
                  const name = props.name || '';
                  const street = [props.housenumber, props.street].filter(Boolean).join(' ');
                  const city = props.city || props.town || props.village || props.county || '';
                  const state = props.state || '';
                  
                  // Build a concise, readable address
                  const displayNameParts = [name, street, city, state].filter(p => p && p.trim() !== '');
                  fetchedAddress = Array.from(new Set(displayNameParts)).join(', ');
                }
              }
            } catch (geocodeErr) {
              console.warn("Silent failure on reverse geocoding during clock in:", geocodeErr);
            }
          }

          locationData = {
            latitude: locResult.latitude,
            longitude: locResult.longitude,
            distanceMeters: locResult.distanceMeters ?? undefined,
            status: locResult.status,
            address: fetchedAddress,
          };
        } catch (locErr: any) {
          console.error("Location error:", locErr);
          const msg = locErr?.message || "Unknown error";
          setError(`Failed to get your location (${msg}). Please ensure location services are enabled and you are on a secure connection (HTTPS).`);
          setLoading(false);
          return;
        }
      }

      let mode: 'Device' | 'Manual' | 'Live' | 'Facial Recognition' = 'Live';
      if (manual) mode = 'Manual';
      else if (faceVerified) mode = 'Facial Recognition';

      // Stop any active travel tracking before inserting (for OUT or Office re-entry)
      if (entryType === 'OUT' || (entryType === 'IN' && locationData.status === 'Office')) {
        if (travelService.isTravelTrackingActive()) {
          await travelService.stopTravelTracking(true);
          setIsTracking(false);
          setLiveDistance(0);
        }
      }

      await createTimestamp({
        employee_id: employeeId,
        shift_id: finalShiftId,
        entry: entryType,
        timestamp: timestamp.toISOString(),
        timing_status: timingStatus,
        attendance_mode: mode,
        manual_reason: manual ? manualReason : undefined,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        distance_from_branch: locationData.distanceMeters,
        office_location_status: locationData.status,
        location_address: locationData.address,
      });

      // Start travel tracking after a successful Outside-Office clock-IN
      if (entryType === 'IN' && locationData.status === 'Outside Office' && !manual && currentTenant?.id) {
        // Fetch the ID of the row we just inserted
        const { data: createdTs } = await supabase
          .from('attendance_timestamp')
          .select('id')
          .eq('employee_id', employeeId)
          .eq('entry', 'IN')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (createdTs?.id) {
          travelService.startTravelTracking({
            timestampId: createdTs.id,
            employeeId,
            tenantId: currentTenant.id,
            startTime: Date.now(),
          });
          setIsTracking(true);
          setLiveDistance(0);
        }
      }

      setLatestEntryType(entryType);
      onAttendanceUpdated();

      if (manual) {
        setManualMode(false);
        setManualDateTime(new Date().toISOString().slice(0, 16));
        setManualReason("");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to clock ${entryType.toLowerCase()}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFaceRecognitionSuccess = (verifiedEmployeeId?: string) => {
    setIsFaceRecognitionModalOpen(false);

    if (faceRecognitionMode === "enroll") {
      setHasFaceEnrolled(true);
      return;
    }

    if (
      verifiedEmployeeId &&
      selectedEmployee &&
      verifiedEmployeeId === selectedEmployee.id
    ) {
      handleClockInOut(latestEntryType !== "IN" ? "IN" : "OUT", false, true);
    } else {
      setError("Face verification failed. Identity could not be confirmed.");
    }
  };

  const employeeCannotClock = !canViewAllData && !hasFaceEnrolled && !allowManualClockIn && hasFaceScreens;
  const canClockIn = !loading && selectedEmployee && latestEntryType !== "IN" && !employeeCannotClock;
  const canClockOut = !loading && selectedEmployee && latestEntryType === "IN" && !employeeCannotClock;

  // NEW: Determines if we should show the Hikvision-only warning
  const showHikWarning = !canViewAllData && hasHikScreens && !hasFaceScreens && !allowManualClockIn;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center">
            <Clock className="h-6 w-6 text-indigo-600" />
            <div className="ml-2">
              <h3 className="text-lg font-medium text-gray-900">
                {currentTime.toLocaleTimeString()}
              </h3>
            </div>
          </div>

          {/* Live Travel Tracking Badge */}
          {isTracking && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-3 py-1.5 rounded-full animate-pulse-badge">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <Navigation className="h-3.5 w-3.5" />
              Tracking travel &mdash; {liveDistance >= 1000
                ? `${(liveDistance / 1000).toFixed(2)} km`
                : `${Math.round(liveDistance)} m`}
            </div>
          )}
          
          {/* Hide toggles until config is loaded to prevent popping */}
          {!isConfigLoading && (canViewAllData || showFaceToggle) && (
            <div className="flex flex-wrap items-center gap-3 sm:space-x-4 sm:gap-0">
              {canViewAllData && (
                <button
                  onClick={() => setManualMode(!manualMode)}
                  className="text-sm text-indigo-600 hover:text-indigo-900"
                >
                  {manualMode ? "Live Mode" : "Manual Mode"}
                </button>
              )}

              {showFaceToggle && (
                <div className="flex items-center">
                  <input
                    id="use-face-recognition"
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={useFaceRecognition}
                    onChange={(e) => setUseFaceRecognition(e.target.checked)}
                  />
                  <label
                    htmlFor="use-face-recognition"
                    className="ml-2 text-sm text-gray-700"
                  >
                    Use Face Recognition
                  </label>
                </div>
              )}

              {/* FIX: Added canViewAllData here so regular employees never see Enroll/Update Face */}
              {canViewAllData && selectedEmployee && useFaceRecognition && showFaceToggle && (
                <button
                  onClick={() => {
                    setFaceRecognitionMode("enroll");
                    setIsFaceRecognitionModalOpen(true);
                  }}
                  className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs rounded text-gray-700 bg-white hover:bg-gray-50 bg-indigo-50"
                >
                  <User className="h-3 w-3 mr-1" />
                  {hasFaceEnrolled ? "Update Face" : "Enroll Face"}
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {isConfigLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
          </div>
        ) : (
          <>
            {/* Warning block for standard employees with no face enrolled and manual not allowed */}
            {!canViewAllData && !hasFaceEnrolled && !allowManualClockIn && hasFaceScreens && selectedEmployee && !loading && canShowClockInActions && (
              <div className="mt-4 rounded-md bg-yellow-50 p-4 border-l-4 border-yellow-400">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <div className="ml-3">
                    <p className="text-sm text-yellow-800">
                      <strong>Face Not Enrolled:</strong> You cannot clock in/out yet. Please ask an Admin or HR representative to enroll your face data.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* NEW: Warning block for Hikvision / Physical Device only */}
            {showHikWarning && (
              <div className="mt-6 flex flex-col items-center justify-center p-6 bg-gray-50 rounded-lg border border-gray-200">
                <AlertCircle className="h-10 w-10 text-gray-400 mb-2" />
                <h4 className="text-lg font-medium text-gray-900">Clock-in/out via Hik device or physical device.</h4>
              </div>
            )}

            {/* Only render the clock in/out actions if they are permitted */}
            {canShowClockInActions && !showHikWarning && (
              manualMode && canViewAllData ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <label
                      htmlFor="manual-datetime"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Date and Time
                    </label>
                    <input
                      type="datetime-local"
                      id="manual-datetime"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      value={manualTransientDateTime}
                      onChange={(e) => setManualTransientDateTime(e.target.value)}
                      onBlur={() => setManualDateTime(manualTransientDateTime)}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="manual-reason"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Reason for Manual Entry <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="manual-reason"
                      rows={3}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder="Please provide a reason for manual time entry"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={() => handleClockInOut("IN", true)}
                      disabled={!canClockIn}
                      className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Manual Clock In
                    </button>
                    <button
                      onClick={() => handleClockInOut("OUT", true)}
                      disabled={!canClockOut}
                      className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Manual Clock Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  <button
                    onClick={() => handleClockInOut("IN", false)}
                    disabled={!canClockIn}
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {useFaceRecognition ? (
                      <Camera className="h-4 w-4 mr-2" />
                    ) : (
                      <LogIn className="h-4 w-4 mr-2" />
                    )}
                    Clock In
                  </button>
                  <button
                    onClick={() => handleClockInOut("OUT", false)}
                    disabled={!canClockOut}
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {useFaceRecognition ? (
                      <Camera className="h-4 w-4 mr-2" />
                    ) : (
                      <LogOut className="h-4 w-4 mr-2" />
                    )}
                    Clock Out
                  </button>
                </div>
              )
            )}
          </>
        )}

        {latestEntryType && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Latest Entry
                </p>
                <p className="mt-1 text-lg text-gray-900">
                  {latestEntryType === "IN" ? "Clocked In" : "Clocked Out"}
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  latestEntryType === "IN"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {latestEntryType}
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedEmployee && (
        <FaceRecognitionModal
          isOpen={isFaceRecognitionModalOpen}
          onClose={() => setIsFaceRecognitionModalOpen(false)}
          employeeId={selectedEmployee.id}
          mode={faceRecognitionMode}
          onSuccess={handleFaceRecognitionSuccess}
        />
      )}
    </div>
  );
}