# PAY Days Feature - Data Flow Diagram

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                  StructureAssignmentPage.tsx                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User selects structure
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOAD EXISTING DATA                           │
│                                                                 │
│  loadExistingCommonComponentValues()                            │
│    │                                                            │
│    ├─► Query: employee_salary_structure_assignments            │
│    │   WHERE salary_structure_id = selected_id                 │
│    │   AND employee_id IS NULL (structure-level)               │
│    │                                                            │
│    └─► Returns:                                                 │
│        • pay_days_type (calendar_days or custom)               │
│        • custom_pay_days (number or null)                      │
│        • individual_component_values (jsonb)                   │
│                                                                 │
│  State Updated:                                                 │
│    setPayDaysType(data.pay_days_type)                          │
│    setCustomPayDays(data.custom_pay_days)                      │
│    setCommonComponentValues(data.individual_component_values)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      UI RENDERING                               │
│                                                                 │
│  PAY Days Configuration Section:                               │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ PAY Days Type: [Calendar Days ▼]                      │    │
│  │                                                        │    │
│  │ {payDaysType === 'custom' && (                        │    │
│  │   Custom Days: [____26____]                           │    │
│  │ )}                                                     │    │
│  │                                                        │    │
│  │ ℹ️ Information Box                                     │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  Common Component Values Section:                              │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ Component inputs...                [Save Configuration]│    │
│  └───────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks Save Configuration
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     VALIDATION LAYER                            │
│                                                                 │
│  Frontend Validation:                                           │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ if (payDaysType === 'custom') {                      │     │
│  │   if (!customPayDays || customPayDays <= 0) {        │     │
│  │     ❌ Show Error Toast                               │     │
│  │     return;                                           │     │
│  │   }                                                   │     │
│  │ }                                                     │     │
│  │                                                       │     │
│  │ if (commonComponents.length > 0) {                   │     │
│  │   // Validate all component values entered           │     │
│  │ }                                                     │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
│  ✅ Validation Passed                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SAVE TO DATABASE                            │
│                saveCommonComponentValues()                      │
│                                                                 │
│  Prepare Payload:                                               │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ {                                                     │     │
│  │   p_tenant_id: auth.tenantId,                        │     │
│  │   p_salary_structure_id: selectedStructureId,        │     │
│  │   p_component_values: commonComponentValues,         │     │
│  │   p_pay_days_type: payDaysType,                      │     │
│  │   p_custom_pay_days: payDaysType === 'custom'        │     │
│  │                      ? customPayDays : null           │     │
│  │ }                                                     │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
│  API Call:                                                      │
│    await supabase.rpc(                                          │
│      'upsert_common_salary_structure_assignment',              │
│      payload                                                    │
│    )                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE FUNCTION                             │
│         upsert_common_salary_structure_assignment()             │
│                                                                 │
│  Function Logic:                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ 1. Validate pay_days_type                            │     │
│  │    ├─► Must be 'calendar_days' or 'custom'           │     │
│  │    └─► Raise exception if invalid                    │     │
│  │                                                       │     │
│  │ 2. Validate custom_pay_days                          │     │
│  │    ├─► If type = 'custom':                           │     │
│  │    │   - Must not be NULL                            │     │
│  │    │   - Must be > 0                                 │     │
│  │    └─► Raise exception if invalid                    │     │
│  │                                                       │     │
│  │ 3. Check existing record                             │     │
│  │    SELECT * FROM assignments                         │     │
│  │    WHERE salary_structure_id = p_structure_id        │     │
│  │      AND employee_id IS NULL                         │     │
│  │                                                       │     │
│  │ 4. Upsert record                                     │     │
│  │    IF FOUND:                                         │     │
│  │      UPDATE SET                                      │     │
│  │        pay_days_type = p_pay_days_type,             │     │
│  │        custom_pay_days = CASE                        │     │
│  │          WHEN p_pay_days_type = 'custom'            │     │
│  │          THEN p_custom_pay_days                      │     │
│  │          ELSE NULL                                   │     │
│  │        END,                                          │     │
│  │        individual_component_values = p_values,       │     │
│  │        updated_at = now()                            │     │
│  │    ELSE:                                             │     │
│  │      INSERT INTO assignments (...)                   │     │
│  │      VALUES (                                        │     │
│  │        employee_id = NULL, -- Structure level        │     │
│  │        pay_days_type = p_pay_days_type,             │     │
│  │        custom_pay_days = ...,                        │     │
│  │        ...                                           │     │
│  │      )                                               │     │
│  │                                                       │     │
│  │ 5. Return result                                     │     │
│  │    RETURN jsonb_build_object(                        │     │
│  │      'success', true,                                │     │
│  │      'action', 'created|updated'                     │     │
│  │    )                                                 │     │
│  └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ ✅ Success
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  DATABASE TABLE UPDATE                          │
│           employee_salary_structure_assignments                 │
│                                                                 │
│  Record Structure:                                              │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ id: uuid (auto-generated)                            │     │
│  │ tenant_id: uuid (from auth)                          │     │
│  │ salary_structure_id: uuid (selected structure)       │     │
│  │ employee_id: NULL ← (IMPORTANT: Structure level)     │     │
│  │ pay_days_type: 'calendar_days' | 'custom'           │     │
│  │ custom_pay_days: 26.00 | NULL                        │     │
│  │ individual_component_values: {...}                   │     │
│  │ assigned_at: timestamp                               │     │
│  │ updated_at: timestamp                                │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
│  Constraints Applied:                                           │
│  • pay_days_type IN ('calendar_days', 'custom')                │
│  • custom_pay_days > 0 (when not null)                         │
│  • Unique on (tenant_id, salary_structure_id, employee_id)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Database returns success
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND RESPONSE                           │
│                                                                 │
│  Success Handling:                                              │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ toast.success('Structure configuration saved')       │     │
│  │ setSavingCommonComponents(false)                     │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
│  Error Handling:                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ toast.error(error.message)                           │     │
│  │ console.error('Error:', error)                       │     │
│  │ setSavingCommonComponents(false)                     │     │
│  └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## State Flow Diagram

```
┌─────────────┐
│  Component  │
│   Mounts    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Initial State                       │
│ • payDaysType: 'calendar_days'      │
│ • customPayDays: 30                 │
│ • commonComponentValues: {}         │
└──────┬──────────────────────────────┘
       │
       │ useEffect([selectedStructureId])
       ▼
┌─────────────────────────────────────┐
│ loadExistingCommonComponentValues() │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Load from Database                  │
│ • Query structure-level record      │
│ • Extract PAY Days settings         │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Update State                        │
│ • setPayDaysType(loaded_type)       │
│ • setCustomPayDays(loaded_days)     │
│ • setCommonComponentValues(values)  │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Render UI                           │
│ • Show dropdown with current value  │
│ • Show/hide custom input            │
│ • Show component value inputs       │
└──────┬──────────────────────────────┘
       │
       │ User interaction
       ▼
┌─────────────────────────────────────┐
│ State Changes                       │
│                                     │
│ Dropdown Change:                    │
│   setPayDaysType(newType)          │
│   ├─► 'calendar_days' → Hide input │
│   └─► 'custom' → Show input        │
│                                     │
│ Input Change:                       │
│   setCustomPayDays(newValue)       │
│                                     │
│ Save Button Click:                  │
│   saveCommonComponentValues()      │
└─────────────────────────────────────┘
```

## Validation Flow

```
┌──────────────────────────────────────────────┐
│        User Clicks "Save Configuration"      │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│    Frontend Validation #1                    │
│    Check Common Components                   │
├──────────────────────────────────────────────┤
│  if (commonComponents.length > 0) {          │
│    missingValues = components.filter(...)    │
│    if (missingValues.length > 0) {           │
│      ❌ Error: "Please enter values for      │
│          all common components"              │
│      STOP                                    │
│    }                                         │
│  }                                           │
└────────────────┬─────────────────────────────┘
                 │ ✅ Pass
                 ▼
┌──────────────────────────────────────────────┐
│    Frontend Validation #2                    │
│    Check Custom Pay Days                     │
├──────────────────────────────────────────────┤
│  if (payDaysType === 'custom') {             │
│    if (!customPayDays || customPayDays <= 0) │
│      ❌ Error: "Please enter valid number    │
│          of custom pay days"                 │
│      STOP                                    │
│    }                                         │
│  }                                           │
└────────────────┬─────────────────────────────┘
                 │ ✅ Pass
                 ▼
┌──────────────────────────────────────────────┐
│         Send to Database Function            │
│    upsert_common_salary_structure_assignment │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│    Database Validation #1                    │
│    Check pay_days_type                       │
├──────────────────────────────────────────────┤
│  IF pay_days_type NOT IN                     │
│     ('calendar_days', 'custom')              │
│  THEN                                        │
│    ❌ RAISE EXCEPTION                         │
│       'Invalid pay_days_type'                │
│    STOP                                      │
│  END IF                                      │
└────────────────┬─────────────────────────────┘
                 │ ✅ Pass
                 ▼
┌──────────────────────────────────────────────┐
│    Database Validation #2                    │
│    Check custom_pay_days when custom         │
├──────────────────────────────────────────────┤
│  IF pay_days_type = 'custom' AND             │
│     (custom_pay_days IS NULL OR              │
│      custom_pay_days <= 0)                   │
│  THEN                                        │
│    ❌ RAISE EXCEPTION                         │
│       'custom_pay_days must be positive'     │
│    STOP                                      │
│  END IF                                      │
└────────────────┬─────────────────────────────┘
                 │ ✅ Pass
                 ▼
┌──────────────────────────────────────────────┐
│    Database Constraint Check                 │
│    (Automatic by PostgreSQL)                 │
├──────────────────────────────────────────────┤
│  CHECK (pay_days_type IN                     │
│         ('calendar_days', 'custom'))         │
│                                              │
│  CHECK (custom_pay_days > 0)                 │
└────────────────┬─────────────────────────────┘
                 │ ✅ Pass
                 ▼
┌──────────────────────────────────────────────┐
│         Database Write Success               │
│         Return to Frontend                   │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│    Show Success Toast                        │
│    "Structure configuration saved"           │
└──────────────────────────────────────────────┘
```

## Data Structure in Database

```
employee_salary_structure_assignments table:

┌─────────────────────────────────────────────────────────────┐
│ Structure-Level Records (employee_id IS NULL)               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Structure A (Monthly Salary)                               │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ id: uuid-1                                            │ │
│  │ tenant_id: tenant-uuid                                │ │
│  │ salary_structure_id: structure-a-uuid                 │ │
│  │ employee_id: NULL ← (Structure level)                 │ │
│  │ pay_days_type: 'calendar_days'                        │ │
│  │ custom_pay_days: NULL                                 │ │
│  │ individual_component_values: {                        │ │
│  │   "component-1-uuid": 5000,                           │ │
│  │   "component-2-uuid": 2000                            │ │
│  │ }                                                     │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Structure B (Contract Workers)                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ id: uuid-2                                            │ │
│  │ tenant_id: tenant-uuid                                │ │
│  │ salary_structure_id: structure-b-uuid                 │ │
│  │ employee_id: NULL ← (Structure level)                 │ │
│  │ pay_days_type: 'custom'                               │ │
│  │ custom_pay_days: 26.00                                │ │
│  │ individual_component_values: {                        │ │
│  │   "component-3-uuid": 3000                            │ │
│  │ }                                                     │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Employee-Level Records (employee_id NOT NULL)               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Employee 1 in Structure A                                  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ id: uuid-3                                            │ │
│  │ tenant_id: tenant-uuid                                │ │
│  │ salary_structure_id: structure-a-uuid                 │ │
│  │ employee_id: employee-1-uuid ← (Employee level)       │ │
│  │ pay_days_type: NULL (inherits from structure)         │ │
│  │ custom_pay_days: NULL (inherits from structure)       │ │
│  │ individual_component_values: {                        │ │
│  │   "individual-comp-1-uuid": 10000                     │ │
│  │ }                                                     │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Query Patterns

### Load PAY Days for Structure
```sql
SELECT
  pay_days_type,
  custom_pay_days,
  individual_component_values
FROM employee_salary_structure_assignments
WHERE tenant_id = $1
  AND salary_structure_id = $2
  AND employee_id IS NULL; -- Structure-level record
```

### Save PAY Days for Structure
```sql
-- Handled by RPC function
SELECT upsert_common_salary_structure_assignment(
  $1::uuid,  -- tenant_id
  $2::uuid,  -- salary_structure_id
  $3::jsonb, -- component_values
  $4::text,  -- pay_days_type
  $5::numeric -- custom_pay_days
);
```

### Get PAY Days for Payroll Calculation
```sql
-- When processing payroll for a specific structure
SELECT
  COALESCE(pay_days_type, 'calendar_days') as pay_days_type,
  custom_pay_days
FROM employee_salary_structure_assignments
WHERE tenant_id = $1
  AND salary_structure_id = $2
  AND employee_id IS NULL;

-- Then in application code:
IF pay_days_type = 'calendar_days' THEN
  days := get_days_in_month(year, month)
ELSE
  days := custom_pay_days
END IF
```

---

**This diagram shows the complete flow from UI interaction to database persistence and back.**
