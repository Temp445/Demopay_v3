import React, { useState, useEffect } from 'react';
import { X, Plus, Pencil, Check, Trash2 } from 'lucide-react';
import { useRolesStore } from '../../../stores/rolesStore';

interface ManageRolesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ManageRolesModal({ isOpen, onClose }: ManageRolesModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { items: roles, fetchRoles, createRole, updateRole, deleteRole } = useRolesStore();
  const [newRoleName, setNewRoleName] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState('');

  // 1. Fetches fresh data whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      fetchRoles();
    }
  }, [isOpen, fetchRoles]);

  // 2. Auto-hide the error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // --- NEW: Reset all fields and states when closing the modal ---
  const handleClose = () => {
    setNewRoleName('');
    setEditingRoleId(null);
    setEditRoleName('');
    setError(null);
    onClose();
  };
  // ----------------------------------------------------------------

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      setLoading(true);
      setError(null); // Clear previous errors
      await createRole(newRoleName);
      setNewRoleName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add role');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (id: string) => {
    if (!editRoleName.trim()) return;
    try {
      setLoading(true);
      setError(null); // Clear previous errors
      await updateRole(id, editRoleName);
      setEditingRoleId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the role "${name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null); // Clear previous errors
      await deleteRole(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            {/* UPDATED: Uses the new handleClose function */}
            <button onClick={handleClose} className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">Manage Designation</h3>

            {error && <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-md text-sm transition-all duration-300">{error}</div>}

            <div className="flex gap-2 mb-6">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="New Designation name..."
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
              <button
                onClick={handleAddRole}
                disabled={!newRoleName.trim() || loading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>

            <ul className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {roles.map((role) => (
                <li key={role.id} className="bg-gray-50 p-2 rounded-md border border-gray-200 shadow-sm flex items-center justify-between">
                  {editingRoleId === role.id ? (
                    <div className="flex items-center w-full gap-2">
                      <input
                        type="text"
                        value={editRoleName}
                        onChange={(e) => setEditRoleName(e.target.value)}
                        className="flex-1 rounded-md border-gray-300 py-1 px-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <button onClick={() => handleUpdateRole(role.id)} className="text-green-600 hover:text-green-800">
                        <Check className="h-5 w-5" />
                      </button>
                      <button onClick={() => setEditingRoleId(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-gray-700">{role.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingRoleId(role.id);
                            setEditRoleName(role.name);
                          }}
                          className="text-gray-400 hover:text-indigo-600 p-1"
                          title="Edit Designation"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRole(role.id, role.name)}
                          className="text-gray-400 hover:text-red-600 p-1"
                          title="Delete Designation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}