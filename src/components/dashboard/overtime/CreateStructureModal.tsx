import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useOTStructuresStore } from '../../../stores/otStructuresStore';
import toast from 'react-hot-toast';

interface CreateStructureModalProps {
  onClose: () => void;
  onSuccess?: (id: string) => void;
}

export default function CreateStructureModal({ onClose, onSuccess }: CreateStructureModalProps) {
  const { createStructure, modalLoading, structures, fetchStructures } = useOTStructuresStore();
  const [formData, setFormData] = React.useState({
    structure_name: '',
    description: '',
    is_active: true,
    is_default: structures.length === 0,
  });

  // Removed redundant fetchStructures call here to prevent UI disruption in parent

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.structure_name.trim()) {
      toast.error('Please enter a structure name');
      return;
    }

    try {
      const id = await createStructure(formData);
      toast.success('Structure created successfully');
      if (onSuccess) {
        onSuccess(id);
      } else {
        onClose();
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create structure');
      console.error(error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Create OT Structure</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Structure Name *
              </label>
              <input
                type="text"
                value={formData.structure_name}
                onChange={(e) => setFormData({ ...formData, structure_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., Standard OT"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md h-20"
                placeholder="Optional description"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>

              <label className={`flex items-center gap-2 ${structures.length === 0 ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  disabled={structures.length === 0}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Set as Default {structures.length === 0 && '(Mandatory for first structure)'}</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={modalLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {modalLoading ? 'Creating...' : 'Create Structure'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
