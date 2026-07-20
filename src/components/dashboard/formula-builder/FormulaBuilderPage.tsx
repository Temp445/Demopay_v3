import React, { useEffect, useState } from 'react';
import { AlertCircle, Save, Play, Trash2, Plus, FileText, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useExpressionStore } from '../../../stores/expressionStore';
import { ExpressionTemplate } from '../../../lib/formula-engine';
import VariablePanel from './VariablePanel';
import OperatorPanel from './OperatorPanel';
import FunctionPanel from './FunctionPanel';
import ExpressionEditor from './ExpressionEditor';
import ExpressionPreview from './ExpressionPreview';
import TemplateList from './TemplateList';

interface FormulaBuilderPageProps {
  isModal?: boolean;
  onSave?: (expression: string, ast: any) => void;
  onCancel?: () => void;
  initialExpression?: string;
  initialAst?: any;
}

export default function FormulaBuilderPage({
  isModal = false,
  onSave,
  onCancel,
  initialExpression = '',
  initialAst = null,
}: FormulaBuilderPageProps = {}) {
  const {
    templates,
    variables,
    loading,
    error,
    currentTemplate,
    fetchTemplates,
    fetchVariables,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    setCurrentTemplate,
    validateExpression,
    executeExpression,
    initializeDefaultVariables,
  } = useExpressionStore();

  const [expression, setExpression] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [category, setCategory] = useState<'eligibility' | 'value_calculation' | 'validation'>('value_calculation');
  const [validationResult, setValidationResult] = useState<any>(null);
  const [testContext, setTestContext] = useState<Record<string, any>>({});
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<'variables' | 'operators' | 'functions'>('variables');
  const [showTestSection, setShowTestSection] = useState(false);

  useEffect(() => {
    if (!isModal) {
      fetchTemplates();
    }
    fetchVariables();

    if (variables.length === 0) {
      initializeDefaultVariables();
    }

    // Initialize with passed expression when in modal mode
    if (isModal && initialExpression) {
      setExpression(initialExpression);
    }
  }, []);

  useEffect(() => {
    if (currentTemplate) {
      setExpression(currentTemplate.expressionText);
      setTemplateName(currentTemplate.name);
      setTemplateDescription(currentTemplate.description || '');
      setCategory(currentTemplate.category);
    }
  }, [currentTemplate]);

  useEffect(() => {
    if (expression.trim()) {
      const result = validateExpression(expression);
      setValidationResult(result);
    } else {
      setValidationResult(null);
    }
  }, [expression]);

  const handleInsertToken = (token: string) => {
    setExpression((prev) => (prev ? `${prev} ${token}` : token));
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    if (!expression.trim()) {
      alert('Please enter an expression');
      return;
    }

    const validation = validateExpression(expression);
    if (!validation.isValid) {
      alert(`Expression has errors: ${validation.errors.join(', ')}`);
      return;
    }

    const ast = useExpressionStore.getState().compileExpression(expression);
    if (!ast) {
      alert('Failed to compile expression');
      return;
    }

    const templateData: Partial<ExpressionTemplate> = {
      name: templateName,
      description: templateDescription,
      category,
      expressionText: expression,
      expressionAst: ast,
      variablesUsed: validation.variables,
      dependencies: validation.dependencies,
      isValid: validation.isValid,
    };

    if (currentTemplate) {
      const success = await updateTemplate(currentTemplate.id, templateData);
      if (success) {
        alert('Template updated successfully');
        handleClear();
      }
    } else {
      const result = await createTemplate(templateData);
      if (result) {
        alert('Template created successfully');
        handleClear();
      }
    }
  };

  const handleClear = () => {
    setExpression('');
    setTemplateName('');
    setTemplateDescription('');
    setCategory('value_calculation');
    setCurrentTemplate(null);
    setValidationResult(null);
    setTestContext({});
    setPreviewResult(null);
  };

  const handleTest = () => {
    if (!expression.trim()) {
      alert('Please enter an expression');
      return;
    }

    // Auto-populate missing variables with default values
    const updatedContext = { ...testContext };
    if (validationResult?.variables) {
      validationResult.variables.forEach((variable: string) => {
        // Check if variable exists in context (case-insensitive)
        const existsInContext = Object.keys(updatedContext).some(
          key => key.toUpperCase() === variable.toUpperCase()
        );

        if (!existsInContext) {
          // Add missing variable with default value of 0
          updatedContext[variable] = 0;
        }
      });

      // Update test context if new variables were added
      if (Object.keys(updatedContext).length > Object.keys(testContext).length) {
        setTestContext(updatedContext);
      }
    }

    const result = executeExpression(expression, updatedContext);
    setPreviewResult(result);
    setShowPreview(true);
  };

  const handleDelete = async () => {
    if (!currentTemplate) return;

    if (confirm(`Are you sure you want to delete "${currentTemplate.name}"?`)) {
      const success = await deleteTemplate(currentTemplate.id);
      if (success) {
        alert('Template deleted successfully');
        handleClear();
      }
    }
  };

  const handleSaveExpression = () => {
    if (!expression.trim()) {
      alert('Please enter an expression');
      return;
    }

    const validation = validateExpression(expression);
    if (!validation.isValid) {
      alert(`Expression has errors: ${validation.errors.join(', ')}`);
      return;
    }

    const ast = useExpressionStore.getState().compileExpression(expression);
    if (!ast) {
      alert('Failed to compile expression');
      return;
    }

    if (onSave) {
      onSave(expression, ast);
    }
  };

  return (
    <div className={isModal ? "px-3 py-2" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"}>
      {!isModal && (
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Formula Builder</h1>
          <p className="mt-2 text-sm text-gray-600">
            Create and manage dynamic expressions for payroll calculations and eligibility rules
          </p>
        </div>
      )}

      {error && (
        <div className={`rounded-md bg-red-50 ${isModal ? 'p-2 mb-3' : 'p-4 mb-6'}`}>
          <div className="flex">
            <AlertCircle className={`text-red-400 ${isModal ? 'h-4 w-4' : 'h-5 w-5'}`} />
            <div className="ml-2">
              <h3 className={`font-medium text-red-800 ${isModal ? 'text-xs' : 'text-sm'}`}>{error}</h3>
            </div>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 ${isModal ? 'lg:grid-cols-3 gap-3' : 'lg:grid-cols-4 gap-6'}`}>
        {/* Left Sidebar - Compact Tabbed Layout for Modal */}
        <div className={`${isModal ? 'lg:col-span-1' : 'lg:col-span-1'} ${isModal ? 'space-y-2' : 'space-y-4'}`}>
          {isModal ? (
            // Compact tabbed view for modal mode
            <div className="bg-white rounded-lg shadow flex flex-col" style={{ height: '420px' }}>
              {/* Tab Headers */}
              <div className="flex border-b">
                <button
                  onClick={() => setActiveTab('variables')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'variables'
                      ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  Variables
                </button>
                <button
                  onClick={() => setActiveTab('operators')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'operators'
                      ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  Operators
                </button>
                <button
                  onClick={() => setActiveTab('functions')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'functions'
                      ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  Functions
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-2 overflow-y-auto flex-1">
                {activeTab === 'variables' && (
                  <VariablePanel
                    variables={variables}
                    onInsert={handleInsertToken}
                  />
                )}
                {activeTab === 'operators' && (
                  <OperatorPanel
                    onInsert={handleInsertToken}
                  />
                )}
                {activeTab === 'functions' && (
                  <FunctionPanel
                    onInsert={handleInsertToken}
                  />
                )}
              </div>
            </div>
          ) : (
            // Original stacked view for full page mode
            <>
              {/* VARIABLES */}
              <div className="bg-white rounded-lg shadow h-56 flex flex-col">
                <div className="px-3 py-1 border-b text-sm font-medium">
                  Variables
                </div>
                <div className="p-3 overflow-y-auto flex-1">
                  <VariablePanel
                    variables={variables}
                    onInsert={handleInsertToken}
                  />
                </div>
              </div>

              {/* OPERATORS */}
              <div className="bg-white rounded-lg shadow h-56 flex flex-col">
                <div className="px-3 py-1 border-b text-sm font-medium">
                  Operators & Keywords
                </div>
                <div className="p-3 overflow-y-auto flex-1">
                  <OperatorPanel
                    onInsert={handleInsertToken}
                  />
                </div>
              </div>

              {/* FUNCTIONS */}
              <div className="bg-white rounded-lg shadow h-56 flex flex-col">
                <div className="px-3 py-1 border-b text-sm font-medium">
                  Functions
                </div>
                <div className="p-3 overflow-y-auto flex-1">
                  <FunctionPanel
                    onInsert={handleInsertToken}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Main Content Area */}
        <div className={`${isModal ? 'lg:col-span-2 space-y-3' : 'lg:col-span-3 space-y-6'}`}>
          {!isModal && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Expression Details</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter template name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={2}
                    placeholder="Enter template description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="eligibility">Eligibility Condition</option>
                    <option value="value_calculation">Value Calculation</option>
                    <option value="validation">Validation Rule</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Expression Editor - Compact in Modal */}
          <div className={`bg-white rounded-lg shadow ${isModal ? 'p-3' : 'p-6'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <h2 className={`font-semibold text-gray-900 ${isModal ? 'text-sm' : 'text-lg'}`}>Expression Editor</h2>
              </div>
            </div>

            <div className="relative">
              <textarea
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                className={`w-full border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y ${isModal ? 'px-2 py-2 text-xs' : 'px-4 py-3 text-sm'
                  }`}
                rows={isModal ? 5 : 8}
                placeholder="Enter your expression here...

Examples:
  IF AbsentDays <= 1 THEN 1000 ELSE 0
  BASIC * 0.4
  ROUND(BASIC * 0.12, 2)
  IF PFApplicable == TRUE THEN BASIC * 0.12 ELSE 0"
                style={{
                  backgroundColor: validationResult?.isValid === false ? '#fef2f2' : '#ffffff',
                }}
              />

              <div className={`mt-1 text-gray-500 ${isModal ? 'text-xs' : 'text-xs'}`}>
                Click on variables, operators, or functions from the {isModal ? 'tabs' : 'left panels'} to insert them
              </div>
            </div>
          </div>

          {/* Validation Result - Compact in Modal */}
          {validationResult && (
            <div
              className={`rounded-md ${isModal ? 'p-2' : 'p-4'} ${validationResult.isValid
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
                }`}
            >
              <div className="flex">
                <div className="flex-shrink-0">
                  {validationResult.isValid ? (
                    <svg className={`text-green-400 ${isModal ? 'h-4 w-4' : 'h-5 w-5'}`} fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <AlertCircle className={`text-red-400 ${isModal ? 'h-4 w-4' : 'h-5 w-5'}`} />
                  )}
                </div>
                <div className={isModal ? 'ml-2' : 'ml-3'}>
                  <h3
                    className={`font-medium ${isModal ? 'text-xs' : 'text-sm'} ${validationResult.isValid ? 'text-green-800' : 'text-red-800'
                      }`}
                  >
                    {validationResult.isValid
                      ? 'Expression is valid'
                      : `Validation errors: ${validationResult.errors.join(', ')}`}
                  </h3>
                  {validationResult.variables.length > 0 && (
                    <div className={`mt-1 text-gray-700 ${isModal ? 'text-xs' : 'text-sm'}`}>
                      <span className="font-medium">Variables:</span>{' '}
                      {validationResult.variables.join(', ')}
                    </div>
                  )}
                  {validationResult.dependencies.length > 0 && (
                    <div className={`mt-1 text-gray-700 ${isModal ? 'text-xs' : 'text-sm'}`}>
                      <span className="font-medium">Dependencies:</span>{' '}
                      {validationResult.dependencies.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Test Section - Collapsible in Modal */}
          {isModal ? (
            <div className="bg-white rounded-lg shadow">
              <button
                onClick={() => setShowTestSection(!showTestSection)}
                className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-900">Test Expression</span>
                {showTestSection ? (
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                )}
              </button>

              {showTestSection && (
                <div className="px-3 pb-3 pt-1 border-t">
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-gray-700">Test Context</label>
                      <button
                        onClick={() => {
                          const name = prompt('Enter variable name (e.g., BASIC, AbsentDays):');
                          if (!name) return;
                          const value = prompt('Enter value:');
                          if (value === null) return;
                          const parsed = value === 'true' ? true : value === 'false' ? false : !isNaN(Number(value)) ? Number(value) : value;
                          setTestContext({ ...testContext, [name]: parsed });
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        + Add Variable
                      </button>
                    </div>

                    {Object.keys(testContext).length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No test variables. Click "Add Variable" to add values for testing.</p>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(testContext).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between p-1.5 bg-gray-50 rounded text-xs">
                            <span className="font-mono">
                              <span className="font-bold text-indigo-700">{key}</span> = {String(value)}
                            </span>
                            <button
                              onClick={() => {
                                const newContext = { ...testContext };
                                delete newContext[key];
                                setTestContext(newContext);
                              }}
                              className="text-xs text-red-600 hover:text-red-800"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {showPreview && previewResult && (
                    <div className={`p-2 rounded-md text-xs ${previewResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-start">
                        {previewResult.success ? (
                          <Check className="h-4 w-4 text-green-600 mr-1.5 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600 mr-1.5 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <h3 className={`font-medium ${previewResult.success ? 'text-green-800' : 'text-red-800'}`}>
                            {previewResult.success ? 'Execution Successful' : 'Execution Failed'}
                          </h3>
                          {previewResult.success ? (
                            <div className="mt-1">
                              <p className="text-gray-700">
                                <span className="font-medium">Result:</span>{' '}
                                <span className="font-mono font-bold">{JSON.stringify(previewResult.value)}</span>
                              </p>
                              {previewResult.executionTimeMs !== undefined && (
                                <p className="text-gray-600 mt-0.5">
                                  Execution time: {previewResult.executionTimeMs}ms
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-1 text-red-700">{previewResult.error}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <ExpressionPreview
              expression={expression}
              context={testContext}
              onContextChange={setTestContext}
              onTest={handleTest}
              result={previewResult}
              show={showPreview}
            />
          )}

          {/* Action Buttons */}
          <div className={`flex items-center ${isModal ? 'justify-end space-x-2' : 'justify-between'}`}>
            {isModal ? (
              <>
                {showTestSection && (
                  <button
                    onClick={handleTest}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Play className="h-3 w-3 mr-1.5" />
                    Test
                  </button>
                )}
                <button
                  onClick={onCancel}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveExpression}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                  disabled={!validationResult?.isValid}
                >
                  <Check className="h-3 w-3 mr-1.5" />
                  Save Expression
                </button>
              </>
            ) : (
              <>
                <div className="flex space-x-3">
                  <button
                    onClick={handleSave}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                    disabled={loading}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {currentTemplate ? 'Update Template' : 'Save Template'}
                  </button>

                  <button
                    onClick={handleTest}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Test Expression
                  </button>

                  <button
                    onClick={handleClear}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New
                  </button>
                </div>

                {currentTemplate && (
                  <button
                    onClick={handleDelete}
                    className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {!isModal && (
        <div className="mt-8">
          <TemplateList
            templates={templates}
            onSelect={(template) => {
              setCurrentTemplate(template);
            }}
          />
        </div>
      )}
    </div>
  );
}
