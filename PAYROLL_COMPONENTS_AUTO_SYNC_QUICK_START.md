# Payroll Components Auto-Sync - Quick Start Guide

## 🎯 Overview

This system automatically creates and updates payroll components when you create or edit shifts and leave types. No manual component creation needed!

---

## 📋 Quick Installation (5 Minutes)

### Step 1: Install Triggers (2 min)

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy **PAYROLL_COMPONENTS_AUTO_SYNC_TRIGGERS.sql**
3. Paste and click **Run**
4. ✅ You should see "CREATE TRIGGER" success messages

### Step 2: Migrate Existing Data (3 min)

1. In **SQL Editor**, open a new query
2. Copy **PAYROLL_COMPONENTS_DATA_MIGRATION.sql**
3. Paste and click **Run**
4. ✅ Review the migration summary
5. ✅ Verify it shows components were created

### Step 3: Verify (1 min)

Check that triggers exist:

```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE 'sync_%';
```

Expected: 4 rows (2 for shifts, 2 for leave_types)

---

## 🎬 How It Works

### Before Auto-Sync:
```
1. Create shift "Morning Shift" ✓
2. Manually create payroll component ✗ (You had to do this!)
3. Link component to shift ✗ (Manual work)
```

### With Auto-Sync:
```
1. Create shift "Morning Shift" ✓
2. Component auto-created ✓ (Automatic!)
3. Component linked ✓ (Automatic!)
```

---

## 🔄 What Gets Auto-Synced

### Shifts → Payroll Components

**When you create a shift:**
- ✅ Payroll component created automatically
- ✅ Component name: "Shift: {your_shift_name}"
- ✅ Component type: earning
- ✅ Component category: calculation

**When you update a shift:**
- ✅ Name change → Component name updates
- ✅ Description change → Component description updates
- ✅ Active status change → Component status updates

**Example:**
```
Create Shift: "Night Shift"
  ↓
Auto-creates Component: "Shift: Night Shift"
  ↓
Update Shift name to: "Overnight Shift"
  ↓
Component auto-updates to: "Shift: Overnight Shift"
```

### Leave Types → Payroll Components

**When you create a leave type:**
- ✅ Payroll component created automatically
- ✅ Component name: "Leave: {your_leave_type_name}"
- ✅ Component type: earning
- ✅ Component category: calculation

**When you update a leave type:**
- ✅ Name change → Component name updates
- ✅ Description change → Component description updates

**Example:**
```
Create Leave Type: "Study Leave"
  ↓
Auto-creates Component: "Leave: Study Leave"
  ↓
Update Leave Type name to: "Educational Leave"
  ↓
Component auto-updates to: "Leave: Educational Leave"
```

---

## 📊 Viewing Auto-Generated Components

### In the UI

1. Go to **Dashboard** → **Payroll** → **Component Master**
2. Look for components with names starting with:
   - "Shift: ..."
   - "Leave: ..."
3. These are auto-generated and will auto-update

### In Database

```sql
-- View all auto-generated components
SELECT
  name,
  component_type,
  component_category,
  is_active,
  created_at
FROM payroll_components
WHERE name LIKE 'Shift: %' OR name LIKE 'Leave: %'
ORDER BY created_at DESC;
```

---

## ✅ Testing (Optional)

### Test 1: Create New Shift

```sql
-- Create a test shift
INSERT INTO shifts (name, description, start_time, end_time, shift_type, is_active, tenant_id)
VALUES (
  'Test Morning',
  'Test shift',
  '09:00:00',
  '17:00:00',
  'morning',
  true,
  (SELECT id FROM tenants LIMIT 1)
);

-- Check component was created
SELECT * FROM payroll_components WHERE name = 'Shift: Test Morning';

-- Expected: 1 row with matching details

-- Cleanup
DELETE FROM payroll_components WHERE name = 'Shift: Test Morning';
DELETE FROM shifts WHERE name = 'Test Morning';
```

### Test 2: Update Shift Name

```sql
-- Create test shift
INSERT INTO shifts (name, start_time, end_time, shift_type, tenant_id)
VALUES ('Test A', '09:00', '17:00', 'morning', (SELECT id FROM tenants LIMIT 1));

-- Update name
UPDATE shifts SET name = 'Test B' WHERE name = 'Test A';

-- Check component name updated
SELECT * FROM payroll_components WHERE name = 'Shift: Test B';

-- Expected: 1 row

-- Check old name gone
SELECT * FROM payroll_components WHERE name = 'Shift: Test A';

-- Expected: 0 rows

-- Cleanup
DELETE FROM payroll_components WHERE name LIKE 'Shift: Test %';
DELETE FROM shifts WHERE name LIKE 'Test %';
```

---

## 🐛 Troubleshooting

### Problem: Component Not Created

**Check 1: Are triggers installed?**
```sql
SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name LIKE 'sync_%';
-- Expected: 4
```

If 0, re-run **PAYROLL_COMPONENTS_AUTO_SYNC_TRIGGERS.sql**

**Check 2: Does component already exist?**
```sql
SELECT * FROM payroll_components WHERE name = 'Shift: {your_shift_name}';
```

If exists, trigger won't create duplicate

### Problem: Component Name Not Updated

**Check: Did you update the shift/leave type name?**

Only name/description/status changes trigger updates.

**Verify:**
```sql
SELECT name FROM payroll_components WHERE name LIKE 'Shift: %' ORDER BY updated_at DESC LIMIT 5;
```

### Problem: Too Many Components

**Check for duplicates:**
```sql
SELECT name, COUNT(*)
FROM payroll_components
WHERE name LIKE 'Shift: %' OR name LIKE 'Leave: %'
GROUP BY name
HAVING COUNT(*) > 1;
```

**Remove duplicates (keeps oldest):**
```sql
DELETE FROM payroll_components
WHERE id NOT IN (
  SELECT MIN(id) FROM payroll_components
  GROUP BY name, tenant_id
)
AND (name LIKE 'Shift: %' OR name LIKE 'Leave: %');
```

---

## 📖 Component Specifications

### Shift Components

| Attribute | Value |
|-----------|-------|
| component_type | earning |
| component_category | calculation |
| type_selection | common |
| amount_type | value |
| value_set | at_executing |
| is_attendance_linked | true |
| always_treat_as_full_day | false |
| is_active | matches shift.is_active |
| eligibility | all |

### Leave Type Components

| Attribute | Value |
|-----------|-------|
| component_type | earning |
| component_category | calculation |
| type_selection | common |
| amount_type | value |
| value_set | at_executing |
| is_attendance_linked | true |
| always_treat_as_full_day | false |
| is_active | true (always) |
| eligibility | all |

---

## 🔍 Monitoring

### Check Sync Status

```sql
-- Count components by source
SELECT
  CASE
    WHEN name LIKE 'Shift: %' THEN 'Shifts'
    WHEN name LIKE 'Leave: %' THEN 'Leave Types'
    ELSE 'Other'
  END as source,
  COUNT(*) as total,
  COUNT(CASE WHEN is_active THEN 1 END) as active
FROM payroll_components
WHERE name LIKE 'Shift: %' OR name LIKE 'Leave: %'
GROUP BY source;
```

### Find Missing Components

```sql
-- Shifts without components
SELECT s.name
FROM shifts s
WHERE NOT EXISTS (
  SELECT 1 FROM payroll_components pc
  WHERE pc.name = 'Shift: ' || s.name
);

-- Leave types without components
SELECT lt.name
FROM leave_types lt
WHERE NOT EXISTS (
  SELECT 1 FROM payroll_components pc
  WHERE pc.name = 'Leave: ' || lt.name
);

-- Expected: 0 rows for both queries
```

---

## 🎓 Best Practices

### ✅ DO:
- Create shifts and leave types normally
- Update them as needed
- Let the system handle component sync
- Monitor sync status monthly

### ❌ DON'T:
- Manually create components for shifts/leave types
- Manually rename components with "Shift: " or "Leave: " prefix
- Delete auto-generated components
- Modify trigger functions without testing

---

## 📚 Additional Resources

For detailed information, see:
- **Full Documentation**: PAYROLL_COMPONENTS_AUTO_SYNC_DOCUMENTATION.md
- **Trigger SQL**: PAYROLL_COMPONENTS_AUTO_SYNC_TRIGGERS.sql
- **Migration SQL**: PAYROLL_COMPONENTS_DATA_MIGRATION.sql

---

## 🆘 Need Help?

### Common Questions

**Q: Can I manually edit auto-generated components?**
A: Yes, but changes will be overwritten when the shift/leave type updates. Only edit if you know what you're doing.

**Q: What if I rename a shift?**
A: The component name automatically updates. No action needed.

**Q: Can I delete auto-generated components?**
A: Yes, but they'll be recreated when the shift/leave type updates. Better to deactivate the shift instead.

**Q: Does this work with multi-tenant setup?**
A: Yes, tenant isolation is maintained. Components are tenant-specific.

**Q: What happens if I delete a shift?**
A: The component remains. You can manually delete it or run the orphaned cleanup query.

---

## ✨ Summary

**What You Did:**
1. ✅ Installed triggers (2 min)
2. ✅ Migrated existing data (3 min)
3. ✅ Verified installation (1 min)

**What You Get:**
- ✅ Automatic component creation for new shifts
- ✅ Automatic component creation for new leave types
- ✅ Automatic component updates when you edit
- ✅ No manual component management needed
- ✅ Zero maintenance required

**You're Done!** 🎉

The system is now running in the background. Create or edit shifts and leave types as usual - components will auto-sync!
