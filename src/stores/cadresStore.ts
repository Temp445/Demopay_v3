import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import {
    validateAuth,
    createAuthError,
    createTenantError,
    initialStoreState,
    setLoading,
    setError,
    setSuccess,
    addItem,
    removeItem,
    type StoreState,
} from './utils/storeUtils';

export interface Cadre {
    id: string;
    name: string;
    tenant_id?: string;
    created_at?: string;
    updated_at?: string;
}

interface CadresStore extends StoreState<Cadre> {
    fetchCadres: () => Promise<void>;
    createCadre: (name: string) => Promise<Cadre>;
    updateCadre: (id: string, name: string) => Promise<Cadre>;
    deleteCadre: (id: string) => Promise<void>;
    getCadreById: (id: string) => Cadre | undefined;
    reset: () => void;
}

export const useCadresStore = create<CadresStore>()(
    persist(
        (set, get) => ({
            ...initialStoreState<Cadre>(),

            fetchCadres: async () => {
                const auth = await validateAuth();
                if (!auth.isAuthenticated) {
                    set(state => setError(state, createAuthError().message));
                    return;
                }

                if (!auth.tenantId) {
                    set(state => setError(state, createTenantError().message));
                    return;
                }

                set(state => setLoading(state));

                try {
                    const { data, error } = await supabase
                        .from('cadres')
                        .select('*')
                        .eq('tenant_id', auth.tenantId)
                        .order('name');

                    if (error) throw error;

                    set(state => setSuccess(state, data || []));
                } catch (error) {
                    set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch cadres'));
                }
            },

            createCadre: async (name) => {
                const auth = await validateAuth();
                if (!auth.isAuthenticated) {
                    throw createAuthError();
                }

                if (!auth.tenantId) {
                    throw createTenantError();
                }

                set(state => setLoading(state));

                try {
                    const { data, error } = await supabase
                        .from('cadres')
                        .insert([{ name, tenant_id: auth.tenantId }])
                        .select()
                        .single();

                    if (error) {
                        if (error.code === '23505') {
                            throw new Error('A cadre with this name already exists');
                        }
                        throw error;
                    }

                    set(state => addItem(state, data));
                    return data;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Failed to create cadre';
                    set(state => setError(state, errorMessage));
                    throw error;
                }
            },

            updateCadre: async (id, name) => {
                const auth = await validateAuth();
                if (!auth.isAuthenticated) throw createAuthError();
                if (!auth.tenantId) throw createTenantError();

                set(state => setLoading(state));

                try {
                    const { data, error } = await supabase
                        .from('cadres')
                        .update({
                            name,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', id)
                        .eq('tenant_id', auth.tenantId)
                        .select()
                        .single();

                    if (error) {
                        if (error.code === '23505') {
                            throw new Error('A cadre with this name already exists');
                        }
                        throw error;
                    }

                    // update local store
                    set(state => ({
                        ...state,
                        items: state.items.map(cadre =>
                            cadre.id === id ? data : cadre
                        ),
                        loading: false,
                        error: null,
                    }));

                    return data;
                } catch (error) {
                    const msg =
                        error instanceof Error
                            ? error.message
                            : 'Failed to update cadre';
                    set(state => setError(state, msg));
                    throw error;
                }
            },

            deleteCadre: async (id) => {
                const auth = await validateAuth();
                if (!auth.isAuthenticated) {
                    throw createAuthError();
                }

                if (!auth.tenantId) {
                    throw createTenantError();
                }

                set(state => setLoading(state));

                try {
                    // 1. Get the cadre name for error messaging
                    const cadreToDelete = get().items.find(cadre => cadre.id === id);
                    if (!cadreToDelete) throw new Error('Cadre not found');

                    // 2. Check if any employees are currently assigned to this cadre
                    const { data: assignedEmployees, error: checkError } = await supabase
                        .from('employees')
                        .select('id')
                        .eq('tenant_id', auth.tenantId)
                        .eq('cadre_id', id)
                        .limit(1);

                    if (checkError) throw checkError;

                    // 3. If employees are found, throw an error to prevent deletion
                    if (assignedEmployees && assignedEmployees.length > 0) {
                        throw new Error(`Cannot delete "${cadreToDelete.name}" because it is currently assigned to one or more employees.`);
                    }

                    // 4. Proceed with deletion if no employees are assigned
                    const { error } = await supabase
                        .from('cadres')
                        .delete()
                        .eq('id', id)
                        .eq('tenant_id', auth.tenantId);

                    if (error) throw error;

                    set(state => removeItem(state, id));
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Failed to delete cadre';
                    set(state => setError(state, errorMessage));
                    throw error;
                }
            },

            getCadreById: (id) => {
                return get().items.find(cadre => cadre.id === id);
            },

            reset: () => {
                set(initialStoreState<Cadre>());
            },
        }),
        {
            name: 'cadres-storage',
            partialize: (state) => ({
                items: state.items,
                initialized: state.initialized,
            }),
        }
    )
);
