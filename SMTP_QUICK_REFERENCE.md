# SMTP Configuration - Quick Reference Guide

## 🚀 Quick Start (5 Minutes)

### 1. Run Database Migration
```sql
-- Copy and execute smtp_configuration_migration.sql in Supabase SQL Editor
```

### 2. Add Component
```typescript
import SettingsPage from './components/dashboard/settings/SettingsPage';

// Add route
<Route path="/settings" element={<SettingsPage />} />
```

### 3. Done!
Navigate to `/settings` and configure your SMTP.

---

## 📋 Common SMTP Configurations

### Gmail
```
Host: smtp.gmail.com
Port: 587
Encryption: TLS
Username: your-email@gmail.com
Password: [App-specific password]
```
**Note:** Enable 2FA and create App Password in Google Account settings.

### Outlook/Office 365
```
Host: smtp.office365.com
Port: 587
Encryption: TLS
Username: your-email@outlook.com
Password: [Account password]
```

### SendGrid
```
Host: smtp.sendgrid.net
Port: 587
Encryption: TLS
Username: apikey
Password: [Your SendGrid API key]
```

### Amazon SES
```
Host: email-smtp.[region].amazonaws.com
Port: 587
Encryption: TLS
Username: [SMTP username from SES]
Password: [SMTP password from SES]
```

---

## 🔍 Validation Rules

| Field | Rules |
|-------|-------|
| **Host** | Required, min 3 chars |
| **Port** | Required, 1-65535, integer |
| **Username** | Required |
| **Password** | Required, min 6 chars |
| **Sender Email** | Required, valid email format |
| **Sender Name** | Required, min 2 chars |

---

## 🎨 UI Components Reference

### Form Fields
```typescript
// Text Input
<input type="text" value={value} onChange={handler} />

// Number Input (Port)
<input type="number" min="1" max="65535" />

// Password Input with Toggle
<input type={showPassword ? 'text' : 'password'} />

// Email Input
<input type="email" pattern="..." />

// Radio Buttons (Encryption)
<input type="radio" name="encryption" value="tls" />

// Toggle Switch (Active Status)
<input type="checkbox" checked={isActive} />
```

### Icons Used
```typescript
import {
  Mail,        // Header, Sender section
  Server,      // Server settings section
  Lock,        // Password, Authentication
  User,        // Username field
  AlertCircle, // Error messages
  CheckCircle, // Success messages
  Save,        // Save button
  X,           // Cancel button
  RefreshCcw,  // Test connection button
  Eye,         // Show password
  EyeOff       // Hide password
} from 'lucide-react';
```

---

## 🗄️ Database Quick Reference

### Table Structure
```sql
smtp_configurations
├── id (uuid, PK)
├── tenant_id (uuid, FK)
├── host (text)
├── port (integer)
├── username (text)
├── password (text)
├── encryption (text)
├── sender_email (text)
├── sender_name (text)
├── is_active (boolean)
├── created_at (timestamptz)
└── updated_at (timestamptz)
```

### Common Queries

**Select Config**
```typescript
const { data, error } = await supabase
  .from('smtp_configurations')
  .select('*')
  .eq('tenant_id', tenantId)
  .maybeSingle();
```

**Insert Config**
```typescript
const { data, error } = await supabase
  .from('smtp_configurations')
  .insert({ ...configData })
  .select()
  .single();
```

**Update Config**
```typescript
const { data, error } = await supabase
  .from('smtp_configurations')
  .update({ ...configData })
  .eq('id', configId)
  .select()
  .single();
```

---

## 🐛 Troubleshooting Checklist

### Configuration Not Loading
- [ ] Database migration executed?
- [ ] RLS policies created?
- [ ] User authenticated?
- [ ] `user_tenants` table exists?
- [ ] Correct tenant_id?

### Validation Errors
- [ ] All required fields filled?
- [ ] Port in valid range (1-65535)?
- [ ] Email in correct format?
- [ ] Password 6+ characters?
- [ ] Host 3+ characters?

### Save Failing
- [ ] Authentication valid?
- [ ] Network connection active?
- [ ] Database permissions correct?
- [ ] Form validation passing?
- [ ] Check browser console for errors

### Test Connection Not Working
- [ ] Form validation passing?
- [ ] All fields filled correctly?
- [ ] Wait full 2 seconds for result?
- [ ] Check test result message

---

## 🎯 Component Props & State

### State Variables
```typescript
const [smtpConfig, setSmtpConfig] = useState<SMTPConfiguration>({
  host: '',
  port: 587,
  username: '',
  password: '',
  encryption: 'tls',
  sender_email: '',
  sender_name: '',
  is_active: true
});

const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [testing, setTesting] = useState(false);
const [showPassword, setShowPassword] = useState(false);
const [formErrors, setFormErrors] = useState<FormErrors>({});
const [successMessage, setSuccessMessage] = useState<string | null>(null);
const [errorMessage, setErrorMessage] = useState<string | null>(null);
```

### Key Functions
```typescript
// Load configuration from database
loadSMTPConfiguration()

// Validate entire form
validateForm(): boolean

// Save configuration
handleSave()

// Cancel changes
handleCancel()

// Test SMTP connection
handleTestConnection()

// Handle input changes
handleInputChange(field, value)
```

---

## 🔐 Security Checklist

### Production Requirements
- [ ] Encrypt passwords before storage
- [ ] Use environment variables for sensitive data
- [ ] Enable HTTPS/SSL
- [ ] Implement rate limiting
- [ ] Add audit logging
- [ ] Use secure password policies
- [ ] Regular security audits
- [ ] Keep dependencies updated

### RLS Verification
```sql
-- Test RLS policies
SELECT * FROM smtp_configurations; -- Should only show your tenant's config

-- Verify policies exist
SELECT * FROM pg_policies WHERE tablename = 'smtp_configurations';
```

---

## 📱 Responsive Breakpoints

### Mobile (< 768px)
- Single column layout
- Stacked buttons
- Full-width inputs

### Tablet (768px - 1024px)
- Two column grid
- Side-by-side buttons
- Optimized spacing

### Desktop (> 1024px)
- Two column grid
- Horizontal button layout
- Maximum width: 1024px

---

## 🧪 Testing Commands

```bash
# Run all tests
npm test SettingsPage.test.tsx

# Run with coverage
npm test -- --coverage SettingsPage.test.tsx

# Watch mode
npm test -- --watch SettingsPage.test.tsx

# Run specific test
npm test -- -t "validates email format"
```

---

## 🔄 Common Use Cases

### Use Case 1: First Time Setup
```
1. Navigate to /settings
2. Fill in all required fields
3. Select encryption type
4. Click "Test Connection"
5. Verify success message
6. Click "Save Configuration"
```

### Use Case 2: Update Existing Config
```
1. Navigate to /settings
2. Modify desired fields
3. Click "Test Connection" (optional)
4. Click "Save Configuration"
```

### Use Case 3: Change SMTP Provider
```
1. Navigate to /settings
2. Update host and port
3. Update username and password
4. Update encryption type
5. Click "Test Connection"
6. Click "Save Configuration"
```

### Use Case 4: Disable SMTP
```
1. Navigate to /settings
2. Toggle "Enable SMTP" switch to off
3. Click "Save Configuration"
```

---

## 📊 Component File Sizes

| File | Lines | Size |
|------|-------|------|
| SettingsPage.tsx | ~800 | ~35KB |
| SettingsPage.test.tsx | ~700 | ~32KB |
| smtp_configuration_migration.sql | ~150 | ~7KB |

---

## 🎨 Color Palette

### Success (Green)
```css
bg-green-50, border-green-200, text-green-700
```

### Error (Red)
```css
bg-red-50, border-red-200, text-red-600
```

### Warning (Yellow)
```css
bg-yellow-50, border-yellow-200, text-yellow-700
```

### Primary (Indigo)
```css
bg-indigo-600, hover:bg-indigo-700
border-indigo-500, text-indigo-600
```

### Neutral (Gray)
```css
bg-gray-50, border-gray-300, text-gray-700
```

---

## 📚 Additional Resources

### Documentation Files
- `SMTP_CONFIGURATION_DOCUMENTATION.md` - Comprehensive guide
- `SMTP_INTEGRATION_GUIDE.md` - Integration steps
- `SMTP_ARCHITECTURE.md` - System architecture
- `SMTP_QUICK_REFERENCE.md` - This file

### Code Files
- `SettingsPage.tsx` - Main component
- `SettingsPage.test.tsx` - Test suite
- `smtp_configuration_migration.sql` - Database schema

---

## 🆘 Getting Help

### Debug Steps
1. Check browser console for errors
2. Verify database migration ran successfully
3. Test authentication is working
4. Check network tab for failed requests
5. Verify RLS policies are active
6. Check form validation errors

### Common Error Messages

**"Authentication required"**
- User not logged in
- Invalid session token
- Auth service down

**"Failed to load SMTP configuration"**
- Database connection issue
- RLS policy blocking access
- Missing tenant_id

**"Failed to save configuration"**
- Validation errors present
- Database constraint violation
- Permission denied

**"Variable not found in context"**
- This is unrelated to SMTP config
- Check formula engine configuration

---

## ⚡ Performance Tips

1. **Lazy Load Component**
```typescript
const SettingsPage = lazy(() => import('./SettingsPage'));
```

2. **Debounce Validation**
```typescript
const debouncedValidate = debounce(validateForm, 300);
```

3. **Memoize Callbacks**
```typescript
const handleSave = useCallback(() => { ... }, [deps]);
```

4. **Code Splitting**
```typescript
// Separate settings bundle
import(/* webpackChunkName: "settings" */ './SettingsPage')
```

---

## 📝 Common Ports Reference

| Port | Protocol | Usage |
|------|----------|-------|
| 25 | SMTP | Unencrypted (legacy) |
| 465 | SMTPS | SSL/TLS encryption |
| 587 | SMTP | TLS encryption (STARTTLS) |
| 2525 | SMTP | Alternative (Mailgun, etc.) |

---

## ✅ Pre-Launch Checklist

- [ ] Database migration executed
- [ ] Component integrated in router
- [ ] Authentication working
- [ ] RLS policies active
- [ ] Form validation tested
- [ ] Save/cancel working
- [ ] Test connection working
- [ ] Messages displaying correctly
- [ ] Responsive on mobile
- [ ] Cross-browser tested
- [ ] Accessibility verified
- [ ] Performance optimized
- [ ] Documentation reviewed

---

## 🎓 Learning Resources

### Related Technologies
- **React Hooks**: useState, useEffect, useCallback
- **TypeScript**: Interfaces, type safety
- **Supabase**: Authentication, RLS, queries
- **Tailwind CSS**: Utility classes, responsive design
- **lucide-react**: Icon components

### Best Practices Applied
✅ Single Responsibility Principle
✅ Controlled components
✅ Comprehensive error handling
✅ Type safety with TypeScript
✅ Responsive design
✅ Accessibility standards
✅ Security best practices
✅ Clean code principles

---

**Last Updated:** 2024
**Version:** 1.0.0
**Maintainer:** Development Team
