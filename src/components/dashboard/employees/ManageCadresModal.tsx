import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Check, Trash2 } from 'lucide-react';
import { useCadresStore } from '../../../stores/cadresStore';

interface ManageCadresModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ManageCadresModal({ isOpen, onClose }: ManageCadresModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { items: cadres, fetchCadres, createCadre, updateCadre, deleteCadre } = useCadresStore();
    const [newCadreName, setNewCadreName] = useState('');
    const [editingCadreId, setEditingCadreId] = useState<string | null>(null);
    const [editCadreName, setEditCadreName] = useState('');

    // Fetch cadres when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchCadres();
        }
    }, [isOpen, fetchCadres]);

    // Auto-hide error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => {
                setError(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // Reset all local states when closing
    const handleClose = () => {
        setNewCadreName('');
        setEditingCadreId(null);
        setEditCadreName('');
        setError(null);
        onClose();
    };

    const handleAddCadre = async () => {
        if (!newCadreName.trim()) return;
        try {
            setLoading(true);
            setError(null);
            await createCadre(newCadreName);
            setNewCadreName('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add cadre');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateCadre = async (id: string) => {
        if (!editCadreName.trim()) return;
        try {
            setLoading(true);
            setError(null);
            await updateCadre(id, editCadreName);
            setEditingCadreId(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update cadre');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCadre = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the cadre "${name}"?`)) {
            return;
        }

        try {
            setLoading(true);
            setError(null);
            await deleteCadre(id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete cadre');
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
                        <button onClick={handleClose} className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div>
                        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">Manage Cadres</h3>

                        {error && <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-md text-sm transition-all duration-300">{error}</div>}

                        <div className="flex gap-2 mb-6">
                            <input
                                type="text"
                                value={newCadreName}
                                onChange={(e) => setNewCadreName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddCadre()}
                                placeholder="New cadre name..."
                                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                            <button
                                onClick={handleAddCadre}
                                disabled={!newCadreName.trim() || loading}
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Add
                            </button>
                        </div>

                        <ul className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                            {cadres.length === 0 && (
                                <li className="text-sm text-gray-500 text-center py-4">No cadres yet. Add one above.</li>
                            )}
                            {cadres.map((cadre) => (
                                <li key={cadre.id} className="bg-gray-50 p-2 rounded-md border border-gray-200 shadow-sm flex items-center justify-between">
                                    {editingCadreId === cadre.id ? (
                                        <div className="flex items-center w-full gap-2">
                                            <input
                                                type="text"
                                                value={editCadreName}
                                                onChange={(e) => setEditCadreName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleUpdateCadre(cadre.id)}
                                                className="flex-1 rounded-md border-gray-300 py-1 px-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                            <button onClick={() => handleUpdateCadre(cadre.id)} className="text-green-600 hover:text-green-800">
                                                <Check className="h-5 w-5" />
                                            </button>
                                            <button onClick={() => setEditingCadreId(null)} className="text-gray-400 hover:text-gray-600">
                                                <X className="h-5 w-5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="text-sm font-medium text-gray-700">{cadre.name}</span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingCadreId(cadre.id);
                                                        setEditCadreName(cadre.name);
                                                    }}
                                                    className="text-gray-400 hover:text-indigo-600 p-1"
                                                    title="Edit cadre"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCadre(cadre.id, cadre.name)}
                                                    className="text-gray-400 hover:text-red-600 p-1"
                                                    title="Delete cadre"
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
