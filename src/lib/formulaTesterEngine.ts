/**
 * formulaTesterEngine.ts
 *
 * A zero-DB, pure in-memory calculation engine that mirrors the exact
 * formula evaluation pipeline used by PayrollProcessPage.processPayroll().
 *
 * It takes pre-loaded structure components and user-supplied sample inputs,
 * then runs the same sequence:
 *   1. Build execution context from attendance metrics
 *   2. Apply component values (editable / hidden)
 *   3. Prorate non-expression, non-exempt components by payable-days factor
 *   4. Evaluate expressions via FormulaEngine.executeAST
 *   5. Resolve percentage components against computed amounts
 *   6. Compute totals
 *
 * Returns a full trace (StepDetail[]) for the step-by-step UI.
 */

import { FormulaEngine, type ExecutionContext } from './formula-engine';
import type { SalaryStructureComponent } from '../stores/salaryStructuresStore';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SampleInputs {
  // Attendance metrics (mirrors time evaluation output)
  calendarDays: number;
  workingDays: number;
  weekOffDays: number;
  paidHolidays: number;
  presentDays: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  leaveDays: number;
  payableDays: number;

  // Statutory toggles (used in execution context for formula variables)
  pfApplicable: boolean;
  esiApplicable: boolean;

  // Per statutory component: toggle enabled state
  // Key = component name (e.g. "PF", "ESI", "Professional Tax")
  statutoryEnabled: Record<string, boolean>;

  // OT
  otHours: number;
  otAmount: number;

  // Advance deduction
  advanceDeduction: number;

  // Per-component sample values keyed by component name
  // Used for earnings, deductions AND statutory deduction amounts/percentages
  componentValues: Record<string, number>;
}

export interface StepDetail {
  componentId: string;
  componentName: string;
  componentType: 'earning' | 'deduction';
  calculationType: 'value' | 'percentage' | 'expression';
  // Human-readable formula description
  formulaText: string;
  // Variables that were resolved and used in the formula
  resolvedVariables: Record<string, number | boolean>;
  // Human-readable breakdown string  e.g. "25000 × 22 / 31 = 17,741.94"
  calculationBreakdown: string;
  // Value BEFORE rounding
  rawValue: number;
  // Final value AFTER rounding
  finalValue: number;
  roundingApplied: string;
  // Non-null when the formula evaluation threw an error
  error?: string;
  // The AST for visual rendering
  ast?: any;
  // Whether this component was skipped (e.g. statutory not applicable)
  skipped?: boolean;
  skipReason?: string;
}

export interface FormulaTesterResult {
  earnings: SalaryStructureComponent[];
  deductions: SalaryStructureComponent[];
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  steps: StepDetail[];
  payableDaysFactor: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Calculation component name → metric value mapping
// (Must match the switch-case in payrollCalculation.ts / getTimeEvaluationComponents)
// ---------------------------------------------------------------------------
const CALC_COMPONENT_NAMES: Record<string, keyof SampleInputs> = {
  'CalendarDays':           'calendarDays',
  'Calendar Days':          'calendarDays',
  'CalanderDays':           'calendarDays',
  'WorkingDays':            'workingDays',
  'Working Days':            'workingDays',
  'WeekOff':                'weekOffDays',
  'PaidHolidays':           'paidHolidays',
  'PresentDays':            'presentDays',
  'AbsentDays':             'absentDays',
  'PaidLeaveDays':          'paidLeaveDays',
  'UnpaidLeaveDays':        'unpaidLeaveDays',
  'LeaveDays':              'leaveDays',
  'PayableDays':            'payableDays',
  'Pay Days':               'calendarDays',
  'PayDays':                'calendarDays',
  'PayableDays Count':      'payableDays',
  'PresentDays Count':      'presentDays',
  'AbsentDays Count':       'absentDays',
  'PaidLeaveDays Count':    'paidLeaveDays',
  'UnpaidLeaveDays Count':  'unpaidLeaveDays',
  'LeaveDays Count':        'leaveDays',
  'Leave Count':            'leaveDays',
  'PFApplicable':           'pfApplicable',
  'ESIApplicable':          'esiApplicable',
};

// ---------------------------------------------------------------------------
// Rounding helpers (mirrors PayrollProcessPage.calculateComponentAmount)
// ---------------------------------------------------------------------------
function applyRounding(value: number, roundingType?: string): { rounded: number; label: string } {
  if (!roundingType || roundingType === 'none') {
    return { rounded: value, label: 'None' };
  }
  switch (roundingType) {
    case 'round':
    case 'standard':
      return { rounded: Math.round(value), label: 'Standard Round' };
    case 'floor':
      return { rounded: Math.floor(value), label: 'Round Down' };
    case 'ceil':
      return { rounded: Math.ceil(value), label: 'Round Up' };
    case 'decimal2':
      return { rounded: Math.round(value * 100) / 100, label: 'Fixed Decimal' };
    default:
      return { rounded: value, label: 'None' };
  }
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

// ---------------------------------------------------------------------------
// Main engine function
// ---------------------------------------------------------------------------

/**
 * @param structureComponents  Full list of SalaryStructureComponent from fetchSalaryStructureDetails
 * @param calcComponentMap     Map of component id → display name for calculation components
 *                             (id→name as returned by payroll_components where component_category='calculation')
 * @param sampleInputs         User-entered sample values
 */
export function runFormulaTesterEngine(
  structureComponents: SalaryStructureComponent[],
  calcComponentMap: Record<string, string>,  // id → name
  sampleInputs: SampleInputs,
  travelAllowanceComponentName: string = 'Travel Allowance'
): FormulaTesterResult {
  const steps: StepDetail[] = [];
  const errors: string[] = [];

  // -------------------------------------------------------------------------
  // Step 1: Build execution context from attendance metrics
  // -------------------------------------------------------------------------
  
  // Per user request: AbsentDays = Paid Leave + Unpaid Leave
  const computedAbsentDays = sampleInputs.paidLeaveDays + sampleInputs.unpaidLeaveDays;
  const computedLeaveDays  = sampleInputs.paidLeaveDays + sampleInputs.unpaidLeaveDays;
  
  // Clone inputs to avoid mutating original, but ensure derived metrics are up to date
  const effectiveInputs = { 
    ...sampleInputs, 
    absentDays: computedAbsentDays,
    leaveDays: computedLeaveDays 
  };

  const executionContext: ExecutionContext = {};

  // Map all known calculation component names to their sample values
  for (const [displayName, inputKey] of Object.entries(CALC_COMPONENT_NAMES)) {
    const val = effectiveInputs[inputKey];
    const numVal = typeof val === 'boolean' ? (val ? 1 : 0) : (val as number);
    executionContext[displayName] = numVal;
    // Normalized UPPER_SNAKE_CASE alias (matches evaluator.ts lookup)
    executionContext[displayName.toUpperCase().replace(/\s+/g, '_')] = numVal;
  }

  // Also seed from calcComponentMap (id → name) so id-keyed refs work
  for (const [id, name] of Object.entries(calcComponentMap)) {
    const inputKey = CALC_COMPONENT_NAMES[name];
    if (inputKey !== undefined) {
      const val = sampleInputs[inputKey];
      const numVal = typeof val === 'boolean' ? (val ? 1 : 0) : (val as number);
      executionContext[id] = numVal;
      executionContext[name] = numVal;
      executionContext[name.toUpperCase().replace(/\s+/g, '_')] = numVal;
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Determine payable days factor (mirrors PayrollProcessPage logic)
  // -------------------------------------------------------------------------
  const calendarDays = sampleInputs.calendarDays || 30;
  const payableDays  = sampleInputs.payableDays;
  const payableDaysFactor = calendarDays > 0 ? payableDays / calendarDays : 1;

  // -------------------------------------------------------------------------
  // Step 3: Separate and prepare component lists
  // -------------------------------------------------------------------------
  const earningComps   = structureComponents.filter(c => c.component_type === 'earning');
  const deductionComps = structureComponents.filter(
    c => c.component_type === 'deduction' && c.statutory_component_id == null
  );
  // Statutory deductions: only include those that affect net pay (Employee Contribution)
  const statutoryComps = structureComponents.filter(
    c => c.component_type === 'deduction' && 
         c.statutory_component_id != null &&
         c.is_applied_in_calculation !== false
  );

  // Apply user-entered values to components
  function applyUserValues(comps: SalaryStructureComponent[]): SalaryStructureComponent[] {
    return comps.map(c => {
      const userVal = sampleInputs.componentValues[c.name];
      if (userVal !== undefined) {
        if (c.amount_type === 'percentage') {
          return { ...c, percentage_value: userVal };
        } else {
          return { ...c, amount: userVal };
        }
      }
      return { ...c };
    });
  }

  let processedEarnings  = applyUserValues(earningComps);
  let processedDeductions = applyUserValues(deductionComps);

  // -------------------------------------------------------------------------
  // Step 4: Proration (mirrors the applyFactor logic in PayrollProcessPage)
  // -------------------------------------------------------------------------
  const shouldProrate = payableDaysFactor < 1 && payableDaysFactor >= 0;

  if (shouldProrate) {
    const applyProration = (comps: SalaryStructureComponent[]): SalaryStructureComponent[] =>
      comps.map(comp => {
        if (
          comp.amount_type !== 'percentage' &&
          comp.amount &&
          comp.calculation_type !== 'expression' &&
          comp.name !== travelAllowanceComponentName &&
          comp.name !== 'Overtime'
        ) {
          const proratedAmount = comp.amount * payableDaysFactor;
          const { rounded } = applyRounding(proratedAmount, comp.rounding_type);
          return { ...comp, amount: rounded };
        }
        return comp;
      });

    processedEarnings  = applyProration(processedEarnings);
    processedDeductions = applyProration(processedDeductions);
  }

  // -------------------------------------------------------------------------
  // Step 5: Seed execution context with component base values
  // (mirrors the "seed context" step in PayrollProcessPage)
  // -------------------------------------------------------------------------
  const allComponents = [...processedEarnings, ...processedDeductions];

  allComponents.forEach(comp => {
    const seedVal = comp.calculation_type === 'expression'
      ? (sampleInputs.componentValues[comp.name] ?? comp.amount ?? 0)
      : (comp.amount || 0);
    executionContext[comp.name] = seedVal;
    executionContext[comp.name.toUpperCase().replace(/\s+/g, '_')] = seedVal;
  });

  // -------------------------------------------------------------------------
  // Step 6: Evaluate each component and build StepDetail
  // -------------------------------------------------------------------------
  function evaluateComponent(
    comp: SalaryStructureComponent,
    allComps: SalaryStructureComponent[],
    ctx: ExecutionContext
  ): { finalValue: number; step: StepDetail } {
    let rawValue = 0;
    let formulaText = '';
    let calculationBreakdown = '';
    let resolvedVariables: Record<string, number | boolean> = {};
    let roundingLabel = 'None';
    let stepError: string | undefined;
    let ast: any = null;

    // ----- Expression-based -----
    if (comp.calculation_type === 'expression' && (comp.expression_ast || comp.expression)) {
      formulaText = comp.expression || '(expression)';
      ast = comp.expression_ast || (comp.expression ? FormulaEngine.compile(comp.expression) : null);

      if (!ast) {
        stepError = 'Invalid or empty expression';
        rawValue = 0;
        calculationBreakdown = `Error: ${stepError}`;
      } else {
        // Collect variables from context that appear in formula
        try {
          const varNames = FormulaEngine.extractVariables(ast);
          varNames.forEach(v => {
            const val = ctx[v] ?? ctx[v.toUpperCase().replace(/\s+/g, '_')];
            if (val !== undefined) {
              resolvedVariables[v] = typeof val === 'boolean' ? val : Number(val);
            }
          });

          const result = FormulaEngine.executeAST(ast, ctx);
          if (result.success && typeof result.value === 'number') {
            rawValue = result.value;
            
            // Build a trace by replacing variable names with their values
            let traceHeader = formulaText;
            const sortedVarNames = Object.keys(resolvedVariables).sort((a, b) => b.length - a.length);
            sortedVarNames.forEach(name => {
              const value = resolvedVariables[name];
              const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
              const formattedVal = typeof value === 'number' ? fmt(value) : (value ? 'YES' : 'NO');
              traceHeader = traceHeader.replace(regex, formattedVal);
            });

            // Generate hierarchical trace
            const hierarchicalTrace = traceAST(ast, ctx, 0, comp.name);
            calculationBreakdown = [
              traceHeader,
              '--------------------------------',
              ...hierarchicalTrace.steps,
              '--------------------------------',
              `Final Result: ${fmt(rawValue)}`
            ].join('\n');
          } else {
            stepError = result.error || 'Expression evaluation failed';
            rawValue = 0;
            calculationBreakdown = `Error: ${stepError}`;
          }
        } catch (e) {
          stepError = e instanceof Error ? e.message : 'Unknown error';
          rawValue = 0;
          calculationBreakdown = `Error: ${stepError}`;
        }
      }

    // ----- Percentage-based -----
    } else if (comp.amount_type === 'percentage' && comp.percentage_value != null) {
      const refs = comp.reference_components || [];
      const baseAmount = refs.reduce((sum, ref) => {
        const refComp = allComps.find(c => c.name === ref);
        return sum + (refComp?.amount || 0);
      }, 0);
      const pct = Number(comp.percentage_value);
      rawValue = (baseAmount * pct) / 100;
      formulaText = `${pct}% of ${refs.length ? refs.join(' + ') : 'Base'}`;
      resolvedVariables = refs.reduce((acc, ref) => {
        const refComp = allComps.find(c => c.name === ref);
        acc[ref] = refComp?.amount || 0;
        return acc;
      }, {} as Record<string, number>);
      calculationBreakdown = `(${fmt(baseAmount)} × ${pct}%) = ${fmt(rawValue)}`;

    // ----- Value-based -----
    } else {
      rawValue = comp.amount || 0;
      const userVal = sampleInputs.componentValues[comp.name];
      formulaText = 'Fixed Value';

      if (shouldProrate && comp.name !== travelAllowanceComponentName && comp.name !== 'Overtime') {
        const originalVal = userVal ?? (comp.amount || 0);
        // amount is already prorated at this point
        formulaText = `${fmt(originalVal)} × ${fmt(payableDays)} / ${fmt(calendarDays)}`;
        resolvedVariables = {
          'Base Amount': originalVal,
          'Payable Days': payableDays,
          'Calendar Days': calendarDays,
        };
        calculationBreakdown = `${fmt(originalVal)} × ${fmt(payableDays)} / ${fmt(calendarDays)} = ${fmt(rawValue)}`;
      } else {
        resolvedVariables = { 'Value': rawValue };
        calculationBreakdown = `Fixed = ${fmt(rawValue)}`;
      }
    }

    // Apply rounding
    const { rounded, label } = applyRounding(rawValue, comp.rounding_type);
    roundingLabel = label !== 'None'
      ? `${label} → ${fmt(rounded)}`
      : 'None';

    return {
      finalValue: rounded,
      step: {
        componentId: comp.id || comp.name,
        componentName: comp.name,
        componentType: comp.component_type,
        calculationType: comp.calculation_type === 'expression'
          ? 'expression'
          : comp.amount_type === 'percentage' ? 'percentage' : 'value',
        formulaText,
        resolvedVariables,
        calculationBreakdown,
        rawValue,
        finalValue: rounded,
        roundingApplied: roundingLabel,
        error: stepError,
        ast: ast,
      },
    };
  }

  // Evaluate earnings
  const finalEarnings = processedEarnings.map(comp => {
    const { finalValue, step } = evaluateComponent(comp, allComponents, executionContext);
    steps.push(step);
    // Update context with computed value for subsequent percentage refs
    executionContext[comp.name] = finalValue;
    executionContext[comp.name.toUpperCase().replace(/\s+/g, '_')] = finalValue;
    return { ...comp, amount: finalValue };
  });

  // Inject OT if user entered otAmount
  if (sampleInputs.otAmount > 0) {
    const existingOT = finalEarnings.find(c => c.name.toLowerCase() === 'overtime');
    if (!existingOT) {
      finalEarnings.push({
        id: 'dynamic_ot',
        key: 'overtime',
        name: 'Overtime',
        component_type: 'earning',
        amount_type: 'value',
        amount: sampleInputs.otAmount,
        is_taxable: false,
        statutory_component_id: null,
        editability: 'fixed',
        is_applied_in_calculation: true,
        is_locked: true,
        value_set: 'at_executing',
      });
      steps.push({
        componentId: 'dynamic_ot',
        componentName: 'Overtime',
        componentType: 'earning',
        calculationType: 'value',
        formulaText: 'OT Hours × Rate (from OT structure)',
        resolvedVariables: { 'OT Hours': sampleInputs.otHours, 'OT Amount': sampleInputs.otAmount },
        calculationBreakdown: `OT Amount = ${fmt(sampleInputs.otAmount)}`,
        rawValue: sampleInputs.otAmount,
        finalValue: sampleInputs.otAmount,
        roundingApplied: 'None',
      });
    }
    executionContext['Overtime'] = sampleInputs.otAmount;
    executionContext['OVERTIME'] = sampleInputs.otAmount;
  }

  // Re-build allComponents with computed earning values for deduction percentage refs
  const allCompsAfterEarnings = [...finalEarnings, ...processedDeductions];

  // Evaluate deductions
  const finalDeductions = processedDeductions.map(comp => {
    const { finalValue, step } = evaluateComponent(comp, allCompsAfterEarnings, executionContext);
    steps.push(step);
    executionContext[comp.name] = finalValue;
    executionContext[comp.name.toUpperCase().replace(/\s+/g, '_')] = finalValue;
    return { ...comp, amount: finalValue };
  });

  // Advance deduction step
  if (sampleInputs.advanceDeduction > 0) {
    steps.push({
      componentId: 'advance_deduction',
      componentName: 'Advance Recovery',
      componentType: 'deduction',
      calculationType: 'value',
      formulaText: 'Advance deduction for the month',
      resolvedVariables: { 'Advance': sampleInputs.advanceDeduction },
      calculationBreakdown: `Advance Recovery = ${fmt(sampleInputs.advanceDeduction)}`,
      rawValue: sampleInputs.advanceDeduction,
      finalValue: sampleInputs.advanceDeduction,
      roundingApplied: 'None',
    });
  }

  // -------------------------------------------------------------------------
  // Statutory deductions (PF / ESI / PT / TDS)
  // Only included when statutoryEnabled[comp.name] === true
  // -------------------------------------------------------------------------
  const allCompsForStatutory = [...finalEarnings, ...finalDeductions];
  const finalStatutory: SalaryStructureComponent[] = [];

  for (const comp of statutoryComps) {
    if (!sampleInputs.statutoryEnabled[comp.name]) continue; // skip if not enabled

    const userVal    = sampleInputs.componentValues[comp.name];
    const isPct      = comp.amount_type === 'percentage';
    let   rawValue   = 0;
    let   formulaText = '';
    let   breakdown   = '';
    let   resolvedVars: Record<string, number> = {};

    if (isPct) {
      // User enters a percentage override; apply it to reference components or gross
      const pct  = userVal ?? Number(comp.percentage_value ?? 0);
      const refs = comp.reference_components || [];
      const base = refs.length
        ? refs.reduce((s, ref) => {
            const rc = allCompsForStatutory.find(c => c.name === ref);
            return s + (rc?.amount || 0);
          }, 0)
        : finalEarnings.reduce((s, c) => s + (c.amount || 0), 0); // fallback: gross
      rawValue     = (base * pct) / 100;
      formulaText  = `${pct}% of ${refs.length ? refs.join(' + ') : 'Gross'}`;
      resolvedVars = refs.length
        ? refs.reduce((acc, ref) => { const rc = allCompsForStatutory.find(c => c.name === ref); acc[ref] = rc?.amount || 0; return acc; }, {} as Record<string, number>)
        : { 'Gross Salary': finalEarnings.reduce((s, c) => s + (c.amount || 0), 0) };
      breakdown    = `(${fmt(base)} × ${pct}%) = ${fmt(rawValue)}`;
    } else {
      rawValue     = userVal ?? comp.amount ?? 0;
      formulaText  = 'Fixed statutory deduction';
      resolvedVars = { 'Value': rawValue };
      breakdown    = `Fixed = ${fmt(rawValue)}`;
    }

    const { rounded, label } = applyRounding(rawValue, comp.rounding_type);
    finalStatutory.push({ ...comp, amount: rounded });

    steps.push({
      componentId:          comp.id || comp.name,
      componentName:        comp.name,
      componentType:        'deduction',
      calculationType:      isPct ? 'percentage' : 'value',
      formulaText,
      resolvedVariables:    resolvedVars,
      calculationBreakdown: breakdown,
      rawValue,
      finalValue:           rounded,
      roundingApplied:      label !== 'None' ? `${label} → ${fmt(rounded)}` : 'None',
    });
  }

  // -------------------------------------------------------------------------
  // Step 7: Compute totals
  // -------------------------------------------------------------------------
  const grossSalary = finalEarnings
    .filter(c => c.is_applied_in_calculation !== false)
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  const totalDeductions =
    finalDeductions.filter(c => c.is_applied_in_calculation !== false).reduce((sum, c) => sum + (c.amount || 0), 0)
    + finalStatutory.reduce((sum, c) => sum + (c.amount || 0), 0)
    + sampleInputs.advanceDeduction;

  const netSalary = grossSalary - totalDeductions;

  return {
    earnings:         finalEarnings,
    deductions:       [...finalDeductions, ...finalStatutory],
    grossSalary,
    totalDeductions,
    netSalary,
    steps,
    payableDaysFactor,
    errors,
  };
}

/**
 * Recursively traces AST execution to build a hierarchical breakdown
 */
/**
 * Recursively traces AST execution to build a hierarchical breakdown
 */
function traceAST(node: any, ctx: any, depth = 0, compName?: string): { value: any, steps: string[], description: string } {
  const indent = '   '.repeat(depth);
  const steps: string[] = [];

  const fmtVal = (v: any) => {
    if (typeof v === 'number') return v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  };

  if (!node) return { value: 0, steps: [], description: '' };

  switch (node.type) {
    case 'NUMBER':
    case 'BOOLEAN':
    case 'STRING':
      return { value: node.value, steps: [], description: fmtVal(node.value) };

    case 'VARIABLE': {
      const varName = String(node.value);
      const val = ctx[varName] ?? ctx[varName.toUpperCase().replace(/\s+/g, '_')] ?? 0;
      return { value: val, steps: [], description: varName };
    }

    case 'BINARY_OP': {
      const left = traceAST(node.left, ctx, depth + 1);
      const right = traceAST(node.right, ctx, depth + 1);
      steps.push(...left.steps);
      steps.push(...right.steps);
      
      let res: any;
      switch (node.operator) {
        case '+': res = left.value + right.value; break;
        case '-': res = left.value - right.value; break;
        case '*': res = left.value * right.value; break;
        case '/': res = right.value === 0 ? 0 : left.value / right.value; break;
        case '>': res = left.value > right.value; break;
        case '<': res = left.value < right.value; break;
        case '>=': res = left.value >= right.value; break;
        case '<=': res = left.value <= right.value; break;
        case '==': res = left.value == right.value; break;
        case '!=': res = left.value != right.value; break;
        case '&&': res = left.value && right.value; break;
        case '||': res = left.value || right.value; break;
        default: res = 0;
      }
      
      const leftShow = left.description === fmtVal(left.value) ? left.description : `${left.description} (${fmtVal(left.value)})`;
      const rightShow = right.description === fmtVal(right.value) ? right.description : `${right.description} (${fmtVal(right.value)})`;
      
      steps.push(`${indent}├─ ${leftShow} ${node.operator} ${rightShow} ➜ ${fmtVal(res)}`);
      return { value: res, steps, description: `(${left.description} ${node.operator} ${right.description})` };
    }

    case 'CONDITIONAL': {
      const cond = traceAST(node.condition, ctx, depth + 1);
      steps.push(`${indent}┌─ Checking Condition: ${cond.description}`);
      steps.push(...cond.steps.map(s => `${indent}│  ${s.trim().replace(/^[├└]─ /, '')}`));
      
      const contextSuffix = compName ? ` for ${compName}` : '';
      if (cond.value) {
        steps.push(`${indent}├─ ✅ Check Passed: TRUE`);
        steps.push(`${indent}└─ ➜ Executing THEN branch${contextSuffix}`);
        const res = traceAST(node.trueBranch, ctx, depth + 1);
        steps.push(...res.steps.map(s => `${indent}   ${s.trim()}`));
        return { value: res.value, steps, description: res.description };
      } else {
        steps.push(`${indent}├─ ❌ Check Failed: FALSE`);
        steps.push(`${indent}└─ ➜ Executing ELSE branch${contextSuffix}`);
        const res = traceAST(node.falseBranch, ctx, depth + 1);
        steps.push(...res.steps.map(s => `${indent}   ${s.trim()}`));
        return { value: res.value, steps, description: res.description };
      }
    }
    
    case 'FUNCTION_CALL': {
      const args = (node.arguments || []).map((a: any) => traceAST(a, ctx, depth + 1));
      args.forEach((a: any) => steps.push(...a.steps));
      
      const result = FormulaEngine.executeAST(node, ctx);
      const resVal = result.success ? result.value : 0;
      
      steps.push(`${indent}└─ ${node.name}(${args.map((a: any) => fmtVal(a.value)).join(', ')}) ➜ ${fmtVal(resVal)}`);
      return { value: resVal, steps, description: `${node.name}(...)` };
    }

    case 'UNARY_OP': {
      const operand = traceAST(node.operand, ctx, depth + 1);
      steps.push(...operand.steps);
      let res: any;
      switch (node.operator) {
        case '-': res = -operand.value; break;
        case '!': res = !operand.value; break;
        default: res = operand.value;
      }
      steps.push(`${indent}└─ ${node.operator}${fmtVal(operand.value)} ➜ ${fmtVal(res)}`);
      return { value: res, steps, description: `${node.operator}${operand.description}` };
    }

    default:
      return { value: 0, steps: [], description: '' };
  }
}