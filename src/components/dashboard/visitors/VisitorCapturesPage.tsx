import { useEffect, useState } from 'react';
import {
  Users, Eye, CheckCircle, XCircle, Clock, User,
  Search, Settings, X, Trash2, List, LogIn, LogOut, Check, RotateCcw, ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useVisitorStore } from '../../../stores/visitorStore';
import { useTenant } from '../../../contexts/TenantContext';
import { useUserProfileStore } from '../../../stores/userProfileStore';
import { getUserEmployeeData } from '../../../lib/roleBasedAccess';
import VisitorDetailsModal from './VisitorDetailsModal';
import VisitorSettingsPanel from './VisitorSettingsPanel';
import EmployeeVisitorApprovals from './EmployeeVisitorApprovals';
import { format, isToday } from 'date-fns';
import type { VisitorWithDetails } from '../../../types/visitor';

export default function VisitorCapturesPage() {
  const { currentTenant } = useTenant();
  const {
    visitors,
    timestamps: visitorTimestamps = [],
    loading,
    fetchVisitors,
    fetchVisitorTimestamps,
    deleteVisitor,
    createNewVisit, // Extracted new function
  } = useVisitorStore();

  const { userId } = useUserProfileStore();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'visitors' | 'timestamps'>('visitors');
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorWithDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Detect role on mount
  useEffect(() => {
    if (!userId) return;
    getUserEmployeeData(userId)
      .then(({ role }) => setUserRole(role))
      .finally(() => setRoleLoading(false));
  }, [userId]);

  useEffect(() => {
    if (currentTenant) {
      fetchVisitors(currentTenant.id);
      fetchVisitorTimestamps(currentTenant.id);
    }
  }, [currentTenant, fetchVisitors, fetchVisitorTimestamps]);

  const filteredVisitors = visitors.filter((visitor) => {
    const matchesStatus =
      filterStatus === 'all' || visitor.visitor_status === filterStatus;

    const matchesSearch =
      !searchTerm ||
      visitor.visitor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      visitor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      visitor.phone_number?.includes(searchTerm);

    return matchesStatus && matchesSearch;
  });

  const filteredTimestamps = visitorTimestamps.filter((ts: any) => {
    const visitor = visitors.find(v => v.id === ts.visitor_id);
    if (!searchTerm) return true;
    return visitor?.visitor_name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleVisitorClick = (visitor: VisitorWithDetails) => {
    setSelectedVisitor(visitor);
    setIsModalOpen(true);
  };

  // --- NEW: Handle starting a fresh visit for returning user ---
  const handleStartNewVisit = async (e: React.MouseEvent, visitor: VisitorWithDetails) => {
    e.stopPropagation();
    if (!currentTenant) return;
    
    try {
      await createNewVisit(currentTenant.id, visitor.id);
      
      // Auto-open modal so receptionist can fill in today's details
      const freshVisitorState = useVisitorStore.getState().visitors.find(v => v.id === visitor.id);
      if (freshVisitorState) {
        setSelectedVisitor(freshVisitorState);
        setIsModalOpen(true);
      }
      
      toast.success(`Started new visit for ${visitor.visitor_name}`);
    } catch (error) {
      toast.error('Failed to start new visit');
    }
  };

  const handleDeleteVisitor = async (e: React.MouseEvent, visitor: VisitorWithDetails) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete visitor ${visitor.visitor_name || 'Unknown'}?`)) {
      try {
        await deleteVisitor(visitor.id);
        toast.success('Visitor deleted successfully');
      } catch (error) {
        toast.error('Failed to delete visitor');
      }
    }
  };

  const handleConfirmTimestamp = async (timestampId: string) => {
    toast.success('Timestamp confirmed!');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle className="h-3 w-3" /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            <XCircle className="h-3 w-3" /> Rejected
          </span>
        );
      case 'verification_pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            <ShieldCheck className="h-3 w-3" /> Pending Approval
          </span>
        );
      case 'exit_pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
            <LogOut className="h-3 w-3" /> Exit Pending
          </span>
        );
      case 'exited':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <LogOut className="h-3 w-3" /> Exited
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            <Clock className="h-3 w-3" /> Pending Details
          </span>
        );
    }
  };

  const getVisitorImage = (visitor: VisitorWithDetails) => {
    if (visitor.visitor_image) return visitor.visitor_image;
    if (visitor.visitor_image_data) {
      try {
        const blob = new Blob([visitor.visitor_image_data as any], { type: 'image/jpeg' });
        return URL.createObjectURL(blob);
      } catch (error) {
        return null;
      }
    }
    return null;
  };

  const getVisitorName = (visitorId: string) => {
    const visitor = visitors.find(v => v.id === visitorId);
    return visitor?.visitor_name || 'Unknown Visitor';
  };

  // Show spinner while role is loading to prevent flicker
  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (userRole === 'Employee' || userRole === 'Reporting Head') {
    return <EmployeeVisitorApprovals />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-6 w-6" />
              Visitor Captures
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              View and manage all detected visitors and their entry/exit logs
            </p>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            title="Visitor Settings"
            className="p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('visitors')}
            className={`flex items-center gap-2 py-3 px-6 border-b-2 font-medium text-sm transition-colors ${activeTab === 'visitors'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <Users className="h-4 w-4" />
            Visitor Profiles
          </button>
          <button
            onClick={() => setActiveTab('timestamps')}
            className={`flex items-center gap-2 py-3 px-6 border-b-2 font-medium text-sm transition-colors ${activeTab === 'timestamps'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <List className="h-4 w-4" />
            Timestamp Management
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {activeTab === 'visitors' && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending Details</option>
              <option value="verification_pending">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="exit_pending">Exit Pending</option>
              <option value="exited">Exited</option>
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : activeTab === 'visitors' ? (
        // --- VISITOR PROFILES TAB ---
        filteredVisitors.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No visitors found</h3>
            <p className="text-gray-500">
              {searchTerm || filterStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Visitors will appear here when detected by the face recognition system'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredVisitors.map((visitor) => {
              const imageUrl = getVisitorImage(visitor);
              
              // Evaluated logic for Returning Visitors
              const isRegistered = !!visitor.visitor_name;
              const isReturning = isRegistered && (visitor.visit_count > 1 || !isToday(new Date(visitor.first_detected_at)));
              const needsNewVisit = (visitor.visitor_status as string) === 'exited' || visitor.visitor_status === 'rejected';

              return (
                <div
                  key={visitor.id}
                  onClick={() => handleVisitorClick(visitor)}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all cursor-pointer group flex flex-col"
                >
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Visitor"
                        className="w-full h-full  group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="h-20 w-20 text-gray-400" />
                      </div>
                    )}
                    
                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
                      {isReturning ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-sm">
                          <RotateCcw className="h-3 w-3" /> Returning
                        </span>
                      ) : <div></div>}
                      
                      {getStatusBadge(visitor.visitor_status)}
                    </div>

                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                        <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-lg font-medium text-sm text-slate-800 shadow-lg flex items-center gap-2">
                          <Eye className="h-4 w-4" /> View Details
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 truncate text-lg">
                          {visitor.visitor_name || 'Unknown Visitor'}
                        </h3>
                        {visitor.phone_number && (
                          <p className="text-sm text-gray-500 truncate">{visitor.phone_number}</p>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleDeleteVisitor(e, visitor)}
                        className="relative p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 -mt-1 -mr-1"
                        title="Delete Visitor"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {visitor.employee_name && !needsNewVisit && (
                      <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-500 mb-0.5">Currently Visiting:</p>
                        <p className="text-sm font-medium text-slate-700 truncate">{visitor.employee_name}</p>
                      </div>
                    )}

                    <div className="mt-auto pt-4 flex items-center justify-between border-t border-gray-100">
                      <span className="text-xs text-slate-500 font-medium">
                        Last: {format(new Date(visitor.last_visit_at || visitor.first_detected_at), 'MMM d, yyyy')}
                      </span>
                      <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md">
                        {visitor.visit_count} {visitor.visit_count === 1 ? 'Visit' : 'Visits'}
                      </span>
                    </div>

                    {/* Returning Visitor Quick Action */}
                    {needsNewVisit && isRegistered && (
                      <button 
                        onClick={(e) => handleStartNewVisit(e, visitor)}
                        className="mt-3 w-full py-2 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 text-sm font-semibold rounded-lg transition-colors border border-blue-100 hover:border-blue-600 flex items-center justify-center gap-2"
                      >
                        <LogIn className="h-4 w-4" /> Start New Visit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        // --- TIMESTAMP MANAGEMENT TAB ---
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {filteredTimestamps.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-1">No log entries found</h3>
              <p className="text-slate-500">
                {searchTerm ? 'Try adjusting your search' : 'Visitor entry and exit records will appear here'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Visitor
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Time recorded
                    </th>
                    {/* <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Status
                    </th> */}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredTimestamps.map((ts: any) => {
                    const isCheckIn = ts.entry?.toUpperCase() === 'IN';

                    return (
                      <tr key={ts.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200">
                              <User className="h-4 w-4" />
                            </div>
                            <div className="ml-3">
                              <p className="text-sm font-bold text-slate-900">
                                {getVisitorName(ts.visitor_id)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${isCheckIn ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-orange-50 text-orange-700 border border-orange-100'
                            }`}>
                            {isCheckIn ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
                            {isCheckIn ? 'Clocked IN' : 'Clocked OUT'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">
                              {ts.timestamp ? format(new Date(ts.timestamp), 'h:mm a') : 'N/A'}
                            </span>
                            <span className="text-xs text-slate-500">
                              {ts.timestamp ? format(new Date(ts.timestamp), 'MMM d, yyyy') : ''}
                            </span>
                          </div>
                        </td>
                        {/* <td className="px-6 py-4 whitespace-nowrap">
                          {ts.is_confirmed ? (
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                              <CheckCircle className="h-4 w-4" /> Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600">
                              <Clock className="h-4 w-4" /> System Logged
                            </span>
                          )}
                        </td> */}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedVisitor && (
        <VisitorDetailsModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedVisitor(null);
          }}
          visitor={selectedVisitor}
          onUpdate={() => {
            if (currentTenant) {
              fetchVisitors(currentTenant.id);
            }
          }}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Visitor Settings</h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <VisitorSettingsPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}