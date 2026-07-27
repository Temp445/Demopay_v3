import React, { useState, useEffect } from 'react';
import { User, Camera, Check, AlertCircle, Trash2, X } from 'lucide-react';
import { databaseService, EmployeeFaceData } from '../../../lib/faceDetectionServices/faceDetectionDatabase';
import FaceRecognitionModal from './FaceRecognitionModal';
import { Employee } from '../../../lib/employees';

interface FaceEnrollmentCardProps {
  employee: Employee;
  onEnrollmentChange?: () => void;
}

export default function FaceEnrollmentCard({
  employee,
  onEnrollmentChange
}: FaceEnrollmentCardProps) {
  if (!employee || !employee.id) {
    return null;
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [faceData, setFaceData] = useState<EmployeeFaceData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    const checkEnrollment = async () => {
      try {
        setLoading(true);
        // Safely access the ID
        const data = await databaseService.getEmployeeFaceData(employee.id);
        setFaceData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check enrollment status');
      } finally {
        setLoading(false);
      }
    };

    if (employee?.id) {
      checkEnrollment();
    }
  }, [employee?.id]);

  const handleDeleteFaceData = async () => {
    if (!confirm('Are you sure you want to delete this face data? The employee will need to re-enroll.')) return;

    try {
      setIsDeleting(true);
      setError(null);
      const success = await databaseService.deleteEmployeeFaceData(employee.id);

      if (!success) throw new Error('Failed to delete face data from database.');

      setFaceData(null);
      if (onEnrollmentChange) onEnrollmentChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete face data');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEnrollmentSuccess = async () => {
    setIsModalOpen(false);
    const newData = await databaseService.getEmployeeFaceData(employee.id);
    setFaceData(newData);

    if (onEnrollmentChange) onEnrollmentChange();
  };

  return (
    <>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0 mt-0.5">
                {faceData?.image_url ? (
                  <img
                    src={faceData.image_url}
                    alt={`${employee?.name || 'Employee'} Face Data`}
                    onClick={() => setIsPreviewOpen(true)}
                    className="h-10 w-10 rounded-full object-cover border-2 border-indigo-100 cursor-pointer hover:opacity-80 transition-opacity ring-2 ring-transparent hover:ring-indigo-300"
                    title="Click to view full image"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-indigo-600" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-1.5">
                  <h3 className="text-base font-semibold text-gray-900 leading-tight">{employee?.name || 'Unknown Employee'}</h3>
                  {employee?.employee_code && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                      {employee.employee_code}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{employee?.departments?.name || 'No Department'}</p>
              </div>
            </div>

            <div className="flex-shrink-0">
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
              ) : faceData ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <Check className="h-3 w-3 mr-1" />
                  Enrolled
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  Not Enrolled
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="ml-3"><div className="text-sm text-red-700">{error}</div></div>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            {faceData && (
              <button
                type="button"
                onClick={handleDeleteFaceData}
                disabled={isDeleting}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Camera className="h-4 w-4 mr-2" />
              {faceData ? 'Update Face' : 'Enroll Face'}
            </button>
          </div>
        </div>

        {/* Render modal ONLY if employee data is safely present */}
        {isModalOpen && employee?.id && (
          <FaceRecognitionModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            employeeId={employee.id}
            employeeName={employee.name}
            tenantId={employee.tenant_id}
            mode="enroll"
            onSuccess={handleEnrollmentSuccess}
          />
        )}
      </div>

      {isPreviewOpen && faceData?.image_url && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-80 transition-opacity"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div className="relative flex justify-center">
            <button
              className="absolute -top-12 right-0 md:-right-12 text-gray-300 hover:text-white transition-colors"
              onClick={() => setIsPreviewOpen(false)}
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={faceData.image_url}
              alt={`${employee?.name || 'Employee'} Full Face Data`}
              className="rounded-lg shadow-2xl max-w-full max-h-[85vh] object-contain border-4 border-gray-800 bg-white"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}