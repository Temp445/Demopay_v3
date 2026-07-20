import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FlaskConical, ChevronDown, ChevronUp, RotateCcw, AlertTriangle, 
  CheckCircle, TrendingUp, Calendar, Calculator, Plus, TrendingDown, 
  Minus, Code, Info, Loader2, IndianRupee, Database, GitBranch, 
  FileSpreadsheet, FileText, Download 
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getTenantId } from '../../../lib/tenantDb';
import { validateAuth } from '../../../stores/utils/storeUtils';
import { useSalaryStructuresStore } from '../../../stores/salaryStructuresStore';
import type { SalaryStructureComponent } from '../../../stores/salaryStructuresStore';
import { FormulaEngine } from '../../../lib/formula-engine';
import { runFormulaTesterEngine, type SampleInputs, type StepDetail } from '../../../lib/formulaTesterEngine';
import { getEmployeeAdvanceDeductions } from '../../../lib/advancePayrollIntegration';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const DEFAULT_INPUTS: SampleInputs = {
  calendarDays: 31, workingDays: 26, weekOffDays: 5, paidHolidays: 0,
  presentDays: 26, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0,
  leaveDays: 0, payableDays: 31,
  pfApplicable: false, esiApplicable: false,
  statutoryEnabled: {},
  otHours: 0, otAmount: 0, advanceDeduction: 0,
  componentValues: {},
};

/** Format a Date to YYYY-MM-DD using LOCAL time (avoids UTC timezone shift) */
const fmtLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const getDefaultPeriod = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: fmtLocal(start),
    end: fmtLocal(end),
    calendarDays: end.getDate(),
  };
};

/** Return days in the month of a YYYY-MM-DD string */
const daysInMonthOf = (dateStr: string): number => {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** Count number of Sundays between two dates inclusive */
const getSundays = (start: string, end: string): string[] => {
  const sundays: string[] = [];
  const cur = new Date(start);
  const finish = new Date(end);
  while (cur <= finish) {
    if (cur.getDay() === 0) sundays.push(fmtLocal(new Date(cur)));
    cur.setDate(cur.getDate() + 1);
  }
  return sundays;
};

/** Format a date string or date object to "D MMM" for UI display */
const fmtDateUI = (dateInput: string | Date): string => {
  const d = typeof dateInput === 'string' ? new Date(dateInput + 'T00:00:00') : dateInput;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Calculate days between two dates inclusive */
const diffDays = (start: string, end: string): number => {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
};

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function NumberInput({ label, value, onChange, min = 0, step = 1, badge, error, disabled }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; badge?: React.ReactNode; error?: boolean; disabled?: boolean;
}) {
  const [raw, setRaw] = React.useState(String(value));
  React.useEffect(() => { setRaw(String(value)); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    setRaw(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) onChange(parsed);
    else if (e.target.value === '' || e.target.value === '-') onChange(0);
  };

  const handleBlur = () => {
    if (disabled) return;
    const parsed = parseFloat(raw);
    const final = isNaN(parsed) ? 0 : parsed;
    setRaw(String(final));
    onChange(final);
  };

  return (
    <div className={`flex flex-col gap-1 ${disabled ? 'opacity-70' : ''}`}>
      <div className="flex items-center justify-between">
        <label className={`text-xs font-medium ${error ? 'text-red-500' : 'text-gray-500'}`}>{label}</label>
        {badge}
      </div>
      <input
        type="number" min={min} step={step} value={raw}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 transition-all shadow-sm ${
          disabled 
            ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed' 
            : error
              ? 'bg-white border-red-400 text-red-700 focus:border-red-500 focus:ring-red-300'
              : 'bg-white border-gray-200 text-gray-800 focus:border-indigo-400 focus:ring-indigo-300'
          }`}
      />
    </div>
  );
}

function RoundingTypeSelector({ value, onChange, disabled }: { value?: string; onChange: (v: any) => void; disabled?: boolean }) {
  return (
    <select
      value={value || 'none'}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`text-[10px] border font-bold focus:ring-0 transition-colors px-1.5 py-0.5 h-auto w-auto uppercase tracking-tighter rounded ${
        disabled 
          ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed opacity-60' 
          : 'bg-indigo-50 border-indigo-100 text-indigo-600 cursor-pointer hover:bg-indigo-100'
      }`}
    >
      <option value="none">None</option>
      <option value="round">Standard</option>
      <option value="floor">Round Down</option>
      <option value="ceil">Round Up</option>
      {/* <option value="decimal2">2-Dec</option> */}
    </select>
  );
}

function ToggleInput({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-xs text-gray-600 font-medium">{label}</span>
      <button
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${value ? 'bg-indigo-500' : 'bg-gray-300'} ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
/**
 * Renders a visual tree diagram of the formula execution
 */
function FormulaVisualTree({ ast, ctx }: { ast: any; ctx: any }) {
  if (!ast) return null;

  const fmtVal = (v: any) => {
    if (typeof v === 'number') return v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  };

  const getResult = (node: any) => {
    const res = FormulaEngine.executeAST(node, ctx);
    return res.success ? res.value : 0;
  };

  const getDesc = (node: any): string => {
    if (node.type === 'VARIABLE') return String(node.value);
    if (node.type === 'NUMBER') return fmtVal(node.value);
    if (node.type === 'BINARY_OP') return `${getDesc(node.left)} ${node.operator} ${getDesc(node.right)}`;
    if (node.type === 'CONDITIONAL') return `IF (...)`;
    return '';
  };

  const isConditional = ast.type === 'CONDITIONAL';

  // Simplified layout for IF-THEN-ELSE
  if (isConditional) {
    const conditionRes = getResult(ast.condition);
    const finalRes = getResult(ast);
    const isTrue = !!conditionRes;

    return (
      <div className="mt-6 overflow-x-hidden">
        <div className="w-full max-w-[1000px] mx-auto flex flex-col items-center">
          <svg 
            width="100%" 
            height="450" 
            viewBox="0 0 1000 450" 
            preserveAspectRatio="xMidYMid meet"
            className="drop-shadow-sm"
          >
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#92400e" />
              </marker>
            </defs>

            {/* Level 1: Root */}
            <rect x="400" y="20" width="200" height="45" rx="8" fill="#4338ca" />
            <text x="500" y="42" textAnchor="middle" className="text-[12px] font-bold fill-white">IF – THEN – ELSE</text>
            <text x="500" y="55" textAnchor="middle" className="text-[9px] fill-indigo-100">Conditional expression</text>

            {/* Level 2 Connectors */}
            <line x1="500" y1="65" x2="175" y2="130" stroke="#e2e8f0" strokeWidth="1.5" />
            <text x="320" y="105" textAnchor="middle" className="text-[10px] font-bold fill-red-600">CONDITION</text>
            
            <line x1="500" y1="65" x2="500" y2="130" stroke="#e2e8f0" strokeWidth="1.5" />
            <text x="500" y="105" textAnchor="middle" className="text-[10px] font-bold fill-emerald-600">THEN (if true)</text>
            
            <line x1="500" y1="65" x2="825" y2="130" stroke="#e2e8f0" strokeWidth="1.5" />
            <text x="680" y="105" textAnchor="middle" className="text-[10px] font-bold fill-amber-600">ELSE (if false)</text>

            {/* Level 2: Condition */}
            <rect x="25" y="130" width="300" height="45" rx="8" fill="#991b1b" />
            <text x="175" y="152" textAnchor="middle" className="text-[10px] font-bold fill-white">{getDesc(ast.condition)}</text>
            <text x="175" y="165" textAnchor="middle" className="text-[10px] font-bold fill-red-100">Comparison ({fmtVal(conditionRes)})</text>

            {/* Level 2: THEN */}
            <rect x="350" y="130" width="300" height="45" rx="8" fill="#065f46" />
            <text x="500" y="152" textAnchor="middle" className="text-[10px] font-bold fill-white">{getDesc(ast.trueBranch)}</text>
            <text x="500" y="165" textAnchor="middle" className="text-[9px] fill-emerald-100">{ast.trueBranch.type === 'BINARY_OP' ? 'Expression' : 'Value'}</text>

            {/* Level 2: ELSE */}
            <rect x="675" y="130" width="300" height="45" rx="8" fill="#92400e" />
            <text x="825" y="152" textAnchor="middle" className="text-[10px] font-bold fill-white">{getDesc(ast.falseBranch)}</text>
            {/* <text x="825" y="165" textAnchor="middle" className="text-[9px] fill-amber-100">result</text> */}

            {/* Level 3: Condition Children */}
            {ast.condition.type === 'BINARY_OP' && (
              <>
                <line x1="175" y1="175" x2="115" y2="230" stroke="#e2e8f0" />
                <text x="140" y="210" textAnchor="end" className="text-[9px] fill-gray-400">left</text>
                <rect x="65" y="230" width="100" height="30" rx="6" fill="#374151" />
                <text x="115" y="249" textAnchor="middle" className="text-[11px] font-bold fill-white">{fmtVal(getResult(ast.condition.left))}</text>

                <line x1="175" y1="175" x2="235" y2="230" stroke="#e2e8f0" />
                <text x="210" y="210" textAnchor="start" className="text-[9px] fill-gray-400">right</text>
                <rect x="185" y="230" width="100" height="30" rx="6" fill="#374151" />
                <text x="235" y="249" textAnchor="middle" className="text-[11px] font-bold fill-white">{fmtVal(getResult(ast.condition.right))}</text>
              </>
            )}

            {/* Level 3: THEN Children */}
            {ast.trueBranch.type === 'BINARY_OP' && (
              <>
                <line x1="500" y1="175" x2="415" y2="230" stroke="#e2e8f0" />
                <text x="450" y="210" textAnchor="end" className="text-[9px] fill-gray-400">left</text>
                <rect x="330" y="230" width="170" height="35" rx="6" fill="#065f46" opacity="0.8" />
                <text x="415" y="252" textAnchor="middle" className="text-[9px] font-bold fill-white">{getDesc(ast.trueBranch.left)} ➜ {fmtVal(getResult(ast.trueBranch.left))}</text>

                <line x1="500" y1="175" x2="585" y2="230" stroke="#e2e8f0" />
                <text x="550" y="210" textAnchor="start" className="text-[9px] fill-gray-400">right</text>
                <rect x="500" y="230" width="170" height="35" rx="6" fill="#374151" />
                <text x="585" y="252" textAnchor="middle" className="text-[9px] font-bold fill-white">{getDesc(ast.trueBranch.right)} ➜ {fmtVal(getResult(ast.trueBranch.right))}</text>
              </>
            )}

            {/* Final Result Node */}
            <rect x="400" y="400" width="200" height="55" rx="10" fill="#78350f" />
            <text x="500" y="425" textAnchor="middle" className="text-[14px] font-bold fill-amber-100">Result = {fmtVal(finalRes)}</text>
            <text x="500" y="442" textAnchor="middle" className="text-[9px] fill-amber-200">
              {isTrue ? 'THEN' : 'ELSE'} branch taken (condition is {fmtVal(isTrue)})
            </text>

            {/* Path Arrow */}
            {isTrue ? (
              <path d="M 500 175 Q 500 400 500 395" fill="none" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arrowhead)" strokeDasharray="4" />
            ) : (
              <path d="M 825 175 Q 825 425 605 425" fill="none" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arrowhead)" strokeDasharray="4" />
            )}
          </svg>
        </div>
      </div>
    );
  }

  // Fallback for non-conditional expressions
  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 flex flex-col items-center">
      <GitBranch className="w-8 h-8 text-gray-300 mb-2" />
      <p className="text-[10px] text-gray-400 font-bold uppercase">Basic Expression Tree Not Rendered</p>
      <p className="text-[11px] text-gray-500 mt-1">Diagram visualization is optimized for IF-THEN-ELSE logic.</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest mb-2 mt-5 first:mt-0 border-b border-indigo-100 pb-1">{children}</p>;
}

function MetricRow({ label, value, isCurrency }: { label: string; value: number; isCurrency?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 bg-gray-50/50 rounded-lg border border-gray-100 transition-colors hover:bg-indigo-50/30 hover:border-indigo-100">
      <span className="text-[11px] text-gray-500 font-medium">{label}</span>
      <span className="text-xs font-bold text-gray-900 font-mono">
        {isCurrency ? `₹${fmt(value)}` : fmtDay(value)}
      </span>
    </div>
  );
}

function StepCard({ step, index, isExpanded }: { step: StepDetail; index: number; isExpanded: boolean }) {
  const [open, setOpen] = useState(isExpanded);

  useEffect(() => {
    setOpen(isExpanded);
  }, [isExpanded]);
  const isError = !!step.error;
  const isEarning = step.componentType === 'earning';

  const typeColor = step.calculationType === 'expression'
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : step.calculationType === 'percentage'
      ? 'bg-blue-50 text-blue-600 border-blue-200'
      : 'bg-gray-100 text-gray-600 border-gray-200';

  return (
    <div className={`rounded-xl border transition-all duration-200 ${isError ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'} overflow-hidden shadow-sm`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs text-gray-400 w-5 shrink-0 font-mono">{index + 1}</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${isError ? 'bg-amber-400' : isEarning ? 'bg-emerald-500' : 'bg-red-400'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{step.componentName}</p>
          {!open && step.formulaText && (
            <p className="text-[10px] text-gray-400 truncate font-mono mt-0.5 opacity-70">
              {step.formulaText}
            </p>
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${typeColor}`}>{step.calculationType}</span>
        {isError
          ? <span className="text-xs text-amber-600 font-semibold">Error</span>
          : <span className={`text-sm font-bold ${isEarning ? 'text-emerald-600' : 'text-red-500'}`}>
            {isEarning ? '+' : '-'}₹{fmt(step.finalValue)}
          </span>
        }
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4 bg-white/50">
          {isError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span className="text-xs text-red-700 font-medium">{step.error}</span>
            </div>
          )}

          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Code className="w-3 h-3" /> Complete Formula
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 font-mono text-xs text-indigo-300 break-words shadow-lg leading-relaxed">
              {step.formulaText || '—'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {step.calculationBreakdown && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" /> Calculation Trace
                </p>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 font-mono text-[11px] text-emerald-700 leading-relaxed shadow-sm whitespace-pre-wrap">
                  {step.calculationBreakdown}
                </div>
              </div>
            )}

            {Object.keys(step.resolvedVariables).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-3 h-3" /> Resolved Variables
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(step.resolvedVariables).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-sm transition-all hover:border-indigo-200 hover:bg-indigo-50 group">
                      <span className="text-[10px] text-gray-500 font-medium group-hover:text-indigo-500">{k}</span>
                      <span className="text-gray-300 font-light">|</span>
                      <span className="text-xs font-bold text-gray-900 font-mono">
                        {typeof v === 'boolean' ? (v ? 'YES' : 'NO') : fmtDay(v as number)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {step.calculationType === 'expression' && step.ast && (
            <div className="pt-6 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" /> Visual Logic Hierarchy
              </p>
              <FormulaVisualTree ast={step.ast} ctx={step.resolvedVariables} />
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-bold uppercase">Raw Value:</span>
              <span className="text-xs font-mono text-gray-600 font-bold">₹{fmt(step.rawValue)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-bold uppercase">Rounding:</span>
              <span className="text-xs text-indigo-600 font-bold px-2 py-0.5 bg-indigo-50 rounded-full border border-indigo-100">{step.roundingApplied}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FormulaTestPage() {
  const { items: structures, fetchSalaryStructures, fetchSalaryStructureDetails } = useSalaryStructuresStore();
  const defaults = getDefaultPeriod();

  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [structureComponents, setStructureComponents] = useState<SalaryStructureComponent[]>([]);
  const [calcComponentMap, setCalcComponentMap] = useState<Record<string, string>>({});
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [inputs, setInputs] = useState<SampleInputs>({
    ...DEFAULT_INPUTS,
    calendarDays: defaults.calendarDays,
  });
  const [result, setResult] = useState<ReturnType<typeof runFormulaTesterEngine> | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'earning' | 'deduction'>('all');
  const [expandAll, setExpandAll] = useState(false);
  const [detectedHolidays, setDetectedHolidays] = useState<Holiday[]>([]);
  const [detectedWeekOffs, setDetectedWeekOffs] = useState<string[]>([]);
  const [allPayrollComponents, setAllPayrollComponents] = useState<any[]>([]);
  const [showAddComponent, setShowAddComponent] = useState<'earning' | 'deduction' | null>(null);
  const [leftTab, setLeftTab] = useState<'inputs' | 'metrics'>('inputs');
  const [testerMode, setTesterMode] = useState<'sample' | 'employee'>('sample');
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [allowManualEdits, setAllowManualEdits] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [employeeStatutoryIds, setEmployeeStatutoryIds] = useState<Record<string, string>>({});
  const [sampleIds, setSampleIds] = useState<Record<string, string>>({});
  const [travelAllowanceComponentName, setTravelAllowanceComponentName] = useState('Travel Allowance');
  const debounceRef = useRef<any>(null);

  const fetchTravelAllowanceComponentName = async () => {
    try {
      const auth = await validateAuth();
      if (!auth.tenantId) return;

      const { data: locSettings } = await supabase
        .from('location_settings')
        .select('field_work_integration_enabled, field_work_component_id')
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      if (locSettings?.field_work_integration_enabled && locSettings?.field_work_component_id) {
        const { data: compData } = await supabase
          .from('payroll_components')
          .select('name')
          .eq('id', locSettings.field_work_component_id)
          .eq('tenant_id', auth.tenantId)
          .maybeSingle();

        if (compData?.name) {
          setTravelAllowanceComponentName(compData.name);
        }
      }
    } catch (err) {
      console.error('Error fetching travel allowance component name:', err);
    }
  };

  useEffect(() => {
    fetchSalaryStructures();
    loadCalcComponents();
    fetchAllComponents();
    fetchTravelAllowanceComponentName();
  }, []);

  useEffect(() => {
    if (selectedStructureId && testerMode === 'employee') {
      fetchEmployeesForStructure(selectedStructureId);
    } else {
      setEmployees([]);
      setSelectedEmployeeId('');
    }
  }, [selectedStructureId, testerMode]);

  useEffect(() => {
    if (selectedEmployeeId && testerMode === 'employee') {
      loadEmployeeValues(selectedEmployeeId, periodStart);
    }
  }, [selectedEmployeeId, testerMode, periodStart, periodEnd]);

  const fetchEmployeesForStructure = async (structureId: string) => {
    setLoadingEmployees(true);
    try {
      const auth = await validateAuth();
      if (!auth.tenantId) return;

      const { data, error } = await supabase.rpc('get_employees_by_structure', {
        p_tenant_id: auth.tenantId,
        p_salary_structure_id: structureId,
      });

      if (error) throw error;
      
      const emps = (data || []).map((item: any) => ({
        id: item.employee_id,
        name: item.employee_name,
        code: item.employee_code
      }));
      setEmployees(emps);
    } catch (err) {
      console.error('Error fetching employees:', err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const loadEmployeeValues = async (employeeId: string, startDate: string) => {
    try {
      const auth = await validateAuth();
      if (!auth.tenantId) return;

      // 1. Load static individual component values
      const { data, error } = await supabase
        .from('employee_salary_structure_assignments')
        .select('individual_component_values')
        .eq('employee_id', employeeId)
        .eq('salary_structure_id', selectedStructureId)
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      if (error) throw error;
      
      const componentValues: Record<string, number> = {};
      const statutoryEnabled: Record<string, boolean> = {};

      if (data?.individual_component_values) {
        const individualValues = data.individual_component_values as Record<string, number>;
        structureComponents.forEach(comp => {
          if (comp.id && individualValues[comp.id] !== undefined) {
            componentValues[comp.name] = individualValues[comp.id];
          }
        });
      }

      // 2. Fetch Statutory IDs for the employee
      const { data: idRecord } = await supabase
        .from('employee_statutory_ids')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      const idMap: Record<string, string> = {};
      if (idRecord) {
        if (idRecord.pf_number) idMap['provident_fund'] = idRecord.pf_number;
        if (idRecord.esi_number) idMap['employee_state_insurance'] = idRecord.esi_number;
        if (idRecord.professional_tax_id) idMap['professional_tax'] = idRecord.professional_tax_id;
        if (idRecord.tds_id) idMap['tax_deducted_at_source'] = idRecord.tds_id;
      }
      setEmployeeStatutoryIds(idMap);
      setSampleIds({}); // Reset sample IDs on employee change

      // 3. Fetch Statutory Configurations and Employee Overrides
      const { data: configs } = await supabase
        .from('statutory_configurations')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true);

      const { data: employeeOverrides } = await supabase
        .from('employee_statutory_values')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('tenant_id', auth.tenantId);

      const configsMap: Record<string, any> = {};
      configs?.forEach(c => { configsMap[c.id] = c; });

      const overridesMap: Record<string, number> = {};
      employeeOverrides?.forEach(o => { overridesMap[o.configuration_id] = o.value; });

      // 4. Auto-enable and set values for Statutory components
      structureComponents.forEach(comp => {
        if (comp.statutory_component_id != null) {
          const config = configsMap[comp.statutory_component_id];
          
          const nameLower = comp.name.toLowerCase();
          const statutoryType = comp.statutory_element || (
            (nameLower.includes('provident fund') || nameLower.includes('(pf)')) ? 'provident_fund' :
            (nameLower.includes('state insurance') || nameLower.includes('(esi)')) ? 'employee_state_insurance' :
            (nameLower.includes('professional tax')) ? 'professional_tax' :
            (nameLower.includes('tds') || nameLower.includes('tax deducted')) ? 'tax_deducted_at_source' : 
            ''
          );
          
          const hasId = statutoryType && idMap[statutoryType];
          statutoryEnabled[comp.name] = !!hasId;

          if (config) {
            // Priority: 1. Employee Override, 2. Global Config Value, 3. Component default
            const overrideVal = overridesMap[config.id];
            const effectiveVal = overrideVal !== undefined ? overrideVal : (config.global_value ?? 0);
            
            if (effectiveVal !== undefined) {
              componentValues[comp.name] = effectiveVal;
            }
          }
        }
      });

      // 4. Fetch Advance Recovery for the period
      const payrollMonth = startDate.slice(0, 7); // 'YYYY-MM'
      const advanceDeductions = await getEmployeeAdvanceDeductions(employeeId, payrollMonth, auth.tenantId);
      const totalAdvance = advanceDeductions.reduce((sum, d) => sum + (d.amount || 0), 0);

      // 5. Fetch Travel Allowance
      let travelAllowanceAmount = 0;
      try {
        const { data, error } = await supabase
          .from('work_locations')
          .select('work_amount')
          .eq('employee_id', employeeId)
          .eq('tenant_id', auth.tenantId)
          .eq('status', 'approved')
          .gte('assignment_date', startDate)
          .lte('assignment_date', periodEnd)
          .not('work_amount', 'is', null);

        if (!error && data) {
          travelAllowanceAmount = data.reduce((sum, row) => sum + (Number(row.work_amount) || 0), 0);
        }
      } catch (err) {
        console.error('Error fetching travel allowance:', err);
      }

      if (travelAllowanceAmount > 0) {
        componentValues[travelAllowanceComponentName] = travelAllowanceAmount;
      }

      setInputs(prev => ({
        ...prev,
        componentValues: {
          ...prev.componentValues,
          ...componentValues
        },
        advanceDeduction: totalAdvance,
        statutoryEnabled: {
          ...prev.statutoryEnabled,
          ...statutoryEnabled
        }
      }));

    } catch (err) {
      console.error('Error loading employee values:', err);
    }
  };

  const fetchAllComponents = async () => {
    const auth = await validateAuth();
    if (!auth.tenantId) return;
    const { data } = await supabase
      .from('payroll_components')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true);
    if (data) setAllPayrollComponents(data);
  };

  const loadCalcComponents = async () => {
    const auth = await validateAuth();
    if (!auth.tenantId) return;
    const { data } = await supabase
      .from('payroll_components')
      .select('id, name')
      .eq('tenant_id', auth.tenantId)
      .eq('component_category', 'calculation')
      .eq('is_active', true);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((c: any) => { map[c.id] = c.name; });
      setCalcComponentMap(map);
    }
  };

  useEffect(() => {
    if (!selectedStructureId) { setStructureComponents([]); setResult(null); return; }
    (async () => {
      setLoadingStructure(true);
      try {
        const tenantId = await getTenantId();
        const [details, allCompsRes] = await Promise.all([
          fetchSalaryStructureDetails(selectedStructureId),
          supabase.from('payroll_components').select('id, name, rounding_type').eq('tenant_id', tenantId)
        ]);

        const comps = details?.[0]?.components || (Array.isArray(details) ? [] : (details as any)?.components || []);
        const allComps = allCompsRes.data || [];
        
        // Create a map for quick lookup of default rounding types
        const roundingMap: Record<string, string> = {};
        allComps.forEach(c => {
          if (c.rounding_type) roundingMap[c.name] = c.rounding_type;
        });

        const updatedComps = (Array.isArray(comps) ? comps : []).map(c => ({
          ...c,
          // Use rounding type from structure if present, otherwise use default from component
          rounding_type: c.rounding_type || roundingMap[c.name] || 'none'
        }));

        setStructureComponents(updatedComps);
        setInputs(prev => ({ ...prev, componentValues: {} }));
        setResult(null);
      } catch (err) { 
        console.error('Error loading structure:', err);
        setStructureComponents([]); 
      }
      finally { setLoadingStructure(false); }
    })();
  }, [selectedStructureId]);

  // Auto-calculate attendance metrics when period changes
  useEffect(() => {
    const updateAttendance = async () => {
      const auth = await validateAuth();
      if (!auth.tenantId) return;

      const calendarDays = diffDays(periodStart, periodEnd);
      const weekOffDates = getSundays(periodStart, periodEnd);
      setDetectedWeekOffs(weekOffDates);

      let holidays: Holiday[] = [];
      try {
        const { data } = await supabase.rpc('get_holidays', {
          p_start_date: periodStart,
          p_end_date: periodEnd,
          p_tenant_id: auth.tenantId,
        });
        holidays = data || [];
        setDetectedHolidays(holidays);
      } catch (err) {
        console.error('Error fetching holidays:', err);
      }

      // Important: Only count holidays that don't fall on a week-off (Sunday)
      // to avoid double-subtraction from Calendar Days
      const uniqueHolidays = holidays.filter(h => !weekOffDates.includes(h.date));
      const paidHolidaysCount = uniqueHolidays.length;
      const weekOffDaysCount = weekOffDates.length;

      // workingDays = calendarDays - weekOffs only (paidHolidays defaults to 0; user can override manually)
      const workingDays = Math.max(0, calendarDays - weekOffDaysCount);

      setInputs(prev => ({
        ...prev,
        calendarDays,
        weekOffDays: weekOffDaysCount,
        paidHolidays: 0,
        workingDays,
        payableDays: calendarDays,
        presentDays: workingDays,
      }));
    };

    updateAttendance();
  }, [periodStart, periodEnd]);

  const recalculate = useCallback(() => {
    if (!structureComponents.length) return;
    setCalculating(true);
    setCalcError(null);
    
    // Create a modified version of statutoryEnabled that respects ID presence in Employee Mode
    const effectiveStatutoryEnabled = { ...inputs.statutoryEnabled };
    if (testerMode === 'employee') {
      statutoryComps.forEach(c => {
        const nameLower = c.name.toLowerCase();
        const statutoryType = c.statutory_element || (
          (nameLower.includes('provident fund') || nameLower.includes('(pf)')) ? 'provident_fund' :
          (nameLower.includes('state insurance') || nameLower.includes('(esi)')) ? 'employee_state_insurance' :
          (nameLower.includes('professional tax')) ? 'professional_tax' :
          (nameLower.includes('tds') || nameLower.includes('tax deducted')) ? 'tax_deducted_at_source' : 
          ''
        );
        
        const hasId = !statutoryType || !!(employeeStatutoryIds[statutoryType] || sampleIds[statutoryType]);
        if (!hasId) {
          effectiveStatutoryEnabled[c.name] = false;
        }
      });
    }

    // Use a small delay to ensure UI updates the 'calculating' state
    setTimeout(() => {
      try {
        const res = runFormulaTesterEngine(structureComponents, calcComponentMap, {
          ...inputs,
          statutoryEnabled: effectiveStatutoryEnabled
        }, travelAllowanceComponentName);
        setResult(res);
      } catch (e: any) { 
        console.error('Calculation Error:', e);
        setCalcError(e.message || 'An unexpected error occurred during calculation.');
        setResult(null);
      }
      finally { setCalculating(false); }
    }, 50);
  }, [structureComponents, calcComponentMap, inputs, testerMode, employeeStatutoryIds, sampleIds, travelAllowanceComponentName]);

  useEffect(() => {
    if (!structureComponents.length) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalculate, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputs, structureComponents, recalculate]);

  const setAttendance = (key: keyof SampleInputs, val: number) =>
    setInputs(prev => {
      const next = { ...prev, [key]: val };

      // Auto-update dependencies
      if (key === 'calendarDays') {
        next.payableDays = val - next.unpaidLeaveDays;
        next.workingDays = Math.max(0, val - next.weekOffDays - next.paidHolidays);
      } else if (key === 'workingDays') {
        // Reverse update: changing working days updates week off count
        // weekOffDays = calendarDays - workingDays - paidHolidays
        next.weekOffDays = Math.max(0, next.calendarDays - val - next.paidHolidays);
      } else if (key === 'weekOffDays' || key === 'paidHolidays') {
        next.workingDays = Math.max(0, next.calendarDays - next.weekOffDays - next.paidHolidays);
      } else if (key === 'presentDays') {
        next.presentDays = val;
      } else if (key === 'paidLeaveDays') {
        next.paidLeaveDays = val;
        // Sync absent days: Absent = Paid + Unpaid
        next.absentDays = val + next.unpaidLeaveDays;
      } else if (key === 'unpaidLeaveDays') {
        next.unpaidLeaveDays = val;
        // Sync payable days: Payable = Calendar - LOP
        next.payableDays = Math.max(0, next.calendarDays - val);
        // Sync absent days: Absent = Paid + Unpaid
        next.absentDays = next.paidLeaveDays + val;
      }

      return next;
    });

  const setCompVal = (name: string, val: number) =>
    setInputs(prev => ({ ...prev, componentValues: { ...prev.componentValues, [name]: val } }));

  const toggleStatutory = (name: string, enabled: boolean) =>
    setInputs(prev => ({
      ...prev,
      statutoryEnabled: { ...prev.statutoryEnabled, [name]: enabled },
      // Sync PF/ESI applicable context flags
      pfApplicable: name.toLowerCase().includes('pf') ? enabled : prev.pfApplicable,
      esiApplicable: name.toLowerCase().includes('esi') ? enabled : prev.esiApplicable,
    }));

  const resetAll = () => {
    const d = getDefaultPeriod();
    setPeriodStart(d.start);
    setPeriodEnd(d.end);
    setTesterMode('sample');
    setSelectedEmployeeId('');
    setEmployeeStatutoryIds({});
    setSampleIds({});
    setInputs({ ...DEFAULT_INPUTS, calendarDays: d.calendarDays });
    setResult(null);
    setCalcError(null);
  };

  // Start date change — clamp end date if it would go before start
  const handleStartChange = (val: string) => {
    setPeriodStart(val);
    if (val > periodEnd) setPeriodEnd(val);
  };

  // End date change — clamp start date if it would go after end
  const handleEndChange = (val: string) => {
    setPeriodEnd(val);
    if (val < periodStart) setPeriodStart(val);
  };

  const addComponentToTest = (comp: any) => {
    // Check if already exists
    if (structureComponents.find(c => c.name === comp.name)) return;

    const newComp: SalaryStructureComponent = {
      id: comp.id,
      key: comp.name.toLowerCase().replace(/\s+/g, '_'),
      name: comp.name,
      component_type: comp.component_type as any,
      amount_type: comp.amount_type || 'value',
      calculation_type: comp.calculation_method === 'percentage' ? 'simple' : 'expression',
      editability: 'editable',
      amount: 0,
      percentage_value: 0,
      is_taxable: comp.is_taxable || false,
      is_applied_in_calculation: true,
      statutory_component_id: comp.statutory_component_id,
      expression: comp.expression,
      reference_components: comp.referance_component_ids || [],
      rounding_type: comp.rounding_type || 'none',
    };

    setStructureComponents(prev => [...prev, newComp]);
    setShowAddComponent(null);
  };

  const exportToExcel = () => {
    if (!result) return;
    const emp = employees.find(e => e.id === selectedEmployeeId);
    const structure = structures.find(s => s.id === selectedStructureId);

    const data = [
      ['Payroll Formula Test Report'],
      ['Generated On', new Date().toLocaleString()],
      [],
      ['Employee Details'],
      ['Name', emp?.name || 'N/A'],
      ['Employee Code', emp?.code || 'N/A'],
      ['Salary Structure', structure?.name || 'N/A'],
      ['Period', `${periodStart} to ${periodEnd}`],
      [],
      ['Attendance Metrics'],
      ['Calendar Days', inputs.calendarDays],
      ['Working Days', inputs.workingDays],
      ['Present Days', inputs.presentDays],
      ['Paid Leave', inputs.paidLeaveDays],
      ['Unpaid Leave (LOP)', inputs.unpaidLeaveDays],
      [],
      ['Calculation Results'],
      ['Component Name', 'Type', 'Input/Base Value', 'Calculated Amount'],
      ...result.earnings.map(e => {
        const comp = structureComponents.find(sc => sc.name === e.name);
        const inputVal = inputs.componentValues[e.name] ?? (comp?.amount_type === 'percentage' ? comp?.percentage_value : comp?.amount) ?? 0;
        const typeStr = comp?.amount_type === 'percentage' ? '%' : '';
        return [e.name, 'Earning', `${inputVal}${typeStr}`, e.amount];
      }),
      ...result.deductions.map(d => {
        const comp = structureComponents.find(sc => sc.name === d.name);
        const inputVal = inputs.componentValues[d.name] ?? (comp?.amount_type === 'percentage' ? comp?.percentage_value : comp?.amount) ?? 0;
        const typeStr = comp?.amount_type === 'percentage' ? '%' : '';
        return [d.name, 'Deduction', `${inputVal}${typeStr}`, d.amount];
      }),
      ['Advance Recovery', 'Deduction', `${inputs.advanceDeduction}`, inputs.advanceDeduction],
      [],
      ['Summary'],
      ['Gross Earnings', '', '', result.grossSalary],
      ['Total Deductions', '', '', result.totalDeductions],
      ['Net Salary', '', '', result.netSalary]
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll Test');
    XLSX.writeFile(wb, `Payroll_Test_${emp?.name || 'Result'}_${periodStart}.xlsx`);
  };

  const exportToPDF = () => {
    if (!result) return;
    const doc = new jsPDF();
    const emp = employees.find(e => e.id === selectedEmployeeId);
    const structure = structures.find(s => s.id === selectedStructureId);

    // Title
    doc.setFontSize(18);
    doc.setTextColor(67, 56, 202); // indigo-700
    doc.text('Payroll Formula Test Report', 14, 22);

    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Period: ${periodStart} to ${periodEnd}`, 14, 35);

    // Employee Section
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Employee Details', 14, 45);
    autoTable(doc, {
      startY: 48,
      body: [
        ['Name', emp?.name || 'N/A'],
        ['Employee Code', emp?.code || 'N/A'],
        ['Salary Structure', structure?.name || 'N/A']
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1 }
    });

    // Attendance Section
    doc.text('Attendance Metrics', 14, (doc as any).lastAutoTable.finalY + 10);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 13,
      body: [
        ['Calendar Days', inputs.calendarDays, 'Present Days', inputs.presentDays],
        ['Working Days', inputs.workingDays, 'Paid Leave', inputs.paidLeaveDays],
        ['LOP Days', inputs.unpaidLeaveDays, 'Week Offs', inputs.weekOffDays]
      ],
      theme: 'grid',
      styles: { fontSize: 9 }
    });

    // Components Table
    doc.text('Calculation Details', 14, (doc as any).lastAutoTable.finalY + 10);
    const components = [
      ...result.earnings.map(e => {
        const comp = structureComponents.find(sc => sc.name === e.name);
        const inputVal = inputs.componentValues[e.name] ?? (comp?.amount_type === 'percentage' ? comp?.percentage_value : comp?.amount) ?? 0;
        const typeStr = comp?.amount_type === 'percentage' ? '%' : '';
        return [e.name, 'Earning', `${inputVal}${typeStr}`, e.amount.toFixed(2)];
      }),
      ...result.deductions.map(d => {
        const comp = structureComponents.find(sc => sc.name === d.name);
        const inputVal = inputs.componentValues[d.name] ?? (comp?.amount_type === 'percentage' ? comp?.percentage_value : comp?.amount) ?? 0;
        const typeStr = comp?.amount_type === 'percentage' ? '%' : '';
        return [d.name, 'Deduction', `${inputVal}${typeStr}`, d.amount.toFixed(2)];
      }),
      ['Advance Recovery', 'Deduction', `${inputs.advanceDeduction}`, inputs.advanceDeduction.toFixed(2)]
    ];

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 13,
      head: [['Component Name', 'Type', 'Base Value', 'Calculated Amount']],
      body: components,
      headStyles: { fillStyle: '#4338ca' },
      alternateRowStyles: { fillColor: '#f8fafc' },
      columnStyles: {
        3: { halign: 'right' }
      }
    });

    // Summary Box
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFillColor(248, 250, 252);
    doc.rect(120, finalY, 76, 35, 'F');
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('Gross Earnings:', 125, finalY + 10);
    doc.text(`${result.grossSalary.toFixed(2)}`, 190, finalY + 10, { align: 'right' });
    
    doc.setTextColor(220, 38, 38);
    doc.text('Total Deductions:', 125, finalY + 18);
    doc.text(`${result.totalDeductions.toFixed(2)}`, 190, finalY + 18, { align: 'right' });

    doc.setFontSize(12);
    doc.setTextColor(67, 56, 202);
    doc.text('Net Salary:', 125, finalY + 28);
    doc.text(`${result.netSalary.toFixed(2)}`, 190, finalY + 28, { align: 'right' });

    doc.save(`Payroll_Report_${emp?.name || 'Result'}.pdf`);
  };

  const removeComponentFromTest = (name: string) => {
    // Dependency Check: Do not allow removal if other components depend on it
    const dependants = structureComponents.filter(c => {
      if (c.name === name) return false;
      // Check reference_components (by name or ID)
      const hasRef = (c.reference_components || []).some(ref => {
        // We check if the ref ID matches the component ID or if the ref string is the component name
        const targetComp = structureComponents.find(sc => sc.name === name);
        return ref === name || (targetComp?.id && ref === targetComp.id);
      });
      if (hasRef) return true;

      // Check expression for the component name (case insensitive)
      if (c.expression) {
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(c.expression)) return true;
      }

      return false;
    });

    if (dependants.length > 0) {
      alert(`Cannot remove "${name}" because the following components depend on it: ${dependants.map(d => d.name).join(', ')}`);
      return;
    }

    setStructureComponents(prev => prev.filter(c => c.name !== name));
  };

  const earningComps = structureComponents.filter(c => c.component_type === 'earning');
  const deductionComps = structureComponents.filter(c => c.component_type === 'deduction' && c.statutory_component_id == null);
  const statutoryComps = structureComponents.filter(
    c => c.component_type === 'deduction' &&
      c.statutory_component_id != null &&
      c.is_applied_in_calculation !== false
  );

  // Attendance validation: present + paid leave + unpaid leave must equal working days
  const totalAccountedDays = inputs.presentDays + inputs.paidLeaveDays + inputs.unpaidLeaveDays;
  const hasAttendanceError = totalAccountedDays !== inputs.workingDays;
  const isAttendanceExcess = totalAccountedDays > inputs.workingDays;
  const attendanceDiff = Math.abs(inputs.workingDays - totalAccountedDays);

  const filteredSteps = result?.steps.filter(s =>
    filterType === 'all' ? true : s.componentType === filterType
  ) || [];

  return (
    <div className="min-h-fit bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 shadow-sm  z-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Payroll Formula Tester</h1>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">High Fidelity Sandbox</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 shadow-inner w-full sm:w-auto">
              <div className="flex items-center gap-2 text-indigo-400">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] font-bold uppercase lg:hidden">Period</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <input 
                  type="date" 
                  value={periodStart} 
                  max={periodEnd}
                  onChange={e => setPeriodStart(e.target.value)} 
                  className="bg-transparent text-xs font-bold text-gray-700 outline-none w-[115px] cursor-pointer hover:text-indigo-600 transition-colors" 
                />
                <span className="text-gray-300 font-bold px-1 hidden sm:block">—</span>
                <input 
                  type="date" 
                  value={periodEnd} 
                  min={periodStart}
                  onChange={e => setPeriodEnd(e.target.value)} 
                  className="bg-transparent text-xs font-bold text-gray-700 outline-none w-[115px] cursor-pointer hover:text-indigo-600 transition-colors" 
                />
              </div>
            </div>

            <div className="flex-1 min-w-[200px]">
              <select
                value={selectedStructureId}
                onChange={e => setSelectedStructureId(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all cursor-pointer"
              >
                <option value="">— Select Structure —</option>
                {structures.map(s => (
                  <option key={s.id} value={s.id!}>{s.name}</option>
                ))}
              </select>
            </div>
            <button onClick={resetAll}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 hover:bg-gray-200 text-sm text-gray-600 transition-all font-medium whitespace-nowrap">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          </div>
        </div>
      </div>

        {!selectedStructureId ? (
          <div className="flex flex-col items-center justify-center h-[70vh] gap-4 text-gray-400 px-6 text-center">
            <FlaskConical className="w-14 h-14 opacity-20" />
            <p className="text-lg font-medium">Select a salary structure to begin testing</p>
          </div>
        ) : loadingStructure ? (
          <div className="flex items-center justify-center h-[70vh] gap-3 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            <span>Loading structure components…</span>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-140px)]">
            {/* LEFT PANEL — Inputs & Metrics */}
            <div className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto px-4 pb-6 space-y-1 bg-white shadow-sm lg:sticky lg:top-0">
               <div className="sticky top-0 z-10 bg-white">
                {/* Tester Mode Switcher */}
                <div className="mb- py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Testing Mode</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={testerMode === 'employee'}
                        onChange={() => setTesterMode(prev => prev === 'sample' ? 'employee' : 'sample')}
                      />
                      {/* <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div> */}
                    </label>
                  </div>
                  
                  <div className="flex gap-1">
                    <button 
                      onClick={() => {
                        setTesterMode('sample');
                        setSelectedEmployeeId('');
                        setEmployeeStatutoryIds({});
                        setSampleIds({});
                        setInputs(prev => ({ 
                          ...DEFAULT_INPUTS, 
                          calendarDays: prev.calendarDays,
                          workingDays: prev.workingDays,
                          weekOffDays: prev.weekOffDays,
                          paidHolidays: prev.paidHolidays,
                          payableDays: prev.payableDays,
                          presentDays: prev.presentDays
                        }));
                        setResult(null);
                        setCalcError(null);
                      }}
                      className={`flex-1 py-1 rounded text-[9px] font-bold uppercase transition-all ${testerMode === 'sample' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-gray-400 border border-transparent'}`}
                    >
                      Sample Data
                    </button>
                    <button 
                      onClick={() => {
                        setTesterMode('employee');
                        setResult(null);
                        setCalcError(null);
                      }}
                      className={`flex-1 py-1 rounded text-[9px] font-bold uppercase transition-all ${testerMode === 'employee' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-gray-400 border border-transparent'}`}
                    >
                      Employee Data
                    </button>
                  </div>

                  {testerMode === 'employee' && (
                    <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div>
                        <select
                          value={selectedEmployeeId}
                          onChange={e => setSelectedEmployeeId(e.target.value)}
                          disabled={loadingEmployees}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-700 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all cursor-pointer"
                        >
                          <option value="">— Select Employee —</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name} ({emp.code})</option>
                          ))}
                        </select>
                        {loadingEmployees && <p className="text-[9px] text-indigo-500 mt-1 font-medium italic">Loading assigned employees...</p>}
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={allowManualEdits}
                          onChange={e => setAllowManualEdits(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-[10px] font-bold text-gray-500 group-hover:text-indigo-600 transition-colors uppercase tracking-wider">Allow Manual Edits</span>
                      </label>
                    </div>
                  )}
                </div>
              {/* Tab Switcher */}
              <div className="z-10 -mx-4 pb-5 mb-6 bg-white px-4 py-3 border-b border-gray-100 shadow-sm">
                <div className="flex p-1 bg-gray-100 rounded-xl">
                  <button
                    onClick={() => setLeftTab('inputs')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      leftTab === 'inputs' 
                        ? 'bg-white text-indigo-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Edit Inputs
                  </button>
                  <button
                    onClick={() => setLeftTab('metrics')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      leftTab === 'metrics' 
                        ? 'bg-white text-indigo-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Calculated Metrics
                  </button>
                </div>
              </div>
               </div>

              {leftTab === 'inputs' ? (
                <div className="space-y-1 animate-in fade-in slide-in-from-right-2 duration-300">
              <SectionLabel>📅 Attendance Metrics</SectionLabel>
              <div className="space-y-3">
                <NumberInput label="Calendar Days / Payable Days" value={inputs.calendarDays} onChange={v => setAttendance('calendarDays', v)} min={1} />
                <NumberInput label="Working Days" value={inputs.workingDays} onChange={v => setAttendance('workingDays', v)} />
                <NumberInput label="Week Off Days / Holidays" value={inputs.weekOffDays} onChange={v => setAttendance('weekOffDays', v)} />
                {/* <NumberInput label="Payable Days" value={inputs.payableDays} onChange={v => setAttendance('payableDays', v)} /> */}
                <NumberInput label="Present Days" value={inputs.presentDays} onChange={v => setAttendance('presentDays', v)} error={hasAttendanceError} />
                {/* <NumberInput label="Absent Days" value={inputs.absentDays} onChange={v => setAttendance('absentDays', v)} /> */}
                <NumberInput label="Paid Leave Days (CL, ML)" value={inputs.paidLeaveDays} onChange={v => setAttendance('paidLeaveDays', v)} error={hasAttendanceError} />
                <NumberInput label="Unpaid Leave Days (LOP)" value={inputs.unpaidLeaveDays} onChange={v => setAttendance('unpaidLeaveDays', v)} error={hasAttendanceError} />
                {hasAttendanceError && (
                  <div className={`flex items-start gap-2 border rounded-lg px-3 py-2 ${isAttendanceExcess ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isAttendanceExcess ? 'text-red-500' : 'text-amber-500'}`} />
                    <p className={`text-xs font-medium ${isAttendanceExcess ? 'text-red-600' : 'text-amber-600'}`}>
                      {isAttendanceExcess
                        ? `Total days (${totalAccountedDays}) exceeds Working Days (${inputs.workingDays}) by ${attendanceDiff} day${attendanceDiff > 1 ? 's' : ''}.`
                        : `${attendanceDiff} day${attendanceDiff > 1 ? 's' : ''} unaccounted. Total must match Working Days (${inputs.workingDays}).`
                      }
                    </p>
                  </div>
                )}
                {/* <NumberInput label="Leave Days Total" value={inputs.leaveDays} onChange={v => setAttendance('leaveDays', v)} /> */}
                {/* <NumberInput label="Paid Holidays" value={inputs.paidHolidays} onChange={v => setAttendance('paidHolidays', v)} /> */}
              </div>

              <SectionLabel>Earnings</SectionLabel>
              <div className="space-y-3 mb-6">
                {earningComps.map(c => {
                  const isPct = c.amount_type === 'percentage';
                  const curVal = isPct ? (inputs.componentValues[c.name] ?? c.percentage_value ?? 0) : (inputs.componentValues[c.name] ?? c.amount ?? 0);
                  return (
                    <div key={c.name} className="relative group">
                      {testerMode === 'sample' && (
                        <button
                          onClick={() => removeComponentFromTest(c.name)}
                          className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-500"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                      )}
                      <NumberInput
                        label={c.name}
                        value={curVal}
                        onChange={v => setCompVal(c.name, v)}
                        step={isPct ? 0.01 : 1}
                        disabled={testerMode === 'employee' && !allowManualEdits}
                        badge={
                          <div className="flex items-center gap-1.5">
                            <RoundingTypeSelector 
                              value={c.rounding_type} 
                              onChange={v => setStructureComponents(prev => prev.map(pc => pc.name === c.name ? { ...pc, rounding_type: v } : pc))} 
                              disabled={testerMode === 'employee' && !allowManualEdits}
                            />
                            <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${isPct ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-gray-50 text-gray-500 border border-gray-100'}`}>
                              {isPct ? '%' : 'Fixed'}
                            </div>
                          </div>
                        }
                      />
                    </div>
                  );
                })}
                {testerMode === 'sample' && (
                  <button
                    onClick={() => setShowAddComponent('earning')}
                    className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-all flex items-center justify-center gap-2 font-medium"
                  >
                    + Add Earning Component
                  </button>
                )}
              </div>
              <SectionLabel>Deductions</SectionLabel>
              <div className="space-y-3 mb-6">
                {deductionComps.map(c => {
                  const isPct = c.amount_type === 'percentage';
                  const curVal = isPct ? (inputs.componentValues[c.name] ?? c.percentage_value ?? 0) : (inputs.componentValues[c.name] ?? c.amount ?? 0);
                  return (
                    <div key={c.name} className="relative group">
                      {testerMode === 'sample' && (
                      <button
                        onClick={() => removeComponentFromTest(c.name)}
                        className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-500"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      )}
                      <NumberInput
                        label={c.name}
                        value={curVal}
                        onChange={v => setCompVal(c.name, v)}
                        step={isPct ? 0.01 : 1}
                        disabled={testerMode === 'employee' && !allowManualEdits}
                        badge={
                          <div className="flex items-center gap-1.5">
                            <RoundingTypeSelector 
                              value={c.rounding_type} 
                              onChange={v => setStructureComponents(prev => prev.map(pc => pc.name === c.name ? { ...pc, rounding_type: v } : pc))} 
                            />
                            <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${isPct ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-gray-50 text-gray-500 border border-gray-100'}`}>
                              {isPct ? '%' : 'Fixed'}
                            </div>
                          </div>
                        }
                      />
                    </div>
                  );
                })}
                
                <NumberInput label="Advance Recovery (₹)" value={inputs.advanceDeduction} onChange={v => setAttendance('advanceDeduction', v)} disabled={testerMode === 'employee' && !allowManualEdits} />
              </div>

              {statutoryComps.length > 0 && (
                <div className="mb-4">
                  <SectionLabel>Statutory Deductions</SectionLabel>
                  <div className="space-y-2">
                    {statutoryComps.map(c => {
                      const enabled = !!inputs.statutoryEnabled[c.name];
                      const isPct = c.amount_type === 'percentage';
                      const curVal = inputs.componentValues[c.name] ?? (isPct ? (c.percentage_value ?? 0) : (c.amount ?? 0));
                      
                      // Detect statutory type based on name if statutory_element is missing
                      const nameLower = c.name.toLowerCase();
                      const statutoryType = c.statutory_element || (
                        (nameLower.includes('provident fund') || nameLower.includes('(pf)')) ? 'provident_fund' :
                        (nameLower.includes('state insurance') || nameLower.includes('(esi)')) ? 'employee_state_insurance' :
                        (nameLower.includes('professional tax')) ? 'professional_tax' :
                        (nameLower.includes('tds') || nameLower.includes('tax deducted')) ? 'tax_deducted_at_source' : 
                        ''
                      );

                      const hasId = !statutoryType || !!(employeeStatutoryIds[statutoryType] || sampleIds[statutoryType]);
                      const idLabel = statutoryType === 'provident_fund' ? 'PF ID' :
                                     statutoryType === 'employee_state_insurance' ? 'ESI ID' :
                                     statutoryType === 'professional_tax' ? 'PT ID' : 
                                     statutoryType === 'tax_deducted_at_source' ? 'TDS ID' : '';

                      return (
                        <div key={c.id || c.name} className={`rounded-xl border p-3 transition-all ${enabled ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-700 font-semibold">{c.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${isPct ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                {isPct ? '%' : '₹'}
                              </span>
                            </div>
                            <button
                              onClick={() => toggleStatutory(c.name, !enabled)}
                              disabled={(testerMode === 'employee' && (!allowManualEdits || !hasId)) || !hasId}
                              className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${enabled && hasId ? 'bg-indigo-500' : 'bg-gray-300'} ${((testerMode === 'employee' && (!allowManualEdits || !hasId)) || !hasId) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${enabled && hasId ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          </div>
                          
                          {testerMode === 'employee' && statutoryType && !hasId && (
                            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg animate-in fade-in slide-in-from-top-1">
                              <p className="text-[10px] text-amber-700 leading-tight">
                                <AlertTriangle className="w-3 h-3 inline mr-1 mb-0.5" />
                                This employee is missing a <b>{idLabel}</b>. As a result, <b>{c.name}</b> cannot be applied.
                              </p>
                              <div className="mt-2">
                                <label className="text-[9px] font-bold text-amber-600 uppercase">Enter Sample ID to Test</label>
                                <div className="flex gap-1 mt-1">
                                  <input 
                                    type="text"
                                    placeholder={`Sample ${idLabel}`}
                                    id={`sample-id-input-${c.id}`}
                                    className="flex-1 bg-white border border-amber-200 rounded px-2 py-1 text-[10px] focus:ring-1 focus:ring-amber-400 outline-none"
                                  />
                                  <button
                                    onClick={() => {
                                      const val = (document.getElementById(`sample-id-input-${c.id}`) as HTMLInputElement)?.value;
                                      if (val) {
                                        setSampleIds(prev => ({ ...prev, [statutoryType]: val }));
                                        toggleStatutory(c.name, true);
                                      }
                                    }}
                                    className="px-3 py-1 bg-amber-500 text-white rounded text-[10px] font-bold hover:bg-amber-600 transition-colors"
                                  >
                                    OK
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {testerMode === 'employee' && hasId && (
                            <div className="mb-2 px-2 py-1 bg-indigo-50/50 border border-indigo-100 rounded flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Database className="w-3 h-3 text-indigo-400" />
                                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-tight">{idLabel}:</span>
                                <span className="text-[10px] font-mono font-bold text-indigo-600">{employeeStatutoryIds[statutoryType] || sampleIds[statutoryType]}</span>
                                {sampleIds[statutoryType] && <span className="text-[8px] bg-amber-100 text-amber-600 px-1 rounded font-bold uppercase">Sample</span>}
                              </div>
                              {sampleIds[statutoryType] && (
                                <button 
                                  onClick={() => {
                                    setSampleIds(prev => {
                                      const next = { ...prev };
                                      delete next[statutoryType];
                                      return next;
                                    });
                                    toggleStatutory(c.name, false);
                                  }}
                                  className="text-[9px] font-bold text-red-400 hover:text-red-600 uppercase"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          )}

                          {enabled && hasId && (
                            <div className="mt-1">
                              <NumberInput
                                label={isPct ? `Override %` : 'Deduction Amount (₹)'}
                                value={curVal}
                                onChange={v => setCompVal(c.name, v)}
                                step={isPct ? 0.01 : 1}
                                disabled={testerMode === 'employee' && !allowManualEdits}
                                badge={
                                  <RoundingTypeSelector 
                                    value={c.rounding_type} 
                                    onChange={v => setStructureComponents(prev => prev.map(pc => pc.name === c.name ? { ...pc, rounding_type: v } : pc))} 
                                    disabled={testerMode === 'employee' && !allowManualEdits}
                                  />
                                }
                              />
                            </div>
                          )}
                          {!enabled && hasId && <p className="text-[11px] text-gray-400">Toggle on to apply this deduction</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <SectionLabel>Other</SectionLabel>
              <div className="space-y-3">
                <NumberInput label="OT Hours" value={inputs.otHours} onChange={v => setAttendance('otHours', v)} step={0.5} disabled={testerMode === 'employee' && !allowManualEdits} />
                <NumberInput label="OT Amount (₹)" value={inputs.otAmount} onChange={v => setAttendance('otAmount', v)} disabled={testerMode === 'employee' && !allowManualEdits} />
              </div>


              {/* Proration info */}
              {inputs.payableDays < inputs.calendarDays && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-amber-700 font-semibold">Proration Active</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Factor: {inputs.payableDays}/{inputs.calendarDays} = {(inputs.payableDays / inputs.calendarDays * 100).toFixed(2)}%
                    </p>
                  </div>
                </div>
              )}
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                  <SectionLabel>📅 Attendance Metrics</SectionLabel>
                  <div className="space-y-2">
                    <MetricRow label="Calendar Days" value={inputs.calendarDays} />
                    <MetricRow label="Working Days" value={inputs.workingDays} />
                    <MetricRow label="Week Off Days / Holidays" value={inputs.weekOffDays + inputs.paidHolidays} />
                    <MetricRow label="Present Days" value={inputs.presentDays} />
                    <MetricRow label="Absent Days" value={inputs.absentDays} />
                    <MetricRow label="Paid Leave Days" value={inputs.paidLeaveDays} />
                    <MetricRow label="Unpaid Leave Days" value={inputs.unpaidLeaveDays} />
                    <MetricRow label="Pay Days" value={inputs.payableDays} />
                  </div>

                  {result ? (
                    <>
                      <SectionLabel>Earnings</SectionLabel>
                      <div className="space-y-2">
                        {result.earnings.map(e => (
                          <MetricRow key={e.name} label={e.name} value={e.amount || 0} isCurrency />
                        ))}
                        <div className="pt-2 border-t border-gray-50 flex justify-between items-center px-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">Gross Earnings</span>
                          <span className="text-sm font-bold text-emerald-600">₹{fmt(result.grossSalary)}</span>
                        </div>
                      </div>

                      <SectionLabel>Deductions</SectionLabel>
                      <div className="space-y-2">
                        {result.deductions.map(d => (
                          <MetricRow key={d.name} label={d.name} value={d.amount || 0} isCurrency />
                        ))}
                        {inputs.advanceDeduction > 0 && (
                          <MetricRow label="Advance Recovery" value={inputs.advanceDeduction} isCurrency />
                        )}
                        <div className="pt-2 border-t border-gray-50 flex justify-between items-center px-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">Total Deductions</span>
                          <span className="text-sm font-bold text-red-500">₹{fmt(result.totalDeductions)}</span>
                        </div>
                      </div>

                      <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-center">
                        <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-1">Net Salary</p>
                        <p className="text-xl font-black text-indigo-600">₹{fmt(result.netSalary)}</p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-3">
                      <Loader2 className="w-6 h-6 animate-spin opacity-20" />
                      <p className="text-xs italic text-center px-4">Waiting for calculation to complete...</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Add Component Modal */}
            {showAddComponent && (
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                      Add {showAddComponent === 'earning' ? 'Earning' : 'Deduction'} Component
                    </h3>
                    <button onClick={() => setShowAddComponent(null)} className="text-gray-400 hover:text-gray-700 transition-colors">
                      <Minus className="w-5 h-5 rotate-45" />
                    </button>
                  </div>
                  <div className="p-2 max-h-[60vh] overflow-y-auto bg-white">
                    {allPayrollComponents
                      .filter(c => c.component_type === showAddComponent && c.component_category === 'general')
                      .map(c => {
                        const exists = structureComponents.find(sc => sc.name === c.name);
                        return (
                          <button
                            key={c.id}
                            disabled={!!exists}
                            onClick={() => addComponentToTest(c)}
                            className={`w-full text-left p-3 rounded-lg transition-all border border-transparent mb-1 group ${exists
                              ? 'opacity-40 cursor-not-allowed bg-gray-100'
                              : 'hover:bg-indigo-50 hover:border-indigo-200'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className={`text-sm font-semibold ${exists ? 'text-gray-400' : 'text-gray-800 group-hover:text-indigo-700'}`}>
                                  {c.name}
                                </span>
                                {exists && <span className="text-[10px] text-indigo-400 font-mono">Already added</span>}
                              </div>
                              <span className="text-[10px] uppercase text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded-full">{c.amount_type || 'value'}</span>
                            </div>
                          </button>
                        );
                      })
                    }
                    {allPayrollComponents.filter(c => c.component_type === showAddComponent && c.component_category === 'general').length === 0 && (
                      <div className="p-8 text-center text-gray-400 italic text-sm">
                        No general components of this type found in the system.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* RIGHT PANEL — Results */}
            <div className="flex-1 overflow-y-auto px-2 md:px-6 py-6 bg-gray-50">
              {result && (
                <>
                  <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-6 mb-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 flex-1">
                      <div className="bg-white border border-emerald-200 rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-4 h-4 text-emerald-500" />
                          <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Gross Earnings</span>
                        </div>
                        <p className="text-xl md:text-2xl font-black text-emerald-600">₹{fmt(result.grossSalary)}</p>
                      </div>
                      <div className="bg-white border border-red-200 rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingDown className="w-4 h-4 text-red-400" />
                          <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Total Deductions</span>
                        </div>
                        <p className="text-xl md:text-2xl font-black text-red-500">₹{fmt(result.totalDeductions)}</p>
                      </div>
                      <div className="bg-indigo-600 border border-indigo-700 rounded-2xl p-4 md:p-5 shadow-lg sm:col-span-2 xl:col-span-1 hover:scale-[1.02] transition-transform">
                        <div className="flex items-center gap-2 mb-2">
                          <IndianRupee className="w-4 h-4 text-indigo-200" />
                          <span className="text-[10px] text-indigo-100 font-bold uppercase tracking-wider">Net Salary</span>
                        </div>
                        <p className="text-xl md:text-2xl font-black text-white">₹{fmt(result.netSalary)}</p>
                      </div>
                    </div>

                    <div className="flex flex-row xl:flex-col gap-3 shrink-0">
                      <button
                        onClick={exportToExcel}
                        className="flex-1 xl:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white border border-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-50 transition-all shadow-sm group"
                      >
                        <FileSpreadsheet className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        Excel
                      </button>
                      <button
                        onClick={exportToPDF}
                        className="flex-1 xl:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white border border-red-200 text-red-700 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 transition-all shadow-sm group"
                      >
                        <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        PDF
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4 bg-white rounded-xl px-4 py-3 border border-gray-200 shadow-sm">
                    <span className="font-medium whitespace-nowrap">Payable Days Factor:</span>
                    <span className="font-mono text-gray-800 font-bold">
                      {inputs.payableDays}/{inputs.calendarDays} = {(result.payableDaysFactor * 100).toFixed(2)}%
                    </span>
                    {calculating && (
                      <div className="sm:ml-auto flex items-center gap-2 text-xs text-indigo-500">
                        <Loader2 className="w-3 h-3 animate-spin" /> Recalculating…
                      </div>
                    )}
                  </div>

                  {/* Summary Breakdown of Math */}
                  <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm">
                    <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Calculator className="w-3.5 h-3.5" /> Calculation Breakdown
                    </p>
                    <div className="space-y-3 font-mono text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-indigo-700 bg-white/50 px-3 py-2 rounded-lg border border-indigo-100/50">
                        <div className="flex flex-wrap items-center gap-1.5 flex-1">
                          <span className="font-bold text-[10px] uppercase">Gross Salary</span>
                          <span className="text-indigo-400">=</span>
                          {earningComps.map((c, i) => (
                            <React.Fragment key={c.name}>
                              {i > 0 && <Plus className="w-2.5 h-2.5 text-indigo-300" />}
                              <span title={c.name} className="bg-indigo-100/50 px-1.5 py-0.5 rounded border border-indigo-200/50 text-[10px]">{fmt(result.steps.find(s => s.componentName === c.name)?.finalValue || 0)}</span>
                            </React.Fragment>
                          ))}
                        </div>
                        <span className="font-bold text-xs sm:ml-4 whitespace-nowrap">₹{fmt(result.grossSalary)}</span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-red-700 bg-white/50 px-3 py-2 rounded-lg border border-red-100/50">
                        <div className="flex flex-wrap items-center gap-1.5 flex-1">
                          <span className="font-bold text-[10px] uppercase">Total Deductions</span>
                          <span className="text-red-400">=</span>
                          {deductionComps.map((c, i) => (
                            <React.Fragment key={c.name}>
                              {i > 0 && <Plus className="w-2.5 h-2.5 text-red-300" />}
                              <span title={c.name} className="bg-red-100/50 px-1.5 py-0.5 rounded border border-red-200/50 text-[10px]">{fmt(result.steps.find(s => s.componentName === c.name)?.finalValue || 0)}</span>
                            </React.Fragment>
                          ))}
                          {result.totalDeductions > 0 && statutoryComps.some(c => inputs.statutoryEnabled[c.name]) && <Plus className="w-2.5 h-2.5 text-red-300" />}
                          {statutoryComps.filter(c => inputs.statutoryEnabled[c.name]).map((c, i, arr) => (
                            <React.Fragment key={c.name}>
                              {i > 0 && <Plus className="w-2.5 h-2.5 text-red-300" />}
                              <span title={c.name} className="bg-red-100/50 px-1.5 py-0.5 rounded border border-red-200/50 text-[10px]">{fmt(result.steps.find(s => s.componentName === c.name)?.finalValue || 0)}</span>
                            </React.Fragment>
                          ))}
                          {inputs.advanceDeduction > 0 && (
                            <>
                              <Plus className="w-2.5 h-2.5 text-red-300" />
                              <span title="Advance Recovery" className="bg-red-100/50 px-1.5 py-0.5 rounded border border-red-200/50 text-[10px]">{fmt(inputs.advanceDeduction)}</span>
                            </>
                          )}
                        </div>
                        <span className="font-bold text-xs sm:ml-4 whitespace-nowrap">₹{fmt(result.totalDeductions)}</span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-emerald-700 bg-emerald-50 px-3 py-3 rounded-xl border border-emerald-200 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[10px] uppercase">Net Salary</span>
                          <span className="text-emerald-400">=</span>
                          <span className="font-bold text-xs">₹{fmt(result.grossSalary)}</span>
                          <Minus className="w-3 h-3 text-red-400" />
                          <span className="font-bold text-red-600 text-xs">₹{fmt(result.totalDeductions)}</span>
                        </div>
                        <span className="text-base sm:text-lg font-black tracking-tight underline decoration-double decoration-emerald-300 underline-offset-4 whitespace-nowrap">₹{fmt(result.netSalary)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex overflow-x-auto pb-1 sm:pb-0 gap-2 scrollbar-hide">
                      {(['all', 'earning', 'deduction'] as const).map(t => (
                        <button key={t} onClick={() => setFilterType(t)}
                          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all whitespace-nowrap ${filterType === t
                            ? t === 'earning' ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                              : t === 'deduction' ? 'bg-red-50 border-red-300 text-red-600'
                                : 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setExpandAll(p => !p)}
                      className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors font-medium self-end sm:self-auto">
                      <Code className="w-3 h-3" />
                      {expandAll ? 'Collapse All' : 'Expand All'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {filteredSteps.length === 0
                      ? <p className="text-center text-gray-400 py-10">No components for this filter.</p>
                      : filteredSteps.map((step, i) => (
                        <StepCard key={step.componentId} step={step} index={i} isExpanded={expandAll} />
                      ))
                    }
                  </div>

                  {structureComponents.some(c => c.calculation_type === 'expression') && (
                    <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
                      <FlaskConical className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-indigo-700 font-semibold">Expression Components</p>
                        <p className="text-xs text-indigo-500 mt-1">
                          Components with custom formulas are evaluated automatically using the attendance
                          metrics you entered. Expand each card above to see the formula, resolved variables,
                          and calculation trace.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!result && !loadingStructure && structureComponents.length > 0 && (
                <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-300">
                  {calcError ? (
                    <>
                      <AlertTriangle className="w-12 h-12 text-red-400 opacity-50" />
                      <div className="text-center">
                        <p className="text-red-500 font-bold uppercase text-[10px] tracking-widest mb-1">Calculation Error</p>
                        <p className="text-gray-500 text-xs max-w-md mx-auto">{calcError}</p>
                        <button 
                          onClick={recalculate}
                          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors"
                        >
                          Retry Calculation
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-12 h-12 opacity-30" />
                      <p className="text-gray-400 font-medium">Adjust sample inputs on the left to see results here.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    // </div>
  );
}