export type OTApprovalStatus = 'pending' | 'approved' | 'rejected';
export type OTProcessingStatus = 'draft' | 'processing' | 'completed' | 'finalized' | 'cancelled';
export type OTProcessingMode = 'standalone' | 'linked';
export type OTComponentType = 'fixed' | 'editable' | 'enter_later';
export type OTCalculationType = 'flat' | 'hourly_rate' | 'percentage';

export interface EmployeeOTEligibility {
  id: string;
  tenant_id: string;
  employee_id: string;
  is_ot_eligible: boolean;
  effective_from: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface EmployeeOTStatus {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  isOTEligible: boolean;
  effectiveFrom: string;
  notes?: string;
}

export interface OTStructure {
  id: string;
  tenant_id: string;
  structure_name: string;
  description?: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  components?: OTComponent[];
}

export interface OTComponent {
  id: string;
  tenant_id: string;
  ot_structure_id: string;
  component_name: string;
  component_type: OTComponentType;
  calculation_type: OTCalculationType;
  value: number;
  percentage_of?: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OTApproval {
  id: string;
  tenant_id: string;
  employee_id: string;
  attendance_log_id?: string;
  attendance_date: string;
  original_ot_hours: number;
  corrected_ot_hours?: number;
  modification_reason?: string;
  approval_status: OTApprovalStatus;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OTApprovalRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department?: string;
  attendanceDate: string;
  clockIn?: string;
  clockOut?: string;
  originalOTHours: number;
  correctedOTHours?: number;
  modificationReason?: string;
  approvalStatus: OTApprovalStatus;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  attendanceLogId?: string;
}

export interface OTProcessing {
  id: string;
  tenant_id: string;
  process_name: string;
  processing_period_start: string;
  processing_period_end: string;
  processing_mode: OTProcessingMode;
  linked_payroll_id?: string;
  ot_structure_id?: string;
  processing_status: OTProcessingStatus;
  total_employees: number;
  total_ot_amount: number;
  processed_at?: string;
  finalized_at?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface OTProcessedData {
  id: string;
  tenant_id: string;
  ot_processing_id: string;
  employee_id: string;
  ot_structure_id?: string;
  total_ot_hours: number;
  total_ot_amount: number;
  components: OTProcessedComponent[];
  attendance_records: OTAttendanceRecord[];
  created_at: string;
  updated_at: string;
}

export interface OTProcessedComponent {
  componentId: string;
  componentName: string;
  componentType: OTComponentType;
  calculationType: OTCalculationType;
  value: number;
  amount: number;
}

export interface OTAttendanceRecord {
  date: string;
  hours: number;
  approvalId?: string;
}

export interface OTProcessWithDetails extends OTProcessing {
  structure?: OTStructure;
  processedData?: OTProcessedData[];
  linkedPayroll?: {
    id: string;
    pay_period: string;
  };
}

export interface CreateOTStructureInput {
  structure_name: string;
  description?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface CreateOTComponentInput {
  component_name: string;
  component_type: OTComponentType;
  calculation_type: OTCalculationType;
  value: number;
  percentage_of?: string;
  display_order: number;
  is_active?: boolean;
}

export interface CreateOTProcessInput {
  process_name: string;
  processing_period_start: string;
  processing_period_end: string;
  processing_mode: OTProcessingMode;
  linked_payroll_id?: string;
  ot_structure_id?: string;
}

export interface UpdateOTApprovalInput {
  corrected_ot_hours?: number;
  modification_reason?: string;
  approval_status?: OTApprovalStatus;
  approved_by?: string | null;
  approved_at?: string | null;
}

export interface OTEligibleEmployee {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  total_ot_hours: number;
  ot_structure_id?: string;
}

export interface OTReportData {
  employeeCode: string;
  employeeName: string;
  department: string;
  attendanceDate: string;
  originalOTHours: number;
  correctedOTHours?: number;
  variance: number;
  modificationReason?: string;
  approvalStatus: string;
  otAmount: number;
  approvedBy?: string;
  approvedAt?: string;
}

export interface OTReportFilters {
  startDate: string;
  endDate: string;
  employeeId?: string;
  departmentId?: string;
  approvalStatus?: OTApprovalStatus;
  showModifiedOnly?: boolean;
}

export interface OTSummaryData {
  totalEmployees: number;
  totalOTHours: number;
  totalOTAmount: number;
  avgOTHoursPerEmployee: number;
  pendingApprovals: number;
  approvedRecords: number;
  rejectedRecords: number;
}

export interface EmployeeComponentValue {
  employeeId: string;
  componentId: string;
  value: number;
}
