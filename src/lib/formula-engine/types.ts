export enum TokenType {
  NUMBER = 'NUMBER',
  VARIABLE = 'VARIABLE',
  OPERATOR = 'OPERATOR',
  FUNCTION = 'FUNCTION',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  COMMA = 'COMMA',
  IF = 'IF',
  THEN = 'THEN',
  ELSE = 'ELSE',
  AND = 'AND',
  OR = 'OR',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  STRING = 'STRING',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string | number | boolean;
  position: number;
}

export enum ASTNodeType {
  NUMBER = 'NUMBER',
  VARIABLE = 'VARIABLE',
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
  BINARY_OP = 'BINARY_OP',
  UNARY_OP = 'UNARY_OP',
  FUNCTION_CALL = 'FUNCTION_CALL',
  CONDITIONAL = 'CONDITIONAL',
}

export interface ASTNode {
  type: ASTNodeType;
  value?: any;
  operator?: string;
  left?: ASTNode;
  right?: ASTNode;
  operand?: ASTNode;
  name?: string;
  arguments?: ASTNode[];
  condition?: ASTNode;
  trueBranch?: ASTNode;
  falseBranch?: ASTNode;
}

export interface ValidationError {
  message: string;
  position?: number;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  variablesUsed: string[];
  dependencies: string[];
}

export interface ExecutionContext {
  [key: string]: any;
}

export interface ExecutionResult {
  success: boolean;
  value: any;
  error?: string;
  executionTimeMs?: number;
}

export interface ExpressionVariable {
  id: string;
  tenantId: string;
  variableName: string;
  displayName: string;
  category: 'salary_component' | 'leave_parameter' | 'shift_parameter' | 'calculation_parameter' | 'system' | 'statutory_component';
  dataType: 'number' | 'boolean' | 'string' | 'date';
  description: string;
  sourceTable?: string;
  statutoryComponentId?: string | null;
  isActive: boolean;
}

export interface ExpressionTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category: 'eligibility' | 'value_calculation' | 'validation';
  expressionText: string;
  expressionAst: ASTNode;
  variablesUsed: string[];
  dependencies: string[];
  isValid: boolean;
  validationErrors?: any;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type DataType = 'number' | 'boolean' | 'string' | 'date' | 'unknown';

export interface FunctionDefinition {
  name: string;
  minArgs: number;
  maxArgs: number;
  returnType: DataType;
  argTypes: DataType[];
  execute: (...args: any[]) => any;
  description: string;
}
