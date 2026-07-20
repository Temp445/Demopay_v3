import { useState, useEffect } from 'react';
import {
    Users, User, X, ChevronLeft, Mail, Phone, UserCheck,
    FileText, Send, CheckCircle, RefreshCw, History, Calendar, Check
} from 'lucide-react';
import { useVisitorStore } from '../../../stores/visitorStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useTenant } from '../../../contexts/TenantContext';
import type { VisitorWithDetails, VisitorFormData } from '../../../types/visitor';
import toast from 'react-hot-toast';
import { format, isToday } from 'date-fns';

interface VisitorQuickAddPanelProps {
    onClose: () => void;
}

export default function VisitorQuickAddPanel({ onClose }: VisitorQuickAddPanelProps) {
    const { currentTenant } = useTenant();
    const {
        visitors, loading,
        fetchVisitors, updateVisitorDetails, submitVisitorForApproval, clearAllVisitors,
        fetchVisitorSettings, settings,
    } = useVisitorStore();
    const { items: employees, fetchEmployees } = useEmployeesStore();

    const [selected, setSelected] = useState<VisitorWithDetails | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'status'>('pending');
    
    const [formData, setFormData] = useState<VisitorFormData>({
        visitor_name: '',
        email: '',
        phone_number: '',
        employee_to_visit: '',
        reason_for_visit: '',
    });

    useEffect(() => {
        if (currentTenant) {
            fetchVisitors(currentTenant.id);
            fetchEmployees();
            if (!settings) fetchVisitorSettings(currentTenant.id);
        }
    }, [currentTenant, fetchVisitors, fetchEmployees, fetchVisitorSettings, settings]);

    const handleClearAllStatus = async () => {
        if (!currentTenant) return;
        try {
            await clearAllVisitors(currentTenant.id);
            toast.success('All visitor statuses cleared');
        } catch (error) {
            toast.error('Failed to clear visitor statuses');
        }
    };

    // Pending visitors includes both brand new unknowns AND returning visitors who just clocked IN
    const pendingVisitors = visitors.filter(v => v.visitor_status === 'pending');

    const selectedEmployee = employees.find(e => e.id === formData.employee_to_visit);
    const filteredEmployees = employees.filter(
        e =>
            e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter visitors for status tab to only show today's visitors
    const todaysVisitorsStatus = visitors.filter(v => isToday(new Date(v.first_detected_at)));

    const getVisitorImage = (visitor: VisitorWithDetails) => {
        if (visitor.visitor_image) return visitor.visitor_image;
        if (visitor.visitor_image_data) {
            try {
                const blob = new Blob([visitor.visitor_image_data as any], { type: 'image/jpeg' });
                return URL.createObjectURL(blob);
            } catch { return null; }
        }
        return null;
    };

    const handleSelectVisitor = (visitor: VisitorWithDetails) => {
        setSelected(visitor);
        setFormData({
            visitor_name: visitor.visitor_name || '',
            email: visitor.email || '',
            phone_number: visitor.phone_number || '',
            employee_to_visit: visitor.employee_to_visit || '',
            reason_for_visit: visitor.reason_for_visit || '',
        });
        setSearchTerm('');
    };

    const handleSave = async () => {
        if (!selected || !formData.visitor_name) {
            toast.error('Please enter visitor name');
            return;
        }
        setSaving(true);
        try {
            await updateVisitorDetails(selected.id, formData);
            toast.success('Visitor details saved');
            if (currentTenant) fetchVisitors(currentTenant.id);
            // Don't auto-clear
        } catch {
            toast.error('Failed to save visitor details');
        } finally {
            setSaving(false);
        }
    };

    const handleSubmitApproval = async () => {
        if (!selected || !formData.visitor_name) {
            toast.error('Please enter visitor name');
            return;
        }
        setSaving(true);
        try {
            await updateVisitorDetails(selected.id, formData);
            await submitVisitorForApproval(selected.id);
            toast.success('Visitor submitted for approval');
            if (currentTenant) fetchVisitors(currentTenant.id);
            // Don't auto-clear
        } catch {
            toast.error('Failed to submit for approval');
        } finally {
            setSaving(false);
        }
    };

    // Settings-driven: hide Submit for Approval when approval is not required or automatic entry is enabled
    const requireApproval = settings?.require_employee_approval ?? true;
    const allowAutoEntry = settings?.allow_automatic_entry ?? false;
    const showApprovalButton = requireApproval && !allowAutoEntry;

    // Past Visits logic for the selected visitor
    const liveSelected = selected ? visitors.find(v => v.id === selected.id) || selected : null;
    const allVisits: any[] = (liveSelected as any)?.visits || [];
    const pastVisits = allVisits.filter(v => v.id !== liveSelected?.current_visit_id);
    const isReturning = liveSelected && liveSelected.visitor_name && liveSelected.visit_count > 1;

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
                {liveSelected ? (
                    <button
                        onClick={() => setSelected(null)}
                        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back to List
                    </button>
                ) : (
                    <div className="flex bg-slate-100/80 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 ${activeTab === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Pending
                            {pendingVisitors.length > 0 && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'pending' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                                    {pendingVisitors.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('status')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'status' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Status
                        </button>
                    </div>
                )}
                <div className="flex items-center gap-1">
                    {!liveSelected && (
                        <button
                            onClick={() => currentTenant && fetchVisitors(currentTenant.id)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-200"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-200"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {liveSelected ? (
                    /* ── Detail form ── */
                    <div className="p-4 md:p-5 space-y-6">
                        
                        {/* Profile Info & Stats */}
                        <div>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200 shadow-sm">
                                    {getVisitorImage(liveSelected) ? (
                                        <img src={getVisitorImage(liveSelected)!} alt="Visitor" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <User className="w-8 h-8 text-slate-300" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        {isReturning && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                                                <Check className="w-3 h-3" /> Returning
                                            </span>
                                        )}
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold capitalize border ${
                                            liveSelected.visitor_status === 'approved' ? 'bg-green-50 text-green-600 border-green-100' :
                                            liveSelected.visitor_status === 'pending' || liveSelected.visitor_status === 'verification_pending' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                            liveSelected.visitor_status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' :
                                            liveSelected.visitor_status === 'exited' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                            'bg-slate-50 text-slate-600 border-slate-100'
                                        }`}>
                                            {liveSelected.visitor_status.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 truncate">
                                        {liveSelected.visitor_name || 'Unregistered Face'}
                                    </h3>
                                </div>
                            </div>

                            {/* Returning Visitor Stats */}
                            {liveSelected.visitor_name && (
                                <div className="grid grid-cols-2 gap-3 mb-2">
                                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total Visits</p>
                                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                            <History className="w-3.5 h-3.5 text-slate-400" />
                                            {liveSelected.visit_count}
                                        </p>
                                    </div>
                                    {/* <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Last Visit</p>
                                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 truncate">
                                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                            {isToday(new Date(selected.last_visit_at)) ? 'Today' : format(new Date(selected.last_visit_at), 'MMM d, yy')}
                                        </p>
                                    </div> */}
                                </div>
                            )}
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-4 ">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                                Personal Information
                            </h4>
                            
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-slate-400" /> Visitor Name *
                                </label>
                                <input
                                    type="text"
                                    value={formData.visitor_name}
                                    onChange={e => setFormData({ ...formData, visitor_name: e.target.value })}
                                    disabled={!!liveSelected?.visitor_name}
                                    placeholder="Full name"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-100 disabled:cursor-not-allowed"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                        <Mail className="w-3.5 h-3.5 text-slate-400" /> Email
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        disabled={!!liveSelected?.email}
                                        placeholder="visitor@mail.com"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-100 disabled:cursor-not-allowed"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                        <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone_number}
                                        onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                                        disabled={!!liveSelected?.phone_number}
                                        placeholder="Phone number"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-100 disabled:cursor-not-allowed"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 pt-2">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                                Today's Visit Details
                            </h4>
                            
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                    <UserCheck className="w-3.5 h-3.5 text-slate-400" /> Employee to Visit
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={selectedEmployee?.name || searchTerm}
                                        onChange={e => {
                                            setSearchTerm(e.target.value);
                                            setShowDropdown(true);
                                            if (e.target.value === '') setFormData({ ...formData, employee_to_visit: '' });
                                        }}
                                        onFocus={() => setShowDropdown(true)}
                                        placeholder="Search employee"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                                    />
                                    {showDropdown && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, employee_to_visit: '' });
                                                    setSearchTerm('');
                                                    setShowDropdown(false);
                                                }}
                                                className="w-full px-3 py-2 text-left text-xs text-slate-400 italic hover:bg-slate-50"
                                            >
                                                — None —
                                            </button>
                                            {filteredEmployees.map(emp => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({ ...formData, employee_to_visit: emp.id });
                                                        setSearchTerm('');
                                                        setShowDropdown(false);
                                                    }}
                                                    className="w-full px-3 py-2 text-left hover:bg-slate-50 border-t border-slate-50 transition-colors"
                                                >
                                                    <div className="text-xs font-semibold text-slate-800">{emp.name}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{emp.employee_code}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-slate-400" /> Reason for Visit
                                </label>
                                <textarea
                                    value={formData.reason_for_visit}
                                    onChange={e => setFormData({ ...formData, reason_for_visit: e.target.value })}
                                    placeholder="Purpose of visit..."
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-shadow"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-slate-100">
                            <button
                                onClick={() => setSelected(null)}
                                className="flex-1 py-2.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors border border-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                            >
                                Save Details
                            </button>
                            {showApprovalButton && (
                                <button
                                    onClick={handleSubmitApproval}
                                    disabled={saving}
                                    className="flex-[2] py-2.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors shadow-sm shadow-green-600/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Submit Request
                                </button>
                            )}
                        </div>

                        {/* Past Visit History */}
                        {pastVisits.length > 0 && (
                            <div className="pt-6 border-t border-slate-100">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <History className="w-3.5 h-3.5" /> Past Visits
                                </h4>
                                <div className="space-y-2">
                                    {pastVisits.map((visit) => (
                                        <div key={visit.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="font-semibold text-slate-800 text-xs">
                                                    {format(new Date(visit.created_at), 'MMM d, yyyy')}
                                                </span>
                                                <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full capitalize whitespace-nowrap ${
                                                    visit.visitor_status === 'approved' ? 'bg-green-100 text-green-700' :
                                                    visit.visitor_status === 'exited' ? 'bg-slate-200 text-slate-600' :
                                                    visit.visitor_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                    'bg-gray-200 text-gray-700'
                                                }`}>
                                                    {visit.visitor_status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-slate-600">
                                                Visited: <span className="font-medium">{visit.employees?.name || 'N/A'}</span>
                                            </div>
                                            {visit.reason_for_visit && (
                                                <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                                    Reason: {visit.reason_for_visit}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                ) : (
                    /* ── List / Grid based on Tab ── */
                    <div className="p-3 md:p-4 h-full">
                        {activeTab === 'pending' ? (
                            <>
                                {loading && pendingVisitors.length === 0 ? (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                                    </div>
                                ) : pendingVisitors.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                                        <Users className="w-12 h-12 mb-3 opacity-20" />
                                        <p className="text-sm font-semibold text-slate-500">All caught up!</p>
                                        <p className="text-xs mt-1">New or returning visitors will appear here automatically when detected.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                                        {pendingVisitors.map(visitor => {
                                            const imgUrl = getVisitorImage(visitor);
                                            const isReturningGrid = !!visitor.visitor_name;
                                            
                                            return (
                                                <button
                                                    key={visitor.id}
                                                    onClick={() => handleSelectVisitor(visitor)}
                                                    className="group relative aspect-square bg-slate-50 rounded-2xl overflow-hidden hover:ring-4 hover:ring-blue-500/30 transition-all text-left border border-slate-200 shadow-sm"
                                                >
                                                    {imgUrl ? (
                                                        <img src={imgUrl} alt="Visitor" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <User className="w-10 h-10 text-slate-300" />
                                                        </div>
                                                    )}
                                                    
                                                    {/* Returning Badge */}
                                                    {isReturningGrid && (
                                                        <div className="absolute top-2 left-2">
                                                            <span className="bg-indigo-600/90 backdrop-blur text-white text-[9px] font-bold px-2 py-1 rounded-md shadow-sm border border-indigo-400/50 flex items-center gap-1">
                                                                <Check className="w-2.5 h-2.5" /> Returning
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Bottom Label Overlay */}
                                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-2 px-3">
                                                        <p className="text-white text-xs font-bold truncate drop-shadow-md">
                                                            {visitor.visitor_name || 'Unknown Face'}
                                                        </p>
                                                        <p className="text-white/70 text-[9px] drop-shadow-md mt-0.5">
                                                            {format(new Date(visitor.first_detected_at), 'HH:mm a')}
                                                        </p>
                                                    </div>

                                                    {/* Hover State overlay */}
                                                    <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                                        <div className="bg-white text-blue-900 p-2 rounded-full shadow-lg">
                                                            <FileText className="w-5 h-5" />
                                                        </div>
                                                        <span className="text-white text-xs font-bold drop-shadow-md">
                                                            Process Visit
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col h-full">
                                <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                                    <h4 className="text-xs font-bold text-slate-800">Today's Visitors</h4>
                                    {todaysVisitorsStatus.length > 0 && (
                                        <button
                                            onClick={handleClearAllStatus}
                                            className="text-[10px] font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-md transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pb-2">
                                    {loading && todaysVisitorsStatus.length === 0 ? (
                                        <div className="flex items-center justify-center py-10">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                                        </div>
                                    ) : todaysVisitorsStatus.length === 0 ? (
                                        <div className="text-center py-10 text-slate-400 text-sm">No visitors found for today.</div>
                                    ) : (
                                        todaysVisitorsStatus.map(visitor => {
                                            const imgUrl = getVisitorImage(visitor);
                                            const empInfo = employees.find(e => e.id === visitor.employee_to_visit);
                                        
                                        return (
                                            <div key={visitor.id} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:shadow-md transition-shadow">
                                                <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                                                    {imgUrl ? (
                                                        <img src={imgUrl} alt="Visitor" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <User className="w-5 h-5 text-slate-300" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-bold text-slate-800 truncate">
                                                        {visitor.visitor_name || <span className="text-slate-400 italic">Unknown</span>}
                                                    </h4>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <p className="text-[10px] text-slate-500 truncate">
                                                            {empInfo ? `Visiting: ${empInfo.name}` : visitor.reason_for_visit || 'No details'}
                                                        </p>
                                                    </div>
                                                    <p className="text-[9px] text-slate-400 mt-0.5">
                                                        {format(new Date(visitor.first_detected_at), 'hh:mm a')}
                                                    </p>
                                                </div>
                                                <div className="shrink-0" title={visitor.visitor_status === 'rejected' ? ((visitor as any).rejection_reason || 'No reason provided') : undefined}>
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[9px] font-bold capitalize border ${
                                                        visitor.visitor_status === 'approved' ? 'bg-green-50 text-green-600 border-green-100' :
                                                        visitor.visitor_status === 'pending' || visitor.visitor_status === 'verification_pending' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                        visitor.visitor_status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' :
                                                        visitor.visitor_status === 'exited' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                        visitor.visitor_status === 'exit_pending' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                        'bg-slate-50 text-slate-600 border-slate-100'
                                                    }`}>
                                                        {visitor.visitor_status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}