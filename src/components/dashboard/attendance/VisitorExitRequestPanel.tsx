import { useState, useEffect } from 'react';
import {
    Search, User, LogOut, Send, X, ChevronLeft,
    RefreshCw, Users, Mail, Phone, UserCheck, Clock,
    FileText, Save
} from 'lucide-react';
import { useVisitorStore } from '../../../stores/visitorStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useTenant } from '../../../contexts/TenantContext';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import type { VisitorWithDetails } from '../../../types/visitor';

interface VisitorExitRequestPanelProps {
    /** Shown inline inside FaceAttendancePage panel — no close chrome needed when embedded */
    onClose?: () => void;
}

export default function VisitorExitRequestPanel({ onClose }: VisitorExitRequestPanelProps) {
    const { currentTenant } = useTenant();
    const { visitors, loading, fetchVisitors } = useVisitorStore();
    const { items: employees, fetchEmployees } = useEmployeesStore();

    const [searchVisitor, setSearchVisitor] = useState('');
    const [selected, setSelected] = useState<VisitorWithDetails | null>(null);

    // Editable visitor fields
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editReason, setEditReason] = useState('');

    // Employee search state for the selected visitor
    const [empSearch, setEmpSearch] = useState('');
    const [showEmpDropdown, setShowEmpDropdown] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [sending, setSending] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (currentTenant) {
            fetchVisitors(currentTenant.id);
            fetchEmployees();
        }
    }, [currentTenant, fetchVisitors, fetchEmployees]);

    // Visitors who are currently approved (checked in) or already exit_pending
    const approvedVisitors = visitors.filter(
        v => v.visitor_status === 'approved' || v.visitor_status === 'exit_pending'
    );

    const filteredVisitors = approvedVisitors.filter(v => {
        const term = searchVisitor.toLowerCase();
        return (
            !term ||
            v.visitor_name?.toLowerCase().includes(term) ||
            v.email?.toLowerCase().includes(term) ||
            v.phone_number?.includes(term)
        );
    });

    const filteredEmployees = employees.filter(e =>
        empSearch === '' ||
        e.name?.toLowerCase().includes(empSearch.toLowerCase()) ||
        e.employee_code?.toLowerCase().includes(empSearch.toLowerCase()) ||
        e.email?.toLowerCase().includes(empSearch.toLowerCase())
    );

    const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

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
        // Pre-fill permanent identity fields from visitor record
        setEditName(visitor.visitor_name || '');
        setEditEmail(visitor.email || '');
        setEditPhone(visitor.phone_number || '');
        // Clear per-visit fields so staff fills them fresh for this visit
        setEditReason('');
        setSelectedEmployeeId('');
        setEmpSearch('');
        setShowEmpDropdown(false);
    };

    const handleBack = () => {
        setSelected(null);
        setEditName('');
        setEditEmail('');
        setEditPhone('');
        setEditReason('');
        setSelectedEmployeeId('');
        setEmpSearch('');
        setShowEmpDropdown(false);
    };

    /** Save visitor identity only (name, email, phone) — NOT employee or reason, those are per-visit */
    const handleSaveDetails = async () => {
        if (!selected || !currentTenant) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('attendance_visitor')
                .update({
                    visitor_name: editName.trim() || null,
                    email: editEmail.trim() || null,
                    phone_number: editPhone.trim() || null,
                })
                .eq('id', selected.id);

            if (error) {
                console.error('[SaveDetails] Error:', JSON.stringify(error));
                throw new Error(error.message || 'Could not save visitor details');
            }

            toast.success('Visitor info saved');
            fetchVisitors(currentTenant.id);
            // Reflect changes locally
            setSelected(prev => prev ? {
                ...prev,
                visitor_name: editName.trim() || prev.visitor_name,
                email: editEmail.trim() || prev.email,
                phone_number: editPhone.trim() || prev.phone_number,
            } : null);
        } catch (err: any) {
            console.error('[SaveDetails] Full error:', err);
            toast.error(err?.message || 'Failed to save details');
        } finally {
            setSaving(false);
        }
    };

    /** Save visitor identity + send exit confirmation request for THIS visit */
    const handleSaveAndSendExitRequest = async () => {
        if (!selected || !currentTenant) return;

        if (!selectedEmployeeId) {
            toast.error('Please select the employee this visitor is visiting');
            return;
        }

        setSending(true);
        try {
            const visitorName = editName.trim() || selected.visitor_name || 'A visitor';

            // 1. Save permanent visitor identity (name/email/phone) only
            const identityUpdate: Record<string, any> = {};
            if (editName.trim()) identityUpdate.visitor_name = editName.trim();
            if (editEmail.trim()) identityUpdate.email = editEmail.trim();
            if (editPhone.trim()) identityUpdate.phone_number = editPhone.trim();

            if (Object.keys(identityUpdate).length > 0) {
                const { error: saveError } = await supabase
                    .from('attendance_visitor')
                    .update(identityUpdate)
                    .eq('id', selected.id);

                if (saveError) {
                    console.error('[ExitRequest] Save identity failed:', JSON.stringify(saveError));
                    throw new Error(saveError.message || 'Could not save visitor info');
                }
            }

            // 2. Set visitor status to exit_pending on BOTH the profile and the current visit row
            if (selected.visitor_status !== 'exit_pending') {
                // Update the profile-level status
                const { error: statusError } = await supabase
                    .from('attendance_visitor')
                    .update({ visitor_status: 'exit_pending' })
                    .eq('id', selected.id);

                if (statusError) {
                    console.error('[ExitRequest] Status update failed:', JSON.stringify(statusError));
                    throw new Error(statusError.message || 'Could not update visitor status');
                }

                // Also update the current VISIT row's status (store reads status from here)
                const { data: latestVisit } = await supabase
                    .from('attendance_visitor_visits')
                    .select('id')
                    .eq('visitor_id', selected.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (latestVisit?.id) {
                    await supabase
                        .from('attendance_visitor_visits')
                        .update({ visitor_status: 'exit_pending' })
                        .eq('id', latestVisit.id);
                }
            }

            // 3. Insert exit notification for THIS visit's employee + reason
            const reason = editReason.trim();
            const { error: notifError } = await supabase
                .from('visitor_notifications')
                .insert({
                    tenant_id: currentTenant.id,
                    visitor_id: selected.id,
                    employee_id: selectedEmployeeId,
                    notification_type: 'confirmation_required',
                    message: `${visitorName} is requesting to exit.${
                        reason ? ` Visit reason: ${reason}.` : ''
                    } Please confirm.`,
                });

            if (notifError) {
                console.error('[ExitRequest] Notification insert failed:', JSON.stringify(notifError));
                throw new Error(notifError.message || 'Could not send notification');
            }

            toast.success(`Exit request sent for ${visitorName}`);
            fetchVisitors(currentTenant.id);
            handleBack();
        } catch (err: any) {
            console.error('[ExitRequest] Full error:', err);
            toast.error(err?.message || 'Failed to send exit request');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
                {selected ? (
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                    </button>
                ) : (
                    <div className="flex items-center gap-2 text-slate-700">
                        <LogOut className="w-4 h-4 text-orange-500" />
                        <span className="text-sm font-semibold">Send Exit Request</span>
                        {approvedVisitors.length > 0 && (
                            <span className="bg-orange-100 text-orange-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                                {approvedVisitors.length}
                            </span>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-1">
                    {!selected && (
                        <button
                            onClick={() => currentTenant && fetchVisitors(currentTenant.id)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {selected ? (
                    /* ── Visitor detail / edit form ── */
                    <div className="p-4 space-y-3">

                        {/* Visitor photo + visit meta */}
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                            <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                                {getVisitorImage(selected) ? (
                                    <img src={getVisitorImage(selected)!} alt="Visitor" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <User className="w-7 h-7 text-slate-400" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-slate-500">
                                    Visits: <span className="font-semibold text-slate-700">{selected.visit_count ?? 0}</span>
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    Last visit: {selected.last_visit_at ? format(new Date(selected.last_visit_at), 'MMM d, HH:mm') : '—'}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    Registered: {selected.created_at ? format(new Date(selected.created_at), 'MMM d, yyyy') : '—'}
                                </p>
                            </div>
                            {selected.visitor_status === 'exit_pending' && (
                                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
                                    <Clock className="w-3 h-3" /> Pending
                                </span>
                            )}
                        </div>

                        {/* ── Permanent identity fields ── */}
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider pt-1">Visitor Identity</p>

                        {/* Name */}
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                                <User className="w-3.5 h-3.5" /> Name
                            </label>
                            <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder="Visitor name"
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                                <Mail className="w-3.5 h-3.5" /> Email
                            </label>
                            <input
                                type="email"
                                value={editEmail}
                                onChange={e => setEditEmail(e.target.value)}
                                placeholder="visitor@email.com"
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                            />
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5" /> Phone
                            </label>
                            <input
                                type="tel"
                                value={editPhone}
                                onChange={e => setEditPhone(e.target.value)}
                                placeholder="Phone number"
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                            />
                        </div>

                        {/* Divider — This Visit section */}
                        <div className="border-t border-slate-100 pt-1">
                            <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-2">This Visit ✦ New each time</p>

                            {/* Employee selector */}
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                                    <UserCheck className="w-3.5 h-3.5" />
                                    Send request to employee *
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={selectedEmployee?.name || empSearch}
                                        onChange={e => {
                                            setEmpSearch(e.target.value);
                                            setShowEmpDropdown(true);
                                            if (e.target.value === '') setSelectedEmployeeId('');
                                        }}
                                        onFocus={() => setShowEmpDropdown(true)}
                                        placeholder="Search employee..."
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                    />
                                    {showEmpDropdown && (
                                        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                            {filteredEmployees.map(emp => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedEmployeeId(emp.id);
                                                        setEmpSearch('');
                                                        setShowEmpDropdown(false);
                                                    }}
                                                    className="w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                                                >
                                                    <div className="text-xs font-medium text-slate-800">{emp.name}</div>
                                                    <div className="text-[10px] text-slate-400">{emp.employee_code}</div>
                                                </button>
                                            ))}
                                            {filteredEmployees.length === 0 && (
                                                <p className="px-3 py-2 text-xs text-slate-400 italic">No employees found</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Reason for visit — per-visit, inside This Visit section */}
                            <div className="mt-3">
                                <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" /> Reason for Visit
                                </label>
                                <input
                                    type="text"
                                    value={editReason}
                                    onChange={e => setEditReason(e.target.value)}
                                    placeholder="Reason for this visit"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                />
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 pt-1">
                            {/* Save details only */}
                            <button
                                onClick={handleSaveDetails}
                                disabled={saving || sending}
                                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                            >
                                {saving ? (
                                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-slate-600" />
                                ) : (
                                    <Save className="w-3.5 h-3.5" />
                                )}
                                {saving ? 'Saving…' : 'Save Info'}
                            </button>

                            {/* Save + send exit request */}
                            <button
                                onClick={handleSaveAndSendExitRequest}
                                disabled={sending || saving || (!selectedEmployeeId && !selected.employee_to_visit)}
                                className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                            >
                                {sending ? (
                                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                                ) : (
                                    <Send className="w-3.5 h-3.5" />
                                )}
                                {sending ? 'Sending…' : 'Save & Send Exit'}
                            </button>
                        </div>

                        {selected.visitor_status === 'exit_pending' && (
                            <p className="text-xs text-amber-600 text-center">
                                ⚠ Exit request already pending for this visitor
                            </p>
                        )}
                    </div>
                ) : (
                    /* ── Visitor list ── */
                    <div className="p-3 space-y-3">
                        {/* Search bar */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search visitor name..."
                                value={searchVisitor}
                                onChange={e => setSearchVisitor(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                            />
                        </div>

                        {loading && approvedVisitors.length === 0 ? (
                            <div className="flex items-center justify-center py-10">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
                            </div>
                        ) : filteredVisitors.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400">
                                <Users className="w-10 h-10 mb-3 opacity-40" />
                                <p className="text-sm font-medium">
                                    {searchVisitor ? 'No visitors match your search' : 'No active visitors'}
                                </p>
                                <p className="text-xs mt-1">
                                    Only approved/checked-in visitors appear here
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredVisitors.map(visitor => {
                                    const imgUrl = getVisitorImage(visitor);
                                    const isPending = visitor.visitor_status === 'exit_pending';
                                    return (
                                        <button
                                            key={visitor.id}
                                            onClick={() => handleSelectVisitor(visitor)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all group border ${
                                                isPending
                                                    ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                                                    : 'bg-slate-50 border-slate-100 hover:bg-orange-50 hover:border-orange-200'
                                            }`}
                                        >
                                            <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-200 shrink-0">
                                                {imgUrl ? (
                                                    <img src={imgUrl} alt="Visitor" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <User className="w-6 h-6 text-slate-400" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-slate-800 truncate">
                                                    {visitor.visitor_name || 'Unknown Visitor'}
                                                </p>
                                                {visitor.employee_name && (
                                                    <p className="text-[10px] text-slate-500 truncate">
                                                        Visiting: {visitor.employee_name}
                                                    </p>
                                                )}
                                                <p className="text-[10px] text-slate-400">
                                                    {visitor.last_visit_at ? format(new Date(visitor.last_visit_at), 'MMM d, HH:mm') : '—'}
                                                </p>
                                            </div>
                                            {isPending ? (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 shrink-0">
                                                    Pending
                                                </span>
                                            ) : (
                                                <LogOut className="w-4 h-4 text-slate-300 group-hover:text-orange-500 transition-colors shrink-0" />
                                            )}
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
