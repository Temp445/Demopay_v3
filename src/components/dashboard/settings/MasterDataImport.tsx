import React, { useState } from 'react';
import { Upload, Download, FileText, Users, Calendar, Clock, DollarSign, Building2, UserCheck } from 'lucide-react';
import ImportModal from '../../ImportModal';
import { useAuth } from '../../../contexts/AuthContext';
import { 
  importEmployees, 
  importDepartments, 
  importRoles, 
  importLeaveTypes, 
  importHolidays, 
  importShifts, 
  importPayrollComponents,
  generateSampleData 
} from '../../../lib/import';
import { exportToCSV } from '../../../lib/export';

interface ImportEntity {
  key: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  importFunction: (data: any[], userId?: string) => Promise<any>;
  requiresUserId: boolean;
}

export default function MasterDataImport() {
  const { user } = useAuth();
  const [selectedEntity, setSelectedEntity] = useState<ImportEntity | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const importEntities: ImportEntity[] = [
    {
      key: 'employees',
      name: 'Employees',
      description: 'Import employee master data including personal information, department, and role assignments',
      icon: Users,
      importFunction: importEmployees,
      requiresUserId: true
    },
    {
      key: 'departments',
      name: 'Departments',
      description: 'Import organizational departments and their hierarchical structure',
      icon: Building2,
      importFunction: importDepartments,
      requiresUserId: false
    },
    {
      key: 'roles',
      name: 'Designations',
      description: 'Import job designations and position definitions used across the organization',
      icon: UserCheck,
      importFunction: importRoles,
      requiresUserId: false
    },
    {
      key: 'leave_types',
      name: 'Leave Types',
      description: 'Import leave type definitions including annual leave, sick leave, and custom leave types',
      icon: Calendar,
      importFunction: importLeaveTypes,
      requiresUserId: false
    },
    {
      key: 'holidays',
      name: 'Holidays',
      description: 'Import company and public holidays for payroll and attendance calculations',
      icon: Calendar,
      importFunction: importHolidays,
      requiresUserId: true
    },
    {
      key: 'shifts',
      name: 'Shifts',
      description: 'Import work shift definitions including timing, break duration, and shift types',
      icon: Clock,
      importFunction: importShifts,
      requiresUserId: false
    },
    {
      key: 'payroll_components',
      name: 'Payroll Components',
      description: 'Import salary and deduction components used in payroll calculations',
      icon: DollarSign,
      importFunction: importPayrollComponents,
      requiresUserId: false
    }
  ];

  const handleEntitySelect = (entity: ImportEntity) => {
    setSelectedEntity(entity);
    setIsImportModalOpen(true);
  };

  const handleImport = async (data: any[]) => {
    if (!selectedEntity) throw new Error('No entity selected');
    
    if (selectedEntity.requiresUserId && !user) {
      throw new Error('User not authenticated');
    }
    
    return await selectedEntity.importFunction(
      data, 
      selectedEntity.requiresUserId ? user?.id : undefined
    );
  };

  const handleDownloadSample = (entityKey: string) => {
    const sampleData = generateSampleData(entityKey);
    const filename = `${entityKey}_sample.csv`;
    exportToCSV(sampleData, filename);
  };

  return (
    <div className='bg-white p-6 rounded-lg shadow'>
      <h2 className="text-lg font-medium text-gray-900">Master Data Import</h2>
      <p className="mt-1 text-sm text-gray-500">
        Import master data from CSV, Excel, or JSON files. Download sample files to see the expected format.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {importEntities.map((entity) => (
          <div
            key={entity.key}
            className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-500 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <div>
              <span className="rounded-lg inline-flex p-3 bg-indigo-50 text-indigo-700 ring-4 ring-white">
                <entity.icon className="h-6 w-6" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-8">
              <h3 className="text-lg font-medium">
                <button
                  onClick={() => handleEntitySelect(entity)}
                  className="focus:outline-none"
                >
                  <span className="absolute inset-0" aria-hidden="true" />
                  {entity.name}
                </button>
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {entity.description}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => handleEntitySelect(entity)}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import
              </button>
              <button
                onClick={() => handleDownloadSample(entity.key)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Download className="h-4 w-4 mr-2" />
                Sample
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Import Guidelines */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <FileText className="h-5 w-5 text-blue-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Import Guidelines</h3>
            <div className="mt-2 text-sm text-blue-700">
              <ul className="list-disc pl-5 space-y-1">
                <li>Supported file formats: CSV, Excel (.xlsx), JSON</li>
                <li>Maximum file size: 10MB</li>
                <li>First row should contain column headers</li>
                <li>Required fields must not be empty</li>
                <li>Date format: YYYY-MM-DD (e.g., 2024-01-15)</li>
                <li>Time format: HH:MM (e.g., 09:00)</li>
                <li>Boolean values: true/false, yes/no, 1/0</li>
                <li>Download sample files to see the exact format required</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {selectedEntity && (
        <ImportModal
          isOpen={isImportModalOpen}
          onClose={() => {
            setIsImportModalOpen(false);
            setSelectedEntity(null);
          }}
          entityType={selectedEntity.key}
          entityName={selectedEntity.name}
          onImport={handleImport}
        />
      )}
    </div>
  );
}