import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useOTProcessingStore } from '../../../stores/otProcessingStore';
import { useOTStructuresStore } from '../../../stores/otStructuresStore';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface CreateProcessModalProps {
  onClose: () => void;
}

export default function CreateProcessModal({ onClose }: CreateProcessModalProps) {
  const { createProcess, modalLoading } = useOTProcessingStore();
  const { structures } = useOTStructuresStore();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    process_name: '',
    processing_period_start: '',
    processing_period_end: '',
    processing_mode: 'standalone' as 'standalone' | 'linked',
    linked_payroll_id: '',
    ot_structure_id: '',
  });

  const activeStructures = structures.filter(s => s.is_active);
  const defaultStructure = structures.find(s => s.is_default);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.process_name.trim()) {
      toast.error('Please enter a process name');
      return;
    }

    if (!formData.processing_period_start || !formData.processing_period_end) {
      toast.error('Please select processing period');
      return;
    }

    if (!formData.ot_structure_id) {
      toast.error('Please select an OT structure');
      return;
    }

    try {
      const processId = await createProcess(formData);
      toast.success('Process created successfully');
      onClose();
      // Navigate to process detail
      // navigate(`/dashboard/overtime/processing/${processId}`);
    } catch (error) {
      toast.error('Failed to create process');
      console.error(error);
    }
  };

  // Set default structure when modal opens
  React.useEffect(() => {
    if (defaultStructure && !formData.ot_structure_id) {
      setFormData(prev => ({ ...prev, ot_structure_id: defaultStructure.id }));
    }
  }, [defaultStructure]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Create OT Process</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Process Name *
              </label>
              <input
                type="text"
                value={formData.process_name}
                onChange={(e) => setFormData({ ...formData, process_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., January 2024 OT"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period Start Date *
                </label>
                <input
                  type="date"
                  value={formData.processing_period_start}
                  onChange={(e) => setFormData({ ...formData, processing_period_start: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period End Date *
                </label>
                <input
                  type="date"
                  value={formData.processing_period_end}
                  onChange={(e) => setFormData({ ...formData, processing_period_end: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Processing Mode *
              </label>
              <select
                value={formData.processing_mode}
                onChange={(e) => {
                  const mode = e.target.value as 'standalone' | 'linked';
                  setFormData({ 
                    ...formData, 
                    processing_mode: mode,
                    linked_payroll_id: mode === 'standalone' ? '' : formData.linked_payroll_id
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="standalone">Standalone</option>
                <option value="linked">Linked to Payroll</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.processing_mode === 'linked'
                  ? 'OT components will be added to regular payroll'
                  : 'OT will be processed independently'}
              </p>
            </div>

            {formData.processing_mode === 'linked' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Linked Payroll Process ID (optional)
                </label>
                <input
                  type="text"
                  value={formData.linked_payroll_id}
                  onChange={(e) => setFormData({ ...formData, linked_payroll_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Leave empty to create new payroll"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OT Structure *
              </label>
              <select
                value={formData.ot_structure_id}
                onChange={(e) => setFormData({ ...formData, ot_structure_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select a structure</option>
                {activeStructures.map(structure => (
                  <option key={structure.id} value={structure.id}>
                    {structure.structure_name}
                    {structure.is_default ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
              {activeStructures.length === 0 && (
                <p className="text-xs text-red-500 mt-1">
                  No active OT structures found. Please create one first.
                </p>
              )}
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
              disabled={modalLoading || activeStructures.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {modalLoading ? 'Creating...' : 'Create Process'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
