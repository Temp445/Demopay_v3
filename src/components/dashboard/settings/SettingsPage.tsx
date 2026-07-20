import React, { useState } from 'react';
import { Cog, User, Building2, Sliders, Bell, Lock, CreditCard, Calendar, Users, FileText, Clock, Database, Upload, DollarSign, Mail, CheckSquare } from 'lucide-react';
import UserSettings from './UserSettings';
import CompanySettings from './CompanySettings';
import FunctionalSettings from './FunctionalSettings';
import MasterDataImport from './MasterDataImport';
import SMTPSettings from './SMTPSettings';
import AttendanceValidationSettings from './AttendanceValidationSettings';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';

type SettingsTab = 'user' | 'company' | 'functional' | 'import' | 'organization' | 'smtp' | 'attendance_validation';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('user');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { user } = useAuth();

  const handleSaveSettings = async (data: any, settingsType: SettingsTab) => {
    try {
      setSaveStatus('saving');
      setErrorMessage(null);

      if (settingsType === 'user' && user) {
        // Save user settings to Supabase profiles table
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            full_name: data.name,
            phone: data.phone,
            user_role: data.user_role,
            email_notifications: data.emailNotifications,
            in_app_notifications: data.inAppNotifications,
            sms_notifications: data.smsNotifications,
            dark_mode: data.darkMode,
            compact_view: data.compactView,
            language: data.language,
            two_factor_enabled: data.twoFactorEnabled,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (updateError) throw updateError;

        // Handle password change if requested
        if (data.newPassword && data.currentPassword) {
          const { error: passwordError } = await supabase.auth.updateUser({
            password: data.newPassword
          });

          if (passwordError) throw passwordError;
        }

        toast.success('Settings saved successfully');
        setSaveStatus('success');
      } else {
        // For other settings types, keep existing behavior
        console.log(`Saving ${settingsType} settings:`, data);
        toast.success('Settings saved successfully');
        setSaveStatus('success');
      }

      // Reset status after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
      const errorMsg = error instanceof Error ? error.message : 'Failed to save settings';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);

      // Reset error after 5 seconds
      setTimeout(() => {
        setSaveStatus('idle');
        setErrorMessage(null);
      }, 5000);
    }
  };

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your account, company, and application settings.
            </p>
          </div>
        </div>

        {/* Status Messages */}
        {saveStatus === 'success' && (
          <div className="mt-4 rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <CheckCircle className="h-5 w-5 text-green-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">
                  Settings saved successfully
                </p>
              </div>
            </div>
          </div>
        )}

        {saveStatus === 'error' && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <XCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800">
                  {errorMessage || 'Failed to save settings'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex">
                <button
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'user'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('user')}
                >
                  <User className="h-5 w-5 inline-block mr-2" />
                  User Settings
                </button>
                <button
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'company'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('company')}
                >
                  <Building2 className="h-5 w-5 inline-block mr-2" />
                  Company Settings
                </button>
                <button
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'import'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('import')}
                >
                  <Upload className="h-5 w-5 inline-block mr-2" />
                  Master Data Import
                </button>
                <button
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'smtp'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('smtp')}
                >
                  <Mail className="h-5 w-5 inline-block mr-2" />
                  SMTP Configuration
                </button>
                <button
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'attendance_validation'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('attendance_validation')}
                >
                  <CheckSquare className="h-5 w-5 inline-block mr-2" />
                  Attendance Validation
                </button>
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'user' && (
                <UserSettings onSave={(data) => handleSaveSettings(data, 'user')} isSaving={saveStatus === 'saving'} />
              )}

              {activeTab === 'company' && (
                <CompanySettings onSave={(data) => handleSaveSettings(data, 'company')} isSaving={saveStatus === 'saving'} />
              )}

              {activeTab === 'functional' && (
                <FunctionalSettings onSave={(data) => handleSaveSettings(data, 'functional')} isSaving={saveStatus === 'saving'} />
              )}

              {activeTab === 'import' && (
                <MasterDataImport />
              )}

              {activeTab === 'smtp' && (
                <SMTPSettings onSave={(data) => handleSaveSettings(data, 'smtp')} isSaving={saveStatus === 'saving'} />
              )}

              {activeTab === 'attendance_validation' && (
                <AttendanceValidationSettings />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Import status icons
import { CheckCircle, XCircle } from 'lucide-react';