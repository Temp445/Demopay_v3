export interface Visitor {
  id: string;
  tenant_id: string;
  visitor_image?: string;
  visitor_image_data?: Uint8Array;
  face_descriptor: any;
  visitor_name?: string;
  email?: string;
  phone_number?: string;
  employee_to_visit?: string;
  reason_for_visit?: string;
  visit_count: number;
  visitor_status: 'pending' | 'approved' | 'rejected' | 'verification_pending' | 'exit_pending' | 'exited';
  first_detected_at: string;
  last_visit_at: string;
  last_seen_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface VisitorTimestamp {
  id: string;
  tenant_id: string;
  visitor_id: string;
  clock_in: string;
  clock_out?: string;
  is_confirmed: boolean;
  confirmed_by?: string;
  confirmed_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface VisitorApproval {
  id: string;
  tenant_id: string;
  visitor_id: string;
  employee_id: string;
  action: 'approved' | 'rejected';
  reason?: string;
  approved_by: string;
  approved_at: string;
  created_at: string;
}

export interface VisitorNotification {
  id: string;
  tenant_id: string;
  visitor_id: string;
  employee_id: string;
  notification_type: 'pending_approval' | 'approved' | 'rejected' | 'visitor_arrived' | 'visitor_left' | 'confirmation_required';
  message: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface VisitorSettings {
  id: string;
  tenant_id: string;
  enable_employee_notifications: boolean;
  require_employee_approval: boolean;
  require_exit_confirmation: boolean;
  allow_automatic_entry: boolean;
  face_match_threshold: number;
  created_at: string;
  updated_at?: string;
}

export interface VisitorWithDetails extends Visitor {
  employee_name?: string;
  employee_email?: string;
  latest_timestamp?: VisitorTimestamp;
  pending_approval?: VisitorApproval;
}

export interface VisitorFormData {
  visitor_name: string;
  email: string;
  phone_number: string;
  employee_to_visit: string;
  reason_for_visit: string;
}

export interface VisitorApprovalRequest {
  visitor_id: string;
  action: 'approved' | 'rejected';
  reason?: string;
}

export interface VisitorConfirmationRequest {
  timestamp_id: string;
  visitor_id: string;
  tenant_id?: string;
  confirmed: boolean;
}
