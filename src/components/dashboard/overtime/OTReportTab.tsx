import React, { useState } from 'react';
import { Calendar, Download, Filter } from 'lucide-react';
import { useOTApprovalsStore } from '../../../stores/otApprovalsStore';
import toast from 'react-hot-toast';
import { exportToCSV } from '../../../lib/export';

export default function OTReportTab() {
  const { approvals, loading, fetchApprovals } = useOTApprovalsStore();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModifiedOnly, setShowModifiedOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState('approved');

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select date range');
      return;
    }

    try {
      await fetchApprovals(startDate, endDate, statusFilter);
      toast.success('Report generated');
    } catch (error) {
      toast.error('Failed to generate report');
      console.error(error);
    }
  };

  const handleExport = () => {
    let dataToExport = approvals;

    if (showModifiedOnly) {
      dataToExport = approvals.filter(a =>
        a.correctedOTHours !== null && a.correctedOTHours !== undefined
      );
    }

    const exportData = dataToExport.map(a => ({
      'Employee Code': a.employeeCode,
      'Employee Name': a.employeeName,
      'Department': a.department || 'N/A',
      'Date': new Date(a.attendanceDate).toLocaleDateString(),
      'Original Hours': a.originalOTHours.toFixed(2),
      'Corrected Hours': a.correctedOTHours?.toFixed(2) || 'N/A',
      'Variance': a.correctedOTHours
        ? (a.correctedOTHours - a.originalOTHours).toFixed(2)
        : '0.00',
      'Modification Reason': a.modificationReason || 'N/A',
      'Status': a.approvalStatus,
      'Approved By': a.approvedByName || 'N/A',
      'Approved Date': a.approvedAt
        ? new Date(a.approvedAt).toLocaleDateString()
        : 'N/A',
    }));

    const filename = `ot_report_${startDate}_to_${endDate}.csv`;
    exportToCSV(exportData, filename);
    toast.success('Report exported');
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">OT Transaction Report</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="h-4 w-4 inline mr-1" />
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Filter className="h-4 w-4 inline mr-1" />
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Generate
            </button>
            <button
              onClick={handleExport}
              disabled={approvals.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              title="Export to CSV"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showModifiedOnly}
              onChange={(e) => setShowModifiedOnly(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Show modified records only</span>
          </label>
        </div>
      </div>

      {/* Report Table */}
      {approvals.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="font-medium">Report Results ({approvals.length} records)</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Original (hrs)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Corrected (hrs)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Variance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {approvals
                  .filter(a => !showModifiedOnly || (a.correctedOTHours !== null && a.correctedOTHours !== undefined))
                  .map((approval) => {
                    const variance = approval.correctedOTHours
                      ? approval.correctedOTHours - approval.originalOTHours
                      : 0;

                    return (
                      <tr key={approval.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{approval.employeeName}</div>
                          <div className="text-sm text-gray-500">{approval.employeeCode}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(approval.attendanceDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {approval.originalOTHours.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {approval.correctedOTHours?.toFixed(2) || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {variance !== 0 && (
                            <span className={variance > 0 ? 'text-green-600' : 'text-red-600'}>
                              {variance > 0 ? '+' : ''}{variance.toFixed(2)}
                            </span>
                          )}
                          {variance === 0 && '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                          {approval.modificationReason || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            approval.approvalStatus === 'approved' ? 'bg-green-100 text-green-800' :
                            approval.approvalStatus === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {approval.approvalStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {!loading && approvals.length === 0 && startDate && endDate && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No data found for the selected period</p>
        </div>
      )}
    </div>
  );
}
