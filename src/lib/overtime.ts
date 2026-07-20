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
 * Get global overtime configuration from company settings
 */
export async function getGlobalOvertimeConfig(): Promise<OvertimeConfig | null> {
  const tenantId = await getTenantId();

  // Try fetching with the new column first
  const { data, error } = await supabase
    .from('company_settings')
    .select(`
      overtime_enabled,
      overtime_calculation_timing,
      overtime_threshold_minutes,
      overtime_rounding_interval,
      overtime_rounding_method,
      overtime_rounding_mode,
      ot_monthly_hours_type,
      ot_fixed_days,
      ot_working_hours_per_day,
      ot_global_multiplier,
      ot_link_with_payroll
    `)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // If error is related to missing column, retry without it
  if (error && error.message.includes('column') && error.message.includes('not found')) {
    const { data: retryData, error: retryError } = await supabase
      .from('company_settings')
      .select(`
        overtime_enabled,
        overtime_calculation_timing,
        overtime_threshold_minutes,
        overtime_rounding_interval,
        overtime_rounding_method,
        overtime_rounding_mode,
        ot_monthly_hours_type,
        ot_fixed_days,
        ot_working_hours_per_day,
        ot_global_multiplier
      `)
      .eq('tenant_id', tenantId)
      .maybeSingle();
      
    if (retryError) {
      console.error('Error fetching overtime config (retry):', retryError);
      return null;
    }
    
    if (!retryData) return null;
    
    return {
      enabled: retryData.overtime_enabled || false,
      calculation_timing: retryData.overtime_calculation_timing || 'both',
      threshold_minutes: retryData.overtime_threshold_minutes || 30,
      rounding_interval: retryData.overtime_rounding_interval || 30,
      rounding_method: retryData.overtime_rounding_method || 'nearest',
      rounding_mode: retryData.overtime_rounding_mode || 'combined',
      monthly_hours_type: retryData.ot_monthly_hours_type || 'fixed',
      fixed_days: Number(retryData.ot_fixed_days) || 26,
      working_hours_per_day: Number(retryData.ot_working_hours_per_day) || 8,
      global_multiplier: Number(retryData.ot_global_multiplier) || 1.00,
      link_with_payroll: false, // Default if column missing
    };
  }

  if (error) {
    console.error('Error fetching overtime config:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    enabled: data.overtime_enabled || false,
    calculation_timing: data.overtime_calculation_timing || 'both',
    threshold_minutes: data.overtime_threshold_minutes || 30,
    rounding_interval: data.overtime_rounding_interval || 30,
    rounding_method: data.overtime_rounding_method || 'nearest',
    rounding_mode: data.overtime_rounding_mode || 'combined',
    monthly_hours_type: data.ot_monthly_hours_type || 'fixed',
    fixed_days: Number(data.ot_fixed_days) || 26,
    working_hours_per_day: Number(data.ot_working_hours_per_day) || 8,
    global_multiplier: Number(data.ot_global_multiplier) || 1.00,
    link_with_payroll: data.ot_link_with_payroll || false,
  };
}

/**
 * Update global overtime configuration
 */
export async function updateGlobalOvertimeConfig(config: Partial<OvertimeConfig>): Promise<void> {
  const tenantId = await getTenantId();

  const updates: any = {};
  if (config.enabled !== undefined) updates.overtime_enabled = config.enabled;
  if (config.calculation_timing !== undefined) updates.overtime_calculation_timing = config.calculation_timing;
  if (config.threshold_minutes !== undefined) updates.overtime_threshold_minutes = config.threshold_minutes;
  if (config.rounding_interval !== undefined) updates.overtime_rounding_interval = config.rounding_interval;
  if (config.rounding_method !== undefined) updates.overtime_rounding_method = config.rounding_method;
  if (config.rounding_mode !== undefined) updates.overtime_rounding_mode = config.rounding_mode;
  
  if (config.monthly_hours_type !== undefined) updates.ot_monthly_hours_type = config.monthly_hours_type;
  if (config.fixed_days !== undefined) updates.ot_fixed_days = config.fixed_days;
  if (config.working_hours_per_day !== undefined) updates.ot_working_hours_per_day = config.working_hours_per_day;
  if (config.global_multiplier !== undefined) updates.ot_global_multiplier = config.global_multiplier;
  if (config.link_with_payroll !== undefined) updates.ot_link_with_payroll = config.link_with_payroll;

  const { error } = await supabase
    .from('company_settings')
    .update(updates)
    .eq('tenant_id', tenantId);

  if (error) {
    // If update fails due to missing column, try without it
    if (error.message.includes('column') && error.message.includes('not found')) {
      const safeUpdates = { ...updates };
      delete safeUpdates.ot_link_with_payroll;
      
      const { error: retryError } = await supabase
        .from('company_settings')
        .update(safeUpdates)
        .eq('tenant_id', tenantId);
        
      if (retryError) throw new Error(`Failed to update overtime config (retry): ${retryError.message}`);
      return;
    }
    throw new Error(`Failed to update overtime config: ${error.message}`);
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
