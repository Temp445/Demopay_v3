import React, { useState } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { NotificationType, sendNotification } from '../../../lib/notifications';
import { getUserEmployeeData } from '../../../lib/roleBasedAccess';

export default function NotificationTestPanel() {
  const [type, setType] = useState<NotificationType>('payroll_processed');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('/dashboard');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { user, tenantId } = useAuth();

  // Fetch employee ID on mount
  React.useEffect(() => {
    if (user) {
      getUserEmployeeData(user.id).then(({ employeeId: eid, role }) => {
        setEmployeeId(eid);
        setIsAdmin(role?.toLowerCase().includes('admin') || role?.toLowerCase().includes('hr'));
      });
    }
  }, [user]);

  const handleSendTestNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    setSending(true);
    setSuccess(false);
    setError(null);
    
    try {
      if (!employeeId && !isAdmin) {
        throw new Error('Employee ID not found. Only Admins can send test notifications without a linked employee record.');
      }

      await sendNotification(
        employeeId, // This can be null for admins
        tenantId || '',
        type,
        title,
        message,
        { test: true },
        link
      );
      
      setSuccess(true);
      
      // Reset form
      setTitle('');
      setMessage('');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Test Notifications</h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Send yourself a test notification to verify the system is working
        </p>
      </div>

      <div className="px-4 py-5 sm:p-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <CheckCircle className="h-5 w-5 text-green-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">
                  Test notification sent successfully!
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSendTestNotification} className="space-y-4">
          <div>
            <label htmlFor="notification-type" className="block text-sm font-medium text-gray-700">
              Notification Type
            </label>
            <select
              id="notification-type"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              value={type}
              onChange={(e) => setType(e.target.value as NotificationType)}
            >
              <option value="payroll_processed">Payroll Processed</option>
              <option value="payroll_deadline">Payroll Deadline</option>
              <option value="salary_change">Salary Change</option>
              <option value="benefit_change">Benefit Change</option>
              <option value="leave_approved">Leave Approved</option>
              <option value="leave_rejected">Leave Rejected</option>
              <option value="attendance_issue">Attendance Issue</option>
              <option value="system_update">System Update</option>
            </select>
          </div>

          <div>
            <label htmlFor="notification-title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              type="text"
              id="notification-title"
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter notification title"
              required
            />
          </div>

          <div>
            <label htmlFor="notification-message" className="block text-sm font-medium text-gray-700">
              Message
            </label>
            <textarea
              id="notification-message"
              rows={3}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter notification message"
              required
            />
          </div>

          <div>
            <label htmlFor="notification-link" className="block text-sm font-medium text-gray-700">
              Link (optional)
            </label>
            <input
              type="text"
              id="notification-link"
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/dashboard/payroll"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Sending...' : 'Send Test Notification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Import CheckCircle icon
import { CheckCircle } from 'lucide-react';