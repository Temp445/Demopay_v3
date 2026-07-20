import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { validateAuth } from './utils/storeUtils';
import { FormulaEngine, ExpressionVariable, ExpressionTemplate, ASTNode, ExecutionContext, ExecutionResult } from '../lib/formula-engine';

interface ExpressionStore {
  templates: ExpressionTemplate[];
  variables: ExpressionVariable[];
  loading: boolean;
  error: string | null;
  currentTemplate: ExpressionTemplate | null;

  fetchTemplates: () => Promise<void>;
  fetchVariables: () => Promise<void>;
  createTemplate: (template: Partial<ExpressionTemplate>) => Promise<ExpressionTemplate | null>;
  updateTemplate: (id: string, updates: Partial<ExpressionTemplate>) => Promise<boolean>;
  deleteTemplate: (id: string) => Promise<boolean>;
  getTemplateById: (id: string) => ExpressionTemplate | null;
  setCurrentTemplate: (template: ExpressionTemplate | null) => void;

  createVariable: (variable: Partial<ExpressionVariable>) => Promise<ExpressionVariable | null>;
  updateVariable: (id: string, updates: Partial<ExpressionVariable>) => Promise<boolean>;
  deleteVariable: (id: string) => Promise<boolean>;

  compileExpression: (expression: string) => ASTNode | null;
  validateExpression: (expression: string) => {
    isValid: boolean;
    errors: string[];
    variables: string[];
    dependencies: string[];
  };
  executeExpression: (expression: string, context: ExecutionContext) => ExecutionResult;
  executeTemplate: (templateId: string, context: ExecutionContext) => ExecutionResult | null;

  initializeDefaultVariables: () => Promise<void>;

  reset: () => void;
}

export const useExpressionStore = create<ExpressionStore>((set, get) => ({
  templates: [],
  variables: [],
  loading: false,
  error: null,
  currentTemplate: null,

  fetchTemplates: async () => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('expression_templates')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ templates: data || [], loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch templates',
        loading: false,
      });
    }
  },

  fetchVariables: async () => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return;
    }

    try {
      // CHANGED: Now fetching from payroll_components table instead of expression_variables
      const { data, error } = await supabase
        .from('payroll_components')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true)
        .order('component_category', { ascending: true });

      if (error) throw error;

      // CHANGED: Transform payroll_components format → ExpressionVariable format
      // Map component_category to appropriate variable category
      const formattedVariables: ExpressionVariable[] =
        (data || []).map((item: any) => {
          // Map component_category ('general' | 'calculation') to variable category
          let variableCategory: ExpressionVariable['category'] = 'salary_component';
          if (item.component_category === 'calculation') {
            if (item.name.startsWith('Leave:')) {
              variableCategory = 'leave_parameter';
            } else if (item.name.startsWith('Shift:')) {
              variableCategory = 'shift_parameter';
            } else {
              variableCategory = 'calculation_parameter';
            }
          } else if (item.component_category === 'general') {
            if (item.statutory_component_id) {
              variableCategory = 'statutory_component';
            } else {
              variableCategory = 'salary_component';
            }
          }

          return {
            id: item.id,
            tenantId: item.tenant_id,
            variableName: item.name, // Use component name as variable name
            displayName: item.name, // Use component name as display name
            category: variableCategory, // Grouped by component_category
            dataType: 'number', // Payroll components are numeric values
            description: item.description || `${item.component_type} component: ${item.name}`,
            sourceTable: 'payroll_components',
            sourceColumn: item.name,
            statutoryComponentId: item.statutory_component_id,
            isActive: item.is_active,
          };
        });

      set({ variables: formattedVariables, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch variables',
        loading: false,
      });
    }
  },

  createTemplate: async (template) => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('expression_templates')
        .insert({
          tenant_id: auth.tenantId,
          name: template.name!,
          description: template.description,
          category: template.category!,
          expression_text: template.expressionText!,
          expression_ast: template.expressionAst!,
          variables_used: template.variablesUsed || [],
          dependencies: template.dependencies || [],
          is_valid: template.isValid ?? true,
          validation_errors: template.validationErrors,
          created_by: auth.userId,
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        templates: [data, ...state.templates],
        loading: false,
      }));

      return data;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create template',
        loading: false,
      });
      return null;
    }
  },

  updateTemplate: async (id, updates) => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return false;
    }

    try {
      const { error } = await supabase
        .from('expression_templates')
        .update({
          name: updates.name,
          description: updates.description,
          category: updates.category,
          expression_text: updates.expressionText,
          expression_ast: updates.expressionAst,
          variables_used: updates.variablesUsed,
          dependencies: updates.dependencies,
          is_valid: updates.isValid,
          validation_errors: updates.validationErrors,
        })
        .eq('id', id)
        .eq('tenant_id', auth.tenantId);

      if (error) throw error;

      set((state) => ({
        templates: state.templates.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
        loading: false,
      }));

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update template',
        loading: false,
      });
      return false;
    }
  },

  deleteTemplate: async (id) => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return false;
    }

    try {
      const { error } = await supabase
        .from('expression_templates')
        .delete()
        .eq('id', id)
        .eq('tenant_id', auth.tenantId);

      if (error) throw error;

      set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
        loading: false,
      }));

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete template',
        loading: false,
      });
      return false;
    }
  },

  getTemplateById: (id) => {
    return get().templates.find((t) => t.id === id) || null;
  },

  setCurrentTemplate: (template) => {
    set({ currentTemplate: template });
  },

  createVariable: async (variable) => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('expression_variables')
        .insert({
          tenant_id: auth.tenantId,
          variable_name: variable.variableName!,
          display_name: variable.displayName!,
          category: variable.category!,
          data_type: variable.dataType!,
          description: variable.description,
          source_table: variable.sourceTable,
          source_column: variable.sourceColumn,
          is_active: variable.isActive ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        variables: [...state.variables, data],
        loading: false,
      }));

      return data;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create variable',
        loading: false,
      });
      return null;
    }
  },

  updateVariable: async (id, updates) => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return false;
    }

    try {
      const { error } = await supabase
        .from('expression_variables')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', auth.tenantId);

      if (error) throw error;

      set((state) => ({
        variables: state.variables.map((v) =>
          v.id === id ? { ...v, ...updates } : v
        ),
        loading: false,
      }));

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update variable',
        loading: false,
      });
      return false;
    }
  },

  deleteVariable: async (id) => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return false;
    }

    try {
      const { error } = await supabase
        .from('expression_variables')
        .delete()
        .eq('id', id)
        .eq('tenant_id', auth.tenantId);

      if (error) throw error;

      set((state) => ({
        variables: state.variables.filter((v) => v.id !== id),
        loading: false,
      }));

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete variable',
        loading: false,
      });
      return false;
    }
  },

  compileExpression: (expression) => {
    try {
      return FormulaEngine.compile(expression);
    } catch (error) {
      console.error('Compilation error:', error);
      return null;
    }
  },

  validateExpression: (expression) => {
    const variables = get().variables;
    const result = FormulaEngine.validate(expression, variables);

    return {
      isValid: result.isValid,
      errors: result.errors.map((e) => e.message),
      variables: result.variablesUsed,
      dependencies: result.dependencies,
    };
  },

  executeExpression: (expression, context) => {
    return FormulaEngine.execute(expression, context);
  },

  executeTemplate: (templateId, context) => {
    const template = get().getTemplateById(templateId);
    if (!template) return null;

    return FormulaEngine.executeAST(template.expressionAst, context);
  },

  initializeDefaultVariables: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      return;
    }

    try {
      await supabase.rpc('initialize_expression_variables', {
        p_tenant_id: auth.tenantId,
      });

      get().fetchVariables();
    } catch (error) {
      console.error('Failed to initialize default variables:', error);
    }
  },

  reset: () => {
    set({
      templates: [],
      variables: [],
      loading: false,
      error: null,
      currentTemplate: null,
    });
  },
}));
