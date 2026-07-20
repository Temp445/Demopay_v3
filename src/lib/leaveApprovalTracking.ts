import { supabase } from './supabase';
import { getTenantId } from './tenantDb';
import { format, eachDayOfInterval, parseISO, addDays, subDays } from 'date-fns';

export interface LeaveApprovalRecord {
  leave_request_id: string;
  employee_id: string;
  leave_date: string;
  leave_type_id: string;
  is_holiday: boolean;
  is_weekoff: boolean;
  is_within_leave_period: boolean;
  policy_type: string;
  tenant_id: string;
}

/**
 * Processes leave approval, creates daily tracking records, 
 * and deducts the approved days from the employee's leave balance.
 * @param leaveRequestId - The ID of the leave request being approved
 */
export async function processLeaveApproval(leaveRequestId: string): Promise<void> {
  try {
    const tenantId = await getTenantId();

    // Fetch the leave request details including half-day fields
    const { data: leaveRequest, error: leaveError } = await supabase
      .from('leave_requests')
      .select(`
        id,
        employee_id,
        leave_type_id,
        start_date,
        end_date,
        is_half_day_start,
        is_half_day_end,
        total_days,
        leave_types(
          id,
          name,
          before_leave_holiday,
          before_leave_week_off,
          after_leave_holiday,
          after_leave_week_off,
          in_between_leave_holiday,
          in_between_leave_week_off
        )
      `)
      .eq('id', leaveRequestId)
      .eq('tenant_id', tenantId)
      .single();

    // Extract the leave_type from the array
    const leaveType = leaveRequest?.leave_types?.[0] || null;

    if (leaveError || !leaveRequest) {
      console.error('Failed to fetch leave request:', leaveError);
      return;
    }

    const startDate = parseISO(leaveRequest.start_date);
    const endDate = parseISO(leaveRequest.end_date);

    // Fetch holidays for the relevant period
    const extendedStartDate = subDays(startDate, 7);
    const extendedEndDate = addDays(endDate, 7);

    const { data: holidays, error: holidaysError } = await supabase
      .from('holidays')
      .select('date')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .gte('date', format(extendedStartDate, 'yyyy-MM-dd'))
      .lte('date', format(extendedEndDate, 'yyyy-MM-dd'));

    if (holidaysError) {
      console.error('Failed to fetch holidays:', holidaysError);
    }

    const holidayDates = new Set(holidays?.map(h => h.date) || []);

    // Fetch weekoffs
    const { data: weekoffs, error: weekoffsError } = await supabase.rpc('get_weekly_off_list', {
      p_start_date: format(extendedStartDate, 'yyyy-MM-dd'),
      p_end_date: format(extendedEndDate, 'yyyy-MM-dd'),
      p_tenant_id: tenantId
    });

    if (weekoffsError) {
      console.error('Failed to fetch weekoffs:', weekoffsError);
    }

    const weekoffDates = new Set(weekoffs?.map((w: any) => w.date) || []);

    const approvalRecords: LeaveApprovalRecord[] = [];

    const isHoliday = (date: Date): boolean => holidayDates.has(format(date, 'yyyy-MM-dd'));
    const isWeekoff = (date: Date): boolean => weekoffDates.has(format(date, 'yyyy-MM-dd'));

    // 1. Create records for primary leave dates
    const leaveDates = eachDayOfInterval({ start: startDate, end: endDate });

    for (const date of leaveDates) {
      const dateStr = format(date, 'yyyy-MM-dd');
      const isHol = isHoliday(date);
      const isWeek = isWeekoff(date);

      let shouldInclude = true;

      if (isHol && !leaveType?.in_between_leave_holiday) {
        shouldInclude = false;
      }

      if (isWeek && !leaveType?.in_between_leave_week_off) {
        shouldInclude = false;
      }

      if (shouldInclude || (!isHol && !isWeek)) {
        approvalRecords.push({
          leave_request_id: leaveRequest.id,
          employee_id: leaveRequest.employee_id,
          leave_date: dateStr,
          leave_type_id: leaveRequest.leave_type_id,
          is_holiday: isHol,
          is_weekoff: isWeek,
          is_within_leave_period: true,
          policy_type: isHol ? 'in_between_leave_holiday' : isWeek ? 'in_between_leave_week_off' : 'primary',
          tenant_id: tenantId
        });
      }
    }

    // 2. Check for holidays BEFORE the leave period
    if (leaveType?.before_leave_holiday) {
      let checkDate = subDays(startDate, 1);
      let consecutiveDays = 0;
      const maxDaysToCheck = 7;

      while (consecutiveDays < maxDaysToCheck) {
        if (isHoliday(checkDate)) {
          approvalRecords.push({
            leave_request_id: leaveRequest.id,
            employee_id: leaveRequest.employee_id,
            leave_date: format(checkDate, 'yyyy-MM-dd'),
            leave_type_id: leaveRequest.leave_type_id,
            is_holiday: true,
            is_weekoff: false,
            is_within_leave_period: false,
            policy_type: 'before_leave_holiday',
            tenant_id: tenantId
          });
          checkDate = subDays(checkDate, 1);
          consecutiveDays++;
        } else {
          break;
        }
      }
    }

    // 3. Check for weekoffs BEFORE the leave period
    if (leaveType?.before_leave_week_off) {
      let checkDate = subDays(startDate, 1);
      let consecutiveDays = 0;
      const maxDaysToCheck = 7;

      while (consecutiveDays < maxDaysToCheck) {
        if (isWeekoff(checkDate)) {
          approvalRecords.push({
            leave_request_id: leaveRequest.id,
            employee_id: leaveRequest.employee_id,
            leave_date: format(checkDate, 'yyyy-MM-dd'),
            leave_type_id: leaveRequest.leave_type_id,
            is_holiday: false,
            is_weekoff: true,
            is_within_leave_period: false,
            policy_type: 'before_leave_week_off',
            tenant_id: tenantId
          });
          checkDate = subDays(checkDate, 1);
          consecutiveDays++;
        } else {
          break;
        }
      }
    }

    // 4. Check for holidays AFTER the leave period
    if (leaveType?.after_leave_holiday) {
      let checkDate = addDays(endDate, 1);
      let consecutiveDays = 0;
      const maxDaysToCheck = 7;

      while (consecutiveDays < maxDaysToCheck) {
        if (isHoliday(checkDate)) {
          approvalRecords.push({
            leave_request_id: leaveRequest.id,
            employee_id: leaveRequest.employee_id,
            leave_date: format(checkDate, 'yyyy-MM-dd'),
            leave_type_id: leaveRequest.leave_type_id,
            is_holiday: true,
            is_weekoff: false,
            is_within_leave_period: false,
            policy_type: 'after_leave_holiday',
            tenant_id: tenantId
          });
          checkDate = addDays(checkDate, 1);
          consecutiveDays++;
        } else {
          break;
        }
      }
    }

    // 5. Check for weekoffs AFTER the leave period
    if (leaveType?.after_leave_week_off) {
      let checkDate = addDays(endDate, 1);
      let consecutiveDays = 0;
      const maxDaysToCheck = 7;

      while (consecutiveDays < maxDaysToCheck) {
        if (isWeekoff(checkDate)) {
          approvalRecords.push({
            leave_request_id: leaveRequest.id,
            employee_id: leaveRequest.employee_id,
            leave_date: format(checkDate, 'yyyy-MM-dd'),
            leave_type_id: leaveRequest.leave_type_id,
            is_holiday: false,
            is_weekoff: true,
            is_within_leave_period: false,
            policy_type: 'after_leave_week_off',
            tenant_id: tenantId
          });
          checkDate = addDays(checkDate, 1);
          consecutiveDays++;
        } else {
          break;
        }
      }
    }

    // Calculate final total days, factoring in half-days
    let calculatedTotalDays = approvalRecords.length;

    // Check if the start date was included in the deductions
    const isStartIncluded = approvalRecords.some(r => r.leave_date === leaveRequest.start_date);
    if (leaveRequest.is_half_day_start && isStartIncluded) {
      calculatedTotalDays -= 0.5;
    }

    // Check if the end date was included in the deductions (and is a different day from start)
    const isEndIncluded = approvalRecords.some(r => r.leave_date === leaveRequest.end_date);
    if (leaveRequest.start_date !== leaveRequest.end_date && leaveRequest.is_half_day_end && isEndIncluded) {
      calculatedTotalDays -= 0.5;
    }

    calculatedTotalDays = Math.max(0, calculatedTotalDays);

    // Insert all approval records
    if (approvalRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('leave_approvals')
        .insert(approvalRecords);

      if (insertError) {
        console.error('Failed to insert leave approval records:', insertError);
        throw insertError;
      }

      // 6. Update the total_days field in leave_requests table with accurate half-day tracking
      const { error: updateError } = await supabase
        .from('leave_requests')
        .update({ total_days: calculatedTotalDays })
        .eq('id', leaveRequestId)
        .eq('tenant_id', tenantId);

      if (updateError) {
        console.error('Failed to update total_days in leave_requests:', updateError);
        throw updateError;
      }

      // NOTE: used_days is updated automatically by the DB trigger `update_leave_balance`
      // when leave_requests.status changes to 'Approved'. Do NOT update it here too —
      // that would cause double-deduction (the old bug: 2 days leave → 4 days used).
    }

  } catch (error) {
    console.error('Error processing leave approval:', error);
    throw error;
  }
}

/**
 * Deletes leave approval records and restores the leave balance when a leave is revoked/cancelled
 * @param leaveRequestId - The ID of the leave request being revoked
 */
export async function revokeLeaveApproval(leaveRequestId: string): Promise<void> {
  try {
    const tenantId = await getTenantId();

    // 1. Fetch the leave request to know how many days to restore to the balance
    const { data: leaveRequest, error: fetchError } = await supabase
      .from('leave_requests')
      .select('employee_id, leave_type_id, start_date, total_days')
      .eq('id', leaveRequestId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !leaveRequest) {
      console.error('Failed to fetch leave request for revocation:', fetchError);
      throw fetchError || new Error("Leave request not found");
    }

    // 2. Delete all leave approval records
    const { error } = await supabase
      .from('leave_approvals')
      .delete()
      .eq('leave_request_id', leaveRequestId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Failed to delete leave approval records:', error);
      throw error;
    }

    // 3. Restore the Leave Balance (Subtract from used_days)
    if (leaveRequest.total_days > 0) {
      const year = parseISO(leaveRequest.start_date).getFullYear();
      const { data: balanceData } = await supabase
        .from('leave_balances')
        .select('id, used_days')
        .eq('employee_id', leaveRequest.employee_id)
        .eq('leave_type_id', leaveRequest.leave_type_id)
        .eq('year', year)
        .eq('tenant_id', tenantId)
        .single();

      if (balanceData) {
        // Math.max prevents negative balances in case of mismatched data
        const restoredUsedDays = Math.max(0, balanceData.used_days - leaveRequest.total_days);

        await supabase
          .from('leave_balances')
          .update({ used_days: restoredUsedDays })
          .eq('id', balanceData.id);
      }
    }

    // 4. Reset the total_days field in leave_requests table
    const { error: updateError } = await supabase
      .from('leave_requests')
      .update({ total_days: 0 })
      .eq('id', leaveRequestId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Failed to reset total_days in leave_requests:', updateError);
      throw updateError;
    }

  } catch (error) {
    console.error('Error revoking leave approval:', error);
    throw error;
  }
}