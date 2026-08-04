import React, { useState, useEffect } from 'react';
import { Filter, Users, IndianRupee, Briefcase } from 'lucide-react';
import ReportFilters from './ReportFilters';
import EmployeeMasterReport from './EmployeeMasterReport';
import TransactionReport from './TransactionReport';
import StatutoryReport from './StatutoryReport';
import MusterRollReport from './MusterRollReport';
import TimestampMismatchReport from './TimestampMismatchReport';
import OutsideAttendanceReport from './OutsideAttendanceReport';
import { useRoleAccess } from '../../../hooks/useRoleAccess';

type ReportType = 'employee' | 'transaction' | 'statutory';
type ReportSubtype =
  // Employee master report subtypes
  | 'basic' | 'salary' | 'tax' | 'bank' | 'department' | 'holiday'
  // Transaction report subtypes
  | 'monthly' | 'attendance' | 'weeklyAttendance' | 'dailyAttendance' | 'leave' | 'overtime' | 'bonus' | 'loan' | 'payslip' | 'permissionBalance' | 'musterRoll' | 'timestampMismatch' | 'outsideAttendance'
  // Statutory report subtypes
  | 'taxDeduction' | 'providentFund' | 'insurance' | 'professionalTax';

export default function ReportsPage() {
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);

  // 1. Get role access and ID
  const { access, employeeId, canViewAllData: baseCanViewAllData, role, loading } = useRoleAccess();

  // For reports, Reporting Head acts like a standard Employee (only sees own data)
  const isReportingHead = role === 'Reporting Head';
  const canViewAllData = baseCanViewAllData && !isReportingHead;
  const isRestricted = access.restrictedToOwnData || isReportingHead;

  // Initialize state based on canViewAllData if possible, but we'll use an effect to be safe
  const [reportType, setReportType] = useState<ReportType>('employee');
  const [reportSubtype, setReportSubtype] = useState<ReportSubtype>('basic');

  const [filters, setFilters] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const formatDate = (date: Date) => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    return {
      startDate: formatDate(firstDay),
      endDate: formatDate(now),
      department: '',
      cadre: '',
      employee: '',
    };
  });

  // Effect to handle initial defaults for restricted users
  useEffect(() => {
    if (!loading) {
      if (!canViewAllData) {
        setReportType('transaction');
        setReportSubtype('payslip');
      }

      // Update employee filter for restricted users
      if (isRestricted && employeeId) {
        setFilters(prev => ({ ...prev, employee: employeeId }));
      }
    }
  }, [loading, canViewAllData, employeeId, isRestricted]);

  useEffect(() => {
    const formatDate = (date: Date) => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    const today = new Date();

    if (reportSubtype === 'dailyAttendance') {
      const todayStr = formatDate(today);
      setFilters(prev => ({ ...prev, startDate: todayStr, endDate: todayStr }));
    } else if (reportSubtype === 'weeklyAttendance') {
      // Get Monday of current week
      const day = today.getDay(); // 0=Sun, 1=Mon...
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setDate(today.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setFilters(prev => ({ ...prev, startDate: formatDate(monday), endDate: formatDate(sunday) }));
    } else if (reportSubtype === 'attendance' || reportSubtype === 'musterRoll' || reportSubtype === 'monthly') {
      // Monthly reports: first to last day of current month
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setFilters(prev => ({ ...prev, startDate: formatDate(firstDay), endDate: formatDate(lastDay) }));
    }
  }, [reportSubtype]);

  // If loading role/access, show a spinner to prevent flicker
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Safety Check: Is the component ready to render data?
  const isReady = !isRestricted || (isRestricted && filters.employee === employeeId);

  return (
    <div className="xl:py-6">
      <div className="max-w-7xl mx-auto px-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
            <p className="mt-1 text-sm text-gray-500">
              Generate and export comprehensive payroll reports.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </button>
          </div>
        </div>

        {isFiltersOpen && (
          <div className="mt-4">
            <ReportFilters filters={filters} onFilterChange={setFilters} isRestricted={isRestricted} reportSubtype={reportSubtype} />
          </div>
        )}

        <div className="mt-6">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {/* TABS HEADER - Only for Admin/HR */}
            {canViewAllData && (
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex overflow-x-auto">
                  <button
                    className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm ${reportType === 'employee'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    onClick={() => {
                      setReportType('employee');
                      setReportSubtype('basic');
                    }}
                  >
                    <Users className="h-5 w-5 inline-block mr-2" />
                    Employee Master
                  </button>
                  <button
                    className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm ${reportType === 'transaction'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    onClick={() => {
                      setReportType('transaction');
                      setReportSubtype('monthly');
                    }}
                  >
                    <IndianRupee className="h-5 w-5 inline-block mr-2" />
                    Transaction
                  </button>
                  <button
                    className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm ${reportType === 'statutory'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    onClick={() => {
                      setReportType('statutory');
                      setReportSubtype('taxDeduction');
                    }}
                  >
                    <Briefcase className="h-5 w-5 inline-block mr-2" />
                    Statutory
                  </button>
                </nav>
              </div>
            )}

            {/* HEADER FOR EMPLOYEE - Only for Restricted Users */}
            {!canViewAllData && (
              <div className="border-b border-gray-200 bg-gray-50 p-4">
                <h2 className="text-lg font-medium text-gray-900">My Reports</h2>
                <p className="mt-1 text-sm text-gray-500">
                  View your personal payroll reports and documents
                </p>
              </div>
            )}

            {/* SUBTYPE BUTTONS GRID */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex flex-wrap gap-2">
                {canViewAllData && reportType === 'employee' && (
                  <>
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'basic'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('basic')}
                    >
                      Basic Information
                    </button>
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'salary'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('salary')}
                    >
                      Salary Structure
                    </button>
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'tax'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('tax')}
                    >
                      Tax Declarations
                    </button>
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'department'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('department')}
                    >
                      Department/Designation
                    </button>
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'holiday'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('holiday')}
                    >
                      Holiday
                    </button>
                  </>
                )}

                {reportType === 'transaction' && (
                  <>
                    {canViewAllData && (
                      <button
                        className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'monthly'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        onClick={() => setReportSubtype('monthly')}
                      >
                        Monthly Salary
                      </button>
                    )}
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'payslip'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('payslip')}
                    >
                      Payslip
                    </button>
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${['attendance', 'weeklyAttendance', 'dailyAttendance'].includes(reportSubtype)
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('attendance')}
                    >
                      Attendance
                    </button>
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'leave'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('leave')}
                    >
                      Leave Balances
                    </button>
                    {canViewAllData && (
                      <button
                        className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'overtime'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        onClick={() => setReportSubtype('overtime')}
                      >
                        Overtime
                      </button>
                    )}
                    {canViewAllData && (
                      <button
                        className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'permissionBalance'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        onClick={() => setReportSubtype('permissionBalance')}
                      >
                        Permission Balance
                      </button>
                    )}
                    {canViewAllData && (
                      <button
                        className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'musterRoll'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        onClick={() => setReportSubtype('musterRoll')}
                      >
                        Muster Roll
                      </button>
                    )}
                    {canViewAllData && (
                      <button
                        className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'timestampMismatch'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        onClick={() => setReportSubtype('timestampMismatch')}
                      >
                        Timestamp Mismatch
                      </button>
                    )}
                    {canViewAllData && (
                      <button
                        className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'outsideAttendance'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        onClick={() => setReportSubtype('outsideAttendance')}
                      >
                        Outside Attendance
                      </button>
                    )}
                  </>
                )}

                {canViewAllData && reportType === 'statutory' && (
                  <>
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'taxDeduction'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('taxDeduction')}
                    >
                      Tax Deduction
                    </button>
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'providentFund'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('providentFund')}
                    >
                      Provident Fund
                    </button>
                    {/* <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${
                        reportSubtype === 'insurance'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      onClick={() => setReportSubtype('insurance')}
                    >
                      Insurance
                    </button> */}
                    <button
                      className={`px-4 py-2 rounded-md text-sm font-medium ${reportSubtype === 'professionalTax'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      onClick={() => setReportSubtype('professionalTax')}
                    >
                      Professional Tax
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* SECONDARY TABS FOR ATTENDANCE */}
            {['attendance', 'weeklyAttendance', 'dailyAttendance'].includes(reportSubtype) && (
              <div className="px-4 border-b border-gray-200 bg-gray-50 flex gap-4">
                <button
                  className={`py-3 px-2 border-b-2 font-medium text-sm ${reportSubtype === 'attendance' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                  onClick={() => setReportSubtype('attendance')}
                >
                  Monthly
                </button>
                <button
                  className={`py-3 px-2 border-b-2 font-medium text-sm ${reportSubtype === 'weeklyAttendance' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                  onClick={() => setReportSubtype('weeklyAttendance')}
                >
                  Weekly
                </button>
                <button
                  className={`py-3 px-2 border-b-2 font-medium text-sm ${reportSubtype === 'dailyAttendance' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                  onClick={() => setReportSubtype('dailyAttendance')}
                >
                  Daily
                </button>
              </div>
            )}

            {/* MAIN CONTENT AREA */}
            <div className="p-2 md:p-6">
              {/* 5. CONDITIONAL RENDER: 
                  If not ready (restricted user without ID set yet), show spinner.
                  This prevents the "fetch all" API call from triggering. 
              */}
              {!isReady ? (
                <div className="flex justify-center items-center py-12">
                </div>
              ) : (
                <>
                  {canViewAllData && reportType === 'employee' && (
                    <EmployeeMasterReport subtype={reportSubtype} filters={filters} />
                  )}

                  {reportType === 'transaction' && !['musterRoll', 'timestampMismatch', 'outsideAttendance'].includes(reportSubtype) && (
                    <TransactionReport subtype={reportSubtype} filters={filters} />
                  )}

                  {canViewAllData && reportType === 'statutory' && (
                    <StatutoryReport subtype={reportSubtype} filters={filters} />
                  )}

                  {reportSubtype === 'musterRoll' && (
                    <MusterRollReport filters={filters} />
                  )}

                  {reportSubtype === 'timestampMismatch' && (
                    <TimestampMismatchReport filters={filters} />
                  )}

                  {reportSubtype === 'outsideAttendance' && (
                    <OutsideAttendanceReport filters={filters} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}