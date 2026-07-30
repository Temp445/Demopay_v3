import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import {
  validateAuth,
  createAuthError,
  createTenantError,
} from './utils/storeUtils';

// Export types from lib for backward compatibility
export type {
  EmployeeBasicReport,
  EmployeeSalaryReport,
  EmployeeTaxReport,
  DepartmentReport,
  MonthlySalaryReport,
  AttendanceReport,
  LeaveReport,
  OvertimeReport,
  TaxDeductionReport,
  ProvidentFundReport,
  ProfessionalTaxReport,
  MusterRollReport,
  TimestampMismatchReport,
} from '../lib/reports';

import type {
  EmployeeBasicReport,
  EmployeeSalaryReport,
  EmployeeTaxReport,
  DepartmentReport,
  TimestampMismatchReport,
} from '../lib/reports';

// Define the interface for the new report
export interface HolidayReport {
  holidayName: string;
  date: string;
  day: string;
  type: string;
  description: string;
  // recurring: string;
}

const removeEmployeeIdColumn = (data: any[]) => {
  return data.map(({ employeeId, departmentId, ...rest }) => rest);
};

interface ReportData {
  data: any[];
  summary?: Record<string, any>;
}

interface ReportsStore {
  employeeMasterReports: Record<string, ReportData>;
  transactionReports: Record<string, ReportData>;
  statutoryReports: Record<string, ReportData>;
  loading: boolean;
  error: string | null;

  // Employee Master Report methods
  fetchEmployeeMasterReport: (subtype: string, filters: any) => Promise<void>;
  getEmployeeBasicReport: (department?: string, employeeId?: string, cadre?: string) => Promise<EmployeeBasicReport[]>;
  getEmployeeSalaryReport: (department?: string, employeeId?: string) => Promise<EmployeeSalaryReport[]>;
  getEmployeeTaxReport: (department?: string, employeeId?: string) => Promise<EmployeeTaxReport[]>;
  getDepartmentReport: (departmentFilter?: string) => Promise<DepartmentReport[]>;
  getHolidayReport: (startDate?: string, endDate?: string) => Promise<HolidayReport[]>;

  // Transaction Report methods
  fetchTransactionReport: (subtype: string, filters: any) => Promise<void>;
  getMonthlySalaryReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getAttendanceReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getWeeklyAttendanceReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: WeeklyAttendanceReport[], summary: any }>;
  getDailyAttendanceReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: DailyAttendanceReport[], summary: any }>;
  getLeaveReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getOvertimeReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getBonusReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getPayslipReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getPermissionBalanceReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getMusterRollReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getTimestampMismatchReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: TimestampMismatchReport[], summary: Record<string, number> }>;
  getOutsideAttendanceReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: Record<string, number> }>;

  // Statutory Report methods
  fetchStatutoryReport: (subtype: string, filters: any) => Promise<void>;
  getTaxDeductionReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getProvidentFundReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getInsuranceReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;
  getProfessionalTaxReport: (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => Promise<{ data: any[], summary: any }>;

  // Utility methods
  reset: () => void;
}


export const useReportsStore = create<ReportsStore>()(
  persist(
    (set, get) => ({
      employeeMasterReports: {},
      transactionReports: {},
      statutoryReports: {},
      loading: false,
      error: null,

      // Employee Master Reports
      fetchEmployeeMasterReport: async (subtype, filters) => {
        set({ loading: true, error: null });

        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) {
          set({ error: 'Authentication required', loading: false });
          return;
        }

        try {
          const { department, employee, startDate, endDate, cadre } = filters;
          let data: any[] = [];

          switch (subtype) {
            case 'basic':
              data = await get().getEmployeeBasicReport(department, employee, cadre);
              break;
            case 'salary':
              data = await get().getEmployeeSalaryReport(department, employee);
              break;
            case 'tax':
              data = await get().getEmployeeTaxReport(department, employee);
              break;
            case 'department':
              data = await get().getDepartmentReport(department);
              break;
            case 'holiday':
              data = await get().getHolidayReport(startDate, endDate);
              break;
            default:
              data = [];
          }

          set(state => ({
            employeeMasterReports: {
              ...state.employeeMasterReports,
              [subtype]: { data: removeEmployeeIdColumn(data), summary: {} }
            },
            loading: false,
            error: null
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch report',
            loading: false
          });
        }
      },

      getEmployeeBasicReport: async (department, employeeId, cadre) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) {
          throw createAuthError();
        }

        // let query = supabase
        //   .from('employees')
        //   .select('*')
        //   .eq('tenant_id', auth.tenantId);

        // if (department) {
        //   query = query.eq('department', department);
        // }

        // if (employeeId) {
        //   query = query.eq('id', employeeId);
        // }

        let selectClause = `*, departments!inner(name), roles(name), cadres(name)`;

        if (cadre) {
          // switch join type only when filtering
          selectClause = `*, departments!inner(name), roles(name), cadres!inner(name)`;
        }

        let query = supabase
          .from('employees')
          .select(selectClause)
          .eq('tenant_id', auth.tenantId);

        if (department) {
          query = query.eq('departments.name', department);
        }

        if (cadre) {
          query = query.eq('cadres.name', cadre);
        }

        if (employeeId) {
          query = query.eq('id', employeeId);
        }
        query = query.order('employee_code', { ascending: true }); // Sort by employee_code
        const { data, error } = await query;

        if (error) {
          throw new Error(error.message);
        }

        return data.map(employee => ({
          employeeId: employee.id,
          employeeCode: employee.employee_code || '-',
          name: employee.name,
          fatherOrHusbandName: employee.father_name || '-',
          contactNumber: employee.contact_number || '-',
          email: employee.email,
          uanNumber: employee.uan_number || '-',
          department: employee.departments?.name || '-',
          cadre: employee.cadres?.name || '-',
          designation: employee.roles?.name || '-',
          status: employee.status,
          startDate: employee.start_date,
          address: employee.address || '-',
          dateOfBirth: employee.date_of_birth || '-'
        }));
      },

      // getEmployeeSalaryReport: async (department, employeeId) => {
      //   try {
      //     const auth = await validateAuth();
      //     if (!auth.isAuthenticated || !auth.tenantId) {
      //       throw createAuthError();
      //     }

      //     const today = new Date().toISOString().split('T')[0];

      //     let employeeQuery = supabase
      //       .from('employees')
      //       .select('id, name, departments!inner(name), employee_code')
      //       .eq('tenant_id', auth.tenantId);

      //     if (department) employeeQuery = employeeQuery.eq('departments.name', department);
      //     if (employeeId) employeeQuery = employeeQuery.eq('id', employeeId);

      //     const { data: employees, error: employeeError } = await employeeQuery;
      //     if (employeeError) throw new Error(employeeError.message);

      //     if (!employees || employees.length === 0) {
      //       return [];
      //     }

      //     const result: EmployeeSalaryReport[] = [];

      //     for (const employee of employees) {
      //       try {
      //         const { data: salaryStructures, error: structureError } = await supabase
      //           .from('employee_salary_structure_assignments')
      //           .select(`
      //             id,
      //             assigned_at,
      //             structure:payroll_structures!inner (
      //               id,
      //               name,
      //               is_active
      //             )
      //           `)
      //           .eq('employee_id', employee.id)
      //           .eq('tenant_id', auth.tenantId)
      //           .eq('structure.is_active', true)
      //           .order('assigned_at', { ascending: false });

      //         if (structureError) continue;

      //         if (!salaryStructures || salaryStructures.length === 0) {
      //           result.push({
      //             employeeId: employee.id,
      //             employeeCode: employee.employee_code || '-',
      //             name: employee.name,
      //             department: employee.departments.name || '-',
      //             structureName: 'No Salary Structure',
      //             effectiveFrom: '-',
      //             effectiveTo: '-',
      //             basicSalary: 0,
      //             totalEarnings: 0,
      //             totalDeductions: 0,
      //             netSalary: 0
      //           });
      //           continue;
      //         }

      //         for (const structure of salaryStructures) {
      //           if (structure.effective_to && structure.effective_to <= today) {
      //             continue;
      //           }

      //           try {
      //             const { data: payrollData, error: payrollError } = await supabase
      //               .from('payroll')
      //               .select('*')
      //               .eq('employee_id', employee.id)
      //               .eq('tenant_id', auth.tenantId)
      //               .order('created_at', { ascending: false })
      //               .limit(1);

      //             if (payrollError) continue;

      //             const latestPayroll = payrollData?.[0] || null;

      //             result.push({
      //               employeeId: employee.id,
      //               employeeCode: employee.employee_code || '-',
      //               name: employee.name,
      //               department: employee.departments.name || '-',
      //               structureName: structure.structure?.name || 'Unknown Structure',
      //               effectiveFrom: structure.effective_from,
      //               effectiveTo: structure.effective_to || 'Current',
      //               basicSalary: latestPayroll?.base_salary || 0,
      //               totalEarnings: latestPayroll?.base_salary || 0,
      //               totalDeductions: latestPayroll?.deductions || 0,
      //               netSalary: latestPayroll?.total_amount || 0
      //             });
      //           } catch (innerPayrollErr) {
      //             console.error(innerPayrollErr);
      //           }
      //         }
      //       } catch (innerStructureErr) {
      //         console.error(innerStructureErr);
      //       }
      //     }

      //     return result;
      //   } catch (err) {
      //     console.error(err);
      //     return [];
      //   }
      // },

      getEmployeeSalaryReport: async (department, employeeId) => {
        try {
          const auth = await validateAuth();
          if (!auth.isAuthenticated || !auth.tenantId) {
            throw createAuthError();
          }

          const { data, error } = await supabase.rpc("get_fixed_salary_components",
            {
              p_tenant_id: auth.tenantId,
              p_department: department || null,
              p_employee_id: employeeId || null
            }
          );

          if (error) throw error;
          if (!data || data.length === 0) return [];

          const employeeMap = new Map();
          const componentSet = new Set(); // ⭐ track all component names

          data.forEach((row) => {
            componentSet.add(row.component_name);

            const key = row.employee_id;

            if (!employeeMap.has(key)) {
              employeeMap.set(key, {
                employeeId: row.employee_id,
                employeeCode: row.employee_code || "-",
                name: row.employee_name,
                department: row.department || "-",
                structureName: row.structure_name || "-",
                totalEarnings: 0,
                totalDeductions: 0,
                netSalary: 0
              });
            }

            const emp = employeeMap.get(key);

            // ⭐ Create column dynamically
            emp[row.component_name] = Number(row.amount);

            // Totals
            if (row.component_type === "earning") {
              emp.totalEarnings += Number(row.amount);
            } else if (row.component_type === "deduction") {
              emp.totalDeductions += Number(row.amount);
            }

            emp.netSalary = emp.totalEarnings - emp.totalDeductions;
          });

          const componentNames = Array.from(componentSet);

          // ⭐ Ensure all employees have all component columns
          employeeMap.forEach((emp) => {
            componentNames.forEach((name) => {
              if (emp[name] === undefined) emp[name] = 0;
            });
          });

          return Array.from(employeeMap.values());

        } catch (err) {
          console.error(err);
          return [];
        }
      },

      getEmployeeTaxReport: async (department, employeeId) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) {
          throw createAuthError();
        }

        let employeeQuery = supabase
          .from('employees')
          .select('id, name, departments!inner(name), employee_code')
          .eq('tenant_id', auth.tenantId);

        if (department) {
          employeeQuery = employeeQuery.eq('departments.name', department);
        }

        if (employeeId) {
          employeeQuery = employeeQuery.eq('id', employeeId);
        }
        employeeQuery = employeeQuery.order('employee_code', { ascending: true }); // Sort by employee_code

        const { data: employees, error: employeeError } = await employeeQuery;

        if (employeeError) {
          throw new Error(employeeError.message);
        }

        const result: EmployeeTaxReport[] = [];

        for (const employee of employees) {
          const { data: payrollData, error: payrollError } = await supabase
            .from('payroll')
            .select('*')
            .eq('employee_id', employee.id)
            .eq('tenant_id', auth.tenantId)
            .order('created_at', { ascending: false })
            .limit(1);

          if (payrollError) continue;

          const latestPayroll = payrollData && payrollData.length > 0 ? payrollData[0] : null;
          const annualSalary = (latestPayroll?.base_salary || 0) * 12;
          const estimatedTax = annualSalary * 0.2;

          result.push({
            employeeId: employee.id,
            employeeCode: employee.employee_code || '-',
            name: employee.name,
            department: employee.departments.name || '-',
            taxId: `TX${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
            taxCategory: 'Standard',
            taxableIncome: annualSalary,
            exemptions: annualSalary * 0.1,
            deductions: annualSalary * 0.05,
            taxPayable: estimatedTax
          });
        }

        return result;
      },

      getDepartmentReport: async (departmentFilter) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) {
          throw createAuthError();
        }

        let departmentQuery = supabase
          .from('departments')
          .select('id, name')
          .eq('tenant_id', auth.tenantId);

        if (departmentFilter) {
          departmentQuery = departmentQuery.eq('name', departmentFilter);
        }

        const { data: departments, error: departmentError } = await departmentQuery;

        if (departmentError) {
          throw new Error(departmentError.message);
        }

        const result: DepartmentReport[] = [];

        for (const department of departments) {
          const { data: employees, error: employeeError } = await supabase
            .from('employees')
            .select('id, departments!inner(name), roles(name)')
            .eq('departments.name', department.name)
            .eq('tenant_id', auth.tenantId);

          if (employeeError) continue;

          const employeeIds = employees.map(e => e.id);
          const roles = [...new Set(employees.map(e => e.roles.name))];

          let totalSalary = 0;
          if (employeeIds.length > 0) {
            const { data: payrollData } = await supabase
              .from('payroll')
              .select('employee_id, total_amount')
              .in('employee_id', employeeIds)
              .eq('tenant_id', auth.tenantId);

            if (payrollData && payrollData.length > 0) {
              const latestPayrollPerEmployee = new Map();
              payrollData.forEach(p => {
                if (!latestPayrollPerEmployee.has(p.employee_id)) {
                  latestPayrollPerEmployee.set(p.employee_id, p.total_amount);
                }
              });
              totalSalary = Array.from(latestPayrollPerEmployee.values()).reduce((sum, amt) => sum + (amt || 0), 0);
            }
          }

          result.push({
            departmentId: department.id,
            departmentName: department.name,
            employeeCount: employees.length,
            averageSalary: employees.length > 0 ? totalSalary / employees.length : 0,
            totalSalary: totalSalary,
            designations: roles
          });
        }

        return result;
      },

      getHolidayReport: async (startDate, endDate) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) {
          throw createAuthError();
        }

        const currentYear = new Date().getFullYear();
        const start = startDate || `${currentYear}-01-01`;
        const end = endDate || `${currentYear}-12-31`;

        // Convert strings to Date objects for comparison
        const startDateObj = new Date(start);
        const endDateObj = new Date(end);

        const { data, error } = await supabase.rpc('get_holidays', {
          p_start_date: start,
          p_end_date: end,
          p_tenant_id: auth.tenantId,
        });

        if (error) {
          throw new Error(error.message);
        }

        const expandedHolidays: HolidayReport[] = [];

        // Helper to format date as DD/MM/YYYY
        const formatDate = (date: Date) => date.toLocaleDateString('en-GB');
        // Helper to get day name (Monday, Tuesday...)
        const getDayName = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'long' });

        (data || []).forEach((h: any) => {
          // --- CHANGE: SKIP RECURRING HOLIDAYS ---
          if (h.is_recurring) {
            return;
          }

          // --- LOGIC FOR NON-RECURRING HOLIDAYS ONLY ---
          const holidayDate = new Date(h.date);

          // Ensure the specific date is within range
          if (holidayDate >= startDateObj && holidayDate <= endDateObj) {
            expandedHolidays.push({
              holidayName: h.name,
              date: formatDate(holidayDate),
              day: getDayName(holidayDate),
              type: h.holiday_type === 'public' ? 'Public Holiday' : 'Company Holiday',
              description: h.description || '-',
              // Removed 'recurring' field as requested
            });
          }
        });

        // Sort by date (DD/MM/YYYY string needs conversion for sorting)
        return expandedHolidays.sort((a, b) => {
          const [d1, m1, y1] = a.date.split('/').map(Number);
          const [d2, m2, y2] = b.date.split('/').map(Number);
          return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
        });
      },




      // Transaction Reports
      fetchTransactionReport: async (subtype, filters) => {
        set({ loading: true, error: null });

        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) {
          set({ error: 'Authentication required', loading: false });
          return;
        }

        try {
          const { startDate, endDate, department, employee } = filters;
          let data: any[] = [];
          let summary: Record<string, any> = {};

          switch (subtype) {
            case 'monthly': {
              const result = await get().getMonthlySalaryReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'weeklyAttendance': {
              const result = await get().getWeeklyAttendanceReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'dailyAttendance': {
              const result = await get().getDailyAttendanceReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'attendance': {
              const result = await get().getAttendanceReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'leave': {
              // Trigger backend sync before fetching report data
              // Use year from startDate if available, otherwise current year
              const syncYear = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear();

              if (!isNaN(syncYear)) {
                try {
                  // We use useLeaveStore.getState() to access the action inside another store action
                  const { syncAllLeaveBalances } = (await import('./leaveStore')).useLeaveStore.getState();
                  await syncAllLeaveBalances(syncYear);
                } catch (e) {
                  console.error('Leave sync failed before report:', e);
                }
              }

              const result = await get().getLeaveReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'overtime': {
              const result = await get().getOvertimeReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'bonus': {
              const result = await get().getBonusReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'payslip': {
              const result = await get().getPayslipReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'permissionBalance': {
              const result = await get().getPermissionBalanceReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'musterRoll': {
              const result = await get().getMusterRollReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'timestampMismatch': {
              const result = await get().getTimestampMismatchReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'outsideAttendance': {
              const result = await get().getOutsideAttendanceReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            default:
              data = [];
              summary = {};
          }

          set(state => ({
            transactionReports: {
              ...state.transactionReports,
              [subtype]: { data: removeEmployeeIdColumn(data), summary: {} }
            },
            loading: false,
            error: null
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch transaction report',
            loading: false
          });
        }
      },

      getMonthlySalaryReport: async (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => {
        // 1. Fetch Basic Payroll Data
        let query = supabase
          .from('payroll')
          .select(`
        *,
        employee:employees (
          id,
          name,
          department:departments!inner(name),
          employee_code
        )
      `)
          .eq('tenant_id', tenantId);

        if (startDate && endDate) {
          query = query.gte('period_start', startDate).lte('period_end', endDate);
        }
        if (employeeId) {
          query = query.eq('employee_id', employeeId);
        }

        query = query.order('employee_code', { ascending: true });

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        let filteredData = data;
        if (department) {
          filteredData = data.filter(entry => entry.employee?.department?.name === department);
        }

        // 2. Get UnpaidLeaveDays and AbsentDays component IDs
        const { data: calcComponents } = await supabase
          .from('payroll_components')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('component_category', 'calculation');

        const unpaidLeaveComponentId = calcComponents?.find(c => c.name === 'UnpaidLeaveDays')?.id;
        const absentDaysComponentId = calcComponents?.find(c => c.name === 'AbsentDays')?.id;

        /*
        // 2. Identification of LOP Leave Type ID
        const { data: allLeaveTypes } = await supabase
          .from('leave_types')
          .select('id, name')
          .eq('tenant_id', tenantId);

        const lopTypeIds = (allLeaveTypes || [])
          .filter(t => /lop|loss of pay/i.test(t.name))
          .map(t => t.id);
        */

        // 3. Process Report Data
        const reportData = await Promise.all(filteredData.map(async (entry) => {

          let lopDays = 0;

          // Define Period Dates
          const periodStart = new Date(entry.period_start);
          const periodEnd = new Date(entry.period_end);

          // Normalize to midnight for accurate day calculation
          periodStart.setHours(0, 0, 0, 0);
          periodEnd.setHours(23, 59, 59, 999); // End of day

          // --- Calculate Total Working Days ---
          // (End - Start) in milliseconds / milliseconds per day + 1
          const diffTime = periodEnd.getTime() - periodStart.getTime();
          const totalWorkingDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

          // --- Calculate LOP Days ---
          if (entry.attendance_summary) {
            const absentDays = entry.attendance_summary.total_absent_days || 0;
            const unpaidLeaveDays = entry.attendance_summary.total_leave_days ? Math.max(0, entry.attendance_summary.total_leave_days - (entry.attendance_summary.total_paid_leave_days || 0)) : 0;
            lopDays = absentDays + unpaidLeaveDays;
          } else if (entry.calculation_components) {
            const unpaidDays = unpaidLeaveComponentId ? (entry.calculation_components[unpaidLeaveComponentId] ?? 0) : 0;
            const absentDays = absentDaysComponentId ? (entry.calculation_components[absentDaysComponentId] ?? 0) : 0;
            lopDays = unpaidDays + absentDays;
          }

          /*
          // --- Calculate LOP Days ---
          if (lopTypeIds.length > 0) {
            const { data: lopRequests } = await supabase
              .from('leave_requests')
              .select('start_date, end_date')
              .eq('employee_id', entry.employee_id)
              .eq('tenant_id', tenantId)
              .eq('status', 'Approved')
              .in('leave_type_id', lopTypeIds)
              .lte('start_date', entry.period_end)
              .gte('end_date', entry.period_start);

            if (lopRequests && lopRequests.length > 0) {
              lopDays = lopRequests.reduce((total, req) => {
                const leaveStart = new Date(req.start_date);
                const leaveEnd = new Date(req.end_date);

                leaveStart.setHours(0, 0, 0, 0);
                leaveEnd.setHours(0, 0, 0, 0);

                const effectiveStart = leaveStart > periodStart ? leaveStart : periodStart;
                const effectiveEnd = leaveEnd < periodEnd ? leaveEnd : periodEnd; // Use periodEnd normalized to midnight for comparison? 
                // Note: 'periodEnd' above was set to 23:59:59. For safe comparison with leaveEnd (00:00:00), 
                // we should temporarily align them or just compare timestamps.
                // Safer method:
                const pEndMidnight = new Date(periodEnd);
                pEndMidnight.setHours(0, 0, 0, 0);

                const finalEffectiveEnd = leaveEnd < pEndMidnight ? leaveEnd : pEndMidnight;

                if (effectiveStart <= finalEffectiveEnd) {
                  const lDiff = finalEffectiveEnd.getTime() - effectiveStart.getTime();
                  const days = Math.floor(lDiff / (1000 * 60 * 60 * 24)) + 1;
                  return total + days;
                }
                return total;
              }, 0);
            }
          }
          */

          // --- Calculate Paid Working Days ---
          const paidWorkingDays = Math.max(0, totalWorkingDays - lopDays);

          return {
            employeeId: entry.employee_id,
            employeeCode: entry.employee?.employee_code || '-',
            name: entry.employee?.name || 'Unknown',
            department: entry.employee?.department.name || 'Unknown',
            payPeriod: `${new Date(entry.period_start).toLocaleDateString('en-GB')} - ${new Date(entry.period_end).toLocaleDateString('en-GB')}`,
            basicSalary: entry.base_salary,
            earnings: entry.base_salary + (entry.bonus || 0),
            deductions: entry.deductions || 0,
            overtimeAmount: (entry.overtime_hours || 0) * (entry.overtime_rate || 0),
            bonus: entry.bonus || 0,
            netAmount: entry.total_amount,
            paymentDate: entry.payment_date ? new Date(entry.payment_date).toLocaleDateString('en-GB') : '-',
            status: entry.status,
            salary_components: entry.salary_components || [],
            deduction_components: entry.deduction_components || [],
            lopDays: lopDays,
            totalWorkingDays: totalWorkingDays, // New Field
            paidWorkingDays: paidWorkingDays    // New Field
          };
        }));

        // Sort by employee code (numeric-aware)
        reportData.sort((a, b) =>
          a.employeeCode.localeCompare(b.employeeCode, undefined, {
            numeric: true,
            sensitivity: 'base'
          })
        );

        const summary = {
          totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
          totalSalary: reportData.reduce((sum, item) => sum + item.basicSalary, 0),
          totalEarnings: reportData.reduce((sum, item) => sum + item.earnings, 0),
          totalDeductions: reportData.reduce((sum, item) => sum + item.deductions, 0),
          totalOvertime: reportData.reduce((sum, item) => sum + item.overtimeAmount, 0),
          totalBonus: reportData.reduce((sum, item) => sum + item.bonus, 0),
          totalNetAmount: reportData.reduce((sum, item) => sum + item.netAmount, 0),
          // Optional: Summaries for new columns
          avgPaidDays: reportData.length > 0 ? (reportData.reduce((sum, item) => sum + item.paidWorkingDays, 0) / reportData.length).toFixed(1) : 0
        };

        return { data: reportData, summary };
      },

      getWeeklyAttendanceReport: async (startDate, endDate, department, employeeId, tenantId) => {
        const { getWeeklyAttendanceReport } = await import('../lib/reports');
        return getWeeklyAttendanceReport(startDate, endDate, department, employeeId, tenantId);
      },

      getDailyAttendanceReport: async (startDate, endDate, department, employeeId, tenantId) => {
        const { getDailyAttendanceReport } = await import('../lib/reports');
        return getDailyAttendanceReport(startDate, endDate, department, employeeId, tenantId);
      },

      getAttendanceReport: async (startDate, endDate, department, employeeId, tenantId) => {
        const normalizeDate = (dateStr: string) => {
          if (dateStr.includes('/')) {
            const [dd, mm, yyyy] = dateStr.split('/');
            return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
          }
          return dateStr;
        };

        const hasDateRange = Boolean(startDate && endDate);

        const normalizedStart = hasDateRange ? normalizeDate(startDate) : '';
        const normalizedEnd = hasDateRange ? normalizeDate(endDate) : '';

        const getDatesInRange = (start: string, end: string) => {
          const dates: string[] = [];
          let current = new Date(start);
          const stop = new Date(end);

          while (current <= stop) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
          }
          return dates;
        };

        const requestedDates = hasDateRange
          ? getDatesInRange(normalizedStart, normalizedEnd)
          : [];

        let employeeQuery = supabase
          .from('employees')
          .select('id, name, department:departments!inner(name), employee_code')
          .eq('tenant_id', tenantId);

        if (department) employeeQuery = employeeQuery.eq('departments.name', department);
        if (employeeId) employeeQuery = employeeQuery.eq('id', employeeId);
        employeeQuery = employeeQuery.order('employee_code', { ascending: true }); // Sort by employee_code

        const { data: employees, error: employeeError } = await employeeQuery;
        if (employeeError) throw new Error(employeeError.message);

        const reportData: any[] = [];
        for (const employee of employees) {
          let attendanceQuery = supabase
            .from('attendance_logs')
            .select('*')
            .eq('employee_id', employee.id)
            .eq('tenant_id', tenantId);

          if (hasDateRange) {
            attendanceQuery = attendanceQuery
              .gte('date', normalizedStart)
              .lte('date', normalizedEnd);
          }

          const { data: attendanceLogs, error } = await attendanceQuery;
          if (error) continue;

          if (hasDateRange) {
            const logMap = new Map(attendanceLogs.map(log => [log.date, log]));

            for (const date of requestedDates) {
              const log = logMap.get(date);

              if (log) {
                const clockIn = log.clock_in ? new Date(log.clock_in) : null;
                const clockOut = log.clock_out ? new Date(log.clock_out) : null;
                const workingHours =
                  clockIn && clockOut
                    ? (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)
                    : 0;

                reportData.push({
                  employeeId: employee.id,
                  employeeCode: employee.employee_code || '-',
                  name: employee.name,
                  department: employee.department?.name || '-',
                  date,
                  status: log.status || 'Present',
                  clockIn: clockIn ? clockIn.toLocaleTimeString() : '-',
                  clockOut: clockOut ? clockOut.toLocaleTimeString() : '-',
                  workingHours: parseFloat(workingHours.toFixed(2)),
                  lateMinutes: 0,
                  earlyDepartureMinutes: 0,
                  overtimeMinutes: 0
                });

              } else {
                reportData.push({
                  employeeId: employee.id,
                  employeeCode: employee.employee_code || '-',
                  name: employee.name,
                  department: employee.department?.name || '-',
                  date,
                  status: 'Absent',
                  clockIn: '-',
                  clockOut: '-',
                  workingHours: 0,
                  lateMinutes: 0,
                  earlyDepartureMinutes: 0,
                  overtimeMinutes: 0
                });
              }
            }
          }
          else {
            for (const log of attendanceLogs) {
              const clockIn = log.clock_in ? new Date(log.clock_in) : null;
              const clockOut = log.clock_out ? new Date(log.clock_out) : null;
              const workingHours =
                clockIn && clockOut
                  ? (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)
                  : 0;

              reportData.push({
                employeeId: employee.id,
                employeeCode: employee.employee_code || '-',
                name: employee.name,
                department: employee.department?.name || '-',
                date: log.date,
                status: log.status || 'Present',
                clockIn: clockIn ? clockIn.toLocaleTimeString() : '-',
                clockOut: clockOut ? clockOut.toLocaleTimeString() : '-',
                workingHours: parseFloat(workingHours.toFixed(2)),
                lateMinutes: 0,
                earlyDepartureMinutes: 0,
                overtimeMinutes: 0
              });
            }
          }
        }
        const totalHours = reportData.reduce((s, r) => s + r.workingHours, 0);

        return {
          data: reportData,
          summary: {
            totalEmployees: new Set(reportData.map(r => r.employeeId)).size,
            totalAttendanceRecords: reportData.length,
            totalWorkingHours: parseFloat(totalHours.toFixed(2)),
            averageWorkingHours: parseFloat(
              (totalHours / (reportData.length || 1)).toFixed(2)
            )
          }
        };
      },

      getLeaveReport: async (startDate, endDate, department, employeeId, tenantId) => {
        const reportYear = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear();
        const year = isNaN(reportYear) ? new Date().getFullYear() : reportYear;
        let employeeQuery = supabase
          .from('employees')
          .select('id, name, department:departments!inner(name), employee_code')
          .eq('tenant_id', tenantId);

        if (department) employeeQuery = employeeQuery.eq('departments.name', department);
        if (employeeId) employeeQuery = employeeQuery.eq('id', employeeId);

        employeeQuery = employeeQuery.order('employee_code', { ascending: true }); // Sort by employee_code

        const { data: employees, error: employeeError } = await employeeQuery;
        if (employeeError) throw new Error(employeeError.message);

        const reportData: any[] = [];

        for (const employee of employees) {
          const { data: leaveBalances, error: balancesError } = await supabase
            .from('leave_balances')
            .select(`
        *,
        leave_types ( id, name )
      `)
            .eq('employee_id', employee.id)
            .eq('tenant_id', tenantId)
            .eq('year', year);

          if (balancesError) continue;

          let leaveRequestQuery = supabase
            .from('leave_requests')
            .select('leave_type_id, start_date, end_date, status')
            .eq('employee_id', employee.id)
            .eq('tenant_id', tenantId)
            .in('status', ['Approved', 'Pending']);

          if (startDate && endDate) {
            leaveRequestQuery = leaveRequestQuery
              .gte('start_date', startDate)
              .lte('end_date', endDate);
          }

          const { data: leaveRequests } = await leaveRequestQuery;

          // const usedDaysByType = (approvedLeaves || []).reduce(
          //   (acc, leave) => {
          //     const start = new Date(leave.start_date);
          //     const end = new Date(leave.end_date);
          //     const days =
          //       Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          //     acc[leave.leave_type_id] =
          //       (acc[leave.leave_type_id] || 0) + days;

          //     return acc;
          //   },
          //   {} as Record<string, number>
          // );

          const leaveStatsByType = (leaveRequests || []).reduce(
            (acc, leave) => {
              const start = new Date(leave.start_date);
              const end = new Date(leave.end_date);

              const days =
                Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

              if (!acc[leave.leave_type_id]) {
                acc[leave.leave_type_id] = {
                  approved: 0,
                  pending: 0
                };
              }

              if (leave.status === 'Approved') {
                acc[leave.leave_type_id].approved += days;
              }

              if (leave.status === 'Pending') {
                acc[leave.leave_type_id].pending += days;
              }

              return acc;
            },
            {} as Record<string, { approved: number; pending: number }>
          );

          for (const balance of leaveBalances) {
            const leaveName = balance.leave_types?.name || 'Unknown';

            if (/lop|loss of pay/i.test(leaveName)) {
              continue;
            }

            // const usedDays = usedDaysByType[balance.leave_type_id] || 0;

            const stats = leaveStatsByType[balance.leave_type_id] || {
              approved: 0,
              pending: 0
            };

            const usedDays = stats.approved;
            const pendingRequests = stats.pending;

            reportData.push({
              employeeId: employee.id,
              employeeCode: employee.employee_code || '-',
              name: employee.name,
              department: employee.department.name || '-',
              leaveType: leaveName,
              totalDays: balance.total_days,
              usedDays,
              remainingDays: balance.total_days - usedDays,
              pendingRequests: pendingRequests
            });
          }
        }

        const summary = {
          totalEmployees: new Set(reportData.map(r => r.employeeId)).size,
          totalAllocatedDays: reportData.reduce((s, r) => s + r.totalDays, 0),
          totalUsedDays: reportData.reduce((s, r) => s + r.usedDays, 0),
          totalRemainingDays: reportData.reduce((s, r) => s + r.remainingDays, 0),
        };

        return { data: reportData, summary };
      },

      getOvertimeReport: async (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => {
        let query = supabase
          .from('ot_processed_data')
          .select(`
            id,
            total_ot_hours,
            total_ot_amount,
            processing_status,
            ot_processing!inner (
              processing_period_start,
              processing_period_end,
              processed_at
            ),
            employee:employees!inner (
              id,
              employee_code,
              name,
              department:departments!inner (
                name
              )
            )
          `)
          .eq('tenant_id', tenantId);

        // Apply filters directly to the query
        if (startDate) {
          query = query.gte('ot_processing.processing_period_start', startDate);
        }
        if (endDate) {
          query = query.lte('ot_processing.processing_period_end', endDate);
        }
        if (employeeId) {
          query = query.eq('employee_id', employeeId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        let filteredData = data || [];

        // Manual filtering for department if nested join filter is tricky
        if (department) {
          filteredData = filteredData.filter((row: any) =>
            row.employee?.department?.name === department
          );
        }

        const reportData = filteredData.map((row: any) => ({
          employeeId: row.employee?.id,
          employeeCode: row.employee?.employee_code || '-',
          name: row.employee?.name || 'Unknown',
          department: row.employee?.department?.name || 'Unknown',
          period: `${new Date(row.ot_processing?.processing_period_start).toLocaleDateString('en-GB')} - ${new Date(row.ot_processing?.processing_period_end).toLocaleDateString('en-GB')}`,
          otHours: parseFloat(row.total_ot_hours?.toFixed(2) || '0'),
          amount: parseFloat(row.total_ot_amount?.toFixed(2) || '0'),
          status: row.processing_status === 'finalized' ? 'Approved' : 'Pending'
        }));

        const summary = {
          totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
          totalOvertimeHours: parseFloat(reportData.reduce((sum, item) => sum + item.otHours, 0).toFixed(2)),
          totalOvertimeAmount: parseFloat(reportData.reduce((sum, item) => sum + item.amount, 0).toFixed(2))
        };

        return { data: reportData, summary };
      },

      getBonusReport: async (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => {
        let query = supabase
          .from('payroll')
          .select(`
        *,
        employee:employees (
          id,
          name,
          department:departments!inner(name),
          employee_code
        )
      `)
          .eq('tenant_id', tenantId)
          .gt('bonus', 0);

        if (startDate && endDate) {
          query = query.gte('period_start', startDate).lte('period_end', endDate);
        }
        if (employeeId) {
          query = query.eq('employee_id', employeeId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        let filteredData = data;
        if (department) {
          filteredData = data.filter(entry => entry.employee?.department?.name === department);
        }

        const reportData = filteredData.map(entry => ({
          employeeId: entry.employee_id,
          employeeCode: entry.employee?.employee_code || '-',
          name: entry.employee?.name || 'Unknown',
          department: entry.employee?.department?.name || 'Unknown',
          payPeriod: `${new Date(entry.period_start).toLocaleDateString('en-GB')} - ${new Date(entry.period_end).toLocaleDateString('en-GB')}`,
          bonusAmount: entry.bonus,
          bonusType: 'Performance',
          baseSalary: entry.base_salary,
          bonusPercentage: parseFloat(((entry.bonus / entry.base_salary) * 100).toFixed(2)),
          paymentDate: entry.payment_date ? new Date(entry.payment_date).toLocaleDateString('en-GB') : '-'
        }));

        const summary = {
          totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
          totalBonusAmount: reportData.reduce((sum, item) => sum + item.bonusAmount, 0),
          averageBonusAmount: parseFloat((reportData.reduce((sum, item) => sum + item.bonusAmount, 0) / (reportData.length || 1)).toFixed(2)),
          averageBonusPercentage: parseFloat((reportData.reduce((sum, item) => sum + item.bonusPercentage, 0) / (reportData.length || 1)).toFixed(2))
        };

        return { data: reportData, summary };
      },

      getPayslipReport: async (
        startDate: string,
        endDate: string,
        department: string,
        employeeId: string,
        tenantId: string
      ) => {
        // 1️⃣ Fetch Payroll Data
        let query = supabase
          .from('payroll')
          .select(`
      *,
      employee:employees (
        id,
        name,
        father_name,
        employee_code,
        uan_number,
        start_date,
        department:departments!inner(name),
        role:roles(name)
      )
    `)
          .eq('tenant_id', tenantId);

        if (startDate && endDate) {
          query = query.gte('period_start', startDate).lte('period_end', endDate);
        }

        if (employeeId) {
          query = query.eq('employee_id', employeeId);
        }

        const { data: payrollData, error: payrollError } = await query;
        if (payrollError) throw new Error(payrollError.message);

        let filteredData = payrollData || [];

        if (department) {
          filteredData = filteredData.filter(
            (entry: any) => entry.employee?.department?.name === department
          );
        }

        if (filteredData.length === 0) {
          return {
            data: [],
            summary: {
              totalEmployees: 0,
              totalGrossEarnings: 0,
              totalDeductions: 0,
              totalNetPay: 0,
            },
          };
        }

        const employeeIds = [
          ...new Set(filteredData.map((entry: any) => entry.employee_id)),
        ];

        // 2️⃣ Fetch Secondary Data

        // 🔹 Fetch HISTORICAL Leave Balances per payroll entry's period
        // Each payroll entry may have a different period_start month, so we fetch
        // historical balance per (employee, year, month) combination — not a live sync.
        //
        // Build a map: key = "empId:year:month" → historical leave balance array
        const uniquePeriods = new Map<string, { empId: string; year: number; month: number }>();
        for (const entry of filteredData) {
          const d = new Date(entry.period_start);
          const key = `${entry.employee_id}:${d.getFullYear()}:${d.getMonth() + 1}`;
          if (!uniquePeriods.has(key)) {
            uniquePeriods.set(key, {
              empId: entry.employee_id,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
            });
          }
        }

        const historicalLeavePromises = Array.from(uniquePeriods.entries()).map(
          ([key, { empId, year, month }]) =>
            supabase
              .rpc('get_historical_leave_balance', {
                p_employee_id: empId,
                p_year: year,
                p_month: month,
                p_tenant_id: tenantId,
              })
              .then((res: any) => ({ key, data: res.data || [], error: res.error }))
        );

        const [historicalLeaveResults, advanceRes, structureRes] = await Promise.all([
          Promise.all(historicalLeavePromises),

          supabase
            .from('employee_advances')
            .select('employee_id, total_amount, remaining_balance, status')
            .in('employee_id', employeeIds)
            .eq('tenant_id', tenantId)
            .in('status', ['approved', 'active', 'completed']),

          supabase
            .from('payroll_structure_components')
            .select(
              'is_applied_in_calculation, component:payroll_components!inner(name)'
            )
            .eq('tenant_id', tenantId),
        ]);

        // Build lookup: "empId:year:month" → leave balance rows
        const historicalLeaveMap = new Map<string, any[]>();
        for (const result of historicalLeaveResults) {
          if (result.error) {
            console.error('Historical Leave Fetch Error:', result.error.message);
          }
          historicalLeaveMap.set(result.key, result.data);
        }

        const advances = advanceRes.data || [];
        const structureComponents = structureRes.data || [];

        const allowedDeductions = new Set(
          structureComponents
            .filter((item: any) => item.is_applied_in_calculation === true)
            .map((item: any) => item.component?.name)
        );

        // 3️⃣ Map Report Data
        const reportData = filteredData.map((entry: any, index: number) => {
          const salaryComponents = entry.salary_components || [];
          const allDeductions = entry.deduction_components || [];

          const deductionComponents = allDeductions.filter(
            (comp: any) =>
              allowedDeductions.has(comp.name) ||
              comp.name.toLowerCase().includes('advance')
          );

          const periodStart = new Date(entry.period_start);
          const periodEnd = new Date(entry.period_end);

          const totalDays =
            Math.floor(
              (periodEnd.getTime() - periodStart.getTime()) /
              (1000 * 60 * 60 * 24)
            ) + 1;

          // 🔹 Historical Leave Logic: look up by this entry's period key
          const periodKey = `${entry.employee_id}:${periodStart.getFullYear()}:${periodStart.getMonth() + 1}`;
          const employeeLeaves: any[] = historicalLeaveMap.get(periodKey) || [];

          const dynamicLeaveBalances = employeeLeaves.reduce(
            (acc: Record<string, number>, lb: any) => {
              const name = lb.leave_name || 'Unknown';

              // ✅ HIDE LOP / LOSS OF PAY / UNPAID from payslip leave section
              const lowerName = name.toLowerCase();
              if (
                lowerName.includes('lop') ||
                lowerName.includes('loss of pay') ||
                lowerName.includes('unpaid')
              ) {
                return acc;
              }

              // Use the pre-computed balance from the historical RPC
              acc[name] = Number(lb.balance) || 0;
              return acc;
            },
            {}
          );

          const employeeAdvances = advances.filter(
            (adv: any) => adv.employee_id === entry.employee_id
          );

          const totalAdvanceBalance = employeeAdvances.reduce(
            (sum: number, adv: any) =>
              sum + (Number(adv.remaining_balance) || 0),
            0
          );

          const payPeriod = periodStart
            .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
            .toUpperCase();

          return {
            slNo: index + 1,
            employeeId: entry.employee?.id || '-',
            employeeCode: entry.employee?.employee_code || '-',
            name: entry.employee?.name || 'Unknown',
            fatherName: entry.employee?.father_name || '-',
            designation: entry.employee?.role?.name || '-',
            uanNumber: entry.employee?.uan_number || '-',
            dateOfEntry: entry.employee?.start_date
              ? new Date(entry.employee.start_date).toLocaleDateString('en-GB')
              : '-',
            noOfDaysWorked: totalDays,
            leaveWithWages: 1,
            noOfDaysWagesPaid: totalDays,
            payPeriod,
            earnings: salaryComponents.reduce((acc: any, comp: any) => {
              acc[comp.name] = comp.amount || 0;
              return acc;
            }, {}),
            deductions: deductionComponents.reduce((acc: any, comp: any) => {
              acc[comp.name] = comp.amount || 0;
              return acc;
            }, {}),
            grossEarnings:
              Number(entry.base_salary) + (Number(entry.bonus) || 0),
            totalDeductions: Number(entry.deductions) || 0,
            netPay: Number(entry.total_amount),
            lessAmount: 0,
            paidAmount: Number(entry.total_amount),
            leaveBalances: dynamicLeaveBalances,
            advanceBalance: totalAdvanceBalance,
            vehicleBalance: 0,
            allEarnings: salaryComponents,
            allDeductions: deductionComponents,
          };
        });

        // 4️⃣ Summary
        const summary = {
          totalEmployees: reportData.length,
          totalGrossEarnings: reportData.reduce(
            (sum: number, item: any) => sum + item.grossEarnings,
            0
          ),
          totalDeductions: reportData.reduce(
            (sum: number, item: any) => sum + item.totalDeductions,
            0
          ),
          totalNetPay: reportData.reduce(
            (sum: number, item: any) => sum + item.netPay,
            0
          ),
        };

        return { data: reportData, summary };
      },

      getPermissionBalanceReport: async (
        startDate: string,
        endDate: string,
        department: string,
        employeeId: string,
        tenantId: string,
      ) => {
        let employeeQuery = supabase
          .from("employees")
          .select("id, name, employee_code, department:departments!inner(name)")
          .eq("tenant_id", tenantId);

        if (department)
          employeeQuery = employeeQuery.eq("departments.name", department);
        if (employeeId) employeeQuery = employeeQuery.eq("id", employeeId);

        employeeQuery = employeeQuery.order("employee_code", {
          ascending: true,
        });

        const { data: employees, error: employeeError } = await employeeQuery;
        if (employeeError) throw new Error(employeeError.message);

        if (!employees || employees.length === 0)
          return { data: [], summary: null };

        const empIds = employees.map((emp) => emp.id);

        let attendanceQuery = supabase
          .from("attendance_logs")
          .select("employee_id, date, status")
          .in("employee_id", empIds)
          .eq("tenant_id", tenantId);

        if (startDate && endDate) {
          attendanceQuery = attendanceQuery
            .gte("date", startDate)
            .lte("date", endDate);
        }

        attendanceQuery = attendanceQuery.order("date", { ascending: true });

        const { data: attendanceLogs, error: attendanceError } =
          await attendanceQuery;
        if (attendanceError) throw new Error(attendanceError.message);

        let balanceQuery = supabase
          .from("employee_permission_balance")
          .select("*")
          .in("employee_id", empIds)
          .eq("tenant_id", tenantId);

        if (startDate && endDate) {
          const startYear = new Date(startDate).getFullYear();
          const endYear = new Date(endDate).getFullYear();
          balanceQuery = balanceQuery
            .gte("year", startYear)
            .lte("year", endYear);
        }

        const { data: balances, error: balanceError } = await balanceQuery;
        if (balanceError) throw new Error(balanceError.message);

        const periodSet = new Set<string>();

        (balances || []).forEach((b) => periodSet.add(`${b.year}-${b.month}`));

        (attendanceLogs || []).forEach((log) => {
          const logDate = new Date(log.date);
          periodSet.add(`${logDate.getFullYear()}-${logDate.getMonth() + 1}`);
        });

        if (periodSet.size === 0 && startDate && endDate) {
          let currentMonth = new Date(startDate);
          currentMonth.setDate(1);
          const lastMonth = new Date(endDate);
          lastMonth.setDate(1);

          while (currentMonth <= lastMonth) {
            periodSet.add(
              `${currentMonth.getFullYear()}-${currentMonth.getMonth() + 1}`,
            );
            currentMonth.setMonth(currentMonth.getMonth() + 1);
          }
        }

        const monthsList = Array.from(periodSet)
          .map((p) => {
            const [year, month] = p.split("-").map(Number);
            const dateObj = new Date(year, month - 1, 1);
            return {
              month,
              year,
              monthYearString: dateObj.toLocaleDateString("en-GB", {
                month: "short",
                year: "numeric",
              }),
            };
          })
          .sort((a, b) =>
            a.year === b.year ? a.month - b.month : a.year - b.year,
          );

        const reportData: any[] = [];

        for (const employee of employees) {
          for (const period of monthsList) {
            const balanceData = (balances || []).find(
              (b) =>
                b.employee_id === employee.id &&
                b.month === period.month &&
                b.year === period.year,
            );

            const monthLogs = (attendanceLogs || []).filter((log) => {
              if (log.employee_id !== employee.id) return false;
              const logDate = new Date(log.date);
              return (
                logDate.getMonth() + 1 === period.month &&
                logDate.getFullYear() === period.year
              );
            });

            if (!balanceData && monthLogs.length === 0) continue;

            const lateDates: string[] = [];
            const earlyExitDates: string[] = [];
            const permissionDates: string[] = [];

            monthLogs.forEach((log) => {
              const status = (log.status || "").toLowerCase();
              const formattedDate = new Date(log.date).toLocaleDateString(
                "en-GB",
              );

              if (status === "late") lateDates.push(formattedDate);
              if (status === "early exit") earlyExitDates.push(formattedDate);
              if (status === "permission") permissionDates.push(formattedDate);
            });

            const totalAllowedLate =
              balanceData?.total_allowed_late_entry_count ?? 5;
            const usedLate = balanceData?.late_entry_count ?? 0;
            const lateCountBalance = totalAllowedLate - usedLate;

            const totalAllowedEarly =
              balanceData?.total_allowed_early_exit_count ?? 5;
            const usedEarly = balanceData?.early_exit_count ?? 0;
            const earlyExitBalance = totalAllowedEarly - usedEarly;

            const permissionBalanceMinutes =
              balanceData?.remaining_minutes ?? 180;

            reportData.push({
              employeeId: employee.id,
              employeeCode: employee.employee_code || "-",
              name: employee.name,
              department: employee.department?.name || "-",
              monthYear: period.monthYearString,

              lateDates: lateDates.length > 0 ? lateDates.join(", ") : "-",
              lateBalance: lateCountBalance,

              earlyExitDates:
                earlyExitDates.length > 0 ? earlyExitDates.join(", ") : "-",
              earlyExitBalance: earlyExitBalance,

              permissionDates:
                permissionDates.length > 0 ? permissionDates.join(", ") : "-",
              permissionBalanceMinutes,
            });
          }
        }

        // 6. Calculate Summary
        const summary = {
          totalRecords: reportData.length,
          totalLateEntries: reportData.reduce((sum, item) => {
            const dates =
              item.lateDates === "-" ? [] : item.lateDates.split(", ");
            return sum + dates.length;
          }, 0),
          totalEarlyExits: reportData.reduce((sum, item) => {
            const dates =
              item.earlyExitDates === "-"
                ? []
                : item.earlyExitDates.split(", ");
            return sum + dates.length;
          }, 0),
          totalPermissionDays: reportData.reduce((sum, item) => {
            const dates =
              item.permissionDates === "-"
                ? []
                : item.permissionDates.split(", ");
            return sum + dates.length;
          }, 0),
          averagePermissionBalance:
            reportData.length > 0
              ? parseFloat(
                (
                  reportData.reduce(
                    (sum, item) => sum + item.permissionBalance,
                    0,
                  ) / reportData.length
                ).toFixed(2),
              )
              : 0,
        };

        return { data: reportData, summary };
      },

      // Statutory Reports
      fetchStatutoryReport: async (subtype, filters) => {
        set({ loading: true, error: null });

        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) {
          set({ error: 'Authentication required', loading: false });
          return;
        }

        try {
          const { startDate, endDate, department, employee } = filters;
          let data: any[] = [];
          let summary: Record<string, any> = {};

          switch (subtype) {
            case 'taxDeduction': {
              const result = await get().getTaxDeductionReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'providentFund': {
              const result = await get().getProvidentFundReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'insurance': {
              const result = await get().getInsuranceReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            case 'professionalTax': {
              const result = await get().getProfessionalTaxReport(startDate, endDate, department, employee, auth.tenantId);
              data = result.data;
              summary = result.summary;
              break;
            }
            default:
              data = [];
              summary = {};
          }

          set(state => ({
            statutoryReports: {
              ...state.statutoryReports,
              [subtype]: { data: removeEmployeeIdColumn(data), summary: {} }
            },
            loading: false,
            error: null
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch statutory report',
            loading: false
          });
        }
      },

      getTaxDeductionReport: async (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => {
        let employeeQuery = supabase
          .from('employees')
          .select('id, name, department:departments!inner(name), employee_code')
          .eq('tenant_id', tenantId);

        if (department) employeeQuery = employeeQuery.eq('departments.name', department);
        if (employeeId) employeeQuery = employeeQuery.eq('id', employeeId);

        const { data: employees, error: employeeError } = await employeeQuery;
        if (employeeError) throw new Error(employeeError.message);

        const reportData: any[] = [];

        for (const employee of employees) {
          let payrollQuery = supabase
            .from('payroll')
            .select('*')
            .eq('employee_id', employee.id)
            .eq('tenant_id', tenantId)
            .order('period_start', { ascending: true });

          if (startDate && endDate) {
            payrollQuery = payrollQuery.gte('period_start', startDate).lte('period_end', endDate);
          }

          const { data: payrollEntries, error: payrollError } = await payrollQuery;
          if (payrollError) {
            console.error(`Error fetching payroll for employee ${employee.id}:`, payrollError);
            continue;
          }

          const extractTDSAmount = (deductionComponents: any[]): number => {
            if (!Array.isArray(deductionComponents)) return 0;

            const tdsComponent = deductionComponents.find((comp: any) => {
              const componentName = (comp.name || '').toLowerCase();
              return (
                componentName.includes('tds') ||
                componentName.includes('tax deducted at source') ||
                componentName.includes('income tax') ||
                componentName.includes('tax deduction')
              );
            });

            return tdsComponent?.amount || 0;
          };

          const taxPeriods = payrollEntries.reduce((acc, entry) => {
            const periodStart = new Date(entry.period_start);
            const period = `${periodStart.getFullYear()}-${(periodStart.getMonth() + 1).toString().padStart(2, '0')}`;

            if (!acc[period]) {
              acc[period] = { taxableIncome: 0, taxDeducted: 0 };
            }

            const tdsAmount = extractTDSAmount(entry.deduction_components);

            const totalEarnings = Array.isArray(entry.salary_components)
              ? entry.salary_components.reduce((sum: number, comp: any) => sum + (comp.amount || 0), 0)
              : entry.base_salary || 0;

            acc[period].taxableIncome += totalEarnings;
            acc[period].taxDeducted += tdsAmount;

            return acc;
          }, {} as Record<string, { taxableIncome: number, taxDeducted: number }>);

          let cumulativeTax = 0;

          for (const [period, data] of Object.entries(taxPeriods)) {
            cumulativeTax += data.taxDeducted;

            reportData.push({
              employeeId: employee.id,
              employeeCode: employee.employee_code || '-',
              name: employee.name,
              department: employee.department?.name || '-',
              taxPeriod: period,
              taxableIncome: parseFloat(data.taxableIncome.toFixed(2)),
              taxDeducted: parseFloat(data.taxDeducted.toFixed(2)),
              // cumulativeTax: parseFloat(cumulativeTax.toFixed(2))
            });
          }
        }

        const summary = {
          totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
          totalTaxableIncome: parseFloat(reportData.reduce((sum, item) => sum + item.taxableIncome, 0).toFixed(2)),
          totalTaxDeducted: parseFloat(reportData.reduce((sum, item) => sum + item.taxDeducted, 0).toFixed(2)),
          averageTaxRate: reportData.reduce((sum, item) => sum + item.taxableIncome, 0) > 0
            ? parseFloat(((reportData.reduce((sum, item) => sum + item.taxDeducted, 0) / reportData.reduce((sum, item) => sum + item.taxableIncome, 0)) * 100).toFixed(2))
            : 0
        };

        return { data: reportData, summary };
      },

      getProvidentFundReport: async (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => {
        let employeeQuery = supabase
          .from('employees')
          .select('id, name, department:departments!inner(name), employee_code')
          .eq('tenant_id', tenantId);

        if (department) employeeQuery = employeeQuery.eq('departments.name', department);
        if (employeeId) employeeQuery = employeeQuery.eq('id', employeeId);

        const { data: employees, error: employeeError } = await employeeQuery;
        if (employeeError) throw new Error(employeeError.message);

        const reportData: any[] = [];

        // --- UPDATED STRICT EXTRACTION LOGIC ---
        const extractPFContributions = (deductionComponents: any[]): { employee: number; employer: number } => {
          if (!Array.isArray(deductionComponents)) return { employee: 0, employer: 0 };

          const employeePFComponent = deductionComponents.find((comp: any) => {
            const name = (comp.name || '').toLowerCase();
            const isPF = name.includes('pf') || name.includes('provident fund');
            // \b ensures it only matches the exact whole word 'employee' or 'emp'
            const isEmployee = /\b(employee|emp)\b/.test(name);
            return isPF && isEmployee;
          });

          const employerPFComponent = deductionComponents.find((comp: any) => {
            const name = (comp.name || '').toLowerCase();
            const isPF = name.includes('pf') || name.includes('provident fund');
            // Matches exact whole word 'employer' or 'company'
            const isEmployer = /\b(employer|company)\b/.test(name);
            return isPF && isEmployer;
          });

          const singlePFComponent = deductionComponents.find((comp: any) => {
            const name = (comp.name || '').toLowerCase();
            const isPF = name.includes('pf') || name.includes('provident fund');
            const isEmployee = /\b(employee|emp)\b/.test(name);
            const isEmployer = /\b(employer|company)\b/.test(name);
            return isPF && !isEmployee && !isEmployer;
          });

          let employeeContribution = employeePFComponent?.amount || 0;
          let employerContribution = employerPFComponent?.amount || 0;

          // Fallback if only a single, vaguely named PF component exists
          if (!employeeContribution && !employerContribution && singlePFComponent) {
            employeeContribution = singlePFComponent.amount || 0;
            employerContribution = singlePFComponent.amount || 0;
          }

          return { employee: employeeContribution, employer: employerContribution };
        };
        // ---------------------------------------

        for (const employee of employees) {
          let payrollQuery = supabase
            .from('payroll')
            .select('*')
            .eq('employee_id', employee.id)
            .eq('tenant_id', tenantId)
            .order('period_start', { ascending: true });

          if (startDate && endDate) {
            payrollQuery = payrollQuery.gte('period_start', startDate).lte('period_end', endDate);
          }

          const { data: payrollEntries, error: payrollError } = await payrollQuery;
          if (payrollError) {
            console.error(`Error fetching payroll for employee ${employee.id}:`, payrollError);
            continue;
          }

          const contributionPeriods = payrollEntries.reduce((acc, entry) => {
            const periodStart = new Date(entry.period_start);
            const period = `${periodStart.getFullYear()}-${(periodStart.getMonth() + 1).toString().padStart(2, '0')}`;

            if (!acc[period]) {
              // Added totalEarnings to the accumulator
              acc[period] = { employeeContribution: 0, employerContribution: 0, totalEarnings: 0 };
            }

            const pfContributions = extractPFContributions(entry.deduction_components);
            acc[period].employeeContribution += pfContributions.employee;
            acc[period].employerContribution += pfContributions.employer;

            // Calculate total earnings from salary_components for this period
            const earningsForPeriod = Array.isArray(entry.salary_components)
              ? entry.salary_components.reduce((sum: number, comp: any) => sum + (Number(comp.amount) || 0), 0)
              : 0;

            acc[period].totalEarnings += earningsForPeriod;

            return acc;
          }, {} as Record<string, { employeeContribution: number; employerContribution: number; totalEarnings: number }>);


          let cumulativeBalance = 0;

          for (const [period, data] of Object.entries(contributionPeriods)) {
            const employeeContribution = data.employeeContribution;
            const employerContribution = data.employerContribution;
            const totalEarnings = data.totalEarnings; // Extracted totalEarnings
            const totalContribution = employeeContribution + employerContribution;

            cumulativeBalance += totalContribution;

            reportData.push({
              employeeId: employee.id,
              employeeCode: employee.employee_code || '-',
              name: employee.name,
              department: employee.department?.name || '-',
              contributionPeriod: period,
              taxableIncome: parseFloat(totalEarnings.toFixed(2)),
              employeeContribution: parseFloat(employeeContribution.toFixed(2)),
              employerContribution: parseFloat(employerContribution.toFixed(2)),
              totalContribution: parseFloat(totalContribution.toFixed(2)),
              cumulativeBalance: parseFloat(cumulativeBalance.toFixed(2)) // Uncommented to prevent NaN in summary
            });
          }
        }

        const summary = {
          totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
          totalTaxableIncome: parseFloat(reportData.reduce((sum, item) => sum + item.taxableIncome, 0).toFixed(2)),
          totalEmployeeContribution: parseFloat(reportData.reduce((sum, item) => sum + item.employeeContribution, 0).toFixed(2)),
          totalEmployerContribution: parseFloat(reportData.reduce((sum, item) => sum + item.employerContribution, 0).toFixed(2)),
          totalContribution: parseFloat(reportData.reduce((sum, item) => sum + item.totalContribution, 0).toFixed(2)),
          totalCumulativeBalance: parseFloat(reportData.reduce((sum, item) => Math.max(sum, item.cumulativeBalance || 0), 0).toFixed(2))
        };

        return { data: reportData, summary };
      },

      getInsuranceReport: async (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => {
        let employeeQuery = supabase
          .from('employees')
          .select('id, name, department:departments!inner(name), employee_code')
          .eq('tenant_id', tenantId);

        if (department) employeeQuery = employeeQuery.eq('departments.name', department);
        if (employeeId) employeeQuery = employeeQuery.eq('id', employeeId);

        const { data: employees, error: employeeError } = await employeeQuery;
        if (employeeError) throw new Error(employeeError.message);

        const reportData: any[] = [];

        for (const employee of employees) {
          const { data: payrollData } = await supabase
            .from('payroll')
            .select('base_salary')
            .eq('employee_id', employee.id)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(1);

          const baseSalary = payrollData && payrollData.length > 0 ? payrollData[0].base_salary : 50000;

          reportData.push({
            employeeId: employee.id,
            employeeCode: employee.employee_code || '-',
            name: employee.name,
            department: employee.department?.name || '-',
            insuranceType: 'Health Insurance',
            coverageAmount: baseSalary * 10,
            premiumAmount: baseSalary * 0.05,
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
            beneficiaries: 'Self + Family'
          });
        }

        const summary = {
          totalEmployees: reportData.length,
          totalCoverageAmount: reportData.reduce((sum, item) => sum + item.coverageAmount, 0),
          totalPremiumAmount: reportData.reduce((sum, item) => sum + item.premiumAmount, 0),
          averageCoverageAmount: parseFloat((reportData.reduce((sum, item) => sum + item.coverageAmount, 0) / (reportData.length || 1)).toFixed(2))
        };

        return { data: reportData, summary };
      },

      getProfessionalTaxReport: async (startDate: string, endDate: string, department: string, employeeId: string, tenantId: string) => {
        let employeeQuery = supabase
          .from('employees')
          .select('id, name, department:departments!inner(name), employee_code')
          .eq('tenant_id', tenantId);

        if (department) employeeQuery = employeeQuery.eq('departments.name', department);
        if (employeeId) employeeQuery = employeeQuery.eq('id', employeeId);

        const { data: employees, error: employeeError } = await employeeQuery;
        if (employeeError) throw new Error(employeeError.message);

        const reportData: any[] = [];

        const extractProfessionalTaxAmount = (deductionComponents: any[]): number => {
          if (!Array.isArray(deductionComponents)) return 0;

          const ptComponent = deductionComponents.find((comp: any) => {
            const componentName = (comp.name || '').toLowerCase();
            return (
              componentName.includes('professional tax') ||
              componentName.includes('pt') ||
              componentName.includes('prof tax') ||
              componentName.includes('p tax') ||
              componentName.includes('p.tax')
            );
          });

          return ptComponent?.amount || 0;
        };

        for (const employee of employees) {
          let payrollQuery = supabase
            .from('payroll')
            .select('*')
            .eq('employee_id', employee.id)
            .eq('tenant_id', tenantId);

          if (startDate && endDate) {
            payrollQuery = payrollQuery.gte('period_start', startDate).lte('period_end', endDate);
          }

          const { data: payrollEntries, error: payrollError } = await payrollQuery;
          if (payrollError) {
            console.error(`Error fetching payroll for employee ${employee.id}:`, payrollError);
            continue;
          }

          for (const entry of payrollEntries) {
            const taxPeriod = new Date(entry.period_start).toISOString().split('T')[0].substring(0, 7);

            const professionalTaxAmount = extractProfessionalTaxAmount(entry.deduction_components);

            const totalEarnings = Array.isArray(entry.salary_components)
              ? entry.salary_components.reduce((sum: number, comp: any) => sum + (comp.amount || 0), 0)
              : entry.base_salary || 0;

            reportData.push({
              employeeId: employee.id,
              employeeCode: employee.employee_code || '-',
              name: employee.name,
              department: employee.department?.name || '-',
              taxPeriod,
              taxableIncome: parseFloat(totalEarnings.toFixed(2)),
              taxAmount: parseFloat(professionalTaxAmount.toFixed(2)),
              // paymentDate: entry.payment_date ? new Date(entry.payment_date).toLocaleDateString('en-GB') : '-',
              // receiptNumber: `PT${employee.id.substring(0, 8)}-${taxPeriod}`
            });
          }
        }

        const summary = {
          totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
          totalTaxableIncome: parseFloat(reportData.reduce((sum, item) => sum + item.taxableIncome, 0).toFixed(2)),
          totalTaxAmount: parseFloat(reportData.reduce((sum, item) => sum + item.taxAmount, 0).toFixed(2)),
          averageTaxAmount: parseFloat((reportData.reduce((sum, item) => sum + item.taxAmount, 0) / (reportData.length || 1)).toFixed(2))
        };

        return { data: reportData, summary };
      },

      getMusterRollReport: async (startDate, endDate, department, employeeId, tenantId) => {
        const { getMusterRollReport } = await import('../lib/reports');
        return getMusterRollReport(startDate, endDate, department, employeeId, tenantId);
      },

      getTimestampMismatchReport: async (startDate, endDate, department, employeeId, tenantId) => {
        const { getTimestampMismatchReport } = await import('../lib/reports');
        return getTimestampMismatchReport(startDate, endDate, department, employeeId, tenantId);
      },

      getOutsideAttendanceReport: async (startDate, endDate, department, employeeId, tenantId) => {
        const { getOutsideAttendanceReport } = await import('../lib/reports');
        return getOutsideAttendanceReport(startDate, endDate, department, employeeId, tenantId);
      },

      reset: () => {
        set({
          employeeMasterReports: {},
          transactionReports: {},
          statutoryReports: {},
          loading: false,
          error: null,
        });
      },
    }),
    {
      name: 'reports-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        employeeMasterReports: state.employeeMasterReports,
        transactionReports: state.transactionReports,
        statutoryReports: state.statutoryReports,
      }),
    }
  )
);