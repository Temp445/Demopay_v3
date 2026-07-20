import { FunctionDefinition } from './types';

export class FunctionRegistry {
  private static functions: Map<string, FunctionDefinition> = new Map();

  static {
    this.registerDefaultFunctions();
  }

  private static registerDefaultFunctions(): void {
    this.register({
      name: 'ROUND',
      minArgs: 1,
      maxArgs: 2,
      returnType: 'number',
      argTypes: ['number', 'number'],
      execute: (value: number, decimals: number = 0) => {
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
      },
      description: 'Rounds a number to specified decimal places',
    });

    this.register({
      name: 'MIN',
      minArgs: 1,
      maxArgs: Infinity,
      returnType: 'number',
      argTypes: ['number'],
      execute: (...args: number[]) => Math.min(...args),
      description: 'Returns the minimum value',
    });

    this.register({
      name: 'MAX',
      minArgs: 1,
      maxArgs: Infinity,
      returnType: 'number',
      argTypes: ['number'],
      execute: (...args: number[]) => Math.max(...args),
      description: 'Returns the maximum value',
    });

    this.register({
      name: 'SUM',
      minArgs: 1,
      maxArgs: Infinity,
      returnType: 'number',
      argTypes: ['number'],
      execute: (...args: number[]) => args.reduce((sum, val) => sum + val, 0),
      description: 'Sums all arguments',
    });

    this.register({
      name: 'AVG',
      minArgs: 1,
      maxArgs: Infinity,
      returnType: 'number',
      argTypes: ['number'],
      execute: (...args: number[]) => args.reduce((sum, val) => sum + val, 0) / args.length,
      description: 'Calculates the average of arguments',
    });

    this.register({
      name: 'FLOOR',
      minArgs: 1,
      maxArgs: 1,
      returnType: 'number',
      argTypes: ['number'],
      execute: (value: number) => Math.floor(value),
      description: 'Rounds down to the nearest integer',
    });

    this.register({
      name: 'CEIL',
      minArgs: 1,
      maxArgs: 1,
      returnType: 'number',
      argTypes: ['number'],
      execute: (value: number) => Math.ceil(value),
      description: 'Rounds up to the nearest integer',
    });

    this.register({
      name: 'ABS',
      minArgs: 1,
      maxArgs: 1,
      returnType: 'number',
      argTypes: ['number'],
      execute: (value: number) => Math.abs(value),
      description: 'Returns the absolute value',
    });

    this.register({
      name: 'POW',
      minArgs: 2,
      maxArgs: 2,
      returnType: 'number',
      argTypes: ['number', 'number'],
      execute: (base: number, exponent: number) => Math.pow(base, exponent),
      description: 'Raises base to the power of exponent',
    });

    this.register({
      name: 'SQRT',
      minArgs: 1,
      maxArgs: 1,
      returnType: 'number',
      argTypes: ['number'],
      execute: (value: number) => Math.sqrt(value),
      description: 'Returns the square root',
    });

    this.register({
      name: 'CONCAT',
      minArgs: 1,
      maxArgs: Infinity,
      returnType: 'string',
      argTypes: ['string'],
      execute: (...args: string[]) => args.join(''),
      description: 'Concatenates strings',
    });

    this.register({
      name: 'UPPER',
      minArgs: 1,
      maxArgs: 1,
      returnType: 'string',
      argTypes: ['string'],
      execute: (value: string) => String(value).toUpperCase(),
      description: 'Converts to uppercase',
    });

    this.register({
      name: 'LOWER',
      minArgs: 1,
      maxArgs: 1,
      returnType: 'string',
      argTypes: ['string'],
      execute: (value: string) => String(value).toLowerCase(),
      description: 'Converts to lowercase',
    });

    this.register({
      name: 'TRIM',
      minArgs: 1,
      maxArgs: 1,
      returnType: 'string',
      argTypes: ['string'],
      execute: (value: string) => String(value).trim(),
      description: 'Removes leading and trailing whitespace',
    });
  }

  static register(func: FunctionDefinition): void {
    this.functions.set(func.name.toUpperCase(), func);
  }

  static get(name: string): FunctionDefinition | undefined {
    return this.functions.get(name.toUpperCase());
  }

  static has(name: string): boolean {
    return this.functions.has(name.toUpperCase());
  }

  static getAll(): FunctionDefinition[] {
    return Array.from(this.functions.values());
  }

  static getAllByCategory(): Record<string, FunctionDefinition[]> {
    const all = this.getAll();
    return {
      mathematical: all.filter(f =>
        ['ROUND', 'MIN', 'MAX', 'SUM', 'AVG', 'FLOOR', 'CEIL', 'ABS', 'POW', 'SQRT'].includes(f.name)
      ),
      string: all.filter(f => ['CONCAT', 'UPPER', 'LOWER', 'TRIM'].includes(f.name)),
    };
  }
}
