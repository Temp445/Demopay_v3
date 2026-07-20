import React, { useEffect, useState } from 'react';
import { Clock, Users, AlertTriangle } from 'lucide-react';

interface DepartmentRulesProps {
  department: string;
  onValidationChange: (status: { valid: boolean; messages: string[] }) => void;
}

const departmentRules = {
  nursing: {
    minRestHours: 8,
    maxConsecutiveShifts: 4,
    requiredSkills: ['medical', 'patient-care']
  },
  emergency: {
    minRestHours: 10,
    maxConsecutiveShifts: 3,
    requiredSkills: ['emergency-response', 'critical-care']
  },
  production: {
    minRestHours: 12,
    maxConsecutiveShifts: 5,
    requiredSkills: ['machine-operation']
  }
};

export default function DepartmentRules({
  department,
  onValidationChange
}: DepartmentRulesProps) {
  const [rules, setRules] = useState<typeof departmentRules[keyof typeof departmentRules] | null>(null);

  useEffect(() => {
    const departmentConfig = departmentRules[department as keyof typeof departmentRules];
    setRules(departmentConfig || null);

    // Validate department rules
    if (departmentConfig) {
      onValidationChange({
        valid: true,
        messages: [
          `Minimum rest period: ${departmentConfig.minRestHours} hours`,
          `Maximum consecutive shifts: ${departmentConfig.maxConsecutiveShifts}`,
          `Required skills: ${departmentConfig.requiredSkills.join(', ')}`
        ]
      });
    } else {
      onValidationChange({
        valid: true,
        messages: ['No specific department rules apply']
      });
    }
  }, [department, onValidationChange]);

  if (!rules) return null;

  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <h4 className="text-sm font-medium text-gray-900 mb-4">
        Department Rules
      </h4>
      
      <div className="space-y-4">
        <div className="flex items-center">
          <Clock className="h-5 w-5 text-gray-400 mr-2" />
          <div>
            <p className="text-sm font-medium text-gray-700">
              Minimum Rest Period
            </p>
            <p className="text-sm text-gray-500">
              {rules.minRestHours} hours between shifts
            </p>
          </div>
        </div>

        <div className="flex items-center">
          <Users className="h-5 w-5 text-gray-400 mr-2" />
          <div>
            <p className="text-sm font-medium text-gray-700">
              Maximum Consecutive Shifts
            </p>
            <p className="text-sm text-gray-500">
              {rules.maxConsecutiveShifts} shifts
            </p>
          </div>
        </div>

        <div className="flex items-center">
          <AlertTriangle className="h-5 w-5 text-gray-400 mr-2" />
          <div>
            <p className="text-sm font-medium text-gray-700">
              Required Skills
            </p>
            <p className="text-sm text-gray-500">
              {rules.requiredSkills.join(', ')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}