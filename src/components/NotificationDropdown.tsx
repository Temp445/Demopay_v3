import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Trash2, Clock, Calendar, DollarSign, Settings, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  CustomNotification,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  addNotificationListener,
} from '../lib/notifications';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabase';
import { getUserEmployeeData } from '../lib/roleBasedAccess';
import type { VisitorNotification } from '../types/visitor';

// A unified item shown in the dropdown
interface DropdownItem {
  id: string;
  kind: 'system' | 'visitor';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  type?: string;        // system notification type
  notification_type?: string; // visitor notification type
  link?: string;
  // raw refs for actions
  systemNotif?: CustomNotification;
  visitorNotif?: VisitorNotification;
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<DropdownItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Helpers ────────────────────────────────────────────────────────────────

  const visitorNotifTitle = (type: VisitorNotification['notification_type']) => {
    switch (type) {
      case 'pending_approval':    return 'Visitor Approval Request';
      case 'approved':            return 'Visitor Approved';
      case 'rejected':            return 'Visitor Rejected';
      case 'visitor_arrived':     return 'Visitor Arrived';
      case 'visitor_left':        return 'Visitor Left';
      case 'confirmation_required': return 'Exit Confirmation Needed';
      default:                    return 'Visitor Notification';
    }
  };

  // ── Load both Notification sources ─────────────────────────────────────────

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { employeeId, tenantId, role } = await getUserEmployeeData(user.id);
      const isAdmin = role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'hr team';

      // 1. System notifications — query by employee ID or Admin status
      const [systemNotifs, sysCount] = await Promise.all([
        (employeeId || isAdmin) && tenantId 
          ? getUserNotifications(employeeId, tenantId, 10, 0, true, isAdmin) 
          : Promise.resolve([]),
        (employeeId || isAdmin) && tenantId 
          ? getUnreadNotificationCount(employeeId, tenantId, isAdmin)        
          : Promise.resolve(0),
      ]);

      // 2. Visitor notifications (only if user has an employee profile)
      let visitorNotifs: VisitorNotification[] = [];
      let dynamicPendingNotifs: DropdownItem[] = [];
      
      if (employeeId && tenantId) {
        const { data, error } = await supabase
          .from('visitor_notifications')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (error) console.error('Error fetching visitor notifications:', error);
        visitorNotifs = data || [];

        // Query the visit table for pending approvals assigned to this employee
        const { data: waitingVisits, error: waitingError } = await supabase
          .from('attendance_visitor_visits')
          .select('id, employee_to_visit, visitor_status, created_at, visitor:attendance_visitor(id, visitor_name)')
          .eq('employee_to_visit', employeeId)
          .eq('visitor_status', 'verification_pending');

        if (waitingError) console.error('Error fetching pending visits:', waitingError);

        if (waitingVisits && waitingVisits.length > 0) {
          dynamicPendingNotifs = waitingVisits.map(v => {
            const visitorData = Array.isArray(v.visitor) ? v.visitor[0] : v.visitor;
            const visitorId = visitorData?.id ?? '';
            const visitorName = visitorData?.visitor_name ?? 'A visitor';
            const alreadyInVisitorNotifs = visitorNotifs.some(n => n.visitor_id === visitorId && n.notification_type === 'pending_approval');
            if (alreadyInVisitorNotifs) return null;
            return {
              id: `waiting-vis-${v.id}`,
              kind: 'visitor' as const,
              title: 'Visitor Approval Request',
              message: `${visitorName} is waiting at the reception for your approval.`,
              is_read: false,
              created_at: v.created_at,
              notification_type: 'pending_approval',
              link: '/dashboard/visitor-records',
            };
          }).filter(Boolean) as DropdownItem[];
        }

        // Also query for exit_pending visits (exit confirmation requests)
        const { data: exitPendingVisits } = await supabase
          .from('attendance_visitor_visits')
          .select('id, employee_to_visit, visitor_status, created_at, visitor:attendance_visitor(id, visitor_name)')
          .eq('employee_to_visit', employeeId)
          .eq('visitor_status', 'exit_pending');

        if (exitPendingVisits && exitPendingVisits.length > 0) {
          const exitNotifs: DropdownItem[] = exitPendingVisits.map(v => {
            const visitorData = Array.isArray(v.visitor) ? v.visitor[0] : v.visitor;
            const visitorId = visitorData?.id ?? '';
            const visitorName = visitorData?.visitor_name ?? 'A visitor';
            const alreadyInVisitorNotifs = visitorNotifs.some(n => n.visitor_id === visitorId && n.notification_type === 'confirmation_required' && !n.is_read);
            if (alreadyInVisitorNotifs) return null;
            return {
              id: `exit-vis-${v.id}`,
              kind: 'visitor' as const,
              title: 'Exit Confirmation Needed',
              message: `${visitorName} is requesting to exit. Please confirm.`,
              is_read: false,
              created_at: v.created_at,
              notification_type: 'confirmation_required',
              link: '/dashboard/visitor-records',
            };
          }).filter(Boolean) as DropdownItem[];
          dynamicPendingNotifs = [...dynamicPendingNotifs, ...exitNotifs];
        }
      }

      // Count all unread visitors (db-sourced + dynamic pending)
      const visitorUnread = visitorNotifs.filter(n => !n.is_read).length + dynamicPendingNotifs.length;

      // 3. Merge and sort by date
      const merged: DropdownItem[] = [
        ...systemNotifs.map<DropdownItem>(n => ({
          id: `sys-${n.id}`,
          kind: 'system',
          title: n.title,
          message: n.message,
          is_read: n.is_read,
          created_at: n.created_at,
          type: n.type,
          link: n.link,
          systemNotif: n,
        })),
        ...visitorNotifs.map<DropdownItem>(n => ({
          id: `vis-${n.id}`,
          kind: 'visitor',
          title: visitorNotifTitle(n.notification_type),
          message: n.message,
          is_read: n.is_read,
          created_at: n.created_at,
          notification_type: n.notification_type,
          link: '/dashboard/visitor-records',
          visitorNotif: n,
        })),
        ...dynamicPendingNotifs
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
       .slice(0, 12);

      setItems(merged);
      setUnreadCount(sysCount + visitorUnread);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── UPDATED: Real-time Listeners with Broadcast ───────────────────────────

  useEffect(() => {
    if (!user) return;
    
    // Initial data load
    loadAll();
    
    // 1. Keep the 60-second polling as a reliable fallback
    const interval = setInterval(loadAll, 60000);
    
    // 2. Listen to real-time System Notifications (Socket.io)
    const removeSystemListener = addNotificationListener(() => {
      loadAll();
    });

    // 3. Listen to real-time Visitor Notifications (Supabase Realtime & Broadcast)
    let visitorChannel: ReturnType<typeof supabase.channel>;

    const setupVisitorRealtime = async () => {
      const { employeeId, tenantId, role } = await getUserEmployeeData(user.id);
      const isAdmin = role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'hr team';
      
      if ((employeeId || isAdmin) && tenantId) {
        visitorChannel = supabase
          .channel(`tenant-broadcast-${tenantId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'visitor_notifications', filter: `employee_id=eq.${employeeId}` },
            () => { loadAll(); }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'attendance_visitor', filter: `tenant_id=eq.${tenantId}` },
            () => { loadAll(); }
          )
          // Targeted System Notification (Personal)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${employeeId}` },
            () => { loadAll(); }
          )
          // Broadcast System Notification (Admins Only)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=is.null` },
            (payload) => { 
                // Only refresh if it's a web-compatible link or it's a general broadcast
                if (isAdmin && (!payload.new.link || payload.new.link.startsWith('/'))) {
                    loadAll(); 
                }
            }
          )
          .on(
            'broadcast',
            { event: 'instant-refresh' },
            () => { setTimeout(loadAll, 200); } 
          )
          .subscribe();
      }
    };

    setupVisitorRealtime();

    // Cleanup listeners when component unmounts
    return () => {
      clearInterval(interval);
      removeSystemListener();
      if (visitorChannel) {
        supabase.removeChannel(visitorChannel);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleItemClick = async (item: DropdownItem) => {
    if (!item.is_read && !item.id.startsWith('waiting-vis-')) {
      if (item.kind === 'system' && item.systemNotif) {
        await markNotificationAsRead(item.systemNotif.id);
      } else if (item.kind === 'visitor' && item.visitorNotif) {
        await supabase
          .from('visitor_notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', item.visitorNotif.id);
      }
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_read: true } : i));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    if (item.link) {
      // Fetch user role for conditional routing
      let role = '';
      if (user) {
        try {
          const data = await getUserEmployeeData(user.id);
          role = data.role || '';
        } catch (err) {
          console.error('Error fetching role for redirect:', err);
        }
      }
      const canApprove = role.toLowerCase() === 'admin' || role.toLowerCase() === 'hr team' || role.toLowerCase() === 'reporting head';

      // Map mobile links (e.g. 'LeaveRequest') to web routes
      const webLink = item.link.startsWith('/') 
        ? item.link 
        : item.link === 'LeaveRequest' || item.link === 'LeaveApproval' ? '/dashboard/leave'
        : item.link === 'AdvanceRequest' || item.link === 'AdvanceApproval' ? '/dashboard/advances'
        : item.link === 'PermissionRequest' || item.link === 'PermissionApproval' 
          ? (canApprove ? '/dashboard/permissions/approval' : '/dashboard/permissions/request')
        : item.link === 'GatePassRequest' || item.link === 'GatePassApproval' ? '/dashboard/gate-passes'
        : null;

      if (webLink) navigate(webLink);
    }
    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const { employeeId, tenantId, role } = await getUserEmployeeData(user.id);
    const isAdmin = role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'hr team';

    // Mark system notifications read (user_id = employees.id OR broadcast)
    if (tenantId) {
      await markAllNotificationsAsRead(employeeId, tenantId, isAdmin);
    }
    if (employeeId) {
      await supabase
        .from('visitor_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('employee_id', employeeId)
        .eq('is_read', false);
    }
    setItems(prev => prev.map(i => ({ ...i, is_read: true })));
    
    // Keep dynamic unread count active
    const pendingCount = items.filter(i => i.id.startsWith('waiting-vis-')).length;
    setUnreadCount(pendingCount);
  };

  const handleDelete = async (e: React.MouseEvent, item: DropdownItem) => {
    e.stopPropagation();
    
    if (item.id.startsWith('waiting-vis-')) {
      setItems(prev => prev.filter(i => i.id !== item.id));
      setUnreadCount(c => Math.max(0, c - 1));
      return;
    }

    if (item.kind === 'system' && item.systemNotif) {
      await deleteNotification(item.systemNotif.id);
    } else if (item.kind === 'visitor' && item.visitorNotif) {
      await supabase.from('visitor_notifications').delete().eq('id', item.visitorNotif.id);
    }
    const wasUnread = !item.is_read;
    setItems(prev => prev.filter(i => i.id !== item.id));
    if (wasUnread) setUnreadCount(c => Math.max(0, c - 1));
  };

  // ── Icons ───────────────────────────────────────────────────────────────────

  const getIcon = (item: DropdownItem) => {
    if (item.kind === 'visitor') {
      switch (item.notification_type) {
        case 'pending_approval':
        case 'confirmation_required':
          return <Users className="h-5 w-5 text-orange-500" />;
        case 'approved':
          return <Users className="h-5 w-5 text-green-500" />;
        case 'rejected':
          return <Users className="h-5 w-5 text-red-500" />;
        default:
          return <Users className="h-5 w-5 text-indigo-500" />;
      }
    }
    switch (item.type) {
      case 'payroll_processed':
      case 'payroll_deadline':
      case 'salary_change':
      case 'benefit_change':
        return <DollarSign className="h-5 w-5 text-indigo-500" />;
      case 'leave_request':
      case 'leave_status_change':
        return <Calendar className="h-5 w-5 text-orange-500" />;
      case 'leave_approved':
        return <Calendar className="h-5 w-5 text-green-500" />;
      case 'leave_rejected':
        return <Calendar className="h-5 w-5 text-red-500" />;
      case 'leave_cancelled':
        return <Calendar className="h-5 w-5 text-gray-500" />;
      case 'advance_request':
      case 'advance_status_change':
        return <DollarSign className="h-5 w-5 text-green-600" />;
      case 'permission_request':
      case 'permission_status_change':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'gatepass_request':
      case 'gatepass_status_change':
        return <Bell className="h-5 w-5 text-purple-500" />;
      case 'attendance_issue':
        return <Clock className="h-5 w-5 text-red-500" />;
      case 'system_update':
        return <Settings className="h-5 w-5 text-gray-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="relative flex-shrink-0 p-1 text-gray-100 rounded-full hover:text-gray-200"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="sr-only">View notifications</span>
        <Bell className="h-6 w-6 mt-1" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 block h-4 w-4 rounded-full bg-red-500 text-xs text-white text-center leading-4">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-2">
            {/* Header */}
            <div className="px-4 py-2 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="text-xs text-indigo-600 hover:text-indigo-900"
                  onClick={handleMarkAllRead}
                >
                  Mark all as read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="px-4 py-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No notifications
                </div>
              ) : (
                items.map(item => (
                  <div
                    key={item.id}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-start gap-3 ${
                      !item.is_read ? 'bg-indigo-50' : ''
                    }`}
                    onClick={() => handleItemClick(item)}
                  >
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-0.5">{getIcon(item)}</div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-medium text-gray-900 leading-tight">{item.title}</p>
                        {item.kind === 'visitor' && (
                          <span className="shrink-0 text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">
                            Visitor
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{item.message}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Delete */}
                    <button
                      className="flex-shrink-0 text-gray-300 hover:text-gray-500 ml-1"
                      onClick={e => handleDelete(e, item)}
                      title="Dismiss"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-gray-200 text-center">
              <button
                type="button"
                className="text-sm text-indigo-600 hover:text-indigo-900"
                onClick={() => { navigate('/dashboard/notifications'); setIsOpen(false); }}
              >
                View all notifications
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}