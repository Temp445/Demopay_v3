import sys
import re

file_path = 'c:/Users/nithi/Desktop/Clones/Demopay_v3/src/components/dashboard/location/TravelAllowanceTab.tsx'

with open(file_path, 'r', encoding='utf8') as f:
    content = f.read()

target_start_re = r"  const renderJourneyGroup = \(group: JourneyGroup, tabType: 'pending' \| 'approved' \| 'rejected'\) => \{"
target_end_re = r"\s*\{\/\* --- Bulk Action Floating Bar --- \*\/\}"

start_match = re.search(target_start_re, content)
end_match = re.search(target_end_re, content)

if not start_match or not end_match:
    print(f"Indices not found. start: {bool(start_match)}, end: {bool(end_match)}")
    sys.exit(1)

start_index = start_match.start()
end_index = end_match.start()

new_content = r'''  const renderJourneyGroup = (group: JourneyGroup, tabType: 'pending' | 'approved' | 'rejected') => {
    const isPending = tabType === 'pending';
    const isRejected = tabType === 'rejected';
    const isApproved = tabType === 'approved';

    return (
      <div key={group.id} className="bg-white rounded-3xl p-6 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] border border-gray-100 hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)] transition-all duration-300 mb-6 group/card">
        <div className="flex flex-col gap-6">
          {/* Group Header */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-50">
            <div className="flex items-center gap-4">
              <div className={lex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center font-bold text-base shadow-inner }>
                {group.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900 group-hover/card:text-indigo-600 transition-colors">{group.employeeName}</h3>
                {group.employeeCode && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[10px] font-bold border border-gray-200/60 shadow-sm">
                    ID: {group.employeeCode}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 font-medium">{group.employeeEmail}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100/50 text-indigo-700 rounded-xl text-xs font-bold shadow-sm">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(group.date), 'MMM d, yyyy')}
            </span>
            {group.startTime && group.endTime && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold shadow-sm">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                {calculateDuration(group.startTime, group.endTime)}
              </span>
            )}
            <span className="inline-flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl text-xs font-bold shadow-sm">
              {group.works.length} location{group.works.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Location Cards */}
        <div className="space-y-4">
          {group.works.map(work => (
            <div
              key={work.id}
              className={ounded-2xl border p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 }
            >
              <div className={bsolute left-0 top-0 bottom-0 w-1.5 } />

              <div className="flex-1 pl-4">
                <div className="flex items-start gap-3 mb-3">
                  {isPending && (
                    <button
                      onClick={() => toggleSelectWork(work.id)}
                      className={lex-shrink-0 mt-0.5 transition-all duration-200 hover:scale-110 }
                      title={selectedWorkIds.has(work.id) ? 'Deselect' : 'Select for bulk approval'}
                    >
                      {selectedWorkIds.has(work.id)
                        ? <CheckSquare className="h-5 w-5 drop-shadow-sm" />
                        : <Square className="h-5 w-5" />}
                    </button>
                  )}
                  <div className={p-2 rounded-xl shrink-0 shadow-sm }>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-base">{work.location_name}</div>
                    {work.formatted_address && (
                      <div className="text-sm text-gray-500 mt-1 line-clamp-1">{work.formatted_address}</div>
                    )}
                  </div>
                </div>
                <div className="ml-12 flex flex-wrap items-center gap-3 text-xs font-semibold">
                  <div className="flex items-center gap-1.5 text-gray-600 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{work.started_at && work.completed_at ? calculateDuration(work.started_at, work.completed_at) : 'N/A'}</span>
                  </div>
                  {work.work_amount != null && Number(work.work_amount) > 0 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg">
                      ?{Number(work.work_amount).toLocaleString('en-IN')} Allowance
                    </span>
                  )}
                  <span className={px-3 py-1 rounded-lg border }>
                    {work.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0 border-t xl:border-t-0 pt-4 xl:pt-0 border-gray-100">
                {isPending && (
                  <button
                    onClick={() => handleOpenApproval(work)}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 hover:-translate-y-0.5"
                  >
                    <CheckCircle className="h-4 w-4" /> Approve
                  </button>
                )}
                {!isPending && !isRejected && (
                  <button
                    onClick={() => handleOpenDetails(work)}
                    className="p-2 text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-500 border border-blue-100 rounded-xl transition-all shadow-sm hover:shadow-md"
                    title="Edit Amount"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                )}
                {isRejected && (
                  <button
                    onClick={() => handleOpenDetails(work)}
                    className="p-2 text-gray-600 hover:text-white bg-gray-50 hover:bg-gray-600 border border-gray-200 rounded-xl transition-all shadow-sm hover:shadow-md"
                    title="View Details"
                  >
                    <AlignLeft className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => { setSelectedWork(work); setShowMapModal(true); }}
                  className="p-2 text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-500 border border-indigo-100 rounded-xl transition-all shadow-sm hover:shadow-md"
                  title="View Map"
                >
                  <MapIcon className="h-4 w-4" />
                </button>
                {isPending && (
                  <button
                    onClick={() => { setSelectedWork(work); setShowTimelineModal(true); }}
                    className="p-2 text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-500 border border-purple-100 rounded-xl transition-all shadow-sm hover:shadow-md"
                    title="Timeline"
                  >
                    <History className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => { setSelectedWork(work); setShowViolationsModal(true); }}
                  className="p-2 text-orange-600 hover:text-white bg-orange-50 hover:bg-orange-500 border border-orange-100 rounded-xl transition-all shadow-sm hover:shadow-md"
                  title="Violations"
                >
                  <AlertTriangle className="h-4 w-4" />
                </button>
                {isPending && (
                  <button
                    onClick={() => { setSelectedWork(work); setDenyReason(''); setShowDenyModal(true); }}
                    className="p-2 text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-500 border border-rose-100 rounded-xl transition-all shadow-sm hover:shadow-md"
                    title="Deny"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* --- Tab Bar + Search --- */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4 mt-2">
        <div className="flex gap-1.5 p-1.5 bg-gray-100/80 backdrop-blur-md rounded-2xl w-fit shadow-inner border border-gray-200/50">
        <button
          onClick={() => handleTabChange('pending')}
          className={lex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 }
        >
          <span className={w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors }>{completedWorks.length}</span>
          Pending Approval
        </button>
        <button
          onClick={() => handleTabChange('approved')}
          className={lex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 }
        >
          <span className={w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors }>{approvedWorks.length}</span>
          Approved
        </button>
        <button
          onClick={() => handleTabChange('rejected')}
          className={lex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 }
        >
          <span className={w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors }>{rejectedWorks.length}</span>
          Rejected
        </button>
        </div>
        {/* Search Bar */}
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPendingPage(1); setApprovedPage(1); setRejectedPage(1); }}
            placeholder="Search by employee, location..."
            className="pl-10 pr-10 py-2.5 text-sm border-2 border-gray-100 rounded-2xl bg-white shadow-sm hover:border-gray-200 focus:outline-none focus:ring-0 focus:border-indigo-500 w-72 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setPendingPage(1); setApprovedPage(1); setRejectedPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1 rounded-full transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* --- Tab Content --- */}
      <div className="space-y-6">

        {/* PENDING TAB */}
        {activeTab === 'pending' && (
          <>
            {completedWorks.length === 0 ? (
              <div className="text-center py-24 px-6 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                  <CheckCircle className="h-10 w-10 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">All caught up!</h3>
                <p className="text-gray-500 text-base font-medium">No work assignments are waiting for your review.</p>
              </div>
            ) : (
              <>
                {/* Select All bar */}
                <div className="flex items-center justify-between px-6 py-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2.5 text-sm font-bold text-gray-700 hover:text-amber-700 transition-colors"
                  >
                    {selectedWorkIds.size === completedWorks.length && completedWorks.length > 0
                      ? <CheckSquare className="h-5 w-5 text-amber-500 drop-shadow-sm" />
                      : <Square className="h-5 w-5 text-gray-400" />}
                    {selectedWorkIds.size === completedWorks.length && completedWorks.length > 0
                      ? 'Deselect All'
                      : Select All ()}
                  </button>
                  {selectedWorkIds.size > 0 && (
                    <span className="text-sm text-amber-800 font-bold bg-gradient-to-r from-amber-100 to-amber-200 px-4 py-1.5 rounded-full shadow-sm">
                      {selectedWorkIds.size} selected
                    </span>
                  )}
                </div>
                {paginatedPendingGroups.map(group => renderJourneyGroup(group, 'pending'))}
                {renderPagination(
                  pendingPage,
                  pendingTotalPages,
                  () => setPendingPage(p => Math.max(1, p - 1)),
                  () => setPendingPage(p => Math.min(pendingTotalPages, p + 1))
                )}
              </>
            )}
          </>
        )}

        {/* APPROVED TAB */}
        {activeTab === 'approved' && (() => {
          const totalApprovedAmount = approvedWorks.reduce((sum, w) => sum + (Number(w.work_amount) || 0), 0);
          const uniqueApprovedEmployees = new Set(approvedWorks.map(w => w.employee_id)).size;
          const approvedWithAmount = approvedWorks.filter(w => Number(w.work_amount) > 0).length;
          return (
            <>
              {approvedWorks.length === 0 ? (
                <div className="text-center py-24 px-6 bg-white rounded-3xl border border-gray-100 shadow-sm">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                    <CheckCircle className="h-10 w-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No approved work yet</h3>
                  <p className="text-gray-500 text-base font-medium">Approved work assignments will appear here.</p>
                </div>
              ) : (
                <>
                  {/* --- Stats Bar --- */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="flex flex-col items-center justify-center py-6 px-4 bg-white rounded-2xl shadow-sm border border-emerald-100">
                      <div className="text-3xl font-extrabold text-gray-900">{uniqueApprovedEmployees}</div>
                      <div className="text-sm font-bold text-gray-500 mt-1 flex items-center gap-1.5">
                        <User className="h-4 w-4 text-emerald-500" /> Employees
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center py-6 px-4 bg-white rounded-2xl shadow-sm border border-emerald-100">
                      <div className="text-3xl font-extrabold text-gray-900">{approvedWorks.length}</div>
                      <div className="text-sm font-bold text-gray-500 mt-1 flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4 text-emerald-500" /> Approvals
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center py-6 px-4 bg-gradient-to-br from-emerald-50 to-teal-100 rounded-2xl shadow-sm border border-emerald-200">
                      <div className="text-3xl font-extrabold text-emerald-700">
                        ?{totalApprovedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-sm font-bold text-emerald-700/80 mt-1 flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-500 font-bold">?</span> Total Allowance
                        </div>
                        {approvedWithAmount < approvedWorks.length && (
                          <span className="text-emerald-600/70 text-xs font-semibold">({approvedWorks.length - approvedWithAmount} without amount)</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {paginatedApprovedGroups.map(group => renderJourneyGroup(group, 'approved'))}
                  {renderPagination(
                    approvedPage,
                    approvedTotalPages,
                    () => setApprovedPage(p => Math.max(1, p - 1)),
                    () => setApprovedPage(p => Math.min(approvedTotalPages, p + 1))
                  )}
                </>
              )}
            </>
          );
        })()}

        {/* REJECTED TAB */}
        {activeTab === 'rejected' && (
          <>
            {rejectedWorks.length === 0 ? (
              <div className="text-center py-24 px-6 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                  <XCircle className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No rejected work</h3>
                <p className="text-gray-500 text-base font-medium">Rejected work assignments will appear here.</p>
              </div>
            ) : (
              <>
                {paginatedRejectedGroups.map(group => renderJourneyGroup(group, 'rejected'))}
                {renderPagination(
                  rejectedPage,
                  rejectedTotalPages,
                  () => setRejectedPage(p => Math.max(1, p - 1)),
                  () => setRejectedPage(p => Math.min(rejectedTotalPages, p + 1))
                )}
              </>
            )}
          </>
        )}

      </div>
'''

updated = content[:start_index] + "\n" + new_content + "\n" + content[end_index:]

with open(file_path, 'w', encoding='utf8') as f:
    f.write(updated)
print('Successfully updated TravelAllowanceTab.tsx')
