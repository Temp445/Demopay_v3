import React from 'react';

interface OperatorPanelProps {
  onInsert: (token: string) => void;
}

export default function OperatorPanel({ onInsert }: OperatorPanelProps) {
  const operators = [
    { label: '+', value: '+', desc: 'Addition' },
    { label: '-', value: '-', desc: 'Subtraction' },
    { label: '*', value: '*', desc: 'Multiplication' },
    { label: '/', value: '/', desc: 'Division' },
    { label: '%', value: '%', desc: 'Modulo' },
    { label: '>', value: '>', desc: 'Greater than' },
    { label: '<', value: '<', desc: 'Less than' },
    { label: '>=', value: '>=', desc: 'Greater or equal' },
    { label: '<=', value: '<=', desc: 'Less or equal' },
    { label: '==', value: '==', desc: 'Equals' },
    { label: '!=', value: '!=', desc: 'Not equals' },
    { label: 'AND', value: '&&', desc: 'Logical AND' },
    { label: 'OR', value: '||', desc: 'Logical OR' },
    { label: 'NOT', value: '!', desc: 'Logical NOT' },
  ];

  const keywords = [
    { label: 'IF', value: 'IF', desc: 'Conditional start' },
    { label: 'THEN', value: 'THEN', desc: 'True branch' },
    { label: 'ELSE', value: 'ELSE', desc: 'False branch' },
    { label: '(', value: '(', desc: 'Open parenthesis' },
    { label: ')', value: ')', desc: 'Close parenthesis' },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-4">
      {/* <h3 className="text-sm font-semibold text-gray-900 mb-3">Operators & Keywords</h3> */}
       
      <div className="mb-4">
        <h4 className="text-xs font-medium text-gray-700 mb-2">Arithmetic & Comparison</h4>
        <div className="grid grid-cols-5 gap-1">
          {operators.slice(0, 11).map((op) => (
            <button
              key={op.value}
              onClick={() => onInsert(op.value)}
              className="px-2 py-1 text-xs font-mono bg-gray-100 hover:bg-indigo-100 rounded text-center"
              title={op.desc}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <h4 className="text-xs font-medium text-gray-700 mb-2">Logical</h4>
        <div className="grid grid-cols-3 gap-1">
          {operators.slice(11).map((op) => (
            <button
              key={op.value}
              onClick={() => onInsert(op.value)}
              className="px-2 py-1 text-xs font-mono bg-gray-100 hover:bg-indigo-100 rounded text-center"
              title={op.desc}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-medium text-gray-700 mb-2">Keywords</h4>
        <div className="grid grid-cols-3 gap-1">
          {keywords.map((kw) => (
            <button
              key={kw.value}
              onClick={() => onInsert(kw.value)}
              className="px-2 py-1 text-xs font-mono bg-green-100 hover:bg-green-200 rounded text-center"
              title={kw.desc}
            >
              {kw.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
