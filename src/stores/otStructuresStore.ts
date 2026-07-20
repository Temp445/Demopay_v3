import { create } from 'zustand';
import { validateAuth } from './utils/storeUtils';
import type {
  OTStructure,
  OTComponent,
  CreateOTStructureInput,
  CreateOTComponentInput,
} from '../types/overtime';
import {
  getOTStructures,
  getOTStructureWithComponents,
  createOTStructure,
  updateOTStructure,
  deleteOTStructure,
  cloneOTStructure,
  getOTComponents,
  addOTComponent,
  updateOTComponent,
  deleteOTComponent,
  reorderOTComponents,
} from '../lib/otManagement';

interface OTStructuresStore {
  structures: OTStructure[];
  currentStructure: OTStructure | null;
  components: OTComponent[];
  loading: boolean;
  modalLoading: boolean;
  error: string | null;

  fetchStructures: () => Promise<void>;
  fetchStructure: (structureId: string) => Promise<void>;
  createStructure: (input: CreateOTStructureInput) => Promise<string>;
  updateStructure: (structureId: string, updates: Partial<CreateOTStructureInput>) => Promise<void>;
  deleteStructure: (structureId: string) => Promise<void>;
  cloneStructure: (sourceId: string, newName: string) => Promise<string>;

  fetchComponents: (structureId: string) => Promise<void>;
  addComponent: (structureId: string, component: CreateOTComponentInput) => Promise<string>;
  updateComponent: (componentId: string, updates: Partial<CreateOTComponentInput>) => Promise<void>;
  deleteComponent: (componentId: string) => Promise<void>;
  reorderComponents: (componentOrders: { id: string; display_order: number }[]) => Promise<void>;

  setAsDefault: (structureId: string) => Promise<void>;

  reset: () => void;
}

export const useOTStructuresStore = create<OTStructuresStore>((set, get) => ({
  structures: [],
  currentStructure: null,
  components: [],
  loading: false,
  modalLoading: false,
  error: null,

  fetchStructures: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    set({ loading: true, error: null });

    try {
      const structures = await getOTStructures(auth.tenantId);
      set({ structures, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  fetchStructure: async (structureId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    set({ modalLoading: true, error: null });

    try {
      const structure = await getOTStructureWithComponents(structureId, auth.tenantId);
      set({
        currentStructure: structure,
        components: structure?.components || [],
        modalLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, modalLoading: false });
    }
  },

  createStructure: async (input) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    set({ modalLoading: true });

    try {
      // Always fetch fresh data from DB to avoid race conditions with stale store state
      const dbStructures = await getOTStructures(auth.tenantId);
      const isFirstStructure = dbStructures.length === 0;
      
      if (input.is_default || isFirstStructure) {
        // Unset any existing defaults for this tenant
        for (const s of dbStructures) {
          if (s.is_default) {
            await updateOTStructure(s.id, auth.tenantId, { is_default: false });
          }
        }
        // Force true if it's the first one
        if (isFirstStructure) {
          input.is_default = true;
        }
      }

      const id = await createOTStructure(auth.tenantId, input);
      await get().fetchStructures();
      set({ modalLoading: false });
      return id;
    } catch (error) {
      set({ modalLoading: false });
      throw error;
    }
  },

  updateStructure: async (structureId, updates) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    set({ modalLoading: true });

    try {
      const { structures } = get();
      const isOnlyStructure = structures.length === 1;

      // Cannot unselect default if it's the only one
      if (isOnlyStructure) {
        updates.is_default = true;
      }

      if (updates.is_default) {
        // Use the existing setAsDefault logic to maintain exclusivity
        await get().setAsDefault(structureId);
        // Filter out is_default from updates to avoid double-updating it
        const { is_default, ...otherUpdates } = updates;
        if (Object.keys(otherUpdates).length > 0) {
          await updateOTStructure(structureId, auth.tenantId, otherUpdates);
        }
      } else {
        await updateOTStructure(structureId, auth.tenantId, updates);
      }

      await get().fetchStructures();
      if (get().currentStructure?.id === structureId) {
        await get().fetchStructure(structureId);
      }
      set({ modalLoading: false });
    } catch (error) {
      set({ modalLoading: false });
      throw error;
    }
  },

  deleteStructure: async (structureId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      const structureToDelete = get().structures.find(s => s.id === structureId);
      await deleteOTStructure(structureId, auth.tenantId);
      await get().fetchStructures();
      
      // If we deleted the default structure and others remain, set a new default
      const remaining = get().structures;
      if (remaining.length > 0 && structureToDelete?.is_default) {
        await get().setAsDefault(remaining[0].id);
      }
    } catch (error) {
      throw error;
    }
  },

  cloneStructure: async (sourceId, newName) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    set({ modalLoading: true });

    try {
      const newId = await cloneOTStructure(sourceId, newName, auth.tenantId);
      await get().fetchStructures();
      set({ modalLoading: false });
      return newId;
    } catch (error) {
      set({ modalLoading: false });
      throw error;
    }
  },

  fetchComponents: async (structureId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    try {
      const components = await getOTComponents(structureId, auth.tenantId);
      set({ components });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  addComponent: async (structureId, component) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      const id = await addOTComponent(auth.tenantId, structureId, component);
      await get().fetchComponents(structureId);
      return id;
    } catch (error) {
      throw error;
    }
  },

  updateComponent: async (componentId, updates) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      await updateOTComponent(componentId, auth.tenantId, updates);
      
      // Update local state immediately
      set(state => ({
        components: state.components.map(c => 
          c.id === componentId ? { ...c, ...updates } : c
        )
      }));
      
      // Also refresh components if currentStructure is set
      if (get().currentStructure) {
        await get().fetchComponents(get().currentStructure!.id);
      }
    } catch (error) {
      throw error;
    }
  },

  deleteComponent: async (componentId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      await deleteOTComponent(componentId, auth.tenantId);
      
      // Update local state immediately
      set(state => ({
        components: state.components.filter(c => c.id !== componentId)
      }));

      // Also refresh components if currentStructure is set
      if (get().currentStructure) {
        await get().fetchComponents(get().currentStructure!.id);
      }
    } catch (error) {
      throw error;
    }
  },

  reorderComponents: async (componentOrders) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      await reorderOTComponents(auth.tenantId, componentOrders);
      // Refresh components for current structure
      if (get().currentStructure) {
        await get().fetchComponents(get().currentStructure!.id);
      }
    } catch (error) {
      throw error;
    }
  },

  setAsDefault: async (structureId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      // First, unset all defaults
      const structures = get().structures;
      for (const structure of structures) {
        if (structure.is_default) {
          await updateOTStructure(structure.id, auth.tenantId, { is_default: false });
        }
      }

      // Then set the new default
      await updateOTStructure(structureId, auth.tenantId, { is_default: true });
      await get().fetchStructures();
    } catch (error) {
      throw error;
    }
  },

  reset: () => set({
    structures: [],
    currentStructure: null,
    components: [],
    loading: false,
    modalLoading: false,
    error: null,
  }),
}));
