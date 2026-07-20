import { supabase } from './supabase';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

// Notification types
export type NotificationType =
  | 'payroll_processed'
  | 'payroll_deadline'
  | 'salary_change'
  | 'benefit_change'
  | 'leave_request'
  | 'leave_approved'
  | 'leave_rejected'
  | 'leave_cancelled'
  | 'leave_status_change'
  | 'advance_request'
  | 'advance_status_change'
  | 'permission_request'
  | 'permission_status_change'
  | 'gatepass_request'
  | 'gatepass_status_change'
  | 'attendance_issue'
  | 'system_update';

export interface CustomNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  data?: Record<string, any>;
  link?: string;
}

export interface NotificationPreferences {
  user_id: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  muted_until?: string | null;
  muted_types?: NotificationType[];
  created_at?: string;
  updated_at?: string;
}

// WebSocket connection
let socket: Socket | null = null;
let notificationListeners: ((notification: CustomNotification) => void)[] = [];

// Initialize WebSocket connection
export function initializeNotifications(userId: string): void {
  // Close existing connection if any
  if (socket) {
    socket.disconnect();
  }

  // Connect to WebSocket server
  const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || 'wss://api.acepayroll.com';
  socket = io(wsUrl, {
    auth: {
      token: supabase.auth.getSession().then(({ data }) => data.session?.access_token)
    },
    query: {
      userId
    }
  });

  // Set up event listeners
  socket.on('connect', () => {
    console.log('WebSocket connected');
  });

  socket.on('notification', (notification: CustomNotification) => {
    // ── REMOVED ─────────────────────────────────────────────────────────────
    // Do NOT store notifications received via WebSocket here. 
    // They are already persisted to 'user_notifications' on the sender side
    // (using helper functions) or by the backend.
    // ────────────────────────────────────────────────────────────────────────

    // Notify all listeners
    notificationListeners.forEach(listener => listener(notification));
  });

  socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
  });

  // socket.on('error', (error) => {
  //   console.error('WebSocket error:', error);
  // });
}

// Add notification listener
export function addNotificationListener(listener: (notification: CustomNotification) => void): () => void {
  notificationListeners.push(listener);

  // Return function to remove listener
  return () => {
    notificationListeners = notificationListeners.filter(l => l !== listener);
  };
}

// Store notification in local database
async function storeNotification(notification: CustomNotification): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_notifications')
      .insert([notification]);

    if (error) {
      console.error('Error storing notification:', error);
    }
  } catch (error) {
    console.error('Failed to store notification:', error);
  }
}

// Get user notifications
export async function getUserNotifications(
  userId: string | null,
  tenantId: string,
  limit: number = 20,
  offset: number = 0,
  includeRead: boolean = false,
  isAdmin: boolean = false
): Promise<CustomNotification[]> {
  let query = supabase
    .from('user_notifications')
    .select('*')
    .eq('tenant_id', tenantId);

  // If Admin, include broadcasts. If Employee, only their own records.
  if (isAdmin) {
    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    } else {
      query = query.is('user_id', null);
    }
  } else if (userId) {
    query = query.eq('user_id', userId);
  } else {
    return [];
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!includeRead) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }

  return data || [];
}

// Get unread notification count
export async function getUnreadNotificationCount(
  userId: string | null,
  tenantId: string,
  isAdmin: boolean = false
): Promise<number> {
  let query = supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (isAdmin) {
    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    } else {
      query = query.is('user_id', null);
    }
  } else if (userId) {
    query = query.eq('user_id', userId);
  } else {
    return 0;
  }

  const { count, error } = await query
    .eq('is_read', false);

  if (error) {
    console.error('Error fetching unread count:', error);
    return 0;
  }

  return count || 0;
}

// Mark notification as read
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification as read:', error);
  }
}

// Mark all notifications as read for a user (or broadcast for admins)
export async function markAllNotificationsAsRead(
  userId: string | null,
  tenantId: string,
  isAdmin: boolean = false
): Promise<void> {
  let query = supabase
    .from('user_notifications')
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('is_read', false);

  if (isAdmin) {
    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    } else {
      query = query.is('user_id', null);
    }
  } else if (userId) {
    query = query.eq('user_id', userId);
  } else {
    return;
  }

  const { error } = await query;
  if (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}
// Delete notification
export async function deleteNotification(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('user_notifications')
    .delete()
    .eq('id', notificationId);

  if (error) {
    console.error('Error deleting notification:', error);
  }
}

// Get user notification preferences
export async function getUserNotificationPreferences(userId: string): Promise<NotificationPreferences | null> {
  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No preferences found, create default preferences
      return createDefaultNotificationPreferences(userId);
    }
    console.error('Error fetching notification preferences:', error);
    return null;
  }

  return data;
}

// Create default notification preferences
async function createDefaultNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const defaultPreferences: NotificationPreferences = {
    user_id: userId,
    email_enabled: true,
    in_app_enabled: true,
    muted_until: null,
    muted_types: []
  };

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .insert([defaultPreferences])
    .select()
    .single();

  if (error) {
    console.error('Error creating default notification preferences:', error);
    return defaultPreferences;
  }

  return data;
}

// Update user notification preferences
export async function updateNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<NotificationPreferences | null> {
  const { data, error } = await supabase
    .from('user_notification_preferences')
    .update(preferences)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating notification preferences:', error);
    return null;
  }

  return data;
}

// Mute notifications temporarily
export async function muteNotifications(
  userId: string,
  duration: '1h' | '8h' | '24h' | '7d' | 'custom',
  customDate?: Date
): Promise<void> {
  let muteUntil: Date;

  const now = new Date();

  switch (duration) {
    case '1h':
      muteUntil = new Date(now.getTime() + 60 * 60 * 1000);
      break;
    case '8h':
      muteUntil = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      break;
    case '24h':
      muteUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      break;
    case '7d':
      muteUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'custom':
      if (!customDate) {
        throw new Error('Custom date is required for custom duration');
      }
      muteUntil = customDate;
      break;
  }

  await updateNotificationPreferences(userId, {
    muted_until: muteUntil.toISOString()
  });
}

// Unmute notifications
export async function unmuteNotifications(userId: string): Promise<void> {
  await updateNotificationPreferences(userId, {
    muted_until: null
  });
}

// Toggle notification type mute
export async function toggleNotificationType(
  userId: string,
  type: NotificationType,
  muted: boolean
): Promise<void> {
  const preferences = await getUserNotificationPreferences(userId);

  if (!preferences) {
    return;
  }

  let mutedTypes = preferences.muted_types || [];

  if (muted && !mutedTypes.includes(type)) {
    mutedTypes.push(type);
  } else if (!muted) {
    mutedTypes = mutedTypes.filter(t => t !== type);
  }

  await updateNotificationPreferences(userId, {
    muted_types: mutedTypes
  });
}

// Send notification (for testing and manual notifications)
export async function sendNotification(
  userId: string | null,
  tenantId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, any>,
  link?: string
): Promise<CustomNotification | null> {
  const notification: CustomNotification = {
    id: uuidv4(),
    user_id: userId,
    tenant_id: tenantId,
    type,
    title,
    message,
    is_read: false,
    created_at: new Date().toISOString(),
    data,
    link
  };

  try {
    // Store in database
    const { error } = await supabase
      .from('user_notifications')
      .insert([notification]);

    if (error) {
      console.error('Error sending notification to database:', error);
      console.error('Payload:', notification);
      return null;
    }
    
    console.log('Notification created successfully in database:', notification.id);

    // Notify listeners
    notificationListeners.forEach(listener => listener(notification));

    return notification;
  } catch (error) {
    console.error('Failed to send notification:', error);
    return null;
  }
}

/**
 * Leave Request Notification Helpers (Dual Insert)
 */
export async function notifyAdminsLeaveRequest(
  tenantId: string,
  employeeName: string,
  leaveTypeName: string,
  startDate: string,
  endDate: string,
  requestId: string
): Promise<void> {
  try {
    const formattedStart = new Date(startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedEnd = new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Single Unified Broadcast (Mobile format link, compatible with both)
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: null,
      tenant_id: tenantId,
      type: 'leave_request',
      title: '📋 New Leave Request',
      message: `${employeeName} requested ${leaveTypeName} leave from ${formattedStart} to ${formattedEnd}.`,
      is_read: false,
      data: { requestId, employeeName, leaveTypeName, startDate, endDate },
      link: 'LeaveRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyAdminsLeaveRequest] failed:', err);
  }
}

export async function notifyReportingHeadsLeaveRequest(
  tenantId: string,
  employeeName: string,
  leaveTypeName: string,
  startDate: string,
  endDate: string,
  requestId: string,
  managerUserIds: string[]
): Promise<void> {
  try {
    if (!managerUserIds || managerUserIds.length === 0) return;
    
    const formattedStart = new Date(startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedEnd = new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const notifications = managerUserIds.map(userId => ({
      id: uuidv4(),
      user_id: userId,
      tenant_id: tenantId,
      type: 'leave_request' as NotificationType,
      title: '📋 New Leave Request',
      message: `${employeeName} requested ${leaveTypeName} leave from ${formattedStart} to ${formattedEnd}.`,
      is_read: false,
      data: { requestId, employeeName, leaveTypeName, startDate, endDate },
      link: 'LeaveRequest',
      created_at: new Date().toISOString(),
    }));

    await supabase.from('user_notifications').insert(notifications);
  } catch (err) {
    console.error('[notifyReportingHeadsLeaveRequest] failed:', err);
  }
}

export async function notifyEmployeeLeaveDecision(
  employeeId: string,
  tenantId: string,
  status: 'Approved' | 'Rejected' | 'Cancelled',
  leaveTypeName: string,
  startDate: string,
  endDate: string,
  requestId: string,
  employeeName: string = 'Employee'
): Promise<void> {
  try {
    const formattedStart = new Date(startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedEnd = new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const statusEmoji = status === 'Approved' ? '✅' : status === 'Rejected' ? '❌' : '🚫';

    // Single Unified Notification (Mobile format link, compatible with both)
    const notifType = status === 'Approved' ? 'leave_approved' : status === 'Rejected' ? 'leave_rejected' : 'leave_cancelled';

    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: employeeId,
      tenant_id: tenantId,
      type: notifType as NotificationType,
      title: `${statusEmoji} Leave ${status}`,
      message: `Hi ${employeeName.split(' ')[0]}, your ${leaveTypeName} leave request (${formattedStart} to ${formattedEnd}) has been ${status.toLowerCase()}.`,
      is_read: false,
      data: { requestId, newStatus: status, leaveTypeName, startDate, endDate },
      link: 'LeaveRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyEmployeeLeaveDecision] failed:', err);
  }
}

/**
 * Advance Request Notification Helpers (Dual Insert)
 */
export async function notifyAdminsAdvanceRequest(
  tenantId: string,
  employeeName: string,
  amount: number,
  requestId: string
): Promise<void> {
  try {
    // Single Unified Broadcast
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: null,
      tenant_id: tenantId,
      type: 'advance_request',
      title: '💰 New Advance Request',
      message: `${employeeName} has requested an advance of ${amount}.`,
      is_read: false,
      data: { requestId, employeeName, amount },
      link: 'AdvanceRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyAdminsAdvanceRequest] failed:', err);
  }
}

export async function notifyReportingHeadsAdvanceRequest(
  tenantId: string,
  employeeName: string,
  amount: number,
  requestId: string,
  managerUserIds: string[]
): Promise<void> {
  try {
    if (!managerUserIds || managerUserIds.length === 0) return;

    const notifications = managerUserIds.map(userId => ({
      id: uuidv4(),
      user_id: userId,
      tenant_id: tenantId,
      type: 'advance_request' as NotificationType,
      title: '💰 New Advance Request',
      message: `${employeeName} has requested an advance of ${amount}.`,
      is_read: false,
      data: { requestId, employeeName, amount },
      link: 'AdvanceRequest',
      created_at: new Date().toISOString(),
    }));

    await supabase.from('user_notifications').insert(notifications);
  } catch (err) {
    console.error('[notifyReportingHeadsAdvanceRequest] failed:', err);
  }
}

export async function notifyEmployeeAdvanceDecision(
  employeeId: string,
  tenantId: string,
  status: 'Approved' | 'Rejected' | 'Cancelled',
  amount: number,
  requestId: string,
  employeeName: string = 'Employee'
): Promise<void> {
  try {
    const statusEmoji = status === 'Approved' ? '✅' : '❌';

    // Single Unified Notification
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: employeeId,
      tenant_id: tenantId,
      type: 'advance_status_change',
      title: `${statusEmoji} Advance ${status}`,
      message: `Hi ${employeeName.split(' ')[0]}, your advance request of ${amount} has been ${status.toLowerCase()}.`,
      is_read: false,
      data: { requestId, newStatus: status, amount },
      link: 'AdvanceRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyEmployeeAdvanceDecision] failed:', err);
  }
}

export async function notifyAdminsAdvanceCancelled(
  tenantId: string,
  employeeName: string,
  amount: number,
  requestId: string
): Promise<void> {
  try {
    // Single Unified Broadcast
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: null,
      tenant_id: tenantId,
      type: 'advance_status_change',
      title: '🚫 Advance Request Cancelled',
      message: `${employeeName} has cancelled their advance request of ${amount}.`,
      is_read: false,
      data: { requestId, employeeName, amount },
      link: 'AdvanceRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyAdminsAdvanceCancelled] failed:', err);
  }
}

/**
 * Permission Request Notification Helpers (Dual Insert)
 */
export async function notifyAdminsPermissionRequest(
  tenantId: string,
  employeeName: string,
  date: string,
  startTime: string,
  endTime: string,
  requestId: string
): Promise<void> {
  try {
    // Single Unified Broadcast
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: null,
      tenant_id: tenantId,
      type: 'permission_request',
      title: '🕒 New Permission Request',
      message: `${employeeName} requested permission for ${date} (${startTime} - ${endTime}).`,
      is_read: false,
      data: { requestId, employeeName, date, startTime, endTime },
      link: 'PermissionRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyAdminsPermissionRequest] failed:', err);
  }
}

export async function notifyReportingHeadsPermissionRequest(
  tenantId: string,
  employeeName: string,
  date: string,
  startTime: string,
  endTime: string,
  requestId: string,
  managerUserIds: string[]
): Promise<void> {
  try {
    if (!managerUserIds || managerUserIds.length === 0) return;

    const notifications = managerUserIds.map(userId => ({
      id: uuidv4(),
      user_id: userId,
      tenant_id: tenantId,
      type: 'permission_request' as NotificationType,
      title: '🕒 New Permission Request',
      message: `${employeeName} requested permission for ${date} (${startTime} - ${endTime}).`,
      is_read: false,
      data: { requestId, employeeName, date, startTime, endTime },
      link: 'PermissionRequest',
      created_at: new Date().toISOString(),
    }));

    await supabase.from('user_notifications').insert(notifications);
  } catch (err) {
    console.error('[notifyReportingHeadsPermissionRequest] failed:', err);
  }
}

export async function notifyEmployeePermissionDecision(
  employeeId: string,
  tenantId: string,
  status: 'Approved' | 'Rejected' | 'Cancelled',
  date: string,
  requestId: string,
  employeeName: string = 'Employee'
): Promise<void> {
  try {
    const statusEmoji = status === 'Approved' ? '✅' : '❌';

    // Single Unified Notification
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: employeeId,
      tenant_id: tenantId,
      type: 'permission_status_change',
      title: `${statusEmoji} Permission ${status}`,
      message: `Hi ${employeeName.split(' ')[0]}, your permission request for ${date} has been ${status.toLowerCase()}.`,
      is_read: false,
      data: { requestId, newStatus: status, date },
      link: 'PermissionRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyEmployeePermissionDecision] failed:', err);
  }
}

export async function notifyAdminsPermissionCancelled(
  tenantId: string,
  employeeName: string,
  date: string,
  requestId: string
): Promise<void> {
  try {
    // Single Unified Broadcast
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: null,
      tenant_id: tenantId,
      type: 'permission_status_change',
      title: '🚫 Permission Request Cancelled',
      message: `${employeeName} has cancelled their permission request for ${date}.`,
      is_read: false,
      data: { requestId, employeeName, date },
      link: 'PermissionRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyAdminsPermissionCancelled] failed:', err);
  }
}

/**
 * Gate Pass Request Notification Helpers (Dual Insert)
 */
export async function notifyAdminsGatePassRequest(
  tenantId: string,
  employeeName: string,
  date: string,
  startTime: string,
  requestId: string
): Promise<void> {
  try {
    // Single Unified Broadcast
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: null,
      tenant_id: tenantId,
      type: 'gatepass_request',
      title: '🚪 New Gate Pass Request',
      message: `${employeeName} requested a gate pass for ${date} at ${startTime}.`,
      is_read: false,
      data: { requestId, employeeName, date, startTime },
      link: 'GatePassRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyAdminsGatePassRequest] failed:', err);
  }
}

export async function notifyReportingHeadsGatePassRequest(
  tenantId: string,
  employeeName: string,
  date: string,
  startTime: string,
  requestId: string,
  managerUserIds: string[]
): Promise<void> {
  try {
    if (!managerUserIds || managerUserIds.length === 0) return;

    const notifications = managerUserIds.map(userId => ({
      id: uuidv4(),
      user_id: userId,
      tenant_id: tenantId,
      type: 'gatepass_request' as NotificationType,
      title: '🚪 New Gate Pass Request',
      message: `${employeeName} requested a gate pass for ${date} at ${startTime}.`,
      is_read: false,
      data: { requestId, employeeName, date, startTime },
      link: 'GatePassRequest',
      created_at: new Date().toISOString(),
    }));

    await supabase.from('user_notifications').insert(notifications);
  } catch (err) {
    console.error('[notifyReportingHeadsGatePassRequest] failed:', err);
  }
}

export async function notifyEmployeeGatePassDecision(
  employeeId: string,
  tenantId: string,
  status: 'Approved' | 'Rejected' | 'Cancelled',
  date: string,
  time: string,
  requestId: string,
  employeeName: string = 'Employee'
): Promise<void> {
  try {
    const statusEmoji = status === 'Approved' ? '✅' : '❌';

    // Single Unified Notification
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: employeeId,
      tenant_id: tenantId,
      type: 'gatepass_status_change',
      title: `${statusEmoji} Gate Pass ${status}`,
      message: `Hi ${employeeName.split(' ')[0]}, your gate pass request for ${date} at ${time} has been ${status.toLowerCase()}.`,
      is_read: false,
      data: { requestId, newStatus: status, date, time },
      link: 'GatePassRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyEmployeeGatePassDecision] failed:', err);
  }
}

export async function notifyAdminsGatePassCancelled(
  tenantId: string,
  employeeName: string,
  date: string,
  requestId: string
): Promise<void> {
  try {
    // Single Unified Broadcast
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: null,
      tenant_id: tenantId,
      type: 'gatepass_status_change',
      title: '🚫 Gate Pass Cancelled',
      message: `${employeeName} has cancelled their gate pass for ${date}.`,
      is_read: false,
      data: { requestId, employeeName, date },
      link: 'GatePassRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyAdminsGatePassCancelled] failed:', err);
  }
}

export async function notifyAdminsLeaveCancelled(
  tenantId: string,
  employeeName: string,
  leaveTypeName: string,
  startDate: string,
  endDate: string,
  requestId: string
): Promise<void> {
  try {
    const formattedStart = new Date(startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedEnd = new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Single Unified Broadcast
    await supabase.from('user_notifications').insert({
      id: uuidv4(),
      user_id: null,
      tenant_id: tenantId,
      type: 'leave_status_change',
      title: '🚫 Leave Request Cancelled',
      message: `${employeeName} has cancelled their ${leaveTypeName} request (${formattedStart} to ${formattedEnd}).`,
      is_read: false,
      data: { requestId, employeeName, leaveTypeName, startDate, endDate },
      link: 'LeaveRequest',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notifyAdminsLeaveCancelled] failed:', err);
  }
}

// Check for upcoming payroll deadlines and send notifications
export async function checkPayrollDeadlines(): Promise<void> {
  try {
    // Get payroll settings
    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('*, tenant_id')
      .single();

    if (settingsError) {
      console.error('Error fetching company settings:', settingsError);
      return;
    }

    // Calculate next payroll date
    const now = new Date();
    let nextPayrollDate: Date;

    switch (settings.pay_period_type) {
      case 'monthly':
        // Set to payment day of current month
        nextPayrollDate = new Date(now.getFullYear(), now.getMonth(), parseInt(settings.payment_day));
        // If already passed, move to next month
        if (nextPayrollDate < now) {
          nextPayrollDate = new Date(now.getFullYear(), now.getMonth() + 1, parseInt(settings.payment_day));
        }
        break;
      case 'biweekly':
        // This is a simplified calculation
        // In a real app, you'd need to track the biweekly schedule
        nextPayrollDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        break;
      default:
        // Default to 2 weeks from now
        nextPayrollDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    }

    // Check if within 3 days
    const daysUntilPayroll = Math.floor((nextPayrollDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntilPayroll <= 3 && daysUntilPayroll >= 0) {
      // 1. Get user preferences
      const { data: prefs, error: prefsError } = await supabase
        .from('user_notification_preferences')
        .select('user_id')
        .eq('in_app_enabled', true)
        .is('muted_until', null);

      if (prefsError || !prefs || prefs.length === 0) return;

      const userIds = prefs.map(p => p.user_id);

      // 2. Get profiles to get emails
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);

      if (!profiles || profiles.length === 0) return;

      const emails = profiles.map(p => p.email).filter(Boolean);

      // 3. Get employees corresponding to those emails
      const emailFilters = emails.map(e => `email.ilike.${e}`).join(',');
      const { data: employees } = await supabase
        .from('employees')
        .select('id, email')
        .eq('tenant_id', settings.tenant_id)
        .or(emailFilters);

      if (employees && employees.length > 0) {
        const payrollNotifications = employees.map(emp => ({
          id: uuidv4(),
          user_id: emp.id,
          type: 'payroll_deadline' as NotificationType,
          title: 'Upcoming Payroll Deadline',
          message: `The next payroll deadline is in ${daysUntilPayroll} day${daysUntilPayroll === 1 ? '' : 's'}.`,
          is_read: false,
          data: { payrollDate: nextPayrollDate.toISOString() },
          link: '/dashboard/payroll',
          created_at: new Date().toISOString(),
          tenant_id: settings.tenant_id
        }));

        await supabase.from('user_notifications').insert(payrollNotifications);
      }
    }
  } catch (error) {
    console.error('Error checking payroll deadlines:', error);
  }
}