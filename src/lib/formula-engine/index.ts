import { tokenize } from './tokenizer';
import { parse } from './parser';
import { validate } from './validator';
import { evaluate } from './evaluator';
import { DependencyResolver } from './dependencyResolver';
import { FunctionRegistry } from './functionRegistry';
import {
  ASTNode,
  ExecutionContext,
  ExecutionResult,
  ValidationResult,
  ExpressionVariable,
  ExpressionTemplate,
} from './types';

export class FormulaEngine {
  public static compile(expression: string): ASTNode {
    const tokens = tokenize(expression);
    const ast = parse(tokens);
    return ast;
  }

  public static validate(expression: string, availableVariables: ExpressionVariable[]): ValidationResult {
    try {
      const ast = this.compile(expression);
      return validate(ast, availableVariables);
    } catch (error) {
      return {
        isValid: false,
        errors: [
          {
            message: error instanceof Error ? error.message : 'Compilation error',
            severity: 'error',
          },
        ],
        warnings: [],
        variablesUsed: [],
        dependencies: [],
      };
    }
  }

  public static execute(expression: string, context: ExecutionContext): ExecutionResult {
    try {
      const ast = this.compile(expression);
      return evaluate(ast, context);
    } catch (error) {
      return {
        success: false,
        value: null,
        error: error instanceof Error ? error.message : 'Execution error',
      };
    }
  }

  public static executeAST(ast: ASTNode, context: ExecutionContext): ExecutionResult {
    return evaluate(ast, context);
  }

  public static resolveDependencies(expressions: ExpressionTemplate[]): ExpressionTemplate[] {
    return DependencyResolver.resolveDependencies(expressions);
  }

  public static getDependencyOrder(componentNames: string[], dependencies: Map<string, string[]>): string[] {
    return DependencyResolver.getDependencyOrder(componentNames, dependencies);
  }

  public static validateNoCycles(
    componentName: string,
    dependencies: string[],
    allDependencies: Map<string, string[]>
  ): boolean {
    return DependencyResolver.validateNoCycles(componentName, dependencies, allDependencies);
  }

  public static getAvailableFunctions() {
    return FunctionRegistry.getAllByCategory();
  }

  public static extractVariables(ast: ASTNode): string[] {
    const variables = new Set<string>();

    const traverse = (node: ASTNode): void => {
      if (node.type === 'VARIABLE') {
        variables.add(String(node.value));
      }

      if (node.left) traverse(node.left);
      if (node.right) traverse(node.right);
      if (node.operand) traverse(node.operand);
      if (node.condition) traverse(node.condition);
      if (node.trueBranch) traverse(node.trueBranch);
      if (node.falseBranch) traverse(node.falseBranch);
      if (node.arguments) {
        node.arguments.forEach((arg) => traverse(arg));
      }
    };

    traverse(ast);
    return Array.from(variables);
  }
}

export * from './types';
export { tokenize } from './tokenizer';
export { parse } from './parser';
export { validate } from './validator';
export { evaluate } from './evaluator';
export { FunctionRegistry } from './functionRegistry';
export { DependencyResolver } from './dependencyResolver';
