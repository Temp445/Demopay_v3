import { supabase } from './supabase';
import { Employee } from './employees';
import { PayrollEntry } from './payroll';
import { LeaveRequest, LeaveBalance } from './leave';
import { AttendanceLog } from './attendance';
import { ShiftAssignment } from './shifts';

// Employee Master Report Types
export interface EmployeeBasicReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  cadre: string;
  role: string;
  status: string;
  startDate: string;
  address: string;
  dateOfBirth: string;
}

export interface EmployeeSalaryReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  structureName: string;
  effectiveFrom: string;
  effectiveTo: string;
  basicSalary: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
}

export interface EmployeeTaxReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  taxId: string;
  taxCategory: string;
  taxableIncome: number;
  exemptions: number;
  deductions: number;
  taxPayable: number;
}

export interface DepartmentReport {
  departmentId: string;
  departmentName: string;
  employeeCount: number;
  averageSalary: number;
  totalSalary: number;
  roles: string[];
}

// Transaction Report Types
export interface MonthlySalaryReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  payPeriod: string;
  basicSalary: number;
  earnings: number;
  deductions: number;
  overtimeAmount: number;
  bonus: number;
  netAmount: number;
  paymentDate: string;
  status: string;
}

export interface AttendanceReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  date: string;
  status: string;
  clockIn: string;
  clockOut: string;
  workingHours: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
}

export interface TimestampMismatchReport {
  empId: string;
  employeeCode: string;
  name: string;
  shiftDate: string;
  shiftTiming: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  attendanceStatus: string;
  leaveStatus: string;
  mismatchReason: string;
  attendanceLogAvailability: string;
  resolution: string;
}

export interface LeaveReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  leaveType: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  pendingRequests: number;
}

export interface OvertimeReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  date: string;
  hours: number;
  rate: number;
  amount: number;
  status: string;
  approvedBy: string;
}

// Statutory Report Types
export interface TaxDeductionReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  taxPeriod: string;
  taxableIncome: number;
  taxDeducted: number;
  cumulativeTax: number;
}

export interface ProvidentFundReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  contributionPeriod: string;
  employeeContribution: number;
  employerContribution: number;
  totalContribution: number;
  cumulativeBalance: number;
}

export interface InsuranceReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  insuranceType: string;
  coverageAmount: number;
  premiumAmount: number;
  startDate: string;
  endDate: string;
  beneficiaries: string;
}

export interface ProfessionalTaxReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  taxPeriod: string;
  taxableIncome: number;
  taxAmount: number;
  paymentDate: string;
  receiptNumber: string;
}

// Main report functions
export async function getEmployeeMasterReport(subtype: string, filters: any) {
  const { startDate, endDate, department, employee } = filters;

  switch (subtype) {
    case 'basic':
      return getEmployeeBasicReport(department, employee);
    case 'salary':
      return getEmployeeSalaryReport(department, employee);
    case 'tax':
      return getEmployeeTaxReport(department, employee);
    case 'department':
      return getDepartmentReport(department);
    default:
      return [];
  }
}

export async function getTransactionReport(subtype: string, filters: any) {
  const { startDate, endDate, department, employee } = filters;

  switch (subtype) {
    case 'monthly':
      return getMonthlySalaryReport(startDate, endDate, department, employee);
    case 'attendance':
      return getAttendanceReport(startDate, endDate, department, employee);
    case 'leave':
      return getLeaveReport(startDate, endDate, department, employee);
    case 'overtime':
      return getOvertimeReport(startDate, endDate, department, employee);
    case 'bonus':
      return getBonusReport(startDate, endDate, department, employee);
    case 'loan':
      return getLoanReport(startDate, endDate, department, employee);
    default:
      return { data: [], summary: {} };
  }
}

export async function getStatutoryReport(subtype: string, filters: any) {
  const { startDate, endDate, department, employee } = filters;

  switch (subtype) {
    case 'taxDeduction':
      return getTaxDeductionReport(startDate, endDate, department, employee);
    case 'providentFund':
      return getProvidentFundReport(startDate, endDate, department, employee);
    case 'insurance':
      return getInsuranceReport(startDate, endDate, department, employee);
    case 'professionalTax':
      return getProfessionalTaxReport(startDate, endDate, department, employee);
    default:
      return { data: [], summary: {} };
  }
}

// Employee Master Report implementations
async function getEmployeeBasicReport(department?: string, employeeId?: string): Promise<EmployeeBasicReport[]> {
  let query = supabase
    .from('employees')
    .select('*');

  if (department) {
    query = query.eq('department', department);
  }

  if (employeeId) {
    query = query.eq('id', employeeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data.map(employee => ({
    employeeId: employee.id,
    employeeCode: employee.employee_code || '-',
    name: employee.name,
    email: employee.email,
    department: employee.department,
    cadre: employee.cadre || '-',
    role: employee.role,
    status: employee.status,
    startDate: employee.start_date,
    address: employee.address || '-',
    dateOfBirth: employee.date_of_birth || '-'
  }));
}

async function getEmployeeSalaryReport(department?: string, employeeId?: string): Promise<EmployeeSalaryReport[]> {
  // First get employees
  let employeeQuery = supabase
    .from('employees')
    .select('id, name, department, employee_code');

  if (department) {
    employeeQuery = employeeQuery.eq('department', department);
  }

  if (employeeId) {
    employeeQuery = employeeQuery.eq('id', employeeId);
  }

  const { data: employees, error: employeeError } = await employeeQuery;

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  // For each employee, get their salary structure
  const result: EmployeeSalaryReport[] = [];

  for (const employee of employees) {
    const { data: salaryStructures, error: structureError } = await supabase
      .from('employee_salary_structures')
      .select(`
        id,
        effective_from,
        effective_to,
        structure:salary_structures (
          id,
          name
        )
      `)
      .eq('employee_id', employee.id)
      .order('effective_from', { ascending: false });

    if (structureError) {
      console.error(`Error fetching salary structure for employee ${employee.id}:`, structureError);
      continue;
    }

    if (salaryStructures.length === 0) {
      // Add employee with no salary structure
      result.push({
        employeeId: employee.id,
        employeeCode: employee.employee_code || '-',
        name: employee.name,
        department: employee.department,
        structureName: 'No Salary Structure',
        effectiveFrom: '-',
        effectiveTo: '-',
        basicSalary: 0,
        totalEarnings: 0,
        totalDeductions: 0,
        netSalary: 0
      });
      continue;
    }

    // For each salary structure, get components
    for (const structure of salaryStructures) {
      const { data: payrollData, error: payrollError } = await supabase
        .from('payroll')
        .select('*')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const latestPayroll = payrollData && payrollData.length > 0 ? payrollData[0] : null;

      result.push({
        employeeId: employee.id,
        employeeCode: employee.employee_code || '-',
        name: employee.name,
        department: employee.department,
        structureName: structure.structure?.name || 'Unknown Structure',
        effectiveFrom: structure.effective_from,
        effectiveTo: structure.effective_to || 'Current',
        basicSalary: latestPayroll?.base_salary || 0,
        totalEarnings: latestPayroll?.base_salary || 0,
        totalDeductions: latestPayroll?.deductions || 0,
        netSalary: latestPayroll?.total_amount || 0
      });
    }
  }

  return result;
}

async function getEmployeeTaxReport(department?: string, employeeId?: string): Promise<EmployeeTaxReport[]> {
  // This is a mock implementation since we don't have actual tax data in the schema
  // In a real implementation, you would query the tax-related tables

  // First get employees
  let employeeQuery = supabase
    .from('employees')
    .select('id, name, department, employee_code');

  if (department) {
    employeeQuery = employeeQuery.eq('department', department);
  }

  if (employeeId) {
    employeeQuery = employeeQuery.eq('id', employeeId);
  }

  const { data: employees, error: employeeError } = await employeeQuery;

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  // For each employee, get their payroll data to estimate tax
  const result: EmployeeTaxReport[] = [];

  for (const employee of employees) {
    const { data: payrollData, error: payrollError } = await supabase
      .from('payroll')
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (payrollError) {
      console.error(`Error fetching payroll for employee ${employee.id}:`, payrollError);
      continue;
    }

    const latestPayroll = payrollData && payrollData.length > 0 ? payrollData[0] : null;
    const annualSalary = (latestPayroll?.base_salary || 0) * 12;
    const estimatedTax = annualSalary * 0.2; // Simple 20% tax estimate

    result.push({
      employeeId: employee.id,
      employeeCode: employee.employee_code || '-',
      name: employee.name,
      department: employee.department,
      taxId: `TX${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      taxCategory: 'Standard',
      taxableIncome: annualSalary,
      exemptions: annualSalary * 0.1,
      deductions: annualSalary * 0.05,
      taxPayable: estimatedTax
    });
  }

  return result;
}

async function getDepartmentReport(departmentFilter?: string): Promise<DepartmentReport[]> {
  // Get all departments or filter by specific department
  let departmentQuery = supabase
    .from('departments')
    .select('id, name');

  if (departmentFilter) {
    departmentQuery = departmentQuery.eq('name', departmentFilter);
  }

  const { data: departments, error: departmentError } = await departmentQuery;

  if (departmentError) {
    throw new Error(departmentError.message);
  }

  const result: DepartmentReport[] = [];

  for (const department of departments) {
    // Get employees in this department
    const { data: employees, error: employeeError } = await supabase
      .from('employees')
      .select('id, role')
      .eq('department', department.name);

    if (employeeError) {
      console.error(`Error fetching employees for department ${department.name}:`, employeeError);
      continue;
    }

    // Get unique roles
    const roles = [...new Set(employees.map(emp => emp.role))];

    // Get payroll data to calculate average and total salary
    const { data: payrollData, error: payrollError } = await supabase
      .from('payroll')
      .select('employee_id, total_amount')
      .in('employee_id', employees.map(emp => emp.id))
      .order('created_at', { ascending: false });

    if (payrollError) {
      console.error(`Error fetching payroll for department ${department.name}:`, payrollError);
      continue;
    }

    // Calculate average and total salary
    const uniqueEmployeePayroll = payrollData.reduce((acc, curr) => {
      if (!acc[curr.employee_id]) {
        acc[curr.employee_id] = curr.total_amount;
      }
      return acc;
    }, {} as Record<string, number>);

    const salaries = Object.values(uniqueEmployeePayroll);
    const totalSalary = salaries.reduce((sum, salary) => sum + salary, 0);
    const averageSalary = salaries.length > 0 ? totalSalary / salaries.length : 0;

    result.push({
      departmentId: department.id,
      departmentName: department.name,
      employeeCount: employees.length,
      averageSalary,
      totalSalary,
      roles
    });
  }

  return result;
}

// Transaction Report implementations
async function getMonthlySalaryReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: MonthlySalaryReport[], summary: Record<string, number> }> {
  let query = supabase
    .from('payroll')
    .select(`
      *,
      employee:employees (
        id,
        name,
        department,
        employee_code
      )
    `);

  if (startDate && endDate) {
    query = query
      .gte('period_start', startDate)
      .lte('period_end', endDate);
  }

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  // Filter by department if specified
  let filteredData = data;
  if (department) {
    filteredData = data.filter(entry => entry.employee?.department === department);
  }

  // Map to report format
  const reportData: MonthlySalaryReport[] = filteredData.map(entry => ({
    employeeId: entry.employee_id,
    employeeCode: entry.employee?.employee_code || '-',
    name: entry.employee?.name || 'Unknown',
    department: entry.employee?.department || 'Unknown',
    payPeriod: `${new Date(entry.period_start).toLocaleDateString()} - ${new Date(entry.period_end).toLocaleDateString()}`,
    basicSalary: entry.base_salary,
    earnings: entry.base_salary + (entry.bonus || 0),
    deductions: entry.deductions || 0,
    overtimeAmount: (entry.overtime_hours || 0) * (entry.overtime_rate || 0),
    bonus: entry.bonus || 0,
    netAmount: entry.total_amount,
    paymentDate: entry.payment_date ? new Date(entry.payment_date).toLocaleDateString() : '-',
    status: entry.status
  }));

  // Calculate summary
  const summary = {
    totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
    totalSalary: reportData.reduce((sum, item) => sum + item.basicSalary, 0),
    totalEarnings: reportData.reduce((sum, item) => sum + item.earnings, 0),
    totalDeductions: reportData.reduce((sum, item) => sum + item.deductions, 0),
    totalOvertime: reportData.reduce((sum, item) => sum + item.overtimeAmount, 0),
    totalBonus: reportData.reduce((sum, item) => sum + item.bonus, 0),
    totalNetAmount: reportData.reduce((sum, item) => sum + item.netAmount, 0)
  };

  return { data: reportData, summary };
}

async function getAttendanceReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: AttendanceReport[], summary: Record<string, number> }> {
  // First get employees
  let employeeQuery = supabase
    .from('employees')
    .select('id, name, department, employee_code');

  if (department) {
    employeeQuery = employeeQuery.eq('department', department);
  }

  if (employeeId) {
    employeeQuery = employeeQuery.eq('id', employeeId);
  }

  const { data: employees, error: employeeError } = await employeeQuery;

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  // For each employee, get attendance logs
  const reportData: AttendanceReport[] = [];

  for (const employee of employees) {
    let attendanceQuery = supabase
      .from('attendance_logs')
      .select('*')
      .eq('employee_id', employee.id);

    if (startDate && endDate) {
      attendanceQuery = attendanceQuery
        .gte('date', startDate)
        .lte('date', endDate);
    }

    const { data: attendanceLogs, error: attendanceError } = await attendanceQuery;

    if (attendanceError) {
      console.error(`Error fetching attendance for employee ${employee.id}:`, attendanceError);
      continue;
    }

    for (const log of attendanceLogs) {
      const clockIn = log.clock_in ? new Date(log.clock_in) : null;
      const clockOut = log.clock_out ? new Date(log.clock_out) : null;

      let workingHours = 0;
      let lateMinutes = 0;
      let earlyDepartureMinutes = 0;
      let overtimeMinutes = 0;

      if (clockIn && clockOut) {
        // Calculate working hours
        workingHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

        // Assuming standard 9 AM start and 5 PM end
        const standardStartHour = 9;
        const standardEndHour = 17;

        // Calculate late minutes
        if (clockIn.getHours() > standardStartHour ||
          (clockIn.getHours() === standardStartHour && clockIn.getMinutes() > 0)) {
          const standardStart = new Date(clockIn);
          standardStart.setHours(standardStartHour, 0, 0, 0);
          lateMinutes = (clockIn.getTime() - standardStart.getTime()) / (1000 * 60);
        }

        // Calculate early departure minutes
        if (clockOut.getHours() < standardEndHour ||
          (clockOut.getHours() === standardEndHour && clockOut.getMinutes() < 0)) {
          const standardEnd = new Date(clockOut);
          standardEnd.setHours(standardEndHour, 0, 0, 0);
          earlyDepartureMinutes = (standardEnd.getTime() - clockOut.getTime()) / (1000 * 60);
        }

        // Calculate overtime minutes
        if (clockOut.getHours() > standardEndHour ||
          (clockOut.getHours() === standardEndHour && clockOut.getMinutes() > 0)) {
          const standardEnd = new Date(clockOut);
          standardEnd.setHours(standardEndHour, 0, 0, 0);
          overtimeMinutes = (clockOut.getTime() - standardEnd.getTime()) / (1000 * 60);
        }
      }

      reportData.push({
        employeeId: employee.id,
        employeeCode: employee.employee_code || '-',
        name: employee.name,
        department: employee.department,
        date: log.date,
        status: log.status,
        clockIn: clockIn ? clockIn.toLocaleTimeString() : '-',
        clockOut: clockOut ? clockOut.toLocaleTimeString() : '-',
        workingHours: parseFloat(workingHours.toFixed(2)),
        lateMinutes: Math.max(0, Math.round(lateMinutes)),
        earlyDepartureMinutes: Math.max(0, Math.round(earlyDepartureMinutes)),
        overtimeMinutes: Math.max(0, Math.round(overtimeMinutes))
      });
    }
  }

  // Calculate summary
  const summary = {
    totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
    totalAttendanceRecords: reportData.length,
    totalWorkingHours: parseFloat(reportData.reduce((sum, item) => sum + item.workingHours, 0).toFixed(2)),
    totalLateMinutes: reportData.reduce((sum, item) => sum + item.lateMinutes, 0),
    totalOvertimeMinutes: reportData.reduce((sum, item) => sum + item.overtimeMinutes, 0),
    averageWorkingHours: parseFloat((reportData.reduce((sum, item) => sum + item.workingHours, 0) /
      (reportData.length || 1)).toFixed(2))
  };

  return { data: reportData, summary };
}

export async function getTimestampMismatchReport(startDate?: string, endDate?: string, department?: string, employeeId?: string, tenantId?: string): Promise<{ data: TimestampMismatchReport[], summary: Record<string, number> }> {
  // 1. Fetch Employees
  let selectClause = 'id, name, departments(name), employee_code';
  if (department) {
    selectClause = 'id, name, departments!inner(name), employee_code';
  }

  let employeeQuery = supabase
    .from('employees')
    .select(selectClause);

  if (tenantId) employeeQuery = employeeQuery.eq('tenant_id', tenantId);
  if (department) employeeQuery = employeeQuery.eq('departments.name', department);
  if (employeeId) employeeQuery = employeeQuery.eq('id', employeeId);

  const { data: employees, error: employeeError } = await employeeQuery;
  if (employeeError) throw new Error(employeeError.message);

  // 2. Fetch Attendance Timestamps
  let tsQuery = supabase.from('attendance_timestamp').select('*');
  if (tenantId) tsQuery = tsQuery.eq('tenant_id', tenantId);
  if (startDate && endDate) {
    tsQuery = tsQuery.gte('timestamp', startDate).lte('timestamp', `${endDate}T23:59:59Z`);
  }
  if (employeeId) tsQuery = tsQuery.eq('employee_id', employeeId);
  const { data: allTimestamps } = await tsQuery;

  // 3. Fetch Attendance Logs
  let logsQuery = supabase.from('attendance_logs').select('*');
  if (tenantId) logsQuery = logsQuery.eq('tenant_id', tenantId);
  if (startDate && endDate) {
    logsQuery = logsQuery.gte('date', startDate).lte('date', endDate);
  }
  if (employeeId) logsQuery = logsQuery.eq('employee_id', employeeId);
  const { data: allLogs } = await logsQuery;

  // 4. Fetch Shift Assignments
  let shiftQuery = supabase
    .from('shift_assignments')
    .select('*, shifts(*)');
  if (tenantId) shiftQuery = shiftQuery.eq('tenant_id', tenantId);
  if (startDate && endDate) {
    shiftQuery = shiftQuery.gte('schedule_date', startDate).lte('schedule_date', endDate);
  }
  if (employeeId) shiftQuery = shiftQuery.eq('employee_id', employeeId);
  const { data: allAssignments } = await shiftQuery;

  // 5. Fetch Leave Requests
  let leaveQuery = supabase
    .from('leave_requests')
    .select('*, leave_types(name)');

  if (tenantId) leaveQuery = leaveQuery.eq('tenant_id', tenantId);
  if (startDate && endDate) {
    leaveQuery = leaveQuery
      .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);
  }
  const { data: allLeaves } = await leaveQuery;

  // 6. Fetch Validation Configuration
  const { data: validationConfig } = await supabase
    .from('attendance_validation_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();

  // 7. Fetch Permissions and Gate Passes
  let permQuery = supabase.from('employee_permissions').select('*').eq('status', 'approved');
  if (tenantId) permQuery = permQuery.eq('tenant_id', tenantId);
  if (startDate && endDate) {
    permQuery = permQuery.lte('start_date', endDate).gte('end_date', startDate);
  }
  const { data: allPermissions } = await permQuery;

  let gpQuery = supabase.from('gate_pass_requests').select('*').eq('status', 'approved');
  if (tenantId) gpQuery = gpQuery.eq('tenant_id', tenantId);
  if (startDate && endDate) {
    gpQuery = gpQuery.lte('start_date', endDate).gte('end_date', startDate);
  }
  const { data: allGatePasses } = await gpQuery;

  // 8. Fetch Holidays and Patterns
  const [holidaysRes, recurringRes] = await Promise.all([
    supabase
      .from('holidays')
      .select('date')
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate),
    supabase
      .from('holiday_recurring_patterns')
      .select('week_day, week_occurrence')
      .eq('tenant_id', tenantId)
  ]);
  const holidayDates = new Set((holidaysRes.data || []).map(h => h.date));
  const recurringPatterns = recurringRes.data || [];

  // Helper: Check recurring holidays (Pure logic)
  const isRecurringHoliday = (date: Date, patterns: any[]): boolean => {
    const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = weekdayNames[date.getDay()];
    const day = date.getDate();
    const weekOccurrence = day <= 7 ? 'first' : day <= 14 ? 'second' : day <= 21 ? 'third' : day <= 28 ? 'fourth' : 'last';
    return patterns.some(r => r.week_day.toLowerCase() === dayName && (r.week_occurrence === 'all' || r.week_occurrence === weekOccurrence));
  };

  const reportData: TimestampMismatchReport[] = [];

  // 6. Process Date Range
  const start = startDate ? new Date(startDate) : new Date();
  const end = endDate ? new Date(endDate) : new Date();

  for (const employee of employees) {
    // Skip relieved/terminated employees entirely
    const empStatus = (employee.status || '').toLowerCase();
    if (['Relieved', 'Terminated', 'Suspended'].includes(empStatus)) {
      continue;
    }

    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isHoliday = holidayDates.has(dateStr) || isRecurringHoliday(currentDate, recurringPatterns);

      // Skip dates after employee relieved
      if (employee.status_date && dateStr > employee.status_date && employee.status && ['relieved', 'terminated'].includes(employee.status.toLowerCase())) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Filter data for this employee and date
      const dayTimestamps = allTimestamps?.filter(t =>
        t.employee_id === employee.id &&
        new Date(t.timestamp).toISOString().split('T')[0] === dateStr
      ) || [];

      const log = allLogs?.find(l => l.employee_id === employee.id && l.date === dateStr);
      const assignment = allAssignments?.find(a => a.employee_id === employee.id && a.schedule_date === dateStr);

      // Skip processing if no assignment, no log, and it's a holiday or off day
      if (!assignment && !log && isHoliday) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const leave = allLeaves?.find(l =>
        l.employee_id === employee.id &&
        dateStr >= l.start_date &&
        dateStr <= l.end_date
      );

      const clockInRecord = dayTimestamps.find(t => t.entry === 'IN');
      const clockOutRecord = dayTimestamps.find(t => t.entry === 'OUT');

      // Helper to format time strings (supports HH:mm:ss and full timestamps)
      const formatTime = (timeStr: string | null) => {
        if (!timeStr) return null;
        try {
          // If it's just HH:mm:ss
          if (timeStr.includes(':') && !timeStr.includes('-') && !timeStr.includes('T')) {
            return new Date(`1970-01-01T${timeStr}`).toLocaleTimeString();
          }
          return new Date(timeStr).toLocaleTimeString();
        } catch (e) {
          return timeStr;
        }
      };

      // Priority 1: Attendance Log times
      let clockInTime = formatTime(log?.clock_in);
      let clockOutTime = formatTime(log?.clock_out);

      // Priority 2: Raw Timestamps (if log times are missing)
      if (!clockInTime && clockInRecord) {
        clockInTime = new Date(clockInRecord.timestamp).toLocaleTimeString();
      }
      if (!clockOutTime && clockOutRecord) {
        clockOutTime = new Date(clockOutRecord.timestamp).toLocaleTimeString();
      }

      const shift = assignment?.shifts;
      const shiftTiming = shift ? `${shift.start_time} - ${shift.end_time}` : 'Not Scheduled';
      const attendanceStatus = log?.status || 'Missing';
      const leaveStatus = leave
        ? `${leave.leave_types?.name || 'Leave'} (${leave.status})`
        : '-';

      let mismatchReason = '';
      let resolution = '';

      // --- ADVANCED VALIDATION CHECK ---
      const timeToMinutes = (t: string | null) => {
        if (!t) return null;
        try {
          let timePart = t.trim();
          // Extract time from ISO string if needed
          if (timePart.includes('T')) {
            timePart = timePart.split('T')[1];
          }
          // Remove timezone info (e.g. +05:30 or Z)
          timePart = timePart.split('+')[0].split('-')[0].replace('Z', '').trim();

          const isPM = timePart.toUpperCase().includes('PM');
          const isAM = timePart.toUpperCase().includes('AM');
          const cleanTime = timePart.toUpperCase().replace('AM', '').replace('PM', '').trim();

          const parts = cleanTime.split(':').map(Number);
          if (parts.length < 2) return null;

          let hours = parts[0];
          const mins = parts[1];

          if (isPM && hours < 12) hours += 12;
          if (isAM && hours === 12) hours = 0;

          return hours * 60 + mins;
        } catch (e) {
          return null;
        }
      };

      const logInMin = log?.clock_in ? timeToMinutes(log.clock_in) : null;
      const logOutMin = log?.clock_out ? timeToMinutes(log.clock_out) : null;
      const shiftStartMin = shift ? timeToMinutes(shift.start_time) : null;
      const shiftEndMin = shift ? timeToMinutes(shift.end_time) : null;
      const breakStartMin = shift ? timeToMinutes(shift.break_start_time) : null;
      const breakEndMin = shift ? timeToMinutes(shift.break_end_time) : null;

      // Check for Permissions and Gate Passes for this employee/date
      const dayPermissions = allPermissions?.filter(p =>
        p.employee_id === employee.id && dateStr >= p.start_date && dateStr <= p.end_date
      ) || [];
      const dayGatePasses = allGatePasses?.filter(g =>
        g.employee_id === employee.id && dateStr >= g.start_date && dateStr <= g.end_date
      ) || [];

      const checkRequestCoverage = (startM: number, endM: number) => {
        const gapMins = endM - startM;
        const grace = 15; // 15 mins allowance

        // If validation settings exist, respect min/max permission limits
        if (validationConfig) {
          if (gapMins < validationConfig.min_permission_minutes) return false;
          if (gapMins > validationConfig.max_permission_minutes) return false;
        }

        const allRequests = [...dayPermissions, ...dayGatePasses];
        return allRequests.some(r => {
          const rStart = timeToMinutes(r.start_time);
          const rEnd = timeToMinutes(r.end_time);
          if (rStart === null || rEnd === null) return false;
          // Request covers the gap if it starts around the gap start and ends around the gap end
          return rStart <= startM + grace && rEnd >= endM - grace;
        });
      };

      // logic: A status (like First Off) is "Expected/Correct" if the rules say so.
      let isLogStatusCorrect = false;

      if (shift && logInMin !== null && logOutMin !== null && shiftStartMin !== null && shiftEndMin !== null) {
        const lateMins = logInMin - shiftStartMin;
        const earlyMins = shiftEndMin - logOutMin;

        const maxPerm = validationConfig?.max_permission_minutes || 45;
        const lateLimit = validationConfig?.late_entry_limit_minutes || 15;
        const earlyLimit = validationConfig?.early_exit_limit_minutes || 15;

        // Morning (First Half) Check
        const hasMorningPermission = lateMins > 0 && checkRequestCoverage(shiftStartMin, logInMin);
        let isFirstHalfCorrect = false;
        if (lateMins <= 0 || (lateMins <= (validationConfig?.entry_grace_time_minutes || 15))) {
          isFirstHalfCorrect = true;
        } else if (hasMorningPermission) {
          isFirstHalfCorrect = true;
        } else if (lateMins > maxPerm || lateMins > lateLimit) {
          // They are late and NO valid permission -> First Off is correct
          if (attendanceStatus === 'First Off' || attendanceStatus === 'Absent') {
            isFirstHalfCorrect = true;
          }
        }

        // Evening (Second Half) Check
        const hasEveningPermission = earlyMins > 0 && checkRequestCoverage(logOutMin, shiftEndMin);
        let isSecondHalfCorrect = false;
        if (earlyMins <= 0 || (earlyMins <= (validationConfig?.exit_grace_time_minutes || 15))) {
          isSecondHalfCorrect = true;
        } else if (hasEveningPermission) {
          isSecondHalfCorrect = true;
        } else if (earlyMins > maxPerm || earlyMins > earlyLimit) {
          // They left early and NO valid permission -> Second Off is correct
          if (attendanceStatus === 'Second Off' || attendanceStatus === 'Absent') {
            isSecondHalfCorrect = true;
          }
        }

        // Final Verdict: Status is correct if the gaps are justified
        if (attendanceStatus === 'Present' && isFirstHalfCorrect && isSecondHalfCorrect) {
          isLogStatusCorrect = true;
        } else if (attendanceStatus === 'First Off' && isFirstHalfCorrect) {
          isLogStatusCorrect = true;
        } else if (attendanceStatus === 'Second Off' && isSecondHalfCorrect) {
          isLogStatusCorrect = true;
        } else if (attendanceStatus === 'Absent' && (isFirstHalfCorrect || isSecondHalfCorrect)) {
          isLogStatusCorrect = true;
        }

        // Special case for Half Day rules entering after break
        if (!isLogStatusCorrect && (validationConfig?.enable_half_day_rules !== false) && breakStartMin !== null && breakEndMin !== null) {
          if (logInMin > breakStartMin && attendanceStatus === 'First Off') isLogStatusCorrect = true;
          if (logOutMin < breakEndMin && attendanceStatus === 'Second Off') isLogStatusCorrect = true;
        }
      }

      // Scenario 1: Clock records exist but log is missing (Sync Issue)
      if (clockInTime && clockOutTime && !log) {
        mismatchReason = 'Clock records exist but Attendance Log is not created';
        resolution = 'Go to Attendance Logs, select the date, and click "Sync Attendance" to generate the missing log entries.';
      }
      // Scenario 2: Unauthorized Absence (Crucial for Payroll blocking)
      else if (!isHoliday && !clockInTime && !clockOutTime && (attendanceStatus === 'Absent' || attendanceStatus === 'Missing')) {
        if (!leave) {
          mismatchReason = 'Unauthorized Absence: No clock records and no leave request found.';
          resolution = 'Navigate to Attendance -> Leave -> Absentee list to apply for a leave request for this employee on this date.';
        } else if (leave.status.toLowerCase() !== 'approved') {
          mismatchReason = `Unauthorized Absence: No clock records and leave request is still ${leave.status}.`;
          resolution = 'Navigate to Attendance -> Leave -> Leave Requests to review and approve the pending request.';
        }
      }
      // Scenario 3: Completed shift but marked as First/Second Off or Absent (Policy Mismatch)
      else if (clockInTime && clockOutTime && ['Absent', 'First Off', 'Second Off'].includes(attendanceStatus)) {
        if (!isLogStatusCorrect) {
          mismatchReason = `Valid timestamps exist but marked as ${attendanceStatus}`;
          resolution = 'Verify if shift assignment timing matches actual work hours, then update status to "Present" in Attendance Management.';
        }
      }
      // Scenario 4: Scheduled but NO Attendance Log and NO Leave (Pure Absence)
      else if (attendanceStatus === 'Missing' && assignment && !clockInTime && !clockOutTime) {
        if (!leave) {
          mismatchReason = 'Unauthorized Absence: No clock records and no leave request found.';
          resolution = 'Navigate to Attendance -> Leave -> Absentee list to apply for a leave request for this employee on this date.';
        } else if (leave.status.toLowerCase() !== 'approved') {
          mismatchReason = `Employee Absent: Scheduled for shift with pending leave (${leave.status})`;
          resolution = `The employee is scheduled but hasn't clocked in. Ensure the ${leave.status} leave is approved or rejected.`;
        }
      }
      // Scenario 5: General status mismatch (Present without timestamps)
      else if (attendanceStatus === 'Present' && (!clockInTime || !clockOutTime)) {
        mismatchReason = 'Marked Present but missing IN or OUT timestamp';
        resolution = 'Navigate to Timestamp Management, add the missing clock entry for this employee, and then re-sync the log.';
      }
      // Scenario 6: Single-sided clock events
      else if (attendanceStatus === 'Missing' || !log) {
        if (clockInTime && !clockOutTime) {
          mismatchReason = 'Only Clock In found. Unable to update Attendance Log.';
          resolution = 'Go to Timestamp Management, manually add the missing Clock Out entry, then update the Attendance Log.';
        } else if (!clockInTime && clockOutTime) {
          mismatchReason = 'Only Clock Out found. Unable to update Attendance Log.';
          resolution = 'Go to Timestamp Management, manually add the missing Clock In entry, then update the Attendance Log.';
        }
      }

      if (mismatchReason) {
        reportData.push({
          empId: employee.employee_code || employee.id,
          employeeCode: employee.employee_code || '-',
          name: employee.name || 'Unknown',
          shiftDate: dateStr,
          shiftTiming,
          clockInTime,
          clockOutTime,
          attendanceStatus,
          leaveStatus,
          mismatchReason,
          attendanceLogAvailability: log ? 'Yes' : 'No',
          resolution
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return { data: reportData, summary: { totalMismatches: reportData.length } };
}

async function getLeaveReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: LeaveReport[], summary: Record<string, number> }> {
  // First get employees
  let employeeQuery = supabase
    .from('employees')
    .select('id, name, department, employee_code');

  if (department) {
    employeeQuery = employeeQuery.eq('department', department);
  }

  if (employeeId) {
    employeeQuery = employeeQuery.eq('id', employeeId);
  }

  const { data: employees, error: employeeError } = await employeeQuery;

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  // Get leave types
  const { data: leaveTypes, error: leaveTypesError } = await supabase
    .from('leave_types')
    .select('*');

  if (leaveTypesError) {
    throw new Error(leaveTypesError.message);
  }

  // For each employee, get leave balances and pending requests
  const reportData: LeaveReport[] = [];

  for (const employee of employees) {
    // Get leave balances
    const { data: leaveBalances, error: balancesError } = await supabase
      .from('leave_balances')
      .select(`
        *,
        leave_types (
          name
        )
      `)
      .eq('employee_id', employee.id)
      .eq('year', new Date().getFullYear());

    if (balancesError) {
      console.error(`Error fetching leave balances for employee ${employee.id}:`, balancesError);
      continue;
    }

    // Get pending leave requests
    const { data: pendingRequests, error: requestsError } = await supabase
      .from('leave_requests')
      .select('leave_type_id, status')
      .eq('employee_id', employee.id)
      .eq('status', 'Pending');

    if (requestsError) {
      console.error(`Error fetching leave requests for employee ${employee.id}:`, requestsError);
      continue;
    }

    // Group pending requests by leave type
    const pendingByType = pendingRequests.reduce((acc, req) => {
      acc[req.leave_type_id] = (acc[req.leave_type_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Create report entries for each leave type
    for (const balance of leaveBalances) {
      reportData.push({
        employeeId: employee.id,
        employeeCode: employee.employee_code || '-',
        name: employee.name,
        department: employee.department,
        leaveType: balance.leave_types?.name || 'Unknown',
        totalDays: balance.total_days,
        usedDays: balance.used_days,
        remainingDays: balance.total_days - balance.used_days,
        pendingRequests: pendingByType[balance.leave_type_id] || 0
      });
    }
  }

  // Calculate summary
  const summary = {
    totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
    totalLeaveTypes: new Set(reportData.map(item => item.leaveType)).size,
    totalAllocatedDays: reportData.reduce((sum, item) => sum + item.totalDays, 0),
    totalUsedDays: reportData.reduce((sum, item) => sum + item.usedDays, 0),
    totalRemainingDays: reportData.reduce((sum, item) => sum + item.remainingDays, 0),
    totalPendingRequests: reportData.reduce((sum, item) => sum + item.pendingRequests, 0)
  };

  return { data: reportData, summary };
}

async function getOvertimeReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: OvertimeReport[], summary: Record<string, number> }> {
  // First get shift assignments with overtime
  let query = supabase
    .from('shift_assignments')
    .select(`
      *,
      employee:employees (
        id,
        name,
        department,
        employee_code
      )
    `)
    .gt('overtime_minutes', 0);

  if (startDate && endDate) {
    query = query
      .gte('schedule_date', startDate)
      .lte('schedule_date', endDate);
  }

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  // Filter by department if specified
  let filteredData = data;
  if (department) {
    filteredData = data.filter(assignment => assignment.employee?.department === department);
  }

  // Get payroll data for overtime rates
  const { data: payrollData, error: payrollError } = await supabase
    .from('payroll')
    .select('employee_id, overtime_rate')
    .order('created_at', { ascending: false });

  if (payrollError) {
    throw new Error(payrollError.message);
  }

  // Create a map of employee ID to overtime rate
  const overtimeRates = payrollData.reduce((acc, entry) => {
    if (!acc[entry.employee_id]) {
      acc[entry.employee_id] = entry.overtime_rate;
    }
    return acc;
  }, {} as Record<string, number>);

  // Map to report format
  const reportData: OvertimeReport[] = filteredData.map(assignment => {
    const overtimeHours = (assignment.overtime_minutes || 0) / 60;
    const rate = overtimeRates[assignment.employee_id] || 15; // Default rate if not found
    const amount = overtimeHours * rate;

    return {
      employeeId: assignment.employee_id,
      employeeCode: assignment.employee?.employee_code || '-',
      name: assignment.employee?.name || 'Unknown',
      department: assignment.employee?.department || 'Unknown',
      date: assignment.schedule_date,
      hours: parseFloat(overtimeHours.toFixed(2)),
      rate,
      amount: parseFloat(amount.toFixed(2)),
      status: assignment.status,
      approvedBy: 'System' // We don't have this info in the schema
    };
  });

  // Calculate summary
  const summary = {
    totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
    totalOvertimeHours: parseFloat(reportData.reduce((sum, item) => sum + item.hours, 0).toFixed(2)),
    totalOvertimeAmount: parseFloat(reportData.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
    averageOvertimeRate: parseFloat((reportData.reduce((sum, item) => sum + item.rate, 0) /
      (reportData.length || 1)).toFixed(2))
  };

  return { data: reportData, summary };
}

async function getBonusReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: any[], summary: Record<string, number> }> {
  // Get payroll entries with bonus
  let query = supabase
    .from('payroll')
    .select(`
      *,
      employee:employees (
        id,
        name,
        department,
        employee_code
      )
    `)
    .gt('bonus', 0);

  if (startDate && endDate) {
    query = query
      .gte('period_start', startDate)
      .lte('period_end', endDate);
  }

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  // Filter by department if specified
  let filteredData = data;
  if (department) {
    filteredData = data.filter(entry => entry.employee?.department === department);
  }

  // Map to report format
  const reportData = filteredData.map(entry => ({
    employeeId: entry.employee_id,
    employeeCode: entry.employee?.employee_code || '-',
    name: entry.employee?.name || 'Unknown',
    department: entry.employee?.department || 'Unknown',
    payPeriod: `${new Date(entry.period_start).toLocaleDateString()} - ${new Date(entry.period_end).toLocaleDateString()}`,
    bonusAmount: entry.bonus,
    bonusType: 'Performance', // Assuming all bonuses are performance-based
    baseSalary: entry.base_salary,
    bonusPercentage: parseFloat(((entry.bonus / entry.base_salary) * 100).toFixed(2)),
    paymentDate: entry.payment_date ? new Date(entry.payment_date).toLocaleDateString() : '-'
  }));

  // Calculate summary
  const summary = {
    totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
    totalBonusAmount: reportData.reduce((sum, item) => sum + item.bonusAmount, 0),
    averageBonusAmount: parseFloat((reportData.reduce((sum, item) => sum + item.bonusAmount, 0) /
      (reportData.length || 1)).toFixed(2)),
    averageBonusPercentage: parseFloat((reportData.reduce((sum, item) => sum + item.bonusPercentage, 0) /
      (reportData.length || 1)).toFixed(2))
  };

  return { data: reportData, summary };
}

async function getLoanReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: any[], summary: Record<string, number> }> {
  // This is a mock implementation since we don't have loan/advance tables in the schema
  // In a real implementation, you would query the loan/advance tables

  // Return empty data with a message
  return {
    data: [{ message: 'Loan/Advance module not implemented in the current schema' }],
    summary: {}
  };
}

// Statutory Report implementations
async function getTaxDeductionReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: TaxDeductionReport[], summary: Record<string, number> }> {
  // This is a mock implementation since we don't have tax tables in the schema
  // In a real implementation, you would query the tax-related tables

  // First get employees
  let employeeQuery = supabase
    .from('employees')
    .select('id, name, department, employee_code');

  if (department) {
    employeeQuery = employeeQuery.eq('department', department);
  }

  if (employeeId) {
    employeeQuery = employeeQuery.eq('id', employeeId);
  }

  const { data: employees, error: employeeError } = await employeeQuery;

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  // Get payroll data to estimate tax
  const reportData: TaxDeductionReport[] = [];

  for (const employee of employees) {
    let payrollQuery = supabase
      .from('payroll')
      .select('*')
      .eq('employee_id', employee.id);

    if (startDate && endDate) {
      payrollQuery = payrollQuery
        .gte('period_start', startDate)
        .lte('period_end', endDate);
    }

    const { data: payrollEntries, error: payrollError } = await payrollQuery;

    if (payrollError) {
      console.error(`Error fetching payroll for employee ${employee.id}:`, payrollError);
      continue;
    }

    // Group by month/year for tax periods
    const taxPeriods = payrollEntries.reduce((acc, entry) => {
      const periodStart = new Date(entry.period_start);
      const period = `${periodStart.getFullYear()}-${(periodStart.getMonth() + 1).toString().padStart(2, '0')}`;

      if (!acc[period]) {
        acc[period] = {
          taxableIncome: 0,
          taxDeducted: 0
        };
      }

      acc[period].taxableIncome += entry.base_salary;
      // Estimate tax as 20% of taxable income
      acc[period].taxDeducted += entry.base_salary * 0.2;

      return acc;
    }, {} as Record<string, { taxableIncome: number, taxDeducted: number }>);

    // Create report entries for each tax period
    let cumulativeTax = 0;

    for (const [period, data] of Object.entries(taxPeriods)) {
      cumulativeTax += data.taxDeducted;

      reportData.push({
        employeeId: employee.id,
        employeeCode: employee.employee_code || '-',
        name: employee.name,
        department: employee.department,
        taxPeriod: period,
        taxableIncome: data.taxableIncome,
        taxDeducted: data.taxDeducted,
        cumulativeTax
      });
    }
  }

  // Calculate summary
  const summary = {
    totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
    totalTaxableIncome: reportData.reduce((sum, item) => sum + item.taxableIncome, 0),
    totalTaxDeducted: reportData.reduce((sum, item) => sum + item.taxDeducted, 0),
    averageTaxRate: parseFloat(((reportData.reduce((sum, item) => sum + item.taxDeducted, 0) /
      reportData.reduce((sum, item) => sum + item.taxableIncome, 0)) * 100).toFixed(2))
  };

  return { data: reportData, summary };
}

async function getProvidentFundReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: ProvidentFundReport[], summary: Record<string, number> }> {
  // This is a mock implementation since we don't have PF tables in the schema
  // In a real implementation, you would query the PF-related tables

  // First get employees
  let employeeQuery = supabase
    .from('employees')
    .select('id, name, department, employee_code');

  if (department) {
    employeeQuery = employeeQuery.eq('department', department);
  }

  if (employeeId) {
    employeeQuery = employeeQuery.eq('id', employeeId);
  }

  const { data: employees, error: employeeError } = await employeeQuery;

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  // Get payroll data to estimate PF contributions
  const reportData: ProvidentFundReport[] = [];

  for (const employee of employees) {
    let payrollQuery = supabase
      .from('payroll')
      .select('*')
      .eq('employee_id', employee.id);

    if (startDate && endDate) {
      payrollQuery = payrollQuery
        .gte('period_start', startDate)
        .lte('period_end', endDate);
    }

    const { data: payrollEntries, error: payrollError } = await payrollQuery;

    if (payrollError) {
      console.error(`Error fetching payroll for employee ${employee.id}:`, payrollError);
      continue;
    }

    // Group by month/year for contribution periods
    const contributionPeriods = payrollEntries.reduce((acc, entry) => {
      const periodStart = new Date(entry.period_start);
      const period = `${periodStart.getFullYear()}-${(periodStart.getMonth() + 1).toString().padStart(2, '0')}`;

      if (!acc[period]) {
        acc[period] = {
          baseSalary: 0
        };
      }

      acc[period].baseSalary += entry.base_salary;

      return acc;
    }, {} as Record<string, { baseSalary: number }>);

    // Create report entries for each contribution period
    let cumulativeBalance = 0;

    for (const [period, data] of Object.entries(contributionPeriods)) {
      // Estimate PF contributions as 12% from employee and 12% from employer
      const employeeContribution = data.baseSalary * 0.12;
      const employerContribution = data.baseSalary * 0.12;
      const totalContribution = employeeContribution + employerContribution;

      cumulativeBalance += totalContribution;

      reportData.push({
        employeeId: employee.id,
        employeeCode: employee.employee_code || '-',
        name: employee.name,
        department: employee.department,
        contributionPeriod: period,
        employeeContribution,
        employerContribution,
        totalContribution,
        cumulativeBalance
      });
    }
  }

  // Calculate summary
  const summary = {
    totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
    totalEmployeeContribution: reportData.reduce((sum, item) => sum + item.employeeContribution, 0),
    totalEmployerContribution: reportData.reduce((sum, item) => sum + item.employerContribution, 0),
    totalContribution: reportData.reduce((sum, item) => sum + item.totalContribution, 0),
    totalCumulativeBalance: reportData.reduce((sum, item) => Math.max(sum, item.cumulativeBalance), 0)
  };

  return { data: reportData, summary };
}

async function getInsuranceReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: InsuranceReport[], summary: Record<string, number> }> {
  // This is a mock implementation since we don't have insurance tables in the schema
  // In a real implementation, you would query the insurance-related tables

  // First get employees
  let employeeQuery = supabase
    .from('employees')
    .select('id, name, department, employee_code');

  if (department) {
    employeeQuery = employeeQuery.eq('department', department);
  }

  if (employeeId) {
    employeeQuery = employeeQuery.eq('id', employeeId);
  }

  const { data: employees, error: employeeError } = await employeeQuery;

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  // Create mock insurance data
  const reportData: InsuranceReport[] = [];

  const insuranceTypes = ['Health', 'Life', 'Accident'];
  const currentYear = new Date().getFullYear();

  for (const employee of employees) {
    // Assign random insurance types to each employee
    const employeeInsuranceTypes = insuranceTypes.slice(0, Math.floor(Math.random() * 3) + 1);

    for (const insuranceType of employeeInsuranceTypes) {
      const coverageAmount = Math.floor(Math.random() * 900000) + 100000; // Random between 100k and 1M
      const premiumAmount = coverageAmount * 0.02; // 2% premium

      reportData.push({
        employeeId: employee.id,
        employeeCode: employee.employee_code || '-',
        name: employee.name,
        department: employee.department,
        insuranceType,
        coverageAmount,
        premiumAmount,
        startDate: `${currentYear}-01-01`,
        endDate: `${currentYear}-12-31`,
        beneficiaries: 'Self, Spouse, Children'
      });
    }
  }

  // Calculate summary
  const summary = {
    totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
    totalPolicies: reportData.length,
    totalCoverageAmount: reportData.reduce((sum, item) => sum + item.coverageAmount, 0),
    totalPremiumAmount: reportData.reduce((sum, item) => sum + item.premiumAmount, 0),
    averageCoverageAmount: parseFloat((reportData.reduce((sum, item) => sum + item.coverageAmount, 0) /
      (reportData.length || 1)).toFixed(2))
  };

  return { data: reportData, summary };
}

async function getProfessionalTaxReport(startDate?: string, endDate?: string, department?: string, employeeId?: string): Promise<{ data: ProfessionalTaxReport[], summary: Record<string, number> }> {
  // This is a mock implementation since we don't have professional tax tables in the schema
  // In a real implementation, you would query the tax-related tables

  // First get employees
  let employeeQuery = supabase
    .from('employees')
    .select('id, name, department, employee_code');

  if (department) {
    employeeQuery = employeeQuery.eq('department', department);
  }

  if (employeeId) {
    employeeQuery = employeeQuery.eq('id', employeeId);
  }

  const { data: employees, error: employeeError } = await employeeQuery;

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  // Get payroll data to estimate professional tax
  const reportData: ProfessionalTaxReport[] = [];

  for (const employee of employees) {
    let payrollQuery = supabase
      .from('payroll')
      .select('*')
      .eq('employee_id', employee.id);

    if (startDate && endDate) {
      payrollQuery = payrollQuery
        .gte('period_start', startDate)
        .lte('period_end', endDate);
    }

    const { data: payrollEntries, error: payrollError } = await payrollQuery;

    if (payrollError) {
      console.error(`Error fetching payroll for employee ${employee.id}:`, payrollError);
      continue;
    }

    // Group by month/year for tax periods
    const taxPeriods = payrollEntries.reduce((acc, entry) => {
      const periodStart = new Date(entry.period_start);
      const period = `${periodStart.getFullYear()}-${(periodStart.getMonth() + 1).toString().padStart(2, '0')}`;

      if (!acc[period]) {
        acc[period] = {
          taxableIncome: 0,
          paymentDate: entry.payment_date || null
        };
      }

      acc[period].taxableIncome += entry.base_salary;

      return acc;
    }, {} as Record<string, { taxableIncome: number, paymentDate: string | null }>);

    // Create report entries for each tax period
    for (const [period, data] of Object.entries(taxPeriods)) {
      // Calculate professional tax based on income slab
      let taxAmount = 0;
      if (data.taxableIncome <= 10000) {
        taxAmount = 0;
      } else if (data.taxableIncome <= 15000) {
        taxAmount = 150;
      } else if (data.taxableIncome <= 20000) {
        taxAmount = 200;
      } else {
        taxAmount = 300;
      }

      reportData.push({
        employeeId: employee.id,
        employeeCode: employee.employee_code || '-',
        name: employee.name,
        department: employee.department,
        taxPeriod: period,
        taxableIncome: data.taxableIncome,
        taxAmount,
        paymentDate: data.paymentDate ? new Date(data.paymentDate).toLocaleDateString() : '-',
        receiptNumber: `PT${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
      });
    }
  }

  // Calculate summary
  const summary = {
    totalEmployees: new Set(reportData.map(item => item.employeeId)).size,
    totalTaxableIncome: reportData.reduce((sum, item) => sum + item.taxableIncome, 0),
    totalTaxAmount: reportData.reduce((sum, item) => sum + item.taxAmount, 0),
    averageTaxAmount: parseFloat((reportData.reduce((sum, item) => sum + item.taxAmount, 0) /
      (reportData.length || 1)).toFixed(2))
  };

  return { data: reportData, summary };
}

export interface MusterRollReport {
  employeeId: string;
  employeeCode: string;
  name: string;
  fatherName: string;
  designation: string;
  dob: {
    day: string;
    month: string;
    year: string;
  };
  attendance: Record<number, string>; // day -> status code
}

export async function getMusterRollReport(startDate: string, endDate: string, department?: string, employeeId?: string, tenantId?: string): Promise<{ data: MusterRollReport[], summary: any }> {
  if (!startDate || !endDate) {
    return { data: [], summary: {} };
  }

  // 1. Fetch Employees
  let selectClause = `
      id, 
      name, 
      father_name, 
      employee_code, 
      date_of_birth,
      departments${department ? '!inner' : ''}(name),
      roles(name)
    `;

  let employeeQuery = supabase
    .from('employees')
    .select(selectClause)
    .eq('tenant_id', tenantId);

  if (department) {
    employeeQuery = employeeQuery.eq('departments.name', department);
  }
  if (employeeId) {
    employeeQuery = employeeQuery.eq('id', employeeId);
  }

  employeeQuery = employeeQuery.order('employee_code', { ascending: true });

  const { data: employees, error: empError } = await employeeQuery;
  if (empError) throw new Error(empError.message);

  // 2. Fetch Attendance Logs
  const { data: attendanceLogs, error: attError } = await supabase
    .from('attendance_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (attError) throw new Error(attError.message);

  // 3. Fetch Holidays
  const { data: holidays, error: holError } = await supabase
    .from('holidays')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .gte('date', startDate)
    .lte('date', endDate);

  if (holError) throw new Error(holError.message);

  // 4. Fetch Weekly Off Patterns
  const { data: patterns, error: patError } = await supabase
    .from('holiday_recurring_patterns')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (patError) throw new Error(patError.message);

  // 5. Fetch Leave Requests (Corrected overlap check)
  const { data: allApprovedLeaves, error: allLeaveError } = await supabase
    .from('leave_requests')
    .select(`
        employee_id,
        start_date,
        end_date,
        status,
        leave_types(name)
      `)
    .eq('tenant_id', tenantId)
    .eq('status', 'Approved');

  if (allLeaveError) throw new Error(allLeaveError.message);

  const relevantLeaves = (allApprovedLeaves || []).filter(leave =>
    leave.start_date <= endDate && leave.end_date >= startDate
  );

  // Helper to check if a date is a holiday or weekly off
  const getDayStatus = (dateStr: string) => {
    const holiday = holidays?.find(h => h.date === dateStr);
    if (holiday) return 'NH';

    const date = new Date(dateStr);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    const dayOfMonth = date.getDate();
    const weekNum = Math.ceil(dayOfMonth / 7);
    const isLast = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() - dayOfMonth < 7;
    const occurrenceMap: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };

    const isWeeklyOff = patterns?.some(p =>
      p.week_day.toLowerCase() === dayName &&
      (p.week_occurrence === '' || p.week_occurrence === occurrenceMap[weekNum] || (p.week_occurrence === 'last' && isLast))
    );

    return isWeeklyOff ? 'WH' : null;
  };

  // 6. Map everything together
  const reportData: MusterRollReport[] = employees.map(emp => {
    const empAttendance: Record<number, string> = {};
    const dob = emp.date_of_birth ? new Date(emp.date_of_birth) : null;

    // Iterate through days of the month
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDate();
      const dateStr = d.toISOString().split('T')[0];

      let status = 'A'; // Default to Absent

      // Check Leave
      const leave = relevantLeaves.find(l => l.employee_id === emp.id && l.start_date <= dateStr && l.end_date >= dateStr);
      const leaveCode = leave?.leave_types?.name || 'A';

      // Check Attendance Log
      const log = attendanceLogs?.find(l => l.employee_id === emp.id && l.date === dateStr);
      if (log) {
        const logStatus = log.status;
        if (logStatus === 'Present') status = 'P';
        else if (logStatus === 'Half Day') status = 'HD';
        else if (logStatus === 'Late') status = 'LT';
        else if (logStatus === 'Permission') status = 'PR';
        else if (logStatus === 'Early Exit') status = 'EE';
        else if (logStatus === 'First Off') {
          status = `${leaveCode}/AN`;
        } else if (logStatus === 'Second Off') {
          status = `F/${leaveCode}`;
        }
      } else {
        // If no log but has leave, show the leave code
        if (leave) status = leaveCode;
      }

      // Check Holiday/Weekly Off
      const hStatus = getDayStatus(dateStr);
      if (hStatus && (status === 'A' || status === 'LP')) {
        status = hStatus;
      }

      empAttendance[day] = status;
    }

    return {
      employeeId: emp.id,
      employeeCode: emp.employee_code || '-',
      name: emp.name,
      fatherName: emp.father_name || '-',
      designation: emp.roles?.name || '-',
      dob: {
        day: dob ? dob.getDate().toString() : '-',
        month: dob ? (dob.getMonth() + 1).toString() : '-',
        year: dob ? dob.getFullYear().toString() : '-'
      },
      attendance: empAttendance
    };
  });

  return { data: reportData, summary: {} };
}
