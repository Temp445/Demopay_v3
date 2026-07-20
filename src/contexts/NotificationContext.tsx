import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import {
  NotificationType,
  CustomNotification,
  initializeNotifications,
  addNotificationListener,
  getUserNotifications,
  getUnreadNotificationCount,
  sendNotification
} from '../lib/notifications';
import { getUserEmployeeData } from '../lib/roleBasedAccess';

interface NotificationContextType {
  notifications: CustomNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  sendTestNotification: (type: NotificationType, title: string, message: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function getWorkNotificationTitle(notificationType: string): string {
  switch (notificationType) {
    case 'assignment': return 'Work Location Assigned';
    case 'cancellation': return 'Work Location Cancelled';
    case 'work_started': return 'Work Started';
    case 'work_paused': return 'Work Paused';
    case 'work_resumed': return 'Work Resumed';
    case 'work_completed': return 'Work Completed';
    case 'violation': return 'Location Boundary Violation';
    default: return 'Work Location Update';
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<CustomNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Initialize notifications when user is available
  useEffect(() => {
    if (!user) return;

    // Fetch employee data first
    getUserEmployeeData(user.id).then(({ employeeId: eid, role, tenantId: tid }) => {
      setEmployeeId(eid);
      setTenantId(tid);
      setIsAdmin(role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'hr team');
    });

    // Initialize WebSocket connection (still uses Auth UUID for backend auth/query)
    initializeNotifications(user.id);

    // Set up notification listener
    const removeListener = addNotificationListener((notification) => {
      // We now allow all links (including mobile styles) to pass through
      // Mapping is handled in the UI components
      const isWebNotif = true; 
      if (!isWebNotif) return;

      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico'
        });
      }
    });

    const workNotificationChannel = supabase
      .channel(`work-location-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'work_location_notifications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            notification_type: string;
            message: string;
            title?: string;
            created_at: string;
          };

          const notification: CustomNotification = {
            id: row.id,
            user_id: user.id,
            type: 'attendance_issue' as NotificationType,
            title: row.title || getWorkNotificationTitle(row.notification_type),
            message: row.message,
            is_read: false,
            created_at: row.created_at,
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(notification.title, {
              body: notification.message,
              icon: '/favicon.ico',
            });
          }
        }
      )
      .subscribe();

    return () => {
      removeListener();
      supabase.removeChannel(workNotificationChannel);
    };
  }, [user]);

  // Load initial notifications when employeeId is available
  useEffect(() => {
    if (!user || (!employeeId && !isAdmin) || !tenantId) return;

    const loadNotifications = async () => {
      setLoading(true);
      try {
        const [notifs, count] = await Promise.all([
          getUserNotifications(employeeId, tenantId, 10, 0, true, isAdmin),
          getUnreadNotificationCount(employeeId, tenantId, isAdmin)
        ]);
        setNotifications(notifs);
        setUnreadCount(count);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, [user, employeeId]);

  // Function to send a test notification
  const sendTestNotification = async (type: NotificationType, title: string, message: string) => {
    if (!tenantId) return;
    if (!employeeId && !isAdmin) return;
    
    try {
      await sendNotification(employeeId, tenantId, type, title, message);
    } catch (err) {
      console.error('Failed to send test notification:', err);
    }
  };

  const value = {
    notifications,
    unreadCount,
    loading,
    error,
    sendTestNotification
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}