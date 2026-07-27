import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import Testimonials from './components/Testimonials';
import Pricing from './components/Pricing';
import ContactForm from './components/ContactForm';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import ResetPasswordForm from './components/auth/ResetPasswordForm';
import AcceptInvitePage from './components/auth/AcceptInvitePage';
import Dashboard from './components/dashboard/Dashboard';
import EmployeesPage from './components/dashboard/employees/EmployeesPage';
import ReportingPage from './components/dashboard/employees/ReportingPage';
import PayrollPage from './components/dashboard/payroll/PayrollPage';
import SalaryStructuresPage from './components/dashboard/payroll/SalaryStructuresPage';
import PayrollProcessPage from './components/dashboard/payroll/PayrollProcessPage';
import PayslipSender from './components/dashboard/payroll/PayslipSender';
import AttendancePage from './components/dashboard/attendance/AttendancePage';
import FaceEnrollmentPage from './components/dashboard/attendance/FaceEnrollmentPage';
import LeavePage from './components/dashboard/leave/LeavePage';
import ShiftsPage from './components/dashboard/shifts/ShiftsPage';
import HolidaysPage from './components/dashboard/holidays/HolidaysPage';
import ReportsPage from './components/dashboard/reports/ReportsPage';
import SettingsPage from './components/dashboard/settings/SettingsPage';
import NotificationsPage from './components/dashboard/notifications/NotificationsPage';
import { FaceAttendancePage } from './components/dashboard/attendance/FaceAttendancePage';
import VisitorCapturesPage from './components/dashboard/visitors/VisitorCapturesPage';
import AttendanceLogsPage from './components/dashboard/attendance/AttendanceLogsPage';
import TimeStampManagementPage from './components/dashboard/attendance/TimeStampManagementPage';
import AdvancesPage from './components/dashboard/advances/AdvancesPage';
import AdvanceRequestPage from './components/dashboard/advances/AdvanceRequestPage';
import AdvanceApprovalPage from './components/dashboard/advances/AdvanceApprovalPage';
import AdvanceSettings from './components/dashboard/settings/AdvanceSettings';
import GatePassesPage from './components/dashboard/gatepasses/GatePassesPage';
import LocationDetectionPage from './components/dashboard/location/LocationDetectionPage';
import TravelApprovalsPage from './components/dashboard/location/TravelApprovalsPage';
import { Toaster } from "react-hot-toast";
import StructureAssignmentPage from './components/dashboard/payroll/StructureAssignmentPage';
import OTEmployeeManagement from './components/dashboard/overtime/OTEmployeeManagement';
import OTStructuresPage from './components/dashboard/overtime/OTStructuresPage';
import OTTimeStamp from './components/dashboard/overtime/OTTimeStamp';
import OTProcessingPage from './components/dashboard/overtime/OTProcessingPage';
import OvertimeSettings from './components/dashboard/settings/OvertimeSettings';
import ComponentMasterPage from './components/dashboard/payroll/ComponentMasterPage';
import StatutorySettings from './components/dashboard/settings/StatutorySettings';
import FormulaBuilderPage from './components/dashboard/formula-builder/FormulaBuilderPage';
import FormulaTestPage from './components/dashboard/payroll/FormulaTestPage';
import LeaveTypesPage from './components/dashboard/leave/LeaveTypesPage';
import UserAccessControlPage from './components/dashboard/access-control/UserAccessControlPage';
import EmployeeInvitePage from './components/dashboard/invite/EmployeeInvitePage';
import SMTPSettings from './components/dashboard/settings/SMTPSettings';
import UserSettings from './components/dashboard/settings/UserSettings';
import CompanySettings from './components/dashboard/settings/CompanySettings';
import UserManagement from './components/dashboard/settings/UserManagement';
import MasterDataImport from './components/dashboard/settings/MasterDataImport';
// import BillingPage from './components/dashboard/billing/BillingPage';
import AttendanceTimestamp from './components/dashboard/attendance/AttendanceTimestamp';
import AttendanceValidationSettings from './components/dashboard/settings/AttendanceValidationSettings';
import LeaveConfigurationPage from './components/dashboard/leave/LeaveConfigurationPage';
import PermissionRequestPage from './components/dashboard/permissions/PermissionRequestPage';
import PermissionApprovalPage from './components/dashboard/permissions/PermissionApprovalPage';
import EmployeeWorkPage from './components/dashboard/location/EmployeeWorkPage';
import WorkLocationAssignmentPage from './components/dashboard/location/WorkLocationAssignmentPage';
import LiveTrackingSwitch from './components/dashboard/location/LiveTrackingSwitch';
import LocationSettingsPage from './components/dashboard/location/LocationSettingsPage';
import DeviceController from './components/dashboard/HikVision/DeviceController';
import BiometricControllers from './components/dashboard/biometrics/BiometricControllers';
import TermsOfService from './components/dashboard/policies/TermOfService';
import { RefundPolicy } from './components/dashboard/policies/RefundPolicy';
import PrivacyPolicy from './components/dashboard/policies/PrivacyPolicy';
import HikDeviceEmployeesPage from './components/dashboard/attendance/HikDeviceEmployeesPage';
import SuperAdminScreenControl from './components/dashboard/access-control/SuperAdminScreenControl';
import ShiftAttendanceReportSender from './components/dashboard/shifts/ShiftAttendanceReportSender';
import { GoogleMapsProvider } from './contexts/GoogleMapsContext';
import { useSettingsStore } from './stores/settingsStore';

/** Thin wrapper that reads Google Maps API key from the settings store
 * and initialises the shared singleton loader exactly once. */
function GoogleMapsAppWrapper({ children }: { children: React.ReactNode }) {
  const { companySettings } = useSettingsStore();
  const apiKey = (companySettings?.google_maps_enabled && companySettings?.google_maps_api_key) 
    ? companySettings.google_maps_api_key 
    : '';
  return <GoogleMapsProvider apiKey={apiKey}>{children}</GoogleMapsProvider>;
}


 
function App() {
  return (
    <Router>
      <AuthProvider>
        <TenantProvider>
          <NotificationProvider>
            <GoogleMapsAppWrapper>
            <Routes>
              {/* Public routes */}
              {/* <Route
                path="/"
                element={
                  <div className="min-h-screen bg-white text-gray-900 font-sans relative overflow-hidden">
                    <Navbar />
                    <div className="relative pt-16">
                      <Hero />
                      <ContactForm />
                      <Features />
                      <Pricing />
                      <Testimonials />
                      <Footer />
                      <ScrollToTop />
                    </div>
                  </div>
                }
              /> */}
              <Route path="/" element={<LoginForm />} />
              <Route path="/register" element={<RegisterForm />} />
              <Route path="/reset-password" element={<ResetPasswordForm />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />


              {/* Protected routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={null} /> {/* Overview is handled by Dashboard component */}
                <Route path="employees" element={<EmployeesPage />} />
                <Route path="reporting" element={<ReportingPage />} />
                <Route path="global-tenant-management" element={<SuperAdminScreenControl />} />
                <Route path="attendance" element={<AttendancePage />} />
                <Route path="attendance/face-enrollment" element={<FaceEnrollmentPage />} />
                <Route path="attendance-face-verify" element={<FaceAttendancePage />} />
                <Route path="attendance-logs" element={<AttendanceLogsPage />} />
                <Route path="attendance/device-employees" element={<HikDeviceEmployeesPage />} />
                <Route path="clockin-clockout" element={<AttendanceTimestamp />} />
                <Route path="time-stamp-management" element={<TimeStampManagementPage />} />
                <Route path="visitor-records" element={<VisitorCapturesPage />} />
                <Route path="leave" element={<LeavePage />} />
                <Route path="leave/types" element={<LeaveTypesPage />} />
                <Route path="leave/settings" element={<LeaveConfigurationPage />} />
                <Route path="shifts" element={<ShiftsPage />} />
                <Route path="holidays" element={<HolidaysPage />} />
                <Route path="gate-passes" element={<GatePassesPage />} />
                <Route path="permissions/request" element={<PermissionRequestPage />} />
                <Route path="permissions/approval" element={<PermissionApprovalPage />} />
                <Route path="advances" element={<AdvancesPage />} />
                <Route path="advances/request" element={<AdvanceRequestPage />} />
                <Route path="advances/approval" element={<AdvanceApprovalPage />} />
                <Route path="advances/settings" element={<AdvanceSettings />} />
                <Route path="overtime/employees" element={<OTEmployeeManagement />} />
                <Route path="overtime/structures" element={<OTStructuresPage />} />
                <Route path="overtime/approvals" element={<OTTimeStamp />} />
                <Route path="overtime/processing" element={<OTProcessingPage />} />
                <Route path="overtime/settings" element={<OvertimeSettings />} />
                <Route path="statutory" element={<StatutorySettings />} />
                <Route path="payroll" element={<PayrollPage />} />
                <Route path="component-master" element={<ComponentMasterPage />} />
                <Route path="salary-structures" element={<SalaryStructuresPage />} />
                <Route path="structure-assignments" element={<StructureAssignmentPage />} />
                <Route path="payroll-process" element={<PayrollProcessPage />} />
                <Route path="payslip-sender" element={<PayslipSender />} />
                <Route path="formula-builder" element={<FormulaBuilderPage />} />
                <Route path="formula-tester" element={<FormulaTestPage />} />
                <Route path="reports" element={<ReportsPage />} />
                {/* <Route path="settings" element={<SettingsPage />} /> */}
                <Route path="settings/smtp-configuration" element={<SMTPSettings />} />
                <Route path="settings/user-settings" element={<UserSettings />} />
                <Route path="settings/attendance-settings" element={<AttendanceValidationSettings />} />
                <Route path="settings/user-management" element={<UserManagement />} />
                <Route path="settings/company-settings" element={<CompanySettings />} />
                <Route path="settings/master-data-import" element={<MasterDataImport/>} />
                <Route path="settings/biometric-device-manager" element={<BiometricControllers />} />
                <Route path="settings/hik-device-controller" element={<DeviceController/>} />
                <Route path="settings/shift-attendance-notifier" element={<ShiftAttendanceReportSender />} />
                <Route path="notifications" element={<NotificationsPage />} />
                {/* <Route path="work-location" element={<LocationDetectionPage />} /> */}
                <Route path="work-location" element={<EmployeeWorkPage />} />
                <Route path="location-tracking" element={<LiveTrackingSwitch />} />
                <Route path="work-location-assignment" element={<WorkLocationAssignmentPage />} />
                <Route path="travel-approvals" element={<TravelApprovalsPage />} />
                <Route path="location-settings" element={<LocationSettingsPage />} />
                {/* <Route path="billing" element={<BillingPage />} /> */}

                <Route path="access-control" element={<UserAccessControlPage />} />
                <Route path="employee-invite" element={<EmployeeInvitePage />} />
              </Route>

              {/* Catch all route */}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
            <Toaster position="top-right" />

            </GoogleMapsAppWrapper>
          </NotificationProvider>
        </TenantProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;