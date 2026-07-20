# SMTP Configuration Integration Guide

## Quick Start

This guide walks you through integrating the SMTP Configuration feature into your existing application.

## Prerequisites

- React 18+ application
- Supabase project configured
- TypeScript enabled
- lucide-react icons installed
- Existing authentication system

## Step-by-Step Integration

### 1. Database Setup

First, create the `smtp_configurations` table in your Supabase database.

#### Option A: Using Supabase Dashboard
1. Navigate to your Supabase project
2. Go to SQL Editor
3. Copy and paste the contents of `smtp_configuration_migration.sql`
4. Click "Run" to execute the migration

#### Option B: Using Supabase CLI
```bash
# Make sure you're in your project directory
supabase db push smtp_configuration_migration.sql
```

#### Option C: Using psql
```bash
psql "postgresql://user:password@host:port/database" -f smtp_configuration_migration.sql
```

### 2. Install Dependencies

Ensure you have all required packages:

```bash
npm install lucide-react
# or
yarn add lucide-react
```

### 3. File Placement

Place the SettingsPage.tsx file in your project structure:

```
src/
├── components/
│   └── dashboard/
│       └── settings/
│           └── SettingsPage.tsx
```

### 4. Update Imports

Make sure your import paths match your project structure. Update these imports in SettingsPage.tsx if needed:

```typescript
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';
```

### 5. Add Route

Add the settings route to your router configuration:

#### React Router v6
```typescript
import SettingsPage from './components/dashboard/settings/SettingsPage';

// In your Routes configuration
<Route path="/settings" element={<SettingsPage />} />
```

#### Next.js (App Router)
```typescript
// app/settings/page.tsx
import SettingsPage from '@/components/dashboard/settings/SettingsPage';

export default function SettingsRoute() {
  return <SettingsPage />;
}
```

### 6. Add Navigation Link

Add a navigation item to access the settings page:

```tsx
import { Settings } from 'lucide-react';

<nav>
  {/* Your other nav items */}
  <Link to="/settings" className="nav-link">
    <Settings className="h-5 w-5" />
    <span>Settings</span>
  </Link>
</nav>
```

### 7. Verify Authentication

Ensure your `validateAuth` function returns the required structure:

```typescript
interface AuthResult {
  isAuthenticated: boolean;
  userId: string | null;
  tenantId: string | null;
}
```

## Configuration

### Environment Variables

No additional environment variables are needed. The component uses your existing Supabase configuration.

### Customization

#### Styling
The component uses Tailwind CSS classes. To customize:

1. **Colors**: Replace `indigo` with your brand color:
   ```typescript
   // Change from
   className="bg-indigo-600"
   // To
   className="bg-blue-600"
   ```

2. **Spacing**: Adjust padding/margins:
   ```typescript
   // Current max-width
   <div className="p-6 max-w-4xl mx-auto">
   // Adjust to your needs
   <div className="p-8 max-w-6xl mx-auto">
   ```

3. **Typography**: Update font sizes:
   ```typescript
   // Current heading
   <h1 className="text-2xl font-bold">
   // Make larger
   <h1 className="text-3xl font-bold">
   ```

#### Default Values
Change default port and encryption in the initial state:

```typescript
const [smtpConfig, setSmtpConfig] = useState<SMTPConfiguration>({
  // ... other fields
  port: 465,  // Change from 587 to 465
  encryption: 'ssl',  // Change from 'tls' to 'ssl'
  // ...
});
```

## Testing

### Manual Testing Checklist

- [ ] Page loads without errors
- [ ] Form fields are editable
- [ ] Validation errors display correctly
- [ ] Save button creates/updates configuration
- [ ] Cancel button reverts changes
- [ ] Test Connection shows appropriate feedback
- [ ] Password show/hide toggle works
- [ ] Encryption type selection works
- [ ] Active toggle switch works
- [ ] Success/error messages display
- [ ] Messages auto-dismiss after 5 seconds
- [ ] Responsive design works on mobile

### Automated Testing

Run the test suite:

```bash
npm test SettingsPage.test.tsx
# or
yarn test SettingsPage.test.tsx
```

### Test Coverage

The test file includes:
- ✅ Rendering tests
- ✅ Validation tests
- ✅ User interaction tests
- ✅ Save operation tests
- ✅ Cancel operation tests
- ✅ Test connection tests
- ✅ Message auto-dismiss tests

## Security Considerations

### Production Recommendations

1. **Encrypt Passwords**
   ```typescript
   // Before saving to database
   const encryptedPassword = await encryptPassword(smtpConfig.password);
   ```

2. **Use Backend API**
   Move SMTP connection testing to a secure backend endpoint:
   ```typescript
   // Instead of client-side simulation
   const response = await fetch('/api/smtp/test', {
     method: 'POST',
     body: JSON.stringify(smtpConfig)
   });
   ```

3. **Rate Limiting**
   Add rate limiting to prevent abuse:
   ```typescript
   // Implement exponential backoff
   const rateLimiter = new RateLimiter({
     maxAttempts: 3,
     windowMs: 60000
   });
   ```

4. **Audit Logging**
   Log configuration changes:
   ```typescript
   await logAuditEvent({
     action: 'smtp_config_updated',
     userId: auth.userId,
     timestamp: new Date()
   });
   ```

## Troubleshooting

### Common Issues

#### Issue: "validateAuth is not a function"
**Solution**: Ensure the import path is correct for your project:
```typescript
import { validateAuth } from '@/stores/utils/storeUtils';
```

#### Issue: "Cannot read property 'from' of undefined"
**Solution**: Verify Supabase client is properly initialized:
```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);
```

#### Issue: "Table smtp_configurations does not exist"
**Solution**: Run the migration SQL file in your database.

#### Issue: RLS policies blocking access
**Solution**: Ensure `user_tenants` table exists and has proper relationships:
```sql
-- Verify user_tenants table structure
SELECT * FROM user_tenants WHERE user_id = auth.uid();
```

#### Issue: Styling not applied
**Solution**: Ensure Tailwind CSS is configured:
```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  // ...
}
```

### Debug Mode

Add console logging for debugging:

```typescript
const loadSMTPConfiguration = async () => {
  console.log('Loading SMTP configuration...');
  try {
    const auth = await validateAuth();
    console.log('Auth result:', auth);

    const { data, error } = await supabase
      .from('smtp_configurations')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .maybeSingle();

    console.log('Database result:', { data, error });
    // ...
  } catch (err) {
    console.error('Load error:', err);
  }
};
```

## API Documentation

### validateAuth()
Returns authentication status and user information.

**Returns:**
```typescript
{
  isAuthenticated: boolean;
  userId: string | null;
  tenantId: string | null;
}
```

### Supabase Operations

#### Select
```typescript
const { data, error } = await supabase
  .from('smtp_configurations')
  .select('*')
  .eq('tenant_id', tenantId)
  .maybeSingle();
```

#### Insert
```typescript
const { data, error } = await supabase
  .from('smtp_configurations')
  .insert({
    host: 'smtp.example.com',
    port: 587,
    // ... other fields
  })
  .select()
  .single();
```

#### Update
```typescript
const { data, error } = await supabase
  .from('smtp_configurations')
  .update({
    host: 'smtp.newhost.com',
    updated_at: new Date().toISOString()
  })
  .eq('id', configId)
  .eq('tenant_id', tenantId)
  .select()
  .single();
```

## Performance Optimization

### Memoization
Optimize re-renders with React.memo:

```typescript
import React, { memo } from 'react';

const SettingsPage = memo(() => {
  // ... component code
});

export default SettingsPage;
```

### Debouncing
Add debounced validation:

```typescript
import { debounce } from 'lodash';

const debouncedValidate = debounce((field, value) => {
  validateField(field, value);
}, 300);
```

### Code Splitting
Lazy load the settings page:

```typescript
import { lazy, Suspense } from 'react';

const SettingsPage = lazy(() => import('./components/dashboard/settings/SettingsPage'));

<Suspense fallback={<LoadingSpinner />}>
  <SettingsPage />
</Suspense>
```

## Advanced Features

### Email Templates Integration

Extend the page to include email template management:

```typescript
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

const [templates, setTemplates] = useState<EmailTemplate[]>([]);
```

### Multiple SMTP Profiles

Support multiple SMTP configurations:

```typescript
// Remove unique constraint on tenant_id
// Add profile name field
interface SMTPConfiguration {
  // ... existing fields
  profile_name: string;
  is_default: boolean;
}
```

### SMTP Health Monitoring

Add periodic connection checks:

```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    const health = await checkSMTPHealth();
    setHealthStatus(health);
  }, 300000); // Check every 5 minutes

  return () => clearInterval(interval);
}, []);
```

## Migration from Other Systems

### From Existing SMTP Config

If you have existing SMTP settings in environment variables:

```typescript
// One-time migration script
const migrateFromEnv = async () => {
  const existingConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    username: process.env.SMTP_USERNAME,
    password: process.env.SMTP_PASSWORD,
    encryption: process.env.SMTP_ENCRYPTION as 'ssl' | 'tls' | 'none',
    sender_email: process.env.SMTP_FROM_EMAIL,
    sender_name: process.env.SMTP_FROM_NAME,
    is_active: true
  };

  await supabase
    .from('smtp_configurations')
    .insert(existingConfig);
};
```

## Support

For additional help:

1. Review the comprehensive documentation: `SMTP_CONFIGURATION_DOCUMENTATION.md`
2. Check the test file for usage examples: `SettingsPage.test.tsx`
3. Examine the database schema: `smtp_configuration_migration.sql`

## Changelog

### Version 1.0.0
- Initial release
- Full SMTP configuration interface
- Form validation
- Test connection feature
- Database integration
- Comprehensive documentation
