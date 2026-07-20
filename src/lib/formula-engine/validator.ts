import { ASTNode, ASTNodeType, ValidationResult, ValidationError, ExpressionVariable } from './types';
import { FunctionRegistry } from './functionRegistry';

export class Validator {
  private errors: ValidationError[] = [];
  private warnings: ValidationError[] = [];
  private variablesUsed: Set<string> = new Set();
  private availableVariables: Map<string, ExpressionVariable>;
  private dependencies: Set<string> = new Set();
  private maxNestingDepth: number = 10;
  private currentDepth: number = 0;

  constructor(availableVariables: ExpressionVariable[]) {
    this.availableVariables = new Map(
      availableVariables.map(v => [v.variableName.toUpperCase(), v])
    );
  }

  public validate(ast: ASTNode): ValidationResult {
    this.errors = [];
    this.warnings = [];
    this.variablesUsed = new Set();
    this.dependencies = new Set();
    this.currentDepth = 0;

    try {
      this.validateNode(ast);
    } catch (error) {
      this.errors.push({
        message: error instanceof Error ? error.message : 'Unknown validation error',
        severity: 'error',
      });
    }

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      variablesUsed: Array.from(this.variablesUsed),
      dependencies: Array.from(this.dependencies),
    };
  }

  private validateNode(node: ASTNode): void {
    this.currentDepth++;

    if (this.currentDepth > this.maxNestingDepth) {
      this.errors.push({
        message: `Expression nesting depth exceeds maximum of ${this.maxNestingDepth}`,
        severity: 'error',
      });
      this.currentDepth--;
      return;
    }

    switch (node.type) {
      case ASTNodeType.NUMBER:
      case ASTNodeType.BOOLEAN:
      case ASTNodeType.STRING:
        break;

      case ASTNodeType.VARIABLE:
        this.validateVariable(node);
        break;

      case ASTNodeType.BINARY_OP:
        this.validateBinaryOp(node);
        break;

      case ASTNodeType.UNARY_OP:
        this.validateUnaryOp(node);
        break;

      case ASTNodeType.FUNCTION_CALL:
        this.validateFunctionCall(node);
        break;

      case ASTNodeType.CONDITIONAL:
        this.validateConditional(node);
        break;

      default:
        this.errors.push({
          message: `Unknown AST node type: ${node.type}`,
          severity: 'error',
        });
    }

    this.currentDepth--;
  }

  private validateVariable(node: ASTNode): void {
    const varName = String(node.value).toUpperCase();
    this.variablesUsed.add(varName);

    const variable = this.availableVariables.get(varName);

    if (!variable) {
      this.errors.push({
        message: `Unknown variable: ${node.value}`,
        severity: 'error',
      });
      return;
    }

    if (!variable.isActive) {
      this.warnings.push({
        message: `Variable ${node.value} is inactive`,
        severity: 'warning',
      });
    }

    if (variable.category === 'salary_component') {
      this.dependencies.add(varName);
    }
  }

  private validateBinaryOp(node: ASTNode): void {
    if (!node.left || !node.right) {
      this.errors.push({
        message: 'Binary operator missing operands',
        severity: 'error',
      });
      return;
    }

    this.validateNode(node.left);
    this.validateNode(node.right);

    const operator = node.operator;

    if (['+', '-', '*', '/', '%'].includes(operator!)) {
      this.validateArithmeticOperation(node);
    } else if (['>', '<', '>=', '<=', '==', '!='].includes(operator!)) {
      this.validateComparisonOperation(node);
    } else if (['&&', '||'].includes(operator!)) {
      this.validateLogicalOperation(node);
    }
  }

  private validateArithmeticOperation(node: ASTNode): void {
    if (node.operator === '/' && node.right?.type === ASTNodeType.NUMBER && node.right.value === 0) {
      this.errors.push({
        message: 'Division by zero',
        severity: 'error',
      });
    }
  }

  private validateComparisonOperation(node: ASTNode): void {
    // Comparison operations are generally valid for numbers and strings
  }

  private validateLogicalOperation(node: ASTNode): void {
    // Logical operations should ideally work with boolean values
    // But JavaScript allows truthy/falsy values, so we'll allow it with a warning
  }

  private validateUnaryOp(node: ASTNode): void {
    if (!node.operand) {
      this.errors.push({
        message: 'Unary operator missing operand',
        severity: 'error',
      });
      return;
    }

    this.validateNode(node.operand);

    if (node.operator === '-') {
      // Numeric negation
    } else if (node.operator === '!') {
      // Logical NOT
    }
  }

  private validateFunctionCall(node: ASTNode): void {
    const funcName = node.name!.toUpperCase();
    const funcDef = FunctionRegistry.get(funcName);

    if (!funcDef) {
      this.errors.push({
        message: `Unknown function: ${node.name}`,
        severity: 'error',
      });
      return;
    }

    const argCount = node.arguments?.length || 0;

    if (argCount < funcDef.minArgs) {
      this.errors.push({
        message: `Function ${node.name} requires at least ${funcDef.minArgs} arguments, got ${argCount}`,
        severity: 'error',
      });
    }

    if (argCount > funcDef.maxArgs && funcDef.maxArgs !== Infinity) {
      this.errors.push({
        message: `Function ${node.name} accepts at most ${funcDef.maxArgs} arguments, got ${argCount}`,
        severity: 'error',
      });
    }

    node.arguments?.forEach((arg) => this.validateNode(arg));
  }

  private validateConditional(node: ASTNode): void {
    if (!node.condition || !node.trueBranch || !node.falseBranch) {
      this.errors.push({
        message: 'Conditional expression missing required parts (condition, true branch, or false branch)',
        severity: 'error',
      });
      return;
    }

    this.validateNode(node.condition);
    this.validateNode(node.trueBranch);
    this.validateNode(node.falseBranch);
  }

  public static detectCircularDependency(
    componentName: string,
    dependencies: string[],
    allComponentDependencies: Map<string, string[]>
  ): string[] | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    function dfs(current: string): boolean {
      if (recursionStack.has(current)) {
        path.push(current);
        return true;
      }

      if (visited.has(current)) {
        return false;
      }

      visited.add(current);
      recursionStack.add(current);
      path.push(current);

      const deps = allComponentDependencies.get(current) || [];
      for (const dep of deps) {
        if (dfs(dep)) {
          return true;
        }
      }

      recursionStack.delete(current);
      path.pop();
      return false;
    }

    if (dfs(componentName)) {
      return path;
    }

    return null;
  }
}

export function validate(ast: ASTNode, availableVariables: ExpressionVariable[]): ValidationResult {
  const validator = new Validator(availableVariables);
  return validator.validate(ast);
}
