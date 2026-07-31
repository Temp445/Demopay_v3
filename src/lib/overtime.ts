import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

/**
 * Overtime Configuration Interfaces
 */
export interface OvertimeConfig {
  enabled: boolean;
  calculation_timing: 'before' | 'after' | 'both';
  threshold_minutes: number;
  rounding_interval: 10 | 15 | 30 | 60;
  rounding_method: 'nearest' | 'midpoint' | 'start';
  rounding_mode: 'separate' | 'combined';
  // New settings for precision calculation
  monthly_hours_type: 'fixed' | 'calendar_days';
  fixed_days: number;
  working_hours_per_day: number;
  global_multiplier: number;
  link_with_payroll: boolean;
  ot_structure_id?: string | null;
}

export interface OvertimePolicy extends OvertimeConfig {
  id: string;
  name: string;
  location_status_match: string;
  is_default: boolean;
}

export interface OvertimeResult {
  before_shift_minutes: number;
  after_shift_minutes: number;
  total_overtime_minutes: number;
  is_overtime_applicable: boolean;
}

export interface ShiftOvertimeConfig {
  overtime_enabled: boolean;
  overtime_config_override: boolean;
  overtime_calculation_timing: 'before' | 'after' | 'both' | null;
}

/**
 * Get all overtime policies
 */
export async function getOvertimePolicies(): Promise<OvertimePolicy[]> {
  const tenantId = await getTenantId();

  const { data, error } = await supabase
    .from('overtime_policies')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching overtime policies:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    location_status_match: row.location_status_match,
    is_default: row.is_default,
    enabled: row.overtime_enabled || false,
    calculation_timing: row.calculation_timing || 'both',
    threshold_minutes: row.threshold_minutes || 30,
    rounding_interval: row.rounding_interval || 30,
    rounding_method: row.rounding_method || 'nearest',
    rounding_mode: row.rounding_mode || 'combined',
    monthly_hours_type: row.monthly_hours_type || 'fixed',
    fixed_days: Number(row.fixed_days) || 26,
    working_hours_per_day: Number(row.working_hours_per_day) || 8,
    global_multiplier: Number(row.global_multiplier) || 1.00,
    link_with_payroll: row.link_with_payroll || false,
    ot_structure_id: row.ot_structure_id,
  }));
}

/**
 * Save an overtime policy (creates or updates)
 */
export async function saveOvertimePolicy(policy: Partial<OvertimePolicy>): Promise<OvertimePolicy | null> {
  const tenantId = await getTenantId();

  const payload = {
    tenant_id: tenantId,
    name: policy.name,
    location_status_match: policy.location_status_match,
    is_default: policy.is_default,
    overtime_enabled: policy.enabled,
    calculation_timing: policy.calculation_timing,
    threshold_minutes: policy.threshold_minutes,
    rounding_interval: policy.rounding_interval,
    rounding_method: policy.rounding_method,
    rounding_mode: policy.rounding_mode,
    monthly_hours_type: policy.monthly_hours_type,
    fixed_days: policy.fixed_days,
    working_hours_per_day: policy.working_hours_per_day,
    global_multiplier: policy.global_multiplier,
    link_with_payroll: policy.link_with_payroll,
    ot_structure_id: policy.ot_structure_id,
    updated_at: new Date().toISOString()
  };

  let result;
  if (policy.id) {
    result = await supabase
      .from('overtime_policies')
      .update(payload)
      .eq('id', policy.id)
      .eq('tenant_id', tenantId)
      .select()
      .single();
  } else {
    result = await supabase
      .from('overtime_policies')
      .insert(payload)
      .select()
      .single();
  }

  if (result.error) {
    console.error('Error saving overtime policy:', result.error);
    throw new Error(`Failed to save overtime policy: ${result.error.message}`);
  }
  
  if (!result.data) return null;
  
  const row = result.data;
  return {
    id: row.id,
    name: row.name,
    location_status_match: row.location_status_match,
    is_default: row.is_default,
    enabled: row.overtime_enabled || false,
    calculation_timing: row.calculation_timing || 'both',
    threshold_minutes: row.threshold_minutes || 30,
    rounding_interval: row.rounding_interval || 30,
    rounding_method: row.rounding_method || 'nearest',
    rounding_mode: row.rounding_mode || 'combined',
    monthly_hours_type: row.monthly_hours_type || 'fixed',
    fixed_days: Number(row.fixed_days) || 26,
    working_hours_per_day: Number(row.working_hours_per_day) || 8,
    global_multiplier: Number(row.global_multiplier) || 1.00,
    link_with_payroll: row.link_with_payroll || false,
  };
}

/**
 * Delete an overtime policy
 */
export async function deleteOvertimePolicy(policyId: string): Promise<void> {
  const tenantId = await getTenantId();
  
  // Check if policy is already used in calculations
  const { count, error: checkError } = await supabase
    .from('ot_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('applied_policy_id', policyId)
    .eq('tenant_id', tenantId);
    
  if (checkError) {
    throw new Error(`Failed to check policy usage: ${checkError.message}`);
  }
  
  if (count && count > 0) {
    throw new Error('Cannot delete this policy because it has already been used for overtime calculations.');
  }

  const { error } = await supabase
    .from('overtime_policies')
    .delete()
    .eq('id', policyId)
    .eq('tenant_id', tenantId);
    
  if (error) {
    console.error('Error deleting overtime policy:', error);
    throw new Error(`Failed to delete overtime policy: ${error.message}`);
  }
}

/**
 * Get shift-specific overtime configuration
 */
export async function getShiftOvertimeConfig(shiftId: string): Promise<ShiftOvertimeConfig | null> {
  const tenantId = await getTenantId();

  const { data, error } = await supabase
    .from('shifts')
    .select('overtime_enabled, overtime_config_override, overtime_calculation_timing')
    .eq('id', shiftId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Update shift-specific overtime configuration
 */
export async function updateShiftOvertimeConfig(
  shiftId: string,
  config: Partial<ShiftOvertimeConfig>
): Promise<void> {
  const tenantId = await getTenantId();

  const { error } = await supabase
    .from('shifts')
    .update(config)
    .eq('id', shiftId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Failed to update shift overtime config: ${error.message}`);
  }
}

/**
 * Calculate overtime for a shift attendance record
 * Uses database function for consistent calculation
 */
export async function calculateOvertime(
  shiftId: string,
  shiftStartTime: string,
  shiftEndTime: string,
  actualClockIn: string | null,
  actualClockOut: string | null
): Promise<OvertimeResult | null> {
  const tenantId = await getTenantId();

  if (!actualClockIn || !actualClockOut) {
    return {
      before_shift_minutes: 0,
      after_shift_minutes: 0,
      total_overtime_minutes: 0,
      is_overtime_applicable: false,
    };
  }

  const { data, error } = await supabase.rpc('calculate_overtime', {
    p_shift_id: shiftId,
    p_tenant_id: tenantId,
    p_shift_start_time: shiftStartTime,
    p_shift_end_time: shiftEndTime,
    p_actual_clock_in: actualClockIn,
    p_actual_clock_out: actualClockOut,
  });

  if (error) {
    console.error('Error calculating overtime:', error);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Format overtime minutes to hours and minutes display
 */
export function formatOvertimeDisplay(minutes: number): string {
  if (minutes === 0) return '0h';

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

/**
 * Get overtime rounding description for UI display
 */
export function getRoundingMethodDescription(method: string): string {
  switch (method) {
    case 'nearest':
      return 'Round to Nearest';
    case 'midpoint':
      return 'Round Up at Midpoint';
    case 'start':
      return 'Round Down (Start)';
    default:
      return 'Unknown';
  }
}

/**
 * Get overtime timing description for UI display
 */
export function getTimingDescription(timing: string): string {
  switch (timing) {
    case 'before':
      return 'Before Shift Start Only';
    case 'after':
      return 'After Shift End Only';
    case 'both':
      return 'Both Before and After Shift';
    default:
      return 'Unknown';
  }
}

/**
 * Validate rounding interval is compatible with threshold
 */
export function validateRoundingInterval(
  threshold: number,
  interval: number
): { valid: boolean; message?: string } {
  if (interval < threshold) {
    return {
      valid: false,
      message: 'Rounding interval must be equal to or greater than threshold',
    };
  }

  if (interval % threshold !== 0 && threshold % interval !== 0) {
    return {
      valid: false,
      message: 'Rounding interval should be a multiple of threshold time',
    };
  }

  return { valid: true };
}

/**
 * Calculate overtime preview for configuration testing
 * Client-side calculation for preview purposes
 */
export function calculateOvertimePreview(
  beforeMinutes: number,
  afterMinutes: number,
  config: OvertimeConfig
): { beforeRounded: number; afterRounded: number; total: number } {
  let beforeRounded = 0;
  let afterRounded = 0;
  let total = 0;

  const applyRounding = (minutes: number): number => {
    if (minutes <= 0) return 0;

    const quotient = Math.floor(minutes / config.rounding_interval);
    const remainder = minutes % config.rounding_interval;

    switch (config.rounding_method) {
      case 'nearest':
        return remainder >= config.rounding_interval / 2
          ? (quotient + 1) * config.rounding_interval
          : quotient * config.rounding_interval;
      case 'midpoint':
        return remainder > config.rounding_interval / 2
          ? (quotient + 1) * config.rounding_interval
          : quotient * config.rounding_interval;
      case 'start':
        return quotient * config.rounding_interval;
      default:
        return minutes;
    }
  };

  if (config.rounding_mode === 'separate') {
    // Apply rounding first, then threshold check.
    // This honors "Nearest" or "Midpoint" rounding to push smaller time up to qualify for a threshold
    const roundedB = applyRounding(beforeMinutes);
    const roundedA = applyRounding(afterMinutes);
    
    if (roundedB >= config.threshold_minutes) {
      beforeRounded = roundedB;
    }
    if (roundedA >= config.threshold_minutes) {
      afterRounded = roundedA;
    }
    total = beforeRounded + afterRounded;
  } else {
    // Combined mode
    const totalMinutes = beforeMinutes + afterMinutes;
    const roundedT = applyRounding(totalMinutes);
    
    if (roundedT >= config.threshold_minutes) {
      total = roundedT;
      // Proportionally distribute, but snap to clean intervals!
      if (totalMinutes > 0) {
        const rawBeforeShare = (beforeMinutes / totalMinutes) * total;
        // Find nearest clean block that fits the interval
        const intervals = Math.round(rawBeforeShare / config.rounding_interval);
        beforeRounded = intervals * config.rounding_interval;
        
        // Ensure bounds
        beforeRounded = Math.min(Math.max(0, beforeRounded), total);
        afterRounded = total - beforeRounded;
      }
    }
  }

  return { beforeRounded, afterRounded, total };
}
