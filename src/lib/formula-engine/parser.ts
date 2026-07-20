import { Token, TokenType, ASTNode, ASTNodeType } from './types';

export class Parser {
  private tokens: Token[];
  private current: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.current = 0;
  }

  private getCurrentToken(): Token {
    return this.tokens[this.current];
  }

  private advance(): Token {
    const token = this.getCurrentToken();
    if (token.type !== TokenType.EOF) {
      this.current++;
    }
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.getCurrentToken();
    if (token.type !== type) {
      throw new Error(
        `Expected token type ${type} but got ${token.type} at position ${token.position}`
      );
    }
    return this.advance();
  }

  public parse(): ASTNode {
    const ast = this.parseExpression();
    if (this.getCurrentToken().type !== TokenType.EOF) {
      throw new Error(`Unexpected token at position ${this.getCurrentToken().position}`);
    }
    return ast;
  }

  private parseExpression(): ASTNode {
    return this.parseConditional();
  }

  private parseConditional(): ASTNode {
    if (this.getCurrentToken().type === TokenType.IF) {
      return this.parseIfExpression();
    }
    return this.parseLogicalOr();
  }

  private parseIfExpression(): ASTNode {
    this.expect(TokenType.IF);

    let hasParens = false;
    if (this.getCurrentToken().type === TokenType.LPAREN) {
      this.advance();
      hasParens = true;
    }

    const condition = this.parseLogicalOr();

    if (hasParens && this.getCurrentToken().type === TokenType.RPAREN) {
      this.advance();
    }

    this.expect(TokenType.THEN);
    const trueBranch = this.parseLogicalOr();

    this.expect(TokenType.ELSE);
    const falseBranch = this.parseLogicalOr();

    return {
      type: ASTNodeType.CONDITIONAL,
      condition,
      trueBranch,
      falseBranch,
    };
  }

  private parseLogicalOr(): ASTNode {
    let node = this.parseLogicalAnd();

    while (
      this.getCurrentToken().type === TokenType.OR ||
      (this.getCurrentToken().type === TokenType.OPERATOR && this.getCurrentToken().value === '||')
    ) {
      const operator = this.advance();
      const right = this.parseLogicalAnd();

      node = {
        type: ASTNodeType.BINARY_OP,
        operator: '||',
        left: node,
        right,
      };
    }

    return node;
  }

  private parseLogicalAnd(): ASTNode {
    let node = this.parseComparison();

    while (
      this.getCurrentToken().type === TokenType.AND ||
      (this.getCurrentToken().type === TokenType.OPERATOR && this.getCurrentToken().value === '&&')
    ) {
      const operator = this.advance();
      const right = this.parseComparison();

      node = {
        type: ASTNodeType.BINARY_OP,
        operator: '&&',
        left: node,
        right,
      };
    }

    return node;
  }

  private parseComparison(): ASTNode {
    let node = this.parseAdditive();

    while (
      this.getCurrentToken().type === TokenType.OPERATOR &&
      ['>', '<', '>=', '<=', '==', '!='].includes(this.getCurrentToken().value as string)
    ) {
      const operator = this.advance().value as string;
      const right = this.parseAdditive();

      node = {
        type: ASTNodeType.BINARY_OP,
        operator,
        left: node,
        right,
      };
    }

    return node;
  }

  private parseAdditive(): ASTNode {
    let node = this.parseMultiplicative();

    while (
      this.getCurrentToken().type === TokenType.OPERATOR &&
      ['+', '-'].includes(this.getCurrentToken().value as string)
    ) {
      const operator = this.advance().value as string;
      const right = this.parseMultiplicative();

      node = {
        type: ASTNodeType.BINARY_OP,
        operator,
        left: node,
        right,
      };
    }

    return node;
  }

  private parseMultiplicative(): ASTNode {
    let node = this.parseUnary();

    while (
      this.getCurrentToken().type === TokenType.OPERATOR &&
      ['*', '/', '%'].includes(this.getCurrentToken().value as string)
    ) {
      const operator = this.advance().value as string;
      const right = this.parseUnary();

      node = {
        type: ASTNodeType.BINARY_OP,
        operator,
        left: node,
        right,
      };
    }

    return node;
  }

  private parseUnary(): ASTNode {
    if (
      this.getCurrentToken().type === TokenType.OPERATOR &&
      ['-', '!'].includes(this.getCurrentToken().value as string)
    ) {
      const operator = this.advance().value as string;
      const operand = this.parseUnary();

      return {
        type: ASTNodeType.UNARY_OP,
        operator,
        operand,
      };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    const token = this.getCurrentToken();

    if (token.type === TokenType.NUMBER) {
      this.advance();
      return {
        type: ASTNodeType.NUMBER,
        value: token.value,
      };
    }

    if (token.type === TokenType.STRING) {
      this.advance();
      return {
        type: ASTNodeType.STRING,
        value: token.value,
      };
    }

    if (token.type === TokenType.TRUE || token.type === TokenType.FALSE) {
      this.advance();
      return {
        type: ASTNodeType.BOOLEAN,
        value: token.value,
      };
    }

    if (token.type === TokenType.VARIABLE) {
      this.advance();
      return {
        type: ASTNodeType.VARIABLE,
        value: token.value,
      };
    }

    if (token.type === TokenType.FUNCTION) {
      return this.parseFunctionCall();
    }

    if (token.type === TokenType.LPAREN) {
      this.advance();
      const node = this.parseExpression();
      this.expect(TokenType.RPAREN);
      return node;
    }

    throw new Error(`Unexpected token ${token.type} at position ${token.position}`);
  }

  private parseFunctionCall(): ASTNode {
    const functionName = this.advance().value as string;
    this.expect(TokenType.LPAREN);

    const args: ASTNode[] = [];

    if (this.getCurrentToken().type !== TokenType.RPAREN) {
      args.push(this.parseExpression());

      while (this.getCurrentToken().type === TokenType.COMMA) {
        this.advance();
        args.push(this.parseExpression());
      }
    }

    this.expect(TokenType.RPAREN);

    return {
      type: ASTNodeType.FUNCTION_CALL,
      name: functionName,
      arguments: args,
    };
  }
}

export function parse(tokens: Token[]): ASTNode {
  const parser = new Parser(tokens);
  return parser.parse();
}
