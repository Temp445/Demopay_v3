import React, { useState, useEffect } from 'react';
import { Bell, Check, Trash2, Filter, Clock, Calendar, DollarSign, Settings, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserEmployeeData } from '../../../lib/roleBasedAccess';
import { 
  CustomNotification as Notification, 
  NotificationType,
  getUserNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  deleteNotification,
  getUserNotificationPreferences,
  updateNotificationPreferences,
  muteNotifications,
  unmuteNotifications,
  toggleNotificationType
} from '../../../lib/notifications';
import { formatDistanceToNow, format, isAfter } from 'date-fns';
import NotificationTestPanel from './NotificationTestPanel';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [preferences, setPreferences] = useState<{
    emailEnabled: boolean;
    inAppEnabled: boolean;
    mutedUntil: string | null;
    mutedTypes: NotificationType[];
  }>({
    emailEnabled: true,
    inAppEnabled: true,
    mutedUntil: null,
    mutedTypes: []
  });
  const [muteDuration, setMuteDuration] = useState<'1h' | '8h' | '24h' | '7d' | 'custom'>('1h');
  const [customMuteDate, setCustomMuteDate] = useState<string>(
    new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [selectedType, setSelectedType] = useState<NotificationType | 'all'>('all');
  const { user } = useAuth();

  // Fetch employee ID on mount (user_notifications.user_id = employees.id)
  useEffect(() => {
    if (!user) return;
    getUserEmployeeData(user.id).then(({ employeeId: eid, role, tenantId: tid }) => {
      setEmployeeId(eid);
      setTenantId(tid);
      setIsAdmin(role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'hr team');
    });
  }, [user]);

  // Load notifications and preferences
  useEffect(() => {
    if (!user || (!employeeId && !isAdmin) || !tenantId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const notifs = await getUserNotifications(
          employeeId, 
          tenantId,
          50, 
          0, 
          activeTab === 'all',
          isAdmin
        );
        setNotifications(notifs);

        const prefs = await getUserNotificationPreferences(user.id);
        if (prefs) {
          setPreferences({
            emailEnabled: prefs.email_enabled,
            inAppEnabled: prefs.in_app_enabled,
            mutedUntil: prefs.muted_until || null,
            mutedTypes: prefs.muted_types || []
          });
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, employeeId, activeTab, tenantId, isAdmin]);

  // Handle marking notification as read
  const handleMarkAsRead = async (notification: Notification) => {
    if (notification.is_read) return;

    try {
      await markNotificationAsRead(notification.id);
      setNotifications(notifications.map(n => 
        n.id === notification.id ? { ...n, is_read: true } : n
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Handle redirection
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await handleMarkAsRead(notification);
    }

    if (notification.link) {
      const data = await getUserEmployeeData(user?.id || '');
      const role = data.role || '';
      const canApprove = role.toLowerCase() === 'admin' || role.toLowerCase() === 'hr team' || role.toLowerCase() === 'reporting head';

      const webLink = notification.link.startsWith('/')
        ? notification.link
        : notification.link === 'LeaveRequest' || notification.link === 'LeaveApproval' ? '/dashboard/leave'
        : notification.link === 'AdvanceRequest' || notification.link === 'AdvanceApproval' ? '/dashboard/advances'
        : notification.link === 'PermissionRequest' || notification.link === 'PermissionApproval'
          ? (canApprove ? '/dashboard/permissions/approval' : '/dashboard/permissions/request')
        : notification.link === 'GatePassRequest' || notification.link === 'GatePassApproval' ? '/dashboard/gate-passes'
        : null;

      if (webLink) navigate(webLink);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user || (!employeeId && !isAdmin) || !tenantId) return;
    try {
      await markAllNotificationsAsRead(employeeId, tenantId, isAdmin);
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
      setNotifications(notifications.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleEmailToggle = async () => {
    if (!user) return;
    try {
      await updateNotificationPreferences(user.id, {
        email_enabled: !preferences.emailEnabled
      });
      setPreferences({ ...preferences, emailEnabled: !preferences.emailEnabled });
    } catch (error) {
      console.error('Error updating email preference:', error);
    }
  };

  const handleInAppToggle = async () => {
    if (!user) return;
    try {
      await updateNotificationPreferences(user.id, {
        in_app_enabled: !preferences.inAppEnabled
      });
      setPreferences({ ...preferences, inAppEnabled: !preferences.inAppEnabled });
    } catch (error) {
      console.error('Error updating in-app preference:', error);
    }
  };

  const handleMuteNotifications = async () => {
    if (!user) return;
    try {
      if (muteDuration === 'custom') {
        const customDate = new Date(customMuteDate);
        customDate.setHours(23, 59, 59, 999);
        await muteNotifications(user.id, 'custom', customDate);
      } else {
        await muteNotifications(user.id, muteDuration);
      }
      const prefs = await getUserNotificationPreferences(user.id);
      if (prefs) {
        setPreferences({ ...preferences, mutedUntil: prefs.muted_until || null });
      }
    } catch (error) {
      console.error('Error muting notifications:', error);
    }
  };

  const handleUnmuteNotifications = async () => {
    if (!user) return;
    try {
      await unmuteNotifications(user.id);
      setPreferences({ ...preferences, mutedUntil: null });
    } catch (error) {
      console.error('Error unmuting notifications:', error);
    }
  };

  const handleToggleNotificationType = async (type: NotificationType) => {
    if (!user) return;
    const isMuted = preferences.mutedTypes.includes(type);
    try {
      await toggleNotificationType(user.id, type, !isMuted);
      setPreferences({
        ...preferences,
        mutedTypes: isMuted
          ? preferences.mutedTypes.filter(t => t !== type)
          : [...preferences.mutedTypes, type]
      });
    } catch (error) {
      console.error('Error toggling notification type:', error);
    }
  };

  const filteredNotifications = selectedType === 'all'
    ? notifications
    : notifications.filter(n => n.type === selectedType);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'payroll_processed':
      case 'payroll_deadline':
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
      case 'salary_change':
      case 'benefit_change':
        return <DollarSign className="h-5 w-5 text-yellow-500" />;
      case 'attendance_issue':
        return <Clock className="h-5 w-5 text-red-500" />;
      case 'system_update':
        return <Settings className="h-5 w-5 text-gray-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatNotificationType = (type: string): string => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const isCurrentlyMuted = preferences.mutedUntil && isAfter(new Date(preferences.mutedUntil), new Date());

  return (
    <div className="xl:py-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
            <p className="mt-1 text-sm text-gray-500">Manage your notifications and preferences</p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleMarkAllAsRead}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              disabled={!notifications.some(n => !n.is_read)}
            >
              <Check className="h-4 w-4 mr-2" />
              Mark All as Read
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3"><h3 className="text-sm font-medium text-red-800">{error}</h3></div>
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex">
                  {['all', 'unread'].map((tab) => (
                    <button
                      key={tab}
                      className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm ${
                        activeTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                      onClick={() => setActiveTab(tab as any)}
                    >
                      {tab === 'all' ? 'All Notifications' : 'Unread'}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center">
                  <label className="text-sm font-medium text-gray-700 mr-2">Filter by type:</label>
                  <select
                    className="mt-1 block w-[50] pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value as any)}
                  >
                    <option value="all">All Types</option>
                    <option value="leave_status_change">Leave Status Change</option>
                    <option value="advance_request">Advance Request</option>
                    <option value="advance_status_change">Advance Status Change</option>
                    <option value="permission_request">Permission Request</option>
                    <option value="permission_status_change">Permission Status Change</option>
                    <option value="gatepass_request">Gate Pass Request</option>
                    <option value="gatepass_status_change">Gate Pass Status Change</option>
                  </select>
                </div>
              </div>

              <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center"><div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div><p className="mt-2 text-sm text-gray-500">Loading...</p></div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="p-8 text-center"><Bell className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">No notifications</h3></div>
                ) : (
                  filteredNotifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`p-4 hover:bg-gray-50 cursor-pointer ${!n.is_read ? 'bg-indigo-50' : ''}`}
                    >
                      <div className="flex items-start">
                        <div className="flex-shrink-0 mt-0.5">{getNotificationIcon(n.type)}</div>
                        <div className="ml-3 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">{n.title}</p>
                            <p className="text-xs text-gray-500">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                          </div>
                          <p className="text-sm text-gray-500">{n.message}</p>
                          <div className="mt-2 flex items-center space-x-2">
                            {!n.is_read && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleMarkAsRead(n); }}
                                className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
                              >
                                <Check className="h-3 w-3 mr-1" /> Mark as read
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteNotification(n.id); }}
                              className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200"
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* <div className="lg:col-span-1 space-y-6">
            <div className="bg-white shadow rounded-lg overflow-hidden p-6 space-y-6">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Notification Preferences</h3>
              
              <div>
                <h4 className="text-sm font-medium text-gray-900">Notification Methods</h4>
                <div className="mt-4 space-y-4">
                  {[
                    { id: 'email-notifications', label: 'Email Notifications', desc: 'Receive notifications via email', checked: preferences.emailEnabled, onChange: handleEmailToggle },
                    { id: 'in-app-notifications', label: 'In-App Notifications', desc: 'Receive notifications within the app', checked: preferences.inAppEnabled, onChange: handleInAppToggle }
                  ].map(method => (
                    <div key={method.id} className="flex items-start">
                      <div className="flex items-center h-5">
                        <input id={method.id} type="checkbox" checked={method.checked} onChange={method.onChange} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                      </div>
                      <div className="ml-3 text-sm">
                        <label htmlFor={method.id} className="font-medium text-gray-700">{method.label}</label>
                        <p className="text-gray-500 text-xs">{method.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-900">Mute Notifications</h4>
                {isCurrentlyMuted ? (
                  <div className="mt-2 p-3 bg-yellow-50 rounded-md">
                    <p className="text-xs text-yellow-700">Muted until {format(new Date(preferences.mutedUntil!), 'PPp')}</p>
                    <button onClick={handleUnmuteNotifications} className="mt-2 text-xs text-indigo-700 font-medium">Unmute Now</button>
                  </div>
                ) : (
                  <div className="mt-2 space-y-3">
                    <select value={muteDuration} onChange={(e) => setMuteDuration(e.target.value as any)} className="block w-full text-sm border-gray-300 rounded-md">
                      <option value="1h">1 hour</option><option value="8h">8 hours</option><option value="24h">24 hours</option><option value="7d">7 days</option><option value="custom">Custom date</option>
                    </select>
                    {muteDuration === 'custom' && <input type="date" value={customMuteDate} onChange={(e) => setCustomMuteDate(e.target.value)} className="block w-full text-sm border-gray-300 rounded-md" />}
                    <button onClick={handleMuteNotifications} className="w-full flex justify-center py-2 bg-indigo-600 text-white text-sm rounded-md"><Clock className="h-4 w-4 mr-2" /> Mute</button>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-900 border-t pt-4">Notification Types</h4>
                <div className="mt-4 space-y-4 max-h-60 overflow-y-auto pr-2">
                  {['payroll_processed', 'payroll_deadline', 'salary_change', 'benefit_change', 'leave_approved', 'leave_rejected', 'attendance_issue', 'system_update'].map(type => (
                    <div key={type} className="flex items-center">
                      <input id={`type-${type}`} type="checkbox" checked={!preferences.mutedTypes.includes(type as any)} onChange={() => handleToggleNotificationType(type as any)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                      <label htmlFor={`type-${type}`} className="ml-3 text-sm text-gray-700">{formatNotificationType(type)}</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <NotificationTestPanel />
          </div> */}
        </div>
      </div>
    </div>
  );
}