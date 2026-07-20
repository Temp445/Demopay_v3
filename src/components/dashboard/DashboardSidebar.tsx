import React, { useState } from 'react';
import { X, Home, Users, ScanFace, IndianRupee, Settings, PieChart, FileText, Clock, FileClock, Calendar, ClipboardList, Bell, Play, SquareUser, CreditCard, CreditCard as Edit, MapPin, HandCoins, ChevronDown, ChevronRight, CheckCircle, Shield, NotepadText, UserCog, UserPlus, Building2, Server, Webcam, MonitorCheck, LayoutDashboard, ClipboardCheck, MapPinned, SlidersHorizontal, Wifi, FlaskConical, Files, Mail } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { useRoleAccess } from '../../hooks/useRoleAccess';
import { useLocationSettingsStore } from '../../stores/locationSettingsStore';
import { useTenant } from '../../contexts/TenantContext';

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
}

interface NavigationGroup {
  name: string;
  icon: React.ComponentType<any>;
  isGroup: true;
  subItems: NavigationItem[];
}

type NavigationEntry = NavigationItem | NavigationGroup;


export default function DashboardSidebar({ isOpen, onClose }: DashboardSidebarProps) {
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const { hasAccess, loading: permissionsLoading } = usePermissions();
  const { isAdmin } = useRoleAccess();
  const { currentTenant } = useTenant();
  const { settings, fetchSettings, initialized } = useLocationSettingsStore();

  React.useEffect(() => {
    if (currentTenant?.id && !initialized) {
      fetchSettings(currentTenant.id);
    }
  }, [currentTenant?.id, initialized]);

  const locationSubItems: NavigationItem[] = [
    { name: 'Gate Pass', href: '/dashboard/gate-passes', icon: CreditCard },
    { name: 'Assigned Work Location', href: '/dashboard/work-location-assignment', icon: MapPin },
    { name: 'Work Location Approval', href: '/dashboard/work-location-approval', icon: MapPin },
    ...(settings.live_tracking_enabled ? [{ name: 'Location Tracking', href: '/dashboard/location-tracking', icon: MapPinned }] : []),
    { name: 'Work Location', href: '/dashboard/work-location', icon: MapPin },
    { name: 'Location Settings', href: '/dashboard/location-settings', icon: SlidersHorizontal },
  ];

  const navigation: NavigationEntry[] = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Tenant Screen Access', href: '/dashboard/global-tenant-management', icon: LayoutDashboard },
    { name: 'Employees', href: '/dashboard/employees', icon: Users },
    {
      name: 'Attendance',
      icon: Clock,
      isGroup: true,
      subItems: [
        { name: 'Face Enrollment', href: '/dashboard/attendance/face-enrollment', icon: ScanFace },
        { name: 'Attendance Face', href: '/dashboard/attendance-face-verify', icon: Webcam },
        { name: 'Clock In/Out', href: '/dashboard/clockin-clockout', icon: Clock },
        { name: 'Time Stamp Mgmt', href: '/dashboard/time-stamp-management', icon: Edit },
        { name: 'Attendance Log', href: '/dashboard/attendance-logs', icon: FileClock },

        { name: 'Leave', href: '/dashboard/leave', icon: Calendar },
        { name: 'Leave Settings', href: '/dashboard/leave/settings', icon: Settings },
        { name: 'Attendance Settings', href: '/dashboard/settings/attendance-settings', icon: Clock },
        { name: 'Hik Device Employees', href: '/dashboard/attendance/hik-device-employees', icon: ScanFace }
      ],
    },
    { name: 'Shifts', href: '/dashboard/shifts', icon: ClipboardList },
    { name: 'Holidays', href: '/dashboard/holidays', icon: Calendar },
    {
      name: 'Permissions',
      icon: ClipboardCheck,
      isGroup: true,
      subItems: [
        { name: 'Permission Request', href: '/dashboard/permissions/request', icon: FileText },
        { name: 'Permission Approval', href: '/dashboard/permissions/approval', icon: CheckCircle },
      ],
    },
    {
      name: 'Advances',
      icon: HandCoins,
      isGroup: true,
      subItems: [
        { name: 'Advance Request', href: '/dashboard/advances/request', icon: FileText },
        { name: 'Advance Approval', href: '/dashboard/advances/approval', icon: CheckCircle },
        { name: 'Advance Settings', href: '/dashboard/advances/settings', icon: Settings },
      ],
    },
    {
      name: 'Salary Payroll Process',
      icon: IndianRupee,
      isGroup: true,
      subItems: [
        { name: 'Component Master', href: '/dashboard/component-master', icon: ClipboardList },
        { name: 'Salary Structures', href: '/dashboard/salary-structures', icon: FileText },
        { name: 'Structure Assignments', href: '/dashboard/structure-assignments', icon: Users },
        { name: 'Payroll Process', href: '/dashboard/payroll-process', icon: Play },
        { name: 'Payroll', href: '/dashboard/payroll', icon: IndianRupee },
        { name: 'Payslip Sender', href: '/dashboard/payslip-sender', icon: Mail },
        { name: 'Formula Tester', href: '/dashboard/formula-tester', icon: FlaskConical },
      ],
    },
    {
      name: 'Overtime',
      icon: Clock,
      isGroup: true,
      subItems: [
        { name: 'OT Employees', href: '/dashboard/overtime/employees', icon: Users },
        { name: 'OT Structures', href: '/dashboard/overtime/structures', icon: Settings },
        { name: 'OT Time Stamp', href: '/dashboard/overtime/approvals', icon: CheckCircle },
        { name: 'OT Processing', href: '/dashboard/overtime/processing', icon: Play },
        { name: 'OT Settings', href: '/dashboard/overtime/settings', icon: Settings },
      ],
    },
    { name: 'Statutory', href: '/dashboard/statutory', icon: Shield },
    { name: 'Visitor Log', href: '/dashboard/visitor-records', icon: SquareUser },
    { name: 'Reports', href: '/dashboard/reports', icon: PieChart },
    {
      name: 'Gate Pass & Location',
      icon: MapPin,
      isGroup: true,
      subItems: locationSubItems,
    },
    { name: 'Employee Invite', href: '/dashboard/employee-invite', icon: UserPlus },
    {
      name: 'Settings',
      icon: Settings,
      isGroup: true,
      subItems: [
        { name: 'Company Settings', href: '/dashboard/settings/company-settings', icon: Building2 },
        { name: 'Profile Settings', href: '/dashboard/settings/user-settings', icon: UserCog },
        { name: 'User Management', href: '/dashboard/settings/user-management', icon: Users },
        { name: 'Employee Reporting', href: '/dashboard/reporting', icon: UserPlus },
        { name: 'Screen Access Control', href: '/dashboard/access-control', icon: MonitorCheck },
        { name: 'Master Data Import', href: '/dashboard/settings/master-data-import', icon: FileText },
        { name: 'SMTP Configuration', href: '/dashboard/settings/smtp-configuration', icon: Server },
        { name: 'Shift Attendance Notifier', href: '/dashboard/settings/shift-attendance-notifier', icon: NotepadText },
        { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
        { name: 'Hik Device Controller', href: '/dashboard/settings/hik-device-controller', icon: Wifi },
        // { name: 'Billing & Subscriptions', href: '/dashboard/billing', icon: CreditCard }
      ],
    },
  ];

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const isGroupActive = (group: NavigationGroup) => {
    return group.subItems.some(item => location.pathname === item.href);
  };

  const filterNavigation = (items: NavigationEntry[]): NavigationEntry[] => {
    return items.filter(item => {
      if ('isGroup' in item && item.isGroup) {
        const filteredSubItems = item.subItems.filter(subItem => {
          // Billing is admin-only and guarded by BillingPage itself;
          // bypass hasAccess so it isn't dropped when not in application_screens.
          if (subItem.href === '/dashboard/billing') {
            return isAdmin;
          }
          return hasAccess(subItem.href);
        });
        return filteredSubItems.length > 0;
      } else {
        return hasAccess(item.href);
      }
    }).map(item => {
      if ('isGroup' in item && item.isGroup) {
        return {
          ...item,
          subItems: item.subItems.filter(subItem => {
            if (subItem.href === '/dashboard/billing') {
              return isAdmin;
            }
            return hasAccess(subItem.href);
          })
        };
      }
      return item;
    });
  };

  const filteredNavigation = filterNavigation(navigation);

  const renderNavigationItem = (item: NavigationEntry, isMobile: boolean) => {
    if ('isGroup' in item && item.isGroup) {
      const group = item as NavigationGroup;
      const isExpanded = expandedGroups[group.name];
      const isActive = isGroupActive(group);

      return (
        <div key={group.name}>
          <button
            onClick={() => toggleGroup(group.name)}
            className={`group flex items-center justify-between w-full px-2 py-2 ${isMobile ? 'text-base' : 'text-sm'} font-medium rounded-md ${isActive
                ? 'bg-indigo-700 text-white'
                : 'text-indigo-100 hover:bg-indigo-600 hover:text-white'
              }`}
          >
            <div className="flex items-center">
              <group.icon
                className={`${isMobile ? 'mr-4 h-6 w-6' : 'mr-3 h-6 w-6'} ${isActive ? 'text-white' : 'text-indigo-200 group-hover:text-white'
                  }`}
                aria-hidden="true"
              />
              {group.name}
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {isExpanded && (
            <div className="mt-1 space-y-1">
              {group.subItems.map((subItem) => {
                const isSubActive = location.pathname === subItem.href;
                return (
                  <Link
                    key={subItem.name}
                    to={subItem.href}
                    onClick={() => {
                      if (isMobile) onClose();
                    }}
                    className={`group flex items-center pl-11 pr-2 py-2 ${isMobile ? 'text-sm' : 'text-xs'} font-medium rounded-md ${isSubActive
                        ? 'bg-white text-indigo-600'
                        : 'text-indigo-100 hover:bg-indigo-600 hover:text-white'
                      }`}
                  >
                    <subItem.icon
                      className={`mr-3 h-4 w-4 ${isSubActive ? 'text-indigo-600' : 'text-indigo-200 group-hover:text-white'
                        }`}
                      aria-hidden="true"
                    />
                    {subItem.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    } else {
      const navItem = item as NavigationItem;
      const isActive = location.pathname === navItem.href;
      return (
        <Link
          key={navItem.name}
          to={navItem.href}
          onClick={() => {
            if (isMobile) onClose();
          }}
          className={`group flex items-center px-2 py-2 ${isMobile ? 'text-base' : 'text-sm'} font-medium rounded-md ${isActive
              ? 'bg-white text-indigo-600'
              : 'text-indigo-100 hover:bg-indigo-600 hover:text-white'
            }`}
        >
          <navItem.icon
            className={`${isMobile ? 'mr-4 h-6 w-6' : 'mr-3 h-6 w-6'} ${isActive ? 'text-indigo-600' : 'text-indigo-200 group-hover:text-white'
              }`}
            aria-hidden="true"
          />
          {navItem.name}
        </Link>
      );
    }
  };

  // New Skeleton Loader Component
  const SidebarSkeleton = () => {
    // Creating an array of 8 dummy items to map over
    const skeletonItems = Array.from({ length: 10 });

    return (
      <div className="space-y-2 px-2 mt-5">
        {skeletonItems.map((_, index) => (
          <div key={index} className="flex items-center px-2 py-2 animate-pulse">
            {/* Icon Skeleton */}
            {/* <div className="mr-3 h-8 w-6 bg-indigo-400 rounded-md opacity-50"></div> */}
            {/* Text Skeleton */}
            <div className="h-8 w-full bg-indigo-400 rounded-md opacity-50"></div>
          </div>
        ))}
      </div>
    );
  };

  // --- CUSTOM SCROLLBAR TAILWIND CLASSES ---
  const customScrollbarClass = "overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/40 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors";

  return (
    <>
      {/* Mobile sidebar */}
      <div
        className={`fixed inset-0 flex z-40 lg:hidden ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        <div
          className={`fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'
            }`}
          onClick={onClose}
        />

        <div
          className={`relative flex-1 flex flex-col max-w-xs w-full bg-[#6366F1] transform transition-transform ${isOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
        >
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={onClose}
            >
              <span className="sr-only">Close sidebar</span>
              <X className="h-6 w-6 text-white" aria-hidden="true" />
            </button>
          </div>

          <div className={`flex-1 h-0 pt-5 pb-4 ${customScrollbarClass}`}>
            {/* Check loading state here */}
            {permissionsLoading ? (
              <SidebarSkeleton />
            ) : (
              <nav className="mt-5 px-2 space-y-1">
                {filteredNavigation.map((item) => renderNavigationItem(item, true))}
              </nav>
            )}
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden pt-8 lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        <div className="flex-1 flex flex-col min-h-0 bg-[#6366F1] border-r border-indigo-400">
          <div className={`flex-1 h-0 pt-5 pb-4 ${customScrollbarClass}`}>
            {/* Check loading state here */}
            {permissionsLoading ? (
              <SidebarSkeleton />
            ) : (
              <nav className="mt-5 flex-1 px-2 space-y-1">
                {filteredNavigation.map((item) => renderNavigationItem(item, false))}
              </nav>
            )}
          </div>
        </div>
      </div>
    </>
  );
}