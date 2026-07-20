import React, { useState, useRef } from 'react';
import { X, Upload, Download, AlertCircle, CheckCircle, FileText, Table, Code } from 'lucide-react';
import { parseImportFile, ImportResult, generateSampleData, getFieldMappings } from '../lib/import';
import { exportToCSV } from '../lib/export';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  entityName: string;
  onImport: (data: any[]) => Promise<ImportResult>;
}

export default function ImportModal({
  isOpen,
  onClose,
  entityType,
  entityName,
  onImport
}: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setImportResult(null);
    setPreviewData(null);
    
    try {
      const data = await parseImportFile(selectedFile);
      setPreviewData(data.slice(0, 5)); // Show first 5 rows for preview
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  };

  const handleImport = async () => {
    if (!file || !previewData) return;
    
    try {
      setImporting(true);
      setError(null);
      
      const fullData = await parseImportFile(file);
      const result = await onImport(fullData);
      setImportResult(result);
      
      if (result.success) {
        // Clear file after successful import
        setFile(null);
        setPreviewData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadSample = () => {
    const sampleData = generateSampleData(entityType);
    const filename = `${entityType}_sample.csv`;
    exportToCSV(sampleData, filename);
  };

  const handleDownloadTemplate = () => {
    const fieldMappings = getFieldMappings(entityType);
    const templateData = [fieldMappings]; // Just headers
    const filename = `${entityType}_template.csv`;
    exportToCSV(templateData, filename);
  };

  const resetModal = () => {
    setFile(null);
    setPreviewData(null);
    setImportResult(null);
    setError(null);
    setImporting(false);
    setDragActive(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              onClick={handleClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Import {entityName}
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Upload a CSV, Excel, or JSON file to import {entityName.toLowerCase()} data.
              </p>

              {/* Download Templates */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Table className="h-4 w-4 mr-2" />
                  Download Template
                </button>
                <button
                  onClick={handleDownloadSample}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Download Sample Data
                </button>
              </div>

              {/* File Upload Area */}
              <div className="mt-6">
                <div
                  className={`relative border-2 border-dashed rounded-lg p-6 cursor-pointer ${
                    dragActive
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="mt-4">
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <span className="mt-2 block text-sm font-medium text-gray-900">
                          {file ? file.name : 'Drop files here or click to upload'}
                        </span>
                        <input
                          ref={fileInputRef}
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          accept=".csv,.xlsx,.xls,.json"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileSelect(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                      <p className="mt-1 text-xs text-gray-500">
                        CSV, Excel (.xlsx), or JSON files up to 10MB
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mt-4 rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{error}</h3>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Data */}
              {previewData && previewData.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-900">Data Preview (First 5 rows)</h4>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(previewData[0]).map((key) => (
                            <th
                              key={key}
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {previewData.map((row, index) => (
                          <tr key={index}>
                            {Object.values(row).map((value: any, cellIndex) => (
                              <td
                                key={cellIndex}
                                className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                              >
                                {value?.toString() || ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import Result */}
              {importResult && (
                <div className="mt-6">
                  <div className={`rounded-md p-4 ${
                    importResult.success ? 'bg-green-50' : 'bg-yellow-50'
                  }`}>
                    <div className="flex">
                      {importResult.success ? (
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-400" />
                      )}
                      <div className="ml-3">
                        <h3 className={`text-sm font-medium ${
                          importResult.success ? 'text-green-800' : 'text-yellow-800'
                        }`}>
                          Import {importResult.success ? 'Completed' : 'Completed with Errors'}
                        </h3>
                        <div className={`mt-2 text-sm ${
                          importResult.success ? 'text-green-700' : 'text-yellow-700'
                        }`}>
                          <p>Total records: {importResult.totalRecords}</p>
                          <p>Successful: {importResult.successfulRecords}</p>
                          <p>Failed: {importResult.failedRecords}</p>
                        </div>
                        
                        {importResult.errors.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-red-800">Errors:</h4>
                            <div className="mt-2 max-h-40 overflow-y-auto">
                              {importResult.errors.map((error, index) => (
                                <div key={index} className="text-sm text-red-700">
                                  Row {error.row}: {error.field && `${error.field} - `}{error.message}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {importResult.warnings.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-yellow-800">Warnings:</h4>
                            <div className="mt-2">
                              {importResult.warnings.map((warning, index) => (
                                <div key={index} className="text-sm text-yellow-700">
                                  {warning}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 sm:flex sm:flex-row-reverse">
                {previewData && !importResult && (
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {importing ? 'Importing...' : `Import ${entityName}`}
                  </button>
                )}
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                  onClick={handleClose}
                >
                  {importResult?.success ? 'Close' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}