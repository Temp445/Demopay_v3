import React from 'react';
import { FileText, Calendar } from 'lucide-react';
import { ExpressionTemplate } from '../../../lib/formula-engine';

interface TemplateListProps {
  templates: ExpressionTemplate[];
  onSelect: (template: ExpressionTemplate) => void;
}

export default function TemplateList({ templates, onSelect }: TemplateListProps) {
  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'eligibility':
        return 'bg-blue-100 text-blue-800';
      case 'value_calculation':
        return 'bg-green-100 text-green-800';
      case 'validation':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'eligibility':
        return 'Eligibility';
      case 'value_calculation':
        return 'Calculation';
      case 'validation':
        return 'Validation';
      default:
        return category;
    }
  };

  if (templates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No templates yet</h3>
        <p className="mt-1 text-sm text-gray-500">
          Create your first expression template to get started
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Saved Templates</h2>
        <p className="mt-1 text-sm text-gray-500">Click on a template to load and edit it</p>
      </div>

      <div className="divide-y divide-gray-200">
        {templates.map((template) => (
          <div
            key={template.id}
            onClick={() => onSelect(template)}
            className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center">
                  <h3 className="text-sm font-medium text-gray-900 truncate">{template.name}</h3>
                  <span
                    className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${getCategoryBadgeColor(
                      template.category
                    )}`}
                  >
                    {getCategoryLabel(template.category)}
                  </span>
                  {!template.isValid && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                      Invalid
                    </span>
                  )}
                </div>

                {template.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-1">{template.description}</p>
                )}

                <div className="mt-2 flex items-center text-xs text-gray-500">
                  <code className="bg-gray-100 px-2 py-1 rounded font-mono text-xs line-clamp-1">
                    {template.expressionText}
                  </code>
                </div>

                <div className="mt-2 flex items-center text-xs text-gray-500 space-x-4">
                  {template.variablesUsed && template.variablesUsed.length > 0 && (
                    <span>Variables: {template.variablesUsed.join(', ')}</span>
                  )}
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {new Date(template.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
