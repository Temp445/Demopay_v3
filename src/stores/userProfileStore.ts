import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  department?: string;
  position?: string;
}

interface UserProfileStore {
  profile: UserProfile | null;
  userId: string | null;
  tenantId: string | null;
  setUserProfile: (userId: string, tenantId: string, profile: UserProfile | null) => void;
  clearUserProfile: () => void;
  fetchProfile: (userId: string) => Promise<void>;
  getTenantId: () => string | null;
  getUserId: () => string | null;
}

export const useUserProfileStore = create<UserProfileStore>()(
  persist(
    (set, get) => ({
      profile: null,
      userId: null,
      tenantId: null,

      /** ✅ Set user info + profile */
      setUserProfile: (userId: string, tenantId: string, profile: UserProfile | null) => {
        set({ userId, tenantId, profile });
      },

      /** ✅ Clear all user data */
      clearUserProfile: () => {
        set({ userId: null, tenantId: null, profile: null });
      },

      /** ✅ Fetch profile from Supabase */
      fetchProfile: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (error) {
            console.error('Error fetching profile:', error);
            return;
          }

          set({ profile: data });
        } catch (error) {
          console.error('Failed to fetch profile:', error);
        }
      },

      /** ✅ Get tenantId from store */
      getTenantId: () => get().tenantId,

      /** ✅ Get userId from store */
      getUserId: () => get().userId,
    }),
    {
      name: 'user-storage',
      storage: createJSONStorage(() => localStorage), // ✅ correct way
    }
  )
);
