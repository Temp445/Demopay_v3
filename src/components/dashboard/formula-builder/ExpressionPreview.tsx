import React from 'react';
import { Play, AlertCircle, CheckCircle } from 'lucide-react';

interface ExpressionPreviewProps {
  expression: string;
  context: Record<string, any>;
  onContextChange: (context: Record<string, any>) => void;
  onTest: () => void;
  result: any;
  show: boolean;
}

export default function ExpressionPreview({ context, onContextChange, onTest, result, show }: ExpressionPreviewProps) {
  const handleAddVariable = () => {
    const name = prompt('Enter variable name (e.g., BASIC, AbsentDays):');
    if (!name) return;

    const value = prompt('Enter value:');
    if (value === null) return;

    const parsed = value === 'true' ? true : value === 'false' ? false : !isNaN(Number(value)) ? Number(value) : value;
    onContextChange({ ...context, [name]: parsed });
  };

  const handleRemoveVariable = (key: string) => {
    const newContext = { ...context };
    delete newContext[key];
    onContextChange(newContext);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Test Expression</h2>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">Test Context</label>
          <button
            onClick={handleAddVariable}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            + Add Variable
          </button>
        </div>

        {Object.keys(context).length === 0 ? (
          <p className="text-sm text-gray-500 italic">No test variables. Click "Add Variable" to add values for testing.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(context).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm font-mono">
                  <span className="font-bold text-indigo-700">{key}</span> = {String(value)}
                </span>
                <button
                  onClick={() => handleRemoveVariable(key)}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {show && result && (
        <div className={`p-4 rounded-md ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-start">
            {result.success ? (
              <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h3 className={`text-sm font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.success ? 'Execution Successful' : 'Execution Failed'}
              </h3>
              {result.success ? (
                <div className="mt-2">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Result:</span>{' '}
                    <span className="font-mono font-bold text-lg">{JSON.stringify(result.value)}</span>
                  </p>
                  {result.executionTimeMs !== undefined && (
                    <p className="text-xs text-gray-600 mt-1">
                      Execution time: {result.executionTimeMs}ms
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm text-red-700">{result.error}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
