import React, { useState, useEffect } from 'react';
import { Plus, Filter, Download, Upload } from 'lucide-react';
import { format, subYears, addYears } from 'date-fns';
import HolidayCalendar from './HolidayCalendar';
import HolidayList from './HolidayList';
import HolidayForm from './HolidayForm';
import ImportModal from '../../ImportModal';
import { useHolidaysStore, type Holiday } from '../../../stores/holidaysStore';
import { importHolidays } from '../../../lib/import';
import { exportToCSV } from '../../../lib/export';
import { useAuth } from '../../../contexts/AuthContext';

export default function HolidaysPage() {
  const { user } = useAuth();
  const { items: holidays, loading, error, fetchHolidays, createHoliday, updateHoliday, deleteHoliday } = useHolidaysStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | undefined>();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadHolidays();
  }, []);

  const loadHolidays = async () => {
   const startDate = format(subYears(new Date(), 1), 'yyyy-MM-dd');
    const endDate = format(addYears(new Date(), 1), 'yyyy-MM-dd');
    await fetchHolidays(startDate, endDate);
  };

  const handleSave = async (holiday: Omit<Holiday, 'id' | 'created_at'>) => {
    try {
      if (selectedHoliday) {
        await updateHoliday(selectedHoliday.id, holiday);
      } else {
        await createHoliday(holiday);
      }
      await loadHolidays();
      setIsFormOpen(false);
      setSelectedHoliday(undefined);
    } catch (err) {
      throw err;
    }
  };

  const handleDelete = async (holiday: Holiday) => {
    if (!confirm('Are you sure you want to delete this holiday?')) return;

    try {
      await deleteHoliday(holiday.id);
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleImport = async (data: any[]) => {
    if (!user) throw new Error('User not authenticated');
    return await importHolidays(data, user.id);
  };

  const handleImportComplete = () => {
    loadHolidays();
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const filename = `holidays_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      
      const formattedData = holidays.map(holiday => ({
        'Holiday Name': holiday.name,
        'Date': format(new Date(holiday.date), 'MMM d, yyyy'),
        'Type': holiday.holiday_type === 'public' ? 'Public Holiday' : 'Company Holiday',
        'Description': holiday.description || '',
        'Recurring': holiday.is_recurring ? 'Yes' : 'No',
        'Created By': '' //holiday.created_by || ''
      }));

      await exportToCSV(formattedData, filename);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to export holidays');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Holidays</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage company holidays and public holidays
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </button>
            <button
              onClick={() => {
                setSelectedHoliday(undefined);
                setIsFormOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Holiday
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        <div className="mt-4">
          <HolidayCalendar
            holidays={holidays}
            selectedDate={selectedDate}
            onDateClick={setSelectedDate}
          />
        </div>

        <div className="mt-8">
          <HolidayList
            holidays={holidays}
            onEdit={(holiday) => {
              setSelectedHoliday(holiday);
              setIsFormOpen(true);
            }}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <HolidayForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedHoliday(undefined);
        }}
        onSave={handleSave}
        holiday={selectedHoliday}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          handleImportComplete();
        }}
        entityType="holidays"
        entityName="Holidays"
        onImport={handleImport}
      />
    </div>
  );
}