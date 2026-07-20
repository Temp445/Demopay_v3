import { useState, useEffect } from 'react';
import {
    Users, User, X, ChevronLeft, Mail, Phone, UserCheck,
    FileText, Send, CheckCircle, RefreshCw, History, Calendar, Check,
    Clock, AlertCircle, LogOut, ShieldCheck, RotateCcw
} from 'lucide-react';
import { useVisitorStore } from '../../../stores/visitorStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useTenant } from '../../../contexts/TenantContext';
import type { VisitorWithDetails, VisitorFormData } from '../../../types/visitor';
import toast from 'react-hot-toast';
import { format, isToday } from 'date-fns';

// ── Props ────────────────────────────────────────────────────────────────────

interface VisitorDetailsModalProps {
    /** When used as a modal overlay from the captures page */
    isOpen?: boolean;
    onClose: () => void;
    /** Pre-selected visitor (passed from the captures page card click) */
    visitor?: VisitorWithDetails | null;
    /** Called after a successful update so the parent can refresh */
    onUpdate?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getVisitorImage(visitor: VisitorWithDetails | null) {
    if (!visitor) return null;
    if (visitor.visitor_image) return visitor.visitor_image;
    if (visitor.visitor_image_data) {
        try {
            const blob = new Blob([visitor.visitor_image_data as any], { type: 'image/jpeg' });
            return URL.createObjectURL(blob);
        } catch { return null; }
    }
    return null;
}

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'approved':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                    <CheckCircle className="h-3 w-3" /> Approved
                </span>
            );
        case 'rejected':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                    <AlertCircle className="h-3 w-3" /> Rejected
                </span>
            );
        case 'verification_pending':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
                    <ShieldCheck className="h-3 w-3" /> Pending Approval
                </span>
            );
        case 'exit_pending':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
                    <LogOut className="h-3 w-3" /> Exit Pending
                </span>
            );
        case 'exited':
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    <LogOut className="h-3 w-3" /> Exited
                </span>
            );
        default:
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    <Clock className="h-3 w-3" /> Pending Details
                </span>
            );
    }
}

// ── Read-Only Detail View ─────────────────────────────────────────────────────

function VisitorReadOnlyView({ visitor, onClose }: { visitor: VisitorWithDetails; onClose: () => void }) {
    const imgUrl = getVisitorImage(visitor);
    const isReturning = visitor.visitor_name && visitor.visit_count > 1;
    const allVisits: any[] = (visitor as any)?.visits || [];
    const pastVisits = allVisits.filter(v => v.id !== (visitor as any).current_visit_id);

    return (
        <div className="flex flex-col h-[80vh] bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-2 text-slate-800">
                    <User className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold">Visitor Details</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-200"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

                {/* Profile */}
                <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border-2 border-slate-200 shadow-sm">
                        {imgUrl ? (
                            <img src={imgUrl} alt="Visitor" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <User className="w-10 h-10 text-slate-300" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            {isReturning && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                                    <RotateCcw className="w-2.5 h-2.5" /> Returning
                                </span>
                            )}
                            <StatusBadge status={visitor.visitor_status} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 truncate">
                            {visitor.visitor_name || 'Unknown Visitor'}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            First detected: {format(new Date(visitor.first_detected_at), 'MMM d, yyyy · p')}
                        </p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Visits</p>
                        <p className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                            <History className="w-4 h-4 text-blue-400" />
                            {visitor.visit_count || 1}
                        </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Last Visit</p>
                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-blue-400" />
                            {visitor.last_visit_at
                                ? (isToday(new Date(visitor.last_visit_at)) ? 'Today' : format(new Date(visitor.last_visit_at), 'MMM d, yyyy'))
                                : 'N/A'}
                        </p>
                    </div>
                </div>

                {/* Contact Info */}
                <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                        Contact Information
                    </h4>
                    {visitor.email ? (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                            <div>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Email</p>
                                <p className="text-sm font-medium text-slate-700">{visitor.email}</p>
                            </div>
                        </div>
                    ) : null}
                    {visitor.phone_number ? (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                            <div>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Phone</p>
                                <p className="text-sm font-medium text-slate-700">{visitor.phone_number}</p>
                            </div>
                        </div>
                    ) : null}
                    {!visitor.email && !visitor.phone_number && (
                        <p className="text-xs text-slate-400 italic py-2">No contact info recorded.</p>
                    )}
                </div>

                {/* Visit Details */}
                <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                        Visit Details
                    </h4>
                    {visitor.employee_name ? (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
                            <div>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Visiting Employee</p>
                                <p className="text-sm font-medium text-slate-700">{visitor.employee_name}</p>
                            </div>
                        </div>
                    ) : null}
                    {visitor.reason_for_visit ? (
                        <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Reason for Visit</p>
                                <p className="text-sm font-medium text-slate-700">{visitor.reason_for_visit}</p>
                            </div>
                        </div>
                    ) : null}
                    {!visitor.employee_name && !visitor.reason_for_visit && (
                        <p className="text-xs text-slate-400 italic py-2">No visit details recorded.</p>
                    )}
                </div>

                {/* Past Visits */}
                {pastVisits.length > 0 && (
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5" /> Visit History
                        </h4>
                        <div className="space-y-2">
                            {pastVisits.map((visit) => (
                                <div key={visit.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-semibold text-slate-800 text-xs">
                                            {format(new Date(visit.created_at), 'MMM d, yyyy')}
                                        </span>
                                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full capitalize whitespace-nowrap ${visit.visitor_status === 'approved' ? 'bg-green-100 text-green-700' :
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
        </div>
    );
}

// ── Quick Add / Edit Panel (original functionality) ───────────────────────────

function VisitorQuickAddPanel({
    onClose,
    preSelectedVisitor,
    onUpdate,
}: {
    onClose: () => void;
    preSelectedVisitor?: VisitorWithDetails | null;
    onUpdate?: () => void;
}) {
    const { currentTenant } = useTenant();
    const {
        visitors, loading,
        fetchVisitors, updateVisitorDetails, submitVisitorForApproval,
        fetchVisitorSettings, settings,
    } = useVisitorStore();
    const { items: employees, fetchEmployees } = useEmployeesStore();

    const [selected, setSelected] = useState<VisitorWithDetails | null>(preSelectedVisitor ?? null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<VisitorFormData>({
        visitor_name: preSelectedVisitor?.visitor_name || '',
        email: preSelectedVisitor?.email || '',
        phone_number: preSelectedVisitor?.phone_number || '',
        employee_to_visit: preSelectedVisitor?.employee_to_visit || '',
        reason_for_visit: preSelectedVisitor?.reason_for_visit || '',
    });

    useEffect(() => {
        if (currentTenant) {
            fetchVisitors(currentTenant.id);
            fetchEmployees();
            if (!settings) fetchVisitorSettings(currentTenant.id);
        }
    }, [currentTenant, fetchVisitors, fetchEmployees, fetchVisitorSettings, settings]);

    // Keep `selected` in sync with the live store when a preSelectedVisitor is passed
    // (ensures the visits array and current_visit_id are always up-to-date)
    useEffect(() => {
        if (!preSelectedVisitor) return;
        const fresh = visitors.find(v => v.id === preSelectedVisitor.id);
        if (fresh) setSelected(fresh);
    }, [visitors, preSelectedVisitor]);

    // Pending visitors includes both brand new unknowns AND returning visitors who just clocked IN
    const pendingVisitors = visitors.filter(v => v.visitor_status === 'pending');

    const selectedEmployee = employees.find(e => e.id === formData.employee_to_visit);
    const filteredEmployees = employees.filter(
        e =>
            e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
            onUpdate?.();
            if (!preSelectedVisitor) setSelected(null);
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
            onUpdate?.();
            if (!preSelectedVisitor) setSelected(null);
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

    // All visits sorted newest-first; mark current visit separately
    const allVisits: any[] = [...((selected as any)?.visits || [])].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const currentVisitId = (selected as any)?.current_visit_id;
    const pastVisits = allVisits.filter((v: any) => v.id !== currentVisitId);
    const isReturning = selected && selected.visitor_name && selected.visit_count > 1;

    return (
        <div className="flex flex-col h-[80vh] bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
                {selected ? (
                    preSelectedVisitor ? (
                        // When opened from captures page via a pending visitor, show back to close
                        <div className="flex items-center gap-2 text-slate-800">
                            <Users className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-bold">Process Visit</span>
                        </div>
                    ) : (
                        <button
                            onClick={() => setSelected(null)}
                            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back to List
                        </button>
                    )
                ) : (
                    <div className="flex items-center gap-2 text-slate-800">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-bold">Pending Visitors</span>
                        {pendingVisitors.length > 0 && (
                            <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {pendingVisitors.length} Action{pendingVisitors.length > 1 ? 's' : ''} Required
                            </span>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-1">
                    {!selected && (
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
                {selected ? (
                    /* ── Detail form ── */
                    <div className="p-4 md:p-5 space-y-6">

                        {/* Profile Info & Stats */}
                        <div>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200 shadow-sm">
                                    {getVisitorImage(selected) ? (
                                        <img src={getVisitorImage(selected)!} alt="Visitor" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <User className="w-8 h-8 text-slate-300" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    {isReturning && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 mb-1.5">
                                            <Check className="w-3 h-3" /> Returning
                                        </span>
                                    )}
                                    <h3 className="text-lg font-bold text-slate-900 truncate">
                                        {selected.visitor_name || 'Unregistered Face'}
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Detected: {format(new Date(selected.first_detected_at), 'MMM d, p')}
                                    </p>
                                </div>
                            </div>

                            {/* Returning Visitor Stats */}
                            {selected.visitor_name && (
                                <div className="grid grid-cols-2 gap-3 mb-2">
                                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total Visits</p>
                                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                            <History className="w-3.5 h-3.5 text-slate-400" />
                                            {selected.visit_count}
                                        </p>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Last Visit</p>
                                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 truncate">
                                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                            {isToday(new Date(selected.last_visit_at)) ? 'Today' : format(new Date(selected.last_visit_at), 'MMM d, yy')}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-4">
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
                                    placeholder="Full name"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
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
                                        placeholder="visitor@mail.com"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
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
                                        placeholder="Phone number"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
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
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                            >
                                Save Details Only
                            </button>
                            {showApprovalButton && (
                                <button
                                    onClick={handleSubmitApproval}
                                    disabled={saving}
                                    className="flex-[2] py-2.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors shadow-sm shadow-green-600/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Submit for Approval
                                </button>
                            )}
                        </div>

                        {/* Visit History — always visible */}
                        <div className="pt-4 border-t border-slate-100">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <History className="w-3.5 h-3.5" />
                                Previous Visit History
                                {pastVisits.length > 0 && (
                                    <span className="ml-auto bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded-full">
                                        {pastVisits.length} past {pastVisits.length === 1 ? 'visit' : 'visits'}
                                    </span>
                                )}
                            </h4>
                            {pastVisits.length === 0 ? (
                                <div className="text-center py-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <p className="text-xs text-slate-400 font-medium">First time visitor — no previous history</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {pastVisits.map((visit: any) => (
                                        <div key={visit.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="font-semibold text-slate-800 text-xs">
                                                    {format(new Date(visit.created_at), 'MMM d, yyyy')}
                                                </span>
                                                <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full capitalize whitespace-nowrap ${visit.visitor_status === 'approved' ? 'bg-green-100 text-green-700' :
                                                        visit.visitor_status === 'exited' ? 'bg-slate-200 text-slate-600' :
                                                            visit.visitor_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                                visit.visitor_status === 'verification_pending' ? 'bg-yellow-100 text-yellow-700' :
                                                                    'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {(visit.visitor_status as string).replace(/_/g, ' ')}
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
                            )}
                        </div>
                    </div>
                ) : (
                    /* ── Visitor image grid ── */
                    <div className="p-3 md:p-4 h-full">
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
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Export — Smart Modal/Panel ──────────────────────────────────────────

export default function VisitorDetailsModal({
    isOpen,
    onClose,
    visitor,
    onUpdate,
}: VisitorDetailsModalProps) {
    // Determine if this is a non-pending visitor (read-only view) or a pending one (editable form)
    const isPending = !visitor || visitor.visitor_status === 'pending';

    // When used as a standalone panel (no isOpen prop), render inline
    if (isOpen === undefined) {
        if (visitor && !isPending) {
            return <VisitorReadOnlyView visitor={visitor} onClose={onClose} />;
        }
        return (
            <VisitorQuickAddPanel
                onClose={onClose}
                preSelectedVisitor={isPending ? visitor : null}
                onUpdate={onUpdate}
            />
        );
    }

    // When used as a modal overlay
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {visitor && !isPending ? (
                    <VisitorReadOnlyView visitor={visitor} onClose={onClose} />
                ) : (
                    <VisitorQuickAddPanel
                        onClose={onClose}
                        preSelectedVisitor={isPending ? visitor : null}
                        onUpdate={onUpdate}
                    />
                )}
            </div>
        </div>
    );
}