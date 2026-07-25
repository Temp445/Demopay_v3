import type { ReactNode } from 'react';

export interface WorkLocation {
  employee_code: ReactNode;
  id: string;
  tenant_id: string;
  employee_id: string;
  assigned_by: string;

  location_name: string;
  location_description?: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;

  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  formatted_address?: string;

  assignment_date: string;
  work_description: string;

  status: 'assigned' | 'in_progress' | 'paused' | 'completed' | 'approved' | 'cancelled';
  started_at?: string;
  completed_at?: string;
  approved_at?: string;
  approved_by?: string;

  work_amount?: number;
  work_amount_unit?: string;

  created_at: string;
  updated_at: string;

  employee_name?: string;
  employee_email?: string;
  
  gate_pass_id?: string | null;
}

export interface WorkLocationTracking {
  id: string;
  tenant_id: string;
  work_location_id: string;
  employee_id: string;

  latitude: number;
  longitude: number;
  accuracy?: number;
  speed_ms?: number | null; // Raw GPS speed in m/s; null if device cannot determine

  distance_from_center?: number;
  is_within_radius: boolean;

  recorded_at: string;
  battery_level?: number;

  created_at: string;
}

export type JourneyEventType = 
  | 'START_JOURNEY'
  | 'LIVE_TRACK_JOURNEY'
  | 'REACHED_LOCATION'
  | 'START_WORK'
  | 'LIVE_TRACK_WORK'
  | 'PAUSE_WORK'
  | 'RESUME_WORK'
  | 'COMPLETE_WORK'
  | 'START_RETURN_JOURNEY'
  | 'REACHED_ENDPOINT'
  | 'GPS_SIGNAL_LOST'
  | 'GPS_SIGNAL_RESTORED'
  | 'HEARTBEAT'; // Enterprise: lightweight online-presence ping (no GPS required)

export interface JourneyTrackingLog {
  id: string;
  tenant_id: string;
  employee_id: string;
  work_location_id?: string | null;
  event_type: JourneyEventType;
  latitude: number | null;
  longitude: number | null;
  accuracy?: number | null;
  speed_ms?: number | null; // Raw GPS speed in m/s; null if device cannot determine
  battery_level?: number;
  timestamp: string;
  created_at: string;
}

export interface WorkLocationViolation {
  id: string;
  tenant_id: string;
  work_location_id: string;
  employee_id: string;

  violation_type: 'radius_exit' | 'radius_entry';
  latitude: number;
  longitude: number;
  distance_from_center: number;

  notification_sent: boolean;
  notification_sent_at?: string;

  violated_at: string;
  created_at: string;

  employee_name?: string;
  location_name?: string;
}

export interface WorkLocationNotification {
  id: string;
  tenant_id: string;
  work_location_id?: string;

  recipient_user_id?: string;
  recipient_employee_id?: string;

  notification_type: 'work_assigned' | 'work_started' | 'work_completed' | 'radius_violation' | 'work_approved';
  title: string;
  message: string;

  is_read: boolean;
  read_at?: string;

  created_at: string;
}

export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed_ms?: number | null; // Raw GPS speed in m/s from navigator.geolocation; null if unavailable
}

export interface GPSTrackingState {
  isTracking: boolean;
  currentPosition?: GPSCoordinates;
  watchId?: number;
  error?: string;
}

export interface CreateWorkLocationInput {
  employee_id: string;
  location_name: string;
  location_description?: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  formatted_address?: string;
  assignment_date: string;
  work_description: string;
}

export interface LocationSearchResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

export interface UpdateWorkLocationInput {
  status?: WorkLocation['status'];
  started_at?: string;
  completed_at?: string;
  approved_at?: string;
  approved_by?: string;
  work_amount?: number;
  work_amount_unit?: string;
}
