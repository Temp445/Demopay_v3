import { create } from 'zustand';

export type NotificationType = 'payroll_processed' | 'payroll_deadline' | 'salary_change' | 'benefit_change' | 'leave_approved' | 'leave_rejected' | 'attendance_issue' | 'system_update';

export interface CustomNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  muted_until?: string | null;
  muted_types?: NotificationType[];
}

interface NotificationsStore {
  items: CustomNotification[];
  loading: boolean;
  error: string | null;
  preferences: NotificationPreferences | null;
  fetchNotifications: (userId: string, limit?: number, offset?: number, includeRead?: boolean) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  fetchPreferences: (userId: string) => Promise<void>;
  updatePreferences: (userId: string, prefs: Partial<NotificationPreferences>) => Promise<void>;
  muteNotifications: (userId: string, duration: string, customDate?: Date) => Promise<void>;
  unmuteNotifications: (userId: string) => Promise<void>;
  toggleNotificationType: (userId: string, type: NotificationType, muted: boolean) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsStore>((set) => ({
  items: [],
  loading: false,
  error: null,
  preferences: null,
  fetchNotifications: async () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  deleteNotification: async () => {},
  fetchPreferences: async () => {},
  updatePreferences: async () => {},
  muteNotifications: async () => {},
  unmuteNotifications: async () => {},
  toggleNotificationType: async () => {},
}));
