import React, { useState, useEffect } from 'react';
import { Mail, Send, Loader2, CheckCircle, AlertCircle, Users, UserPlus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getTenantId } from '../../../lib/tenantDb';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { EmailSenderService } from '../../../services/email-sender.service';

interface Employee {
  id: string;
  name: string;
  email: string;
  status: string;
  is_reporting_head?: boolean;
  inviteStatus?: 'pending' | 'accepted' | 'expired' | null;
  inviteExpiresAt?: string | null;
}

interface InviteResult {
  email: string;
  success: boolean;
  error?: string;
}

export default function EmployeeInvitePage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inviteResults, setInviteResults] = useState<InviteResult[]>([]);

  // HR Team form state
  const [hrName, setHrName] = useState('');
  const [hrEmail, setHrEmail] = useState('');
  const [hrSending, setHrSending] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string; email?: string }>({});

  useEffect(() => {
    loadEmployees();
    
    // Optional: Refresh the list every 60 seconds since invites expire in 1 day
    const interval = setInterval(loadEmployees, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadEmployees = async () => {
    try {
      const tenantId = await getTenantId();

      // Fetch employees and invitations in parallel
      const [empResponse, invResponse] = await Promise.all([
        supabase
          .from('employees')
          .select('id, name, email, status, is_reporting_head')
          .eq('tenant_id', tenantId)
          .eq('status', 'Active')
          .order('name'),
        supabase
          .from('user_invitations')
          .select('id, email, status, expires_at') // Added 'id' here to update rows later
          .eq('tenant_id', tenantId)
      ]);

      if (empResponse.error) throw empResponse.error;
      if (invResponse.error) throw invResponse.error;

      const empData = empResponse.data || [];
      let invData = invResponse.data || [];

      const now = new Date();

      // 1. Check for 'pending' invites that have passed their 1-day expires_at time
      const expiredPending = invData.filter(
        i => i.status === 'pending' && new Date(i.expires_at) < now
      );

      // 2. Automatically transition them to 'expired' in the database
      if (expiredPending.length > 0) {
        for (const inv of expiredPending) {
          // Delete any existing 'expired' row for this email to prevent unique constraint violation
          await supabase
            .from('user_invitations')
            .delete()
            .eq('email', inv.email)
            .eq('status', 'expired')
            .eq('tenant_id', tenantId);

          // Update the pending row to expired
          await supabase
            .from('user_invitations')
            .update({ status: 'expired' })
            .eq('id', inv.id);
        }

        // Update local invData so UI reflects the change immediately without refetching
        invData = invData.map(inv => {
          if (expiredPending.find(e => e.id === inv.id)) {
            return { ...inv, status: 'expired' };
          }
          return inv;
        });
      }

      // Map invitation status to employees
      const combinedData: Employee[] = empData.map(emp => {
        const empInvites = invData.filter(i => i.email === emp.email);
        
        const accepted = empInvites.find(i => i.status === 'accepted');
        const pending = empInvites.find(i => i.status === 'pending');
        const expired = empInvites.find(i => i.status === 'expired');

        let inviteStatus = null;
        let inviteExpiresAt = null;

        if (accepted) {
          inviteStatus = 'accepted';
        } else if (pending) {
          inviteStatus = 'pending';
          inviteExpiresAt = pending.expires_at;
        } else if (expired) {
          inviteStatus = 'expired';
        }

        return { ...emp, inviteStatus: inviteStatus as any, inviteExpiresAt };
      });

      // Filter out employees who have already accepted
      const availableEmployees = combinedData.filter(emp => emp.inviteStatus !== 'accepted');
      setEmployees(availableEmployees);
    } catch (error) {
      console.error('Error loading employees:', error);
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Only allow selecting employees who do not have a pending invite
  const selectableEmployees = filteredEmployees.filter(emp => emp.inviteStatus !== 'pending');

  const toggleEmployee = (employeeId: string) => {
    const newSelected = new Set(selectedEmployees);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setSelectedEmployees(newSelected);
  };

  const toggleAll = () => {
    if (selectedEmployees.size === selectableEmployees.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(selectableEmployees.map(e => e.id)));
    }
  };


  //  const sendInviteEmail  = async (email: string, name: string, role: 'Employee' | 'HR Team'): Promise<InviteResult> => {
  //   const response = await fetch(import.meta.env.VITE_Email_SERVER_URL + "/send", {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify(
  //       {
  //         "provider": "smtp",
  //         "config": {
  //           "host": "smtp.example.com",
  //           "port": 587,
  //           "secure": false,
  //           "auth": {
  //             "user": "username",
  //             "pass": "password"
  //           }
  //         },
  //         "message": {
  //           "from": "sender@example.com",
  //           "to": email,
  //           "subject": "Test email",
  //           "text": "Hello from ace-email-hub",
  //           "html": "<p>Hello from ace-email-hub</p>"
  //         }
  //       }
         
  //       ),
  //   });

  //   const data = await response.json();

  //   if (!response.ok) {
  //     throw new Error(data.error || "Email send failed");
  //   }

  //   return data;
  // };


  const sendInvite = async (email: string, name: string, role: 'Employee' | 'HR Team' | 'Reporting Head'): Promise<InviteResult> => {
    try {
      const tenantId = await getTenantId();
      
      // const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      // const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // const response = await fetch(`${supabaseUrl}/functions/v1/send-invite-email`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${supabaseAnonKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     email,
      //     name,
      //     role,
      //     tenant_id: tenantId,
      //   }),
      // });

      // if (!response.ok) {
      //   const errorData = await response.json();
      //   throw new Error(errorData.error || 'Failed to send invite');
      // }
  
      const inviteToken = crypto.randomUUID();

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // ✅ Save invitation using Supabase client
      const { data: invitation, error: invitationError } =
        await supabase
          .from('user_invitations')
          .insert({
            email,
            name,
            role,
            token: inviteToken,
            tenant_id: tenantId,
            expires_at: expiresAt,
            status: 'pending',
          })
          .select()
          .single();

      if (invitationError) {
        throw new Error(
          invitationError.message ||
          'Failed to create invitation record'
        );
      }

      // Create invitation link with custom token
      const inviteLink = `${window.location.origin}/accept-invite?token=${inviteToken}`;

      const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background-color: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          .credentials { background-color: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Our Payroll Platform</h1>
          </div>
          <div class="content">
            <p>Hello ${name},</p>
            <p>You have been invited to join our Payroll platform as <strong>${role}</strong>.</p>
            <p>Please click the button below to accept the invitation and create your account:</p>
            <p style="text-align: center;">
              <a href="${inviteLink}" class="button">Accept Invitation</a>
            </p>
            <div class="credentials">
              <p style="margin: 0 0 10px 0;"><strong>Your Login Email:</strong></p>
              <p style="margin: 0; font-family: monospace; background-color: #f5f5f5; padding: 8px; border-radius: 3px;">${email}</p>
              <p style="margin: 15px 0 5px 0; font-size: 12px; color: #666;">You will set your password when you accept the invitation.</p>
            </div>
            <p>This invitation link will expire in 7 days.</p>
            <p>If you did not expect this invitation, you can safely ignore this email.</p>
            <p>Best regards,<br>Payroll Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

      await EmailSenderService.sendEmail({
        tenant_id: tenantId,
        user_id: user?.id || '',
        to: email,
        subject: "Invite",
        html: emailHtml,
      });
 
      return { email, success: true };
    } catch (error) {
      return {
        email,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const handleSendEmployeeInvites = async () => {
    if (selectedEmployees.size === 0) {
      toast.error('Please select at least one employee');
      return;
    }

    const tenantId = await getTenantId();
    // Check SMTP configuration
    const { data: smtpConfig, error: smtpError } = await supabase
      .from('smtp_configurations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)    
      .maybeSingle();

    if (smtpError) {
      toast.error('Failed to check SMTP configuration');
      return;
    }

    if (!smtpConfig) {
      alert('SMTP configuration not found. Please configure SMTP settings before sending invitations.');
      return;
    }

    setSending(true);
    setInviteResults([]);

    const selectedEmps = employees.filter(e => selectedEmployees.has(e.id));
    const results: InviteResult[] = [];

    for (const emp of selectedEmps) {
      // If there's an existing expired invite, clean it up before sending a new one
      // to avoid triggering the DB unique constraint in the edge function
      if (emp.inviteStatus === 'expired') {
        await supabase
          .from('user_invitations')
          .delete()
          .eq('email', emp.email)
          .eq('status', 'expired')
          .eq('tenant_id', tenantId);
      }

      const result = await sendInvite(emp.email, emp.name, emp.is_reporting_head ? 'Reporting Head' : 'Employee');
      results.push(result);
    }

    setInviteResults(results);
    setSending(false);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    if (successCount > 0) {
      toast.success(`${successCount} invitation(s) sent successfully`);
      await loadEmployees(); // Refresh list to reflect new pending statuses
    }
    if (failCount > 0) {
      toast.error(`${failCount} invitation(s) failed`);
    }

    setSelectedEmployees(new Set());
  };

  const validateHRForm = (): boolean => {
    const errors: { name?: string; email?: string } = {};

    if (!hrName.trim()) {
      errors.name = 'Name is required';
    }

    if (!hrEmail.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hrEmail)) {
      errors.email = 'Invalid email format';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSendHRInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateHRForm()) {
      return;
    }

    setHrSending(true);
    const tenantId = await getTenantId();

    // Verify if this email already has an active or pending invitation
    const { data: existingInvites, error: fetchError } = await supabase
      .from('user_invitations')
      .select('status, expires_at')
      .eq('email', hrEmail)
      .eq('tenant_id', tenantId);

    if (!fetchError && existingInvites) {
      const accepted = existingInvites.find(i => i.status === 'accepted');
      const pending = existingInvites.find(i => i.status === 'pending');
      const expired = existingInvites.find(i => i.status === 'expired');

      if (accepted) {
        toast.error('An active user with this email ID already exists.');
        setHrSending(false);
        return;
      }

      if (pending) {
        const now = new Date();
        if (new Date(pending.expires_at) > now) {
          const expiryDate = new Date(pending.expires_at).toLocaleTimeString();
          toast.error(`An invitation is already pending for this email. Expires at: ${expiryDate}`);
          setHrSending(false);
          return;
        }
      }

      // Cleanup old expired row to avoid unique constraint clash on insert
      if (expired) {
        await supabase
          .from('user_invitations')
          .delete()
          .eq('email', hrEmail)
          .eq('status', 'expired')
          .eq('tenant_id', tenantId);
      }
    }

    const result = await sendInvite(hrEmail, hrName, 'HR Team');
    setHrSending(false);

    if (result.success) {
      toast.success(`Invitation sent to ${hrEmail}`);
      setHrName('');
      setHrEmail('');
      setFormErrors({});
      await loadEmployees(); // Refresh list in case the HR email was in the employee list
    } else {
      toast.error(result.error || 'Failed to send invitation');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center gap-3">
          <UserPlus className="h-8 w-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Employee Invite</h1>
            <p className="text-sm text-gray-600">Send login invitations to employees and HR team members</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-semibold text-gray-900">Employee Invitations</h2>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Select existing employees to send login invitations. They will receive the "Employee" role.
          </p>

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search employees by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Employee List */}
          <div className="border border-gray-200 rounded-md max-h-96 overflow-y-auto mb-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                <span className="ml-2 text-gray-600">Loading employees...</span>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No employees found or all have accepted invitations
              </div>
            ) : (
              <>
                {/* Select All */}
                <div className="sticky top-0 bg-gray-50 border-b border-gray-200 px-4 py-2 z-10">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={selectableEmployees.length === 0}
                      checked={selectedEmployees.size === selectableEmployees.length && selectableEmployees.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">
                      Select All Available ({selectableEmployees.length})
                    </span>
                  </label>
                </div>

                {/* Employee Items */}
                {filteredEmployees.map((employee) => {
                  const isPending = employee.inviteStatus === 'pending';
                  const isExpired = employee.inviteStatus === 'expired';

                  return (
                    <div
                      key={employee.id}
                      className={`border-b border-gray-200 last:border-b-0 ${
                        isPending ? 'bg-gray-50 opacity-75' : 'hover:bg-gray-50'
                      }`}
                    >
                      <label className={`flex items-start px-4 py-3 ${isPending ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          disabled={isPending}
                          checked={selectedEmployees.has(employee.id)}
                          onChange={() => toggleEmployee(employee.id)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded mt-1 disabled:bg-gray-200"
                        />
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900">{employee.name}</p>
                          <p className="text-sm text-gray-500">{employee.email}</p>
                          
                          {isPending && employee.inviteExpiresAt && (
                            <p className="text-xs font-medium text-amber-600 mt-1 flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Pending (Expires: {new Date(employee.inviteExpiresAt).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })})
                            </p>
                          )}
                          {isExpired && (
                            <p className="text-xs font-medium text-red-600 mt-1 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Expired - Ready to resend
                            </p>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Send Button */}
          <button
            onClick={handleSendEmployeeInvites}
            disabled={selectedEmployees.size === 0 || sending}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium ${
              selectedEmployees.size === 0 || sending
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {sending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Sending Invites...
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                Send Invites ({selectedEmployees.size})
              </>
            )}
          </button>

          {/* Results */}
          {inviteResults.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-medium text-gray-700">Invitation Results:</h3>
              {inviteResults.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2 text-sm p-2 rounded ${
                    result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  }`}
                >
                  {result.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <span className="flex-1">{result.email}</span>
                  {!result.success && result.error && (
                    <span className="text-xs">({result.error})</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HR Team Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-semibold text-gray-900">HR Team Invitation</h2>
          </div>

          <p className="text-sm text-gray-600 mb-6">
            Invite a new HR team member. They will receive the "HR Team" role with full access.
          </p>

          <form onSubmit={handleSendHRInvite} className="space-y-4">
            {/* Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={hrName}
                onChange={(e) => {
                  setHrName(e.target.value);
                  if (formErrors.name) {
                    setFormErrors({ ...formErrors, name: undefined });
                  }
                }}
                placeholder="Enter full name"
                className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  formErrors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {formErrors.name && (
                <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
              )}
            </div>

            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={hrEmail}
                onChange={(e) => {
                  setHrEmail(e.target.value);
                  if (formErrors.email) {
                    setFormErrors({ ...formErrors, email: undefined });
                  }
                }}
                placeholder="Enter email address"
                className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  formErrors.email ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {formErrors.email && (
                <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Important:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>The invite will be sent to the email address provided</li>
                    <li>The recipient will have <strong>1 day</strong> to accept the invitation</li>
                    <li>They will automatically receive "HR Team" role upon login</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={hrSending}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium ${
                hrSending
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {hrSending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending Invite...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Send Invite
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-2">Before sending invitations:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Ensure SMTP settings are configured in Settings → SMTP Configuration</li>
              <li>Verify that employee email addresses are correct</li>
              <li>Invitation links will expire after <strong>1 day</strong></li>
              <li>Recipients will need to set their password upon first login</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}