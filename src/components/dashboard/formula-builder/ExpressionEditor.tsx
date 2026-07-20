import React from 'react';
import { Code } from 'lucide-react';

interface ExpressionEditorProps {
  expression: string;
  onChange: (value: string) => void;
  validation?: any;
  onInsert?: (token: string) => void;
}

export default function ExpressionEditor({ expression, onChange, validation }: ExpressionEditorProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Code className="h-5 w-5 text-gray-700 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Expression Editor</h2>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={expression}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          rows={8}
          placeholder="Enter your expression here...

Examples:
  IF AbsentDays <= 1 THEN 1000 ELSE 0
  BASIC * 0.4
  ROUND(BASIC * 0.12, 2)
  IF PFApplicable == TRUE THEN BASIC * 0.12 ELSE 0"
          style={{
            backgroundColor: validation?.isValid === false ? '#fef2f2' : '#ffffff',
          }}
        />

        <div className="mt-2 text-xs text-gray-500">
          Click on variables, operators, or functions from the left panels to insert them into your expression
        </div>
      </div>
    </div>
  );
}
