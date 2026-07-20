import { useEffect, useState } from 'react';
import {
    User, CheckCircle, XCircle, Clock, Phone, FileText,
    Users, DoorOpen, LogOut, History, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { useVisitorStore } from '../../../stores/visitorStore';
import { useTenant } from '../../../contexts/TenantContext';
import { useUserProfileStore } from '../../../stores/userProfileStore';
import { getUserEmployeeData } from '../../../lib/roleBasedAccess';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import type { VisitorWithDetails, VisitorNotification } from '../../../types/visitor';

interface ExitRequest {
    notification: VisitorNotification;
    visitor: VisitorWithDetails | null;
    timestampId: string | null;
    /** Set after employee acts — lives in history */
    result?: 'confirmed' | 'denied';
    actedAt?: string;
}

export default function EmployeeVisitorApprovals() {
    const { currentTenant } = useTenant();
    const { userId } = useUserProfileStore();
    const { visitors, loading, fetchVisitors, approveOrRejectVisitor, confirmVisitorExit } = useVisitorStore();

    const [employeeId, setEmployeeId] = useState<string | null>(null);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Exit confirmation state — split into pending and history
    const [pendingExitRequests, setPendingExitRequests] = useState<ExitRequest[]>([]);
    const [exitHistory, setExitHistory] = useState<ExitRequest[]>([]);
    const [exitLoading, setExitLoading] = useState(false);

    // Approval history toggle
    const [showApprovalHistory, setShowApprovalHistory] = useState(false);
    const [showExitHistory, setShowExitHistory] = useState(false);

    // Resolve the employee DB id for the logged-in user
    useEffect(() => {
        if (!userId) return;
        getUserEmployeeData(userId).then(({ employeeId }) => {
            setEmployeeId(employeeId);
        });
    }, [userId]);

    // Fetch all visitors for the tenant whenever tenant is ready
    useEffect(() => {
        if (currentTenant) {
            fetchVisitors(currentTenant.id);
        }
    }, [currentTenant, fetchVisitors]);

    // REAL-TIME LISTENER: Updates the main page instantly when a new visitor request arrives
    useEffect(() => {
        if (!currentTenant || !employeeId) return;

        const channel = supabase
            .channel(`employee-approvals-sync-${employeeId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'attendance_visitor',
                    filter: `tenant_id=eq.${currentTenant.id}`
                },
                () => {
                    fetchVisitors(currentTenant.id);
                }
            )
            // Also react immediately when a new exit confirmation notification arrives for this employee
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'visitor_notifications',
                    filter: `employee_id=eq.${employeeId}`
                },
                () => {
                    fetchExitRequests();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentTenant, employeeId, fetchVisitors]);

    const [refreshingExit, setRefreshingExit] = useState(false);
    const [refreshingVisitor, setRefreshingVisitor] = useState(false);

    const fetchExitRequests = async () => {
        if (!employeeId || !currentTenant) return;
        setExitLoading(true);
        try {
            const { data: notifications } = await supabase
                .from('visitor_notifications')
                .select('*')
                .eq('employee_id', employeeId)
                .eq('tenant_id', currentTenant.id)
                .eq('notification_type', 'confirmation_required')
                .order('created_at', { ascending: false })
                .limit(50);

                if (!notifications || notifications.length === 0) {
                    setPendingExitRequests([]);
                    setExitHistory([]);
                    setExitLoading(false);
                    return;
                }

                // For each notification, get the visitor data + latest timestamp
                const requests: ExitRequest[] = await Promise.all(
                    notifications.map(async (notif) => {
                        // 1. Fetch visitor profile (visitor_name, email, phone live here)
                        const { data: visitor } = await supabase
                            .from('attendance_visitor')
                            .select('*')
                            .eq('id', notif.visitor_id)
                            .single();

                        // 2. Fetch latest visit to get employee info
                        const { data: latestVisit } = await supabase
                            .from('attendance_visitor_visits')
                            .select('employee_to_visit, employees:employee_to_visit ( name, email )')
                            .eq('visitor_id', notif.visitor_id)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        const { data: timestamps } = await supabase
                            .from('attendance_visitor_timestamp')
                            .select('id, timestamp, is_confirmed, entry')
                            .eq('visitor_id', notif.visitor_id)
                            .order('timestamp', { ascending: false })
                            .limit(1);

                        const latestTimestamp = timestamps?.[0];

                        // Determine if exit was confirmed
                        let result: ExitRequest['result'] = undefined;
                        if (notif.is_read) {
                            // First check if an OUT entry exists for this visitor after the notification
                            const { data: outTs } = await supabase
                                .from('attendance_visitor_timestamp')
                                .select('entry, timestamp')
                                .eq('visitor_id', notif.visitor_id)
                                .eq('entry', 'OUT')
                                .gte('timestamp', notif.created_at)
                                .order('timestamp', { ascending: false })
                                .limit(1);

                            result = outTs && outTs.length > 0 ? 'confirmed' : 'denied';
                        }

                        return {
                            notification: notif,
                            visitor: visitor
                                ? {
                                      ...visitor,
                                      employee_name: (latestVisit as any)?.employees?.name,
                                      employee_email: (latestVisit as any)?.employees?.email,
                                      // Map database 'timestamp' to TS type 'clock_in'
                                      latest_timestamp: latestTimestamp ? {
                                          ...latestTimestamp,
                                          clock_in: latestTimestamp.timestamp
                                      } : undefined,
                                  }
                                : null,
                            timestampId: latestTimestamp?.id ?? null,
                            result,
                            actedAt: notif.read_at ?? undefined,
                        };
                    })
                );

                // Split into pending (unread) and history (read)
                setPendingExitRequests(requests.filter(r => !r.notification.is_read));
                setExitHistory(requests.filter(r => r.notification.is_read));
            } catch (err) {
                console.error('Error fetching exit requests:', err);
            } finally {
                setExitLoading(false);
                setRefreshingExit(false);
            }
        };

    // Fetch ALL exit confirmation notifications (both pending and already-read)
    useEffect(() => {
        fetchExitRequests();
    }, [employeeId, currentTenant]);

    const handleRefreshExit = async () => {
        setRefreshingExit(true);
        await fetchExitRequests();
    };

    const handleRefreshVisitor = async () => {
        if (!currentTenant) return;
        setRefreshingVisitor(true);
        await fetchVisitors(currentTenant.id);
        setRefreshingVisitor(false);
    };

    // Filter visitor approval requests
    const pendingRequests: VisitorWithDetails[] = visitors.filter(
        (v) =>
            v.employee_to_visit === employeeId &&
            v.visitor_status === 'verification_pending'
    );

    // Visitor approval history (approved / rejected / exited visitors for this employee)
    const approvalHistory: VisitorWithDetails[] = visitors.filter(
        (v) =>
            v.employee_to_visit === employeeId &&
            (v.visitor_status === 'approved' || v.visitor_status === 'rejected' || v.visitor_status === 'exited')
    );

    const getVisitorImage = (visitor: VisitorWithDetails | null) => {
        if (!visitor) return null;
        if (visitor.visitor_image) return visitor.visitor_image;
        if (visitor.visitor_image_data) {
            try {
                const blob = new Blob([visitor.visitor_image_data as any], { type: 'image/jpeg' });
                return URL.createObjectURL(blob);
            } catch {
                return null;
            }
        }
        return null;
    };

    // ── Approval handlers ────────────────────────────────────────────────────

    const handleApprove = async (visitor: VisitorWithDetails) => {
        if (!currentTenant || !employeeId || !userId) return;
        setActionLoading(visitor.id);
        try {
            await approveOrRejectVisitor(
                currentTenant.id,
                employeeId,
                { visitor_id: visitor.id, action: 'approved' },
                userId
            );
            toast.success('Visitor approved successfully');
            fetchVisitors(currentTenant.id);
        } catch {
            toast.error('Failed to approve visitor');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRejectConfirm = async (visitor: VisitorWithDetails) => {
        if (!currentTenant || !employeeId || !userId) return;
        setActionLoading(visitor.id);
        try {
            await approveOrRejectVisitor(
                currentTenant.id,
                employeeId,
                { visitor_id: visitor.id, action: 'rejected', reason: rejectReason || undefined },
                userId
            );
            toast.success('Visitor rejected');
            setRejectingId(null);
            setRejectReason('');
            fetchVisitors(currentTenant.id);
        } catch {
            toast.error('Failed to reject visitor');
        } finally {
            setActionLoading(null);
        }
    };

    // ── Exit confirmation handlers ────────────────────────────────────────────

    const handleExitAction = async (req: ExitRequest, confirmed: boolean) => {
        if (!userId || !req.visitor) {
            toast.error('Cannot find visitor data to confirm');
            return;
        }
        setActionLoading(req.notification.id);
        try {
            await confirmVisitorExit(
                {
                    timestamp_id: req.timestampId ?? '',
                    visitor_id: req.visitor.id,
                    tenant_id: req.notification.tenant_id,
                    confirmed,
                },
                userId
            );

            // Mark the notification as read/dismissed
            await supabase
                .from('visitor_notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', req.notification.id);

            toast.success(confirmed ? 'Exit confirmed — visitor clocked out' : 'Exit denied — visitor remains on premises');

            // Move from pending to history with result
            const historyEntry: ExitRequest = {
                ...req,
                notification: { ...req.notification, is_read: true, read_at: new Date().toISOString() },
                result: confirmed ? 'confirmed' : 'denied',
                actedAt: new Date().toISOString(),
            };
            setPendingExitRequests(prev => prev.filter(r => r.notification.id !== req.notification.id));
            setExitHistory(prev => [historyEntry, ...prev]);
        } catch {
            toast.error('Failed to update exit confirmation');
        } finally {
            setActionLoading(null);
        }
    };

    if ((loading && visitors.length === 0 && !refreshingVisitor) || (exitLoading && exitHistory.length === 0 && pendingExitRequests.length === 0 && !refreshingExit)) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-full bg-slate-50/50 p-6">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* ── EXIT CONFIRMATION SECTION ────────────────────────────── */}
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <div className="p-2 bg-orange-100 text-orange-600 rounded-xl">
                                    <DoorOpen className="h-5 w-5" />
                                </div>
                                Exit Confirmations
                            </h2>
                            <p className="text-sm text-slate-500 mt-1.5 ml-11">
                                Confirm or deny the following visitor exits
                            </p>
                        </div>
                    <button
                        onClick={handleRefreshExit}
                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                        title="Refresh Exit Requests"
                    >
                        <RefreshCw className={`h-5 w-5 ${refreshingExit || exitLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                    {/* Pending exit requests */}
                    {pendingExitRequests.length === 0 ? (
                        <div className={`text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 transition-opacity duration-200 ${refreshingExit ? 'opacity-50' : 'opacity-100'}`}>
                            <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                <CheckCircle className="h-6 w-6 text-slate-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">No pending exit confirmations</p>
                            <p className="text-xs text-slate-400 mt-1">You're all caught up</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                        {pendingExitRequests.map((req) => {
                            const imageUrl = getVisitorImage(req.visitor);
                            const isActioning = actionLoading === req.notification.id;

                            return (
                                <div
                                    key={req.notification.id}
                                    className="group relative bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col"
                                >
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-amber-400"></div>
                                    <div className="flex flex-col flex-1 p-5">
                                        <div className="flex gap-4">
                                            {/* Visitor image */}
                                            <div className="flex-shrink-0 w-16 h-16 bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
                                                {imageUrl ? (
                                                    <img src={imageUrl} alt="Visitor" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <User className="h-6 w-6 text-slate-300" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-col items-start gap-1.5 mb-2">
                                                    <h3 className="text-base font-bold text-slate-800 truncate w-full">
                                                        {req.visitor?.visitor_name || 'Unknown Visitor'}
                                                    </h3>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-orange-50 text-orange-600 border border-orange-100 flex-shrink-0">
                                                        <LogOut className="h-3 w-3" />
                                                        Exit Pending
                                                    </span>
                                                </div>
                                                <div className="space-y-1.5 text-xs text-slate-500">
                                                    {req.visitor?.phone_number && (
                                                        <p className="flex items-center gap-1.5">
                                                            <Phone className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                                            {req.visitor.phone_number}
                                                        </p>
                                                    )}
                                                    <p className="flex items-center gap-1.5 text-slate-400">
                                                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                                                        {format(new Date(req.notification.created_at), 'hh:mm a · MMM d, yyyy')}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                                        <button
                                            onClick={() => handleExitAction(req, false)}
                                            disabled={isActioning}
                                            className="flex-1 px-3 py-2 bg-white text-slate-600 text-sm font-semibold rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                        >
                                            <XCircle className="h-4 w-4" />
                                            Deny
                                        </button>
                                        <button
                                            onClick={() => handleExitAction(req, true)}
                                            disabled={isActioning}
                                            className="flex-[2] px-3 py-2 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 shadow-sm shadow-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                        >
                                            {isActioning ? (
                                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                            ) : (
                                                <CheckCircle className="h-4 w-4" />
                                            )}
                                            Allow Exit
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                    {/* Exit history toggle */}
                    <div className="mt-6 pt-6 border-t border-slate-100">
                        <button
                            onClick={() => setShowExitHistory(v => !v)}
                            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors w-full focus:outline-none"
                        >
                            <History className="h-3.5 w-3.5" />
                            {showExitHistory ? 'Hide' : 'Show'} Exit History ({exitHistory.length})
                            {showExitHistory ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                        </button>

                        {showExitHistory && (
                            <div className="mt-4">
                                {exitHistory.length === 0 ? (
                                    <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                        <p className="text-xs text-slate-500">No exit history found.</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {exitHistory.map((req) => {
                                            const imageUrl = getVisitorImage(req.visitor);
                                            const isConfirmed = req.result === 'confirmed';
                                            return (
                                                <div
                                                    key={req.notification.id}
                                                    className={`rounded-xl border overflow-hidden shadow-sm transition-all text-left ${
                                                        isConfirmed
                                                            ? 'bg-emerald-50/50 border-emerald-100 hover:border-emerald-200'
                                                            : 'bg-red-50/50 border-red-100 hover:border-red-200'
                                                    }`}
                                                >
                                                    <div className="flex gap-3 p-3">
                                                        {/* Visitor image */}
                                                        <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg overflow-hidden border border-slate-100 shadow-sm">
                                                            {imageUrl ? (
                                                                <img src={imageUrl} alt="Visitor" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center">
                                                                    <User className="h-5 w-5 text-slate-300" />
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                            <div className="flex items-center justify-between gap-2 mb-0.5">
                                                                <h3 className="text-xs font-bold text-slate-700 truncate">
                                                                    {req.visitor?.visitor_name || 'Unknown'}
                                                                </h3>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-1">
                                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide flex-shrink-0 ${
                                                                    isConfirmed
                                                                        ? 'bg-emerald-100 text-emerald-700'
                                                                        : 'bg-red-100 text-red-700'
                                                                }`}>
                                                                    {isConfirmed ? 'Confirmed' : 'Denied'}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 truncate">
                                                                    {format(new Date(req.notification.created_at), 'MM/dd hh:mm a')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

            {/* ── VISITOR APPROVAL SECTION ─────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                                <Users className="h-5 w-5" />
                            </div>
                            Visitor Requests
                        </h1>
                        <p className="text-sm text-slate-500 mt-1.5 ml-11">
                            Visitors who have requested to meet with you
                        </p>
                    </div>
                    <button
                        onClick={handleRefreshVisitor}
                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        title="Refresh Visitor Requests"
                    >
                        <RefreshCw className={`h-5 w-5 ${refreshingVisitor || loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {pendingRequests.length === 0 ? (
                    <div className={`text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 transition-opacity duration-200 ${refreshingVisitor || loading ? 'opacity-50' : 'opacity-100'}`}>
                        <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="h-6 w-6 text-emerald-500" />
                        </div>
                        <h3 className="text-base font-bold text-slate-800 mb-1">All caught up!</h3>
                        <p className="text-sm text-slate-500">No pending visitor requests for you right now.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="col-span-full mb-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                <span className="text-blue-600">{pendingRequests.length}</span>{' '}
                                pending {pendingRequests.length === 1 ? 'request' : 'requests'}
                            </p>
                        </div>
                        {pendingRequests.map((visitor) => {
                            const imageUrl = getVisitorImage(visitor);
                            const isActioning = actionLoading === visitor.id;
                            const isRejecting = rejectingId === visitor.id;

                            return (
                                <div
                                    key={visitor.id}
                                    className="group relative bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col"
                                >
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-400"></div>
                                    <div className="flex flex-col flex-1 p-5">
                                        <div className="flex gap-4 mb-4">
                                            {/* Visitor image */}
                                            <div className="flex-shrink-0 w-16 h-16 bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
                                                {imageUrl ? (
                                                    <img src={imageUrl} alt="Visitor" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <User className="h-6 w-6 text-slate-300" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Visitor info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-col items-start gap-1.5 mb-2">
                                                    <h3 className="text-base font-bold text-slate-800 truncate w-full">
                                                        {visitor.visitor_name || 'Unknown Visitor'}
                                                    </h3>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-600 border border-blue-100 flex-shrink-0">
                                                        <Clock className="h-3 w-3" />
                                                        Pending Approval
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5 text-xs text-slate-500 flex-1">
                                            {visitor.phone_number && (
                                                <p className="flex items-center gap-1.5">
                                                    <Phone className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                                    {visitor.phone_number}
                                                </p>
                                            )}
                                            {visitor.reason_for_visit && (
                                                <p className="flex items-start gap-1.5">
                                                    <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                                                    <span className="line-clamp-2">{visitor.reason_for_visit}</span>
                                                </p>
                                            )}
                                            <p className="flex items-center gap-1.5 text-slate-400 pt-1">
                                                <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                                                {format(new Date(visitor.last_visit_at), 'hh:mm a · MMM d, yyyy')}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Reject reason input */}
                                    {isRejecting && (
                                        <div className="px-4 pb-3 bg-slate-50 border-t border-slate-100 pt-3">
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                                Reason <span className="text-slate-400 font-normal lowercase">(optional)</span>
                                            </label>
                                            <textarea
                                                value={rejectReason}
                                                onChange={(e) => setRejectReason(e.target.value)}
                                                placeholder="e.g. In a meeting / out of office..."
                                                rows={2}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-shadow resize-none"
                                            />
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                                        {isRejecting ? (
                                            <>
                                                <button
                                                    onClick={() => { setRejectingId(null); setRejectReason(''); }}
                                                    disabled={isActioning}
                                                    className="px-3 py-2 bg-white text-slate-600 border border-slate-200 text-sm font-semibold rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => handleRejectConfirm(visitor)}
                                                    disabled={isActioning}
                                                    className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 shadow-sm shadow-red-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                                                >
                                                    {isActioning ? (
                                                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                                    ) : (
                                                        <XCircle className="h-4 w-4" />
                                                    )}
                                                    Confirm Reject
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => setRejectingId(visitor.id)}
                                                    disabled={isActioning}
                                                    className="flex-1 px-3 py-2 bg-white text-slate-600 text-sm font-semibold rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                    Reject
                                                </button>
                                                <button
                                                    onClick={() => handleApprove(visitor)}
                                                    disabled={isActioning}
                                                    className="flex-[2] px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                                                >
                                                    {isActioning ? (
                                                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                                    ) : (
                                                        <CheckCircle className="h-4 w-4" />
                                                    )}
                                                    Approve Visit
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Visitor Approval History ──────────────────────────── */}
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <button
                        onClick={() => setShowApprovalHistory(v => !v)}
                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors w-full focus:outline-none"
                    >
                        <History className="h-3.5 w-3.5" />
                        {showApprovalHistory ? 'Hide' : 'Show'} Visitor History ({approvalHistory.length})
                        {showApprovalHistory ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                    </button>

                    {showApprovalHistory && (
                        <div className="mt-4">
                            {approvalHistory.length === 0 ? (
                                <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                    <p className="text-xs text-slate-500">No visitor history found.</p>
                                </div>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {approvalHistory.map((visitor) => {
                                        const imageUrl = getVisitorImage(visitor);
                                        const isApproved = visitor.visitor_status === 'approved';
                                        const isExited = visitor.visitor_status === 'exited';
                                        return (
                                            <div
                                                key={visitor.id}
                                                className={`rounded-xl border overflow-hidden shadow-sm transition-all text-left ${
                                                    isApproved || isExited
                                                        ? 'bg-emerald-50/50 border-emerald-100 hover:border-emerald-200'
                                                        : 'bg-red-50/50 border-red-100 hover:border-red-200'
                                                }`}
                                            >
                                                <div className="flex gap-3 p-3">
                                                    {/* Visitor image */}
                                                    <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg overflow-hidden border border-slate-100 shadow-sm">
                                                        {imageUrl ? (
                                                            <img src={imageUrl} alt="Visitor" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <User className="h-5 w-5 text-slate-300" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                                            <h3 className="text-xs font-bold text-slate-700 truncate">
                                                                {visitor.visitor_name || 'Unknown'}
                                                            </h3>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-1">
                                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide flex-shrink-0 ${
                                                                isApproved || isExited
                                                                    ? 'bg-emerald-100 text-emerald-700'
                                                                    : 'bg-red-100 text-red-700'
                                                            }`}>
                                                                {isApproved ? 'Approved' : isExited ? 'Exited' : 'Rejected'}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 truncate">
                                                                {format(new Date(visitor.last_visit_at), 'MM/dd')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
        </div>
    );
}