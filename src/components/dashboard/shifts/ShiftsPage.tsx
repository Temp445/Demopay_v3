import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Filter, Upload } from 'lucide-react';
import { format, startOfWeek, endOfWeek, isSameDay, parseISO } from 'date-fns';

import ShiftCalendar from './ShiftCalendar';
import ShiftFilter from './ShiftFilter';
import ShiftAssignment from './ShiftAssignment';
import CreateShiftModal from './CreateShiftModal';
import AssignShiftModal from './AssignShiftModal';
import ShiftList from './ShiftList';
import ImportModal from '../../ImportModal';

import {
  ShiftAssignment as ShiftAssignmentType,
  Shift,
  useShiftsStore,
} from '../../../stores/shiftsStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { importShifts } from '../../../lib/import';

export default function ShiftsPage() {
  const { fetchShifts, assignments } = useShiftsStore();
  const { items: employees, fetchEmployees } = useEmployeesStore();

  /* -------------------- UI STATE -------------------- */
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [selectedShift, setSelectedShift] =
    useState<ShiftAssignmentType | null>(null);

  const [selectedShiftForAssignment, setSelectedShiftForAssignment] =
    useState<Shift | null>(null);

  const [focusedDate, setFocusedDate] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  /* -------------------- FILTERS -------------------- */
  const [filters, setFilters] = useState({
    startDate: format(startOfWeek(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfWeek(new Date()), 'yyyy-MM-dd'),
    department: '',
    status: '',
  });

  /* -------------------- INITIAL LOAD -------------------- */
  useEffect(() => {
    fetchEmployees();
    fetchShifts();
  }, [fetchEmployees, fetchShifts, lastRefresh]);

  /* -------------------- DERIVED DATA -------------------- */
  const availableEmployees = useMemo(
    () => employees.filter(e => e.status === 'Active'),
    [employees]
  );

  const shiftsForFocusedDate = useMemo(() => {
    if (!focusedDate) return [];

    return assignments.items.filter(s =>
      isSameDay(parseISO(s.schedule_date), focusedDate)
    );
  }, [focusedDate, assignments.items]);

  /* -------------------- HANDLERS -------------------- */
  const handleShiftClick = (shift: ShiftAssignmentType) => {
    setSelectedShift(shift);
    setFocusedDate(new Date(shift.schedule_date));
  };

  const handleAssignmentUpdate = () => {
    setSelectedShift(null);
    setLastRefresh(Date.now());
  };

  const handleAssignClick = (shift: Shift) => {
    setSelectedShiftForAssignment(shift);
    setIsAssignModalOpen(true);
  };

  const handleImport = async (rows: any[]) => {
    return await importShifts(rows);
  };

  const handleImportComplete = () => {
    setIsImportModalOpen(false);
    setLastRefresh(Date.now());
  };

  /* -------------------- RENDER -------------------- */
  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Shift Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage and assign shifts, view schedules, and handle shift swaps.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Shift
            </button>
          </div>
        </div>

        {/* FILTERS */}
        {isFiltersOpen && (
          <div className="mt-4">
            <ShiftFilter
              filters={filters}
              onFilterChange={setFilters}
            />
          </div>
        )}

        {/* LIST */}
        <div className="mt-4">
          <ShiftList
            lastRefresh={lastRefresh}
            onRefresh={() => setLastRefresh(Date.now())}
            onAssignClick={handleAssignClick}
          />
        </div>

        {/* CALENDAR + ASSIGNMENTS */}
        <div
          className={`mt-8 grid gap-4 ${
            selectedShift || focusedDate
              ? 'grid-cols-1 lg:grid-cols-3'
              : 'grid-cols-1'
          }`}
        >
          <div className="lg:col-span-2">
            <ShiftCalendar
              onShiftClick={handleShiftClick}
              focusedDate={focusedDate}
              onClearFocus={() => {
                setFocusedDate(null);
                setSelectedShift(null);
              }}
            />
          </div>

          {(selectedShift || focusedDate) && (
            <div className="space-y-4">
              {selectedShift ? (
                <ShiftAssignment
                  shift={selectedShift}
                  assignments={assignments.items}
                  availableEmployees={availableEmployees}
                  onAssignmentUpdate={handleAssignmentUpdate}
                />
              ) : (
                shiftsForFocusedDate.map(shift => (
                  <ShiftAssignment
                    key={shift.id}
                    shift={shift}
                    assignments={assignments.items}
                    availableEmployees={availableEmployees}
                    onAssignmentUpdate={handleAssignmentUpdate}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      <CreateShiftModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onShiftCreated={() => setLastRefresh(Date.now())}
      />

      {selectedShiftForAssignment && (
        <AssignShiftModal
          shift={selectedShiftForAssignment}
          isOpen={isAssignModalOpen}
          onClose={() => {
            setIsAssignModalOpen(false);
            setSelectedShiftForAssignment(null);
          }}
          onAssignmentComplete={() => {
            setIsAssignModalOpen(false);
            setSelectedShiftForAssignment(null);
            setLastRefresh(Date.now());
          }}
        />
      )}

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={handleImportComplete}
        entityType="shifts"
        entityName="Shifts"
        onImport={handleImport}
      />
    </div>
  );
}
