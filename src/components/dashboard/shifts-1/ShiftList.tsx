import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, Users, Settings, Clock } from 'lucide-react';
import { useShiftsStore, type Shift } from '../../../stores/shiftsStore';
import ShiftAttendanceSettingsModal from './ShiftAttendanceSettingsModal';
import EditShiftModal from './EditShiftModal';
import ShiftOvertimeConfig from './ShiftOvertimeConfig';
import toast from 'react-hot-toast';

interface ShiftListProps {
  onRefresh: () => void;
  lastRefresh: number;
  onAssignClick: (shift: Shift) => void;
}

export default function ShiftList({ onRefresh, lastRefresh, onAssignClick }: ShiftListProps) {
  const {items: shifts , loading, error, fetchShifts, deleteShift } = useShiftsStore();
  // const shifts = shiftsState.items || [];
  // const loading = shiftsState.loading;
  // const error = shiftsState.error;
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [overtimeConfigShift, setOvertimeConfigShift] = useState<Shift | null>(null);

  useEffect(() => {
    fetchShifts();
  }, [lastRefresh, fetchShifts]);

  const handleSettingsClick = (shift: Shift) => {
    setSelectedShift(shift);
    setIsSettingsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }


  const handleDeleteShift = async (shift: Shift) => {
  const confirmed = window.confirm(
    `Are you sure you want to delete the shift "${shift.name}"?`
  );

  if (!confirmed) return;

  try {
    await deleteShift(shift.id);
    await fetchShifts(); // ensure fresh data
    onRefresh();         // notify parent
  } catch (err) {
    toast.error(err instanceof Error
        ? err.message
        : 'This shift cannot be deleted as it is currently assigned to employees.');
    throw err;
  }
};


  // if (error) {
  //   return (
  //     <div className="rounded-md bg-red-50 p-4">
  //       <div className="text-sm text-red-700">{error}</div>
  //     </div>
  //   );
  // }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Time
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Break
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="relative px-6 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {shifts.map((shift) => (
            <tr key={shift.id}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{shift.name}</div>
                {shift.description && (
                  <div className="text-sm text-gray-500">{shift.description}</div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                  ${shift.shift_type === 'morning' ? 'bg-yellow-100 text-yellow-800' : 
                    shift.shift_type === 'afternoon' ? 'bg-blue-100 text-blue-800' : 
                    'bg-purple-100 text-purple-800'}`}
                >
                  {shift.shift_type}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(`2000-01-01T${shift.start_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                {new Date(`2000-01-01T${shift.end_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(`2000-01-01T${shift.break_start_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                {new Date(`2000-01-01T${shift.break_end_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                  ${shift.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                >
                  {shift.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex items-center justify-end space-x-3">
                  <button
                    onClick={() => handleSettingsClick(shift)}
                    className="text-gray-600 hover:text-gray-900"
                    title="Attendance Settings"
                  >
                    <Settings className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setOvertimeConfigShift(shift)}
                    className="text-orange-600 hover:text-orange-900"
                    title="Overtime Configuration"
                  >
                    <Clock className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => onAssignClick(shift)}
                    className="text-indigo-600 hover:text-indigo-900"
                    title="Assign employees"
                  >
                    <Users className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setEditingShift(shift)}
                    className="text-gray-600 hover:text-gray-900"
                    title="Edit shift"
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteShift(shift)}
                    className="text-red-600 hover:text-red-900"
                    title="Delete shift"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedShift && (
        <ShiftAttendanceSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => {
            setIsSettingsModalOpen(false);
            setSelectedShift(null);
          }}
          shift={selectedShift}
          // onSettingsUpdated={onRefresh}
        />
      )}

      {editingShift && (
        <EditShiftModal
          isOpen={!!editingShift}
          shift={editingShift}
          onClose={() => setEditingShift(null)}
          onShiftUpdated={() => {
            fetchShifts();
            onRefresh();
          }}
        />
      )}

      {overtimeConfigShift && (
        <ShiftOvertimeConfig
          isOpen={!!overtimeConfigShift}
          shiftId={overtimeConfigShift.id}
          shiftName={overtimeConfigShift.name}
          onClose={() => setOvertimeConfigShift(null)}
          onSave={() => {
            fetchShifts();
            onRefresh();
          }}
        />
      )}
    </div>
  );
}