# SMTP Configuration - Architecture & Component Design

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              SettingsPage Component                       │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │            State Management                         │  │  │
│  │  │  - smtpConfig (current form data)                  │  │  │
│  │  │  - originalConfig (saved configuration)            │  │  │
│  │  │  - formErrors (validation errors)                  │  │  │
│  │  │  - loading/saving/testing states                   │  │  │
│  │  │  - messages (success/error)                        │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │            UI Sections                              │  │  │
│  │  │  1. Server Settings (host, port, encryption)       │  │  │
│  │  │  2. Authentication (username, password)            │  │  │
│  │  │  3. Sender Information (email, name)               │  │  │
│  │  │  4. Active Status Toggle                           │  │  │
│  │  │  5. Action Buttons (test, save, cancel)            │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Validation Functions                         │  │
│  │  - validateEmail()                                        │  │
│  │  - validatePort()                                         │  │
│  │  - validateForm()                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Data Operations                              │  │
│  │  - loadSMTPConfiguration()                                │  │
│  │  - handleSave()                                           │  │
│  │  - handleTestConnection()                                 │  │
│  │  - handleCancel()                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Authentication Layer                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              validateAuth()                               │  │
│  │  Returns: { isAuthenticated, userId, tenantId }          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database Layer (Supabase)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              smtp_configurations Table                    │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Columns:                                           │  │  │
│  │  │  - id (uuid, PK)                                    │  │  │
│  │  │  - tenant_id (uuid, FK → tenants)                  │  │  │
│  │  │  - host (text)                                      │  │  │
│  │  │  - port (integer)                                   │  │  │
│  │  │  - username (text)                                  │  │  │
│  │  │  - password (text)                                  │  │  │
│  │  │  - encryption (text: ssl|tls|none)                 │  │  │
│  │  │  - sender_email (text)                              │  │  │
│  │  │  - sender_name (text)                               │  │  │
│  │  │  - is_active (boolean)                              │  │  │
│  │  │  - created_at (timestamptz)                         │  │  │
│  │  │  - updated_at (timestamptz)                         │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Row Level Security (RLS) Policies                 │  │  │
│  │  │  - SELECT: Users can view own tenant config        │  │  │
│  │  │  - INSERT: Users can create own tenant config      │  │  │
│  │  │  - UPDATE: Users can update own tenant config      │  │  │
│  │  │  - DELETE: Users can delete own tenant config      │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
SettingsPage
├── Header Section
│   ├── Title (with Mail icon)
│   └── Description
│
├── Message Alerts
│   ├── Success Message (green banner)
│   ├── Error Message (red banner)
│   └── Test Result (green/yellow banner)
│
├── Configuration Form
│   ├── Server Settings Section
│   │   ├── SMTP Host Input
│   │   │   ├── Label (with required marker)
│   │   │   ├── Input Field
│   │   │   └── Error Message (conditional)
│   │   │
│   │   ├── Port Input
│   │   │   ├── Label (with required marker)
│   │   │   ├── Number Input
│   │   │   ├── Error Message (conditional)
│   │   │   └── Help Text
│   │   │
│   │   └── Encryption Type Selection
│   │       └── Radio Button Group
│   │           ├── NONE Option
│   │           ├── TLS Option
│   │           └── SSL Option
│   │
│   ├── Authentication Section
│   │   ├── Username Input
│   │   │   ├── Label (with required marker)
│   │   │   ├── Input Field (with User icon)
│   │   │   └── Error Message (conditional)
│   │   │
│   │   └── Password Input
│   │       ├── Label (with required marker)
│   │       ├── Input Field (with Lock icon)
│   │       ├── Show/Hide Toggle Button (Eye icon)
│   │       └── Error Message (conditional)
│   │
│   ├── Sender Information Section
│   │   ├── Sender Email Input
│   │   │   ├── Label (with required marker)
│   │   │   ├── Email Input
│   │   │   ├── Error Message (conditional)
│   │   │   └── Help Text
│   │   │
│   │   └── Sender Name Input
│   │       ├── Label (with required marker)
│   │       ├── Text Input
│   │       ├── Error Message (conditional)
│   │       └── Help Text
│   │
│   └── Active Status Section
│       ├── Description
│       └── Toggle Switch
│
├── Action Buttons Section
│   ├── Test Connection Button
│   │   ├── RefreshCcw Icon (animated when testing)
│   │   └── Text (changes to "Testing..." when active)
│   │
│   ├── Cancel Button
│   │   ├── X Icon
│   │   └── Text
│   │
│   └── Save Configuration Button
│       ├── Save Icon
│       └── Text (changes to "Saving..." when active)
│
└── Help Section
    ├── Title
    └── Tips List
```

## Data Flow Diagrams

### Load Configuration Flow

```
User Navigates to Settings Page
          ↓
Component Mounts (useEffect)
          ↓
Set loading = true
          ↓
Call validateAuth()
          ↓
    ┌─────────────┐
    │ Authenticated?│
    └─────────────┘
         ↓ Yes
Fetch SMTP Config from DB
(filtered by tenant_id)
         ↓
    ┌─────────────┐
    │ Config Exists?│
    └─────────────┘
    ↓ Yes        ↓ No
Set smtpConfig   Keep defaults
Set originalConfig
         ↓
Set loading = false
         ↓
Render Form
```

### Save Configuration Flow

```
User Clicks Save Button
          ↓
Call validateForm()
          ↓
    ┌─────────────┐
    │ Valid Form? │
    └─────────────┘
    ↓ No         ↓ Yes
Show Errors    Continue
    ↓
Set saving = true
    ↓
Call validateAuth()
    ↓
Prepare config data
(add tenant_id, timestamps)
    ↓
    ┌─────────────┐
    │ Config ID   │
    │ Exists?     │
    └─────────────┘
    ↓ Yes        ↓ No
UPDATE DB      INSERT DB
    ↓            ↓
    ┌─────────────┐
    │ Success?    │
    └─────────────┘
    ↓ Yes        ↓ No
Update State   Show Error
Show Success   Message
Message
    ↓
Set saving = false
    ↓
Update originalConfig
```

### Test Connection Flow

```
User Clicks Test Connection
          ↓
Call validateForm()
          ↓
    ┌─────────────┐
    │ Valid Form? │
    └─────────────┘
    ↓ No         ↓ Yes
Show Error     Continue
Message
    ↓
Set testing = true
Clear previous results
    ↓
Simulate Connection Test
(2 second delay)
    ↓
    ┌─────────────┐
    │ Valid Config?│
    └─────────────┘
    ↓ Yes        ↓ No
Set Success   Set Failure
Result        Result
    ↓            ↓
Set testing = false
    ↓
Display Result Banner
```

### Cancel Flow

```
User Clicks Cancel
          ↓
    ┌─────────────┐
    │ Original    │
    │ Config      │
    │ Exists?     │
    └─────────────┘
    ↓ Yes        ↓ No
Restore        Reset to
Original       Defaults
Config
    ↓
Clear formErrors
    ↓
Clear messages
    ↓
Clear test results
```

## State Management

### State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `smtpConfig` | SMTPConfiguration | Current form data |
| `originalConfig` | SMTPConfiguration \| null | Last saved config for comparison |
| `formErrors` | FormErrors | Field-specific validation errors |
| `loading` | boolean | Initial data load state |
| `saving` | boolean | Save operation in progress |
| `testing` | boolean | Connection test in progress |
| `showPassword` | boolean | Password field visibility |
| `successMessage` | string \| null | Success notification text |
| `errorMessage` | string \| null | Error notification text |
| `testResult` | TestConnectionResult \| null | Connection test results |

### State Transitions

```
Initial State (loading = true)
         ↓
Loaded State (loading = false)
         ↓
    ┌─────────────────────┐
    │   User Actions      │
    └─────────────────────┘
         ↓
    ┌────────┬────────┬────────┐
    ↓        ↓        ↓        ↓
  Editing  Testing  Saving  Viewing
  State    State    State   State
    ↓        ↓        ↓        ↓
    └────────┴────────┴────────┘
         ↓
Back to Loaded State
```

## Security Architecture

### Row Level Security (RLS)

```
┌─────────────────────────────────────────┐
│          User Makes Request             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      Supabase Auth Middleware           │
│  Validates JWT Token                    │
│  Extracts auth.uid()                    │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      RLS Policy Evaluation              │
│                                         │
│  SELECT Policy:                         │
│  ┌───────────────────────────────────┐ │
│  │ WHERE tenant_id IN (              │ │
│  │   SELECT tenant_id                │ │
│  │   FROM user_tenants               │ │
│  │   WHERE user_id = auth.uid()      │ │
│  │ )                                 │ │
│  └───────────────────────────────────┘ │
│                                         │
│  INSERT/UPDATE/DELETE Policies:         │
│  Same tenant_id verification            │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      Database Query Execution           │
│  Only returns/modifies tenant's data    │
└─────────────────────────────────────────┘
```

### Data Protection

```
┌─────────────────────────────────────────┐
│          Client Side                    │
│  ┌───────────────────────────────────┐ │
│  │  Password Field:                  │ │
│  │  - Masked by default              │ │
│  │  - Optional show/hide toggle      │ │
│  │  - Not logged in browser console  │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│          Database Storage               │
│  ┌───────────────────────────────────┐ │
│  │  Current: Plain text storage      │ │
│  │  (For development/testing)        │ │
│  │                                   │ │
│  │  Recommended for Production:      │ │
│  │  - Encrypt passwords before save  │ │
│  │  - Use encryption keys in vault   │ │
│  │  - Rotate encryption keys         │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Validation Architecture

### Client-Side Validation

```
Form Submission / Field Change
          ↓
┌─────────────────────────────────────┐
│      Field-Level Validation          │
│                                     │
│  Host:                              │
│  ├─ Required check                  │
│  └─ Min length (3)                  │
│                                     │
│  Port:                              │
│  ├─ Required check                  │
│  ├─ Range check (1-65535)           │
│  └─ Integer check                   │
│                                     │
│  Username:                          │
│  └─ Required check                  │
│                                     │
│  Password:                          │
│  ├─ Required check                  │
│  └─ Min length (6)                  │
│                                     │
│  Sender Email:                      │
│  ├─ Required check                  │
│  └─ Format validation (regex)       │
│                                     │
│  Sender Name:                       │
│  ├─ Required check                  │
│  └─ Min length (2)                  │
└─────────────────────────────────────┘
          ↓
    ┌──────────┐
    │ All Valid?│
    └──────────┘
    ↓ No      ↓ Yes
Show Errors  Proceed
```

### Database Constraints

```
┌─────────────────────────────────────┐
│    Database Level Validation         │
│                                     │
│  CHECK Constraints:                 │
│  ├─ port > 0 AND port <= 65535      │
│  └─ encryption IN (ssl, tls, none)  │
│                                     │
│  NOT NULL Constraints:              │
│  ├─ host                            │
│  ├─ port                            │
│  ├─ username                        │
│  ├─ password                        │
│  ├─ sender_email                    │
│  └─ sender_name                     │
│                                     │
│  Email Validation:                  │
│  └─ sender_email REGEX CHECK        │
│                                     │
│  Foreign Key:                       │
│  └─ tenant_id → tenants(id)         │
│                                     │
│  Unique Constraint:                 │
│  └─ One config per tenant           │
└─────────────────────────────────────┘
```

## Error Handling Architecture

```
┌─────────────────────────────────────┐
│         Error Sources               │
├─────────────────────────────────────┤
│  1. Validation Errors               │
│  2. Authentication Errors           │
│  3. Database Errors                 │
│  4. Network Errors                  │
│  5. Permission Errors               │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│      Error Handling Strategy         │
│                                     │
│  Validation Errors:                 │
│  └─ Display inline below field      │
│                                     │
│  Authentication Errors:             │
│  └─ Display error banner at top     │
│                                     │
│  Database Errors:                   │
│  └─ Display error banner with msg   │
│                                     │
│  Network Errors:                    │
│  └─ Display error banner            │
│  └─ Suggest retry                   │
│                                     │
│  Permission Errors:                 │
│  └─ Display error banner            │
│  └─ Suggest contacting admin        │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│      Error Recovery                  │
│                                     │
│  - Auto-clear messages (5 sec)      │
│  - Allow user to retry              │
│  - Preserve user input              │
│  - Log errors to console            │
└─────────────────────────────────────┘
```

## Performance Considerations

### Render Optimization

```
Component Render
       ↓
┌──────────────────────────┐
│  Minimize Re-renders     │
│                          │
│  - Use controlled inputs │
│  - Debounce validation   │
│  - Memoize callbacks     │
│  - Avoid inline objects  │
└──────────────────────────┘
       ↓
┌──────────────────────────┐
│  Code Splitting          │
│                          │
│  - Lazy load component   │
│  - Dynamic imports       │
│  - Route-based splitting │
└──────────────────────────┘
       ↓
┌──────────────────────────┐
│  Asset Optimization      │
│                          │
│  - Tree-shake icons      │
│  - Minify production     │
│  - Compress bundles      │
└──────────────────────────┘
```

### Database Query Optimization

```
┌──────────────────────────┐
│  Query Optimization      │
│                          │
│  - Index on tenant_id    │
│  - Use .maybeSingle()    │
│  - Select only needed    │
│    columns               │
│  - Efficient RLS queries │
└──────────────────────────┘
       ↓
┌──────────────────────────┐
│  Caching Strategy        │
│                          │
│  - Cache loaded config   │
│  - Invalidate on save    │
│  - Use stale-while-      │
│    revalidate pattern    │
└──────────────────────────┘
```

## Accessibility (a11y) Architecture

```
┌─────────────────────────────────────┐
│      Semantic HTML                   │
│  - Proper heading hierarchy (h1-h3) │
│  - Form labels associated with inputs│
│  - Button roles and aria-labels     │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│      Keyboard Navigation             │
│  - Tab order follows visual flow    │
│  - Focus indicators visible          │
│  - No keyboard traps                │
│  - Skip links where appropriate      │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│      Screen Reader Support           │
│  - Descriptive labels                │
│  - Error announcements              │
│  - Status updates                   │
│  - ARIA live regions for messages   │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│      Color & Contrast                │
│  - WCAG AA compliance               │
│  - Color not sole indicator         │
│  - Sufficient contrast ratios       │
└─────────────────────────────────────┘
```

## Testing Architecture

```
┌─────────────────────────────────────┐
│         Unit Tests                   │
│  - Validation functions              │
│  - Utility functions                │
│  - State management logic           │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│      Integration Tests               │
│  - Component rendering              │
│  - User interactions                │
│  - Form submissions                 │
│  - API calls                        │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│      End-to-End Tests                │
│  - Complete user flows              │
│  - Database operations              │
│  - Authentication                   │
│  - Error scenarios                  │
└─────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────┐
│      Development                     │
│  - Hot module replacement           │
│  - Source maps enabled              │
│  - Detailed error messages          │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│      Staging                         │
│  - Production build                 │
│  - Test database                    │
│  - Performance monitoring           │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│      Production                      │
│  - Minified bundles                 │
│  - Password encryption enabled      │
│  - Error tracking                   │
│  - Analytics                        │
│  - CDN delivery                     │
└─────────────────────────────────────┘
```

## Future Enhancements

### Planned Architecture Changes

1. **Backend API Layer**
   ```
   Frontend → API Gateway → SMTP Service
                          → Validation Service
                          → Encryption Service
   ```

2. **Microservices**
   ```
   - SMTP Configuration Service
   - Email Sending Service
   - Template Management Service
   - Health Check Service
   ```

3. **Event-Driven Architecture**
   ```
   Config Change → Event Bus → [
     - Audit Log Service
     - Notification Service
     - Analytics Service
   ]
   ```

4. **Caching Layer**
   ```
   Frontend → Redis Cache → Database
                ↓
           Cache Hit (fast)
                ↓
           Cache Miss → DB Query → Cache Update
   ```

This architecture document provides a comprehensive overview of the SMTP Configuration system design, data flows, and architectural decisions.
