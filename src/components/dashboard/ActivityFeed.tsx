import React, { useEffect, useState } from 'react';
import { Clock, UserPlus, Calendar, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { validateAuth } from '../../stores/utils/storeUtils';
import { formatDistanceToNow } from 'date-fns';

interface Activity {
  id: string;
  type: 'employee' | 'leave' | 'attendance' | 'payroll';
  person: string;
  action: string;
  target?: string;
  date: string;
  timestamp: Date;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentActivity();
  }, []);

  const fetchRecentActivity = async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      setLoading(false);
      return;
    }

    try {
      const allActivities: Activity[] = [];

      // Fetch recent employees (last 5)
      const { data: employees } = await supabase
        .from('employees')
        .select('id, name, created_at')
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (employees) {
        employees.forEach(emp => {
          allActivities.push({
            id: `emp-${emp.id}`,
            type: 'employee',
            person: 'System',
            action: 'added new employee',
            target: emp.name,
            date: emp.created_at,
            timestamp: new Date(emp.created_at),
          });
        });
      }

      // Fetch recent leave requests (last 5)
      const { data: leaveRequests } = await supabase
        .from('leave_requests')
        .select(`
          id,
          status,
          created_at,
          employee:employees(name)
        `)
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (leaveRequests) {
        leaveRequests.forEach(leave => {
          const employeeName = (leave.employee as any)?.name || 'Unknown';
          allActivities.push({
            id: `leave-${leave.id}`,
            type: 'leave',
            person: employeeName,
            action: `submitted leave request (${leave.status})`,
            target: '',
            date: leave.created_at,
            timestamp: new Date(leave.created_at),
          });
        });
      }

      // Fetch recent attendance (last 5)
      const { data: attendance } = await supabase
        .from('attendance_logs')
        .select(`
          id,
          check_in,
          employee:employees(name)
        `)
        .eq('tenant_id', auth.tenantId)
        .order('check_in', { ascending: false })
        .limit(5);

      if (attendance) {
        attendance.forEach(att => {
          const employeeName = (att.employee as any)?.name || 'Unknown';
          allActivities.push({
            id: `att-${att.id}`,
            type: 'attendance',
            person: employeeName,
            action: 'checked in',
            target: '',
            date: att.check_in,
            timestamp: new Date(att.check_in),
          });
        });
      }

      // Sort all activities by timestamp and take the latest 8
      allActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setActivities(allActivities.slice(0, 8));
    } catch (error) {
      console.error('Error fetching activity feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'employee':
        return UserPlus;
      case 'leave':
        return Calendar;
      case 'attendance':
        return CheckCircle;
      case 'payroll':
        return Clock;
      default:
        return Clock;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg">
        <div className="p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Activity Feed</h3>
          <div className="mt-6 flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <span className="ml-3 text-sm text-gray-500">Loading activities...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">Activity Feed</h3>
        {activities.length === 0 ? (
          <div className="mt-6 text-center py-8 text-sm text-gray-500">
            No recent activity found.
          </div>
        ) : (
          <div className="flow-root mt-6">
            <ul className="-mb-8">
              {activities.map((activity, activityIdx) => {
                const IconComponent = getActivityIcon(activity.type);
                return (
                  <li key={activity.id}>
                    <div className="relative pb-8">
                      {activityIdx !== activities.length - 1 ? (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                            activity.type === 'employee' ? 'bg-blue-100' :
                            activity.type === 'leave' ? 'bg-yellow-100' :
                            activity.type === 'attendance' ? 'bg-green-100' :
                            'bg-gray-100'
                          }`}>
                            <IconComponent className={`h-5 w-5 ${
                              activity.type === 'employee' ? 'text-blue-600' :
                              activity.type === 'leave' ? 'text-yellow-600' :
                              activity.type === 'attendance' ? 'text-green-600' :
                              'text-gray-500'
                            }`} />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-gray-500">
                              <span className="font-medium text-gray-900">{activity.person}</span>{' '}
                              {activity.action}{' '}
                              {activity.target && (
                                <span className="font-medium text-gray-900">{activity.target}</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            <time dateTime={activity.date}>{formatDate(activity.date)}</time>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}