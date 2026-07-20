import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

interface ValidationStatusProps {
  status: {
    valid: boolean;
    messages: string[];
  };
}

export default function ValidationStatus({ status }: ValidationStatusProps) {
  if (!status.messages.length) return null;

  return (
    <div className={`rounded-md p-4 ${
      status.valid ? 'bg-green-50' : 'bg-red-50'
    }`}>
      <div className="flex">
        {status.valid ? (
          <CheckCircle className="h-5 w-5 text-green-400" />
        ) : (
          <XCircle className="h-5 w-5 text-red-400" />
        )}
        <div className="ml-3">
          <h3 className={`text-sm font-medium ${
            status.valid ? 'text-green-800' : 'text-red-800'
          }`}>
            Validation Status
          </h3>
          <div className="mt-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              {status.messages.map((message, index) => (
                <li key={index} className={
                  status.valid ? 'text-green-700' : 'text-red-700'
                }>
                  {message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}