import React, { useState, useEffect, useMemo } from 'react';
import { Filter, Users, Calendar, Save, Copy, Search, AlertCircle, CheckSquare } from 'lucide-react';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useLeaveSettingsStore, EmployeeLeaveSetting } from '../../../stores/leaveSettingsStore';
import toast from 'react-hot-toast';
import MultiSelectDropdown from '../../ui/MultiSelectDropdown';

export default function LeaveConfigurationPage() {
    const { items: employees, fetchEmployees } = useEmployeesStore();
    const { getEmployeeSettings, upsertLeaveSettings, applySettingsToBalance, isLoading } = useLeaveSettingsStore();

    const [activeTab, setActiveTab] = useState<'applicable' | 'opening'>('applicable');

    // Data loaded from DB caching
    const [employeeSettingsCache, setEmployeeSettingsCache] = useState<Record<string, EmployeeLeaveSetting[]>>({});

    // ─────────────────────────────────────────────────────────────────────────────
    // Tab 1: Applicable Leave Days State
    // ─────────────────────────────────────────────────────────────────────────────
    const [appCadreFilter, setAppCadreFilter] = useState<string[]>([]);
    const [appDesignationFilter, setAppDesignationFilter] = useState<string[]>([]);
    const [appEmployeeFilter, setAppEmployeeFilter] = useState<string[]>([]);

    // What is currently being edited in the grid (represents the "Master Form" for the selected group)
    // We initialize it with the master default structure once we load an employee
    const [masterAppForm, setMasterAppForm] = useState<EmployeeLeaveSetting[]>([]);

    // ─────────────────────────────────────────────────────────────────────────────
    // Tab 2: Year-wise Opening Balance State
    // ─────────────────────────────────────────────────────────────────────────────
    const currentYear = new Date().getFullYear();
    const [openYear, setOpenYear] = useState(currentYear);
    const [openLeaveTypeId, setOpenLeaveTypeId] = useState('');
    const [openTargetType, setOpenTargetType] = useState<'all' | 'selective'>('all');
    const [openCadreFilter, setOpenCadreFilter] = useState<string[]>([]);
    const [openDesignationFilter, setOpenDesignationFilter] = useState<string[]>([]);
    const [openEmployeeFilter, setOpenEmployeeFilter] = useState<string[]>([]);
    const [bulkDays, setBulkDays] = useState('');

    // Grid state: maps employee_id -> { isApplicable, openingDays }
    const [openGridState, setOpenGridState] = useState<Record<string, {
        isApplicable: boolean;
        openingDays: number | null;
        original: EmployeeLeaveSetting | null;
    }>>({});

    // Load Initial Data
    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    // Active employees
    const activeEmployees = useMemo(() => employees.filter(e => e.status === 'Active'), [employees]);

    // ─────────────────────────────────────────────────────────────────────────────
    // Dependent Filter Options (Tab 1: Applicable)
    // ─────────────────────────────────────────────────────────────────────────────
    const appCadres = useMemo(() => Array.from(new Set(activeEmployees.map(e => e.cadre).filter(Boolean) as string[])), [activeEmployees]);

    const appDesignations = useMemo(() => {
        const filtered = appCadreFilter.length > 0
            ? activeEmployees.filter(e => e.cadre && appCadreFilter.includes(e.cadre))
            : activeEmployees;
        return Array.from(new Set(filtered.map(e => e.role).filter(Boolean) as string[]));
    }, [activeEmployees, appCadreFilter]);

    const appEmployeeOptions = useMemo(() => {
        return activeEmployees.filter(e => {
            if (appCadreFilter.length > 0 && (!e.cadre || !appCadreFilter.includes(e.cadre))) return false;
            if (appDesignationFilter.length > 0 && (!e.role || !appDesignationFilter.includes(e.role))) return false;
            return true;
        });
    }, [activeEmployees, appCadreFilter, appDesignationFilter]);

    // Cleanup stale selections if their parent filter changes
    useEffect(() => {
        setAppDesignationFilter(prev => prev.filter(d => appDesignations.includes(d)));
    }, [appDesignations]);

    useEffect(() => {
        const validIds = new Set(appEmployeeOptions.map(e => e.id));
        setAppEmployeeFilter(prev => prev.filter(id => validIds.has(id)));
    }, [appEmployeeOptions]);


    // ─────────────────────────────────────────────────────────────────────────────
    // Dependent Filter Options (Tab 2: Opening)
    // ─────────────────────────────────────────────────────────────────────────────
    const openCadres = useMemo(() => Array.from(new Set(activeEmployees.map(e => e.cadre).filter(Boolean) as string[])), [activeEmployees]);

    const openDesignations = useMemo(() => {
        const filtered = openCadreFilter.length > 0
            ? activeEmployees.filter(e => e.cadre && openCadreFilter.includes(e.cadre))
            : activeEmployees;
        return Array.from(new Set(filtered.map(e => e.role).filter(Boolean) as string[]));
    }, [activeEmployees, openCadreFilter]);

    const openEmployeeOptions = useMemo(() => {
        return activeEmployees.filter(e => {
            if (openCadreFilter.length > 0 && (!e.cadre || !openCadreFilter.includes(e.cadre))) return false;
            if (openDesignationFilter.length > 0 && (!e.role || !openDesignationFilter.includes(e.role))) return false;
            return true;
        });
    }, [activeEmployees, openCadreFilter, openDesignationFilter]);

    // Cleanup stale selections if their parent filter changes
    useEffect(() => {
        setOpenDesignationFilter(prev => prev.filter(d => openDesignations.includes(d)));
    }, [openDesignations]);

    useEffect(() => {
        const validIds = new Set(openEmployeeOptions.map(e => e.id));
        setOpenEmployeeFilter(prev => prev.filter(id => validIds.has(id)));
    }, [openEmployeeOptions]);

    // ─────────────────────────────────────────────────────────────────────────────
    // Applicable Logic (Tab 1)
    // ─────────────────────────────────────────────────────────────────────────────
    const filteredAppEmployees = useMemo(() => {
        return activeEmployees.filter(emp => {
            if (appCadreFilter.length > 0 && (!emp.cadre || !appCadreFilter.includes(emp.cadre))) return false;
            if (appDesignationFilter.length > 0 && (!emp.role || !appDesignationFilter.includes(emp.role))) return false;
            if (appEmployeeFilter.length > 0 && !appEmployeeFilter.includes(emp.id)) return false;
            return true;
        });
    }, [activeEmployees, appCadreFilter, appDesignationFilter, appEmployeeFilter]);

    // When the target group changes, try to load an existing config if they all share the exact same setup.
    // Otherwise, load a blank template based on the first employee's structure.
    useEffect(() => {
        if (activeTab === 'applicable' && activeEmployees.length > 0) {
            loadGroupConfigOrTemplate();
        }
    }, [activeTab, activeEmployees, filteredAppEmployees]);

    const loadGroupConfigOrTemplate = async () => {
        if (filteredAppEmployees.length === 0) {
            setMasterAppForm([]);
            return;
        }

        try {
            // Check if all selected employees share the EXACT same explicit setting
            // We only check if there are 50 or fewer selected to avoid massive API storms on "All Employees"
            if (filteredAppEmployees.length <= 50) {
                const allSettingsProms = filteredAppEmployees.map(emp => getEmployeeSettings(emp.id, currentYear));
                const allSettings = await Promise.all(allSettingsProms);

                if (allSettings.length > 0) {
                    const firstEmpSettings = allSettings[0];
                    let allMatch = true;

                    // Check if every other employee perfectly matches the first employee's effective config
                    for (let i = 1; i < allSettings.length; i++) {
                        const empSettings = allSettings[i];
                        for (const lt of firstEmpSettings) {
                            const matchLt = empSettings.find(s => s.leave_type_id === lt.leave_type_id);
                            if (!matchLt) { allMatch = false; break; }

                            const firstEffectiveApp = lt.priority_source !== 'not_applicable';
                            const matchEffectiveApp = matchLt.priority_source !== 'not_applicable';

                            const firstEffectiveDays = lt.priority_source === 'applicable_days' ? lt.applicable_days : null;
                            const matchEffectiveDays = matchLt.priority_source === 'applicable_days' ? matchLt.applicable_days : null;

                            if (firstEffectiveApp !== matchEffectiveApp || firstEffectiveDays !== matchEffectiveDays) {
                                allMatch = false; break;
                            }
                        }
                        if (!allMatch) break;
                    }

                    // If they all match perfectly, pre-fill the form with their exact config
                    if (allMatch) {
                        const prefilledForm = firstEmpSettings.map(s => ({
                            ...s,
                            is_applicable: s.priority_source !== 'not_applicable',
                            applicable_days: s.priority_source === 'applicable_days' ? s.applicable_days : null,
                        }));
                        setMasterAppForm(prefilledForm);
                        return;
                    }
                }
            }

            // Fallback: If no match or too many people, load the blank master template
            const emp = activeEmployees[0];
            const settings = await getEmployeeSettings(emp.id, currentYear);
            const blankForm = settings.map(s => ({
                ...s,
                is_applicable: true,
                applicable_days: null, // start blank (use master default)
            }));
            setMasterAppForm(blankForm);

        } catch (error) {
            console.error("Failed to load group config or template", error);
        }
    };

    const handleAppFormChange = (leaveTypeId: string, field: 'is_applicable' | 'applicable_days', value: any) => {
        setMasterAppForm(prev => prev.map(s =>
            s.leave_type_id === leaveTypeId ? { ...s, [field]: value } : s
        ));
    };

    const handleSaveAppConfig = async () => {
        if (filteredAppEmployees.length === 0) {
            toast.error("No employees selected");
            return;
        }

        // Build massive array of upserts
        const payload = [];
        for (const emp of filteredAppEmployees) {
            for (const lt of masterAppForm) {
                payload.push({
                    employee_id: emp.id,
                    leave_type_id: lt.leave_type_id,
                    is_applicable: lt.is_applicable,
                    applicable_days: lt.applicable_days
                });
            }
        }

        try {
            await upsertLeaveSettings(payload, null);

            // Force refresh balances for all these users
            const toastId = toast.loading(`Re-calculating balances for ${filteredAppEmployees.length} employees...`);
            for (const emp of filteredAppEmployees) {
                await applySettingsToBalance(emp.id, currentYear);
            }
            toast.success(`Configuration saved for ${filteredAppEmployees.length} employees`, { id: toastId });

            // Clear cache so it fetches fresh
            setEmployeeSettingsCache({});
        } catch (error: any) {
            toast.error(error.message || "Failed to save configuration");
        }
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Opening Balance Logic (Tab 2)
    // ─────────────────────────────────────────────────────────────────────────────

    // We need to know the available leave types to populate the dropdown
    // const availableLeaveTypes = useMemo(() => {
    //     if (masterAppForm.length > 0) return masterAppForm;
    //     // fallback if cache exists
    //     const anyValues = Object.values(employeeSettingsCache);
    //     if (anyValues.length > 0) return anyValues[0];
    //     return [];
    // }, [masterAppForm, employeeSettingsCache]);

    const availableLeaveTypes = useMemo(() => {
        let list: EmployeeLeaveSetting[] = [];

        if (masterAppForm.length > 0) {
            list = masterAppForm;
        } else {
            const anyValues = Object.values(employeeSettingsCache);
            if (anyValues.length > 0) list = anyValues[0];
        }

        // ❌ Remove LOP Leave Type
        return list.filter(l => l.leave_name?.toLowerCase() !== 'lop');
    }, [masterAppForm, employeeSettingsCache]);

    const filteredOpenEmployees = useMemo(() => {
        return activeEmployees.filter(emp => {
            if (openTargetType === 'selective') {
                if (openCadreFilter.length > 0 && (!emp.cadre || !openCadreFilter.includes(emp.cadre))) return false;
                if (openDesignationFilter.length > 0 && (!emp.role || !openDesignationFilter.includes(emp.role))) return false;
                if (openEmployeeFilter.length > 0 && !openEmployeeFilter.includes(emp.id)) return false;
            }
            return true;
        });
    }, [activeEmployees, openTargetType, openCadreFilter, openDesignationFilter, openEmployeeFilter]);

    // When tab 2 parameters change, load the grid data
    useEffect(() => {
        if (activeTab === 'opening' && openLeaveTypeId && filteredOpenEmployees.length > 0) {
            loadOpeningGrid();
        }
    }, [activeTab, openYear, openLeaveTypeId, filteredOpenEmployees.length, openTargetType]);

    const loadOpeningGrid = async () => {
        const newState: any = {};
        const promises = filteredOpenEmployees.map(async (emp) => {
            // Use cache if available for this year
            const cacheKey = `${emp.id}_${openYear}`;
            let settings = employeeSettingsCache[cacheKey];
            if (!settings) {
                settings = await getEmployeeSettings(emp.id, openYear);
                setEmployeeSettingsCache(prev => ({ ...prev, [cacheKey]: settings }));
            }

            const ltSetting = settings.find(s => s.leave_type_id === openLeaveTypeId);
            if (ltSetting) {
                newState[emp.id] = {
                    isApplicable: ltSetting.priority_source !== 'not_applicable',
                    openingDays: ltSetting.priority_source === 'opening_balance' ? ltSetting.opening_days : null,
                    original: ltSetting
                };
            }
        });

        await Promise.all(promises);
        setOpenGridState(newState);
    };

    // Handle setting a single user's grid value
    const handleOpenGridChange = (employeeId: string, field: 'isApplicable' | 'openingDays', value: any) => {
        setOpenGridState(prev => ({
            ...prev,
            [employeeId]: {
                ...prev[employeeId],
                [field]: value
            }
        }));
    };

    // Bulk Apply
    const handleBulkApplyOpening = () => {
        if (!bulkDays || isNaN(Number(bulkDays))) return;
        const val = Number(bulkDays);
        const newState = { ...openGridState };
        filteredOpenEmployees.forEach(emp => {
            if (newState[emp.id]) {
                newState[emp.id].openingDays = val;
                newState[emp.id].isApplicable = true;
            }
        });
        setOpenGridState(newState);
        toast.success(`Applied ${val} to grid`);
    };

    const handleSaveOpeningBalances = async () => {
        if (!openLeaveTypeId) return;
        if (Object.keys(openGridState).length === 0) return;

        const applicablePayload = [];
        const openingPayload = [];

        for (const emp of filteredOpenEmployees) {
            const state = openGridState[emp.id];
            if (!state) continue;

            const originallyApplicable = state.original ? state.original.priority_source !== 'not_applicable' : true;

            // If they turned off/on Applicability here, that updates the Applicable table too!
            if (state.isApplicable !== originallyApplicable) {
                applicablePayload.push({
                    employee_id: emp.id,
                    leave_type_id: openLeaveTypeId,
                    is_applicable: state.isApplicable,
                    applicable_days: state.original?.applicable_days || null
                });
            }

            // Always pass the opening days so it either inserts, updates, or deletes
            openingPayload.push({
                employee_id: emp.id,
                leave_type_id: openLeaveTypeId,
                year: openYear,
                opening_days: state.isApplicable ? state.openingDays : null
            });
        }

        try {
            await upsertLeaveSettings(
                applicablePayload.length > 0 ? applicablePayload : null,
                openingPayload
            );

            const toastId = toast.loading(`Updating balances for ${filteredOpenEmployees.length} employees...`);
            for (const emp of filteredOpenEmployees) {
                // Clear local cache for them
                const cacheKey = `${emp.id}_${openYear}`;
                setEmployeeSettingsCache(prev => {
                    const newCache = { ...prev };
                    delete newCache[cacheKey];
                    return newCache;
                });

                // Trigger DB balance recalculation
                await applySettingsToBalance(emp.id, openYear);
                
                // Manually overwrite the original in GridState so the UI immediately reflects it 
                // as "Saved" instead of waiting for a full React flush/reload
                setOpenGridState(prev => {
                     const cell = prev[emp.id];
                     if(!cell) return prev;
                     
                     const newPriority = !cell.isApplicable ? 'not_applicable' : (cell.openingDays !== null ? 'opening_balance' : (cell.original?.applicable_days !== null ? 'applicable_days' : 'master_default'));
                     
                     return {
                         ...prev,
                         [emp.id]: {
                             ...cell,
                             original: {
                                 ...cell.original!,
                                 priority_source: newPriority as any,
                                 opening_days: cell.isApplicable ? cell.openingDays : null,
                                 is_applicable: cell.isApplicable
                             }
                         }
                     }
                });
            }
            toast.success(`Balances saved successfully`, { id: toastId });
        } catch (error: any) {
            toast.error(error.message || "Failed to save balances");
        }
    };


    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 pb-20">
            {/* Header & Tabs */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
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
                        onClick={() => {
                            setActiveTab('opening');
                            if (availableLeaveTypes.length > 0 && !openLeaveTypeId) {
                                setOpenLeaveTypeId(availableLeaveTypes[0].leave_type_id);
                            }
                        }}
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
                            <Filter className="h-4 w-4" /> Target Group Selection
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Cadre</label>
                                <MultiSelectDropdown
                                    options={appCadres.map(c => ({ label: c, value: c }))}
                                    selected={appCadreFilter}
                                    onChange={setAppCadreFilter}
                                    allLabel="All Cadres"
                                    placeholder="Select Cadres..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Designation</label>
                                <MultiSelectDropdown
                                    options={appDesignations.map(d => ({ label: d, value: d }))}
                                    selected={appDesignationFilter}
                                    onChange={setAppDesignationFilter}
                                    allLabel="All Designations"
                                    placeholder="Select Designations..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Specific Employee(s)</label>
                                <MultiSelectDropdown
                                    options={appEmployeeOptions.map(e => ({
                                        label: e.name,
                                        value: e.id,
                                        sub: e.employee_code
                                    }))}
                                    selected={appEmployeeFilter}
                                    onChange={setAppEmployeeFilter}
                                    allLabel="All Employees"
                                    placeholder="Select Employees..."
                                />
                            </div>
                        </div>
                        <div className={`mt-3 flex items-center gap-2 text-sm px-3 py-1.5 rounded-md inline-flex ${filteredAppEmployees.length > 0 ? 'text-indigo-600 bg-indigo-50' : 'text-red-600 bg-red-50'}`}>
                            <Users className="h-4 w-4" />
                            <span>Matching Employees: <strong>{filteredAppEmployees.length}</strong></span>
                        </div>
                    </div>

                    {/* Bottom Grid */}
                    <div className="p-5">
                        <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Configure Leave Allocation</h2>

                        {masterAppForm.length > 0 ? (
                            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500">Leave Type</th>
                                            <th className="px-4 py-3 text-center font-medium text-gray-500">Is Applicable?</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500">Applicable Days <span className="text-xs text-gray-400 font-normal">(Leave blank to use default)</span></th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500">Master Default</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {/* {masterAppForm.map((lt) => ( */}
                                        {masterAppForm.filter(lt => lt.leave_name?.toLowerCase() !== 'lop')
                                            .map((lt) => (
                                            <tr key={lt.leave_type_id} className={!lt.is_applicable ? "bg-gray-50" : ""}>
                                                <td className={`px-4 py-3 font-medium ${!lt.is_applicable ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                                    {lt.leave_name}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={lt.is_applicable}
                                                        onChange={(e) => handleAppFormChange(lt.leave_type_id, 'is_applicable', e.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="number"
                                                        disabled={!lt.is_applicable}
                                                        placeholder="Use Default"
                                                        value={lt.applicable_days === null ? '' : lt.applicable_days}
                                                        onChange={(e) => handleAppFormChange(lt.leave_type_id, 'applicable_days', e.target.value === '' ? null : Number(e.target.value))}
                                                        className="w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-gray-500">{lt.master_default_days} days</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="py-8 text-center text-gray-500">Loading leave parameters...</div>
                        )}

                        <div className="mt-5 flex justify-end">
                            <button
                                onClick={handleSaveAppConfig}
                                disabled={isLoading || filteredAppEmployees.length === 0}
                                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 font-medium transition-colors shadow-sm"
                            >
                                <CheckSquare className="h-5 w-5" />
                                {isLoading ? 'Saving...' : `Apply Configuration to ${filteredAppEmployees.length} Employees`}
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
                                <select
                                    value={openYear}
                                    onChange={(e) => setOpenYear(Number(e.target.value))}
                                    className="pl-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-semibold"
                                >
                                    <option value={currentYear + 1}>{currentYear + 1}</option>
                                    <option value={currentYear}>{currentYear}</option>
                                    <option value={currentYear - 1}>{currentYear - 1}</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Leave Type</label>
                            <select
                                value={openLeaveTypeId}
                                onChange={(e) => setOpenLeaveTypeId(e.target.value)}
                                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium w-48"
                            >
                                {!openLeaveTypeId && <option value="">Select...</option>}
                                {availableLeaveTypes.map(lt => (
                                    <option key={lt.leave_type_id} value={lt.leave_type_id}>{lt.leave_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="h-8 border-l border-gray-300 mx-2 hidden sm:block"></div>

                        <div className="flex-1 min-w-[280px] bg-white p-3 rounded-md border border-gray-200 flex items-center justify-between gap-4">
                            <span className="text-sm font-medium text-gray-700">Bulk Apply:</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    placeholder="Days"
                                    value={bulkDays}
                                    onChange={(e) => setBulkDays(e.target.value)}
                                    className="w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                                <button
                                    onClick={handleBulkApplyOpening}
                                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                                >
                                    <Copy className="h-4 w-4" /> Apply Below
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Grid */}
                    <div className="p-5">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                            <div className="flex items-center gap-4">
                                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Employee Balances</h2>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="text-xs flex gap-3 text-gray-600 bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input type="radio" name="filter"
                                            checked={openTargetType === 'all'}
                                            onChange={() => setOpenTargetType('all')}
                                            className="text-indigo-600 focus:ring-indigo-500" />
                                        All Active ({activeEmployees.length})
                                    </label>
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input type="radio" name="filter"
                                            checked={openTargetType === 'selective'}
                                            onChange={() => setOpenTargetType('selective')}
                                            className="text-indigo-600 focus:ring-indigo-500" />
                                        Selective
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Sub-filters if Selective Mode is on */}
                        {openTargetType === 'selective' && (
                            <div className="bg-gray-50 p-4 rounded-md mb-4 flex flex-col sm:flex-row gap-4 sm:items-end border border-gray-100 mt-2">
                                <div className="w-full sm:w-1/4 min-w-[200px]">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Cadre</label>
                                    <MultiSelectDropdown
                                        options={openCadres.map(c => ({ label: c, value: c }))}
                                        selected={openCadreFilter}
                                        onChange={setOpenCadreFilter}
                                        allLabel="All Cadres"
                                        placeholder="Select Cadres..."
                                    />
                                </div>
                                <div className="w-full sm:w-1/4 min-w-[200px]">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Designation</label>
                                    <MultiSelectDropdown
                                        options={openDesignations.map(d => ({ label: d, value: d }))}
                                        selected={openDesignationFilter}
                                        onChange={setOpenDesignationFilter}
                                        allLabel="All Designations"
                                        placeholder="Select Designations..."
                                    />
                                </div>
                                <div className="w-full sm:w-1/3 min-w-[200px]">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Specific Employee(s)</label>
                                    <MultiSelectDropdown
                                        options={openEmployeeOptions.map(e => ({
                                            label: e.name,
                                            value: e.id,
                                            sub: e.employee_code
                                        }))}
                                        selected={openEmployeeFilter}
                                        onChange={setOpenEmployeeFilter}
                                        allLabel="All Employees"
                                        placeholder="Select Employees..."
                                    />
                                </div>
                                <span className="text-xs text-indigo-600 sm:ml-auto font-medium pb-2">Matches: {filteredOpenEmployees.length}</span>
                            </div>
                        )}

                        {openLeaveTypeId && filteredOpenEmployees.length > 0 ? (
                            <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[500px] overflow-y-auto relative">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3 text-center w-16 font-medium text-gray-500">Not Applicable</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500 w-32">Emp No</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500">Employee Name</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500 w-48">Override Opening Balance</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-500">Effective State Before Credit System</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {filteredOpenEmployees.map(emp => {
                                            const state = openGridState[emp.id];
                                            if (!state || !state.original) return null;

                                            // Calculate the live effective visual based on what is typed in
                                            let liveEffective = state.original.master_default_days;
                                            let liveSource = 'master_default';

                                            if (!state.isApplicable) {
                                                liveEffective = 0;
                                                liveSource = 'not_applicable';
                                            } else if (state.openingDays !== null && state.openingDays !== undefined) {
                                                liveEffective = state.openingDays;
                                                liveSource = 'opening_balance';
                                            } else if (state.original.applicable_days !== null) {
                                                liveEffective = state.original.applicable_days;
                                                liveSource = 'applicable_days';
                                            }

                                            return (
                                                <tr key={emp.id} className={!state.isApplicable ? "bg-red-50" : ""}>
                                                    <td className="px-4 py-2 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={!state.isApplicable}
                                                            onChange={(e) => handleOpenGridChange(emp.id, 'isApplicable', !e.target.checked)}
                                                            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 font-mono text-gray-600 text-xs">{emp.employee_code || '-'}</td>
                                                    <td className={`px-4 py-2 font-medium ${!state.isApplicable ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                                        {emp.name}
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="number"
                                                            disabled={!state.isApplicable}
                                                            placeholder={`Fallback: ${state.original.applicable_days !== null ? state.original.applicable_days : state.original.master_default_days}`}
                                                            value={state.openingDays === null ? '' : state.openingDays}
                                                            onChange={(e) => handleOpenGridChange(emp.id, 'openingDays', e.target.value === '' ? null : Number(e.target.value))}
                                                            className={`w-full rounded-md shadow-sm sm:text-sm 
                                ${!state.isApplicable ? 'bg-red-100/50 border-red-200 cursor-not-allowed text-transparent' :
                                                                    state.openingDays !== null ? 'border-green-400 bg-green-50 font-bold text-green-700 focus:border-green-500 focus:ring-green-500' :
                                                                        'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`font-bold ${liveSource === 'opening_balance' ? 'text-green-600' :
                                                                liveSource === 'applicable_days' ? 'text-blue-600' :
                                                                    liveSource === 'not_applicable' ? 'text-red-500' :
                                                                        'text-gray-600'
                                                                }`}>
                                                                {liveEffective}
                                                            </span>
                                                            {liveSource === 'opening_balance' && <span className="text-[10px] uppercase bg-green-100 px-1 rounded text-green-700 tracking-wider font-semibold">Yearly Override</span>}
                                                            {liveSource === 'applicable_days' && <span className="text-[10px] uppercase bg-blue-100 px-1 rounded text-blue-700 tracking-wider font-semibold">Emp Setting</span>}
                                                            {liveSource === 'master_default' && <span className="text-[10px] uppercase bg-gray-100 px-1 rounded text-gray-500 tracking-wider font-semibold">Default</span>}
                                                            {liveSource === 'not_applicable' && <span className="text-[10px] uppercase bg-red-100 px-1 rounded text-red-700 tracking-wider font-semibold">Disabled</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="py-12 border border-gray-200 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-500 bg-gray-50">
                                {!openLeaveTypeId ? "Select a Leave Type from the dropdown above to continue" : "No employees match the current filters"}
                            </div>
                        )}

                        <div className="mt-4 flex bg-blue-50 p-3 rounded-lg items-start gap-2 border border-blue-100">
                            <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-blue-700">
                                Data shown here is the <strong>starting base amount</strong> before any "Earned" or "Monthly" automated credits are applied by the system. If you override the opening balance, credits will accrue on top of your override.
                            </p>
                        </div>

                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                onClick={loadOpeningGrid}
                                disabled={isLoading}
                                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors"
                                title="Discard unsaved changes"
                            >
                                Reset Grid
                            </button>
                            <button
                                onClick={handleSaveOpeningBalances}
                                disabled={isLoading || !openLeaveTypeId || filteredOpenEmployees.length === 0}
                                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 font-medium text-sm transition-colors shadow-sm"
                            >
                                <Save className="h-4 w-4" />
                                {isLoading ? 'Saving...' : 'Save All Overrides for ' + openYear}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
