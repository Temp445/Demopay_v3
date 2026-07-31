import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { useOTStructuresStore } from '../../../stores/otStructuresStore';
import { useSalaryStructuresStore } from '../../../stores/salaryStructuresStore';
import toast from 'react-hot-toast';

interface EditStructureModalProps {
  structureId?: string | null;
  onClose: () => void;
}

export default function EditStructureModal({ structureId, onClose }: EditStructureModalProps) {
  // Structure details state & store
  const { 
    structures, 
    createStructure,
    updateStructure, 
    modalLoading,
    components, 
    fetchComponents, 
    addComponent, 
    deleteComponent 
  } = useOTStructuresStore();
  
  const { salaryComponentTypes, fetchSalaryComponentTypes } = useSalaryStructuresStore();
  
  const structure = structureId ? structures.find(s => s.id === structureId) : null;

  const [formData, setFormData] = useState({
    structure_name: structure?.structure_name || '',
    description: structure?.description || '',
    is_active: structure?.is_active ?? true,
    is_default: structure?.is_default || false,
  });

  // Local state for batching component updates
  const [localComponents, setLocalComponents] = useState<any[]>([]);
  const [componentsToDelete, setComponentsToDelete] = useState<string[]>([]);
  const [componentsToAdd, setComponentsToAdd] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (structure) {
      setFormData({
        structure_name: structure.structure_name,
        description: structure.description || '',
        is_active: structure.is_active,
        is_default: structure.is_default,
      });
    }
  }, [structure]);

  // Fetch components when modal opens
  useEffect(() => {
    if (structureId) {
      fetchComponents(structureId);
    } else {
      setLocalComponents([]);
      setComponentsToDelete([]);
      setComponentsToAdd([]);
    }
    fetchSalaryComponentTypes();
  }, [structureId, fetchComponents, fetchSalaryComponentTypes]);

  // Sync loaded components to local state (only once when they load)
  useEffect(() => {
    if (structureId) {
      setLocalComponents(components);
      // Reset trackers when components load fresh from DB
      setComponentsToDelete([]);
      setComponentsToAdd([]);
    }
  }, [components, structureId]);

  // Handle Structure Details Update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.structure_name.trim()) {
      toast.error('Please enter a structure name');
      return;
    }

    setIsSaving(true);
    try {
      let activeStructureId = structureId;

      if (activeStructureId) {
        // 1. Update structure details
        await updateStructure(activeStructureId, formData);
      } else {
        // 1. Create new structure
        activeStructureId = await createStructure(formData);
      }

      // 2. Process deletions
      for (const id of componentsToDelete) {
        await deleteComponent(id);
      }

      // 3. Process additions
      for (const newComp of componentsToAdd) {
        // Remove the temporary id before sending to the DB
        const { id, ...componentData } = newComp;
        await addComponent(activeStructureId, componentData);
      }

      toast.success(structureId ? 'Structure updated successfully' : 'Structure created successfully');
      onClose();
    } catch (error) {
      toast.error(structureId ? 'Failed to update structure' : 'Failed to create structure');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Component Delete (Local only)
  const handleDeleteComponent = (componentId: string, skipConfirm = false) => {
    if (!skipConfirm && !confirm('Remove this component?')) return;

    if (componentId.startsWith('temp-')) {
      // It's a newly added component, just remove from the add list
      const compToRemove = localComponents.find(c => c.id === componentId);
      if (compToRemove) {
        setComponentsToAdd(prev => prev.filter(c => c.component_name !== compToRemove.component_name));
      }
    } else {
      // It's an existing component, mark for deletion
      setComponentsToDelete([...componentsToDelete, componentId]);
    }
    
    // Remove from UI
    setLocalComponents(prev => prev.filter(c => c.id !== componentId));
  };

  if (!structure) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">Edit OT Structure</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Section 1: Structure Details Form */}
          <section>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">Structure Details</h4>
            <form id="edit-structure-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Structure Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.structure_name}
                    onChange={(e) => setFormData({ ...formData, structure_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    placeholder="e.g., Standard OT"
                  />
                </div>

                <div className="md:col-span-1 flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="peer sr-only"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">Active Status</span>
                  </label>
                </div>

                <div className="md:col-span-1 flex items-end pb-2">
                  <label className={`flex items-center gap-2 ${structures.length === 1 ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} group`}>
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        disabled={structures.length === 1}
                        checked={formData.is_default}
                        onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                        className="peer sr-only"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      Set as Default Structure 
                    </span>
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md h-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow resize-none"
                    placeholder="Brief description of this overtime structure"
                  />
                </div>
              </div>
            </form>
          </section>

          {/* Section 2: Manage Components */}
          <section>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">Structure Components</h4>
            
            {/* Quick Add Components */}
            <div className="mb-6 bg-slate-50 p-5 rounded-lg border border-slate-200">
              <h5 className="font-medium text-slate-800 mb-1 flex items-center gap-2">
                <Plus className="h-4 w-4 text-slate-500" />
                Quick Add Earning Components {localComponents.length > 0 && <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">{localComponents.length}</span>}
              </h5>
              <p className="text-sm text-slate-500 mb-4">
                Select earning components to include in this overtime structure.
              </p>
              
              <div className="flex flex-wrap gap-2">
                {salaryComponentTypes.map((earning) => {
                  const isAlreadyAdded = localComponents.some(c => c.component_name === `${earning.name} OT`);
                  return (
                    <button
                      key={earning.id}
                      onClick={(e) => {
                        e.preventDefault();
                        if (isAlreadyAdded) {
                          const compToRemove = localComponents.find(c => c.component_name === `${earning.name} OT`);
                          if (compToRemove) {
                            handleDeleteComponent(compToRemove.id, true);
                          }
                          return;
                        }
                        
                        const newComp = {
                          id: `temp-${Date.now()}-${Math.random()}`,
                          component_name: `${earning.name} OT`,
                          component_type: 'fixed',
                          calculation_type: 'percentage',
                          value: 100,
                          percentage_of: earning.name,
                          display_order: localComponents.length,
                          is_active: true,
                        };

                        setLocalComponents([...localComponents, newComp]);
                        setComponentsToAdd([...componentsToAdd, newComp]);
                      }}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                        isAlreadyAdded
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400 hover:shadow-sm cursor-pointer'
                          : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 hover:shadow-sm'
                      }`}
                    >
                      {earning.name} {isAlreadyAdded && '✓'}
                    </button>
                  );
                })}
                {salaryComponentTypes.length === 0 && (
                  <p className="text-sm text-gray-500 italic py-2">
                    No earning components found in system settings.
                  </p>
                )}
              </div>
            </div>


          </section>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-structure-form"
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
