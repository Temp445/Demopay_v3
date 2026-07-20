import { supabase } from '../../lib/supabase';
import { useUserProfileStore } from '../userProfileStore';
import { setCurrentTenantId } from '../../lib/tenantDb'; 

export interface StoreState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
}

export interface AuthValidation {
  isAuthenticated: boolean;
  userId: string | null;
  tenantId: string | null;
}

export async function validateAuth() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('validateAuth error:', error);
      return { isAuthenticated: false, userId: null, tenantId: null };
    }

    const session = data?.session;
    if (!session) {
      return { isAuthenticated: false, userId: null, tenantId: null };
    }

   // 1. Try to get tenantId from store first (fastest)
    let { tenantId } = useUserProfileStore.getState();

    // 2. Fallback: If tenantId is missing (common on page reload), fetch it directly from DB
    if (!tenantId) {
      const { data: dbTenantId, error: tenantError } = await supabase.rpc('get_user_tenant_id');
      
      if (!tenantError && dbTenantId) {
        tenantId = dbTenantId;
        // Update the helper cache so subsequent calls are fast
        setCurrentTenantId(dbTenantId);
      }
    }

    return {
      isAuthenticated: true,
      userId: session.user.id,
      tenantId: tenantId,
    };
  } catch (err) {
    console.warn('validateAuth failed:', err);
    await supabase.auth.signOut().catch(() => {});
    localStorage.clear();
    indexedDB.deleteDatabase('supabase-auth-token');
    return { isAuthenticated: false, userId: null, tenantId: null };
  }
}

// export async function validateAuth(): Promise<AuthValidation> {
//   try {
//     // FIX: With persistent sessions configured (PKCE flow + autoRefreshToken),
//     // sessions remain valid until manual sign-out. getSession() reads from
//     // localStorage first, making it fast and reliable. No timeout needed.
//     // The Supabase client handles token refresh automatically.
//     const { data: { session }, error } = await supabase.auth.getSession();

//     if (error) {
//       console.error('Auth validation error:', error);
//       return {
//         isAuthenticated: false,
//         userId: null,
//         tenantId: null,
//       };
//     }

//     if (!session || !session.user) {
//       return {
//         isAuthenticated: false,
//         userId: null,
//         tenantId: null,
//       };
//     }

//     // Get tenant ID from userProfileStore (already populated during login)
//     const { tenantId } = useUserProfileStore.getState();

//     return {
//       isAuthenticated: true,
//       userId: session.user.id,
//       tenantId: tenantId,
//     };
//   } catch (error) {
//     console.error('Failed to validate auth:', error);
//     return {
//       isAuthenticated: false,
//       userId: null,
//       tenantId: null,
//     };
//   }
// }

export function createAuthError(): Error {
  return new Error('You must be logged in to perform this action');
}

export function createTenantError(): Error {
  return new Error('User is not associated with a tenant');
}

export function createUnauthorizedError(): Error {
  return new Error('You do not have permission to perform this action');
}

export function isSessionExpiredError(error: any): boolean {
  if (!error) return false;

  const errorMessage = error.message || error.toString() || '';
  const errorCode = error.code || '';

  // Check for common session expiration indicators
  return (
    errorMessage.includes('JWT') ||
    errorMessage.includes('expired') ||
    errorMessage.includes('PGRST301') ||
    errorMessage.includes('session') ||
    errorCode === 'PGRST301' ||
    errorCode === '401'
  );
}

export function handleSessionExpiration(): void {
  console.warn('Session expired, redirecting to login...');
  // Force sign out to clear any stale session data
  supabase.auth.signOut().then(() => {
    // Redirect to login page
    window.location.href = '/login';
  }).catch((err) => {
    console.error('Error during sign out:', err);
    // Still redirect even if sign out fails
    window.location.href = '/login';
  });
}

export const initialStoreState = <T>(): StoreState<T> => ({
  items: [],
  loading: false,
  error: null,
  initialized: false,
});

export function setLoading<T>(state: StoreState<T>): StoreState<T> {
  return {
    ...state,
    loading: true,
    error: null,
  };
}

export function setError<T>(state: StoreState<T>, error: string | Error): StoreState<T> {
  // Check if this is a session expiration error
  if (isSessionExpiredError(error)) {
    handleSessionExpiration();
  }

  const errorMessage = typeof error === 'string' ? error : error.message;

  return {
    ...state,
    loading: false,
    error: errorMessage,
  };
}

export function setSuccess<T>(state: StoreState<T>, items: T[]): StoreState<T> {
  return {
    ...state,
    items,
    loading: false,
    error: null,
    initialized: true,
  };
}

export function addItem<T extends { id: string }>(
  state: StoreState<T>,
  item: T
): StoreState<T> {
  return {
    ...state,
    items: [...state.items, item],
    loading: false,
    error: null,
  };
}

export function updateItem<T extends { id: string }>(
  state: StoreState<T>,
  id: string,
  updates: Partial<T>
): StoreState<T> {
  return {
    ...state,
    items: state.items.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ),
    loading: false,
    error: null,
  };
}

export function removeItem<T extends { id: string }>(
  state: StoreState<T>,
  id: string
): StoreState<T> {
  return {
    ...state,
    items: state.items.filter(item => item.id !== id),
    loading: false,
    error: null,
  };
}
