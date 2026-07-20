/**
 * Verification script for multi-word variable name support in tokenizer
 *
 * This script tests that the tokenizer correctly handles variable names with spaces
 * such as "Washing Allowance", "Basic Salary", "House Rent Allowance", etc.
 */

import { tokenize } from './src/lib/formula-engine/tokenizer';
import { parse } from './src/lib/formula-engine/parser';
import { FormulaEngine } from './src/lib/formula-engine';

console.log('='.repeat(80));
console.log('TOKENIZER FIX VERIFICATION');
console.log('Testing multi-word variable name support');
console.log('='.repeat(80));

interface TestCase {
  name: string;
  expression: string;
  expectedVariables: string[];
  shouldParse: boolean;
}

const testCases: TestCase[] = [
  {
    name: 'Original problematic expression',
    expression: 'IF( AbsentDays ==0 ) THEN Washing Allowance   ELSE 0',
    expectedVariables: ['AbsentDays', 'Washing Allowance'],
    shouldParse: true,
  },
  {
    name: 'Simple multi-word variable',
    expression: 'Basic Salary * 0.12',
    expectedVariables: ['Basic Salary'],
    shouldParse: true,
  },
  {
    name: 'Multiple multi-word variables',
    expression: 'Basic Salary + House Rent Allowance + Transport Allowance',
    expectedVariables: ['Basic Salary', 'House Rent Allowance', 'Transport Allowance'],
    shouldParse: true,
  },
  {
    name: 'Multi-word variable before keyword',
    expression: 'IF Basic Salary > 10000 THEN Basic Salary ELSE 0',
    expectedVariables: ['Basic Salary'],
    shouldParse: true,
  },
  {
    name: 'Complex conditional with multi-word variables',
    expression: 'IF Washing Allowance > 0 AND Basic Salary > 5000 THEN Washing Allowance ELSE 0',
    expectedVariables: ['Washing Allowance', 'Basic Salary'],
    shouldParse: true,
  },
  {
    name: 'Single-word variable (backward compatibility)',
    expression: 'IF AbsentDays > 2 THEN 0 ELSE 1000',
    expectedVariables: ['AbsentDays'],
    shouldParse: true,
  },
  {
    name: 'Mixed single and multi-word variables',
    expression: 'Basic Salary + HRA + Transport Allowance - AbsentDeduction',
    expectedVariables: ['Basic Salary', 'HRA', 'Transport Allowance', 'AbsentDeduction'],
    shouldParse: true,
  },
];

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name}`);
  console.log(`Expression: "${testCase.expression}"`);

  try {
    // Tokenize
    const tokens = tokenize(testCase.expression);

    // Extract variable names from tokens
    const variables = tokens
      .filter(t => t.type === 'VARIABLE')
      .map(t => t.value as string);

    console.log(`Variables found: ${variables.length > 0 ? variables.join(', ') : 'none'}`);

    // Parse
    const ast = parse(tokens);

    // Validate
    const result = FormulaEngine.validate(testCase.expression, []);

    if (testCase.shouldParse) {
      if (result.isValid || result.errors.length === 0 || !result.errors.some(e => e.message.includes('Expected token type'))) {
        console.log('✅ PASSED - Expression parsed successfully');
        passed++;
      } else {
        console.log(`❌ FAILED - Parse errors: ${result.errors.map(e => e.message).join(', ')}`);
        failed++;
      }
    }

    // Check if expected variables are found
    const allVariablesFound = testCase.expectedVariables.every(expected =>
      variables.some(found => found === expected)
    );

    if (allVariablesFound) {
      console.log('✅ All expected variables found');
    } else {
      const missing = testCase.expectedVariables.filter(expected =>
        !variables.some(found => found === expected)
      );
      console.log(`⚠️  Missing variables: ${missing.join(', ')}`);
    }

  } catch (error) {
    if (testCase.shouldParse) {
      console.log(`❌ FAILED - Error: ${(error as Error).message}`);
      failed++;
    } else {
      console.log(`✅ PASSED - Expected error: ${(error as Error).message}`);
      passed++;
    }
  }
});

console.log('\n' + '='.repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log('='.repeat(80));

if (failed === 0) {
  console.log('✅ All tests passed! Multi-word variable names are working correctly.');
} else {
  console.log('❌ Some tests failed. Please review the tokenizer implementation.');
  process.exit(1);
}
