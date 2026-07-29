import { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle, XCircle, MapPin, User, Calendar, Clock, X, Loader2, 
  ExternalLink, Map as MapIcon, History, PlayCircle, PauseCircle, 
  CheckCircle2, CreditCard as Edit, AlignLeft, AlertTriangle, AlertCircle, 
  ShieldCheck, Navigation, WifiOff, Wifi, Maximize2, Minimize2, Ruler, Gauge,
  Square, CheckSquare, ListChecks, Search, Info, ChevronDown, ChevronUp
} from 'lucide-react';
import { useWorkLocationsStore } from '../../../stores/workLocationsStore';
import { useTenant } from '../../../contexts/TenantContext';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import type { WorkLocation } from '../../../types/workLocation';
import JourneyMapSwitch from './JourneyMapSwitch';
import type { WorkSitePin, PathSegment } from './JourneyLeafletMap';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserEmployeeData } from '../../../lib/roleBasedAccess';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
export interface JourneyGroup {
  id: string;
  employeeName: string;
  employeeCode?: string;
  employeeEmail: string;
  date: string;
  startTime?: string;
  endTime?: string;
  works: WorkLocation[];
}

// --- UTILS ---
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function calculateTotalDistance(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += calculateDistance(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return total;
}

// Speed classification (same thresholds as travelTrackingService)
function classifySpeed(speedMs: number | null | undefined): 'stationary' | 'walking' | 'driving' | 'unknown' {
  if (speedMs == null) return 'unknown';
  if (speedMs < 0.3) return 'stationary';
  if (speedMs < 8) return 'walking';
  return 'driving';
}

// --- REVERSE GEOCODING COMPONENT ---
const geocodeCache: Record<string, string> = {};

function ReverseGeocodeAddress({ lat, lng }: { lat: number; lng: number }) {
  const [address, setAddress] = useState(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`; 
    
    if (geocodeCache[cacheKey]) {
      setAddress(geocodeCache[cacheKey]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchAddress = async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        if (!response.ok) throw new Error('Geocoding failed');
        const data = await response.json();
        
        if (isMounted && data.display_name) {
          const parts = data.display_name.split(', ');
          const shortAddress = parts.slice(0, 3).join(', ');
          
          geocodeCache[cacheKey] = shortAddress;
          setAddress(shortAddress);
        }
      } catch (error) {
        console.error("Error fetching address:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchAddress, Math.random() * 1500);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [lat, lng]);

  return (
    <a 
      href={`https://maps.google.com/?q=$?q=${lat},${lng}`} 
      target="_blank" 
      rel="noreferrer" 
      className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-start gap-1 my-1.5 bg-blue-50/50 p-1.5 rounded"
      title={`Lat: ${lat}, Lng: ${lng}`}
    >
      <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> 
      <span className="line-clamp-2 leading-relaxed">
        {isLoading ? (
          <span className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Fetching location...
          </span>
        ) : (
          address
        )}
      </span>
    </a>
  );
}

export default function TravelAllowanceTab() {
  const { currentTenant } = useTenant();

  const { 
    workLocations, 
    loading, 
    fetchWorkLocations, 
    approveWork, 
    denyWorkLocation,
    updateWorkLocation,
    activeWorkPauses,
    fetchWorkPauses,
    violations,
    fetchViolations
  } = useWorkLocationsStore();

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showViolationsModal, setShowViolationsModal] = useState(false);
  const [showTimelinePings, setShowTimelinePings] = useState(false);
  const [showGroupApprovalModal, setShowGroupApprovalModal] = useState(false);
  const [showGroupDenyModal, setShowGroupDenyModal] = useState(false);
  const [selectedGroupToApprove, setSelectedGroupToApprove] = useState<JourneyGroup | null>(null);
  const [groupDistanceMeters, setGroupDistanceMeters] = useState(0);
  const [groupDurationSeconds, setGroupDurationSeconds] = useState(0);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [groupLocationDetails, setGroupLocationDetails] = useState<Array<{id: string, name: string, distance: number, duration: number}>>([]);
  const [mapModalWorkFilterId, setMapModalWorkFilterId] = useState<string | null>(null);
  
  const [selectedWork, setSelectedWork] = useState<WorkLocation | null>(null);
  const [journeyLogs, setJourneyLogs] = useState<any[]>([]);
  const [workAmount, setWorkAmount] = useState('');
  const [workUnit, setWorkUnit] = useState('');
  const [denyReason, setDenyReason] = useState('');
  const [updateReason, setUpdateReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [pendingPage, setPendingPage] = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);
  const [rejectedPage, setRejectedPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const [allJourneyLogs, setAllJourneyLogs] = useState<any[]>([]);

  // Multi-select state
  const [selectedWorkIds, setSelectedWorkIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAmount, setBulkAmount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { user } = useAuth();
  const { items: employees, fetchEmployees } = useEmployeesStore();
  const [isAdmin, setIsAdmin] = useState(true); // Default to true until checked to avoid layout shifts
  const [isReportingHead, setIsReportingHead] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const { settings, fetchSettings } = useLocationSettingsStore();
  
  useEffect(() => {
    if (currentTenant?.id) {
      fetchSettings(currentTenant.id);
    }
  }, [currentTenant?.id, fetchSettings]);

  useEffect(() => {
    let isMounted = true;
    const checkRole = async () => {
      if (user) {
        const { role, employeeId } = await getUserEmployeeData(user.id);
        if (isMounted) {
          setCurrentEmployeeId(employeeId);
          setIsReportingHead(role?.toLowerCase() === 'reporting head');
          setIsAdmin(role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'hr team');
        }
      }
    };
    checkRole();
    return () => { isMounted = false; };
  }, [user]);

  const subordinateIds = useMemo(() => {
    if (!currentEmployeeId) return [];
    return employees
      .filter(emp => {
        if (!emp.reporting_to) return false;
        const reportingTo = Array.isArray(emp.reporting_to) ? emp.reporting_to : [emp.reporting_to];
        return reportingTo.includes(currentEmployeeId);
      })
      .map(emp => emp.id);
  }, [employees, currentEmployeeId]);

  const visibleWorkLocations = useMemo(() => {
    if (isAdmin) {
      return workLocations;
    }
    if (isReportingHead) {
      return workLocations.filter(wl => subordinateIds.includes(wl.employee_id));
    }
    return workLocations.filter(wl => wl.employee_id === currentEmployeeId);
  }, [workLocations, isAdmin, isReportingHead, subordinateIds, currentEmployeeId]);

  useEffect(() => {
    if (currentTenant) {
      fetchWorkLocations(currentTenant.id);
    }
  }, [currentTenant, fetchWorkLocations]);

  useEffect(() => {
    if (!currentTenant?.id || visibleWorkLocations.length === 0) return;

    const fetchAllLogs = async () => {
      try {
        const dates = visibleWorkLocations.map(w => new Date(w.assignment_date).getTime());
        const minD = new Date(Math.min(...dates));
        minD.setHours(0, 0, 0, 0);
        const maxD = new Date(Math.max(...dates));
        maxD.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
          .from('journey_tracking_logs')
          .select('*')
          .gte('timestamp', minD.toISOString())
          .lte('timestamp', maxD.toISOString())
          .order('timestamp', { ascending: true });

        if (error) throw error;
        
        if (data) {
          const empIds = new Set(visibleWorkLocations.map(w => w.employee_id));
          setAllJourneyLogs(data.filter(l => empIds.has(l.employee_id)));
        }
      } catch (err) {
        console.error("Error fetching all logs:", err);
      }
    };

    fetchAllLogs();
  }, [visibleWorkLocations, currentTenant?.id]);

  useEffect(() => {
    if (!currentTenant?.id) return;

    const channel = supabase
      .channel('approval-page-work-locations')
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

  // Fetch pauses and journey logs for Timeline, Details, MAP, and APPROVAL modals
  useEffect(() => {
    if ((showTimelineModal || showDetailsModal || showMapModal || showApprovalModal) && selectedWork) {
      fetchWorkPauses(selectedWork.id);
      
      const fetchJourneyLogs = async () => {
        try {
          const startOfDay = new Date(selectedWork.assignment_date);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(selectedWork.assignment_date);
          endOfDay.setHours(23, 59, 59, 999);

          // Fetch ALL employee logs for the full day (multi-location support)
          const { data, error } = await supabase
            .from('journey_tracking_logs')
            .select('*')
            .eq('employee_id', selectedWork.employee_id)
            .gte('timestamp', startOfDay.toISOString())
            .lte('timestamp', endOfDay.toISOString())
            .order('timestamp', { ascending: true });
            
          if (error) throw error;

          const allLogs = data || [];
          
          // Partition logs into independent sequences grouped by REACHED_ENDPOINT
          const blocks: typeof allLogs[] = [];
          let currentBlock: typeof allLogs = [];
          
          for (const log of allLogs) {
            currentBlock.push(log);
            if (log.event_type === 'REACHED_ENDPOINT') {
              blocks.push([...currentBlock]);
              currentBlock = [];
            }
          }
          if (currentBlock.length > 0) {
            blocks.push(currentBlock);
          }

          // Find the specific journey block that contains the selected work location
          let activeBlock = blocks.find(b => b.some(l => l.work_location_id === selectedWork.id)) || [];
          
          if (settings?.multi_location_policy === 'separate') {
            activeBlock = activeBlock.filter(l => l.work_location_id === selectedWork.id);
          }

          setJourneyLogs(activeBlock);
        } catch (error) {
          console.error('Error fetching journey logs:', error);
        }
      };
      
      fetchJourneyLogs();
    }
  }, [showTimelineModal, showDetailsModal, showMapModal, showApprovalModal, selectedWork, fetchWorkPauses]);

  useEffect(() => {
    if (showViolationsModal && selectedWork && currentTenant) {
      fetchViolations(currentTenant.id, selectedWork.id);
    }
  }, [showViolationsModal, selectedWork, currentTenant, fetchViolations]);

  const completedWorks = visibleWorkLocations.filter((wl) => wl.status === 'completed');
  const approvedWorks = visibleWorkLocations.filter((wl) => wl.status === 'approved');
  const rejectedWorks = visibleWorkLocations.filter((wl) => wl.status === 'denied' || wl.status === 'rejected');

  const groupWorksByJourney = (works: WorkLocation[], logs: any[]): JourneyGroup[] => {
    const groupedByEmpDate: Record<string, WorkLocation[]> = {};
    works.forEach(w => {
      const key = `${w.employee_id}_${w.assignment_date}`;
      if (!groupedByEmpDate[key]) groupedByEmpDate[key] = [];
      groupedByEmpDate[key].push(w);
    });

    const journeyGroups: JourneyGroup[] = [];

    Object.entries(groupedByEmpDate).forEach(([key, empWorks]) => {
      const [empId, date] = key.split('_');

      const startD = new Date(date); startD.setHours(0,0,0,0);
      const endD = new Date(date); endD.setHours(23,59,59,999);

      const dailyLogs = logs.filter(l => 
        l.employee_id === empId && 
        new Date(l.timestamp) >= startD && 
        new Date(l.timestamp) <= endD
      );

      const blocks: any[][] = [];
      let currBlock: any[] = [];
      dailyLogs.forEach(l => {
        currBlock.push(l);
        if (l.event_type === 'REACHED_ENDPOINT') {
          blocks.push([...currBlock]);
          currBlock = [];
        }
      });
      if (currBlock.length > 0) blocks.push(currBlock);

      let remainingWorks = [...empWorks];

      blocks.forEach((block, bIdx) => {
        const blockLocIds = new Set(block.map(l => l.work_location_id).filter(Boolean));
        const worksInBlock = remainingWorks.filter(w => blockLocIds.has(w.id));

        if (worksInBlock.length > 0) {
          const startLog = block.find(l => l.event_type === 'START_JOURNEY');
          const endLog = block.find(l => l.event_type === 'REACHED_ENDPOINT');

          worksInBlock.sort((a,b) => {
            const aLog = block.find(l => l.work_location_id === a.id && l.event_type === 'START_WORK');
            const bLog = block.find(l => l.work_location_id === b.id && l.event_type === 'START_WORK');
            if (aLog && bLog) return new Date(aLog.timestamp).getTime() - new Date(bLog.timestamp).getTime();
            return 0;
          });

          journeyGroups.push({
            id: `group_${key}_${bIdx}`,
            employeeName: worksInBlock[0].employee_name,
            employeeCode: employees.find(e => e.id === worksInBlock[0].employee_id)?.employee_code,
            employeeEmail: worksInBlock[0].employee_email,
            date: date,
            startTime: startLog?.timestamp,
            endTime: endLog?.timestamp,
            works: worksInBlock
          });
          remainingWorks = remainingWorks.filter(w => !blockLocIds.has(w.id));
        }
      });

      remainingWorks.forEach(w => {
        journeyGroups.push({
          id: `single_${w.id}`,
          employeeName: w.employee_name,
          employeeCode: employees.find(e => e.id === w.employee_id)?.employee_code,
          employeeEmail: w.employee_email,
          date: date,
          startTime: w.started_at || undefined,
          endTime: w.completed_at || undefined,
          works: [w]
        });
      });
    });

    return journeyGroups.sort((a,b) => {
      const d = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (d !== 0) return d;
      const tA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const tB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return tB - tA;
    });
  };

  const pendingGroups = useMemo(() => groupWorksByJourney(completedWorks, allJourneyLogs), [completedWorks, allJourneyLogs]);
  const approvedGroups = useMemo(() => groupWorksByJourney(approvedWorks, allJourneyLogs), [approvedWorks, allJourneyLogs]);
  const rejectedGroups = useMemo(() => groupWorksByJourney(rejectedWorks, allJourneyLogs), [rejectedWorks, allJourneyLogs]);

  const handleOpenApproval = (work: WorkLocation) => {
    setSelectedWork(work);
    
    const method = settings?.travel_allowance_method || 'manual';
    const rate = settings?.travel_allowance_rate || 0;
    
    if (method === 'manual') {
      setWorkAmount('');
    } else if (method === 'fixed') {
      setWorkAmount(rate.toString());
    } else if (method === 'distance') {
      const workLogs = allJourneyLogs.filter(l => l.work_location_id === work.id && l.latitude && l.longitude);
      if (workLogs.length > 0) {
        const coords = workLogs.map(l => [l.latitude, l.longitude] as [number, number]);
        const distanceMeters = calculateTotalDistance(coords);
        const distanceKm = distanceMeters / 1000;
        const amount = Math.round(distanceKm * rate * 100) / 100; // Round to 2 decimal places
        setWorkAmount(amount > 0 ? amount.toString() : '');
      } else {
        setWorkAmount('');
      }
    }
    
    setWorkUnit('');
    setShowApprovalModal(true);
  };

  const handleOpenDetails = (work: WorkLocation) => {
    setSelectedWork(work);
    setWorkAmount(work.work_amount?.toString() || '');
    setWorkUnit(work.work_amount_unit || '');
    setShowDetailsModal(true);
  };

  const handleApprove = async () => {
    if (!selectedWork) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const amount = workAmount ? parseFloat(workAmount) : undefined;
      await approveWork(selectedWork.id, user.id, amount, workUnit || undefined);
      toast.success('Work approved successfully');

      setShowApprovalModal(false);
      setSelectedWork(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve work');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenGroupApproval = (group: JourneyGroup) => {
    setSelectedGroupToApprove(group);
    
    const method = settings?.travel_allowance_method || 'manual';
    const rate = settings?.travel_allowance_rate || 0;
    
    const logsForGroup = allJourneyLogs.filter(l => group.works.some(w => w.id === l.work_location_id));
    const logsWithCoords = logsForGroup.filter(l => l.latitude && l.longitude);
    const coords = logsWithCoords.map(l => [Number(l.latitude), Number(l.longitude)] as [number, number]);
    const distanceMeters = calculateTotalDistance(coords);
    
    setGroupDistanceMeters(distanceMeters);
    
    let durationSec = 0;
    if (logsForGroup.length > 0) {
      const sorted = [...logsForGroup].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const first = new Date(sorted[0].timestamp).getTime();
      const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
      durationSec = (last - first) / 1000;
    }
    setGroupDurationSeconds(durationSec);

    // Calculate individual segment details
    const details = group.works.map(w => {
      const logs = allJourneyLogs.filter(l => l.work_location_id === w.id);
      const wCoords = logs.filter(l => l.latitude && l.longitude).map(l => [Number(l.latitude), Number(l.longitude)] as [number, number]);
      const dist = calculateTotalDistance(wCoords);
      
      let dur = 0;
      if (logs.length > 0) {
        const sorted = [...logs].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const first = new Date(sorted[0].timestamp).getTime();
        const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
        dur = (last - first) / 1000;
      }
      return { id: w.id, name: w.location_name, distance: dist, duration: dur };
    });
    setGroupLocationDetails(details);
    setShowGroupDetails(false);

    if (method === 'manual') {
      setWorkAmount('');
    } else if (method === 'fixed') {
      setWorkAmount(rate.toString());
    } else if (method === 'distance') {
      const distanceKm = distanceMeters / 1000;
      const amount = Math.round(distanceKm * rate * 100) / 100;
      setWorkAmount(amount > 0 ? amount.toString() : '');
    }
    
    setWorkUnit('');
    setShowGroupApprovalModal(true);
  };

  const handleApproveGroupSubmit = async () => {
    if (!selectedGroupToApprove) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const amount = workAmount ? parseFloat(workAmount) : undefined;
      
      // Approve the first work location with the full amount
      await approveWork(selectedGroupToApprove.works[0].id, user.id, amount, workUnit || undefined);
      
      // Approve the rest with 0 amount (to mark them as approved without double paying)
      for (let i = 1; i < selectedGroupToApprove.works.length; i++) {
        await approveWork(selectedGroupToApprove.works[i].id, user.id, 0, undefined);
      }
      
      toast.success('Combined route approved successfully');
      setShowGroupApprovalModal(false);
      setSelectedGroupToApprove(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve combined route');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDenyGroupSubmit = async () => {
    if (!selectedGroupToApprove || !denyReason.trim()) return;

    setSubmitting(true);
    try {
      for (const w of selectedGroupToApprove.works) {
        await denyWorkLocation(w.id, denyReason);
      }
      toast.success('Combined route denied');
      setShowGroupDenyModal(false);
      setSelectedGroupToApprove(null);
      setDenyReason('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to deny combined route');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelectWork = (workId: string) => {
    setSelectedWorkIds(prev => {
      const next = new Set(prev);
      if (next.has(workId)) next.delete(workId);
      else next.add(workId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedWorkIds.size === completedWorks.length) {
      setSelectedWorkIds(new Set());
    } else {
      setSelectedWorkIds(new Set(completedWorks.map(w => w.id)));
    }
  };

  const computeBulkAmount = (): string => {
    const method = settings?.travel_allowance_method || 'manual';
    const rate = settings?.travel_allowance_rate || 0;
    if (method === 'fixed') return rate.toString();
    if (method === 'distance') {
      const total = Array.from(selectedWorkIds).reduce((sum, id) => {
        const logs = allJourneyLogs.filter(l => l.work_location_id === id && l.latitude && l.longitude);
        if (!logs.length) return sum;
        const coords = logs.map(l => [l.latitude, l.longitude] as [number, number]);
        return sum + calculateTotalDistance(coords) / 1000;
      }, 0);
      return (Math.round(total * rate * 100) / 100).toString();
    }
    return '';
  };

  const handleOpenBulkModal = () => {
    setBulkAmount(computeBulkAmount());
    setShowBulkModal(true);
  };

  const handleBulkApprove = async () => {
    if (selectedWorkIds.size === 0) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const ids = Array.from(selectedWorkIds);
      const method = settings?.travel_allowance_method || 'manual';
      const rate = settings?.travel_allowance_rate || 0;
      const amountStr = bulkAmount;
      const parsedAmount = amountStr ? parseFloat(amountStr) : undefined;
      
      // If distance method and the user didn't manually override the computed sum
      if (method === 'distance' && amountStr === computeBulkAmount()) {
        await Promise.all(ids.map(async id => {
          const logs = allJourneyLogs.filter(l => l.work_location_id === id && l.latitude && l.longitude);
          let individualAmount = 0;
          if (logs.length > 0) {
            const coords = logs.map(l => [l.latitude, l.longitude] as [number, number]);
            const distanceMeters = calculateTotalDistance(coords);
            individualAmount = Math.round((distanceMeters / 1000) * rate * 100) / 100;
          }
          await approveWork(id, user.id, individualAmount > 0 ? individualAmount : undefined, undefined);
        }));
      } else {
        await Promise.all(ids.map(id => approveWork(id, user.id, parsedAmount, undefined)));
      }
      
      toast.success(`${ids.length} work assignment${ids.length > 1 ? 's' : ''} approved!`);
      setShowBulkModal(false);
      setSelectedWorkIds(new Set());
    } catch (error: any) {
      toast.error(error.message || 'Bulk approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateEdit = async () => {
    if (!selectedWork) return;

    if (!updateReason.trim()) {
      toast.error('Please provide a reason for updating the amount.');
      return;
    }

    setSubmitting(true);
    try {
      const amount = workAmount ? parseFloat(workAmount) : null;
      await updateWorkLocation(selectedWork.id, {
        work_amount: amount,
        work_amount_update_reason: updateReason, // Stored for admin audit
      });
      toast.success('Work details updated successfully');
      setShowDetailsModal(false);
      setSelectedWork(null);
      setUpdateReason('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update work details');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeny = async () => {
    if (!selectedWork || !denyReason.trim()) return;

    setSubmitting(true);
    try {
      await denyWorkLocation(selectedWork.id, denyReason);
      toast.success('Work assignment denied');
      setShowDenyModal(false);
      setSelectedWork(null);
      setDenyReason('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to deny work');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateDuration = (start: string, end: string) => {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const diff = endTime - startTime;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'approved': return 'bg-purple-100 text-purple-800';
      case 'denied': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredJourneyLogs = useMemo(() => {
    if (!mapModalWorkFilterId) return journeyLogs;
    return journeyLogs.filter(log => log.work_location_id === mapModalWorkFilterId);
  }, [journeyLogs, mapModalWorkFilterId]);

  const timelineEvents = useMemo(() => {
    if (!selectedWork) return [];
    
    const logs: Array<{ status: string, timestamp: string, message: string, lat?: number, lng?: number, locationId?: string, speed_ms?: number | null }> = [];

    if (filteredJourneyLogs && filteredJourneyLogs.length > 0) {
      // For timeline, skip pure LIVE_TRACK noise unless showTimelinePings is true. Always show the last log.
      const filteredLogsForTimeline = filteredJourneyLogs.filter((log, idx, arr) => {
        if (idx === arr.length - 1) return true;
        if (showTimelinePings) return true;
        return !['LIVE_TRACK_JOURNEY', 'LIVE_TRACK_WORK'].includes(log.event_type);
      });
      filteredLogsForTimeline.forEach((log) => {
        let statusStr = log.event_type;
        let msg = '';
        
        // Try to get location name from workLocations store
        const locName = workLocations.find(wl => wl.id === log.work_location_id)?.location_name;
        const locSuffix = locName ? ` — ${locName}` : '';

        switch(log.event_type) {
          case 'START_JOURNEY': statusStr = 'Start Journey'; msg = `Started travel${locSuffix}`; break;
          case 'REACHED_LOCATION': statusStr = 'Reached Location'; msg = `Arrived at destination${locSuffix}`; break;
          case 'START_WORK': statusStr = 'Start Work'; msg = `Work session started${locSuffix}`; break;
          case 'PAUSE_WORK': statusStr = 'Pause Work'; msg = `Work paused${locSuffix}`; break;
          case 'RESUME_WORK': statusStr = 'Resume Work'; msg = `Work session resumed${locSuffix}`; break;
          case 'COMPLETE_WORK': statusStr = 'Complete Work'; msg = `Work session completed${locSuffix}`; break;
          case 'START_RETURN_JOURNEY': statusStr = 'Return Journey'; msg = 'Started return trip'; break;
          case 'REACHED_ENDPOINT': statusStr = 'End Point'; msg = 'Workflow completed for the day'; break;
          case 'LIVE_TRACK_JOURNEY':
          case 'LIVE_TRACK_WORK': statusStr = 'Traveling'; msg = 'Live location update'; break;
          default: statusStr = log.event_type.replace(/_/g, ' '); msg = 'Status logged';
        }

        logs.push({
          status: statusStr,
          timestamp: log.timestamp,
          message: msg,
          lat: log.latitude,
          lng: log.longitude,
          locationId: log.work_location_id,
          speed_ms: log.speed_ms ?? null,
        });
      });
    } else {
      if (selectedWork.started_at) {
        logs.push({ status: 'start', timestamp: selectedWork.started_at, message: 'Work session started' });
      }
      if (activeWorkPauses && activeWorkPauses.length > 0) {
        activeWorkPauses.forEach((pauseRecord) => {
          if (pauseRecord.paused_at) logs.push({ status: 'pause', timestamp: pauseRecord.paused_at, message: `Reason: ${pauseRecord.pause_reason || 'Manual pause'}` });
          if (pauseRecord.resumed_at) logs.push({ status: 'resume', timestamp: pauseRecord.resumed_at, message: 'Work session resumed' });
        });
      }
      if (selectedWork.completed_at) {
        logs.push({ status: 'complete', timestamp: selectedWork.completed_at, message: 'Work session completed' });
      }
    }

    return logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [selectedWork, activeWorkPauses, filteredJourneyLogs, workLocations, showTimelinePings]);

  // Build multi-location map data from all-day logs
  const multiMapData = useMemo(() => {
    if (!selectedWork || journeyLogs.length === 0) return null;

    // Color palette for segments: journey=indigo, work=green, return=orange
    const SEGMENT_PALETTE: Record<string, string> = {
      journey: '#6366f1',
      work: '#059669',
      return: '#f97316',
    };
    const SITE_COLOR_CYCLE = ['red', 'orange', 'gold', 'violet', 'blue'];

    // Collect unique work location IDs in visit order
    const visitedLocationIds: string[] = [];
    journeyLogs.forEach(log => {
      if (log.work_location_id && !visitedLocationIds.includes(log.work_location_id)) {
        visitedLocationIds.push(log.work_location_id);
      }
    });

    // Build work site pins
    const workSites: WorkSitePin[] = visitedLocationIds.map((locId, si) => {
      const wl = workLocations.find(w => w.id === locId);
      return {
        id: locId,
        lat: wl ? Number(wl.latitude) : selectedWork.latitude,
        lng: wl ? Number(wl.longitude) : selectedWork.longitude,
        name: wl?.location_name || `Location ${si + 1}`,
        radiusMeters: wl?.allowed_radius_meters,
        color: SITE_COLOR_CYCLE[si % SITE_COLOR_CYCLE.length],
      };
    });

    // Build path segments by grouping consecutive logs
    const segments: PathSegment[] = [];
    let currentSegmentPoints: { lat: number; lng: number; type: string; time: string }[] = [];
    let currentSegmentType: 'journey' | 'work' | 'return' = 'journey';

    const logsWithCoords = filteredJourneyLogs.filter(log => log.latitude != null && log.longitude != null);

    const labelMap: Record<string, string> = {
      START_JOURNEY: 'Start Journey',
      LIVE_TRACK_JOURNEY: 'Traveling',
      REACHED_LOCATION: 'Reached',
      START_WORK: 'Start Work',
      LIVE_TRACK_WORK: 'Working',
      PAUSE_WORK: 'Paused',
      RESUME_WORK: 'Resumed',
      COMPLETE_WORK: 'Complete',
      START_RETURN_JOURNEY: 'Return',
      REACHED_ENDPOINT: 'End Point',
      GPS_SIGNAL_LOST: 'Offline / Signal Lost',
      GPS_SIGNAL_RESTORED: 'Online / Signal Restored',
    };

    logsWithCoords.forEach((log, i) => {
      let segType: 'journey' | 'work' | 'return' = currentSegmentType;

      if (['START_JOURNEY', 'LIVE_TRACK_JOURNEY', 'REACHED_LOCATION'].includes(log.event_type)) {
        segType = 'journey';
      } else if (['START_WORK', 'LIVE_TRACK_WORK', 'RESUME_WORK', 'PAUSE_WORK', 'COMPLETE_WORK'].includes(log.event_type)) {
        segType = 'work';
      } else if (['START_RETURN_JOURNEY', 'REACHED_ENDPOINT'].includes(log.event_type)) {
        segType = 'return';
      }
      // For GPS_SIGNAL_LOST and RESTORED, we intentionally do NOT change the segType,
      // so the map continues drawing the line in the color of whatever they were doing.

      // If segment type changed, flush current and start new
      if (segType !== currentSegmentType && currentSegmentPoints.length >= 1) {
        // Add the last point of current segment as first of new (continuity)
        segments.push({
          points: [...currentSegmentPoints],
          color: SEGMENT_PALETTE[currentSegmentType],
          label: currentSegmentType,
        });
        currentSegmentPoints = [currentSegmentPoints[currentSegmentPoints.length - 1]];
        currentSegmentType = segType;
      }

      currentSegmentPoints.push({
        lat: Number(log.latitude),
        lng: Number(log.longitude),
        type: labelMap[log.event_type] || log.event_type.replace(/_/g, ' '),
        time: new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      });
    });

    // Flush last segment
    if (currentSegmentPoints.length >= 1) {
      segments.push({
        points: currentSegmentPoints,
        color: SEGMENT_PALETTE[currentSegmentType],
        label: currentSegmentType,
      });
    }

    // Flatten points for markers, filtering out LIVE_TRACK noise unless showTimelinePings is true
    const allPoints = logsWithCoords
      .filter((log, idx, arr) => {
        if (idx === arr.length - 1) return true;
        if (showTimelinePings) return true;
        return !['LIVE_TRACK_JOURNEY', 'LIVE_TRACK_WORK'].includes(log.event_type);
      })
      .map(log => ({
        lat: Number(log.latitude),
        lng: Number(log.longitude),
        type: labelMap[log.event_type] || log.event_type.replace(/_/g, ' '),
        time: new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        locationId: log.work_location_id
      }));

    return { allPoints, segments, workSites };
  }, [selectedWork, journeyLogs, filteredJourneyLogs, workLocations, showTimelinePings]);

  // Global Journey Stats
  const journeyCoords = useMemo(() => {
    return filteredJourneyLogs.filter(log => log.latitude != null && log.longitude != null).map(log => [Number(log.latitude), Number(log.longitude)] as [number, number]);
  }, [filteredJourneyLogs]);

  const totalDistanceMeters = useMemo(() => calculateTotalDistance(journeyCoords), [journeyCoords]);

  const totalDurationSeconds = useMemo(() => {
    if (filteredJourneyLogs.length === 0) return 0;
    const firstLogTime = new Date(filteredJourneyLogs[0].timestamp).getTime();
    const lastLogTime = new Date(filteredJourneyLogs[filteredJourneyLogs.length - 1].timestamp).getTime();
    return (lastLogTime - firstLogTime) / 1000;
  }, [filteredJourneyLogs]);

  const avgSpeedKmh = useMemo(() => {
    return totalDurationSeconds > 0 ? ((totalDistanceMeters / 1000) / (totalDurationSeconds / 3600)).toFixed(1) : '0.0';
  }, [totalDistanceMeters, totalDurationSeconds]);

  const maxSpeedKmh = useMemo(() => {
    return filteredJourneyLogs.length > 0 ? Math.max(...filteredJourneyLogs.map(l => (l.speed_ms != null ? l.speed_ms : 0))) * 3.6 : 0;
  }, [filteredJourneyLogs]);

  const getTimelineIcon = (status: string, isFirst: boolean, isLast: boolean) => {
    const iconClass = "h-4 w-4 drop-shadow-sm mt-0.5";
    if (isFirst) return <MapPin className={`${iconClass} text-green-500`} fill="currentColor" stroke="white" strokeWidth={1.5} />;
    if (isLast) return <MapPin className={`${iconClass} text-violet-500`} fill="currentColor" stroke="white" strokeWidth={1.5} />;
    
    const s = status.toLowerCase();
    if (s.includes('traveling') || s.includes('travel')) return <div className="h-2 w-2 mt-1.5 ml-[3px] rounded-full bg-indigo-500 ring-2 ring-white shadow-sm" />;
    
    if (s.includes('offline') || s.includes('lost')) return <MapPin className={`${iconClass} text-red-500`} fill="currentColor" stroke="white" strokeWidth={1.5} />;
    return <MapPin className={`${iconClass} text-blue-500`} fill="currentColor" stroke="white" strokeWidth={1.5} />;
  };

  if (loading && workLocations.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Search filter helper
  const filterGroups = (groups: JourneyGroup[]) => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.trim().toLowerCase();
    return groups.filter(g =>
      g.employeeName.toLowerCase().includes(q) ||
      g.employeeEmail.toLowerCase().includes(q) ||
      (g.employeeCode?.toLowerCase() || '').includes(q) ||
      g.works.some(w =>
        w.location_name.toLowerCase().includes(q) ||
        (w.formatted_address?.toLowerCase() || '').includes(q)
      )
    );
  };

  // Paginated slices
  const filteredPendingGroups = filterGroups(pendingGroups);
  const filteredApprovedGroups = filterGroups(approvedGroups);
  const filteredRejectedGroups = filterGroups(rejectedGroups);

  const pendingTotalPages = Math.max(1, Math.ceil(filteredPendingGroups.length / ITEMS_PER_PAGE));
  const approvedTotalPages = Math.max(1, Math.ceil(filteredApprovedGroups.length / ITEMS_PER_PAGE));
  const rejectedTotalPages = Math.max(1, Math.ceil(filteredRejectedGroups.length / ITEMS_PER_PAGE));
  
  const paginatedPendingGroups = filteredPendingGroups.slice((pendingPage - 1) * ITEMS_PER_PAGE, pendingPage * ITEMS_PER_PAGE);
  const paginatedApprovedGroups = filteredApprovedGroups.slice((approvedPage - 1) * ITEMS_PER_PAGE, approvedPage * ITEMS_PER_PAGE);
  const paginatedRejectedGroups = filteredRejectedGroups.slice((rejectedPage - 1) * ITEMS_PER_PAGE, rejectedPage * ITEMS_PER_PAGE);

  const handleTabChange = (tab: 'pending' | 'approved' | 'rejected') => {
    setActiveTab(tab);
  };

  const renderPagination = (
    currentPage: number,
    totalPages: number,
    onPrev: () => void,
    onNext: () => void
  ) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
        <span className="text-sm text-gray-500">Page {currentPage} of {totalPages}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={currentPage === 1}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => {
                  if (activeTab === 'pending') setPendingPage(p);
                  else setApprovedPage(p);
                }}
                className={`w-8 h-8 text-sm font-semibold rounded-lg transition-colors ${
                  p === currentPage
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={onNext}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  const renderJourneyGroup = (group: JourneyGroup, tabType: 'pending' | 'approved' | 'rejected') => {
    const isPending = tabType === 'pending';
    const isRejected = tabType === 'rejected';
    const isApproved = tabType === 'approved';

    return (
      <div key={group.id} className=" hover:bg-gray-50/70 transition-colors py-4 border-b border-dashed border-gray-500 last:border-b-0">
        <div className="flex flex-col gap-4 sm:gap-5">
          {/* Group Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${
                isPending ? 'bg-amber-100 text-amber-700' : isRejected ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {group.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">{group.employeeName}</h3>
                {group.employeeCode && (
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold border border-gray-200">
                    {group.employeeCode}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">{group.employeeEmail}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold whitespace-nowrap">
              <Calendar className="h-3 w-3" />
              {format(new Date(group.date), 'MMM d, yyyy')}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
              {group.works.length} location{group.works.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Group Approval Action (Combine Mode) */}
        {settings?.multi_location_policy === 'combine' && isPending && group.works.length > 1 && (
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ml-0 sm:ml-2 mt-2">
            <div>
              <div className="text-sm font-semibold text-blue-900">Combined Route Approval</div>
              <div className="text-xs text-blue-700 mt-0.5">Approve or deny this multi-location route as a single travel allowance.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setSelectedWork(group.works[0]); setShowMapModal(true); }}
                className="px-3 py-1.5 bg-white hover:bg-gray-50 text-indigo-700 border border-indigo-200 text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <MapIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setSelectedWork(group.works[0]); setShowTimelineModal(true); }}
                className="px-3 py-1.5 bg-white hover:bg-gray-50 text-purple-700 border border-purple-200 text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <History className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setSelectedWork(group.works[0]); setShowViolationsModal(true); }}
                className="p-1.5 bg-white hover:bg-gray-50 text-orange-700 border border-orange-200 rounded-lg shadow-sm transition-colors"
                title="Violations"
              >
                <AlertTriangle className="h-4 w-4" />
              </button>
              <div className="w-px h-6 bg-blue-200 mx-1 hidden sm:block"></div>
              <button
                onClick={() => {
                  setSelectedGroupToApprove(group);
                  setDenyReason('');
                  setShowGroupDenyModal(true);
                }}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <XCircle className="h-4 w-4" /> Deny
              </button>
              <button
                onClick={() => handleOpenGroupApproval(group)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <CheckCircle className="h-4 w-4" /> Approve
              </button>
            </div>
          </div>
        )}

        {/* Location Cards */}
        <div className="space-y-3 pl-0 sm:pl-2">
          {group.works.map(work => (
            <div
              key={work.id}
              className={`rounded-xl border p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 relative overflow-hidden transition-all ${
                isPending
                  ? selectedWorkIds.has(work.id)
                    ? 'bg-amber-50 border-amber-400 shadow-sm ring-1 ring-amber-300'
                    : 'bg-white border-gray-400 shadow-sm'
                  : isRejected
                    ? 'bg-red-50 border-red-100 shadow-sm'
                    : 'bg-emerald-50/40 border-emerald-100 shadow-sm'
              }`}
            >

              <div className="flex-1">
                <div className="flex items-start gap-2 mb-2">
                  {isPending && !(settings?.multi_location_policy === 'combine' && group.works.length > 1) && (
                    <button
                      onClick={() => toggleSelectWork(work.id)}
                      className="flex-shrink-0 mt-0.5 text-amber-500 hover:text-amber-700 transition-colors"
                      title={selectedWorkIds.has(work.id) ? 'Deselect' : 'Select for bulk approval'}
                    >
                      {selectedWorkIds.has(work.id)
                        ? <CheckSquare className="h-4 w-4" />
                        : <Square className="h-4 w-4" />}
                    </button>
                  )}
                  <div className="flex flex-col gap-2">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-700">Company Name</span>
                      <div className="font-semibold text-gray-900 text-sm">{work.location_name}</div>
                    </div>
                    {work.formatted_address && (
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-700">Location Name</span>
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{work.formatted_address}</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ml-6 flex flex-wrap items-center gap-3 text-xs">
                
                  {work.work_amount != null && Number(work.work_amount) > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full font-semibold">
                      ₹{Number(work.work_amount).toLocaleString('en-IN')} Travel Allowance
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 shrink-0 w-full xl:w-auto border-t xl:border-t-0 pt-3 xl:pt-0 border-gray-100 mt-2 xl:mt-0">
                {isPending && !(settings?.multi_location_policy === 'combine' && group.works.length > 1) && (
                  <button
                    onClick={() => handleOpenApproval(work)}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> Approve
                  </button>
                )}
                {!isPending && !isRejected && (
                  <button
                    onClick={() => handleOpenDetails(work)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-100 rounded-lg transition-colors"
                    title="Edit Amount"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                )}
                {isRejected && (
                  <button
                    onClick={() => handleOpenDetails(work)}
                    className="p-1.5 text-gray-600 hover:bg-gray-50 border border-gray-100 rounded-lg transition-colors"
                    title="View Details"
                  >
                    <AlignLeft className="h-4 w-4" />
                  </button>
                )}
                {!(settings?.multi_location_policy === 'combine' && group.works.length > 1) && (
                  <>
                    <button
                      onClick={() => { setSelectedWork(work); setShowMapModal(true); }}
                      className="p-1.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-100 rounded-lg transition-colors"
                      title="View Map"
                    >
                      <MapIcon className="h-4 w-4" />
                    </button>
                    {isPending && (
                      <button
                        onClick={() => { setSelectedWork(work); setShowTimelineModal(true); }}
                        className="p-1.5 text-purple-600 hover:bg-purple-50 border border-purple-100 rounded-lg transition-colors"
                        title="Timeline"
                      >
                        <History className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedWork(work); setShowViolationsModal(true); }}
                      className="p-1.5 text-orange-600 hover:bg-orange-50 border border-orange-100 rounded-lg transition-colors"
                      title="Violations"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </button>
                  </>
                )}
                {isPending && !(settings?.multi_location_policy === 'combine' && group.works.length > 1) && (
                  <button
                    onClick={() => { setSelectedWork(work); setDenyReason(''); setShowDenyModal(true); }}
                    className="p-1.5 text-red-600 hover:bg-red-50 border border-red-100 rounded-lg transition-colors"
                    title="Deny"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

  return (
    <div className="space-y-6">

      {/* ─── Page Header ─── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Work Location Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve completed work assignments</p>
        </div>
      </div>

      {/* ─── Tab Bar + Search ─── */}
      <div className="flex flex-col  sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-full sm:w-fit overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth">
        <button
          onClick={() => handleTabChange('pending')}
          className={`flex-shrink-0 flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === 'pending'
              ? 'bg-white text-amber-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
            activeTab === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
          }`}>{completedWorks.length}</span>
          Pending
        </button>
        <button
          onClick={() => handleTabChange('approved')}
          className={`flex-shrink-0 flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === 'approved'
              ? 'bg-white text-green-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
            activeTab === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
          }`}>{approvedWorks.length}</span>
          Approved
        </button>
        <button
          onClick={() => handleTabChange('rejected')}
          className={`flex-shrink-0 flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === 'rejected'
              ? 'bg-white text-red-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
            activeTab === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
          }`}>{rejectedWorks.length}</span>
          Rejected
        </button>
        </div>
        {/* Search Bar */}
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPendingPage(1); setApprovedPage(1); setRejectedPage(1); }}
            placeholder="Search by employee, location..."
            className="pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 w-full sm:w-72 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setPendingPage(1); setApprovedPage(1); setRejectedPage(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Tab Content ─── */}
      <div className="bg-white md:rounded-2xl  border-gray-200 md:shadow-sm overflow-hidden">

        {/* PENDING TAB */}
        {activeTab === 'pending' && (
          <>
            {completedWorks.length === 0 ? (
              <div className="text-center py-20 px-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">All caught up!</h3>
                <p className="text-gray-500 text-sm">No work assignments are waiting for your review.</p>
              </div>
            ) : (
              <>
                {/* Select All bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4  py-3 border-b border-gray-500 bg-gray-50">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-amber-700 transition-colors"
                  >
                    {selectedWorkIds.size === completedWorks.length && completedWorks.length > 0
                      ? <CheckSquare className="h-4 w-4 text-amber-500" />
                      : <Square className="h-4 w-4 text-gray-400" />}
                    {selectedWorkIds.size === completedWorks.length && completedWorks.length > 0
                      ? 'Deselect All'
                      : `Select All (${completedWorks.length})`}
                  </button>
                  {selectedWorkIds.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-700 font-semibold bg-amber-100 px-2.5 py-1.5 rounded-full mr-1">
                        {selectedWorkIds.size} selected
                      </span>
                      <button
                        onClick={handleOpenBulkModal}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve Selected
                      </button>
                      <button
                        onClick={() => setSelectedWorkIds(new Set())}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <X className="h-4 w-4" />
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                {paginatedPendingGroups.map(group => renderJourneyGroup(group, 'pending'))}
                {renderPagination(
                  pendingPage,
                  pendingTotalPages,
                  () => setPendingPage(p => Math.max(1, p - 1)),
                  () => setPendingPage(p => Math.min(pendingTotalPages, p + 1))
                )}
              </>
            )}
          </>
        )}

        {/* APPROVED TAB */}
        {activeTab === 'approved' && (() => {
          const totalApprovedAmount = approvedWorks.reduce((sum, w) => sum + (Number(w.work_amount) || 0), 0);
          const uniqueApprovedEmployees = new Set(approvedWorks.map(w => w.employee_id)).size;
          const approvedWithAmount = approvedWorks.filter(w => Number(w.work_amount) > 0).length;
          return (
            <>
              {approvedWorks.length === 0 ? (
                <div className="text-center py-20 px-6">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">No approved work yet</h3>
                  <p className="text-gray-500 text-sm">Approved work assignments will appear here.</p>
                </div>
              ) : (
                <>
                  {/* ─── Stats Bar ─── */}
                  <div className="grid grid-cols-3 gap-0 border-b border-gray-100 bg-gradient-to-r from-green-50/60 via-emerald-50/40 to-teal-50/60">
                    <div className="flex flex-col items-center justify-center py-4 px-3 border-r border-green-100">
                      <div className="text-2xl font-bold text-gray-900">{uniqueApprovedEmployees}</div>
                      <div className="text-xs font-medium text-gray-500 mt-0.5 flex items-center gap-1">
                        <User className="h-3 w-3" /> Employees
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center py-4 px-3 border-r border-green-100">
                      <div className="text-2xl font-bold text-gray-900">{approvedWorks.length}</div>
                      <div className="text-xs font-medium text-gray-500 mt-0.5 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" /> Approvals
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center py-4 px-3">
                      <div className="text-2xl font-bold text-emerald-700">
                        ₹{totalApprovedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs font-medium text-gray-500 mt-0.5 flex items-center gap-1">
                        <span className="text-emerald-500 font-bold text-xs">₹</span> Total Allowance
                        {approvedWithAmount < approvedWorks.length && (
                          <span className="text-gray-400">({approvedWorks.length - approvedWithAmount} without amount)</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {paginatedApprovedGroups.map(group => renderJourneyGroup(group, 'approved'))}
                  {renderPagination(
                    approvedPage,
                    approvedTotalPages,
                    () => setApprovedPage(p => Math.max(1, p - 1)),
                    () => setApprovedPage(p => Math.min(approvedTotalPages, p + 1))
                  )}
                </>
              )}
            </>
          );
        })()}


        {/* REJECTED TAB */}
        {activeTab === 'rejected' && (
          <>
            {rejectedWorks.length === 0 ? (
              <div className="text-center py-20 px-6">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <XCircle className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No rejected work</h3>
                <p className="text-gray-500 text-sm">Rejected work assignments will appear here.</p>
              </div>
            ) : (
              <>
                {paginatedRejectedGroups.map(group => renderJourneyGroup(group, 'rejected'))}
                {renderPagination(
                  rejectedPage,
                  rejectedTotalPages,
                  () => setRejectedPage(p => Math.max(1, p - 1)),
                  () => setRejectedPage(p => Math.min(rejectedTotalPages, p + 1))
                )}
              </>
            )}
          </>
        )}

      </div>


      {/* ─── BULK APPROVAL MODAL ─── */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-bold text-gray-900">Bulk Approve</h2>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <CheckSquare className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-amber-800">{selectedWorkIds.size} work assignment{selectedWorkIds.size > 1 ? 's' : ''} selected</div>
                  <div className="text-xs text-amber-600 mt-0.5">
                    {settings?.travel_allowance_method === 'distance' 
                      ? "Each location will receive its own individual distance calculation."
                      : "The same travel allowance will be applied to all selected items."}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {settings?.travel_allowance_method === 'distance' ? "Total Sum (For Reference) (₹)" : "Travel Allowance Amount (₹)"}
                  {settings?.travel_allowance_method === 'distance' && (
                    <span className="ml-2 text-xs text-blue-600 font-normal">(Combined from all GPS tracks)</span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bulkAmount}
                  onChange={e => setBulkAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Leave blank to approve without allowance"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  {settings?.travel_allowance_method === 'manual' && 'Manual mode: enter the receipt-based amount.'}
                  {settings?.travel_allowance_method === 'fixed' && `Fixed mode: flat ₹${settings.travel_allowance_rate} per journey pre-filled.`}
                  {settings?.travel_allowance_method === 'distance' && `Distance mode: combined GPS distance × ₹${settings.travel_allowance_rate}/km.`}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkApprove}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Approving...</>
                  ) : (
                    <><CheckCircle className="h-4 w-4" /> Approve {selectedWorkIds.size} Item{selectedWorkIds.size > 1 ? 's' : ''}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GROUP DENY MODAL */}
      {showGroupDenyModal && selectedGroupToApprove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Deny Combined Route</h2>
              <button onClick={() => { setShowGroupDenyModal(false); setSelectedGroupToApprove(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 p-3 rounded-lg border border-red-100 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-red-800">Deny Full Route</h4>
                  <p className="text-xs text-red-700 mt-1">
                    You are denying all <strong>{selectedGroupToApprove.works.length} locations</strong> in this route for {selectedGroupToApprove.employeeName}.
                  </p>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Denial</label>
                <textarea
                  rows={3}
                  value={denyReason}
                  onChange={e => setDenyReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="e.g., Journey path looks invalid..."
                />
              </div>
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => { setShowGroupDenyModal(false); setSelectedGroupToApprove(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDenyGroupSubmit}
                  disabled={submitting || !denyReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  {submitting ? 'Denying...' : 'Deny'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GROUP APPROVAL MODAL (Combine Mode) */}
      {showGroupApprovalModal && selectedGroupToApprove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Approve Combined Route</h2>
              <button onClick={() => { setShowGroupApprovalModal(false); setSelectedGroupToApprove(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-800">Combined Route Approval</h4>
                  <p className="text-xs text-amber-700 mt-1">
                    You are approving <strong>{selectedGroupToApprove.works.length} locations</strong> for {selectedGroupToApprove.employeeName}. 
                    The full travel allowance will be added to the first location, and the others will be marked as approved without duplicating the allowance.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Total Route Distance</p>
                  <p className="text-lg font-bold text-gray-900">{formatDistance(groupDistanceMeters)}</p>
                </div>
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Total Duration</p>
                  <p className="text-lg font-bold text-gray-900">{formatDuration(groupDurationSeconds)}</p>
                </div>
              </div>

              <div className="flex justify-between items-center px-1">
                <button
                  onClick={() => setShowGroupDetails(!showGroupDetails)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                >
                  {showGroupDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showGroupDetails ? 'Hide' : 'Show'} Segment Details
                </button>
              </div>

              {showGroupDetails && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2 mt-2 max-h-40 overflow-y-auto">
                  {groupLocationDetails.map(loc => (
                    <div key={loc.id} className="flex items-center justify-between text-xs py-0.5">
                      <span className="font-medium text-gray-700 truncate pr-2 flex-1" title={loc.name}>
                        {loc.name}
                      </span>
                      <div className="flex items-center gap-4 text-gray-500 font-medium shrink-0">
                        <span className="flex items-center gap-1.5 justify-end w-20 whitespace-nowrap">
                          <Ruler className="h-3.5 w-3.5 shrink-0 text-gray-400" /> {formatDistance(loc.distance)}
                        </span>
                        <span className="flex items-center gap-1.5 justify-end w-20 whitespace-nowrap">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" /> {formatDuration(loc.duration)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Combined Travel Allowance Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={workAmount}
                  onChange={(e) => setWorkAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="e.g. 500"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => { setShowGroupApprovalModal(false); setSelectedGroupToApprove(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveGroupSubmit}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Approving...</>
                  ) : (
                    <><CheckCircle className="h-4 w-4" /> Approve Route</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* APPROVAL MODAL */}
      {showApprovalModal && selectedWork && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Approve Work</h2>
              <button onClick={() => { setShowApprovalModal(false); setSelectedWork(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Employee</div>
                <div className="text-base text-gray-900 flex items-center gap-2">
                  {selectedWork.employee_name}
                  {employees.find(e => e.id === selectedWork.employee_id)?.employee_code && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold border border-gray-200">
                      {employees.find(e => e.id === selectedWork.employee_id)?.employee_code}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Company Name</div>
                <div className="text-base text-gray-900">{selectedWork.location_name}</div>
                {selectedWork.formatted_address && (
                  <div className="mt-3">
                    <div className="text-sm font-medium text-gray-700 mb-1">Address</div>
                    <div className="text-sm text-gray-600">{selectedWork.formatted_address}</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Distance Traveled</p>
                  <p className="text-lg font-bold text-gray-900">{formatDistance(totalDistanceMeters)}</p>
                </div>
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Duration</p>
                  <p className="text-lg font-bold text-gray-900">{formatDuration(totalDurationSeconds)}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Travel Allowance Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={workAmount}
                  onChange={(e) => setWorkAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="e.g. 500"
                />
                <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                  This amount will be auto-added as a Travel Allowance earning in payroll.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => { setShowApprovalModal(false); setSelectedWork(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Approve Work
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMPREHENSIVE DETAILS & EDIT MODAL */}
      {showDetailsModal && selectedWork && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                Work Assignment Details
              </h2>
              <button onClick={() => { setShowDetailsModal(false); setSelectedWork(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8 flex-1">
              {/* Info Grid Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-5 rounded-lg border border-gray-100">
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1"><User className="h-4 w-4"/> Employee</div>
                  <div className="text-base text-gray-900 font-medium flex items-center gap-2">
                    {selectedWork.employee_name}
                    {employees.find(e => e.id === selectedWork.employee_id)?.employee_code && (
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold border border-gray-200">
                        {employees.find(e => e.id === selectedWork.employee_id)?.employee_code}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">{selectedWork.employee_email}</div>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1"><MapPin className="h-4 w-4"/> Company Name</div>
                  <div className="text-base text-gray-900 font-medium">{selectedWork.location_name}</div>
                  {selectedWork.formatted_address && (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-gray-500 mb-0.5">Address</div>
                      <div className="text-sm text-gray-600 line-clamp-2">{selectedWork.formatted_address}</div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1"><Calendar className="h-4 w-4"/> Date Assigned</div>
                  <div className="text-base text-gray-900">{format(new Date(selectedWork.assignment_date), 'MMMM d, yyyy')}</div>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1"><Clock className="h-4 w-4"/> Total Tracking Time</div>
                  {selectedWork.started_at && selectedWork.completed_at ? (
                    <>
                      <div className="text-base text-gray-900 font-medium">
                        {calculateDuration(selectedWork.started_at, selectedWork.completed_at)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(selectedWork.started_at), 'hh:mm a')} - {format(new Date(selectedWork.completed_at), 'hh:mm a')}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500 text-sm">Not tracked</div>
                  )}
                </div>
              </div>

              {/* Description Section */}
              <div>
                <h3 className="text-md font-semibold text-gray-900 mb-2 flex items-center gap-2"><AlignLeft className="h-4 w-4" /> Work Description</h3>
                <div className="text-sm text-gray-800 bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
                  {selectedWork.work_description}
                </div>
              </div>

              {/* Timeline Section */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-md font-semibold text-gray-900 flex items-center gap-2"><History className="h-4 w-4"/> Activity Timeline</h3>
                  <button 
                    onClick={() => setShowTimelinePings(!showTimelinePings)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {showTimelinePings ? 'Hide Pings' : 'Show Pings'}
                  </button>
                </div>
                {timelineEvents.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg border border-gray-100">
                    <Clock className="h-5 w-5 mx-auto mb-1 opacity-50" />
                    No tracking activity recorded
                  </div>
                ) : (
                  <div className="relative border-l-2 border-gray-200 ml-3 space-y-6">
                    {timelineEvents.map((log, index) => (
                      <div key={index} className="relative pl-6">
                        <span className="absolute -left-[5px] top-1">
                          {getTimelineIcon(log.status, index === 0, index === timelineEvents.length - 1)}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-900 capitalize">
                            {log.status}
                          </span>
                          <span className="text-sm text-gray-700 my-0.5">
                            {log.message}
                          </span>
                          {log.lat && log.lng && (
                            <ReverseGeocodeAddress lat={log.lat} lng={log.lng} />
                          )}
                          <span className="text-xs text-gray-500">
                            {format(new Date(log.timestamp), 'MMM d, yyyy - hh:mm:ss a')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Editable Footer Section */}
            <div className="p-6 border-t border-gray-200 shrink-0 bg-gray-50 rounded-b-lg">
              <h3 className="text-md font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Edit className="h-4 w-4 text-gray-500" />
                Update Approved Amount
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={workAmount}
                    onChange={(e) => setWorkAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. 50"
                  />
                </div>
                {/* <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={workUnit}
                    onChange={(e) => setWorkUnit(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. sq ft, items, hours"
                  />
                </div> */}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Update <span className="text-red-500">*</span></label>
                <textarea
                  value={updateReason}
                  onChange={(e) => setUpdateReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none h-20"
                  placeholder="e.g., Fixing incorrect travel allowance approved earlier..."
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => { setShowDetailsModal(false); setSelectedWork(null); }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  disabled={submitting}
                >
                  Close
                </button>
                <button
                  onClick={handleUpdateEdit}
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DENY MODAL */}
      {showDenyModal && selectedWork && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Deny Work</h2>
              <button onClick={() => { setShowDenyModal(false); setSelectedWork(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                You are about to deny the work submitted by <strong className="inline-flex items-center gap-1.5">
                  {selectedWork.employee_name}
                  {employees.find(e => e.id === selectedWork.employee_id)?.employee_code && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold border border-gray-200">
                      {employees.find(e => e.id === selectedWork.employee_id)?.employee_code}
                    </span>
                  )}
                </strong>. Please provide a reason below.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Denial <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="Enter reason..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 min-h-[100px]"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => { setShowDenyModal(false); setSelectedWork(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeny}
                  disabled={submitting || !denyReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Denying...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      Confirm Deny
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW VIOLATIONS MODAL */}
      {showViolationsModal && selectedWork && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0 bg-orange-50 rounded-t-lg">
              <h2 className="text-xl font-bold text-orange-800 flex items-center gap-2">
                <AlertCircle className="h-6 w-6" />
                Radius Violations History
              </h2>
              <button onClick={() => { setShowViolationsModal(false); setSelectedWork(null); }} className="text-orange-400 hover:text-orange-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6 bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-600"/> 
                  {selectedWork.employee_name}
                  {employees.find(e => e.id === selectedWork.employee_id)?.employee_code && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold border border-gray-200">
                      {employees.find(e => e.id === selectedWork.employee_id)?.employee_code}
                    </span>
                  )}
                </h3>
                <div className="mt-2 text-sm text-gray-600 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><span className="font-medium text-gray-500">Location:</span> {selectedWork.location_name}</div>
                  <div><span className="font-medium text-gray-500">Allowed Radius:</span> {selectedWork.allowed_radius_meters}m</div>
                </div>
              </div>
              
              {loading && violations.length === 0 ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                </div>
              ) : violations.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-gray-200 border-dashed">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-80" />
                  <p className="text-lg font-medium text-gray-900">No violations recorded</p>
                  <p className="text-sm mt-1">The employee stayed within the allowed radius.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {violations.map((violation) => (
                    <div key={violation.id} className="bg-red-50 border border-red-100 rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
                      <div>
                        <div className="font-semibold text-red-800 capitalize flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          {violation.violation_type.replace('_', ' ')}
                        </div>
                        <div className="text-sm text-red-700 mt-1.5 font-medium">
                          Distance from center: {violation.distance_from_center >= 1000 ? (violation.distance_from_center / 1000).toFixed(2) + ' km' : violation.distance_from_center + ' m'}
                        </div>
                        <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {violation.latitude.toFixed(6)}, {violation.longitude.toFixed(6)}
                        </div>
                      </div>
                      <div className="text-left sm:text-right w-full sm:w-auto border-t sm:border-t-0 border-red-200 pt-3 sm:pt-0">
                        <div className="text-sm font-bold text-red-900">
                          {format(new Date(violation.violated_at || violation.created_at), 'MMM d, yyyy')}
                        </div>
                        <div className="text-xs font-medium text-red-700 mt-0.5">
                          {format(new Date(violation.violated_at || violation.created_at), 'hh:mm:ss a')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 shrink-0 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => { setShowViolationsModal(false); setSelectedWork(null); }}
                className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors shadow-sm"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAP MODAL — Journey Path View */}
      {showMapModal && selectedWork && (
        <div className={`fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-4'}`}>
          <div className={`bg-white shadow-2xl w-full flex flex-col overflow-hidden ${isFullscreen ? 'h-full max-w-full rounded-none' : 'max-w-4xl max-h-[90vh] rounded-2xl'}`}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex h-9 w-9 rounded-full bg-blue-100 items-center justify-center">
                    <MapIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Journey Tracking — {selectedWork.location_name}</h2>
                    <p className="text-xs text-gray-500">
                      {selectedWork.employee_name} &nbsp;·&nbsp; {selectedWork.formatted_address || `${selectedWork.latitude.toFixed(5)}, ${selectedWork.longitude.toFixed(5)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  >
                    {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </button>
                  <button onClick={() => { setShowMapModal(false); setSelectedWork(null); setMapModalWorkFilterId(null); }} className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border-b border-gray-100 shrink-0">
                <div className="bg-white px-4 py-3 flex items-center gap-3">
                  <Ruler className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Distance</p>
                    <p className="text-sm font-bold text-gray-900">{formatDistance(totalDistanceMeters)}</p>
                  </div>
                </div>
                <div className="bg-white px-4 py-3 flex items-center gap-3">
                  <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Duration</p>
                    <p className="text-sm font-bold text-gray-900">{formatDuration(totalDurationSeconds)}</p>
                  </div>
                </div>
                <div className="bg-white px-4 py-3 flex items-center gap-3">
                  <Gauge className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Avg Speed</p>
                    <p className="text-sm font-bold text-gray-900">{avgSpeedKmh} km/h</p>
                  </div>
                </div>
                <div className="bg-white px-4 py-3 flex items-center gap-3">
                  <Gauge className="h-4 w-4 text-orange-500 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Max Speed</p>
                    <p className="text-sm font-bold text-gray-900">
                      {maxSpeedKmh > 0 ? `${maxSpeedKmh.toFixed(1)} km/h` : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className={`flex flex-col md:flex-row ${isFullscreen ? 'flex-1 min-h-0' : 'h-[500px]'}`}>
                {/* Map */}
                <div className="w-full md:flex-1 h-[300px] md:h-full relative bg-gray-50 border-b md:border-b-0 md:border-r border-gray-100">
                  <JourneyMapSwitch
                    points={multiMapData?.allPoints || []}
                    workLat={Number(selectedWork.latitude)}
                    workLng={Number(selectedWork.longitude)}
                    workName={selectedWork.location_name}
                    radiusMeters={selectedWork.allowed_radius_meters}
                    height="100%"
                    workSites={multiMapData?.workSites && multiMapData.workSites.length > 1 ? multiMapData.workSites : undefined}
                    segments={multiMapData?.segments && multiMapData.segments.length > 0 ? multiMapData.segments : undefined}
                  />
                </div>

                {/* Sidebar */}
                <div className="w-full md:w-80 h-[300px] md:h-full flex flex-col bg-white overflow-hidden shrink-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Multi-location visit summary */}
                    {multiMapData?.workSites && multiMapData.workSites.length > 1 && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <div className="text-xs font-semibold text-blue-700 mb-2">📍 Locations Visited Today ({multiMapData.workSites.length})</div>
                        <div className="flex flex-wrap gap-2">
                          {multiMapData.workSites.map((ws, i) => {
                            const isSelected = mapModalWorkFilterId === ws.id;
                            const isFaded = mapModalWorkFilterId !== null && !isSelected;
                            return (
                              <button 
                                key={i} 
                                onClick={() => setMapModalWorkFilterId(isSelected ? null : ws.id)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border rounded-full text-[10px] font-semibold transition-all shadow-sm ${isSelected ? 'border-blue-400 bg-blue-50 text-blue-900 ring-2 ring-blue-100' : isFaded ? 'border-gray-200 text-gray-400 opacity-60' : 'border-blue-200 text-blue-800 hover:bg-blue-50'}`}
                              >
                                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: ['#ef4444','#f97316','#eab308','#7c3aed','#2563eb'][i % 5] }} />
                                {ws.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Legend */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2 tracking-wide">Map Legend</div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-600">
                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Start</div>
                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> Last</div>
                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Event</div>
                        <div className="flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-indigo-500 inline-block" /> Path</div>
                        <div className="flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-emerald-500 inline-block" /> Work</div>
                        <div className="flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-orange-500 inline-block" /> Return</div>
                      </div>
                    </div>

                    {/* Event timeline */}
                    {journeyLogs.length > 0 ? (
                      <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                        <div className="bg-gray-50 px-3 py-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-b border-gray-200 shrink-0 flex justify-between items-center">
                          <span>Timeline ({timelineEvents.length})</span>
                          <button 
                            onClick={() => setShowTimelinePings(!showTimelinePings)}
                            className="text-blue-600 hover:text-blue-800 capitalize font-medium px-1 rounded hover:bg-blue-50"
                          >
                            {showTimelinePings ? 'Hide Pings' : 'Show Pings'}
                          </button>
                        </div>
                        <div className="divide-y divide-gray-100 overflow-y-auto">
                          {timelineEvents.map((evt, i) => {
                             const state = classifySpeed(evt.speed_ms);
                             const speedBadgeColor =
                               state === 'driving' ? 'bg-blue-50 text-blue-700' :
                               state === 'walking' ? 'bg-yellow-50 text-yellow-700' :
                               state === 'stationary' ? 'bg-gray-100 text-gray-500' : '';
                             return (
                               <div key={i} className="flex items-start gap-2 px-3 py-2">
                                 <span className="shrink-0 pt-0.5">{getTimelineIcon(evt.status, i === 0, i === timelineEvents.length - 1)}</span>
                                 <div className="flex-1 min-w-0">
                                   <div className="text-xs font-medium text-gray-800 capitalize truncate">{evt.status}</div>
                                   <div className="text-[10px] text-gray-500 truncate">{evt.message}</div>
                                   {evt.speed_ms != null && (
                                     <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${speedBadgeColor}`}>
                                       {state === 'driving' ? '🚗' : state === 'walking' ? '🚶' : '•'} {(evt.speed_ms * 3.6).toFixed(1)} km/h
                                     </span>
                                   )}
                                 </div>
                                 <div className="text-[10px] text-gray-500 font-medium whitespace-nowrap shrink-0">
                                   {format(new Date(evt.timestamp), 'hh:mm a')}
                                 </div>
                               </div>
                             );
                           })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-[10px] text-gray-400 border border-dashed border-gray-200 rounded-lg">
                        No tracking data recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
      )}

      {/* PENDING WORKS TIMELINE MODAL */}
      {showTimelineModal && selectedWork && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <History className="h-5 w-5 text-purple-600" />
                Work Timeline
              </h2>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowTimelinePings(!showTimelinePings)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {showTimelinePings ? 'Hide Pings' : 'Show Pings'}
                </button>
                <button onClick={() => { setShowTimelineModal(false); setSelectedWork(null); }} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="mb-6">
                <h3 className="font-medium text-gray-900">{selectedWork.employee_name}</h3>
                <p className="text-sm text-gray-500">{format(new Date(selectedWork.assignment_date), 'MMMM d, yyyy')}</p>
              </div>

              {timelineEvents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading timeline...
                </div>
              ) : (
                <div className="relative border-l-2 border-gray-200 ml-3 space-y-8">
                  {timelineEvents.map((log, index) => (
                      <div key={index} className="relative pl-6">
                        <span className="absolute -left-[5px] top-1">
                          {getTimelineIcon(log.status, index === 0, index === timelineEvents.length - 1)}
                        </span>
                        <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-900 capitalize">
                          {log.status}
                        </span>
                        <span className="text-sm text-gray-700 my-0.5">
                          {log.message}
                        </span>
                        {log.lat && log.lng && (
                          <ReverseGeocodeAddress lat={log.lat} lng={log.lng} />
                        )}
                        <span className="text-xs text-gray-500">
                          {format(new Date(log.timestamp), 'hh:mm:ss a')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedWork.started_at && selectedWork.completed_at && (
                <div className="mt-8 p-4 bg-gray-50 rounded-lg flex items-center justify-between border border-gray-100">
                  <span className="text-sm font-medium text-gray-700">Total Wall-Clock Time</span>
                  <span className="text-sm font-bold text-blue-600">
                    {calculateDuration(selectedWork.started_at, selectedWork.completed_at)}
                  </span>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => { setShowTimelineModal(false); setSelectedWork(null); }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close Timeline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}