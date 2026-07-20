import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Bell, Eye, Shield } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

import toast from 'react-hot-toast';

export default function UserSettings() {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    user_role: 'Employee',
    emailNotifications: true,
    inAppNotifications: true,
    smsNotifications: false,
    darkMode: false,
    compactView: false,
    language: 'en',
    twoFactorEnabled: false
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load user profile data from database
    const loadUserProfile = async () => {
      if (!user) return;

      try {
        setLoading(true);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error loading profile:', error);
          // Set basic user data even if profile fetch fails
          setFormData(prev => ({
            ...prev,
            email: user.email || '',
            name: user.email?.split('@')[0] || ''
          }));
        } else if (profile) {
          // Load all profile data
          setFormData(prev => ({
            ...prev,
            email: profile.email || user.email || '',
            name: profile.full_name || user.email?.split('@')[0] || '',
            phone: profile.phone || '',
            user_role: profile.user_role || 'Employee',
            emailNotifications: profile.email_notifications ?? true,
            inAppNotifications: profile.in_app_notifications ?? true,
            smsNotifications: profile.sms_notifications ?? false,
            darkMode: profile.dark_mode ?? false,
            compactView: profile.compact_view ?? false,
            language: profile.language || 'en',
            twoFactorEnabled: profile.two_factor_enabled ?? false
          }));
        }
      } catch (error) {
        console.error('Failed to load user profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserProfile();
  }, [user]);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    // Email validation
    if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
      errors.email = 'Invalid email address';
    }

    // Phone validation (optional)
    if (formData.phone && !/^\+?[0-9]{10,15}$/.test(formData.phone)) {
      errors.phone = 'Invalid phone number';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !user) return;

    try {
      setIsSaving(true);

      // Save user settings to Supabase profiles table
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: formData.name,
          phone: formData.phone,
          user_role: formData.user_role,
          email_notifications: formData.emailNotifications,
          in_app_notifications: formData.inAppNotifications,
          sms_notifications: formData.smsNotifications,
          dark_mode: formData.darkMode,
          compact_view: formData.compactView,
          language: formData.language,
          two_factor_enabled: formData.twoFactorEnabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;


      toast.success('Settings saved successfully');
    } catch (error: any) {
      console.error('Error saving user settings:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Show loading state while fetching profile data
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-white p-6 rounded-lg shadow'>
      <h2 className="text-lg font-medium text-gray-900">Profile Settings</h2>
      <p className="mt-1 text-sm text-gray-500">
        Manage your personal information, security settings, and preferences.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-8">
        {/* Profile Information */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <User className="h-5 w-5 mr-2 text-indigo-500" />
            Profile Information
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="name"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0  flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <span className='pl-8 '>{formData.email}</span>
                {/* <input
                  type="email"
                  id="email"
                  className={`pl-10 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.email ? 'border-red-300' : ''
                  }`}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  readOnly
                /> */}
              </div>
              {validationErrors.email && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.email}</p>
              )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  id="phone"
                  className={`pl-10 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.phone ? 'border-red-300' : ''
                  }`}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              {validationErrors.phone && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.phone}</p>
              )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="user_role" className="block text-sm font-medium text-gray-700">
                Role
              </label>
              <span className="block mt-1 text-sm text-gray-900">{formData.user_role}</span>
              {/* <select
                id="user_role"
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                value={formData.user_role}
                onChange={(e) => setFormData({ ...formData, user_role: e.target.value })}
                disabled
              >
                <option>Admin</option>
                <option>HR Team</option>
                <option>Employee</option>
              </select> */}
              <p className="mt-2 text-xs text-gray-500">Role changes require administrator approval</p>
            </div>
          </div>
        </div>


        {/* Notification Preferences */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Bell className="h-5 w-5 mr-2 text-indigo-500" />
            Notification Preferences
          </h3>
          <div className="mt-4 space-y-4">
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="email-notifications"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={formData.emailNotifications}
                  onChange={(e) => setFormData({ ...formData, emailNotifications: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="email-notifications" className="font-medium text-gray-700">
                  Email Notifications
                </label>
                <p className="text-gray-500">Receive notifications via email</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="in-app-notifications"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={formData.inAppNotifications}
                  onChange={(e) => setFormData({ ...formData, inAppNotifications: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="in-app-notifications" className="font-medium text-gray-700">
                  In-App Notifications
                </label>
                <p className="text-gray-500">Receive notifications within the application</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="sms-notifications"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={formData.smsNotifications}
                  onChange={(e) => setFormData({ ...formData, smsNotifications: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="sms-notifications" className="font-medium text-gray-700">
                  SMS Notifications
                </label>
                <p className="text-gray-500">Receive notifications via SMS (requires verified phone number)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Display Preferences */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Eye className="h-5 w-5 mr-2 text-indigo-500" />
            Display Preferences
          </h3>
          <div className="mt-4 space-y-4">
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="dark-mode"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={formData.darkMode}
                  onChange={(e) => setFormData({ ...formData, darkMode: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="dark-mode" className="font-medium text-gray-700">
                  Dark Mode
                </label>
                <p className="text-gray-500">Use dark theme for the application interface</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="compact-view"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={formData.compactView}
                  onChange={(e) => setFormData({ ...formData, compactView: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="compact-view" className="font-medium text-gray-700">
                  Compact View
                </label>
                <p className="text-gray-500">Display more information in less space</p>
              </div>
            </div>

            <div>
              <label htmlFor="language" className="block text-sm font-medium text-gray-700">
                Language
              </label>
              <select
                id="language"
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Shield className="h-5 w-5 mr-2 text-indigo-500" />
            Two-Factor Authentication
          </h3>
          <div className="mt-4">
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="two-factor-auth"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={formData.twoFactorEnabled}
                  onChange={(e) => setFormData({ ...formData, twoFactorEnabled: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="two-factor-auth" className="font-medium text-gray-700">
                  Enable Two-Factor Authentication
                </label>
                <p className="text-gray-500">
                  Add an extra layer of security to your account by requiring a verification code in addition to your password
                </p>
              </div>
            </div>
            
            {formData.twoFactorEnabled && (
              <div className="mt-4 p-4 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-700">
                  Two-factor authentication is enabled. You will receive a verification code via email when signing in.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Configure 2FA Settings
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-5 border-t border-gray-200">
          <div className="flex justify-end">
            <button
              type="button"
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>

      {/* User Management Section - Only visible to Admin and HR Team */}
      {/* <UserManagement currentUserRole={formData.user_role} /> */}
    </div>
  );
}