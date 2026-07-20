import { supabase } from './supabase';

type ShiftInfo = {
  start_time: string;
  end_time: string;
};

/* ---------------- HELPERS ---------------- */

const getMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const diffMinutes = (a: Date, b: Date) =>
  Math.floor((b.getTime() - a.getTime()) / 60000);

/* ---------------- MAIN SYNC ---------------- */

export const syncAttendanceLog = async (employeeId: string) => {
  const today = new Date().toISOString().split('T')[0];

  /* 1️⃣ Fetch today timestamps */
  const { data: timestamps } = await supabase
    .from('attendance_timestamp')
    .select('entry, timestamp, shift_id')
    .eq('employee_id', employeeId)
    .gte('timestamp', today)
    .order('timestamp', { ascending: true });

  if (!timestamps || timestamps.length === 0) return;

  const firstIn = timestamps.find(t => t.entry === 'IN')?.timestamp ?? null;
  const lastOut = [...timestamps].reverse().find(t => t.entry === 'OUT')?.timestamp ?? null;

  if (!firstIn) return;

  /* 2️⃣ Get shift info (if any) */
  let shift: ShiftInfo | null = null;

  const shiftId = timestamps.find(t => t.shift_id)?.shift_id;

  if (shiftId) {
    const { data } = await supabase
      .from('shifts')
      .select('start_time, end_time')
      .eq('id', shiftId)
      .maybeSingle();

    shift = data ?? null;
  }

  /* 3️⃣ Calculate STATUS */
  let status: 'Present' | 'Late' | 'Half Day' = 'Present';

  if (shift && lastOut) {
    const inTime = new Date(firstIn);
    const outTime = new Date(lastOut);

    const shiftStart = getMinutes(shift.start_time);
    const shiftEnd = getMinutes(shift.end_time);
    const shiftDuration = shiftEnd - shiftStart;

    const workedMinutes = diffMinutes(inTime, outTime);

    const inMinutes = inTime.getHours() * 60 + inTime.getMinutes();

    if (inMinutes > shiftStart + 10) status = 'Late';
    if (workedMinutes < shiftDuration / 2) status = 'Half Day';
  }

  /* 4️⃣ Check if log exists */
  const { data: log } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('date', today)
    .maybeSingle();

  /* 5️⃣ CREATE on FIRST IN */
  if (!log) {
    await supabase.from('attendance_logs').insert({
      employee_id: employeeId,
      date: today,
      clock_in: firstIn,
      status,
      created_by: employeeId,
      verification_method: 'face recognition',
    });
    return;
  }

  /* 6️⃣ UPDATE on OUT */
  await supabase
    .from('attendance_logs')
    .update({
      clock_out: lastOut,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', log.id);
};
