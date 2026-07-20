import { tokenize } from './src/lib/formula-engine/tokenizer.ts';
import { parse } from './src/lib/formula-engine/parser.ts';

console.log('Testing tokenizer with multi-word variable names...\n');

// Test case 1: The problematic expression
const expression1 = 'IF( AbsentDays ==0 ) THEN Washing Allowance   ELSE 0';
console.log(`Expression: ${expression1}`);
try {
  const tokens = tokenize(expression1);
  console.log('✓ Tokenization successful!');
  console.log('Tokens:', tokens.map(t => `${t.type}: "${t.value}"`).join(', '));

  const ast = parse(tokens);
  console.log('✓ Parsing successful!');
  console.log('AST:', JSON.stringify(ast, null, 2));
} catch (error) {
  console.error('✗ Error:', error.message);
}

console.log('\n---\n');

// Test case 2: Multiple multi-word variables
const expression2 = 'Basic Salary + House Rent Allowance + Transport Allowance';
console.log(`Expression: ${expression2}`);
try {
  const tokens = tokenize(expression2);
  console.log('✓ Tokenization successful!');
  console.log('Tokens:', tokens.map(t => `${t.type}: "${t.value}"`).join(', '));

  const ast = parse(tokens);
  console.log('✓ Parsing successful!');
} catch (error) {
  console.error('✗ Error:', error.message);
}

console.log('\n---\n');

// Test case 3: Make sure keywords still work correctly
const expression3 = 'IF Basic Salary > 10000 THEN Basic Salary ELSE 0';
console.log(`Expression: ${expression3}`);
try {
  const tokens = tokenize(expression3);
  console.log('✓ Tokenization successful!');
  console.log('Tokens:', tokens.map(t => `${t.type}: "${t.value}"`).join(', '));

  const ast = parse(tokens);
  console.log('✓ Parsing successful!');
} catch (error) {
  console.error('✗ Error:', error.message);
}

console.log('\n---\n');

// Test case 4: Complex expression with multi-word variables
const expression4 = 'IF Washing Allowance > 0 AND Basic Salary > 5000 THEN Washing Allowance ELSE 0';
console.log(`Expression: ${expression4}`);
try {
  const tokens = tokenize(expression4);
  console.log('✓ Tokenization successful!');
  console.log('Tokens:', tokens.map(t => `${t.type}: "${t.value}"`).join(', '));

  const ast = parse(tokens);
  console.log('✓ Parsing successful!');
} catch (error) {
  console.error('✗ Error:', error.message);
}

console.log('\n✅ All tests completed!');
