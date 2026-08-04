import React, { useEffect, useMemo, useState } from 'react';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { format } from 'date-fns';
import { Search } from 'lucide-react';
import { useShiftsStore, type ShiftAssignment as ShiftAssignmentType } from '../../../stores/shiftsStore';
import { type Employee } from '../../../stores/employeesStore';
import SortableEmployee from './SortableEmployee';
import { supabase } from '../../../lib/supabase'; 

interface ShiftAssignmentProps {
  shift: ShiftAssignmentType;
  assignments: ShiftAssignmentType[];
  availableEmployees: Employee[];
  onAssignmentUpdate: () => void;
}

export default function ShiftAssignment({
  shift,
  assignments,
  onAssignmentUpdate,
}: ShiftAssignmentProps) {
  const { updateShiftAssignment } = useShiftsStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');

  useEffect(() => {
    // Subscribe to changes on the shift_assignments table
    const channel = supabase
      .channel('shift-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shift_assignments',
          filter: `shift_id=eq.${shift.shift_id}`, 
        },
        (payload) => {
          console.log('Shift updated via Trigger:', payload);
          onAssignmentUpdate(); 
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shift.shift_id, onAssignmentUpdate]);


  /* ---------- DERIVED ASSIGNMENTS (NO FETCH) ---------- */
  const assignedEmployees = useMemo(() => {
    return assignments.filter(
      a =>
        a.shift_id === shift.shift_id &&
        a.schedule_date === shift.schedule_date &&
        a.employee
    );
  }, [assignments, shift.shift_id, shift.schedule_date]);

  /* ---------- DEPARTMENTS ---------- */
  const departments = useMemo(() => {
    return Array.from(
      new Set(
        assignedEmployees
          .map(a => a.employee?.department)
          .filter(Boolean)
      )
    ).sort();
  }, [assignedEmployees]);

  /* ---------- FILTERED ---------- */
  const filteredAssignments = useMemo(() => {
    return assignedEmployees.filter(a => {
      const emp = a.employee!;
      const matchesSearch =
        emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.department?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDept =
        !selectedDepartment || emp.department === selectedDepartment;

      return matchesSearch && matchesDept;
    });
  }, [assignedEmployees, searchTerm, selectedDepartment]);

  /* ---------- DRAG END ---------- */
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    try {
      await updateShiftAssignment(active.id as string, {
        status: 'scheduled',
      });
      onAssignmentUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  /* ---------- STATUS UPDATE ---------- */
  const handleStatusUpdate = async (
    assignmentId: string,
    status: ShiftAssignmentType['status']
  ) => {
    try {
      await updateShiftAssignment(assignmentId, { status });
      onAssignmentUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      {/* HEADER */}
      <div className="mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          {shift.shift?.name}
        </h3>
        <p className="text-sm text-gray-500">
          {format(new Date(shift.schedule_date), 'MMMM d, yyyy')}
        </p>
        <p className="text-sm text-gray-500">
          {shift.shift?.start_time} – {shift.shift?.end_time}
        </p>
      </div>

      {/* SEARCH + FILTER */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
            placeholder="Search employees..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {departments.length > 0 && (
          <select
            className="w-full border rounded-md text-sm py-2"
            value={selectedDepartment}
            onChange={e => setSelectedDepartment(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ASSIGNMENTS */}
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={filteredAssignments.map(a => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {filteredAssignments.map(a => (
              <div
                key={a.id}
                className="flex justify-between items-center bg-gray-50 rounded p-3"
              >
                <SortableEmployee employee={a.employee as Employee} />

                <select
                  className={`text-sm border rounded-md px-2 py-1 ${
                    a.status === 'absent' 
                      ? 'border-red-300 text-red-700 bg-red-50' 
                      : 'border-gray-200 text-gray-700'
                  }`}
                  value={a.status}
                  onChange={e =>
                    handleStatusUpdate(
                      a.id,
                      e.target.value as ShiftAssignmentType['status']
                    )
                  }
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  {/* ADDED ABSENT OPTION */}
                  <option value="absent">Absent</option>
                </select>
              </div>
            ))}

            {filteredAssignments.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                No employees assigned
              </p>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* FOOTER */}
      <div className="mt-4 pt-4 border-t text-sm text-gray-500 space-y-1">
        <div className="flex justify-between">
          <span>Total Assigned</span>
          <span className="font-medium">{assignedEmployees.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Completed</span>
          <span className="text-green-600 font-medium">
            {assignedEmployees.filter(a => a.status === 'completed').length}
          </span>
        </div>
        {/* ADDED ABSENT COUNTER */}
        <div className="flex justify-between">
          <span>Absent</span>
          <span className="text-red-600 font-medium">
            {assignedEmployees.filter(a => a.status === 'absent').length}
          </span>
        </div>
      </div>
    </div>
  );
}