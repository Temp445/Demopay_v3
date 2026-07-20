# OT Management Module - Developer Guide

## Quick Reference for Developers

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     OT Management Module                      │
├─────────────────────────────────────────────────────────────┤
│  UI Layer        │  Components (15+ React components)        │
│  State Layer     │  Zustand Stores (4 stores)                │
│  API Layer       │  Utility Functions (otManagement.ts)      │
│  Database Layer  │  Supabase (6 tables + 3 functions)        │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── types/
│   └── overtime.ts                 # TypeScript interfaces
├── lib/
│   └── otManagement.ts            # API utilities & calculations
├── stores/
│   ├── otEmployeesStore.ts        # Employee eligibility state
│   ├── otStructuresStore.ts       # Structure configuration state
│   ├── otApprovalsStore.ts        # Approval workflow state
│   └── otProcessingStore.ts       # Processing state
└── components/dashboard/overtime/
    ├── OTEmployeeManagement.tsx   # Main employee page
    ├── OTStructuresPage.tsx       # Main structures page
    ├── OTApprovalPage.tsx         # Main approval page
    ├── OTProcessingPage.tsx       # Main processing page
    ├── OTReportTab.tsx            # Reports integration
    ├── CreateStructureModal.tsx   # Modals...
    ├── EditStructureModal.tsx
    ├── ComponentsModal.tsx
    ├── CreateProcessModal.tsx
    └── ProcessDetailModal.tsx
```

### Database Schema Quick Reference

```sql
-- Employee OT eligibility
employee_ot_eligibility (id, tenant_id, employee_id, is_ot_eligible, effective_from, notes)

-- OT structures
ot_structures (id, tenant_id, structure_name, is_active, is_default)
ot_structure_components (id, tenant_id, ot_structure_id, component_name, component_type, calculation_type, value)

-- OT approvals
ot_approvals (id, tenant_id, employee_id, attendance_date, original_ot_hours, corrected_ot_hours, modification_reason, approval_status)

-- OT processing
ot_processing (id, tenant_id, process_name, period_start, period_end, processing_mode, processing_status)
ot_processed_data (id, tenant_id, ot_processing_id, employee_id, total_ot_hours, total_ot_amount, components)
```

### Store Usage Examples

#### 1. OT Employees Store

```typescript
import { useOTEmployeesStore } from '../stores/otEmployeesStore';

function MyComponent() {
  const { employees, fetchEmployees, updateEligibility, bulkUpdate } = useOTEmployeesStore();

  // Load employees
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Update single employee
  const handleToggle = async (empId: string, isEligible: boolean) => {
    await updateEligibility(empId, !isEligible);
  };

  // Bulk update
  const handleBulkEnable = async (employeeIds: string[]) => {
    await bulkUpdate(employeeIds, true);
  };
}
```

#### 2. OT Structures Store

```typescript
import { useOTStructuresStore } from '../stores/otStructuresStore';

function MyComponent() {
  const {
    structures,
    currentStructure,
    components,
    fetchStructures,
    createStructure,
    addComponent,
    cloneStructure
  } = useOTStructuresStore();

  // Create new structure
  const handleCreate = async () => {
    const id = await createStructure({
      structure_name: 'My OT Structure',
      description: 'Description',
      is_active: true,
      is_default: false,
    });
  };

  // Add component
  const handleAddComponent = async (structureId: string) => {
    await addComponent(structureId, {
      component_name: 'Base Rate',
      component_type: 'fixed',
      calculation_type: 'hourly_rate',
      value: 25,
      display_order: 0,
      is_active: true,
    });
  };

  // Clone structure
  const handleClone = async (sourceId: string) => {
    const newId = await cloneStructure(sourceId, 'Cloned Structure');
  };
}
```

#### 3. OT Approvals Store

```typescript
import { useOTApprovalsStore } from '../stores/otApprovalsStore';

function MyComponent() {
  const { approvals, fetchApprovals, approveOT, editOTHours, approveMultiple } = useOTApprovalsStore();

  // Fetch approvals for period
  const loadApprovals = async () => {
    await fetchApprovals('2024-01-01', '2024-01-31', 'pending');
  };

  // Approve single
  const handleApprove = async (approvalId: string) => {
    await approveOT(approvalId);
  };

  // Edit hours
  const handleEdit = async (approvalId: string) => {
    await editOTHours(approvalId, 4.5, 'Lunch break not deducted');
  };

  // Bulk approve
  const handleBulkApprove = async (ids: string[]) => {
    await approveMultiple(ids);
  };
}
```

#### 4. OT Processing Store

```typescript
import { useOTProcessingStore } from '../stores/otProcessingStore';

function MyComponent() {
  const {
    processes,
    currentProcess,
    eligibleEmployees,
    createProcess,
    loadEligibleEmployees,
    calculateProcess,
    finalizeProcess
  } = useOTProcessingStore();

  // Create process
  const handleCreate = async () => {
    const processId = await createProcess({
      process_name: 'January 2024 OT',
      processing_period_start: '2024-01-01',
      processing_period_end: '2024-01-31',
      processing_mode: 'standalone',
      ot_structure_id: 'structure-id-here',
    });

    // Load eligible employees
    await loadEligibleEmployees(processId);
  };

  // Calculate
  const handleCalculate = async (processId: string) => {
    await calculateProcess(processId);
  };

  // Finalize
  const handleFinalize = async (processId: string) => {
    await finalizeProcess(processId);
  };
}
```

### API Function Reference

All API functions are in `/src/lib/otManagement.ts`:

```typescript
// Employee Eligibility
getTenantId(): Promise<string | null>
getEmployeeOTEligibility(tenantId): Promise<EmployeeOTEligibility[]>
upsertEmployeeOTEligibility(tenantId, employeeId, isEligible, effectiveFrom, notes): Promise<void>
bulkUpdateOTEligibility(tenantId, employeeIds, isEligible): Promise<void>

// OT Structures
getOTStructures(tenantId): Promise<OTStructure[]>
getOTStructureWithComponents(structureId, tenantId): Promise<OTStructure | null>
createOTStructure(tenantId, input): Promise<string>
updateOTStructure(structureId, tenantId, updates): Promise<void>
deleteOTStructure(structureId, tenantId): Promise<void>
cloneOTStructure(sourceStructureId, newName, tenantId): Promise<string>

// OT Components
getOTComponents(structureId, tenantId): Promise<OTComponent[]>
addOTComponent(tenantId, structureId, component): Promise<string>
updateOTComponent(componentId, tenantId, updates): Promise<void>
deleteOTComponent(componentId, tenantId): Promise<void>
reorderOTComponents(tenantId, componentOrders): Promise<void>

// OT Approvals
getOTApprovals(tenantId, startDate, endDate, status): Promise<OTApproval[]>
updateOTApproval(approvalId, tenantId, updates): Promise<void>
bulkApproveOT(tenantId, approvalIds): Promise<void>
createOTApprovalFromAttendance(tenantId, employeeId, attendanceLogId, date, hours): Promise<void>

// OT Processing
getOTProcesses(tenantId, status): Promise<OTProcessing[]>
getOTProcess(processId, tenantId): Promise<OTProcessing | null>
createOTProcess(tenantId, input): Promise<string>
updateOTProcess(processId, tenantId, updates): Promise<void>
getEligibleEmployeesForOT(tenantId, periodStart, periodEnd): Promise<OTEligibleEmployee[]>
getOTProcessedData(processId, tenantId): Promise<OTProcessedData[]>
saveOTProcessedData(tenantId, processId, employeeData): Promise<void>
finalizeOTProcess(processId, tenantId): Promise<void>

// Calculations
calculateOTComponentAmount(component, otHours, baseAmount): number
calculateTotalOTAmount(components, otHours, componentValues): { components, total }
```

### Component Types Explained

**Fixed Components**:
- Value set at structure level
- Cannot be modified during processing
- Example: Base OT Rate at $25/hr
- Use for standard, unchanging amounts

**Editable Components**:
- Default value provided
- Can be changed during processing
- Example: Meal Allowance (usually $15, but can vary)
- Use for amounts that might need adjustment

**Enter Later Components**:
- No default value
- Must be entered at processing time
- Example: Special bonus (varies each time)
- Use for ad-hoc, case-by-case amounts

### Calculation Types Explained

**Flat**:
```typescript
amount = value
// Example: Transport = $10 (always $10)
```

**Hourly Rate**:
```typescript
amount = value * ot_hours
// Example: Base Rate = $25/hr × 5 hours = $125
```

**Percentage**:
```typescript
amount = (value / 100) * base_amount
// Example: Bonus = 15% of Base = 15% × $125 = $18.75
```

### Common Patterns

#### Loading Data on Mount

```typescript
useEffect(() => {
  fetchData();
}, [fetchData]);
```

#### Error Handling

```typescript
try {
  await someOperation();
  toast.success('Operation successful');
} catch (error) {
  toast.error('Operation failed');
  console.error(error);
}
```

#### Tenant ID

Always get tenant ID from auth context:
```typescript
const auth = await validateAuth();
const tenantId = auth.tenantId;
```

### Database Functions (RPC)

Call database functions using Supabase RPC:

```typescript
const { data, error } = await supabase.rpc('is_employee_ot_eligible', {
  p_employee_id: 'uuid-here',
  p_tenant_id: 'uuid-here',
  p_check_date: '2024-01-15',
});
```

Available functions:
- `is_employee_ot_eligible(p_employee_id, p_tenant_id, p_check_date)`
- `get_ot_eligible_employees(p_tenant_id, p_period_start, p_period_end)`
- `clone_ot_structure(p_source_structure_id, p_new_structure_name, p_tenant_id, p_user_id)`

### Testing Checklist

✅ **Employee Management**:
- [ ] Toggle employee OT on/off
- [ ] Bulk enable/disable
- [ ] Add notes
- [ ] Search and filter
- [ ] Verify eligibility affects processing

✅ **Structures**:
- [ ] Create structure
- [ ] Add components (all 3 types)
- [ ] Edit structure
- [ ] Clone structure
- [ ] Set as default
- [ ] Delete structure

✅ **Approvals**:
- [ ] View pending approvals
- [ ] Edit OT hours (with reason)
- [ ] Approve single
- [ ] Approve bulk
- [ ] Reject with reason
- [ ] View modification history

✅ **Processing**:
- [ ] Create process (standalone)
- [ ] Create process (linked)
- [ ] View eligible employees
- [ ] Calculate OT
- [ ] Finalize process
- [ ] Verify totals correct

✅ **Reports**:
- [ ] Generate report
- [ ] Filter by date/status
- [ ] Show modified only
- [ ] Export to CSV
- [ ] Verify data accuracy

### Troubleshooting

**Employee not appearing in OT processing?**
- Check if employee is active
- Check if OT eligibility is enabled
- Check if employee has approved OT hours in period
- Check if attendance records exist

**Structure components not calculating correctly?**
- Verify calculation type is correct
- Check component values
- Ensure active components only
- Review calculation logic

**Cannot finalize process?**
- Ensure status is 'completed' first
- Must calculate before finalizing
- Check for any validation errors
- Verify all required values entered

**Build errors?**
- Check TypeScript types
- Verify all imports
- Ensure no circular dependencies
- Run `npm run build` to see details

### Performance Tips

1. **Pagination**: Add pagination for large employee lists
2. **Debouncing**: Debounce search inputs
3. **Memoization**: Use React.memo for expensive components
4. **Lazy Loading**: Lazy load modals and heavy components
5. **Batch Operations**: Use bulk operations where possible

### Security Best Practices

1. **Always validate tenant ID** before operations
2. **Use RLS policies** for all database access
3. **Validate input** on both client and server
4. **Sanitize user input** to prevent XSS
5. **Log all sensitive operations** for audit

### Future Enhancements

Possible additions:
- OT rate multipliers (1.5x, 2x for holidays)
- OT caps/limits per employee
- Automatic OT approval rules
- Email notifications
- Advanced reporting with charts
- Mobile app support
- Bulk import/export
- Integration with time tracking apps

### Getting Help

- **Documentation**: See `OT_MANAGEMENT_MODULE.md` for full details
- **Summary**: See `OT_IMPLEMENTATION_COMPLETE.md` for overview
- **Quick Start**: See `OT_MODULE_QUICK_START.md` for quick setup
- **This Guide**: Developer reference for coding

---

**Last Updated**: January 29, 2024
**Module Version**: 1.0
**Status**: Production Ready
