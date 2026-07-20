# Overtime Management Module - Complete Implementation Guide

## Overview

The Overtime Management Module is a comprehensive system that integrates with the existing payroll application to manage overtime eligibility, approval workflows, structure configuration, processing, and reporting.

## System Architecture

### Database Layer (✅ Implemented)

#### Tables Created:

1. **employee_ot_eligibility**
   - Tracks employee OT eligibility status
   - Enable/disable toggle per employee
   - Effective date support
   - Audit trail (created_by, updated_by)

2. **ot_structures**
   - OT structure definitions (similar to salary structures)
   - Template-based system
   - Active/inactive status
   - Default structure flag

3. **ot_structure_components**
   - Components within OT structures
   - Types: `fixed`, `editable`, `enter_later`
   - Calculation types: `flat`, `hourly_rate`, `percentage`
   - Earnings-only (no deductions)
   - Display order for UI presentation

4. **ot_approvals**
   - Approval records with workflow
   - Original vs. corrected OT hours tracking
   - Mandatory modification reason
   - Approval status: `pending`, `approved`, `rejected`
   - Approver tracking

5. **ot_processing**
   - OT processing batch records
   - Processing modes: `standalone`, `linked`
   - Link to payroll processing (when linked)
   - Status workflow: `draft` → `processing` → `completed` → `finalized`
   - Summary totals (employees, amount)

6. **ot_processed_data**
   - Individual employee processed OT records
   - Component-wise breakdown (JSONB)
   - Attendance records reference (JSONB)
   - Total hours and amount

#### Database Functions:

1. **is_employee_ot_eligible(employee_id, tenant_id, check_date)**
   - Returns boolean indicating OT eligibility
   - Defaults to `true` if no record exists

2. **get_ot_eligible_employees(tenant_id, period_start, period_end)**
   - Returns table of OT-eligible employees
   - Includes calculated OT hours from attendance

3. **clone_ot_structure(source_id, new_name, tenant_id, user_id)**
   - Clones existing structure with all components
   - Returns new structure ID

## Module Components

### 1. OT Employee Management Screen

**Purpose**: Manage employee OT eligibility status

**Features**:
- Comprehensive employee list with search/filter
- Toggle switch for each employee to enable/disable OT
- Bulk operations support
- Effective date setting
- Notes/reason field
- Visual status indicators
- Export functionality

**UI Components Needed**:
```typescript
// src/components/dashboard/overtime/OTEmployeeManagement.tsx
- EmployeeList with toggles
- BulkActionBar
- SearchAndFilter component
- EmployeeOTStatusModal (for notes/effective date)
```

**State Management**:
```typescript
// src/stores/otEmployeesStore.ts
interface EmployeeOTStatus {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  isOTEligible: boolean;
  effectiveFrom: string;
  notes?: string;
}
```

**Key Functionality**:
- Load all employees with current OT status
- Toggle individual employee OT eligibility
- Bulk enable/disable operations
- Filter by department, status
- Search by name/employee code
- Update effective date and notes

**Integration Points**:
- Reads from: `employees`, `employee_ot_eligibility`
- Writes to: `employee_ot_eligibility`
- Uses function: `is_employee_ot_eligible`

---

### 2. OT Approval Screen

**Purpose**: Review and approve/edit overtime hours

**Features**:
- Attendance data grid with OT hours
- Inline editing of OT hours
- Mandatory reason field when editing
- Side-by-side original vs. corrected display
- Approval workflow buttons
- Date range filter
- Employee/department filter
- Bulk approval support
- Audit trail display

**UI Components Needed**:
```typescript
// src/components/dashboard/overtime/OTApprovalPage.tsx
- AttendanceOTGrid (editable data grid)
- OTEditModal (edit hours + reason)
- ApprovalActionBar
- AuditTrailPanel
- FilterPanel
```

**State Management**:
```typescript
// src/stores/otApprovalsStore.ts
interface OTApprovalRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  attendanceDate: string;
  clockIn?: string;
  clockOut?: string;
  originalOTHours: number;
  correctedOTHours?: number;
  modificationReason?: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
}
```

**Key Functionality**:
- Load attendance records with calculated OT
- Display original OT hours from calculation
- Allow editing with mandatory reason
- Show before/after comparison
- Approve/reject workflow
- Batch operations
- Export to Excel

**Validation Rules**:
- Corrected hours must be >= 0
- Reason required when hours modified
- Only eligible employees shown
- Status workflow enforcement

**Integration Points**:
- Reads from: `attendance_logs`, `employees`, `ot_approvals`
- Writes to: `ot_approvals`
- Calls: `calculate_overtime` function

---

### 3. OT Structure Configuration Screen

**Purpose**: Define OT payment structures

**Features**:
- Structure list view
- Create new structure
- Edit existing structure
- Clone structure
- Add/edit/delete components
- Component types: Fixed, Editable, Enter Later
- Calculation type selection
- Drag-and-drop ordering
- Activate/deactivate structures
- Set default structure
- Preview calculation

**UI Components Needed**:
```typescript
// src/components/dashboard/overtime/OTStructuresPage.tsx
- StructuresList
- CreateStructureModal
- EditStructureModal
- ComponentsList (draggable)
- AddComponentModal
- CloneStructureModal
- CalculationPreview
```

**State Management**:
```typescript
// src/stores/otStructuresStore.ts
interface OTStructure {
  id: string;
  structureName: string;
  description?: string;
  isActive: boolean;
  isDefault: boolean;
  components: OTComponent[];
}

interface OTComponent {
  id: string;
  componentName: string;
  componentType: 'fixed' | 'editable' | 'enter_later';
  calculationType: 'flat' | 'hourly_rate' | 'percentage';
  value: number;
  percentageOf?: string;
  displayOrder: number;
  isActive: boolean;
}
```

**Component Types Explained**:

1. **Fixed**: Predetermined amounts (e.g., Transport Allowance: $50)
   - Value set at structure level
   - Cannot be modified during processing

2. **Editable**: Can be modified during processing (e.g., Bonus: editable)
   - Default value provided
   - User can change during OT processing

3. **Enter Later**: Must be entered at processing time (e.g., Special Allowance)
   - No default value
   - Required field during processing

**Calculation Types**:

1. **Flat**: Fixed amount (e.g., $100)
2. **Hourly Rate**: Amount per OT hour (e.g., $20/hour)
3. **Percentage**: Percentage of another component or basic (e.g., 15% of Basic)

**Key Functionality**:
- CRUD operations for structures
- CRUD operations for components
- Drag-and-drop reordering
- Clone with all components
- Set active/default status
- Preview calculations
- Validation (no deductions allowed)

**Validation Rules**:
- Structure name must be unique
- At least one component required
- Component names unique within structure
- Earnings only (no deductions)
- Percentage components must reference valid component

**Integration Points**:
- Reads from: `ot_structures`, `ot_structure_components`
- Writes to: `ot_structures`, `ot_structure_components`
- Calls: `clone_ot_structure` function

---

### 4. OT Processing Screen

**Purpose**: Process overtime for a period

**Features**:
- Create new OT process
- Select processing mode (Standalone/Linked)
- Period selection (date range)
- OT structure selection
- Employee selection (auto-populated with eligible employees)
- Component value entry (for editable/enter_later types)
- Processing status workflow
- Summary display (total employees, total amount)
- Link to payroll process (when linked mode)
- Finalize processing
- Export processed data

**UI Components Needed**:
```typescript
// src/components/dashboard/overtime/OTProcessingPage.tsx
- ProcessingList (existing processes)
- CreateProcessModal
- ProcessingWizard (multi-step)
  - Step 1: Basic info (name, period, mode)
  - Step 2: Structure selection
  - Step 3: Employee selection
  - Step 4: Component values entry
  - Step 5: Review & process
- ProcessingDetailView
- EmployeeOTDataGrid (edit values)
- ProcessingSummary
- FinalizeConfirmation
```

**State Management**:
```typescript
// src/stores/otProcessingStore.ts
interface OTProcess {
  id: string;
  processName: string;
  periodStart: string;
  periodEnd: string;
  processingMode: 'standalone' | 'linked';
  linkedPayrollId?: string;
  otStructureId: string;
  processingStatus: 'draft' | 'processing' | 'completed' | 'finalized';
  totalEmployees: number;
  totalOTAmount: number;
  employees: ProcessedEmployee[];
}

interface ProcessedEmployee {
  employeeId: string;
  employeeName: string;
  totalOTHours: number;
  components: ProcessedComponent[];
  totalAmount: number;
}

interface ProcessedComponent {
  componentId: string;
  componentName: string;
  componentType: string;
  value: number;
  amount: number;
}
```

**Processing Modes**:

1. **Standalone Mode**:
   - Process OT independently
   - Creates separate OT records
   - Can be exported/reported separately
   - Does not affect regular payroll

2. **Linked Mode**:
   - Links to existing/new payroll process
   - OT components added to payroll
   - Appears in payroll components
   - Included in payroll calculations
   - Shows in pay slip

**Key Functionality**:

**Draft State**:
- Create new process
- Set period and mode
- Select structure
- System auto-populates eligible employees
- Calculates OT hours from attendance
- Applies structure components
- User enters editable/enter_later values

**Processing State**:
- Calculate all component amounts
- Validate all required values entered
- Apply hourly rates
- Calculate percentages
- Sum totals per employee
- Generate summary

**Completed State**:
- All calculations done
- Data saved to `ot_processed_data`
- Can be reviewed/edited
- Can export reports

**Finalized State**:
- Locked for editing
- If linked: Components added to payroll
- Audit trail locked
- Ready for payment

**Calculation Logic**:
```typescript
// Example calculation
For each employee:
  1. Get total OT hours from approved attendance
  2. For each component in structure:
     - If fixed: amount = value
     - If hourly_rate: amount = value * ot_hours
     - If percentage: amount = (value / 100) * base_amount
  3. Sum all components = total_ot_amount
```

**Integration Points**:
- Reads from:
  - `employees`, `employee_ot_eligibility`
  - `attendance_logs`, `ot_approvals`
  - `ot_structures`, `ot_structure_components`
  - `payroll_processing` (if linked)

- Writes to:
  - `ot_processing`
  - `ot_processed_data`
  - `payroll_processing` (if linked - adds components)

- Calls:
  - `get_ot_eligible_employees`
  - `is_employee_ot_eligible`

**Payroll Integration (Linked Mode)**:
When processing in linked mode:
1. Select existing payroll process OR create new
2. Process OT as normal
3. On finalize:
   - For each employee in OT processing:
     - For each OT component:
       - Add component to employee's payroll record
       - Type: Earning
       - Source: OT Processing
       - Amount: Calculated amount
   - Update payroll totals
   - Link via `linked_payroll_id`

**UI Workflow**:
```
1. Click "New OT Process" button
2. Modal opens with wizard:

   Step 1: Basic Information
   - Process Name: [____________]
   - Period: [Start Date] to [End Date]
   - Mode: ( ) Standalone  ( ) Linked to Payroll
   - [If Linked] Payroll Process: [Dropdown]
   - OT Structure: [Dropdown]

   Step 2: Employees (Auto-loaded)
   - Shows all eligible employees with OT hours
   - ☑ John Doe (EMP001) - 5.5 hours
   - ☑ Jane Smith (EMP002) - 3.0 hours
   - [ ] Bob Wilson (EMP003) - 0.0 hours

   Step 3: Component Values
   - For each employee, show editable components:
     Employee: John Doe
     - Base OT Rate: $20/hr (Fixed)
     - OT Allowance: [$___] (Editable)
     - Special Pay: [$___] (Enter Later)
     Calculated Total: $___

   Step 4: Review & Process
   - Summary table
   - Total Employees: 45
   - Total OT Hours: 234.5
   - Total Amount: $12,450.00
   - [Process] [Cancel]
```

---

### 5. OT Reporting Module

**Purpose**: Generate OT transaction reports

**Location**: Existing Transaction Reports section

**Features**:
- OT transaction report type
- Date range filter
- Employee/department filter
- Approval status filter
- Show original vs. corrected hours
- Show modification reasons
- Calculated amounts
- Export to Excel/PDF
- Drill-down to details

**UI Components Needed**:
```typescript
// Integrate into existing reports structure
// src/components/dashboard/reports/OTTransactionReport.tsx
- OTReportFilters
- OTReportTable
- OTReportSummary
- ExportButtons
```

**Report Columns**:
1. Employee Code
2. Employee Name
3. Department
4. Date
5. Original OT Hours
6. Corrected OT Hours
7. Variance
8. Modification Reason
9. Approval Status
10. OT Amount
11. Approved By
12. Approved Date

**State Management**:
```typescript
// Extend existing reportsStore
// src/stores/reportsStore.ts
interface OTReportData {
  employeeCode: string;
  employeeName: string;
  department: string;
  attendanceDate: string;
  originalOTHours: number;
  correctedOTHours?: number;
  variance: number;
  modificationReason?: string;
  approvalStatus: string;
  otAmount: number;
  approvedBy?: string;
  approvedAt?: string;
}
```

**Key Functionality**:
- Generate report for date range
- Filter by multiple criteria
- Calculate variance automatically
- Show only modified records option
- Group by employee/department/date
- Summary statistics
- Export in multiple formats

**Report Types**:

1. **OT Approval Report**
   - All OT records pending approval
   - Grouped by status
   - Action buttons

2. **OT Transaction Report**
   - All processed OT
   - Detailed breakdown
   - With amounts

3. **OT Modification Report**
   - Only modified records
   - Shows original vs. corrected
   - Reasons prominently displayed

4. **OT Summary Report**
   - Aggregated by period
   - Department-wise totals
   - Trend analysis

**Integration Points**:
- Reads from:
  - `ot_approvals`
  - `ot_processed_data`
  - `ot_processing`
  - `employees`, `departments`

---

## Implementation Checklist

### Phase 1: Core Infrastructure (✅ Complete)
- [x] Database tables created
- [x] RLS policies applied
- [x] Helper functions created
- [x] Indexes for performance

### Phase 2: Type Definitions & Stores
- [ ] Create TypeScript interfaces
- [ ] Implement Zustand stores for each module
- [ ] Create API utility functions
- [ ] Set up data fetching hooks

### Phase 3: UI Components
- [ ] OT Employee Management screen
- [ ] OT Approval screen
- [ ] OT Structure Configuration screen
- [ ] OT Processing screen
- [ ] OT Reporting integration

### Phase 4: Integration
- [ ] Integrate with payroll processing
- [ ] Add navigation menu items
- [ ] Wire up permissions
- [ ] Test workflows end-to-end

### Phase 5: Testing & Documentation
- [ ] Unit tests for stores
- [ ] Integration tests for workflows
- [ ] User documentation
- [ ] Admin guide

---

## File Structure

```
src/
├── components/
│   └── dashboard/
│       └── overtime/
│           ├── OTEmployeeManagement.tsx
│           ├── EmployeeOTToggle.tsx
│           ├── BulkOTActions.tsx
│           ├── OTApprovalPage.tsx
│           ├── ApprovalDataGrid.tsx
│           ├── OTEditModal.tsx
│           ├── OTStructuresPage.tsx
│           ├── StructuresList.tsx
│           ├── CreateStructureModal.tsx
│           ├── EditStructureModal.tsx
│           ├── ComponentEditor.tsx
│           ├── OTProcessingPage.tsx
│           ├── CreateProcessModal.tsx
│           ├── ProcessingWizard.tsx
│           ├── ProcessingDetailView.tsx
│           └── OTReportIntegration.tsx
├── stores/
│   ├── otEmployeesStore.ts
│   ├── otApprovalsStore.ts
│   ├── otStructuresStore.ts
│   └── otProcessingStore.ts
├── lib/
│   └── otManagement.ts
└── types/
    └── overtime.ts
```

---

## API Functions Reference

### Employee Eligibility
```typescript
// Get employee OT status
getEmployeeOTStatus(employeeId: string): Promise<EmployeeOTStatus>

// Update employee OT eligibility
updateEmployeeOTEligibility(
  employeeId: string,
  isEligible: boolean,
  effectiveFrom: string,
  notes?: string
): Promise<void>

// Bulk update
bulkUpdateOTEligibility(
  employeeIds: string[],
  isEligible: boolean
): Promise<void>
```

### OT Approvals
```typescript
// Get OT approvals for period
getOTApprovals(
  startDate: string,
  endDate: string,
  status?: string
): Promise<OTApprovalRecord[]>

// Edit OT hours
editOTHours(
  approvalId: string,
  correctedHours: number,
  reason: string
): Promise<void>

// Approve OT
approveOT(approvalId: string): Promise<void>
approveOTBulk(approvalIds: string[]): Promise<void>

// Reject OT
rejectOT(approvalId: string, reason: string): Promise<void>
```

### OT Structures
```typescript
// Get all structures
getOTStructures(): Promise<OTStructure[]>

// Get structure with components
getOTStructure(structureId: string): Promise<OTStructure>

// Create structure
createOTStructure(structure: CreateOTStructureInput): Promise<string>

// Update structure
updateOTStructure(structureId: string, updates: UpdateOTStructureInput): Promise<void>

// Clone structure
cloneOTStructure(sourceId: string, newName: string): Promise<string>

// Add component
addOTComponent(structureId: string, component: OTComponentInput): Promise<string>

// Update component
updateOTComponent(componentId: string, updates: UpdateOTComponentInput): Promise<void>

// Delete component
deleteOTComponent(componentId: string): Promise<void>

// Reorder components
reorderComponents(structureId: string, componentIds: string[]): Promise<void>
```

### OT Processing
```typescript
// Create new process
createOTProcess(process: CreateOTProcessInput): Promise<string>

// Get process details
getOTProcess(processId: string): Promise<OTProcess>

// Get all processes
getOTProcesses(status?: string): Promise<OTProcess[]>

// Update employee component value
updateEmployeeComponentValue(
  processId: string,
  employeeId: string,
  componentId: string,
  value: number
): Promise<void>

// Calculate process
calculateOTProcess(processId: string): Promise<void>

// Finalize process
finalizeOTProcess(processId: string): Promise<void>

// Link to payroll
linkToPayroll(processId: string, payrollId: string): Promise<void>

// Cancel process
cancelOTProcess(processId: string): Promise<void>
```

### OT Reports
```typescript
// Generate OT transaction report
generateOTReport(
  startDate: string,
  endDate: string,
  filters?: OTReportFilters
): Promise<OTReportData[]>

// Export to Excel
exportOTReport(reportData: OTReportData[], filename: string): Promise<void>

// Get OT summary
getOTSummary(
  startDate: string,
  endDate: string
): Promise<OTSummaryData>
```

---

## Navigation Integration

Add to dashboard sidebar:

```typescript
{
  name: 'Overtime',
  icon: Clock,
  children: [
    { name: 'Employee OT Management', href: '/dashboard/overtime/employees' },
    { name: 'OT Approvals', href: '/dashboard/overtime/approvals' },
    { name: 'OT Structures', href: '/dashboard/overtime/structures' },
    { name: 'OT Processing', href: '/dashboard/overtime/processing' },
  ]
}
```

Add to Payroll Process screen:
- "OT Process" button next to existing action buttons
- Opens OT processing wizard in linked mode

Add to Reports:
- "OT Transaction Report" option in report type dropdown

---

## Permissions Matrix

| Feature | Admin | Manager | HR | Accountant | Employee |
|---------|-------|---------|----|-----------| ---------|
| View OT Employees | ✓ | ✓ | ✓ | ✓ | Own only |
| Manage OT Eligibility | ✓ | ✓ | ✓ | ✗ | ✗ |
| View OT Approvals | ✓ | ✓ | ✓ | ✓ | Own only |
| Approve/Edit OT | ✓ | ✓ | ✗ | ✗ | ✗ |
| Manage OT Structures | ✓ | ✗ | ✗ | ✓ | ✗ |
| Process OT | ✓ | ✗ | ✗ | ✓ | ✗ |
| View OT Reports | ✓ | ✓ | ✓ | ✓ | Own only |
| Finalize OT | ✓ | ✗ | ✗ | ✓ | ✗ |

---

## Data Flow Diagrams

### OT Processing Flow (Standalone)
```
1. Create OT Process
   ↓
2. System loads eligible employees
   ↓
3. Calculate OT hours from attendance
   ↓
4. Apply OT structure components
   ↓
5. User enters editable/enter_later values
   ↓
6. Calculate component amounts
   ↓
7. Review & finalize
   ↓
8. Save to ot_processed_data
   ↓
9. Generate reports
```

### OT Processing Flow (Linked to Payroll)
```
1. Create OT Process (linked mode)
   ↓
2. Select/create payroll process
   ↓
3-7. [Same as standalone]
   ↓
8. Save to ot_processed_data
   ↓
9. Add OT components to payroll
   ↓
10. Update payroll totals
   ↓
11. OT appears in pay slip
```

### OT Approval Flow
```
1. Attendance recorded with overtime
   ↓
2. Overtime calculated automatically
   ↓
3. Record created in ot_approvals (pending)
   ↓
4. Manager reviews in OT Approvals screen
   ↓
5a. Approve → Status: approved
5b. Edit hours → Enter reason → Save
5c. Reject → Enter reason → Status: rejected
   ↓
6. Approved records available for processing
```

---

## Error Handling

### Common Scenarios:

1. **Employee Not Eligible**
   - Message: "Employee [Name] is not eligible for overtime"
   - Action: Redirect to OT Employees screen

2. **No Approved Hours**
   - Message: "No approved overtime hours found for the selected period"
   - Action: Check approval screen

3. **Missing Component Values**
   - Message: "Please enter values for all 'Enter Later' components"
   - Action: Highlight missing fields

4. **Process Already Finalized**
   - Message: "This OT process is finalized and cannot be modified"
   - Action: Disable editing

5. **Linked Payroll Not Found**
   - Message: "The linked payroll process no longer exists"
   - Action: Convert to standalone or select new payroll

---

## Testing Scenarios

### Test Case 1: Enable/Disable Employee OT
1. Navigate to OT Employee Management
2. Find employee John Doe
3. Toggle OT eligibility to OFF
4. Set effective date to today
5. Add note "Temporary contract worker"
6. Save
7. Verify employee excluded from OT processing
8. Toggle back to ON
9. Verify employee included

### Test Case 2: Edit OT Hours with Reason
1. Navigate to OT Approvals
2. Find attendance record with 5 hours OT
3. Click edit
4. Change to 4 hours
5. Must enter reason: "Lunch break not deducted"
6. Save
7. Verify both original (5) and corrected (4) displayed
8. Approve the record
9. Verify appears in processing with 4 hours

### Test Case 3: Create and Use OT Structure
1. Navigate to OT Structures
2. Create new structure "Standard OT"
3. Add components:
   - Base OT Rate: $25/hour (hourly_rate, fixed)
   - Transport: $10 (flat, fixed)
   - Meal Allowance: $15 (flat, editable)
   - Bonus: $0 (flat, enter_later)
4. Save and activate
5. Set as default
6. Create OT process using this structure
7. Verify components appear correctly
8. For 5 OT hours:
   - Base: $125 (25 * 5)
   - Transport: $10
   - Meal: $15 (editable)
   - Bonus: $20 (entered)
   - Total: $170

### Test Case 4: Process OT Standalone
1. Create new OT process
2. Name: "January 2024 OT"
3. Period: Jan 1-31, 2024
4. Mode: Standalone
5. Structure: Standard OT
6. System loads 15 eligible employees
7. Review calculated hours
8. Enter editable values
9. Process
10. Verify totals correct
11. Finalize
12. Generate report
13. Export to Excel

### Test Case 5: Process OT Linked to Payroll
1. Create payroll process "January 2024 Payroll"
2. Create OT process linked to it
3. Process as in Test Case 4
4. Finalize
5. Navigate to payroll detail
6. Verify OT components appear for each employee
7. Verify payroll totals include OT
8. Generate pay slip
9. Verify OT breakdown shown

---

## Migration from Legacy System

If migrating from an existing OT system:

1. **Export Data**:
   - Employee OT eligibility status
   - Historical OT structures
   - Past OT processing records

2. **Data Mapping**:
   - Map old employee IDs to new
   - Map old structure formats to new component types
   - Convert date formats

3. **Import Process**:
   - Import employee eligibility first
   - Import structures and components
   - Import historical processing (read-only)
   - DO NOT import unapproved/pending records

4. **Validation**:
   - Verify all active employees have eligibility record
   - Test structure calculations
   - Run parallel processing for one period
   - Compare results

5. **Cutover**:
   - Complete last cycle in old system
   - Start fresh period in new system
   - Archive old system data

---

## Performance Considerations

1. **Database Indexes**:
   - All tenant_id columns indexed
   - employee_id in all employee-related tables
   - Date columns for range queries
   - Status columns for filtering

2. **Query Optimization**:
   - Use database functions for complex calculations
   - Batch operations where possible
   - Paginate large result sets

3. **Caching Strategy**:
   - Cache OT structures (rarely change)
   - Cache employee eligibility (check change date)
   - Don't cache approval data (real-time)

4. **UI Performance**:
   - Virtual scrolling for large employee lists
   - Lazy load approval records
   - Debounce search inputs
   - Optimistic UI updates

---

## Security Considerations

1. **Access Control**:
   - RLS enforces tenant isolation
   - Role-based access for features
   - Audit trail for all modifications

2. **Data Privacy**:
   - Employee OT data is sensitive
   - Restrict access to own data for employees
   - Managers see only their department

3. **Audit Trail**:
   - All edits logged with reason
   - Approver identity recorded
   - Modification timestamps
   - Cannot delete finalized processes

4. **Validation**:
   - Server-side validation for all inputs
   - Prevent negative OT hours
   - Ensure reasons provided for edits
   - Verify eligibility before processing

---

## Support & Maintenance

### Common Tasks:

1. **Add New Employee to OT**:
   - Navigate to OT Employees
   - Find employee
   - Toggle to enabled
   - Set effective date

2. **Change OT Structure**:
   - Navigate to OT Structures
   - Edit structure or clone and modify
   - Update as needed
   - Can't edit structure used in finalized processes

3. **Reprocess OT**:
   - Cancel existing process (if not finalized)
   - Create new process
   - Same period and structure
   - Will use latest approved hours

4. **Fix Incorrect OT**:
   - If not finalized: Cancel and reprocess
   - If finalized: Create adjustment process
   - Document reason for adjustment

### Troubleshooting:

**Issue**: Employee not appearing in OT processing
- Check: Is employee active?
- Check: Is employee OT eligible?
- Check: Does employee have approved OT hours in period?
- Check: Is attendance recorded for period?

**Issue**: OT amount incorrect
- Check: Structure components calculation types
- Check: Values entered for editable components
- Check: OT hours approved correctly
- Recalculate: Click recalculate button

**Issue**: Cannot finalize OT process
- Check: All required component values entered
- Check: No validation errors
- Check: Linked payroll exists (if linked mode)
- Check: User has permission to finalize

---

## Next Steps

To complete the implementation:

1. **Create Type Definitions** (`src/types/overtime.ts`)
2. **Implement Stores** (all 4 stores)
3. **Build UI Components** (following designs above)
4. **Integrate Navigation** (add menu items)
5. **Wire Up Payroll Integration** (linked mode)
6. **Add to Reports** (OT transaction report)
7. **Test All Workflows** (use test cases above)
8. **Document for Users** (user guide)

---

**Status**: Database layer ✅ Complete | UI Components ⏳ Pending | Integration ⏳ Pending
**Version**: 1.0
**Last Updated**: 2024
