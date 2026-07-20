export type AdvanceStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'closed';

export type InstallmentStatus = 'scheduled' | 'deducted' | 'held' | 'waived';

export type ClosureType = 'authority_initiated' | 'employee_requested';

export interface AdvanceSettings {
  id?: string;
  tenant_id?: string;
  default_interest_rate: number;
  max_advance_amount: number | null;
  max_installments: number;
  min_installments: number;
  allow_multiple_advances: boolean;
  require_justification: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeAdvance {
  id: string;
  tenant_id: string;
  employee_id: string;
  request_date: string;
  requested_amount: number;
  requested_installments: number;
  requested_interest_rate: number;
  requested_start_month: string;
  justification: string;
  approved_amount: number | null;
  approved_installments: number | null;
  approved_interest_rate: number | null;
  approved_start_month: string | null;
  approved_by: string | null;
  approved_date: string | null;
  approval_comments: string;
  total_amount: number;
  remaining_balance: number;
  status: AdvanceStatus;
  requested_by: string;
  created_at: string;
  updated_at: string;
  employee?: {
    name: string;
    email: string;
    employee_code?: string;
  };
  requestedByName?: string;
  approvedByName?: string;
}

export interface AdvanceInstallment {
  id: string;
  tenant_id: string;
  advance_id: string;
  installment_number: number;
  due_month: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  status: InstallmentStatus;
  deducted_date: string | null;
  payroll_id: string | null;
  created_at: string;
}

export interface AdvanceDeductionHold {
  id: string;
  tenant_id: string;
  advance_id: string;
  hold_month: string;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface AdvanceShortClosure {
  id: string;
  tenant_id: string;
  advance_id: string;
  closure_type: ClosureType;
  closure_amount: number;
  closure_reason: string;
  closure_date: string;
  payroll_id: string | null;
  approved_by: string;
  created_at: string;
}

export interface AdvanceRequest {
  requested_amount: number;
  requested_installments: number;
  requested_interest_rate: number;
  requested_start_month: string;
  justification: string;
  employee_id: string;
}

export interface AdvanceApproval {
  approved_amount: number;
  approved_installments: number;
  approved_interest_rate: number;
  approved_start_month: string;
  approval_comments?: string;
}

export interface DeductionHoldRequest {
  advance_id: string;
  hold_month: string;
  reason: string;
}

export interface ShortClosureRequest {
  advance_id: string;
  closure_type: ClosureType;
  closure_reason: string;
  closure_date?: string;
}

export interface AdvanceFilters {
  employee_id?: string;
  status?: AdvanceStatus | AdvanceStatus[];
  from_date?: string;
  to_date?: string;
}

export interface AdvanceCalculation {
  requested_amount: number;
  interest_rate: number;
  installments: number;
  total_amount: number;
  monthly_installment: number;
  principal_per_month: number;
  interest_per_month: number;
}

export type InstallmentChangeType = 'amount_increase' | 'amount_decrease' | 'redistribution';
export type RedistributionMethod = 'equal' | 'proportional' | 'new_installment';

export interface InstallmentChange {
  installment_id: string;
  new_amount: number;
}

export interface InstallmentChangeLog {
  id: string;
  tenant_id: string;
  advance_id: string;
  installment_id: string;
  change_type: InstallmentChangeType;
  old_amount: number;
  new_amount: number;
  redistribution_method: RedistributionMethod | null;
  affected_installments: any;
  reason: string;
  changed_by: string;
  created_at: string;
}


export interface InstallmentModificationRequest {
  advance_id: string;
  installment_changes: {
    installment_id: string;
    new_amount: number;
  }[];
  deleted_installment_ids: string[]; // <--- ADD THIS
  redistribution_method: 'equal' | 'proportional' | 'last_installment' | 'new_installment';
  extension_months?: number;
  reason: string;
}

export interface InstallmentModificationResult {
  success: boolean;
  affected_count: number;
  affected_installments: any[];
  redistribution_applied: boolean;
}
