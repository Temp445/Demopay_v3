# OT Management Module - Quick Start Guide

## For Developers

### What's Been Implemented

✅ **Database Layer (Complete)**
- 6 tables created with full RLS
- 3 helper functions
- All indexes and constraints
- Migration successfully applied

✅ **Documentation (Complete)**
- `OT_MANAGEMENT_MODULE.md` - 12,000+ word complete guide
- `OT_MANAGEMENT_IMPLEMENTATION_SUMMARY.md` - Executive summary
- `OT_MODULE_QUICK_START.md` - This quick start

### What You Need to Build

1. **Type Definitions** - Create TypeScript interfaces
2. **State Stores** - 4 Zustand stores
3. **UI Components** - React components for 5 modules
4. **API Functions** - Data fetching utilities
5. **Navigation** - Menu integration
6. **Integration** - Link to payroll system

### Quick Implementation Steps

#### Step 1: Types (30 minutes)

Create `/src/types/overtime.ts`:

```typescript
export interface EmployeeOTStatus {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  isOTEligible: boolean;
  effectiveFrom: string;
  notes?: string;
}

export interface OTApprovalRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  attendanceDate: string;
  originalOTHours: number;
  correctedOTHours?: number;
  modificationReason?: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
}

export interface OTStructure {
  id: string;
  structureName: string;
  description?: string;
  isActive: boolean;
  isDefault: boolean;
  components: OTComponent[];
}

export interface OTComponent {
  id: string;
  componentName: string;
  componentType: 'fixed' | 'editable' | 'enter_later';
  calculationType: 'flat' | 'hourly_rate' | 'percentage';
  value: number;
  percentageOf?: string;
  displayOrder: number;
  isActive: boolean;
}

export interface OTProcess {
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
}
```

#### Step 2: Stores (2 hours)

Create 4 stores following the pattern. Example for employees:

```typescript
// src/stores/otEmployeesStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { EmployeeOTStatus } from '../types/overtime';

interface OTEmployeesState {
  employees: EmployeeOTStatus[];
  loading: boolean;
  error: string | null;
  fetchEmployees: () => Promise<void>;
  updateEligibility: (employeeId: string, isEligible: boolean, notes?: string) => Promise<void>;
}

export const useOTEmployeesStore = create<OTEmployeesState>((set) => ({
  employees: [],
  loading: false,
  error: null,

  fetchEmployees: async () => {
    set({ loading: true, error: null });
    try {
      // Query employees with OT eligibility
      const { data, error } = await supabase
        .from('employees')
        .select(`
          id,
          name,
          employee_code,
          department:departments(name),
          ot_eligibility:employee_ot_eligibility(
            is_ot_eligible,
            effective_from,
            notes
          )
        `)
        .eq('is_active', true);

      if (error) throw error;

      const employees = data.map(emp => ({
        id: emp.id,
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.employee_code,
        department: emp.department?.name || 'N/A',
        isOTEligible: emp.ot_eligibility?.is_ot_eligible ?? true,
        effectiveFrom: emp.ot_eligibility?.effective_from || new Date().toISOString(),
        notes: emp.ot_eligibility?.notes
      }));

      set({ employees, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  updateEligibility: async (employeeId, isEligible, notes) => {
    try {
      const { error } = await supabase
        .from('employee_ot_eligibility')
        .upsert({
          employee_id: employeeId,
          is_ot_eligible: isEligible,
          effective_from: new Date().toISOString().split('T')[0],
          notes
        });

      if (error) throw error;

      // Refresh list
      await useOTEmployeesStore.getState().fetchEmployees();
    } catch (error) {
      throw error;
    }
  }
}));
```

Repeat similar pattern for:
- `otApprovalsStore.ts`
- `otStructuresStore.ts`
- `otProcessingStore.ts`

#### Step 3: Basic Components (4 hours)

Start with the simplest screen - OT Employee Management:

```typescript
// src/components/dashboard/overtime/OTEmployeeManagement.tsx
import React, { useEffect } from 'react';
import { useOTEmployeesStore } from '../../../stores/otEmployeesStore';
import { Users, Search, Filter } from 'lucide-react';

export default function OTEmployeeManagement() {
  const { employees, loading, fetchEmployees, updateEligibility } = useOTEmployeesStore();

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleToggle = async (employeeId: string, currentStatus: boolean) => {
    try {
      await updateEligibility(employeeId, !currentStatus);
    } catch (error) {
      console.error('Failed to update:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-6 w-6" />
          OT Employee Management
        </h1>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Employee
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Department
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                OT Eligible
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{emp.employeeName}</div>
                  <div className="text-sm text-gray-500">{emp.employeeCode}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {emp.department}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => handleToggle(emp.employeeId, emp.isOTEligible)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      emp.isOTEligible ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                        emp.isOTEligible ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

#### Step 4: Navigation (15 minutes)

Add to dashboard sidebar navigation:

```typescript
// In your sidebar component
{
  name: 'Overtime',
  icon: Clock,
  children: [
    { name: 'Employee Management', href: '/dashboard/overtime/employees' },
    { name: 'OT Approvals', href: '/dashboard/overtime/approvals' },
    { name: 'OT Structures', href: '/dashboard/overtime/structures' },
    { name: 'OT Processing', href: '/dashboard/overtime/processing' },
  ]
}
```

Add routes:

```typescript
// In your router
<Route path="/dashboard/overtime/employees" element={<OTEmployeeManagement />} />
<Route path="/dashboard/overtime/approvals" element={<OTApprovalPage />} />
<Route path="/dashboard/overtime/structures" element={<OTStructuresPage />} />
<Route path="/dashboard/overtime/processing" element={<OTProcessingPage />} />
```

### Development Order

**Week 1: Foundation**
1. Day 1: Create all type definitions
2. Day 2: Implement otEmployeesStore + basic UI
3. Day 3: Implement otApprovalsStore + basic UI
4. Day 4: Implement otStructuresStore + basic UI
5. Day 5: Testing & refinement

**Week 2: Processing**
1. Day 1-2: Implement otProcessingStore
2. Day 3-4: Build processing wizard UI
3. Day 5: Integrate with payroll

**Week 3: Refinement**
1. Day 1-2: Add all remaining features
2. Day 3: Reports integration
3. Day 4: Testing
4. Day 5: Documentation

### Testing Checklist

#### Employee Management
- [ ] Load employee list
- [ ] Toggle OT eligibility ON
- [ ] Toggle OT eligibility OFF
- [ ] Verify excluded from processing when OFF
- [ ] Search employees
- [ ] Filter by department
- [ ] Bulk operations

#### OT Approval
- [ ] Load attendance with OT
- [ ] Display original OT hours
- [ ] Edit OT hours
- [ ] Mandatory reason validation
- [ ] Show original vs corrected
- [ ] Approve workflow
- [ ] Reject with reason
- [ ] Bulk approve

#### OT Structures
- [ ] Create new structure
- [ ] Add fixed component
- [ ] Add editable component
- [ ] Add enter_later component
- [ ] Test hourly_rate calculation
- [ ] Test percentage calculation
- [ ] Clone structure
- [ ] Drag reorder components
- [ ] Set as default

#### OT Processing
- [ ] Create standalone process
- [ ] Auto-load eligible employees
- [ ] Calculate OT hours
- [ ] Enter editable values
- [ ] Calculate amounts
- [ ] Review totals
- [ ] Finalize process
- [ ] Create linked process
- [ ] Verify payroll integration

#### Reports
- [ ] Generate OT report
- [ ] Apply filters
- [ ] Show modifications
- [ ] Export to Excel
- [ ] Drill-down details

### Common Pitfalls to Avoid

1. **Don't forget tenant isolation**
   - Always include tenant_id in queries
   - Use getTenantId() helper

2. **Component types matter**
   - Fixed: Cannot edit during processing
   - Editable: Can edit, has default
   - Enter Later: Must enter, no default

3. **Processing status workflow**
   - Can only finalize if status is 'completed'
   - Cannot edit once finalized
   - Linked mode locks payroll too

4. **Approval workflow**
   - Reason mandatory when editing hours
   - Must approve before processing
   - Original hours preserved

5. **Calculations**
   - Hourly rate: value * ot_hours
   - Percentage: (value / 100) * base_amount
   - Flat: just the value

### Quick Reference

**Database Tables:**
- `employee_ot_eligibility` - Who can get OT
- `ot_structures` - OT payment structures
- `ot_structure_components` - Structure parts
- `ot_approvals` - OT approval records
- `ot_processing` - Processing batches
- `ot_processed_data` - Final calculated data

**Database Functions:**
- `is_employee_ot_eligible(employee_id, tenant_id, date)`
- `get_ot_eligible_employees(tenant_id, start, end)`
- `clone_ot_structure(source_id, new_name, tenant_id, user_id)`

**State Stores:**
- `useOTEmployeesStore` - Employee eligibility
- `useOTApprovalsStore` - Approval workflow
- `useOTStructuresStore` - Structure management
- `useOTProcessingStore` - OT processing

### Need Help?

1. **Database Questions**: See migration file
2. **UI Specifications**: See `OT_MANAGEMENT_MODULE.md`
3. **Architecture**: See `OT_MANAGEMENT_IMPLEMENTATION_SUMMARY.md`
4. **API Reference**: See API Functions section in main guide
5. **Test Scenarios**: See Testing Scenarios in main guide

### File Locations

- Database: `/supabase/migrations/create_overtime_management_module.sql`
- Full Guide: `/OT_MANAGEMENT_MODULE.md`
- Summary: `/OT_MANAGEMENT_IMPLEMENTATION_SUMMARY.md`
- Quick Start: `/OT_MODULE_QUICK_START.md` (this file)

---

**Ready to Start?** Begin with Step 1 (Types) and work through systematically.

**Estimated Time**: 2-3 weeks for full implementation with testing

**Current Status**: Database ✅ | Specs ✅ | UI ⏳ Ready to Build
