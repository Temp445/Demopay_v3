import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, FileClock, Settings } from 'lucide-react';
import { useOTStructuresStore } from '../../../stores/otStructuresStore';
import CreateStructureModal from './CreateStructureModal';
import EditStructureModal from './EditStructureModal';
import toast from 'react-hot-toast';

export default function OTStructuresPage() {
  const { structures, loading, fetchStructures, deleteStructure } = useOTStructuresStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStructure, setEditingStructure] = useState<string | null>(null);

  useEffect(() => {
    fetchStructures();
  }, [fetchStructures]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this OT structure?')) return;

    try {
      await deleteStructure(id);
      toast.success('Structure deleted successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete structure');
      console.error(error);
    }
  };

  const handleCreateSuccess = (id: string) => {
    setShowCreateModal(false);
    setEditingStructure(id); // Open the unified edit modal after creation
  };

  const renderLoading = () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileClock className="h-6 w-6 shrink-0 text-indigo-600" />
            OT Structures
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage overtime rules and rate structures.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 w-full sm:w-auto transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Structure
        </button>
      </div>

      {loading && structures.length === 0 ? (
        renderLoading()
      ) : (
        <>
          {/* Structures Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {structures.map((structure) => (
              <div
                key={structure.id}
                className="bg-white rounded-lg shadow-md p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate" title={structure.structure_name}>
                      {structure.structure_name}
                    </h3>
                    {structure.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2" title={structure.description}>{structure.description}</p>
                    )}
                  </div>
                  <div className={`shrink-0 px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                    structure.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {structure.is_active ? 'Active' : 'Inactive'}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 border-t border-gray-100 pt-4">
                  <button
                    onClick={() => setEditingStructure(structure.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(structure.id)}
                    className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {structures.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No OT structures found</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Create Your First Structure
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals - Now outside the conditional render so they don't unmount */}
      {showCreateModal && (
        <CreateStructureModal 
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editingStructure && (
        <EditStructureModal
          structureId={editingStructure}
          onClose={() => setEditingStructure(null)}
        />
      )}
    </div>
  );
}