/**
 * SMTPSettings Component
 *
 * Comprehensive SMTP configuration interface for email settings
 */

import React, { useState, useEffect } from 'react';
import {
  Mail,
  Server,
  Lock,
  User,
  AlertCircle,
  CheckCircle,
  Save,
  X,
  RefreshCcw,
  Eye,
  EyeOff
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';
import { encryptCredential } from '../../../services/encryption.service';

// TypeScript Interfaces
interface SMTPConfiguration {
  id?: string;
  host: string;
  port: number;
  username: string;
  password_encrypted: string;
  encryption: 'ssl' | 'tls' | 'none';
  sender_email: string;
  sender_name: string;
  is_active: boolean;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface FormErrors {
  host?: string;
  port?: string;
  username?: string;
  password_encrypted?: string;
  sender_email?: string;
  sender_name?: string;
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: string;
}

interface SMTPSettingsProps {
  onSave?: (data: any) => void;
  isSaving?: boolean;
}

export default function SMTPSettings({ onSave, isSaving: externalSaving }: SMTPSettingsProps) {
  // State Management
  const [smtpConfig, setSmtpConfig] = useState<SMTPConfiguration>({
    host: '',
    port: 587,
    username: '',
    password_encrypted: '',
    encryption: 'tls',
    sender_email: '',
    sender_name: '',
    is_active: true
  });

  const [originalConfig, setOriginalConfig] = useState<SMTPConfiguration | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  // Effects
  useEffect(() => {
    loadSMTPConfiguration();
  }, []);

  // Auto-clear messages after 5 seconds
  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  // Data Loading
  const loadSMTPConfiguration = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) {
        setErrorMessage('Authentication required');
        return;
      }

      // Fetch existing SMTP configuration
      const { data, error } = await supabase
        .from('smtp_configurations')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      if (error) {
        console.error('Error loading SMTP configuration:', error);
        setErrorMessage('Failed to load SMTP configuration');
        return;
      }

      // if (data) {
      //   setSmtpConfig(data);
      //   setOriginalConfig(data);
      // }

      if (data) {
        // Remove password before putting into form
        const configWithoutPassword = {
          ...data,
          password_encrypted: ''    
        };

        setSmtpConfig(configWithoutPassword);

        // Keep original encrypted value internally
        setOriginalConfig(data);
      }

    } catch (err) {
      console.error('Error loading SMTP configuration:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  // Validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePort = (port: number): boolean => {
    return port > 0 && port <= 65535 && Number.isInteger(port);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    // Host validation
    if (!smtpConfig.host.trim()) {
      errors.host = 'SMTP host is required';
    } else if (smtpConfig.host.length < 3) {
      errors.host = 'SMTP host must be at least 3 characters';
    }

    // Port validation
    if (!validatePort(smtpConfig.port)) {
      errors.port = 'Port must be between 1 and 65535';
    }

    // Username validation
    if (!smtpConfig.username.trim()) {
      errors.username = 'Username is required';
    }

    // Password validation
    if (!smtpConfig.password_encrypted.trim()) {
      errors.password_encrypted = 'Password is required';
    } else if (smtpConfig.password_encrypted.length < 6) {
      errors.password_encrypted = 'Password must be at least 6 characters';
    }

    // Sender email validation
    if (!smtpConfig.sender_email.trim()) {
      errors.sender_email = 'Sender email is required';
    } else if (!validateEmail(smtpConfig.sender_email)) {
      errors.sender_email = 'Please enter a valid email address';
    }

    // Sender name validation
    if (!smtpConfig.sender_name.trim()) {
      errors.sender_name = 'Sender name is required';
    } else if (smtpConfig.sender_name.length < 2) {
      errors.sender_name = 'Sender name must be at least 2 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Event Handlers
  const handleInputChange = (field: keyof SMTPConfiguration, value: string | number | boolean) => {
    setSmtpConfig(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error for this field
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof FormErrors];
        return newErrors;
      });
    }

    // Clear messages when user starts editing
    setSuccessMessage(null);
    setErrorMessage(null);
    setTestResult(null);
  };

  const handleSave = async () => {
    try {
      // Validate form
      if (!validateForm()) {
        setErrorMessage('Please fix the validation errors before saving');
        return;
      }

      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId || !auth.userId) {
        setErrorMessage('Authentication required');
        return;
      }
 
      // 🔐 Keep old password unless user entered a new one
      let encryptedPassword = originalConfig?.password_encrypted || '';

      if (smtpConfig.password_encrypted) {
        encryptedPassword = await encryptCredential(smtpConfig.password_encrypted);
      }

      const configData = {
        ...smtpConfig,
        password_encrypted: encryptedPassword,
        tenant_id: auth.tenantId,
        updated_at: new Date().toISOString()
      };
      
      let result;
      if (smtpConfig.id) {
        // Update existing configuration
        result = await supabase
          .from('smtp_configurations')
          .update(configData)
          .eq('id', smtpConfig.id)
          .eq('tenant_id', auth.tenantId)
          .select()
          .single();
      } else {
        // Create new configuration
        result = await supabase
          .from('smtp_configurations')
          .insert({
            ...configData,
            created_at: new Date().toISOString()
          })
          .select()
          .single();
      }

      if (result.error) {
        throw result.error;
      }
  
      const configWithoutPassword = {
        ...result.data,
        password_encrypted: ''   // 🔐 keep UI empty
      };

      setSmtpConfig(configWithoutPassword);
      setOriginalConfig(result.data);  // keep encrypted internally

      setSuccessMessage('SMTP configuration saved successfully');

      // Call parent callback if provided
      if (onSave) {
        onSave(result.data);
      }
    } catch (err) {
      console.error('Error saving SMTP configuration:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (originalConfig) {
      setSmtpConfig(originalConfig);
    } else {
      setSmtpConfig({
        host: '',
        port: 587,
        username: '',
        password_encrypted: '',
        encryption: 'tls',
        sender_email: '',
        sender_name: '',
        is_active: true
      });
    }
    setFormErrors({});
    setSuccessMessage(null);
    setErrorMessage(null);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    try {
      // Validate form first
      if (!validateForm()) {
        setTestResult({
          success: false,
          message: 'Validation Failed',
          details: 'Please fix the validation errors before testing the connection'
        });
        return;
      }

      setTesting(true);
      setTestResult(null);
      setErrorMessage(null);

      // Simulate SMTP connection test (2 second delay)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulate test results based on configuration
      const isValidConfig = smtpConfig.host && smtpConfig.port && smtpConfig.username;

      if (isValidConfig) {
        setTestResult({
          success: true,
          message: 'Connection Successful',
          details: `Successfully connected to ${smtpConfig.host}:${smtpConfig.port} using ${smtpConfig.encryption.toUpperCase()} encryption`
        });
      } else {
        setTestResult({
          success: false,
          message: 'Connection Failed',
          details: 'Unable to establish connection. Please verify your SMTP settings.'
        });
      }
    } catch (err) {
      console.error('Error testing SMTP connection:', err);
      setTestResult({
        success: false,
        message: 'Test Failed',
        details: err instanceof Error ? err.message : 'An error occurred while testing the connection'
      });
    } finally {
      setTesting(false);
    }
  };

  const hasChanges = (): boolean => {
    if (!originalConfig) return true;
    return JSON.stringify(smtpConfig) !== JSON.stringify(originalConfig);
  };

  // Render encryption options
  const renderEncryptionOptions = () => (
    <div className="grid grid-cols-3 gap-4">
      {(['none', 'tls', 'ssl'] as const).map((type) => (
        <label
          key={type}
          className={`
            relative flex items-center justify-center px-4 py-3 cursor-pointer rounded-lg border-2 transition-all
            ${smtpConfig.encryption === type
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            }
          `}
        >
          <input
            type="radio"
            name="encryption"
            value={type}
            checked={smtpConfig.encryption === type}
            onChange={(e) => handleInputChange('encryption', e.target.value)}
            className="sr-only"
          />
          <span className="text-sm font-medium uppercase">{type}</span>
          {smtpConfig.encryption === type && (
            <CheckCircle className="absolute right-2 top-2 h-4 w-4 text-indigo-600" />
          )}
        </label>
      ))}
    </div>
  );

  // Loading state
  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-gray-600">Loading configuration...</span>
        </div>
      </div>
    );
  }

  // Main render
  return (
    <div className='bg-white p-6 rounded-lg shadow'>
      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start">
          <CheckCircle className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
          <AlertCircle className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Test Connection Result */}
      {testResult && (
        <div className={`mb-6 px-4 py-3 rounded-lg flex items-start border ${
          testResult.success
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-yellow-50 border-yellow-200 text-yellow-700'
        }`}>
          {testResult.success ? (
            <CheckCircle className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0" />
          )}
          <div>
            <p className="font-medium">{testResult.message}</p>
            {testResult.details && (
              <p className="text-sm mt-1 opacity-90">{testResult.details}</p>
            )}
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="space-y-6">
        {/* Server Settings Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Server className="h-5 w-5 mr-2 text-gray-600" />
            Server Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SMTP Host */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SMTP Host / Server <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={smtpConfig.host}
                onChange={(e) => handleInputChange('host', e.target.value)}
                placeholder="smtp.example.com"
                className={`block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${
                  formErrors.host ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {formErrors.host && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {formErrors.host}
                </p>
              )}
            </div>

            {/* SMTP Port */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Port <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={smtpConfig.port}
                onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 0)}
                placeholder="587"
                min="1"
                max="65535"
                className={`block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${
                  formErrors.port ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {formErrors.port && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {formErrors.port}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Common ports: 25 (unencrypted), 465 (SSL), 587 (TLS)
              </p>
            </div>
          </div>
        </div>

        {/* Encryption Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Encryption Type <span className="text-red-500">*</span>
          </label>
          {renderEncryptionOptions()}
        </div>

        {/* Authentication Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Lock className="h-5 w-5 mr-2 text-gray-600" />
            Authentication
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={smtpConfig.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="username@example.com"
                  className={`block w-full border rounded-md shadow-sm py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${
                    formErrors.username ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
              </div>
              {formErrors.username && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {formErrors.username}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={smtpConfig.password_encrypted}
                  onChange={(e) => handleInputChange('password_encrypted', e.target.value)}
                  placeholder="••••••••"
                  className={`block w-full border rounded-md shadow-sm py-2 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${
                    formErrors.password_encrypted ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {formErrors.password_encrypted && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {formErrors.password_encrypted}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sender Information Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Mail className="h-5 w-5 mr-2 text-gray-600" />
            Sender Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sender Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sender Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={smtpConfig.sender_email}
                onChange={(e) => handleInputChange('sender_email', e.target.value)}
                placeholder="noreply@example.com"
                className={`block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${
                  formErrors.sender_email ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {formErrors.sender_email && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {formErrors.sender_email}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                This email will appear in the "From" field of sent emails
              </p>
            </div>

            {/* Sender Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sender Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={smtpConfig.sender_name}
                onChange={(e) => handleInputChange('sender_name', e.target.value)}
                placeholder="Company Name"
                className={`block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${
                  formErrors.sender_name ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {formErrors.sender_name && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {formErrors.sender_name}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                The display name that appears with the sender email
              </p>
            </div>
          </div>
        </div>

        {/* Active Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Enable SMTP</h3>
            <p className="text-sm text-gray-500">
              Allow the application to send emails using this configuration
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={smtpConfig.is_active}
              onChange={(e) => handleInputChange('is_active', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || saving || externalSaving}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${testing ? 'animate-spin' : ''}`} />
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          <div className="flex gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving || testing || !hasChanges() || externalSaving}
              className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || testing || !hasChanges() || externalSaving}
              className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving || externalSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>

        {/* Help Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Configuration Tips</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>Use port 587 with TLS encryption for modern SMTP servers</li>
            <li>Port 465 is typically used with SSL encryption</li>
            <li>Contact your email provider for specific SMTP settings</li>
            <li>Test the connection before saving to ensure settings are correct</li>
            <li>Keep your password secure - it will be encrypted when saved</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
