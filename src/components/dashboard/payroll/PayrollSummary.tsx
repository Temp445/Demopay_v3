import React from 'react';
import { IndianRupee, Users, Clock, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { PayrollEntry } from '../../../stores/payrollStore';

interface PayrollSummaryProps {
  entries: PayrollEntry[];
  loading: boolean;
  error: string | null;
}

export default function PayrollSummary({ entries, loading, error }: PayrollSummaryProps) {

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[...Array(6)].map((_, index) => (
          <div key={index} className="bg-white rounded-lg p-6 shadow animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="text-sm text-red-700">{error}</div>
      </div>
    );
  }

  const totalPayroll = entries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);
  const totalEarnings = entries.reduce((sum, entry) => sum + (entry.base_salary + (entry.bonus || 0) + ((entry.overtime_hours || 0) * (entry.overtime_rate || 0))), 0);
  const totalDeductions = entries.reduce((sum, entry) => sum + (entry.deductions || 0), 0);
  const totalEmployees = entries.length;
  const totalOvertime = entries.reduce((sum, entry) => sum + ((entry.overtime_hours || 0) * (entry.overtime_rate || 0)), 0);
  const totalBonus = entries.reduce((sum, entry) => sum + (entry.bonus || 0), 0);

  const stats = [
    {
      name: 'Total Employees',
      value: totalEmployees.toString(),
      icon: Users,
    },
    {
      name: 'Total Earnings',
      value: `₹${totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: Wallet,
    },
    {
      name: 'Total Deductions',
      value: `₹${totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: TrendingDown,
    },
    {
      name: 'Total Payroll',
      value: `₹${totalPayroll.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: IndianRupee,
    },
    // {
    //   name: 'Total Overtime',
    //   value: `₹${totalOvertime.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    //   icon: Clock,
    // },
    // {
    //   name: 'Total Bonus',
    //   value: `₹${totalBonus.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    //   icon: TrendingUp,
    // },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {stats.map((item) => (
        <div
          key={item.name}
          className="relative bg-white pt-5 px-4  sm:pt-6 sm:px-6 rounded-lg overflow-hidden shadow"
        >
          <dt>
            <div className="absolute bg-indigo-500 rounded-md p-3">
              <item.icon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 text-sm font-medium text-gray-500 truncate">{item.name}</p>
          </dt>
          <dd className="ml-16 pb-6 flex items-baseline sm:pb-7">
            <p className="text-2xl font-semibold text-gray-900">{item.value}</p>
          </dd>
        </div>
      ))}
    </div>
  );
}