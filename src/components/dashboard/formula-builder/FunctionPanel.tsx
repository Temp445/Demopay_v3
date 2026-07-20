import React from 'react';
import { FunctionRegistry } from '../../../lib/formula-engine';

interface FunctionPanelProps {
  onInsert: (token: string) => void;
}

export default function FunctionPanel({ onInsert }: FunctionPanelProps) {
  const functions = FunctionRegistry.getAllByCategory();

  const handleInsertFunction = (funcName: string) => {
    onInsert(funcName + '()');
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      {/* <h3 className="text-sm font-semibold text-gray-900 mb-3">Functions</h3> */}
 
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-medium text-gray-700 mb-2">Mathematical</h4>
          <div className="space-y-1">
            {functions.mathematical?.map((func) => (
              <button
                key={func.name}
                onClick={() => handleInsertFunction(func.name)}
                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-green-50 text-green-700 font-mono"
                title={func.description}
              >
                {func.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium text-gray-700 mb-2">String</h4>
          <div className="space-y-1">
            {functions.string?.map((func) => (
              <button
                key={func.name}
                onClick={() => handleInsertFunction(func.name)}
                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-green-50 text-green-700 font-mono"
                title={func.description}
              >
                {func.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
