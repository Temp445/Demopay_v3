export type GatePassStatus = 'pending' | 'approved' | 'assigned' | 'rejected' | 'cancelled';

export type GatePassChangeType = 'created' | 'updated' | 'approved' | 'rejected' | 'cancelled';

export interface GatePassRequest {
  gate_pass_type: string;
  company_name: string;
  id: string;
  tenant_id: string;
  employee_id: string;

  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  reason: string;

  status: GatePassStatus;

  approved_start_date: string | null;
  approved_start_time: string | null;
  approved_end_date: string | null;
  approved_end_time: string | null;

  requested_by: string | null;
  requested_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  allowed_radius_meters?: number;
  created_at: string;
  updated_at: string;

  employee?: {
    name: string;
    email: string;
    employee_code?: string;
    department?: string;
  };

  approval?: GatePassApproval;
}

export interface GatePassApproval {
  id: string;
  gate_pass_id: string;
  tenant_id: string;

  action: 'approved' | 'rejected';
  approver_id: string;
  approver_name: string | null;
  approved_at: string;

  comments: string | null;
  rejection_reason: string | null;

  original_start_date: string | null;
  original_start_time: string | null;
  original_end_date: string | null;
  original_end_time: string | null;
  modified_start_date: string | null;
  modified_start_time: string | null;
  modified_end_date: string | null;
  modified_end_time: string | null;
  has_modifications: boolean;

  created_at: string;
}

export interface GatePassChangeLog {
  id: string;
  gate_pass_id: string;
  tenant_id: string;

  change_type: GatePassChangeType;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;

  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  description: string | null;

  created_at: string;
}

export interface CreateGatePassRequest {
  employee_id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  reason: string;
  // NEW FIELDS
  gate_pass_type: 'normal' | 'paid';
  company_name?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  formatted_address?: string;
}

export interface UpdateGatePassRequest {
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  reason?: string;
  // NEW FIELDS FOR PAID GATE PASS
  gate_pass_type?: 'normal' | 'paid';
  company_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  formatted_address?: string | null;
}

export interface ApproveGatePassRequest {
  comments?: string;
  approved_start_date: string;
  approved_start_time: string;
  approved_end_date: string;
  approved_end_time: string;
}

export interface RejectGatePassRequest {
  rejection_reason: string;
}

export interface CancelGatePassRequest {
  cancellation_reason: string;
}

export interface GatePassFilters {
  status?: GatePassStatus | 'all';
  employee_id?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
}

export interface GatePassStatistics {
  total: number;
  pending: number;
  approved: number;
  assigned: number; 
  rejected: number;
  cancelled: number;
}
