import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export type WeekOccurrence = 'first' | 'second' | 'third' | 'fourth' | 'last' | '';
export type WeekDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

export interface WeekDayPattern {
  weekDay: WeekDay;
  weekOccurrence: WeekOccurrence;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  holiday_type: 'public' | 'company';
  description: string | null;
  is_recurring: boolean;
  created_by: string | null;
  created_at: string;
  recurring_patterns?: WeekDayPattern[] | [];
}


export async function getHolidays(startDate: string, endDate: string): Promise<Holiday[]> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase.rpc('get_holidays', {
    p_end_date: endDate,
    p_start_date: startDate,
    p_tenant_id:tenantId    
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getRecurringHolidays(year: number): Promise<Holiday[]> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase.rpc('get_recurring_holidays', {
    p_year: year,
    p_tenant_id:tenantId    
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createHoliday(holiday: Omit<Holiday, 'id' | 'created_at'>) {
  if (holiday.date === '') {
    holiday.date = new Date().toISOString().split('T')[0];
  }

  holiday.recurring_patterns = holiday.recurring_patterns?.filter((pattern) => pattern.weekOccurrence !== '');

  const tenantId = await getTenantId();
  const { data, error } = await supabase.rpc('insert_holiday_with_recurring', { holiday_data: holiday, p_tenant_id:tenantId });

  // const { data, error } = await supabase
  //   .from('holidays')
  //   .insert([holiday])
  //   .select()
  //   .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateHoliday(
  id: string,
  updates: Partial<Omit<Holiday, 'id' | 'created_at' | 'created_by_name'>>
) {
  const tenantId = await getTenantId();
  updates.recurring_patterns = updates.recurring_patterns?.filter((pattern) => pattern.weekOccurrence !== '');
  const { data, error } = await supabase.rpc('update_holiday_with_recurring', 
    {p_holiday_id: id, 
      p_holiday_data: updates,
      p_tenant_id:tenantId

    });

  // const { data, error } = await supabase
  //   .from('holidays')
  //   .update(updates)
  //   .eq('id', id)
  //   .select()
  //   .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteHoliday(id: string) {
  const tenantId = await getTenantId();
  const { error } = await supabase
    .from('holidays')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(error.message);
  }
}