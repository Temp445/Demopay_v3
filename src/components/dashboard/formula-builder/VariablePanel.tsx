import React, { useMemo } from 'react';
import { ExpressionVariable } from '../../../lib/formula-engine';
import { Database, Calendar, Calculator, Cog } from 'lucide-react';

interface VariablePanelProps {
  variables: ExpressionVariable[];
  onInsert: (token: string) => void;
}

/**
 * VariablePanel - Displays available variables for formula building
 *
 * DATA SOURCE: Now uses payroll_components table (previously expression_variables)
 * Variables are grouped by component_category field from payroll_components:
 * - 'general' components → 'salary_component' category
 * - 'calculation' components → 'calculation_parameter' category
 */
export default function VariablePanel({ variables, onInsert }: VariablePanelProps) {
  // Group variables by category for organized display
  const categorized = useMemo(() => {
    const groups: Record<string, ExpressionVariable[]> = {
      salary_component: [], // General payroll components
      statutory_component: [], // Statutory payroll components
      calculation_parameter: [], // Calculation payroll components
      leave_parameter: [], // Leave parameters from payroll_components
      shift_parameter: [], // Shift parameters from payroll_components
      system: [], // System variables
    };

    variables.forEach((v) => {
      if (groups[v.category]) {
        groups[v.category].push(v);
      }
    });

    return groups;
  }, [variables]);

  const categoryIcons: Record<string, any> = {
    salary_component: Database,
    statutory_component: Database,
    calculation_parameter: Calculator,
    leave_parameter: Calendar,
    shift_parameter: Calendar,
    system: Cog,
  };

  const categoryLabels: Record<string, string> = {
    salary_component: 'Salary Components',
    statutory_component: 'Statutory Components',
    calculation_parameter: 'Calculation Parameters',
    leave_parameter: 'Leave Parameters',
    shift_parameter: 'Shift Parameters',
    system: 'System Variables',
  };

  return ( 
    <div className="bg-white rounded-lg shadow p-4">
      {/* <h3 className="text-sm font-semibold text-gray-900 mb-3">Variables</h3> */}
      <div className="space-y-4">
        {Object.entries(categorized).map(([category, vars]) => {
          if (vars.length === 0) return null;
          const Icon = categoryIcons[category] || Database;

          return (
            <div key={category}>
              <div className="flex items-center mb-2">
                <Icon className="h-4 w-4 text-indigo-600 mr-1" />
                <h4 className="text-xs font-medium text-gray-700">
                  {categoryLabels[category]}
                </h4>
              </div>
              <div className="space-y-1">
                {vars.map((variable) => (
                  <button
                    key={variable.id}
                    onClick={() => onInsert(variable.variableName)}
                    className="w-full text-left px-2 py-1 text-xs rounded hover:bg-indigo-50 text-indigo-700 font-mono"
                    title={variable.description}
                  >
                    {variable.variableName}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
