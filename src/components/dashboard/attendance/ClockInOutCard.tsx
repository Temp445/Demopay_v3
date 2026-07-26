import React, { useState, useEffect, useRef } from "react";
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
import {
  registerDistanceCallback,
  unregisterDistanceCallback,
  registerMovementCallback,
  unregisterMovementCallback,
  type MovementState,
} from '../../../lib/travelTrackingService';
import { useOutsideOfficeApprovalsStore } from '../../../stores/outsideOfficeApprovalsStore';
import OutsideOfficeReasonModal from './OutsideOfficeReasonModal';

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
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true); // Added to prevent flickering
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const cachedLocationDataRef = useRef<{ data: any, time: number } | null>(null);

  const [manualMode, setManualMode] = useState(false);
  const [manualDateTime, setManualDateTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [manualTransientDateTime, setManualTransientDateTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [manualReason, setManualReason] = useState("");
  const [latestEntryType, setLatestEntryType] = useState<"IN" | "OUT" | null>(null);
  const [latestEntryTime, setLatestEntryTime] = useState<string | null>(null);
  const [latestOfficeStatus, setLatestOfficeStatus] = useState<string | null>(null);
  const [latestOfficeArrivalProcessed, setLatestOfficeArrivalProcessed] = useState<boolean>(false);
  const [currentLocationStatus, setCurrentLocationStatus] = useState<'Office' | 'Outside Office' | null>(null);
  const [googleMapsEnabled, setGoogleMapsEnabled] = useState(false);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string | null>(null);

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

  // Travel Tracking Config
  const [enableTravelTracking, setEnableTravelTracking] = useState(false);
  const [gpsInterval, setGpsInterval] = useState(5);
  const [gpsThreshold, setGpsThreshold] = useState(100);
  const [captureImageEnabled, setCaptureImageEnabled] = useState(false);

  // Travel tracking live badge state
  const [liveDistance, setLiveDistance] = useState<number>(0);
  const [isTracking, setIsTracking] = useState(false);
  const [movementState, setMovementState] = useState<MovementState>('unknown');

  // Outside office approval state
  const { createApproval, updateClockOut, updateInsideOfficeClockIn, fetchByEmployee, cancelApproval } = useOutsideOfficeApprovalsStore();
  const [pendingApproval, setPendingApproval] = useState<{
    id: string;
    clockInTime: string;
    attendanceLocation?: string | null;
  } | null>(null);

  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedEmployee) {
      fetchByEmployee(selectedEmployee.id).then((data) => {
        const pending = data.filter(d => d.status === 'pending' && !d.reason);
        setPendingActions(pending);
      });
    } else {
      setPendingActions([]);
    }
  }, [selectedEmployee, pendingApproval, lastRefresh, fetchByEmployee]);

  // Register live distance + movement callbacks from service so UI badge updates in real-time
  useEffect(() => {
    registerDistanceCallback((meters: number) => {
      setLiveDistance(meters);
    });
    registerMovementCallback((state: MovementState) => {
      setMovementState(state);
    });
    // Restore badge if tracking was already active (e.g. user navigated away and came back)
    if (travelService.isTravelTrackingActive()) {
      setIsTracking(true);
      setLiveDistance(travelService.getCumulativeDistance());
    }
    return () => {
      unregisterDistanceCallback();
      unregisterMovementCallback();
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
        // 1. Fetch global config for manual clock in and location requirement
        const { data: globalConfig } = await supabase
          .from('attendance_validation_config')
          .select('allow_manual_clock_in_out, require_location, enable_travel_tracking, capture_image_while_face_clockin, gps_sampling_interval_mins, min_movement_threshold_meters, device_tracking_applicability')
          .eq('tenant_id', currentTenant.id)
          .eq('is_active', true)
          .maybeSingle();

        let configToUse = globalConfig || {
          allow_manual_clock_in_out: false,
          require_location: false,
          enable_travel_tracking: false,
          capture_image_while_face_clockin: false,
          gps_sampling_interval_mins: 5,
          min_movement_threshold_meters: 100,
          device_tracking_applicability: 'common'
        };

        // Enforce Strict Mode applicability
        if (configToUse.device_tracking_applicability === 'specific') {
          // Ignore global bools, default to false
          configToUse.allow_manual_clock_in_out = false;
          configToUse.require_location = false;
          configToUse.enable_travel_tracking = false;
          configToUse.capture_image_while_face_clockin = false;

          // Only fetch specific settings if in specific mode
          if (selectedEmployee?.id) {
            const { data: empConfig } = await supabase
              .from('employee_attendance_settings')
              .select('allow_manual_clock_in_out, require_location, enable_travel_tracking, capture_image_while_face_clockin')
              .eq('tenant_id', currentTenant.id)
              .eq('employee_id', selectedEmployee.id)
              .maybeSingle();

            if (empConfig) {
              configToUse = { ...configToUse, ...empConfig };
            }
          }
        }

        setAllowManualClockIn(!!configToUse.allow_manual_clock_in_out);
        setRequireLocation(!!configToUse.require_location);
        setEnableTravelTracking(!!configToUse.enable_travel_tracking);
        setGpsInterval(configToUse.gps_sampling_interval_mins ?? 5);
        setGpsThreshold(configToUse.min_movement_threshold_meters ?? 100);
        setCaptureImageEnabled(!!configToUse.capture_image_while_face_clockin);

        // Fetch company settings branch locations
        const { data: companyData } = await supabase
          .from('company_settings')
          .select('branch_locations, google_maps_enabled, google_maps_api_key')
          .eq('tenant_id', currentTenant.id)
          .maybeSingle();

        if (companyData) {
          if (companyData.branch_locations) {
            setBranchLocations(companyData.branch_locations);
          } else {
            setBranchLocations([]);
          }
          setGoogleMapsEnabled(!!companyData.google_maps_enabled);
          setGoogleMapsApiKey(companyData.google_maps_api_key || null);
        } else {
          setBranchLocations([]);
          setGoogleMapsEnabled(false);
          setGoogleMapsApiKey(null);
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

  // Check current location status against branch locations
  useEffect(() => {
    if (!branchLocations || branchLocations.length === 0 || !selectedEmployee) {
      setCurrentLocationStatus(null);
      return;
    }

    const checkLocation = async () => {
      try {
        const res = await validateLocationAgainstBranches(branchLocations);
        setCurrentLocationStatus(res.status);
      } catch (err) {
        console.warn("Silent failure checking location status for card buttons:", err);
        setCurrentLocationStatus('Outside Office');
      }
    };

    checkLocation();
  }, [branchLocations, selectedEmployee, lastRefresh]);

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

        // 1. Fetch latest entry type — use local date, NOT UTC (UTC can be a day behind in IST)
        const getLocalDateStr = (d: Date) => {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        };
        const todayStrForEntry = manualMode
          ? getLocalDateStr(new Date(manualDateTime))
          : getLocalDateStr(new Date());
        const latestEntry = await getLatestEntryType(selectedEmployee.id, todayStrForEntry);
        setLatestEntryType(latestEntry?.type || null);
        setLatestEntryTime(latestEntry?.timestamp || null);
        setLatestOfficeStatus(latestEntry?.office_location_status || null);
        setLatestOfficeArrivalProcessed(!!latestEntry?.office_arrival_processed);

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
    faceVerified: boolean = false,
    capturedImageBase64?: string
  ) => {
    if (!user && !selectedEmployee) return;

    if (manual && !manualReason.trim()) {
      setError("Please provide a reason for manual entry.");
      return;
    }

    try {
      setLoading(true);
      setLoadingAction(manual ? `MANUAL_${entryType}` : entryType);

      const employeeId = selectedEmployee?.id || user?.id;
      if (!employeeId) throw new Error("No employee selected");

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

      let locationData = {
        latitude: undefined as number | undefined,
        longitude: undefined as number | undefined,
        distanceMeters: undefined as number | undefined,
        status: undefined as 'Office' | 'Outside Office' | undefined,
        address: undefined as string | undefined,
      };

      if (requireLocation) {
        const cache = cachedLocationDataRef.current;
        if (cache && Date.now() - cache.time < 5 * 60 * 1000) {
          locationData = cache.data;
        } else {
          try {
            const locResult = await validateLocationAgainstBranches(branchLocations);
            let fetchedAddress: string | undefined = undefined;

            // Attempt to reverse geocode the location to save it permanently in the database
            if (locResult.latitude && locResult.longitude) {
              try {
                if (googleMapsEnabled && googleMapsApiKey) {
                  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${locResult.latitude},${locResult.longitude}&key=${googleMapsApiKey}`);
                  if (res.ok) {
                    const data = await res.json();
                    if (data.results && data.results.length > 0) {
                      fetchedAddress = data.results[0].formatted_address;
                    }
                  }
                } else {
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

            cachedLocationDataRef.current = { data: locationData, time: Date.now() };
          } catch (locErr: any) {
            console.error("Location error:", locErr);
            const msg = locErr?.message || "Unknown error";
            let friendlyMsg = "We couldn't get your location. Please ensure location services are enabled in your browser settings.";
            if (msg.toLowerCase().includes("timeout")) {
              friendlyMsg = "Getting your location took too long. Please check your internet connection or step outside for a better GPS signal, then try again.";
            } else if (msg.toLowerCase().includes("denied")) {
              friendlyMsg = "Location access was denied. Please allow location access in your browser settings to clock in/out.";
            }
            setError(friendlyMsg);
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
        setError(null);
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

      let mode: 'Device' | 'Manual' | 'Live' | 'Facial Recognition' = 'Live';
      if (manual) mode = 'Manual';
      else if (faceVerified) mode = 'Facial Recognition';

      // Stop any active travel tracking before inserting (for OUT or Office re-entry)
      if (entryType === 'OUT' || (entryType === 'IN' && locationData.status === 'Office')) {
        if (travelService.isTravelTrackingActive()) {
          const finalLocation = locationData.latitude && locationData.longitude ? {
            latitude: locationData.latitude,
            longitude: locationData.longitude
          } : undefined;
          await travelService.stopTravelTracking(true, finalLocation);
          setIsTracking(false);
          setLiveDistance(0);
        }
      }

      if (entryType === 'IN' && latestEntryType === 'IN' && latestOfficeStatus === 'Outside Office' && !latestOfficeArrivalProcessed) {
        // Mark the previous outside punch as processed so it doesn't trigger again
        const { data: prevTs } = await supabase
          .from('attendance_timestamp')
          .select('id')
          .eq('employee_id', employeeId)
          .eq('entry', 'IN')
          .eq('office_location_status', 'Outside Office')
          .eq('office_arrival_processed', false)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (prevTs?.id) {
          const { error: updateErr } = await supabase
            .from('attendance_timestamp')
            .update({ office_arrival_processed: true })
            .eq('id', prevTs.id);
          if (updateErr) {
            console.error("Failed to mark previous outside office punch as processed:", updateErr);
          }
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
        captured_image: capturedImageBase64,
      });

      // ── Auto Comp-Off Credit on Holiday / Weekly-Off Clock-IN ──
      // Queries the holidays table directly and expands recurring patterns client-side
      // (same logic as HolidayCalendar.tsx). The get_holidays RPC does NOT expand
      // recurring patterns like "every Sunday = Weekly Holiday", so we can't use it here.
      if (entryType === 'IN' && currentTenant?.id) {
        try {
          const workedDate = (() => {
            const d = timestamp;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          })();

          // Fetch all holiday records for the tenant (including recurring patterns)
          const { data: allHolidays } = await supabase
            .from('holidays')
            .select('id, name, date, is_recurring, recurring_patterns')
            .eq('tenant_id', currentTenant.id);

          const localDate = new Date(workedDate + 'T12:00:00');
          const dow = localDate.getDay();
          const dayOfMonth = localDate.getDate();
          const weekIndex = Math.floor((dayOfMonth - 1) / 7);
          const nextWeek = new Date(localDate);
          nextWeek.setDate(nextWeek.getDate() + 7);
          const isLastOccurrence = nextWeek.getMonth() !== localDate.getMonth();

          const dayToNumber: Record<string, number> = {
            sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
            thursday: 4, friday: 5, saturday: 6,
          };

          let matchedHolidayName: string | null = null;
          for (const holiday of allHolidays || []) {
            if (!holiday) continue;

            if (!holiday.is_recurring) {
              if (holiday.date === workedDate) {
                matchedHolidayName = holiday.name;
                break;
              }
              continue;
            }

            if (holiday.recurring_patterns?.length) {
              const matched = holiday.recurring_patterns.some((pattern: any) => {
                const pDay = (pattern.week_day || pattern.weekDay || '').toLowerCase();
                const pOcc = (pattern.week_occurrence || pattern.weekOccurrence || '').toLowerCase();
                if (dayToNumber[pDay] !== dow) return false;
                if (!pOcc || pOcc === 'all') return true;
                const occurrenceMap: Record<string, number> = { first: 0, second: 1, third: 2, fourth: 3 };
                if (pOcc === 'last') return isLastOccurrence;
                return occurrenceMap[pOcc] === weekIndex;
              });
              if (matched) {
                matchedHolidayName = holiday.name;
                break;
              }
            }
          }

          if (matchedHolidayName) {
            // Find the first active Comp Off leave type
            const { data: leaveTypesData } = await supabase
              .from('leave_types')
              .select('id, name')
              .eq('tenant_id', currentTenant.id)
              .eq('is_active', true);

            const compOffType = (leaveTypesData || []).find((lt: any) => {
              const n = lt.name.toLowerCase();
              return n.includes('comp off') || n.includes('compensatory') || n.includes('comp-off');
            });

            if (compOffType) {
              const { data: existingRequests } = await supabase
                .from('comp_off_requests')
                .select('id')
                .eq('tenant_id', currentTenant.id)
                .eq('employee_id', employeeId)
                .eq('worked_date', workedDate)
                .limit(1);

              if (!existingRequests || existingRequests.length === 0) {
                await supabase
                  .from('comp_off_requests')
                  .insert([{
                    employee_id: employeeId,
                    leave_type_id: compOffType.id,
                    worked_date: workedDate,
                    reason: `Worked on ${matchedHolidayName}`,
                    status: 'Pending',
                    tenant_id: currentTenant.id,
                  }]);
              }
            }
          }
        } catch (compOffErr) {
          console.warn('Auto comp-off creation failed (non-fatal):', compOffErr);
        }
      }


      // Start travel tracking after a successful Outside-Office clock-IN, if enabled
      if (entryType === 'IN' && locationData.status === 'Outside Office' && !manual && currentTenant?.id) {
        if (enableTravelTracking) {
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
              intervalMins: gpsInterval,
              thresholdMeters: gpsThreshold
            });
            setIsTracking(true);
            setLiveDistance(0);
          }
        }
      }

      // ── Outside Office Approval Workflow ──
      if (currentTenant?.id && employeeId) {
        const todayDate = timestamp.toISOString().split('T')[0];

        if (entryType === 'IN' && locationData.status === 'Outside Office') {
          // Fetch the timestamp ID we just created
          const { data: createdTs } = await supabase
            .from('attendance_timestamp')
            .select('id')
            .eq('employee_id', employeeId)
            .eq('entry', 'IN')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (createdTs?.id) {
            const approval = await createApproval({
              tenantId: currentTenant.id,
              employeeId,
              timestampId: createdTs.id,
              clockInTime: timestamp.toISOString(),
              attendanceLocation: locationData.address,
            });
            if (approval) {
              setPendingApproval({
                id: approval.id,
                clockInTime: approval.clock_in_time,
                attendanceLocation: approval.attendance_location,
              });
            }
          }
        } else if (entryType === 'OUT') {
          // Auto-update clock_out_time on any open outside-office approval for today
          await updateClockOut(employeeId, todayDate, timestamp.toISOString());
        } else if (entryType === 'IN' && locationData.status === 'Office') {
          // Employee returned to office — record inside_office_clock_in_time
          await updateInsideOfficeClockIn(employeeId, todayDate, timestamp.toISOString());
        }
      }

      setLatestEntryType(entryType);
      setLatestEntryTime(timestamp.toISOString());
      onAttendanceUpdated();
      cachedLocationDataRef.current = null;

      if (manual) {
        setManualMode(false);
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setManualDateTime(now.toISOString().slice(0, 16));
        setManualTransientDateTime(now.toISOString().slice(0, 16));
        setManualReason("");
      }
    } catch (err: any) {
      console.error("ClockInOut Error:", err);
      setError(
        err?.message ||
        (typeof err === 'string' ? err : `Failed to clock ${entryType.toLowerCase()}`)
      );
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  // ── Render ──

  const handleFaceRecognitionSuccess = (verifiedEmployeeId?: string, capturedImageBase64?: string) => {
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
      const finalImageToSave = captureImageEnabled ? capturedImageBase64 : undefined;
      handleClockInOut(latestEntryType !== "IN" ? "IN" : "OUT", false, true, finalImageToSave);
    } else {
      setError("Face verification failed. Identity could not be confirmed.");
    }
  };

  const employeeCannotClock = !canViewAllData && !hasFaceEnrolled && !allowManualClockIn && hasFaceScreens;
  const isOutsideOfficeOpen = latestEntryType === "IN" && latestOfficeStatus === "Outside Office" && !latestOfficeArrivalProcessed;
  const canClockIn = !loading && selectedEmployee &&
    (latestEntryType !== "IN" || (isOutsideOfficeOpen && (manualMode || currentLocationStatus === 'Office'))) &&
    !employeeCannotClock;
  const canClockOut = !loading && selectedEmployee &&
    latestEntryType === "IN" &&
    !(isOutsideOfficeOpen && currentLocationStatus === 'Office') &&
    !employeeCannotClock;

  // NEW: Determines if we should show the Hikvision-only warning
  const showHikWarning = !canViewAllData && hasHikScreens && !hasFaceScreens && !allowManualClockIn;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden relative transition-all duration-500 hover:shadow-[0_16px_48px_rgba(0,0,0,0.08)]">
      {/* Top Accent Border */}
      <div className="h-2 w-full bg-indigo-500"></div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6 mb-6">
          <div className="flex justify-between items-center md:flex-col">
            <div className="flex items-center space-x-2 text-indigo-600 mb-1 sm:mb-1.5">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-base sm:text-sm font-bold uppercase tracking-wider">Current Time</span>
            </div>
            <h3 className="text-2xl sm:text-xl 2xl:text-2xl font-bold text-gray-900 tracking-tight -mt-2 md:mt-0 ml-6">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </h3>
          </div>

          {/* Live Travel Tracking Badge — only show for the employee whose session is active */}
          {isTracking && travelService.getActiveSession()?.employeeId === selectedEmployee?.id && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-3 py-1.5 rounded-full animate-pulse-badge">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <Navigation className="h-3.5 w-3.5" />
              {/* Movement state icon + label */}
              {movementState === 'stationary' && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
                  Idle
                </span>
              )}
              {movementState === 'walking' && (
                <span>🚶 Walking</span>
              )}
              {movementState === 'driving' && (
                <span>🚗 Driving</span>
              )}
              {movementState === 'unknown' && (
                <span>Tracking</span>
              )}
              &nbsp;&mdash;&nbsp;
              {liveDistance >= 1000
                ? `${(liveDistance / 1000).toFixed(2)} km`
                : `${Math.round(liveDistance)} m`}
            </div>
          )}

          {/* Hide toggles until config is loaded to prevent popping */}
          {!isConfigLoading && (canViewAllData || showFaceToggle) && (
            <div className="flex flex-wrap items-center gap-3">
              {canViewAllData && (
                <button
                  onClick={() => setManualMode(!manualMode)}
                  className="h-9 px-4 inline-flex items-center justify-center text-sm font-semibold rounded-lg transition-all duration-200 ease-in-out bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 shadow-sm"
                >
                  {manualMode ? "Switch to Live Mode" : "Switch to Manual Mode"}
                </button>
              )}

              {showFaceToggle && (
                <div
                  className="h-9 inline-flex items-center space-x-2 bg-white px-3 rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setUseFaceRecognition(!useFaceRecognition)}
                >
                  <button
                    type="button"
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${useFaceRecognition ? 'bg-indigo-600' : 'bg-gray-300'
                      }`}
                    role="switch"
                    aria-checked={useFaceRecognition}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useFaceRecognition ? 'translate-x-4' : 'translate-x-0'
                        }`}
                    />
                  </button>
                  <span className="text-sm font-semibold text-gray-700 select-none">Face Auth</span>
                </div>
              )}

              {/* FIX: Removed Enroll/Update Face button per request. */}
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

            {/* Pending Actions Section */}
            {pendingActions.length > 0 && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-amber-100/50 border-b border-amber-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <h4 className="text-sm font-semibold text-amber-900">Pending Actions</h4>
                  </div>
                  <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
                    {pendingActions.length}
                  </span>
                </div>
                <div className="divide-y divide-amber-100">
                  {pendingActions.map(action => (
                    <div key={action.id} className="flex flex-col">
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-amber-900">Outside Office Clock-In</p>
                          <p className="text-xs text-amber-700 mt-1">
                            {new Date(action.clock_in_time).toLocaleString()} • {action.attendance_location || 'Unknown Location'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPendingApproval({
                              id: action.id,
                              clockInTime: action.clock_in_time,
                              attendanceLocation: action.attendance_location
                            })}
                            className="whitespace-nowrap px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                          >
                            Provide Reason
                          </button>
                          <button
                            onClick={() => setCancelConfirmId(action.id)}
                            className="whitespace-nowrap px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg border border-gray-300 transition-colors shadow-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>

                      {/* Inline cancel confirmation warning */}
                      {cancelConfirmId === action.id && (
                        <div className="mx-4 mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-red-800">Are you sure you want to cancel this request?</p>
                              <p className="text-xs text-red-600 mt-0.5">This will permanently delete the outside office approval record and cannot be undone.</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={async () => {
                                try {
                                  await cancelApproval(action.id);
                                  setPendingActions(prev => prev.filter(a => a.id !== action.id));
                                  setCancelConfirmId(null);
                                } catch {
                                  setCancelConfirmId(null);
                                }
                              }}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                            >
                              Yes, Cancel
                            </button>
                            <button
                              onClick={() => setCancelConfirmId(null)}
                              className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg border border-gray-300 transition-colors"
                            >
                              Keep
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Only render the clock in/out actions if they are permitted */}
            {canShowClockInActions && !showHikWarning && (
              manualMode && canViewAllData ? (
                <div className="mt-6 space-y-6">
                  <div className="bg-gray-50/80 p-5 rounded-2xl border border-gray-200/60 shadow-sm">
                    <label
                      htmlFor="manual-datetime"
                      className="block text-sm font-bold text-gray-700 mb-3"
                    >
                      Date and Time
                    </label>
                    <input
                      type="datetime-local"
                      id="manual-datetime"
                      className="block w-full sm:w-fit px-4 py-3 rounded-xl border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all sm:text-sm"
                      value={manualTransientDateTime}
                      onChange={(e) => setManualTransientDateTime(e.target.value)}
                      onBlur={() => setManualDateTime(manualTransientDateTime)}
                    />
                  </div>
                  <div className="bg-gray-50/80 p-5 rounded-2xl border border-gray-200/60 shadow-sm">
                    <label
                      htmlFor="manual-reason"
                      className="block text-sm font-bold text-gray-700 mb-3"
                    >
                      Reason for Manual Entry *
                    </label>
                    <textarea
                      id="manual-reason"
                      rows={3}
                      className="block w-full px-4 py-3 rounded-xl border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all sm:text-sm"
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder="Please provide a detailed reason for manual time entry..."
                      required
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <button
                      onClick={() => handleClockInOut("IN", true)}
                      disabled={!canClockIn}
                      className="flex-1 inline-flex justify-center items-center px-4 py-3 sm:px-5 sm:py-3 border border-transparent rounded-xl shadow-md sm:shadow-lg text-base sm:text-base font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transform transition-all hover:-translate-y-0.5"
                    >
                      {loadingAction === "MANUAL_IN" ? (
                        <Loader2 className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5 animate-spin" />
                      ) : (
                        <LogIn className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5" />
                      )}
                      {loadingAction === "MANUAL_IN" ? "Processing..." : (isOutsideOfficeOpen ? "Manual Clock In (Office)" : "Manual Clock In")}
                    </button>
                    <button
                      onClick={() => handleClockInOut("OUT", true)}
                      disabled={!canClockOut}
                      className="flex-1 inline-flex justify-center items-center px-4 py-3 sm:px-5 sm:py-3 border border-transparent rounded-xl shadow-md sm:shadow-lg text-base sm:text-base font-bold text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-200 disabled:opacity-50 disabled:cursor-not-allowed transform transition-all hover:-translate-y-0.5"
                    >
                      {loadingAction === "MANUAL_OUT" ? (
                        <Loader2 className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5 animate-spin" />
                      ) : (
                        <LogOut className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5" />
                      )}
                      {loadingAction === "MANUAL_OUT" ? "Processing..." : "Manual Clock Out"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 sm:gap-4 mt-4">
                  <button
                    onClick={() => handleClockInOut("IN", false)}
                    disabled={!canClockIn}
                    className="flex-1 inline-flex justify-center items-center px-4 py-3 sm:px-5 sm:py-3 border border-transparent rounded-xl shadow-md sm:shadow-lg text-base sm:text-base font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transform transition-all hover:-translate-y-0.5"
                  >
                    {loadingAction === "IN" ? (
                      <Loader2 className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5 animate-spin" />
                    ) : useFaceRecognition ? (
                      <Camera className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5" />
                    ) : (
                      <LogIn className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5" />
                    )}
                    {loadingAction === "IN" ? "Processing..." : (isOutsideOfficeOpen && currentLocationStatus === 'Office' ? "Clock In (Office)" : "Clock In")}
                  </button>
                  <button
                    onClick={() => handleClockInOut("OUT", false)}
                    disabled={!canClockOut}
                    className="flex-1 inline-flex justify-center items-center px-4 py-3 sm:px-5 sm:py-3 border border-transparent rounded-xl shadow-md sm:shadow-lg text-base sm:text-base font-bold text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-200 disabled:opacity-50 disabled:cursor-not-allowed transform transition-all hover:-translate-y-0.5"
                  >
                    {loadingAction === "OUT" ? (
                      <Loader2 className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5 animate-spin" />
                    ) : useFaceRecognition ? (
                      <Camera className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5" />
                    ) : (
                      <LogOut className="h-5 w-5 mr-2 sm:h-5 sm:w-5 sm:mr-2.5" />
                    )}
                    {loadingAction === "OUT" ? "Processing..." : "Clock Out"}
                  </button>
                </div>
              )
            )}
          </>
        )}

        {latestEntryType && (
          <div className="mt-4 sm:mt-6 p-4 sm:p-5 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 shadow-sm flex items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div>
              <p className="text-xs sm:text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
                Latest Entry Status
              </p>
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className={`h-2.5 w-2.5 sm:h-2.5 sm:w-2.5 rounded-full ${latestEntryType === 'IN' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                <div className="flex flex-col">
                  <p className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">
                    {latestEntryType === "IN" ? "Clocked In" : "Clocked Out"}
                  </p>
                  {latestEntryTime && (
                    <p className="text-sm font-medium text-gray-500 mt-0.5">
                      at {new Date(latestEntryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on {new Date(latestEntryTime).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div
              className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider shadow-sm ${latestEntryType === "IN"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                : "bg-rose-100 text-rose-800 border border-rose-200"
                }`}
            >
              {latestEntryType}
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

      {pendingApproval && selectedEmployee && (
        <OutsideOfficeReasonModal
          approvalId={pendingApproval.id}
          employeeName={selectedEmployee.name}
          clockInTime={pendingApproval.clockInTime}
          attendanceLocation={pendingApproval.attendanceLocation}
          onSubmitted={() => {
            setPendingApproval(null);
            // Re-fetch to remove from pending list once submitted
            if (selectedEmployee) {
              fetchByEmployee(selectedEmployee.id).then((data) => {
                setPendingActions(data.filter(d => d.status === 'pending' && !d.reason));
              });
            }
          }}
          onLater={() => {
            setPendingApproval(null);
            // Re-fetch so the record appears in the Pending Actions section
            if (selectedEmployee) {
              fetchByEmployee(selectedEmployee.id).then((data) => {
                setPendingActions(data.filter(d => d.status === 'pending' && !d.reason));
              });
            }
          }}
        />
      )}
    </div>
  );
}