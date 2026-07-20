# Custom Invitation System - Quick Reference

## 🎯 Overview
Custom email invitation system for employees and HR team members with proper role assignment.

---

## 📊 Key Components

### Database
- **Table:** `user_invitations`
- **Functions:** `generate_invite_token()`, `get_invitation_by_token()`, `accept_invitation()`, `cleanup_expired_invitations()`

### Backend
- **Edge Function:** `supabase/functions/send-invite-email/index.ts`
- **Endpoint:** `POST /functions/v1/send-invite-email`

### Frontend
- **Invite Page:** `src/components/dashboard/invite/EmployeeInvitePage.tsx`
- **Accept Page:** `src/components/auth/AcceptInvitePage.tsx`
- **Route:** `/accept-invite?token=...`

---

## 🔄 Complete Flow

### Admin Sends Invitation
```
1. Admin selects employee(s) or enters HR details
2. Frontend calls Edge Function
3. Edge Function:
   - Generates unique token
   - Stores invitation in database
   - Creates email with invite link
4. User receives email
```

### User Accepts Invitation
```
1. User clicks link in email
2. AcceptInvitePage validates token
3. User enters password (2x)
4. System creates:
   - Supabase Auth user
   - Profile with role and tenant
5. Invitation marked as 'accepted'
6. User redirected to login
```

---

## 💾 Database Schema

```sql
user_invitations (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL, -- 'Employee' | 'HR Team'
  token text UNIQUE NOT NULL,
  tenant_id uuid NOT NULL,
  invited_by uuid,
  status text DEFAULT 'pending', -- 'pending' | 'accepted' | 'expired'
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(email, tenant_id, status)
);
```

---

## 🔑 Key Functions

### Generate Token
```sql
SELECT generate_invite_token();
-- Returns: 32-character URL-safe token
```

### Get Invitation
```sql
SELECT * FROM get_invitation_by_token('token-here');
-- Returns: invitation details if valid
```

### Accept Invitation
```sql
SELECT accept_invitation('token-here', 'user-uuid');
-- Returns: { success, role, tenant_id, error }
```

### Cleanup Expired
```sql
SELECT cleanup_expired_invitations();
-- Marks expired invitations
```

---

## 🌐 API Usage

### Send Invitation (Edge Function)

**Request:**
```javascript
const response = await fetch(`${supabaseUrl}/functions/v1/send-invite-email`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    name: 'John Doe',
    role: 'Employee', // or 'HR Team'
    tenant_id: 'tenant-uuid'
  })
});
```

**Response:**
```json
{
  "success": true,
  "message": "Invitation sent to user@example.com",
  "token": "generated-token",
  "invite_link": "https://app.com/accept-invite?token=..."
}
```

---

## 🔒 Security Features

### Token Security
- ✅ Cryptographically secure random generation
- ✅ 32-character URL-safe tokens
- ✅ Unique constraint in database
- ✅ Single-use (status changes after acceptance)

### Expiration
- ✅ 7-day expiration from creation
- ✅ Automatic cleanup function
- ✅ Validation on every token use

### Role Assignment
- ✅ Set at invitation creation
- ✅ Enforced by database constraint
- ✅ Immutable during acceptance
- ✅ Directly assigned to profile

### Tenant Isolation
- ✅ RLS policies enforce tenant access
- ✅ Foreign key to tenants table
- ✅ Profile inherits tenant_id
- ✅ Cannot accept for different tenant

---

## 🎨 Frontend Components

### EmployeeInvitePage
**Location:** `src/components/dashboard/invite/EmployeeInvitePage.tsx`
**Route:** `/dashboard/employee-invite`
**Features:**
- Search/filter employee list
- Multi-select with checkboxes
- HR team form with validation
- Batch sending with status feedback

### AcceptInvitePage
**Location:** `src/components/auth/AcceptInvitePage.tsx`
**Route:** `/accept-invite?token=...`
**Features:**
- Token validation
- Display invitation details
- Password creation form
- Account creation
- Error handling

---

## ⚠️ Common Issues & Solutions

### Issue: Token Invalid/Expired
**Solutions:**
- Check expires_at timestamp
- Verify status is 'pending'
- Confirm token hasn't been used
- Use get_invitation_by_token() to verify

### Issue: Profile Not Created
**Solutions:**
- Ensure user doesn't already exist
- Check accept_invitation() returned success
- Verify RLS policies
- Check database logs

### Issue: Wrong Role Assigned
**Solutions:**
- Verify invitation.role in database
- Ensure using accept_invitation() function
- Check profile.user_role after creation

---

## 📈 Monitoring Queries

### Pending Invitations
```sql
SELECT email, role, expires_at
FROM user_invitations
WHERE status = 'pending'
ORDER BY created_at DESC;
```

### Recently Accepted
```sql
SELECT email, role, accepted_at
FROM user_invitations
WHERE status = 'accepted'
ORDER BY accepted_at DESC
LIMIT 10;
```

### Acceptance Rate
```sql
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as pct
FROM user_invitations
GROUP BY status;
```

---

## 🧪 Testing Checklist

- [ ] Send employee invitation
- [ ] Receive email with correct link
- [ ] Click link, see invitation details
- [ ] Enter valid password
- [ ] Account created successfully
- [ ] Profile has correct role ('Employee')
- [ ] Can log in successfully
- [ ] Send HR team invitation
- [ ] Accept with valid password
- [ ] Profile has correct role ('HR Team')
- [ ] Test expired token (error shown)
- [ ] Test invalid token (error shown)
- [ ] Test weak password (validation error)
- [ ] Test password mismatch (validation error)

---

## 🚀 Deployment Commands

### Apply Migration
```bash
# Already applied via mcp__supabase__apply_migration
```

### Deploy Edge Function
```bash
# Already deployed via mcp__supabase__deploy_edge_function
```

### Build Frontend
```bash
npm run build
```

---

## 📝 Configuration

### SMTP Settings
Required for email sending:
- Navigate to: Settings → SMTP Configuration
- Configure host, port, credentials
- Test connection before sending invites

### Environment Variables
Auto-configured:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIRECT_URL` (optional, defaults to localhost)

---

## 🎯 Key Differences from Supabase Auth Invites

| Feature | Supabase Auth | Custom System |
|---------|--------------|---------------|
| Token Generation | Supabase managed | Database function |
| Token Storage | Internal | Database table |
| Expiration | Fixed | Configurable |
| Status Tracking | Limited | Full lifecycle |
| Role Assignment | Metadata | Direct to profile |
| Custom Fields | Limited | Fully extensible |
| Historical Data | No | Yes |
| Resend | Not built-in | Can implement |

---

## 💡 Quick Tips

1. **Token Format:** 32 characters, URL-safe (no special encoding needed)
2. **Expiry:** 7 days from creation, not from email send
3. **Status:** Only 'pending' invitations can be accepted
4. **Unique Constraint:** One pending invitation per email per tenant
5. **RLS:** Service role bypasses RLS for Edge Function
6. **Cleanup:** Run cleanup function periodically
7. **Testing:** Use different emails for each test (unique constraint)

---

## 🔗 Related Files

### Database
- Migration: `supabase/migrations/*_create_custom_invitations.sql`

### Backend
- Edge Function: `supabase/functions/send-invite-email/index.ts`

### Frontend
- Invite UI: `src/components/dashboard/invite/EmployeeInvitePage.tsx`
- Accept UI: `src/components/auth/AcceptInvitePage.tsx`
- Routing: `src/App.tsx` (added `/accept-invite` route)

### Documentation
- Full Guide: `CUSTOM_INVITATION_SYSTEM.md`
- Implementation: `EMPLOYEE_INVITE_IMPLEMENTATION.md`

---

**Last Updated:** 2026-02-18
**Status:** ✅ Production Ready
**Build:** ✅ Successful

---

## 📞 Support

For issues or questions:
1. Check `CUSTOM_INVITATION_SYSTEM.md` for detailed documentation
2. Review database logs for errors
3. Check Edge Function logs in Supabase dashboard
4. Verify SMTP configuration in Settings
5. Test with sample data in development environment

---

## ✅ System Status

- ✅ Database migration applied
- ✅ Edge Function deployed
- ✅ Frontend components created
- ✅ Routes configured
- ✅ Build successful
- ✅ TypeScript compilation successful
- ✅ Ready for production use
