import { ASTNode, ASTNodeType, ExecutionContext, ExecutionResult } from './types';
import { FunctionRegistry } from './functionRegistry';

export class Evaluator {
  private context: ExecutionContext;
  private maxExecutionTime: number;
  private startTime: number;

  constructor(context: ExecutionContext, maxExecutionTimeMs: number = 5000) {
    this.context = context;
    this.maxExecutionTime = maxExecutionTimeMs;
    this.startTime = 0;
  }

  public evaluate(ast: ASTNode): ExecutionResult {
    this.startTime = Date.now();

    try {
      const value = this.evaluateNode(ast);
      const executionTimeMs = Date.now() - this.startTime;

      return {
        success: true,
        value,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - this.startTime;

      return {
        success: false,
        value: null,
        error: error instanceof Error ? error.message : 'Unknown execution error',
        executionTimeMs,
      };
    }
  }

  private checkTimeout(): void {
    if (Date.now() - this.startTime > this.maxExecutionTime) {
      throw new Error(`Execution timeout exceeded (${this.maxExecutionTime}ms)`);
    }
  }

  private evaluateNode(node: ASTNode): any {
    this.checkTimeout();

    switch (node.type) {
      case ASTNodeType.NUMBER:
      case ASTNodeType.BOOLEAN:
      case ASTNodeType.STRING:
        return node.value;

      case ASTNodeType.VARIABLE:
        return this.evaluateVariable(node);

      case ASTNodeType.BINARY_OP:
        return this.evaluateBinaryOp(node);

      case ASTNodeType.UNARY_OP:
        return this.evaluateUnaryOp(node);

      case ASTNodeType.FUNCTION_CALL:
        return this.evaluateFunctionCall(node);

      case ASTNodeType.CONDITIONAL:
        return this.evaluateConditional(node);

      default:
        throw new Error(`Unknown AST node type: ${node.type}`);
    }
  }

  private evaluateVariable(node: ASTNode): any {
    const varName = String(node.value);
    const normalizedName = varName.toUpperCase();

    if (this.context.hasOwnProperty(normalizedName)) {
      return this.context[normalizedName];
    }

    if (this.context.hasOwnProperty(varName)) {
      return this.context[varName];
    }

    throw new Error(`Variable not found in context: ${varName}`);
  }

  private evaluateBinaryOp(node: ASTNode): any {
    const left = this.evaluateNode(node.left!);
    const right = this.evaluateNode(node.right!);

    switch (node.operator) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        if (right === 0) {
          throw new Error('Division by zero');
        }
        return left / right;
      case '%':
        return left % right;
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      case '==':
        return left == right;
      case '!=':
        return left != right;
      case '&&':
        return left && right;
      case '||':
        return left || right;
      default:
        throw new Error(`Unknown operator: ${node.operator}`);
    }
  }

  private evaluateUnaryOp(node: ASTNode): any {
    const operand = this.evaluateNode(node.operand!);

    switch (node.operator) {
      case '-':
        return -operand;
      case '!':
        return !operand;
      default:
        throw new Error(`Unknown unary operator: ${node.operator}`);
    }
  }

  private evaluateFunctionCall(node: ASTNode): any {
    const funcName = node.name!;
    const funcDef = FunctionRegistry.get(funcName);

    if (!funcDef) {
      throw new Error(`Unknown function: ${funcName}`);
    }

    const args = node.arguments?.map((arg) => this.evaluateNode(arg)) || [];

    try {
      return funcDef.execute(...args);
    } catch (error) {
      throw new Error(
        `Error executing function ${funcName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private evaluateConditional(node: ASTNode): any {
    const condition = this.evaluateNode(node.condition!);

    if (condition) {
      return this.evaluateNode(node.trueBranch!);
    } else {
      return this.evaluateNode(node.falseBranch!);
    }
  }
}

export function evaluate(ast: ASTNode, context: ExecutionContext): ExecutionResult {
  const evaluator = new Evaluator(context);
  return evaluator.evaluate(ast);
}
