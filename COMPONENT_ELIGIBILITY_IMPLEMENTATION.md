# Component Eligibility Implementation Guide

## Overview
This document outlines the implementation of conditional eligibility for payroll components. The feature allows components to be assigned to employees based on custom expressions/conditions rather than applying to all employees by default.

## Database Changes

### New Fields Added to `payroll_components` Table

The following SQL migration needs to be applied to the database:

```sql
-- Add eligibility field
ALTER TABLE payroll_components
ADD COLUMN IF NOT EXISTS eligibility text DEFAULT 'all' CHECK (eligibility IN ('all', 'condition'));

-- Add eligibility expression field (human-readable)
ALTER TABLE payroll_components
ADD COLUMN IF NOT EXISTS eligibility_expression text;

-- Add eligibility expression AST field (machine-readable)
ALTER TABLE payroll_components
ADD COLUMN IF NOT EXISTS eligibility_expression_ast jsonb;

-- Add comments for documentation
COMMENT ON COLUMN payroll_components.eligibility IS 'Defines eligibility criteria: all (applies to all employees), condition (conditional based on expression)';
COMMENT ON COLUMN payroll_components.eligibility_expression IS 'Human-readable expression text for conditional eligibility';
COMMENT ON COLUMN payroll_components.eligibility_expression_ast IS 'Parsed Abstract Syntax Tree (AST) for conditional eligibility expression';
```

### Field Descriptions

1. **`eligibility`** (text, default: 'all')
   - Values: 'all' | 'condition'
   - Determines if the component applies to all employees or only those meeting a condition

2. **`eligibility_expression`** (text, nullable)
   - Stores the human-readable expression string
   - Example: "basic_salary > 50000 AND department = 'Engineering'"

3. **`eligibility_expression_ast`** (jsonb, nullable)
   - Stores the parsed Abstract Syntax Tree for machine processing
   - Used by the formula engine to evaluate eligibility at runtime

## Frontend Components Modified

### 1. ComponentMasterPage.tsx

**New Features:**
- Added "Eligibility" dropdown with two options:
  - **All**: Component applies to all employees (default)
  - **Condition**: Component has conditional eligibility based on an expression

- When "Condition" is selected:
  - Expression Output Box (read-only textarea) displays the current eligibility expression
  - "Build Expression" button opens the Formula Builder modal
  - Visual feedback with blue-themed styling

**Key Changes:**
```typescript
// New interface fields
interface PayrollComponent {
  // ... existing fields
  eligibility?: 'all' | 'condition';
  eligibility_expression?: string;
  eligibility_expression_ast?: any;
}

// New state
const [showFormulaBuilder, setShowFormulaBuilder] = useState(false);

// New form data fields
const [formData, setFormData] = useState({
  // ... existing fields
  eligibility: 'all' as 'all' | 'condition',
  eligibility_expression: '',
  eligibility_expression_ast: null as any,
});

// Handler for expression save
const handleExpressionSave = (expression: string, ast: any) => {
  setFormData({
    ...formData,
    eligibility_expression: expression,
    eligibility_expression_ast: ast,
  });
  setShowFormulaBuilder(false);
  toast.success('Expression saved successfully');
};
```

**UI Location:**
The eligibility field is positioned after the "Value Set" field and before the "Attendance Linked" section in the component form.

### 2. FormulaBuilderPage.tsx

**New Props Interface:**
```typescript
interface FormulaBuilderPageProps {
  isModal?: boolean;                    // Indicates if opened as a modal
  onSave?: (expression: string, ast: any) => void;  // Callback for saving
  onCancel?: () => void;                // Callback for canceling
  initialExpression?: string;            // Pre-populate expression
  initialAst?: any;                      // Pre-populate AST
}
```

**Modal Mode Behavior:**

When `isModal={true}`:
- **Hidden Elements:**
  - Template Name field
  - Description field
  - Category dropdown
  - "Save Template" button
  - "+ New" button
  - Template List section

- **Visible Elements:**
  - Variable Panel
  - Operator Panel
  - Function Panel
  - Expression Editor
  - Validation feedback
  - Expression Preview/Test
  - "Test Expression" button
  - "Cancel" button
  - "Save Expression" button (replaces Save Template)

- **New Action Buttons:**
  ```typescript
  // Modal mode buttons
  <button onClick={handleTest}>Test Expression</button>
  <button onClick={onCancel}>Cancel</button>
  <button onClick={handleSaveExpression}>Save Expression</button>
  ```

**Key Implementation:**
```typescript
const handleSaveExpression = () => {
  if (!expression.trim()) {
    alert('Please enter an expression');
    return;
  }

  const validation = validateExpression(expression);
  if (!validation.isValid) {
    alert(`Expression has errors: ${validation.errors.join(', ')}`);
    return;
  }

  const ast = useExpressionStore.getState().compileExpression(expression);
  if (!ast) {
    alert('Failed to compile expression');
    return;
  }

  if (onSave) {
    onSave(expression, ast);
  }
};
```

## Usage Flow

### Creating a Component with Conditional Eligibility

1. **Navigate** to Component Master page
2. **Click** "Add Component" button
3. **Fill** in component details (name, type, category, etc.)
4. **Select** "Condition" from the Eligibility dropdown
5. **Click** "Build Expression" button
6. **Formula Builder Modal Opens:**
   - Use Variable Panel to insert payroll variables
   - Use Operator Panel to add logical operators (AND, OR, >, <, =, etc.)
   - Use Function Panel for advanced functions
   - Type or build the expression in the editor
   - Click "Test Expression" to validate with sample data
7. **Click** "Save Expression" in the modal
8. **Review** the expression in the Expression Output Box
9. **Click** "Create" to save the component

### Editing an Existing Component's Eligibility

1. **Click** the Edit icon on a component
2. **Change** Eligibility to "Condition" (if not already)
3. **Click** "Build Expression" to modify
4. **Update** the expression in the Formula Builder
5. **Click** "Save Expression"
6. **Click** "Update" to save changes

## Expression Examples

### Example 1: Department-Based Eligibility
```
department = 'Engineering'
```
Component applies only to employees in the Engineering department.

### Example 2: Salary Range Eligibility
```
basic_salary > 50000 AND basic_salary < 100000
```
Component applies to employees with basic salary between 50,000 and 100,000.

### Example 3: Complex Condition
```
(department = 'Sales' OR department = 'Marketing') AND tenure_years >= 2
```
Component applies to Sales or Marketing employees with 2+ years of tenure.

## Data Storage

### In Database
When a component is saved with conditional eligibility:

```json
{
  "eligibility": "condition",
  "eligibility_expression": "basic_salary > 50000 AND department = 'Engineering'",
  "eligibility_expression_ast": {
    "type": "BinaryExpression",
    "operator": "AND",
    "left": {
      "type": "BinaryExpression",
      "operator": ">",
      "left": { "type": "Identifier", "name": "basic_salary" },
      "right": { "type": "Literal", "value": 50000 }
    },
    "right": {
      "type": "BinaryExpression",
      "operator": "=",
      "left": { "type": "Identifier", "name": "department" },
      "right": { "type": "Literal", "value": "Engineering" }
    }
  }
}
```

## Backward Compatibility

- All existing components default to `eligibility = 'all'`
- Existing components continue to work without modification
- No data migration required for existing components
- The eligibility field is optional in the UI

## Testing Checklist

- [ ] Create a new component with eligibility "All"
- [ ] Create a new component with eligibility "Condition"
- [ ] Open Formula Builder from Component Master
- [ ] Build and save an expression
- [ ] Verify expression displays in output box
- [ ] Edit an existing component's eligibility
- [ ] Test expression validation in Formula Builder
- [ ] Verify modal closes correctly
- [ ] Verify expression is saved to database
- [ ] Test with invalid expressions (should show errors)
- [ ] Verify template-related UI is hidden in modal mode
- [ ] Test Cancel button in modal
- [ ] Verify existing components are not affected

## Future Enhancements

1. **Runtime Evaluation**: Implement eligibility checking during payroll processing
2. **Expression Library**: Pre-built expression templates for common scenarios
3. **Visual Expression Builder**: Drag-and-drop interface for building conditions
4. **Eligibility Preview**: Show which employees qualify before saving
5. **Expression History**: Track changes to eligibility expressions over time

## Troubleshooting

### Expression Not Saving
- Check browser console for errors
- Verify expression is valid before saving
- Ensure database columns exist

### Modal Not Opening
- Check for JavaScript errors
- Verify FormulaBuilderPage component imports correctly
- Check z-index conflicts with other modals

### Expression Validation Errors
- Use Test Expression to debug
- Check variable names match available variables
- Verify syntax (operators, parentheses, quotes)

## Support

For issues or questions, refer to:
- Formula Engine documentation: `/src/lib/formula-engine/`
- Expression Store: `/src/stores/expressionStore.ts`
- Component Interface: `/src/components/dashboard/payroll/ComponentMasterPage.tsx`
