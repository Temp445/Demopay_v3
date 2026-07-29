import { ReactNode } from "react";

export type FilterMode = 'by_shift' | 'by_employee';

export type LocationScenarioFilter = 
  | 'all'
  | 'in_out_outside'
  | 'in_outside_in_office'
  | 'in_office_out_outside'
  | 'outside_only';

// 1. Define the comprehensive status type
export type AttendanceStatus = 
  | 'Present' 
  | 'Absent' 
  | 'Late' 
  | 'Half Day' 
  | 'Permission' 
  | 'Early Exit' 
  | 'First Half Absent' 
  | 'Second Half Absent' 
  | 'First Off' 
  | 'Second Off';

export interface AttendanceLog {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceStatus | string; // Updated to use the new type
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  verification_method: string | null;
  face_confidence: number | null;
  tenant_id: string;
  shift_id?: string | null; // Added to match the DB schema

  employee?: {
    name: string;
    email: string;
    employee_code?: string;
    department?: string;
  };

  shift?: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
  };

  edit_logs?: AttendanceEditLog[];
}

export interface AttendanceTimestamp {
  id: string;
  employee_id: string;
  shift_id: string | null;
  entry: 'IN' | 'OUT';
  timestamp: string;
  created_at: string;
  timing_status: string;
}

export interface AttendanceEditLog {
  id: string;
  tenant_id: string;
  attendance_log_id: string;
  employee_id: string;

  original_clock_in: string | null;
  original_clock_out: string | null;
  modified_clock_in: string | null;
  modified_clock_out: string | null;

  reason_for_change: string;
  edited_by: string;
  edited_by_name: string | null;
  edited_at: string;
  created_at: string;
}

export interface ProcessedTimeRecord {
  matched_shift_id: string;
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  
  status: AttendanceStatus; // Updated to use the new type
  
  shift_status: 'regular' | 'wrong_shift' | 'unscheduled'; 
  
  actual_shift?: string;
  assigned_shifts?: string[];

  shift_id?: string;
  shift_name?: string;

  // Audit fields
  has_edits: boolean;
  edit_count: number;
  verification_method?: string;

  // Location fields
  clock_in_is_outside?: boolean;
  clock_out_is_outside?: boolean;
  location_scenario?: LocationScenarioFilter;
}

export interface ShiftFilterParams {
  shift_id: string;
  shift_date: string;
}

export interface EmployeeFilterParams {
  employee_id: string;
  start_date: string;
  end_date: string;
}

export interface TimeStampFilters {
  mode: FilterMode;
  shift_filter?: ShiftFilterParams;
  employee_filter?: EmployeeFilterParams;

  search?: string;
  status_filter?: string;
  employee_name_filter?: string;
  date_range_filter?: {
    start: string;
    end: string;
  };
  location_scenario?: LocationScenarioFilter;
}

export interface UpdateTimeStampRequest {
  attendance_log_id: string;
  clock_in?: string | null;
  clock_out?: string | null;
  reason_for_change: string;
  shift_id?: string; // Added to allow shift updates
}

export interface CreateTimeStampRequest {
  employee_id: string;
  date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  notes?: string | null;
  shift_id?: string; // Added to allow manual shift assignment
  // --- NEW FIELDS FOR RAW TIMESTAMP EDITS ---
  original_clock_in?: string | null;
  original_clock_out?: string | null;
  reason_for_change?: string;
}

export interface TimeStampStatistics {
  total_records: number;
  present: number;
  absent: number;
  late: number;
  early_leave: number;
  edited_records: number;
}

export interface Shift {
  id: string;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  break_start_time: string;
  break_end_time: string;
  shift_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  employee_code: string;
  department: string;
  role: string;
  status: string;
  status_date?: string;
}
