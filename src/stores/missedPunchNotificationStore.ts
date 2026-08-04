/**
 * Missed Punch Notification Store
 *
 * Manages:
 * - Per-tenant notification settings (loaded from / saved to Supabase)
 * - Running a manual missing-punch check for a given date
 * - Sending email notifications via EmailSenderService
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { validateAuth } from './utils/storeUtils';
import { detectMissingPunches, type MissingPunchRecord } from '../services/missedPunchDetector';
import { buildMissingPunchEmailHtml, buildMissingPunchEmailSubject } from '../services/missedPunchEmailTemplate';
import { EmailSenderService } from '../services/email-sender.service';

// ─── Settings shape (mirrors DB table) ───────────────────────────────────────

export interface MissedPunchNotificationSettings {
  id?: string;
  tenant_id?: string;
  is_enabled: boolean;
  notify_via_email: boolean;
  notify_via_app: boolean;
  notify_employee: boolean;
  notify_reporting_head: boolean;
  notify_hr_admin: boolean;
  grace_buffer_start_minutes: number;
  grace_buffer_end_minutes: number;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationRunResult {
  record: MissingPunchRecord;
  status: 'sent' | 'failed' | 'no_email';
  error?: string;
}

// ─── Default Settings ─────────────────────────────────────────────────────────

const defaultSettings: MissedPunchNotificationSettings = {
  is_enabled: true,
  notify_via_email: true,
  notify_via_app: true,
  notify_employee: true,
  notify_reporting_head: true,
  notify_hr_admin: false,
  grace_buffer_start_minutes: 30,
  grace_buffer_end_minutes: 30,
};

// ─── Store Interface ──────────────────────────────────────────────────────────

interface MissedPunchNotificationStore {
  settings: MissedPunchNotificationSettings;
  loading: boolean;
  saving: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastResults: NotificationRunResult[];
  error: string | null;

  fetchSettings: () => Promise<void>;
  saveSettings: (updates: Partial<MissedPunchNotificationSettings>) => Promise<void>;
  runNotificationCheck: (date: string) => Promise<{ sent: number; failed: number; noEmail: number }>;
  reset: () => void;
}

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useMissedPunchNotificationStore = create<MissedPunchNotificationStore>((set, get) => ({
  settings: defaultSettings,
  loading: false,
  saving: false,
  running: false,
  lastRunAt: null,
  lastResults: [],
  error: null,

  /**
   * Load settings from `missed_punch_notification_settings` table.
   * Falls back to defaults if no row exists yet.
   */
  fetchSettings: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) return;

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('missed_punch_notification_settings')
        .select('id, tenant_id, is_enabled, notify_via_email, notify_via_app, notify_employee, notify_reporting_head, notify_hr_admin, grace_buffer_start_minutes, grace_buffer_end_minutes, created_at, updated_at')
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      set({ settings: data ?? defaultSettings, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load settings', loading: false });
    }
  },

  /**
   * Upsert settings to the DB.
   */
  saveSettings: async (updates) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) return;

    set({ saving: true, error: null });

    const merged: MissedPunchNotificationSettings = {
      ...get().settings,
      ...updates,
      tenant_id: auth.tenantId,
      updated_at: new Date().toISOString(),
    };

    try {
      const { data: existing } = await supabase
        .from('missed_punch_notification_settings')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      let result;
      if (existing?.id) {
        result = await supabase
          .from('missed_punch_notification_settings')
          .update(merged)
          .eq('id', existing.id)
          .select()
          .single();
      } else {
        result = await supabase
          .from('missed_punch_notification_settings')
          .insert({ ...merged, created_at: new Date().toISOString() })
          .select()
          .single();
      }

      if (result.error) throw result.error;

      set({ settings: result.data, saving: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to save settings', saving: false });
      throw err;
    }
  },

  /**
   * Run the missing-punch check for a given date and send email/app notifications.
   * Returns a summary of { sent, failed, noEmail }.
   */
  runNotificationCheck: async (date: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    const { settings } = get();
    if (!settings.is_enabled) {
      throw new Error('Missing punch notifications are disabled');
    }
    
    if (!settings.notify_via_email && !settings.notify_via_app) {
      throw new Error('Both email and app delivery methods are disabled');
    }

    set({ running: true, error: null, lastResults: [] });

    try {
      const { data: companyData } = await supabase
        .from('company_settings')
        .select('company_name')
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();
      const companyName = companyData?.company_name || 'Your Company';

      const missingRecords = await detectMissingPunches(
        auth.tenantId,
        date,
        settings.grace_buffer_start_minutes,
        settings.grace_buffer_end_minutes
      );

      if (missingRecords.length === 0) {
        set({ running: false, lastRunAt: new Date().toISOString(), lastResults: [] });
        return { sent: 0, failed: 0, noEmail: 0 };
      }

      let hrAdminEmails: string[] = [];
      if (settings.notify_hr_admin) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('email, user_role')
          .eq('tenant_id', auth.tenantId)
          .in('user_role', ['Admin', 'HR', 'Super Admin']);
        hrAdminEmails = (profiles || []).map((p: any) => p.email).filter(Boolean);
      }

      const reportingHeadEmailCache = new Map<string, string>();
      if (settings.notify_reporting_head) {
        const { data: employees } = await supabase
          .from('employees')
          .select('id, email')
          .eq('tenant_id', auth.tenantId);
        (employees || []).forEach((e: any) => {
          reportingHeadEmailCache.set(e.id, e.email);
        });
      }

      const results: NotificationRunResult[] = [];

      for (const record of missingRecords) {
        const subject = buildMissingPunchEmailSubject(record, companyName);
        const html = buildMissingPunchEmailHtml(record, companyName);
        
        const recipientEmails: string[] = [];
        const appRecipientIds: string[] = [];

        if (settings.notify_employee) {
          if (record.employee_email) recipientEmails.push(record.employee_email);
          if (record.employee_id) appRecipientIds.push(record.employee_id);
        }

        if (settings.notify_reporting_head && record.reporting_to) {
          const reportingIds = Array.isArray(record.reporting_to)
            ? record.reporting_to
            : [record.reporting_to];
            
          for (const rid of reportingIds) {
            appRecipientIds.push(rid);
            const email = reportingHeadEmailCache.get(rid);
            if (email && !recipientEmails.includes(email)) {
              recipientEmails.push(email);
            }
          }
        }

        if (settings.notify_hr_admin) {
          // HR Admins only get emails for now, or we could look up their IDs
          for (const email of hrAdminEmails) {
            if (!recipientEmails.includes(email)) {
              recipientEmails.push(email);
            }
          }
        }

        let sentApp = false;
        let sentEmail = false;
        let emailErr: string | undefined;

        // 1. Send App Notifications
        if (settings.notify_via_app && appRecipientIds.length > 0) {
          try {
            const [y, m, d] = record.date.split('-');
            const dateStr = new Date(Number(y), Number(m)-1, Number(d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const formatTime = (timeStr: string) => {
              if (!timeStr) return '';
              const [h, min] = timeStr.split(':');
              const hour = parseInt(h, 10);
              const ampm = hour >= 12 ? 'PM' : 'AM';
              const hr12 = hour % 12 || 12;
              return `${hr12.toString().padStart(2, '0')}:${min} ${ampm}`;
            };
            const message = `Missing ${record.missingType === 'MISSING_IN' ? 'Clock-In' : 'Clock-Out'} for shift ${record.shift_name} (${formatTime(record.shift_start_time)} - ${formatTime(record.shift_end_time)}) on ${dateStr}. Employee: ${record.employee_name}`;
            
            // Insert notifications for all unique app recipients
            const uniqueAppIds = [...new Set(appRecipientIds)];
            
            // Note: fire and forget or await all
            await Promise.all(
              uniqueAppIds.map(userId => 
                supabase.from('user_notifications').insert({
                  tenant_id: auth.tenantId,
                  user_id: userId,
                  type: 'system',
                  title: 'Missing Attendance',
                  message,
                  is_read: false
                })
              )
            );
            sentApp = true;
          } catch (e) {
            console.error('[MissedPunchNotification] App notification failed:', e);
          }
        }

        // 2. Send Emails
        if (settings.notify_via_email && recipientEmails.length > 0) {
          const [primaryTo, ...ccList] = recipientEmails;
          try {
            await EmailSenderService.sendEmail({
              tenant_id: auth.tenantId,
              user_id: auth.userId || 'system',
              to: primaryTo,
              cc: ccList.length > 0 ? ccList : undefined,
              subject,
              html,
            });
            sentEmail = true;
          } catch (sendErr) {
            console.error('[MissedPunchNotification] Email send failed:', sendErr);
            emailErr = sendErr instanceof Error ? sendErr.message : 'Unknown email error';
          }
        }

        // Evaluate Status
        if (!sentApp && !sentEmail) {
           if (!settings.notify_via_email && !settings.notify_via_app) {
              // Should not happen due to earlier check, but just in case
              results.push({ record, status: 'no_email' });
           } else if (settings.notify_via_email && recipientEmails.length === 0) {
              results.push({ record, status: 'no_email' });
           } else {
              results.push({
                record,
                status: 'failed',
                error: emailErr || 'Failed to send via enabled methods',
              });
           }
        } else {
           results.push({ record, status: 'sent' });
        }
      }

      const sent = results.filter(r => r.status === 'sent').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const noEmail = results.filter(r => r.status === 'no_email').length;

      set({
        running: false,
        lastRunAt: new Date().toISOString(),
        lastResults: results,
      });

      return { sent, failed, noEmail };
    } catch (err) {
      set({ running: false, error: err instanceof Error ? err.message : 'Check failed' });
      throw err;
    }
  },

  reset: () => {
    set({
      settings: defaultSettings,
      loading: false,
      saving: false,
      running: false,
      lastRunAt: null,
      lastResults: [],
      error: null,
    });
  },
}));
