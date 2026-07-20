# Employee Advance System - Implementation Plan

## Executive Summary

This document outlines the comprehensive implementation plan for an employee advance management system integrated with the existing payroll application. The system will manage advance requests, approvals, deductions, holds, and closures while maintaining full backward compatibility.

---

## 1. Database Schema Design

### 1.1 Core Tables

#### Table: `employee_advances`
Main table storing all advance requests and their lifecycle.

```sql
- id (uuid, PK)
- tenant_id (uuid, FK to tenants)
- employee_id (uuid, FK to employees)
- request_date (date)
- requested_amount (numeric)
- approved_amount (numeric, nullable)
- installments (integer) - Number of monthly deductions
- interest_rate (numeric) - Percentage
- deduction_start_month (text) - Format: YYYY-MM
- justification (text)
- status (text) - pending, approved, rejected, active, completed, cancelled, closed
- requested_by (uuid, FK to auth.users)
- approved_by (uuid, FK to auth.users, nullable)
- approved_date (date, nullable)
- approval_comments (text, nullable)
- total_amount (numeric) - Approved amount + interest
- remaining_balance (numeric)
- created_at (timestamptz)
- updated_at (timestamptz)
```

**Status Flow:**
- `pending` → Initial state after request
- `approved` → Approved but not yet active
- `active` → Currently being deducted
- `completed` → All installments paid
- `rejected` → Request denied
- `cancelled` → Cancelled by employee before approval
- `closed` → Short closed before completion

#### Table: `advance_installments`
Tracks individual installment deductions.

```sql
- id (uuid, PK)
- tenant_id (uuid, FK to tenants)
- advance_id (uuid, FK to employee_advances)
- installment_number (integer)
- due_month (text) - Format: YYYY-MM
- amount (numeric)
- principal_amount (numeric)
- interest_amount (numeric)
- status (text) - scheduled, deducted, held, waived
- deducted_date (date, nullable)
- payroll_id (uuid, FK to payroll, nullable)
- created_at (timestamptz)
```

**Status Flow:**
- `scheduled` → Waiting for deduction month
- `deducted` → Successfully deducted from salary
- `held` → Temporarily suspended
- `waived` → Waived due to short closure

#### Table: `advance_deduction_holds`
Manages temporary suspension of deductions.

```sql
- id (uuid, PK)
- tenant_id (uuid, FK to tenants)
- advance_id (uuid, FK to employee_advances)
- hold_month (text) - Format: YYYY-MM
- reason (text)
- created_by (uuid, FK to auth.users)
- created_at (timestamptz)
```

#### Table: `advance_short_closures`
Records early closure of advances.

```sql
- id (uuid, PK)
- tenant_id (uuid, FK to tenants)
- advance_id (uuid, FK to employee_advances)
- closure_type (text) - authority_initiated, employee_requested
- closure_amount (numeric) - Remaining balance at closure
- closure_reason (text)
- approved_by (uuid, FK to auth.users)
- closure_date (date)
- payroll_id (uuid, FK to payroll, nullable) - For employee-requested one-time deduction
- created_at (timestamptz)
```

#### Table: `advance_settings`
Global settings for advance management.

```sql
- id (uuid, PK)
- tenant_id (uuid, FK to tenants)
- default_interest_rate (numeric)
- max_advance_amount (numeric, nullable)
- max_installments (integer, nullable)
- min_installments (integer, nullable)
- allow_multiple_advances (boolean)
- require_justification (boolean)
- created_at (timestamptz)
- updated_at (timestamptz)
```

### 1.2 Indexes

```sql
CREATE INDEX idx_employee_advances_tenant_id ON employee_advances(tenant_id);
CREATE INDEX idx_employee_advances_employee_id ON employee_advances(employee_id);
CREATE INDEX idx_employee_advances_status ON employee_advances(status);
CREATE INDEX idx_advance_installments_advance_id ON advance_installments(advance_id);
CREATE INDEX idx_advance_installments_due_month ON advance_installments(due_month);
CREATE INDEX idx_advance_deduction_holds_advance_id ON advance_deduction_holds(advance_id);
```

### 1.3 Row Level Security Policies

All tables will have RLS enabled with the following policies:
- **SELECT**: Users can view advances for employees in their tenant
- **INSERT**: Employees can create requests; Admins can create on behalf
- **UPDATE**: Request owners can update pending requests; Approvers can approve/reject
- **DELETE**: Restricted to tenant admins for cleanup only

---

## 2. State Management Architecture

### 2.1 Store: `advancesStore.ts`

**State Structure:**
```typescript
interface AdvancesStore {
  // Data
  advances: EmployeeAdvance[];
  installments: AdvanceInstallment[];
  holds: AdvanceDeductionHold[];
  closures: AdvanceShortClosure[];
  settings: AdvanceSettings | null;

  // UI State
  loading: boolean;
  error: string | null;

  // CRUD Operations
  fetchAdvances: (filters?: AdvanceFilters) => Promise<void>;
  createAdvanceRequest: (request: AdvanceRequest) => Promise<EmployeeAdvance>;
  updateAdvanceRequest: (id: string, updates: Partial<AdvanceRequest>) => Promise<void>;
  cancelAdvanceRequest: (id: string) => Promise<void>;

  // Approval Operations
  approveAdvance: (id: string, approval: AdvanceApproval) => Promise<void>;
  rejectAdvance: (id: string, reason: string) => Promise<void>;

  // Installment Management
  fetchInstallments: (advanceId: string) => Promise<void>;

  // Hold Operations
  createDeductionHold: (hold: DeductionHoldRequest) => Promise<void>;
  removeDeductionHold: (holdId: string) => Promise<void>;

  // Short Closure Operations
  initiateShortClosure: (closure: ShortClosureRequest) => Promise<void>;

  // Settings Operations
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AdvanceSettings>) => Promise<void>;

  reset: () => void;
}
```

---

## 3. User Interface Components

### 3.1 Component Hierarchy

```
AdvancesPage (Main Container)
├── AdvanceRequestModal
│   ├── AdvanceRequestForm
│   └── ValidationMessages
├── AdvancesList
│   ├── AdvanceFilters
│   ├── AdvanceCard/AdvanceRow
│   └── AdvancePagination
├── AdvanceDetailsModal
│   ├── AdvanceInformation
│   ├── InstallmentSchedule
│   ├── PaymentHistory
│   └── AdvanceActions
├── AdvanceApprovalModal
│   ├── ApprovalForm
│   └── TermsEditor
├── DeductionHoldModal
│   └── HoldForm
├── ShortClosureModal
│   └── ClosureForm
└── AdvanceSettingsPage
    └── SettingsForm
```

### 3.2 Page Routes

```
/dashboard/advances - Main advances page
/dashboard/advances/new - New advance request
/dashboard/advances/:id - Advance details
/dashboard/advances/:id/edit - Edit pending request
/dashboard/advances/approvals - Approval queue (for authorized users)
/dashboard/settings (tab) - Advance settings
```

### 3.3 Key UI Features

#### Advance Request Form
- **Fields:**
  - Amount (numeric input with validation)
  - Installments (dropdown: 1-24 months)
  - Interest Rate (pre-filled from settings, editable)
  - Start Month (month picker, minimum: next month)
  - Justification (textarea)
- **Validation:**
  - Amount > 0 and <= max allowed
  - Installments within allowed range
  - Interest rate >= 0
  - Start month is future month
  - Justification required if setting enabled
- **Actions:**
  - Submit Request
  - Save as Draft
  - Cancel

#### Approval Interface
- **Display:**
  - Employee details
  - Request details
  - Calculated total with interest
  - Installment schedule preview
- **Editable Fields:**
  - Approved amount (can differ from requested)
  - Number of installments
  - Interest rate
  - Deduction start month
  - Approval comments
- **Actions:**
  - Approve
  - Reject with reason
  - Request clarification

#### Deduction Hold
- **Fields:**
  - Select months to hold (multi-select)
  - Hold reason
- **Display:**
  - Current installment schedule
  - Impact of hold on schedule
  - New completion date
- **Actions:**
  - Apply Hold
  - Cancel

#### Short Closure
- **Types:**
  - Authority-initiated: Forgive remaining balance
  - Employee-requested: Deduct full balance in one payroll
- **Fields:**
  - Closure type
  - Remaining balance (calculated)
  - Closure reason
  - Effective date
- **Display:**
  - Original advance details
  - Amount paid so far
  - Remaining balance
  - Interest adjustment if any
- **Actions:**
  - Confirm Closure
  - Cancel

---

## 4. Business Logic & Workflows

### 4.1 Advance Request Workflow

```
Employee submits request
    ↓
Status: pending
    ↓
Approver reviews
    ↓
    ├─→ Approved → Status: approved → Payroll deduction starts → Status: active
    ├─→ Rejected → Status: rejected (End)
    └─→ Employee cancels → Status: cancelled (End)
```

### 4.2 Installment Calculation

**Formula:**
```
Total Amount = Approved Amount × (1 + Interest Rate / 100)
Monthly Installment = Total Amount / Number of Installments
Principal per Installment = Approved Amount / Number of Installments
Interest per Installment = Monthly Installment - Principal per Installment
```

**Example:**
- Approved Amount: $1,000
- Interest Rate: 5%
- Installments: 10
- Total Amount: $1,000 × 1.05 = $1,050
- Monthly Installment: $1,050 / 10 = $105
- Principal per Installment: $1,000 / 10 = $100
- Interest per Installment: $5

### 4.3 Deduction Hold Logic

When a hold is placed:
1. Mark installments for hold months as `held`
2. Shift subsequent installments by hold duration
3. Update completion date
4. Maintain total amount unchanged

**Example:**
- Original: Jan, Feb, Mar, Apr, May (5 months)
- Hold: March
- Result: Jan, Feb, Apr, May, Jun (5 months, March skipped)

### 4.4 Short Closure Logic

**Authority-Initiated:**
1. Calculate remaining balance
2. Mark remaining installments as `waived`
3. Update advance status to `closed`
4. Record closure details
5. No deduction from salary

**Employee-Requested:**
1. Calculate remaining balance
2. Schedule one-time deduction in next payroll
3. Mark remaining installments as `waived`
4. Update advance status to `closed`
5. Create special installment record for final deduction

---

## 5. Payroll Integration

### 5.1 Integration Points

#### During Payroll Calculation (`payrollCalculation.ts`)

**Step 1: Fetch Active Advances**
```typescript
const activeAdvances = await fetchActiveAdvancesForMonth(employeeId, payrollMonth);
```

**Step 2: Calculate Deductions**
```typescript
for (const advance of activeAdvances) {
  const installment = getInstallmentForMonth(advance.id, payrollMonth);

  if (installment && installment.status === 'scheduled') {
    // Add to deductions
    deductions.push({
      type: 'advance_deduction',
      description: `Advance Installment ${installment.installment_number}/${advance.installments}`,
      amount: installment.amount,
      advance_id: advance.id,
      installment_id: installment.id
    });
  }
}
```

**Step 3: Update Records**
```typescript
// After successful payroll processing
await markInstallmentAsDeducted(installmentId, payrollId);
await updateAdvanceBalance(advanceId, installmentAmount);

// Check if completed
if (remainingBalance === 0) {
  await updateAdvanceStatus(advanceId, 'completed');
}
```

### 5.2 Payroll Components Update

**File: `src/lib/payrollCalculation.ts`**

Add new function:
```typescript
export async function calculateAdvanceDeductions(
  employeeId: string,
  payrollMonth: string,
  tenantId: string
): Promise<DeductionItem[]>
```

**File: `src/stores/payrollStore.ts`**

Integrate advance deductions in payroll processing.

---

## 6. Reporting Integration

### 6.1 Reports to Update

#### 6.1.1 Payroll Summary Report
Add section:
- **Advance Deductions Summary**
  - Number of employees with deductions
  - Total advance deductions
  - Breakdown by employee

#### 6.1.2 Employee Statement
Add section:
- **Advance Details**
  - Active advances
  - Installment deducted this month
  - Remaining balance
  - Next installment amount

#### 6.1.3 Transaction Report
Include:
- Advance disbursements
- Advance deductions
- Short closures

#### 6.1.4 New Reports

**Advance Management Report**
- All advances by status
- Total amount advanced
- Total amount recovered
- Outstanding balance by employee
- Completion rate

**Advance Aging Report**
- Advances by age
- Overdue installments (if any)
- Risk assessment

---

## 7. Validation Rules

### 7.1 Request Validation

- **Amount:**
  - Must be > 0
  - Must be <= max_advance_amount (if set)
  - Must be <= employee's monthly salary × allowed multiplier

- **Installments:**
  - Must be between min_installments and max_installments
  - Must be > 0

- **Interest Rate:**
  - Must be >= 0
  - Must be <= 100

- **Start Month:**
  - Must be future month (at least next month)
  - Must be valid format YYYY-MM

- **Multiple Advances:**
  - If allow_multiple_advances = false, check no active advances exist

### 7.2 Approval Validation

- Approved amount must be > 0
- Approved amount can differ from requested amount
- All terms can be modified during approval
- Comments should be provided if terms are changed

### 7.3 Hold Validation

- Can only hold scheduled installments
- Cannot hold already deducted installments
- Cannot hold current or past months
- Hold reason is required

### 7.4 Closure Validation

- Can only close active advances
- Remaining balance must be > 0
- Closure reason is required
- For employee-requested, verify employee has sufficient salary

---

## 8. Security & Permissions

### 8.1 Role-Based Access

**Employees:**
- Create advance requests
- View own advances
- Edit own pending requests
- Cancel own pending requests
- Request short closure

**Managers:**
- View team members' advances
- Approve/reject requests (if designated approver)

**HR/Admins:**
- View all advances
- Approve/reject all requests
- Create advances on behalf of employees
- Initiate deduction holds
- Initiate authority short closures
- Manage advance settings

### 8.2 RLS Policies

**employee_advances:**
```sql
-- Employees can view their own advances
SELECT: user_id IN (SELECT id FROM employees WHERE employee_id = auth.uid())

-- Admins can view all tenant advances
SELECT: tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'tenant_admin')

-- Employees can insert their own requests
INSERT: employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())

-- Approvers can update for approval
UPDATE: (status = 'pending' AND user is approver) OR (employee_id = auth.uid() AND status = 'pending')
```

---

## 9. Error Handling

### 9.1 Common Errors

**Insufficient Salary:**
- Error when advance amount exceeds deductible amount
- Warning during approval if installment > 50% of salary

**Database Errors:**
- Connection failures
- Constraint violations
- Foreign key errors

**Business Logic Errors:**
- Attempting to approve already approved advance
- Attempting to hold past installments
- Attempting multiple advances when not allowed

### 9.2 Error Recovery

- Graceful degradation
- User-friendly error messages
- Retry mechanisms for transient errors
- Transaction rollback on failures

---

## 10. Testing Strategy

### 10.1 Unit Tests

- State management functions
- Calculation functions
- Validation functions

### 10.2 Integration Tests

- Database operations
- Payroll integration
- Report generation

### 10.3 User Acceptance Tests

- Complete advance lifecycle
- Approval workflow
- Deduction holds
- Short closures
- Settings management

### 10.4 Test Scenarios

1. **Happy Path:**
   - Employee requests advance → Approved → Deductions complete → Status: completed

2. **Rejection Path:**
   - Employee requests advance → Rejected → End

3. **Cancellation Path:**
   - Employee requests advance → Employee cancels → End

4. **Hold Path:**
   - Active advance → Hold applied → Installments shifted → Resumes → Completes

5. **Short Closure - Authority:**
   - Active advance → Authority closes → Balance waived → Status: closed

6. **Short Closure - Employee:**
   - Active advance → Employee requests closure → Balance deducted → Status: closed

---

## 11. Migration & Rollout Plan

### 11.1 Phase 1: Database Setup (Week 1)
- Create all tables
- Set up RLS policies
- Create indexes
- Test data integrity

### 11.2 Phase 2: Backend Implementation (Week 2)
- Implement state management
- Create API functions
- Implement business logic
- Unit testing

### 11.3 Phase 3: UI Development (Week 3-4)
- Build all components
- Implement workflows
- Integrate with backend
- UI/UX testing

### 11.4 Phase 4: Payroll Integration (Week 5)
- Integrate with payroll calculation
- Test deduction logic
- Verify balance updates
- End-to-end testing

### 11.5 Phase 5: Reporting (Week 6)
- Update existing reports
- Create new reports
- Test report accuracy
- Performance optimization

### 11.6 Phase 6: UAT & Deployment (Week 7)
- User acceptance testing
- Bug fixes
- Documentation
- Production deployment

---

## 12. Documentation Deliverables

### 12.1 Technical Documentation
- API documentation
- Database schema documentation
- Integration guide
- Deployment guide

### 12.2 User Documentation
- User guide for employees
- Admin guide for approvers
- Settings configuration guide
- Troubleshooting guide

---

## 13. Success Metrics

### 13.1 Technical Metrics
- Zero data loss
- < 2s page load time
- 99.9% uptime
- Zero breaking changes to existing features

### 13.2 Business Metrics
- User adoption rate
- Request approval time
- Payroll processing accuracy
- User satisfaction score

---

## 14. Future Enhancements

### 14.1 Phase 2 Features
- Advance repayment through external payments
- Advance against leave encashment
- Auto-approval based on rules
- Mobile notifications for approvals
- Bulk advance processing

### 14.2 Advanced Features
- Predictive analytics for advance patterns
- Risk scoring for advance approvals
- Integration with external lending services
- Advanced reporting with dashboards
- Audit trail and compliance reports

---

## 15. Appendix

### 15.1 Database ERD
```
[employee_advances] 1---* [advance_installments]
[employee_advances] 1---* [advance_deduction_holds]
[employee_advances] 1---1 [advance_short_closures]
[tenants] 1---1 [advance_settings]
[employees] 1---* [employee_advances]
```

### 15.2 State Transitions
```
pending → approved → active → completed
pending → rejected
pending → cancelled
active → closed (short closure)
```

### 15.3 Calculation Examples

**Example 1: Simple Advance**
- Requested: $1,000
- Interest: 0%
- Installments: 10
- Monthly: $100
- Total: $1,000

**Example 2: Advance with Interest**
- Requested: $1,000
- Interest: 5%
- Installments: 10
- Monthly: $105
- Total: $1,050

**Example 3: Modified Approval**
- Requested: $1,000 for 10 months at 5%
- Approved: $800 for 8 months at 3%
- Monthly: $103
- Total: $824

---

## Conclusion

This implementation plan provides a comprehensive blueprint for building a robust employee advance management system. The phased approach ensures minimal disruption to existing functionality while delivering a feature-rich solution that meets all specified requirements.
