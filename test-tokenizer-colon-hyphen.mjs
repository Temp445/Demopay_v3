import { Tokenizer } from './src/lib/formula-engine/tokenizer.ts';

// Test case 1: Expression with colon and hyphen
console.log('Testing expression: "NSA * Shift: Shift-3"');
try {
  const tokenizer1 = new Tokenizer('NSA * Shift: Shift-3');
  const tokens1 = tokenizer1.tokenize();
  console.log('✓ Success! Tokens:', tokens1.map(t => ({ type: t.type, value: t.value })));
} catch (error) {
  console.error('✗ Failed:', error.message);
}

console.log('\n---\n');

// Test case 2: Expression with just colon
console.log('Testing expression: "Component: Value"');
try {
  const tokenizer2 = new Tokenizer('Component: Value');
  const tokens2 = tokenizer2.tokenize();
  console.log('✓ Success! Tokens:', tokens2.map(t => ({ type: t.type, value: t.value })));
} catch (error) {
  console.error('✗ Failed:', error.message);
}

console.log('\n---\n');

// Test case 3: Expression with just hyphen
console.log('Testing expression: "Shift-3 + Shift-4"');
try {
  const tokenizer3 = new Tokenizer('Shift-3 + Shift-4');
  const tokens3 = tokenizer3.tokenize();
  console.log('✓ Success! Tokens:', tokens3.map(t => ({ type: t.type, value: t.value })));
} catch (error) {
  console.error('✗ Failed:', error.message);
}

console.log('\n---\n');

// Test case 4: Expression with multiple special characters
console.log('Testing expression: "Basic-Pay: Level-1 * 2"');
try {
  const tokenizer4 = new Tokenizer('Basic-Pay: Level-1 * 2');
  const tokens4 = tokenizer4.tokenize();
  console.log('✓ Success! Tokens:', tokens4.map(t => ({ type: t.type, value: t.value })));
} catch (error) {
  console.error('✗ Failed:', error.message);
}

console.log('\n---\n');

// Test case 5: Ensure regular expressions still work
console.log('Testing expression: "IF AbsentDays <= 1 THEN 1000 ELSE 0"');
try {
  const tokenizer5 = new Tokenizer('IF AbsentDays <= 1 THEN 1000 ELSE 0');
  const tokens5 = tokenizer5.tokenize();
  console.log('✓ Success! Tokens:', tokens5.map(t => ({ type: t.type, value: t.value })));
} catch (error) {
  console.error('✗ Failed:', error.message);
}

console.log('\n---\n');
console.log('All tests completed!');
