import React, { useState } from 'react';
import { Filter, Users, Calendar, Save, CheckSquare, XSquare, Settings, AlertCircle, Copy, Search, ChevronDown } from 'lucide-react';

export default function LeaveSettingsDraft() {
    const [activeTab, setActiveTab] = useState<'applicable' | 'opening'>('applicable');

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4">

            {/* Header & Tabs */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Settings className="h-6 w-6 text-indigo-600" />
                        Leave Configuration
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Manage applicable leave days and year-wise opening balances</p>
                </div>

                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('applicable')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'applicable' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        Applicable Leave Days
                    </button>
                    <button
                        onClick={() => setActiveTab('opening')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'opening' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        Year-wise Opening Balance
                    </button>
                </div>
            </div>

            {activeTab === 'applicable' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Top Filter Section */}
                    <div className="p-5 bg-gray-50 border-b border-gray-200">
                        <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                            <Filter className="h-4 w-4" /> Target Employees
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Cadre</label>
                                <select className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                                    <option>All Cadres</option>
                                    <option>Permanent</option>
                                    <option>Trainee</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Designation</label>
                                <select className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                                    <option>All Designations</option>
                                    <option>Manager</option>
                                    <option>Developer</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Specific Employee</label>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                                    <input type="text" placeholder="Search employee..." className="w-full pl-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-md inline-flex">
                            <Users className="h-4 w-4" />
                            <span><strong>45</strong> employees match these filters</span>
                        </div>
                    </div>

                    {/* Bottom Grid */}
                    <div className="p-5">
                        <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Leave Assignment</h2>
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500">Leave Type</th>
                                        <th className="px-4 py-3 text-center font-medium text-gray-500">Is Applicable?</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500">Applicable Days</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500">Master Default (Ref)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-gray-900">Casual Leave (CL)</td>
                                        <td className="px-4 py-3 text-center"><input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                                        <td className="px-4 py-3"><input type="number" defaultValue={12} className="w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" /></td>
                                        <td className="px-4 py-3 text-gray-400">12 days</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-gray-900">Sick Leave (SL)</td>
                                        <td className="px-4 py-3 text-center"><input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                                        <td className="px-4 py-3"><input type="number" defaultValue={10} className="w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" /></td>
                                        <td className="px-4 py-3 text-gray-400">10 days</td>
                                    </tr>
                                    <tr className="bg-gray-50 disabled">
                                        <td className="px-4 py-3 font-medium text-gray-400">Earned Leave (EL)</td>
                                        <td className="px-4 py-3 text-center"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                                        <td className="px-4 py-3"><input type="number" disabled placeholder="0" className="w-24 bg-gray-100 rounded-md border-gray-200 text-gray-400 sm:text-sm cursor-not-allowed" /></td>
                                        <td className="px-4 py-3 text-gray-400">20 days</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-5 flex justify-end">
                            <button className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-md hover:bg-indigo-700 font-medium transition-colors shadow-sm">
                                <CheckSquare className="h-5 w-5" />
                                Apply to 45 Employees
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'opening' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Top Controls */}
                    <div className="p-5 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-6 items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Target Year</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <select className="pl-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-semibold">
                                    <option>2026</option>
                                    <option>2025</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Leave Type</label>
                            <select className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium">
                                <option>Casual Leave (CL)</option>
                                <option>Sick Leave (SL)</option>
                            </select>
                        </div>

                        <div className="h-8 border-l border-gray-300 mx-2"></div>

                        <div className="flex-1 min-w-[300px] bg-white p-3 rounded-md border border-gray-200 flex items-center gap-4">
                            <span className="text-sm font-medium text-gray-700">Bulk Apply:</span>
                            <div className="flex items-center gap-2">
                                <input type="number" placeholder="Days" className="w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                <button className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1">
                                    <Copy className="h-4 w-4" /> Apply to Grid
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Grid */}
                    <div className="p-5">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-4">
                                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Employee Balances</h2>
                                <div className="text-xs flex gap-3 text-gray-500 bg-gray-50 px-3 py-1 rounded border border-gray-100">
                                    <label className="flex items-center gap-1"><input type="radio" name="filter" defaultChecked className="text-indigo-600 focus:ring-indigo-500" /> All Employees (120)</label>
                                    <label className="flex items-center gap-1"><input type="radio" name="filter" className="text-indigo-600 focus:ring-indigo-500" /> Selective Filter</label>
                                </div>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                                <input type="text" placeholder="Find in grid..." className="pl-9 py-1.5 rounded-md border border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[400px]">
                            <table className="min-w-full divide-y divide-gray-200 text-sm sticky-header">
                                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-4 py-3 text-center w-16 font-medium text-gray-500">Not Applicable</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500">Employee Code</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500">Employee Name</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500 w-48">Override Opening Balance</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500">Effective Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    <tr>
                                        <td className="px-4 py-2 text-center"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                                        <td className="px-4 py-2 font-mono text-gray-600 text-xs">EMP001</td>
                                        <td className="px-4 py-2 font-medium text-gray-900">Anandan S</td>
                                        <td className="px-4 py-2">
                                            <input type="number" defaultValue={18} className="w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-indigo-50 font-bold text-indigo-700" />
                                        </td>
                                        <td className="px-4 py-2 text-green-600 font-bold flex items-center gap-1">18.0 <span className="text-[10px] uppercase bg-green-100 px-1 rounded text-green-700">Override</span></td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 text-center"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                                        <td className="px-4 py-2 font-mono text-gray-600 text-xs">EMP010</td>
                                        <td className="px-4 py-2 font-medium text-gray-900">Sridevi V</td>
                                        <td className="px-4 py-2">
                                            <input type="number" placeholder="12" className="w-full rounded-md border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-500" />
                                        </td>
                                        <td className="px-4 py-2 text-gray-600 flex items-center gap-1">12.0 <span className="text-[10px] uppercase bg-gray-100 px-1 rounded text-gray-500">Default</span></td>
                                    </tr>
                                    <tr className="bg-red-50">
                                        <td className="px-4 py-2 text-center"><input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" /></td>
                                        <td className="px-4 py-2 font-mono text-gray-500 text-xs">EMP014</td>
                                        <td className="px-4 py-2 font-medium text-gray-500 line-through">Somasundaram K</td>
                                        <td className="px-4 py-2">
                                            <input type="number" disabled placeholder="0" className="w-full rounded-md border-red-200 bg-red-100/50 shadow-sm sm:text-sm text-red-500 cursor-not-allowed" />
                                        </td>
                                        <td className="px-4 py-2 text-red-500 flex items-center gap-1">0 <span className="text-[10px] uppercase bg-red-100 px-1 rounded text-red-700">Not Applicable</span></td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 text-center"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                                        <td className="px-4 py-2 font-mono text-gray-600 text-xs">EMP015</td>
                                        <td className="px-4 py-2 font-medium text-gray-900">Selvaganesh N</td>
                                        <td className="px-4 py-2">
                                            <input type="number" defaultValue={14.5} className="w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-indigo-50 font-bold text-indigo-700" />
                                        </td>
                                        <td className="px-4 py-2 text-green-600 font-bold flex items-center gap-1">14.5 <span className="text-[10px] uppercase bg-green-100 px-1 rounded text-green-700">Override</span></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-4 flex bg-blue-50 p-3 rounded-lg flex items-start gap-2 border border-blue-100">
                            <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                            <p className="text-sm text-blue-700">
                                Balances saved here take priority. Empty inputs will fall back to Employee Applicable Days, then Master Default Days. Values are live immediately.
                            </p>
                        </div>

                        <div className="mt-5 flex justify-end gap-3">
                            <button className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors">
                                Cancel
                            </button>
                            <button className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 font-medium text-sm transition-colors shadow-sm">
                                <Save className="h-4 w-4" />
                                Save Year Balances
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
