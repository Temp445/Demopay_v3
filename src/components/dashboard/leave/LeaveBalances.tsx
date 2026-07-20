import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Calendar, AlertCircle, Banknote, CheckCircle, XCircle, RefreshCw, ArrowRight, TrendingUp, RotateCcw } from 'lucide-react';
import { useLeaveStore, type LeaveBalance, type LeaveType } from '../../../stores/leaveStore';
import { useAuth } from '../../../contexts/AuthContext';

interface LeaveBalancesProps {
  employeeId: string;
  lastRefresh: number;
  year?: number;
}

interface EncashState {
  leaveTypeId: string;
  balanceId: string;
  encashableDays: number;
  loading: boolean;
  confirming: boolean;
  success: boolean;
  error: string | null;
}

const CREDIT_POLICY_STYLES: Record<string, string> = {
  earned: 'bg-blue-100 text-blue-800',
  fixed: 'bg-indigo-100 text-indigo-800',
};

const CF_POLICY_STYLES: Record<string, string> = {
  carry_forward: 'bg-green-100 text-green-800',
  elapsed: 'bg-orange-100 text-orange-800',
};

export default function LeaveBalances({ employeeId, lastRefresh, year }: LeaveBalancesProps) {
  const { user } = useAuth();
  const {
    leaveTypes,
    leaveBalances,
    fetchLeaveBalances,
    fetchLeaveTypes,
    // applyLeaveCredit,
    // applyCarryForward,
    applyEncashment,
    syncLeaveBalances,
  } = useLeaveStore();

  const balances = leaveBalances.items || [];
  const loading = leaveBalances.loading;
  const error = leaveBalances.error;

  const currentYear = year || new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // ── Processing guards (refs so they never cause re-renders) ───────────────
  // Key: "employeeId:year:lastRefresh" — reset automatically when any changes
  const processedKeyRef = useRef<string>('');
  const processingInFlightRef = useRef<boolean>(false);

  const [encashStates, setEncashStates] = useState<Record<string, EncashState>>({});
  const [processingMsg, setProcessingMsg] = useState<string | null>(null);

  const leaveTypeMap = new Map<string, LeaveType>(
    (leaveTypes.items || []).map(lt => [lt.id, lt])
  );

  // ── Step 1: Fetch balances whenever employee/year/refresh changes ─────────
  useEffect(() => {
    if (!user || !employeeId) return;
    fetchLeaveBalances(employeeId, currentYear);
    fetchLeaveTypes();
  }, [user, employeeId, currentYear, lastRefresh, fetchLeaveBalances, fetchLeaveTypes]);

  // ── Step 2: Run policy processing ONCE per employee+year+refresh ──────────
  //    Uses refs (NOT state) so it can't create render loops.
  useEffect(() => {
    if (!employeeId || balances.length === 0 || leaveTypeMap.size === 0) return;

    const processKey = `${employeeId}:${currentYear}:${lastRefresh}`;

    // Already processed for this exact key, or currently in flight — skip
    if (processedKeyRef.current === processKey || processingInFlightRef.current) return;

    // Mark as in-flight immediately (synchronously, before any await)
    processingInFlightRef.current = true;
    processedKeyRef.current = processKey;

    runPolicyProcessing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances.length, leaveTypeMap.size, employeeId, currentYear, lastRefresh]);

  // const runPolicyProcessing = useCallback(async () => {
  //   let creditedCount = 0;
  //   let carriedCount = 0;

  //   try {
  //     for (const balance of balances) {
  //       const lt = leaveTypeMap.get(balance.leave_type_id);
  //       if (!lt) continue;

  //       try {



  //         // ── Leave Credit (catch-up: Jan → current month) ───────────────
  //         // Yearly: credit once per year (month=0)
  //         // Monthly/Earned: loop every month Jan→now to catch missed past months
  //         // Already-processed months return 0 safely (DB unique constraint)
  //         if (lt.credit_policy_type === 'fixed' && lt.fixed_credit_frequency === 'yearly') {
  //           const credited = await applyLeaveCredit(employeeId, lt.id, currentYear, 0);
  //           if (credited > 0) creditedCount++;
  //         } else if (lt.credit_policy_type === 'fixed' || lt.credit_policy_type === 'earned') {
  //           for (let m = 1; m <= currentMonth; m++) {
  //             const credited = await applyLeaveCredit(employeeId, lt.id, currentYear, m);
  //             if (credited > 0) creditedCount++;
  //           }
  //         }

  //         // ── Carry Forward (only if current year balance is 0 on load) ─
  //         if (Number(balance.total_days) === 0 && currentYear > 2024) {
  //           const carried = await applyCarryForward(employeeId, lt.id, currentYear - 1, currentYear);
  //           if (carried > 0) carriedCount++;
  //         }
  //       } catch {
  //         // Per-leave-type errors are non-fatal — continue to next
  //       }
  //     }

  //     if (creditedCount > 0 || carriedCount > 0) {
  //       await fetchLeaveBalances(employeeId, currentYear);
  //       const parts: string[] = [];
  //       if (creditedCount > 0) parts.push(`${creditedCount} leave type(s) credited`);
  //       if (carriedCount > 0) parts.push(`${carriedCount} type(s) carried forward`);
  //       setProcessingMsg(parts.join(' · '));
  //       setTimeout(() => setProcessingMsg(null), 5000);
  //     }
  //   } finally {
  //     // Always release the in-flight lock
  //     processingInFlightRef.current = false;
  //   }
  // }, [
  //   balances, leaveTypeMap, employeeId, currentYear, currentMonth,
  //   applyLeaveCredit, applyCarryForward, fetchLeaveBalances,
  // ]);
	
  const runPolicyProcessing = useCallback(async () => {
    try {
      // Trigger the single idempotent backend sync function
      await syncLeaveBalances(employeeId, currentYear);

      // Refresh balances from DB
      await fetchLeaveBalances(employeeId, currentYear);
      
      setProcessingMsg('Balances synchronized');
      setTimeout(() => setProcessingMsg(null), 3000);
    } catch (e) {
      console.error('Leave sync failed:', e);
    } finally {
      // Always release the in-flight lock
      processingInFlightRef.current = false;
    }
  }, [employeeId, currentYear, syncLeaveBalances, fetchLeaveBalances]);


  // ── Encashment handlers ───────────────────────────────────────────────────

  const handlePreviewEncash = useCallback(async (balance: LeaveBalance) => {
    const lt = leaveTypeMap.get(balance.leave_type_id);
    if (!lt?.encashment_applicable) return;

    setEncashStates(prev => ({
      ...prev,
      [balance.leave_type_id]: {
        leaveTypeId: balance.leave_type_id,
        balanceId: balance.id,
        encashableDays: 0,
        loading: true,
        confirming: false,
        success: false,
        error: null,
      },
    }));

    try {
      const encashMonth = lt.encashment_frequency === 'monthly' ? currentMonth : 0;
      const days = await applyEncashment(employeeId, balance.leave_type_id, currentYear, encashMonth, true);
      setEncashStates(prev => ({
        ...prev,
        [balance.leave_type_id]: {
          ...prev[balance.leave_type_id],
          encashableDays: days,
          loading: false,
          confirming: days > 0,
          error: days === 0 ? 'No days eligible for encashment in the current period.' : null,
        },
      }));
    } catch (err) {
      setEncashStates(prev => ({
        ...prev,
        [balance.leave_type_id]: {
          ...prev[balance.leave_type_id],
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to preview encashment',
        },
      }));
    }
  }, [leaveTypeMap, applyEncashment, employeeId, currentYear, currentMonth]);

  const handleConfirmEncash = useCallback(async (balance: LeaveBalance) => {
    const lt = leaveTypeMap.get(balance.leave_type_id);
    if (!lt) return;

    setEncashStates(prev => ({
      ...prev,
      [balance.leave_type_id]: { ...prev[balance.leave_type_id], loading: true, error: null },
    }));

    try {
      const encashMonth = lt.encashment_frequency === 'monthly' ? currentMonth : 0;
      const days = await applyEncashment(employeeId, balance.leave_type_id, currentYear, encashMonth, false);
      setEncashStates(prev => ({
        ...prev,
        [balance.leave_type_id]: {
          ...prev[balance.leave_type_id],
          loading: false, confirming: false, success: true, encashableDays: days,
        },
      }));
      await fetchLeaveBalances(employeeId, currentYear);
    } catch (err) {
      setEncashStates(prev => ({
        ...prev,
        [balance.leave_type_id]: {
          ...prev[balance.leave_type_id],
          loading: false,
          error: err instanceof Error ? err.message : 'Encashment failed',
        },
      }));
    }
  }, [leaveTypeMap, applyEncashment, fetchLeaveBalances, employeeId, currentYear, currentMonth]);

  const handleCancelEncash = (leaveTypeId: string) => {
    setEncashStates(prev => { const next = { ...prev }; delete next[leaveTypeId]; return next; });
  };

  // Filter out LOP (Loss of Pay) so it doesn't display in the UI cards
  const displayBalances = balances.filter((balance) => {
    const typeName = (balance as any).leave_type?.name || balance.leave_types?.name || 'Leave';
    const normalizedName = typeName.toLowerCase();
    // Exclude both 'lop' and 'loss of pay' just to be safe
    return normalizedName !== 'lop' && normalizedName !== 'loss of pay';
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 shadow animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
            <div className="h-8 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
        <h3 className="text-sm font-medium text-red-800">{error}</h3>
      </div>
    );
  }

    if (displayBalances.length === 0) {
    return <div className="text-gray-500 text-center py-10">No leave balances found</div>;
  }

  return (
    <div className="space-y-4">
      {/* Auto-processing notification */}
      {processingMsg && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
          <RefreshCw className="h-4 w-4" />
          <span>Auto-processed: <strong>{processingMsg}</strong></span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {displayBalances.map((balance) => {
          const lt = leaveTypeMap.get(balance.leave_type_id);
          const remaining = Number(balance.total_days) - Number(balance.used_days ?? 0);
          const pctUsed = balance.total_days > 0
            ? Math.min(100, (Number(balance.used_days ?? 0) / Number(balance.total_days)) * 100)
            : 0;
          const encState = encashStates[balance.leave_type_id];
          const canEncash = lt?.encashment_applicable && remaining > 0 && !encState?.success;
          const typeName = (balance as any).leave_type?.name || balance.leave_types?.name || 'Leave';

          return (
            <div key={balance.id} className="relative bg-white rounded-lg overflow-hidden shadow border border-gray-100">
              {/* Header */}
              <div className="bg-indigo-500 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-white" />
                  <span className="text-sm font-semibold text-white truncate max-w-[160px]">{typeName}</span>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {lt?.credit_policy_type && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CREDIT_POLICY_STYLES[lt.credit_policy_type]}`}>
                      {lt.credit_policy_type === 'earned' ? '📈 Earned' : '📅 Fixed'}
                    </span>
                  )}
                  {lt?.carry_forward_type && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CF_POLICY_STYLES[lt.carry_forward_type]}`}>
                      {lt.carry_forward_type === 'carry_forward' ? '↗ CF' : '⏳ Elapsed'}
                    </span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-baseline gap-1 mb-1">
                  <p className="text-3xl font-bold text-gray-900">{remaining}</p>
                  <p className="text-sm text-gray-500">/ {balance.total_days} days</p>
                </div>
                <p className="text-xs text-gray-400 mb-2">Used: {balance.used_days ?? 0} days</p>

                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                  <div
                    className={`h-1.5 rounded-full transition-all ${pctUsed >= 80 ? 'bg-red-400' : pctUsed >= 50 ? 'bg-yellow-400' : 'bg-indigo-400'}`}
                    style={{ width: `${pctUsed}%` }}
                  />
                </div>

                {lt?.credit_policy_type === 'earned' && (
                  <div className="flex items-center gap-1 text-xs text-blue-600 mb-1">
                    <TrendingUp className="h-3 w-3" />
                    <span>Every {lt.earned_days_to_work} worked days → {lt.earned_days_credited} day(s)</span>
                  </div>
                )}
                {lt?.credit_policy_type === 'fixed' && (
                  <div className="flex items-center gap-1 text-xs text-indigo-600 mb-1">
                    <ArrowRight className="h-3 w-3" />
                    <span>{lt.default_days} days / {lt.fixed_credit_frequency}</span>
                  </div>
                )}
                {lt?.carry_forward_type === 'carry_forward' && (
                  <div className="flex items-center gap-1 text-xs text-green-600 mb-1">
                    <RotateCcw className="h-3 w-3" />
                    <span>
                      Carry upto {(lt.carry_forward_max_limit ?? 0) > 0 ? `${lt.carry_forward_max_limit} days` : 'all unused'}
                      {lt.carry_forward_frequency ? ` (${lt.carry_forward_frequency})` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Encashment zone */}
              {lt?.encashment_applicable && (
                <div className="px-4 pb-3 border-t border-gray-100 mt-1 pt-2">
                  {encState?.success && (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>{encState.encashableDays} day(s) encashed successfully!</span>
                    </div>
                  )}
                  {encState?.error && !encState.confirming && (
                    <div className="flex items-start gap-1 text-xs text-red-600">
                      <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{encState.error}</span>
                    </div>
                  )}
                  {encState?.confirming && !encState.success && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-700">
                        <strong>{encState.encashableDays} day(s)</strong> eligible for encashment
                        {(lt.encashment_min_limit ?? 0) > 0 && ` (min balance: ${lt.encashment_min_limit} days kept)`}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmEncash(balance)}
                          disabled={encState.loading}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {encState.loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                          Confirm Encash
                        </button>
                        <button
                          onClick={() => handleCancelEncash(balance.leave_type_id)}
                          disabled={encState.loading}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <XCircle className="h-3 w-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {canEncash && !encState && (
                    <button
                      onClick={() => handlePreviewEncash(balance)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                    >
                      <Banknote className="h-3.5 w-3.5" />
                      Encash Leaves
                      {lt.encashment_frequency && <span className="text-purple-400">({lt.encashment_frequency})</span>}
                    </button>
                  )}
                  {encState?.loading && !encState.confirming && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Checking eligibility...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
