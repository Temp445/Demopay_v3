# Employee Advance Installment Change Feature

## Overview

The Installment Change feature allows authorized users (higher officials) to modify the payment schedule of employee advances. This provides flexibility in managing employee advance repayments while maintaining complete audit trails and data integrity.

## Feature Capabilities

### 1. Installment Modification
- **Select Specific Installments**: Choose one or multiple scheduled installments to modify
- **Adjust Amounts**: Increase or decrease individual installment amounts
- **Real-time Validation**: Prevents negative amounts and invalid modifications
- **Visual Feedback**: Clear indication of modified installments with change indicators

### 2. Redistribution Strategies

The system offers three redistribution methods to handle changes in installment amounts:

#### a) No Redistribution (Default)
- Applies only the specified changes to selected installments
- Other installments remain unchanged
- Use when making targeted adjustments to specific months

#### b) Equal Distribution
- Redistributes the entire remaining balance equally across all unpaid installments
- Each scheduled installment gets the same amount
- Ideal for simplifying payment schedules or standardizing installment amounts
- **Formula**: New Amount = Remaining Balance ÷ Number of Scheduled Installments

#### c) Proportional Adjustment
- Adjusts future installments proportionally based on their original amounts
- Maintains the relative weight of each installment
- Best for scaling all installments up or down while keeping their proportions
- **Formula**: New Amount = Original Amount × (Remaining Balance ÷ Original Total)

### 3. Audit Trail & Compliance
- **Complete Change History**: Every modification is logged with:
  - Timestamp of change
  - User who made the change
  - Old and new amounts
  - Reason for modification
  - Affected installments
  - Redistribution method used
- **Access Control**: Only authorized users with proper permissions can modify installments
- **Tenant Isolation**: All operations respect multi-tenant boundaries

### 4. User Interface Features
- **Scheduled Installments Section**: Shows all modifiable installments with input fields
- **Completed Installments Section**: Displays paid/processed installments (read-only)
- **Change Indicators**: Visual indicators showing increases (green) and decreases (red)
- **Preview Functionality**: Review changes before applying them
- **Mandatory Reason Field**: Requires justification for all modifications
- **Real-time Calculations**: Immediate feedback on balance changes

## Technical Implementation

### Database Schema

#### advance_installment_changes Table
```sql
CREATE TABLE advance_installment_changes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  advance_id uuid NOT NULL,
  installment_id uuid NOT NULL,
  change_type text NOT NULL, -- 'amount_increase', 'amount_decrease', 'redistribution'
  old_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  redistribution_method text, -- 'equal', 'proportional', 'new_installment'
  affected_installments jsonb,
  reason text NOT NULL,
  changed_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### RPC Function: modify_advance_installments

**Purpose**: Processes installment modifications with validation and redistribution

**Parameters**:
- `p_tenant_id`: UUID of the tenant
- `p_advance_id`: UUID of the advance
- `p_installment_changes`: JSONB array of installment changes
- `p_redistribution_method`: Redistribution strategy (optional)
- `p_reason`: Reason for modifications
- `p_changed_by`: UUID of the user making changes

**Returns**: JSONB object with:
```json
{
  "success": true,
  "affected_count": 3,
  "affected_installments": [...],
  "redistribution_applied": true
}
```

**Validation**:
- Verifies tenant access and authentication
- Ensures advance is in valid status ('approved' or 'active')
- Validates that installments are in 'scheduled' status
- Prevents negative amounts
- Maintains data consistency

**Process Flow**:
1. Validate user access and advance status
2. Process individual installment changes
3. Apply redistribution strategy if specified
4. Update advance remaining balance
5. Log all changes to audit table
6. Return success result

### Frontend Architecture

#### Component Structure

**InstallmentChangeModal.tsx**
- Main modal component for installment modifications
- Manages local state for installment edits
- Provides real-time preview of changes
- Handles validation and submission

**Key State Variables**:
```typescript
interface InstallmentEdit {
  installment: AdvanceInstallment;
  newAmount: number;
  isModified: boolean;
}
```

**AdvanceDetailsModal.tsx Integration**
- New "Modify Installments" button added to admin actions
- Available only when advance status is 'approved' or 'active'
- Opens InstallmentChangeModal on click
- Refreshes data after successful modification

#### Store Integration (advancesStore.ts)

**New Methods**:

1. **modifyInstallments(request: InstallmentModificationRequest)**
   - Calls the RPC function to modify installments
   - Refreshes installments and advances after success
   - Handles errors and loading states

2. **fetchInstallmentChangeLogs(advanceId: string)**
   - Retrieves change history for an advance
   - Useful for audit reports and compliance

### Type Definitions

```typescript
export interface InstallmentChange {
  installment_id: string;
  new_amount: number;
}

export interface InstallmentModificationRequest {
  advance_id: string;
  installment_changes: InstallmentChange[];
  redistribution_method?: RedistributionMethod;
  reason: string;
}

export interface InstallmentModificationResult {
  success: boolean;
  affected_count: number;
  affected_installments: any[];
  redistribution_applied: boolean;
}

export interface InstallmentChangeLog {
  id: string;
  tenant_id: string;
  advance_id: string;
  installment_id: string;
  change_type: InstallmentChangeType;
  old_amount: number;
  new_amount: number;
  redistribution_method: RedistributionMethod | null;
  affected_installments: any;
  reason: string;
  changed_by: string;
  created_at: string;
}
```

## Usage Scenarios

### Scenario 1: Employee Requests Reduced Installment

**Situation**: Employee requests a lower payment for the next month due to financial constraints

**Steps**:
1. Navigate to the advance details
2. Click "Modify Installments"
3. Locate the next scheduled installment
4. Reduce the amount
5. Select "Equal Distribution" to spread the difference across remaining months
6. Provide reason: "Employee requested reduced payment for January due to medical expenses"
7. Preview changes
8. Apply modification

**Result**: January installment reduced, remaining amount distributed equally across future months

### Scenario 2: Early Repayment Planning

**Situation**: Employee wants to pay more now to finish the advance sooner

**Steps**:
1. Open advance details
2. Click "Modify Installments"
3. Increase the next 2-3 installment amounts
4. Select "No Redistribution"
5. Provide reason: "Employee requested accelerated repayment"
6. Apply changes

**Result**: Next few installments increased, advance will complete sooner

### Scenario 3: Standardizing Payment Schedule

**Situation**: Company policy change requires equal installments

**Steps**:
1. Access advance details
2. Click "Modify Installments"
3. Select "Equal Distribution" method
4. Don't modify individual amounts
5. Provide reason: "Standardizing per company policy update"
6. Apply redistribution

**Result**: All scheduled installments set to equal amounts

### Scenario 4: Proportional Adjustment After Salary Change

**Situation**: Employee got a raise, can afford proportionally higher payments

**Steps**:
1. Navigate to advance details
2. Click "Modify Installments"
3. Increase one or more installments by desired percentage
4. Select "Proportional Adjustment"
5. Provide reason: "Adjusted per salary increment"
6. Apply changes

**Result**: All installments increased proportionally

## Access Control

### Permission Requirements

The "Modify Installments" button is visible and functional only when:

1. **User Role**: User has higher official/admin privileges
2. **Advance Status**: Advance is in 'approved' or 'active' status
3. **Tenant Access**: User belongs to the same tenant as the advance
4. **Authentication**: User is properly authenticated

### Security Measures

1. **RLS Policies**: Database-level row-level security prevents unauthorized access
2. **Function Security**: RPC function validates tenant access before processing
3. **Audit Logging**: All changes are logged with user ID and timestamp
4. **Status Validation**: Only scheduled installments can be modified
5. **Amount Validation**: Negative amounts are prevented
6. **Reason Requirement**: Mandatory justification for all changes

## Error Handling

### Validation Errors

**Negative Amount**
- **Error**: "New amount must be positive"
- **Resolution**: Enter a positive value

**No Modifications**
- **Error**: "No changes to apply"
- **Resolution**: Modify at least one installment amount

**Missing Reason**
- **Error**: "Please provide a reason for the changes"
- **Resolution**: Fill in the reason field

**Invalid Status**
- **Error**: "Advance not found or not in valid status for modification"
- **Resolution**: Verify advance status is 'approved' or 'active'

**Paid Installment**
- **Error**: "Installment not found or not in scheduled status"
- **Resolution**: Only scheduled (unpaid) installments can be modified

### System Errors

**Authentication Failure**
- Redirects to login if session expired
- Shows authentication error message

**Database Errors**
- Displays user-friendly error message
- Logs technical details for debugging
- Maintains data integrity (no partial updates)

**Network Errors**
- Shows retry option
- Preserves user input
- Provides clear feedback

## Best Practices

### For Administrators

1. **Always Provide Clear Reasons**: Document why changes are being made
2. **Review Before Applying**: Use the preview feature to verify changes
3. **Consider Redistribution Impact**: Understand how redistribution affects future installments
4. **Monitor Change History**: Regularly review modification logs for compliance
5. **Communicate with Employees**: Inform employees of installment changes
6. **Document Policy Changes**: Keep records of any policy changes that trigger bulk modifications

### For System Administrators

1. **Regular Audit Reviews**: Periodically review installment change logs
2. **Access Control**: Ensure only authorized personnel have modification rights
3. **Backup Before Bulk Changes**: Take database backups before major modifications
4. **Test in Staging**: Test redistribution strategies in staging environment first
5. **Monitor Performance**: Track RPC function performance with multiple concurrent modifications

## Troubleshooting

### Issue: Button Not Visible

**Cause**: User lacks proper permissions or advance in wrong status
**Solution**:
- Verify user has admin/higher official role
- Check advance status is 'approved' or 'active'
- Confirm user is in correct tenant

### Issue: Changes Not Applying

**Cause**: Validation error or installment already processed
**Solution**:
- Check for error messages in toast notifications
- Verify installments are in 'scheduled' status
- Ensure all required fields are filled

### Issue: Redistribution Not Working as Expected

**Cause**: Misunderstanding of redistribution method
**Solution**:
- Review redistribution method descriptions
- Use preview feature to see expected results
- Try different redistribution strategies

### Issue: Balance Mismatch

**Cause**: Race condition with payroll processing
**Solution**:
- Refresh the advance details
- Verify no payroll was processed during modification
- Contact system administrator if issue persists

## Integration with Existing Features

### Payroll Processing
- Modified installments are automatically picked up by payroll processing
- Payroll deduction amount reflects the current installment amount
- No manual intervention needed in payroll system

### Hold Deduction
- Held installments cannot be modified
- Must remove hold before modifying
- Hold can be reapplied after modification

### Short Closure
- Short closure takes precedence over installment modifications
- Once closed, installments cannot be modified
- All scheduled installments are waived on closure

### Audit Reports
- Installment change logs can be exported for compliance
- Available in standard audit reports
- Includes full modification history

## Future Enhancements

### Planned Features

1. **Bulk Modification**: Modify installments for multiple advances simultaneously
2. **Approval Workflow**: Require approval for large modifications
3. **Automated Redistribution**: Trigger redistribution based on rules
4. **Notification System**: Notify employees of installment changes
5. **Advanced Analytics**: Dashboard showing modification trends
6. **Template Management**: Save common redistribution patterns
7. **Integration with HR**: Link to employee performance reviews
8. **Mobile Support**: Mobile-optimized interface for modifications

## Conclusion

The Installment Change feature provides comprehensive flexibility in managing employee advance repayments while maintaining security, compliance, and data integrity. The combination of targeted modifications and intelligent redistribution strategies ensures that organizations can adapt to changing circumstances while keeping complete audit trails.

The feature seamlessly integrates with existing advance management functionality, requires no changes to payroll processing, and provides a user-friendly interface for authorized personnel to make informed decisions about installment schedules.
