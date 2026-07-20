import { useState, useEffect, useRef } from 'react';
import { UserCheck, UserX, LogOut, LogIn, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

interface VisitorNotif {
  id: string;
  type: 'entry_approved' | 'entry_rejected' | 'exit_confirmed' | 'exit_denied';
  visitorName: string;
  timestamp: Date;
}

const NOTIF_DURATION_MS = 6000;

const NOTIF_CONFIG = {
  entry_approved: {
    label: 'Visitor Entry Approved',
    icon: <UserCheck className="w-4 h-4" />,
    color: 'bg-emerald-600 border-emerald-400',
    textColor: 'text-emerald-50',
  },
  entry_rejected: {
    label: 'Visitor Entry Rejected',
    icon: <UserX className="w-4 h-4" />,
    color: 'bg-red-700 border-red-500',
    textColor: 'text-red-50',
  },
  exit_confirmed: {
    label: 'Visitor Exit Approved',
    icon: <LogOut className="w-4 h-4" />,
    color: 'bg-emerald-700 border-emerald-400',
    textColor: 'text-emerald-50',
  },
  exit_denied: {
    label: 'Visitor Exit Denied',
    icon: <LogIn className="w-4 h-4" />,
    color: 'bg-amber-700 border-amber-400',
    textColor: 'text-amber-50',
  },
};

// Map DB notification_type values to our UI types
function dbTypeToUiType(dbType: string, confirmed?: boolean): VisitorNotif['type'] | null {
  if (dbType === 'entry_approved') return 'entry_approved';
  if (dbType === 'entry_rejected') return 'entry_rejected';
  if (dbType === 'exit_confirmed') return 'exit_confirmed';
  if (dbType === 'exit_denied') return 'exit_denied';
  // Legacy: confirmation_required with is_read=true means the employee responded
  // We detect the outcome via a separate channel so skip raw inserts of this type
  return null;
}

export default function VisitorNotificationBar() {
  const { tenantId } = useAuth();
  const [notifs, setNotifs] = useState<VisitorNotif[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = (id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
  };

  const push = (notif: VisitorNotif) => {
    setNotifs(prev => [notif, ...prev].slice(0, 5));
    const t = setTimeout(() => dismiss(notif.id), NOTIF_DURATION_MS);
    timersRef.current.set(notif.id, t);
  };

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`visitor-notif-bar-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'visitor_notifications',
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const row = payload.new as any;
          const uiType = dbTypeToUiType(row.notification_type);
          if (!uiType) return;

          // Fetch visitor name for the toast
          let visitorName = 'Visitor';
          if (row.visitor_id) {
            const { data } = await supabase
              .from('attendance_visitor')
              .select('visitor_name')
              .eq('id', row.visitor_id)
              .maybeSingle();
            if (data?.visitor_name) visitorName = data.visitor_name;
          }

          push({
            id: row.id ?? Math.random().toString(),
            type: uiType,
            visitorName,
            timestamp: new Date(),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'attendance_visitor',
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;

          // When visitor_status changes to 'exited', it means the employee APPROVED exit
          if (newRow.visitor_status === 'exited' && oldRow.visitor_status === 'exit_pending') {
            push({
              id: `exit-confirmed-${newRow.id}-${Date.now()}`,
              type: 'exit_confirmed',
              visitorName: newRow.visitor_name || 'Visitor',
              timestamp: new Date(),
            });
          }

          // When visitor_status goes back to 'approved' from 'exit_pending' (denied)
          if (newRow.visitor_status === 'approved' && oldRow.visitor_status === 'exit_pending') {
            push({
              id: `exit-denied-${newRow.id}-${Date.now()}`,
              type: 'exit_denied',
              visitorName: newRow.visitor_name || 'Visitor',
              timestamp: new Date(),
            });
          }

          // When visitor_status changes to 'approved' from 'verification_pending' (entry approved)
          if (newRow.visitor_status === 'approved' && oldRow.visitor_status === 'verification_pending') {
            push({
              id: `entry-approved-${newRow.id}-${Date.now()}`,
              type: 'entry_approved',
              visitorName: newRow.visitor_name || 'Visitor',
              timestamp: new Date(),
            });
          }

          // When visitor_status changes to 'rejected' (entry rejected)
          if (newRow.visitor_status === 'rejected' && oldRow.visitor_status === 'verification_pending') {
            push({
              id: `entry-rejected-${newRow.id}-${Date.now()}`,
              type: 'entry_rejected',
              visitorName: newRow.visitor_name || 'Visitor',
              timestamp: new Date(),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [tenantId]);

  if (notifs.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
      {notifs.map(notif => {
        const cfg = NOTIF_CONFIG[notif.type];
        return (
          <div
            key={notif.id}
            className={`
              flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-2xl
              backdrop-blur-xl pointer-events-auto
              animate-[slideDown_0.35s_ease-out]
              ${cfg.color}
            `}
            style={{ minWidth: 280, maxWidth: 420 }}
          >
            <span className={`shrink-0 ${cfg.textColor}`}>{cfg.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${cfg.textColor}`}>{cfg.label}</p>
              <p className={`text-xs opacity-80 truncate ${cfg.textColor}`}>{notif.visitorName}</p>
            </div>
            <button
              onClick={() => dismiss(notif.id)}
              className={`shrink-0 opacity-60 hover:opacity-100 transition-opacity ${cfg.textColor}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
