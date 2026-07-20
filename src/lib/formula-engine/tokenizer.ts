import { Token, TokenType } from './types';

const KEYWORDS = new Set(['IF', 'THEN', 'ELSE', 'AND', 'OR', 'TRUE', 'FALSE']);

const OPERATORS = new Set([
  '+', '-', '*', '/', '%',
  '>', '<', '>=', '<=', '==', '!=',
  '&&', '||', '!',
]);

const FUNCTIONS = new Set([
  'ROUND', 'MIN', 'MAX', 'SUM', 'AVG',
  'FLOOR', 'CEIL', 'ABS', 'POW', 'SQRT',
  'CONCAT', 'UPPER', 'LOWER', 'TRIM',
]);

export class Tokenizer {
  private input: string;
  private position: number;
  private currentChar: string | null;

  constructor(input: string) {
    this.input = input.trim();
    this.position = 0;
    this.currentChar = this.input.length > 0 ? this.input[0] : null;
  }

  private advance(): void {
    this.position++;
    this.currentChar = this.position < this.input.length ? this.input[this.position] : null;
  }

  private peek(offset: number = 1): string | null {
    const peekPos = this.position + offset;
    return peekPos < this.input.length ? this.input[peekPos] : null;
  }

  private skipWhitespace(): void {
    while (this.currentChar !== null && /\s/.test(this.currentChar)) {
      this.advance();
    }
  }

  private readNumber(): Token {
    const startPos = this.position;
    let numStr = '';

    while (this.currentChar !== null && /[0-9.]/.test(this.currentChar)) {
      numStr += this.currentChar;
      this.advance();
    }

    return {
      type: TokenType.NUMBER,
      value: parseFloat(numStr),
      position: startPos,
    };
  }

  private readIdentifier(): Token {
    const startPos = this.position;
    let identifier = '';

    // Read the first word (alphanumeric and underscore)
    while (this.currentChar !== null && /[a-zA-Z0-9_]/.test(this.currentChar)) {
      identifier += this.currentChar;
      this.advance();
    }

    const upperIdentifier = identifier.toUpperCase();

    // If it's a keyword, return it immediately
    if (KEYWORDS.has(upperIdentifier)) {
      if (upperIdentifier === 'IF') return { type: TokenType.IF, value: 'IF', position: startPos };
      if (upperIdentifier === 'THEN') return { type: TokenType.THEN, value: 'THEN', position: startPos };
      if (upperIdentifier === 'ELSE') return { type: TokenType.ELSE, value: 'ELSE', position: startPos };
      if (upperIdentifier === 'AND') return { type: TokenType.AND, value: 'AND', position: startPos };
      if (upperIdentifier === 'OR') return { type: TokenType.OR, value: 'OR', position: startPos };
      if (upperIdentifier === 'TRUE') return { type: TokenType.TRUE, value: true, position: startPos };
      if (upperIdentifier === 'FALSE') return { type: TokenType.FALSE, value: false, position: startPos };
    }

    // If it's a function, return it immediately
    if (FUNCTIONS.has(upperIdentifier)) {
      return { type: TokenType.FUNCTION, value: upperIdentifier, position: startPos };
    }

    // FIXED: Handle multi-word variable names (e.g., "Washing Allowance", "Basic Salary")
    // Also handle special characters like colon (:) and hyphen (-) in variable names (e.g., "Shift: Shift-3")
    // Continue reading words separated by spaces, colons, or hyphens until we hit a keyword, operator, or special character
    while (true) {
      // Save current position in case we need to backtrack
      const savedPos = this.position;
      const savedChar = this.currentChar;

      // Check for colon or hyphen immediately following the identifier
      if (this.currentChar === ':' || this.currentChar === '-') {
        identifier += this.currentChar;
        this.advance();

        // Skip optional whitespace after colon or hyphen
        while (this.currentChar !== null && /\s/.test(this.currentChar)) {
          identifier += this.currentChar;
          this.advance();
        }

        // Read the next part of the identifier
        if (this.currentChar !== null && /[a-zA-Z0-9_]/.test(this.currentChar)) {
          while (this.currentChar !== null && /[a-zA-Z0-9_]/.test(this.currentChar)) {
            identifier += this.currentChar;
            this.advance();
          }
          continue; // Continue the loop to check for more special characters
        } else {
          // No identifier after special character, restore position
          this.position = savedPos;
          this.currentChar = savedChar;
          break;
        }
      }

      // Skip whitespace to check what comes next
      let hasSpace = false;
      while (this.currentChar !== null && /\s/.test(this.currentChar)) {
        hasSpace = true;
        this.advance();
      }

      // If no space found, we're done
      if (!hasSpace) {
        break;
      }

      // Check if next character starts an identifier
      if (this.currentChar !== null && /[a-zA-Z_]/.test(this.currentChar)) {
        // Peek ahead to read the next word
        let nextWord = '';
        const peekStart = this.position;

        while (this.position < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.position])) {
          nextWord += this.input[this.position];
          this.position++;
          this.currentChar = this.position < this.input.length ? this.input[this.position] : null;
        }

        const upperNextWord = nextWord.toUpperCase();

        // If the next word is a keyword or function, don't include it in the variable name
        if (KEYWORDS.has(upperNextWord) || FUNCTIONS.has(upperNextWord)) {
          // Restore position to before the whitespace
          this.position = savedPos;
          this.currentChar = savedChar;
          break;
        }

        // Include the space and the next word in the variable name
        identifier += ' ' + nextWord;
      } else {
        // Next character is not part of an identifier, restore position
        this.position = savedPos;
        this.currentChar = savedChar;
        break;
      }
    }

    return { type: TokenType.VARIABLE, value: identifier, position: startPos };
  }

  private readString(): Token {
    const startPos = this.position;
    const quote = this.currentChar;
    this.advance();

    let str = '';
    while (this.currentChar !== null && this.currentChar !== quote) {
      if (this.currentChar === '\\' && this.peek() === quote) {
        this.advance();
        str += quote;
        this.advance();
      } else {
        str += this.currentChar;
        this.advance();
      }
    }

    if (this.currentChar === quote) {
      this.advance();
    } else {
      throw new Error(`Unterminated string at position ${startPos}`);
    }

    return { type: TokenType.STRING, value: str, position: startPos };
  }

  private readOperator(): Token {
    const startPos = this.position;
    let op = this.currentChar!;

    const next = this.peek();
    const twoCharOp = op + next;

    if (OPERATORS.has(twoCharOp)) {
      this.advance();
      this.advance();
      return { type: TokenType.OPERATOR, value: twoCharOp, position: startPos };
    }

    if (OPERATORS.has(op)) {
      this.advance();
      return { type: TokenType.OPERATOR, value: op, position: startPos };
    }

    throw new Error(`Unknown operator: ${op} at position ${startPos}`);
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.currentChar !== null) {
      this.skipWhitespace();

      if (this.currentChar === null) break;

      if (/[0-9]/.test(this.currentChar)) {
        tokens.push(this.readNumber());
        continue;
      }

      if (/[a-zA-Z_]/.test(this.currentChar)) {
        tokens.push(this.readIdentifier());
        continue;
      }

      if (this.currentChar === '"' || this.currentChar === "'") {
        tokens.push(this.readString());
        continue;
      }

      if (this.currentChar === '(') {
        tokens.push({ type: TokenType.LPAREN, value: '(', position: this.position });
        this.advance();
        continue;
      }

      if (this.currentChar === ')') {
        tokens.push({ type: TokenType.RPAREN, value: ')', position: this.position });
        this.advance();
        continue;
      }

      if (this.currentChar === ',') {
        tokens.push({ type: TokenType.COMMA, value: ',', position: this.position });
        this.advance();
        continue;
      }

      if ('+-*/><=!&|%'.includes(this.currentChar)) {
        tokens.push(this.readOperator());
        continue;
      }

      throw new Error(`Unexpected character: ${this.currentChar} at position ${this.position}`);
    }

    tokens.push({ type: TokenType.EOF, value: '', position: this.position });
    return tokens;
  }
}

export function tokenize(expression: string): Token[] {
  const tokenizer = new Tokenizer(expression);
  return tokenizer.tokenize();
}
