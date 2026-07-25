import React, { useState, useEffect } from 'react';
import { Building2, MapPin,ScanFace , CreditCard, Calendar, Users, FileText, Workflow, Shield, Loader2, AlertCircle, ToggleRight, ToggleLeft, Eye, EyeOff, CheckCircle2, Play } from 'lucide-react';
import { useSettingsStore, type CompanySettings as CompanySettingsType, type CompanyStatutorySettings } from '../../../stores/settingsStore';
import toast from 'react-hot-toast';
import CompanyLocations from './CompanyLocations';


export default function CompanySettings() {
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'locations' | 'integrations'>('general');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingApiKey, setIsTestingApiKey] = useState(false);
  const [apiKeyTestResult, setApiKeyTestResult] = useState<'success' | 'error' | null>(null);
  const [apiKeyErrorMessage, setApiKeyErrorMessage] = useState('');
  const {
    companySettings,
    companyStatutorySettings,
    loading,
    error,
    fetchCompanySettings,
    saveCompanySettings,
    fetchCompanyStatutorySettings,
    saveCompanyStatutorySettings
  } = useSettingsStore();

  const [formData, setFormData] = useState({
    // Company Information
    companyName: '',
    legalName: '',
    taxId: '',
    registrationNumber: '',
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'United States'
    },
    phone: '',
    email: '',
    website: '',

    // Pay Period Settings
    payPeriodType: 'monthly',
    payPeriodStartDay: '1',
    payPeriodEndDay: 'last',

    // Bank Details
    bankName: '',
    accountNumber: '',
    routingNumber: '',
    accountType: 'checking',

    // Approval Workflow
    requireApprovalForPayroll: true,
    approvalLevels: 1,
    approverRoles: ['Manager'],

    // Department Structure
    departmentStructure: [
      { id: '1', name: 'Engineering', costCenter: 'CC001' },
      { id: '2', name: 'Marketing', costCenter: 'CC002' },
      { id: '3', name: 'Sales', costCenter: 'CC003' },
      { id: '4', name: 'Human Resources', costCenter: 'CC004' }
    ],
    // Biometric Settings
    biometricCooldownMinutes: 5,
    enableSendPayslipOnMarkPaid: false,

    // Map Settings
    googleMapsEnabled: false,
    googleMapsApiKey: '',
    enableDirectionsApi: false,
    enableDistanceMatrixApi: false,
    enablePlacesApi: false,
    enableRouteOptimizationApi: false,
  });

  // Statutory Elements state
  const [statutoryElements, setStatutoryElements] = useState<CompanyStatutorySettings>({
    provident_fund: false,
    employee_state_insurance: false,
    professional_tax: false,
    tax_deducted_at_source: false,
  });

  const [newDepartment, setNewDepartment] = useState({ name: '', costCenter: '' });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load company settings and statutory settings on mount
  useEffect(() => {
    fetchCompanySettings();
    fetchCompanyStatutorySettings();
  }, [fetchCompanySettings, fetchCompanyStatutorySettings]);

  // Update form data when company settings are loaded
  useEffect(() => {
    if (companySettings) {
      setFormData({
        companyName: companySettings.company_name || '',
        legalName: companySettings.legal_name || '',
        taxId: companySettings.tax_id || '',
        registrationNumber: companySettings.registration_number || '',
        address: companySettings.address || {
          street: '',
          city: '',
          state: '',
          postalCode: '',
          country: 'United States'
        },
        phone: companySettings.phone || '',
        email: companySettings.email || '',
        website: companySettings.website || '',
        payPeriodType: companySettings.pay_period_type || 'monthly',
        payPeriodStartDay: companySettings.pay_period_start_day || '1',
        payPeriodEndDay: companySettings.pay_period_end_day || 'last',
        bankName: companySettings.bank_name || '',
        accountNumber: companySettings.account_number || '',
        routingNumber: companySettings.routing_number || '',
        accountType: companySettings.account_type || 'checking',
        requireApprovalForPayroll: companySettings.require_approval_for_payroll ?? true,
        approvalLevels: companySettings.approval_levels || 1,
        approverRoles: companySettings.approver_roles || ['Manager'],
        departmentStructure: companySettings.department_structure || [
          { id: '1', name: 'Engineering', costCenter: 'CC001' },
          { id: '2', name: 'Marketing', costCenter: 'CC002' },
          { id: '3', name: 'Sales', costCenter: 'CC003' },
          { id: '4', name: 'Human Resources', costCenter: 'CC004' }
        ],
        biometricCooldownMinutes: (companySettings as any).biometric_cooldown_minutes ?? 15,
        enableSendPayslipOnMarkPaid: (companySettings as any).enable_send_payslip_on_mark_paid ?? false,
        googleMapsEnabled: companySettings.google_maps_enabled ?? false,
        googleMapsApiKey: companySettings.google_maps_api_key ?? '',
        enableDirectionsApi: companySettings.enable_directions_api ?? false,
        enableDistanceMatrixApi: companySettings.enable_distance_matrix_api ?? false,
        enablePlacesApi: companySettings.enable_places_api ?? false,
      });
    }
  }, [companySettings]);

  // Update statutory elements when loaded
  useEffect(() => {
    if (companyStatutorySettings) {
      setStatutoryElements({
        provident_fund: companyStatutorySettings.provident_fund,
        employee_state_insurance: companyStatutorySettings.employee_state_insurance,
        professional_tax: companyStatutorySettings.professional_tax,
        tax_deducted_at_source: companyStatutorySettings.tax_deducted_at_source,
      });
    }
  }, [companyStatutorySettings]);

  // Auto-calculate period end day based on period type and start day
  useEffect(() => {
    if (formData.payPeriodType === 'monthly') {
      // For monthly: Calculate end day based on start day
      // If start day is 1, end day is "last" (last day of current month)
      // If start day is any other day (e.g., 4), end day is (start day - 1) of next month
      const startDay = formData.payPeriodStartDay;
      let endDay: string;

      if (startDay === '1' || startDay === 'last') {
        endDay = 'last';
      } else {
        const startDayNum = parseInt(startDay);
        const endDayNum = startDayNum - 1;
        endDay = endDayNum.toString();
      }

      if (formData.payPeriodEndDay !== endDay) {
        setFormData(prev => ({ ...prev, payPeriodEndDay: endDay }));
      }
    } else if (formData.payPeriodType === 'weekly') {
      // For weekly: End day is 6 days after start day
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const startDayIndex = daysOfWeek.indexOf(formData.payPeriodStartDay);

      if (startDayIndex !== -1) {
        const endDayIndex = (startDayIndex + 6) % 7;
        const endDay = daysOfWeek[endDayIndex];

        if (formData.payPeriodEndDay !== endDay) {
          setFormData(prev => ({ ...prev, payPeriodEndDay: endDay }));
        }
      }
    }
  }, [formData.payPeriodType, formData.payPeriodStartDay]);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    // Company name validation
    if (!formData.companyName.trim()) {
      errors.companyName = 'Company name is required';
    }
    
    // Tax ID validation
    if (!formData.taxId.trim()) {
      errors.taxId = 'Tax ID is required';
    }
    
    // Email validation
    if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
      errors.email = 'Invalid email address';
    }
    
    // Phone validation
    if (formData.phone && !/^\+?[0-9]{10,15}$/.test(formData.phone)) {
      errors.phone = 'Invalid phone number';
    }
    
    // Bank account validation
    if (formData.accountNumber && !/^[0-9]{8,17}$/.test(formData.accountNumber)) {
      errors.accountNumber = 'Invalid account number';
    }
    
    if (formData.routingNumber && !/^[0-9]{9}$/.test(formData.routingNumber)) {
      errors.routingNumber = 'Invalid routing number (must be 9 digits)';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTestApiKey = async () => {
    if (!formData.googleMapsApiKey) {
      toast.error("Please enter an API key first");
      return;
    }
    
    setIsTestingApiKey(true);
    setApiKeyTestResult(null);
    setApiKeyErrorMessage('');

    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=New+York&key=${formData.googleMapsApiKey}`);
      const data = await response.json();
      
      if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
        setApiKeyTestResult('success');
        toast.success("API Key is valid and working!");
      } else if (data.status === 'REQUEST_DENIED') {
        setApiKeyTestResult('error');
        setApiKeyErrorMessage(data.error_message || "Request Denied. Check billing or restrictions.");
      } else {
        setApiKeyTestResult('error');
        setApiKeyErrorMessage(`Status: ${data.status}. ${data.error_message || ''}`);
      }
    } catch (err: any) {
      setApiKeyTestResult('error');
      setApiKeyErrorMessage(err.message || "Network error while testing API key");
    } finally {
      setIsTestingApiKey(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the validation errors before saving');
      return;
    }

    setIsSubmitting(true);

    try {
      const settingsToSave: any = {
        company_name: formData.companyName,
        legal_name: formData.legalName,
        tax_id: formData.taxId,
        registration_number: formData.registrationNumber,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        website: formData.website,
        pay_period_type: formData.payPeriodType as 'weekly' | 'monthly',
        pay_period_start_day: formData.payPeriodStartDay,
        pay_period_end_day: formData.payPeriodEndDay,
        bank_name: formData.bankName,
        account_number: formData.accountNumber,
        routing_number: formData.routingNumber,
        account_type: formData.accountType as 'checking' | 'savings' | 'business',
        require_approval_for_payroll: formData.requireApprovalForPayroll,
        approval_levels: formData.approvalLevels,
        approver_roles: formData.approverRoles,
        department_structure: formData.departmentStructure,
        biometric_cooldown_minutes: formData.biometricCooldownMinutes,
        enable_send_payslip_on_mark_paid: formData.enableSendPayslipOnMarkPaid,
        google_maps_enabled: formData.googleMapsEnabled,
        google_maps_api_key: formData.googleMapsApiKey ? formData.googleMapsApiKey.trim() : null,
        enable_directions_api: formData.enableDirectionsApi,
        enable_distance_matrix_api: formData.enableDistanceMatrixApi,
        enable_places_api: formData.enablePlacesApi,
      };

      await saveCompanySettings(settingsToSave);
      await saveCompanyStatutorySettings(statutoryElements);

      toast.success('Company settings saved successfully');
      // onSave(formData);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDepartment = () => {
    if (newDepartment.name.trim() && newDepartment.costCenter.trim()) {
      const newId = (Math.max(...formData.departmentStructure.map(d => parseInt(d.id))) + 1).toString();
      
      setFormData({
        ...formData,
        departmentStructure: [
          ...formData.departmentStructure,
          { 
            id: newId, 
            name: newDepartment.name, 
            costCenter: newDepartment.costCenter 
          }
        ]
      });
      
      setNewDepartment({ name: '', costCenter: '' });
    }
  };

  const handleRemoveDepartment = (id: string) => {
    setFormData({
      ...formData,
      departmentStructure: formData.departmentStructure.filter(dept => dept.id !== id)
    });
  };

  if (loading && !companySettings) {
    return (
     <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500">Loading company settings...</p>
        </div>
      </div>
    );
  }

  

  return (
    <div className='bg-white p-6 rounded-lg shadow'>
      <div className="border-b border-gray-200 mb-6 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max px-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('general')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'general'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            General Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('locations')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'locations'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Branch Locations
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('integrations')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'integrations'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Integrations & Maps
          </button>
        </nav>
      </div>

      {activeSubTab === 'general' ? (
        <>
          <h2 className="text-lg font-medium text-gray-900">Company Settings</h2>
      <p className="mt-1 text-sm text-gray-500">
        Configure your company information, pay periods, and organizational structure.
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-8">
        {/* Company Information */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Building2 className="h-5 w-5 mr-2 text-indigo-500" />
            Company Information
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label htmlFor="company-name" className="block text-sm font-medium text-gray-700">
                Company Name
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="company-name"
                  className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.companyName ? 'border-red-300' : ''
                  }`}
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                />
              </div>
              {validationErrors.companyName && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.companyName}</p>
              )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="legal-name" className="block text-sm font-medium text-gray-700">
                Legal Name
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="legal-name"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.legalName}
                  onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                />
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="tax-id" className="block text-sm font-medium text-gray-700">
                Tax ID / EIN
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="tax-id"
                  className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.taxId ? 'border-red-300' : ''
                  }`}
                  value={formData.taxId}
                  onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                />
              </div>
              {validationErrors.taxId && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.taxId}</p>
              )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="registration-number" className="block text-sm font-medium text-gray-700">
                Registration Number
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="registration-number"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.registrationNumber}
                  onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Address */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <MapPin className="h-5 w-5 mr-2 text-indigo-500" />
            Company Address
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <label htmlFor="street" className="block text-sm font-medium text-gray-700">
                Street Address
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="street"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.address.street}
                  onChange={(e) => setFormData({
                    ...formData,
                    address: { ...formData.address, street: e.target.value }
                  })}
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                City
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="city"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.address.city}
                  onChange={(e) => setFormData({
                    ...formData,
                    address: { ...formData.address, city: e.target.value }
                  })}
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                State / Province
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="state"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.address.state}
                  onChange={(e) => setFormData({
                    ...formData,
                    address: { ...formData.address, state: e.target.value }
                  })}
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="postal-code" className="block text-sm font-medium text-gray-700">
                ZIP / Postal Code
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="postal-code"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.address.postalCode}
                  onChange={(e) => setFormData({
                    ...formData,
                    address: { ...formData.address, postalCode: e.target.value }
                  })}
                />
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                Country
              </label>
              <div className="mt-1">
                <select
                  id="country"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.address.country}
                  onChange={(e) => setFormData({
                    ...formData,
                    address: { ...formData.address, country: e.target.value }
                  })}
                >
                  <option value="United States">United States</option>
                  <option value="Canada">Canada</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Australia">Australia</option>
                  <option value="Germany">Germany</option>
                  <option value="France">France</option>
                  <option value="Japan">Japan</option>
                  <option value="India">India</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="company-phone" className="block text-sm font-medium text-gray-700">
                Company Phone
              </label>
              <div className="mt-1">
                <input
                  type="tel"
                  id="company-phone"
                  className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.phone ? 'border-red-300' : ''
                  }`}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              {validationErrors.phone && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.phone}</p>
              )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="company-email" className="block text-sm font-medium text-gray-700">
                Company Email
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  id="company-email"
                  className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.email ? 'border-red-300' : ''
                  }`}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              {validationErrors.email && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.email}</p>
              )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="company-website" className="block text-sm font-medium text-gray-700">
                Company Website
              </label>
              <div className="mt-1">
                <input
                  type="url"
                  id="company-website"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Pay Period Settings */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-indigo-500" />
            Pay Period Settings
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label htmlFor="pay-period-type" className="block text-sm font-medium text-gray-700">
                Pay Period Type
              </label>
              <div className="mt-1">
                <select
                  id="pay-period-type"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.payPeriodType}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setFormData({
                      ...formData,
                      payPeriodType: newType,
                      payPeriodStartDay: newType === 'weekly' ? 'Monday' : '1'
                    });
                  }}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>

            {formData.payPeriodType === 'monthly' && (
              <>
                <div className="sm:col-span-3">
                  <label htmlFor="period-start-day" className="block text-sm font-medium text-gray-700">
                    Period Start Day
                  </label>
                  <div className="mt-1">
                    <select
                      id="period-start-day"
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      value={formData.payPeriodStartDay}
                      onChange={(e) => setFormData({ ...formData, payPeriodStartDay: e.target.value })}
                    >
                      {[...Array(28)].map((_, i) => (
                        <option key={i + 1} value={(i + 1).toString()}>
                          {i + 1}
                        </option>
                      ))}
                      <option value="last">Last day of previous month</option>
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="period-end-day" className="block text-sm font-medium text-gray-700">
                    Period End Day (Auto-calculated)
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="period-end-day"
                      className="shadow-sm block w-full sm:text-sm border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
                      value={formData.payPeriodEndDay === 'last' ? 'Last day of month' : `${formData.payPeriodEndDay} of next month`}
                      readOnly
                      disabled
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {formData.payPeriodStartDay === '1'
                      ? 'Start day 1: End day is last day of current month'
                      : `Start day ${formData.payPeriodStartDay}: End day is ${formData.payPeriodEndDay} of next month`
                    }
                  </p>
                </div>
              </>
            )}

            {formData.payPeriodType === 'weekly' && (
              <>
                <div className="sm:col-span-3">
                  <label htmlFor="period-start-day" className="block text-sm font-medium text-gray-700">
                    Period Start Day (Day of Week)
                  </label>
                  <div className="mt-1">
                    <select
                      id="period-start-day"
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      value={formData.payPeriodStartDay}
                      onChange={(e) => setFormData({ ...formData, payPeriodStartDay: e.target.value })}
                    >
                      <option value="Sunday">Sunday</option>
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="period-end-day" className="block text-sm font-medium text-gray-700">
                    Period End Day (Auto-calculated)
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="period-end-day"
                      className="shadow-sm block w-full sm:text-sm border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
                      value={formData.payPeriodEndDay}
                      readOnly
                      disabled
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Period runs from {formData.payPeriodStartDay} to {formData.payPeriodEndDay} (7 days)
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bank Account Details */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <CreditCard className="h-5 w-5 mr-2 text-indigo-500" />
            Bank Account Details
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label htmlFor="bank-name" className="block text-sm font-medium text-gray-700">
                Bank Name
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="bank-name"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                />
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="account-type" className="block text-sm font-medium text-gray-700">
                Account Type
              </label>
              <div className="mt-1">
                <select
                  id="account-type"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.accountType}
                  onChange={(e) => setFormData({ ...formData, accountType: e.target.value })}
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="business">Business</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="account-number" className="block text-sm font-medium text-gray-700">
                Account Number
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="account-number"
                  className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.accountNumber ? 'border-red-300' : ''
                  }`}
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                />
              </div>
              {validationErrors.accountNumber && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.accountNumber}</p>
              )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="routing-number" className="block text-sm font-medium text-gray-700">
                Routing Number
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="routing-number"
                  className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.routingNumber ? 'border-red-300' : ''
                  }`}
                  value={formData.routingNumber}
                  onChange={(e) => setFormData({ ...formData, routingNumber: e.target.value })}
                />
              </div>
              {validationErrors.routingNumber && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.routingNumber}</p>
              )}
            </div>
          </div>
        </div>

        {/* Approval Workflow */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Workflow className="h-5 w-5 mr-2 text-indigo-500" />
            Approval Workflow
          </h3>
          <div className="mt-4 space-y-4">
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="require-approval"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={formData.requireApprovalForPayroll}
                  onChange={(e) => setFormData({ ...formData, requireApprovalForPayroll: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="require-approval" className="font-medium text-gray-700">
                  Require Approval for Payroll Processing
                </label>
                <p className="text-gray-500">Payroll must be approved before it can be processed</p>
              </div>
            </div>

            {formData.requireApprovalForPayroll && (
              <>
                <div className="sm:col-span-3">
                  <label htmlFor="approval-levels" className="block text-sm font-medium text-gray-700">
                    Number of Approval Levels
                  </label>
                  <div className="mt-1">
                    <select
                      id="approval-levels"
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      value={formData.approvalLevels}
                      onChange={(e) => setFormData({ ...formData, approvalLevels: parseInt(e.target.value) })}
                    >
                      <option value={1}>1 Level</option>
                      <option value={2}>2 Levels</option>
                      <option value={3}>3 Levels</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Approver Roles
                  </label>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center">
                      <input
                        id="role-manager"
                        type="checkbox"
                        className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        checked={formData.approverRoles.includes('Manager')}
                        onChange={(e) => {
                          const newRoles = e.target.checked
                            ? [...formData.approverRoles, 'Manager']
                            : formData.approverRoles.filter(r => r !== 'Manager');
                          setFormData({ ...formData, approverRoles: newRoles });
                        }}
                      />
                      <label htmlFor="role-manager" className="ml-2 text-sm text-gray-700">
                        Manager
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        id="role-director"
                        type="checkbox"
                        className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        checked={formData.approverRoles.includes('Director')}
                        onChange={(e) => {
                          const newRoles = e.target.checked
                            ? [...formData.approverRoles, 'Director']
                            : formData.approverRoles.filter(r => r !== 'Director');
                          setFormData({ ...formData, approverRoles: newRoles });
                        }}
                      />
                      <label htmlFor="role-director" className="ml-2 text-sm text-gray-700">
                        Director
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        id="role-finance"
                        type="checkbox"
                        className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        checked={formData.approverRoles.includes('Finance')}
                        onChange={(e) => {
                          const newRoles = e.target.checked
                            ? [...formData.approverRoles, 'Finance']
                            : formData.approverRoles.filter(r => r !== 'Finance');
                          setFormData({ ...formData, approverRoles: newRoles });
                        }}
                      />
                      <label htmlFor="role-finance" className="ml-2 text-sm text-gray-700">
                        Finance
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        id="role-hr"
                        type="checkbox"
                        className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        checked={formData.approverRoles.includes('HR')}
                        onChange={(e) => {
                          const newRoles = e.target.checked
                            ? [...formData.approverRoles, 'HR']
                            : formData.approverRoles.filter(r => r !== 'HR');
                          setFormData({ ...formData, approverRoles: newRoles });
                        }}
                      />
                      <label htmlFor="role-hr" className="ml-2 text-sm text-gray-700">
                        HR
                      </label>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-start pt-4 border-t border-gray-200">
              <div className="flex items-center h-5">
                <input
                  id="enable-send-payslip"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={formData.enableSendPayslipOnMarkPaid}
                  onChange={(e) => setFormData({ ...formData, enableSendPayslipOnMarkPaid: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="enable-send-payslip" className="font-medium text-gray-700">
                  Automatically Dispatch Payslips when Marked as Paid
                </label>
                <p className="text-gray-500">When enabled, marking payroll entries as Paid will immediately dispatch formatted Form 25-B payslips via email to employees.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Statutory Elements Applicable */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Shield className="h-5 w-5 mr-2 text-indigo-500" />
            Statutory Elements Applicable
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Select the statutory elements that apply to your organization
          </p>
          <div className="mt-4 space-y-4">
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="provident-fund"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={statutoryElements.provident_fund}
                  onChange={(e) => setStatutoryElements({ ...statutoryElements, provident_fund: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="provident-fund" className="font-medium text-gray-700">
                  Provident Fund (PF)
                </label>
                <p className="text-gray-500">Employee and employer contributions to provident fund</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="employee-state-insurance"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={statutoryElements.employee_state_insurance}
                  onChange={(e) => setStatutoryElements({ ...statutoryElements, employee_state_insurance: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="employee-state-insurance" className="font-medium text-gray-700">
                  Employee State Insurance (ESI)
                </label>
                <p className="text-gray-500">Health insurance scheme for employees</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="professional-tax"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={statutoryElements.professional_tax}
                  onChange={(e) => setStatutoryElements({ ...statutoryElements, professional_tax: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="professional-tax" className="font-medium text-gray-700">
                  Professional Tax
                </label>
                <p className="text-gray-500">State-level tax on professions and employment</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="tax-deducted-at-source"
                  type="checkbox"
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={statutoryElements.tax_deducted_at_source}
                  onChange={(e) => setStatutoryElements({ ...statutoryElements, tax_deducted_at_source: e.target.checked })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="tax-deducted-at-source" className="font-medium text-gray-700">
                  Tax Deducted At Source (TDS)
                </label>
                <p className="text-gray-500">Income tax deducted from employee salaries</p>
              </div>
            </div>
          </div>
        </div>

        {/* Department Structure */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Users className="h-5 w-5 mr-2 text-indigo-500" />
            Department Structure
          </h3>
          <div className="mt-4">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Department Name
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Cost Center
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {formData.departmentStructure.map((dept) => (
                    <tr key={dept.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        {dept.name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {dept.costCenter}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-900"
                          onClick={() => handleRemoveDepartment(dept.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="new-department" className="block text-sm font-medium text-gray-700">
                  New Department Name
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="new-department"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={newDepartment.name}
                    onChange={(e) => setNewDepartment({ ...newDepartment, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="new-cost-center" className="block text-sm font-medium text-gray-700">
                  Cost Center
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="new-cost-center"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={newDepartment.costCenter}
                    onChange={(e) => setNewDepartment({ ...newDepartment, costCenter: e.target.value })}
                  />
                </div>
              </div>

              <div className="sm:col-span-1 flex items-end">
                <button
                  type="button"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  onClick={handleAddDepartment}
                  disabled={!newDepartment.name || !newDepartment.costCenter}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>


        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <ScanFace className="h-5 w-5 mr-2 text-indigo-500" />
            Camera Control & Settings
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Configure parameters for face attendance tracking.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label htmlFor="biometric-cooldown" className="block text-sm font-medium text-gray-700">
                Minimum Gap Between Clock IN/OUT (Minutes)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="biometric-cooldown"
                  min="1"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.biometricCooldownMinutes}
                  onChange={(e) => setFormData({ ...formData, biometricCooldownMinutes: parseInt(e.target.value) || 0 })}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Note: Any face scans within this time frame will be ignored to prevent accidental double-punching.
              </p>
            </div>
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
              disabled={isSubmitting || loading}
              className="ml-3 inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSubmitting || loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </div>
      </form>
        </>
      ) : activeSubTab === 'locations' ? (
        <CompanyLocations />
      ) : activeSubTab === 'integrations' ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-8">
            <div>
              <h3 className="text-md font-medium text-gray-900 flex items-center">
                <MapPin className="h-5 w-5 mr-2 text-indigo-500" />
                Map Provider
              </h3>
              <p className="mt-1 text-sm text-gray-500 mb-4">
                Switch between OpenStreetMap and Google Maps for location features.
              </p>

              <div className="bg-white rounded-lg md:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Enable Google Maps</h4>
                    <p className="text-xs text-gray-500 mt-1">Requires a valid Google Maps API Key.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, googleMapsEnabled: !formData.googleMapsEnabled })}
                    className="focus:outline-none"
                  >
                    {formData.googleMapsEnabled ? (
                      <ToggleRight className="h-9 w-9 text-blue-600" />
                    ) : (
                      <ToggleLeft className="h-9 w-9 text-gray-300" />
                    )}
                  </button>
                </div>
                
                {formData.googleMapsEnabled && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <label htmlFor="api-key" className="block text-sm font-medium text-gray-700">
                      Google Maps API Key
                    </label>
                    <div className="relative mt-1">
                      <input
                        type={showApiKey ? "text" : "password"}
                        id="api-key"
                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border pr-10"
                        value={formData.googleMapsApiKey}
                        onChange={(e) => setFormData({ ...formData, googleMapsApiKey: e.target.value })}
                        placeholder="AIzaSy..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                      >
                        {showApiKey ? (
                          <EyeOff className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </div>

                    <div className="mt-4 p-3 bg-blue-50/50 border border-blue-100 rounded-md">
                      <p className="text-xs text-blue-800 mb-2">
                        <strong>Need an API Key?</strong> Get one from the <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">Google Cloud Console</a>.
                      </p>
                      <div className="text-xs text-blue-700">
                        <p className="font-semibold mb-1">Make sure to enable these 5 APIs for your project:</p>
                        <ul className="list-disc pl-4 space-y-0.5 ml-1">
                          <li><strong>Maps JavaScript API</strong> (Required)</li>
                          <li><strong>Geocoding API</strong> (Required)</li>
                          <li><strong>Routes API</strong> (Optional - for multi-stop routing optimization)</li>
                          <li><strong>Distance Matrix API</strong> (Optional - for exact travel allowance distances)</li>
                          <li><strong>Places API (New)</strong> (Optional - for address auto-complete)</li>
                        </ul>
                      </div>
                    </div>

                    {/* Test API Key Button */}
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleTestApiKey}
                        disabled={!formData.googleMapsApiKey || isTestingApiKey}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                      >
                        {isTestingApiKey ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin text-gray-400" />
                        ) : (
                          <Play className="h-4 w-4 mr-1.5 text-indigo-500" />
                        )}
                        Test API Key
                      </button>
                      
                      {apiKeyTestResult === 'success' && (
                        <div className="flex items-center text-sm text-green-600 bg-green-50 px-2.5 py-1 rounded-md border border-green-100">
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Valid & Working
                        </div>
                      )}
                      
                      {apiKeyTestResult === 'error' && (
                        <div className="flex items-center text-sm text-red-600 bg-red-50 px-2.5 py-1 rounded-md border border-red-100 max-w-md">
                          <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                          <span className="truncate" title={apiKeyErrorMessage}>{apiKeyErrorMessage}</span>
                        </div>
                      )}
                    </div>

                    {formData.googleMapsApiKey && (
                      <div className="mt-8">
                        <h4 className="text-sm font-medium text-gray-900 border-b border-gray-200 pb-2">API Cost Control & Fallbacks</h4>
                        
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div>
                            <label className="text-sm font-medium text-gray-900">Routes API</label>
                            <p className="text-xs text-gray-500 mt-1">
                              {formData.enableDirectionsApi 
                                ? "Enabled: Powers the Multi-Stop Route Optimizer."
                                : "Disabled: Route Optimizer is disabled."}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, enableDirectionsApi: !formData.enableDirectionsApi })}
                            className="ml-4 flex-shrink-0 focus:outline-none"
                          >
                            {formData.enableDirectionsApi ? (
                              <ToggleRight className="h-8 w-8 text-blue-600" />
                            ) : (
                              <ToggleLeft className="h-8 w-8 text-gray-400" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div>
                            <label className="text-sm font-medium text-gray-900">Distance Matrix API</label>
                            <p className="text-xs text-gray-500 mt-1">
                              {formData.enableDistanceMatrixApi 
                                ? "Enabled: Calculates exact road distance and traffic for Travel Allowance."
                                : "Disabled: Falls back to Haversine straight-line distance."}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, enableDistanceMatrixApi: !formData.enableDistanceMatrixApi })}
                            className="ml-4 flex-shrink-0 focus:outline-none"
                          >
                            {formData.enableDistanceMatrixApi ? (
                              <ToggleRight className="h-8 w-8 text-blue-600" />
                            ) : (
                              <ToggleLeft className="h-8 w-8 text-gray-400" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div>
                            <label className="text-sm font-medium text-gray-900">Places API (New)</label>
                            <p className="text-xs text-gray-500 mt-1">
                              {formData.enablePlacesApi 
                                ? "Enabled: Uses Google Places for highly accurate Worksite creation."
                                : "Disabled: Manual pin dropping on OSM map."}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, enablePlacesApi: !formData.enablePlacesApi })}
                            className="ml-4 flex-shrink-0 focus:outline-none"
                          >
                            {formData.enablePlacesApi ? (
                              <ToggleRight className="h-8 w-8 text-blue-600" />
                            ) : (
                              <ToggleLeft className="h-8 w-8 text-gray-400" />
                            )}
                          </button>
                        </div>

                        </div>
                      </div>
                  )}
                </div>
              )}
            </div>
          </div>  
            <div className="pt-5 border-t border-gray-200">
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || loading}
                  className="ml-3 inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting || loading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </form>
      ) : null}
    </div>
  );
}