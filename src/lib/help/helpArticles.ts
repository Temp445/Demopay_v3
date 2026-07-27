// ==========================================
//  Help Article Data Layer
//  All help content for the Ace Payroll System
// ==========================================

export type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'warning'; text: string }
  | { type: 'tip'; text: string }
  | { type: 'workflow'; steps: string[] }
  | { type: 'link'; text: string; href: string };

export interface HelpArticle {
  id: string;
  module: string;
  title: string;
  summary: string;
  tags: string[];
  relatedPages: string[];
  content: ContentBlock[];
}

export const helpArticles: HelpArticle[] = [
  // -- DASHBOARD --
  {
    id: 'dashboard-overview',
    module: 'Dashboard',
    title: 'Dashboard Overview',
    summary: 'Understand the key metrics and sections shown on the main dashboard.',
    tags: ['dashboard', 'overview', 'statistics', 'attendance', 'leave', 'shift', 'advances', 'permissions'],
    relatedPages: ['/overview', '/dashboard'],
    content: [
      {
        type: 'paragraph',
        text: 'The Dashboard is your central hub in Ace Payroll. What you see depends on your role — Admins and HR see organization-wide statistics, while Employees see a personalized self-service overview.'
      },

      { type: 'heading', text: 'Role-Based Views' },
      {
        type: 'list',
        items: [
          '**Admin / HR Team:** Sees the full organization-wide statistics dashboard with a month filter.',
          '**Employee:** Sees only their own personal data — attendance, shift, leaves, permissions, and advances.'
        ]
      },

      { type: 'heading', text: 'Admin & Manager View — Statistics Cards' },
      {
        type: 'paragraph',
        text: 'Use the month picker at the top-right to filter data for any past or current pay period.'
      },
      {
        type: 'list',
        items: [
          '**Total Employees:** The total count of all employee records in the system.',
          '**Active Employees:** The number of employees with an Active employment status.',
          '**Leave Approved Today / Monthly:** For the current month, this shows leaves approved today. When viewing a past month, it shows the total leaves approved for that month.',
          '**Pending Leave Requests:** The number of leave applications awaiting Admin or Manager action.',
          '**Today Attendance:** The percentage of active employees who clocked in today.',
          '**Monthly Attendance:** The overall attendance rate for the selected month across all employees.'
        ]
      },
    ]
  },

  // -- EMPLOYEES & MASTERS --
  {
    id: 'manage-departments',
    module: 'Employees',
    title: 'Managing Departments',
    summary: 'Set up organizational departments before adding employees.',
    tags: ['department', 'departments', 'masters'],
    relatedPages: ['/employees'],
    content: [
      {
        type: 'paragraph',
        text: 'Before you can create employee records, you must configure your organizational structure.'
      },
      { type: 'heading', text: 'Adding a Department' },
      {
        type: 'steps',
        items: [
          'Go to the [[Employees|/dashboard/employees]] page.',
          'Click the "+ Manage & Add" button in the top-right corner.',
          'Select "Departments" from the dropdown menu.',
          'In the modal, enter the name of the new department and click Add.'
        ]
      },
      { type: 'tip', text: 'You cannot delete a Department if it is currently assigned to any active employee.' }
    ]
  },
  {
    id: 'manage-roles',
    module: 'Employees',
    title: 'Managing Designations',
    summary: 'Set up job designations before adding employees.',
    tags: ['role', 'roles', 'designation', 'masters'],
    relatedPages: ['/employees'],
    content: [
      {
        type: 'paragraph',
        text: 'Create and manage employee designations used across the organization.'
      },
      { type: 'heading', text: 'Adding a Designation' },
      {
        type: 'steps',
        items: [
          'Go to the [[Employees|/dashboard/employees]] page.',
          'Click the "+ Manage & Add" button in the top-right corner.',
          'Select "Designation" from the dropdown menu.',
          'In the modal, enter the name of the new role and click Add.'
        ]
      },
      { type: 'tip', text: 'You cannot delete a Designation if it is currently assigned to any active employee.' }
    ]
  },
  {
    id: 'manage-cadres',
    module: 'Employees',
    title: 'Managing Cadres',
    summary: 'Set up employee cadres or bands before adding employees.',
    tags: ['cadre', 'cadres', 'band', 'masters'],
    relatedPages: ['/employees'],
    content: [
      {
        type: 'paragraph',
        text: 'Cadres define the hierarchical band or grouping level of an employee (e.g., L1, L2, Management).'
      },
      { type: 'heading', text: 'Adding a Cadre' },
      {
        type: 'steps',
        items: [
          'Go to the [[Employees|/dashboard/employees]] page.',
          'Click the "+ Manage & Add" button in the top-right corner.',
          'Select "Cadres" from the dropdown menu.',
          'In the modal, enter the name of the new cadre and click Add.'
        ]
      }
    ]
  },
  {
    id: 'employees-page',
    module: 'Employees',
    title: 'Managing Employees',
    summary: 'Learn how to add, edit, change status, and map employees.',
    tags: ['employee', 'add', 'edit', 'status', 'terminate', 'suspend', 'search'],
    relatedPages: ['/employees'],
    content: [
      {
        type: 'paragraph',
        text: 'The Employees page is the master record for all staff in your organization.'
      },
      { type: 'heading', text: 'Adding a New Employee' },
      {
        type: 'steps',
        items: [
          'Go to the [[Employees|/dashboard/employees]] page.',
          'Click the "+ Manage & Add" button in the top-right corner.',
          'Select "+ Add Employee" from the dropdown menu.',
          'Fill in required fields: Full Name, Father\'s Name, Email, Employee Code, Cadre, Department, Designation, Join Date, Date of Birth.',
          'Click Save. The employee is created immediately.'
        ]
      },
      { type: 'heading', text: 'Editing & Status Changes' },
      {
        type: 'steps',
        items: [
          'Click the edit (pencil) icon on any employee row.',
          'Update any required fields.',
          'To change an employee\'s Status (e.g. Terminated, Suspended, Relieved), you MUST provide a Status Date and a Status Reason.',
          'Click Save Changes.'
        ]
      },
      { type: 'warning', text: 'Changing an employee\'s status from Active to anything else will exclude them from future payrolls and time tracking.' }
    ]
  },

  // -- ATTENDANCE & SHIFTS --
  {
    id: 'shifts',
    module: 'Attendance',
    title: 'Shift Management',
    summary: 'Create shifts, assign employees, and view the full schedule calendar.',
    tags: ['shifts', 'create shift', 'assign shift', 'schedule', 'calendar', 'break time', 'import shifts'],
    relatedPages: ['/shifts'],
    content: [
      {
        type: 'paragraph',
        text: 'The Shifts page is where you define working hours and assign them to employees. It includes a shift list, a monthly calendar view.'
      },

      { type: 'heading', text: 'Creating a Shift' },
      {
        type: 'steps',
        items: [
          'Click the **Create Shift** button (top-right).',
          'Enter the Shift Name, Start Time, End Time, Break Duration (minutes), and Shift Type.',
          'Save — the new shift appears in the Shift List immediately.'
        ]
      },

      { type: 'heading', text: 'Assigning Employees to a Shift' },
      {
        type: 'steps',
        items: [
          'In the Shift List, find the shift you want to assign.',
          'Click the **Assign Employees** button on that row.',
          'In the modal, pick employees (filtered to Active only) and set the date range for the assignment.',
          'Confirm — the assignments are saved and appear on the calendar.'
        ]
      },

      { type: 'heading', text: 'Editing a Shift' },
      {
        type: 'paragraph',
        text: 'Click the **Edit** (pencil) icon on any row in the Shift List to update the shift name, timings, or break duration. Changes apply to future assignments.'
      }
    ]
  },


  // -- ATTENDANCE LOGS --
  {
    id: 'attendance-logs',
    module: 'Attendance',
    title: 'Attendance Logs',
    summary: 'View, filter, correct, and export the official daily attendance records for all employees.',
    tags: ['attendance logs', 'attendance', 'clock in', 'clock out', 'status', 'export', 'csv', 'absent', 'present', 'late', 'half day'],
    relatedPages: ['/attendance-logs'],
    content: [
      {
        type: 'paragraph',
        text: 'View and audit daily attendance records for all employees. Admins and HR see everyone; Employees see only their own data.'
      },
      {
        type: 'warning',
        text: 'The Status dropdown is disabled if Clock In or Clock Out is missing. Fix the punch first in [[Timestamp Management|/dashboard/time-stamp-management]], then return here to update the status.'
      },
      { type: 'heading', text: 'Exporting Records' },
      {
        type: 'paragraph',
        text: 'Set a Start Date and End Date, then click **Export** to download a CSV of all filtered records including Clock In, Clock Out, Total Hours, and Status.'
      }
    ]
  },

  {
    id: 'face-enrollment',
    module: 'Attendance',
    title: 'Face Enrollment for Web Camera',
    summary: 'Enroll employee faces for attendance verification using Web Camera.',
    tags: ['face', 'enrollment', 'biometric', 'camera'],
    relatedPages: ['/attendance/face-enrollment'],
    content: [
      {
        type: 'paragraph',
        text: 'Enroll employee faces securely for biometric check-ins. Face data is encrypted and only used for attendance verification.'
      },
      { type: 'heading', text: 'How to Enroll' },
      {
        type: 'steps',
        items: [
          'Search for an employee or filter by department.',
          'Click the Enroll Face button to open the camera.',
          'Position the employee\'s face within the frame and capture.',
          'Once enrolled, they can use the Face Verification tablet to clock in.'
        ]
      }
    ]
  },

  {
    id: 'clock-in-out',
    module: 'Attendance',
    title: 'Clock In & Out',
    summary: 'Log daily attendance, search for employee profiles, and view the employee clock-in and clock-out times.',
    tags: ['clock-in', 'clock-out', 'timestamps', 'face-recognition', 'attendance-log'],
    relatedPages: ['/clockin-clockout'],
    content: [
      {
        type: 'paragraph',
        text: "The Clock In/Out provides an interface for recording employee attendance."
      },
      { type: 'heading', text: 'Key Features' },
      {
        type: 'list',
        items: [
          '**Employee Selection (Admins Only):** Use the searchable dropdown to find an employee by name or code. Standard employees are automatically selected to their own profile.',
          '**Live vs Manual Mode:** Admins can switch to "Manual Mode" to record historical timestamps for a custom date and time (requires a mandatory reason).',
          '**Face Recognition:** Toggle the "Use Face Recognition" checkbox to enable/disable biometric verification. If enabled, the system uses the device camera to verify the employee\'s identity before recording the punch.',
          '**Timestamp Entries:** Below the clock card, view a live list of all punch events for the selected date, including the assigned shift and timing status.'
        ]
      }
    ]
  },

  {
    id: 'timestamp-management',
    module: 'Attendance',
    title: 'Timestamp Management',
    summary: 'Manually correct employee punch records.',
    tags: ['timestamps', 'manual punch', 'correction', 'unprocessed'],
    relatedPages: ['/time-stamp-management'],
    content: [
      {
        type: 'paragraph',
        text: 'Admins use this page to view, correct, and finalize attendance records.'
      },
      { type: 'heading', text: 'Filtering & Analysis' },
      {
        type: 'list',
        items: [
          '**Filter Modes:** Search for data "By Shift" (view all employees assigned to a specific shift on a specific date) or "By Employee" (view a specific person\'s history over a date range).',
          '**Record Categories:** View records filtered by "All", "Incomplete" (missing either in or out), "Wrong Shift" (punched outside assigned hours), or "Unscheduled" (punched with no assignment).',
          '**Unprocessed Badge:** Identifies raw timestamps that have been generated but not yet saved to the official Attendance Logs.'
        ]
      },
      { type: 'heading', text: 'Updating Records' },
      {
        type: 'steps',
        items: [
          'Review the records in the table. Click the **Edit** icon to manually adjust clock-in or clock-out times.',
          'The system validates edits against attendance request policies (like permissions or leave) automatically.',
          'Select the processed records using the checkboxes and click **"Update Selected"** to move them into the official Attendance Logs.',
          'Once saved to logs, these records become available for Payroll Processing.'
        ]
      }
    ]
  },

  // -- LEAVE & PERMISSIONS --
  {
    id: 'leave-management',
    module: 'Leave',
    title: 'Leave Requests & Approvals',
    summary: 'Request leave, view absentees, and handle approximations.',
    tags: ['leave', 'apply', 'approve', 'absentee'],
    relatedPages: ['/leave'],
    content: [
      {
        type: 'paragraph',
        text: 'The Leave module manages the employee leave request and approvals'
      },
      { type: 'heading', text: 'How to Manage Leaves' },
      {
        type: 'steps',
        items: [
          '**Select Employee:** (Admins) Use the search bar to find the employee. Standard employees are auto-selected.',
          '**View Balances:** The "Leave Balances" section shows exactly how many days are available for each category in the selected year.',
          '**Request Leave:** Click the **"+ Request Leave"** button to open the application form.',
          '**Manage Requests:** In the **Leave Requests** tab, review, approve, or reject applications. Balances are only deducted upon approval.'
        ]
      },
      { type: 'heading', text: 'The Absentee List' },
      {
        type: 'paragraph',
        text: 'Switch to the **Absentee List** tab to view the employees whose absence dates are there, but no leave request is raised against that absence.'
      },  
      {
        type: 'list',
        items: [
          'Admins can click on an absentee record to open a leave request form.',
          'Approving this request converts the absence into a "Paid Leave", ensuring the employee is not penalized with Loss of Pay (LOP).'
        ]
      }
    ]
  },
  {
    id: 'leave-types',
    module: 'Leave',
    title: 'Leave Types',
    summary: 'Create and define leave type rules.',
    tags: ['leave types', 'carry forward'],
    relatedPages: ['/leave'],
    content: [
      {
        type: 'paragraph',
        text: 'Before employees can apply, Admins must create Leave Types (e.g. Sick Leave, Casual Leave), specifying whether they are Paid or Unpaid, and if balances carry forward to the next year.'
      },
      { type: 'heading', text: 'Creating Leave Types' },
      {
        type: 'list',
        items: [
          'In the **Leave Types** tab, click "Add Leave Type" to open the form.',
          'Fill in the details',
          'Choose whether the leave type should be **Paid** or **Unpaid**',
          'set the **Rounding** policy for the leave days.',
          'Set the **Carry Forward** policy for the leave days.',
        ]
      }
    ]
  },
  {
    id: 'leave-configuration',
    module: 'Leave',
    title: 'Leave Settings',
    summary: 'Assign leave days and year-wise opening balances.',
    tags: ['leave settings', 'opening balance', 'applicable days'],
    relatedPages: ['/leave/settings'],
    content: [
      {
        type: 'paragraph',
        text: 'This page dictates exactly how many leave days each employee is eligible for, overriding master defaults if needed. It is organized into two primary tabs.'
      },
      { type: 'heading', text: 'Tab 1: Applicable Leave Days' },
      {
        type: 'paragraph',
        text: 'Used to enable or disable specific leave types for groups of employees and set custom yearly allocation limits.'
      },
      {
        type: 'steps',
        items: [
          'Filter by **Cadre**, **Designation**, or specific **Employees**.',
          'In the grid, toggle the "Is Applicable?" checkbox to enable a leave type.',
          'Optionally enter "Applicable Days" to override the master default for that group.',
          'Click **"Apply Configuration"** to save and trigger a balance recalculation.'
        ]
      },
      { type: 'heading', text: 'Tab 2: Year-wise Opening Balance' },
      {
        type: 'paragraph',
        text: 'Used for setting the **base starting balance** for employees, typically during migration or mid-year onboarding.'
      },
      {
        type: 'list',
        items: [
          'Use the **"Bulk Apply"** tool to quickly assign a fixed number of days to a filtered group.',
          'The grid displays the "Effective State" (Enabled/Disabled) and the override value.',
          'Setting an opening balance forms the base amount before automated monthly/yearly credits accrue.'
        ]
      }
    ]
  },
  {
    id: 'permission-requests',
    module: 'Leave',
    title: 'Permission Management',
    summary: 'Request and approve permissions, early logouts, or late arrivals with automated balance tracking.',
    tags: ['permission', 'early logout', 'late coming', 'short leave', 'absence'],
    relatedPages: ['/permissions/request', '/permissions/approval'],
    content: [
      {
        type: 'paragraph',
        text: 'To Request or approve permissions, early logouts, or late arrivals, Permissions are tracked in minutes and typically have a monthly quota.'
      },

      { type: 'heading', text: 'Requesting a Permission' },
      {
        type: 'paragraph',
        text: 'Employees can submit their own requests, while Admins can submit requests on behalf of any employee.'
      },
      {
        type: 'steps',
        items: [
          'Navigate to [[Permissions → Request|/dashboard/permissions/request]].',
          'Click **"New Request"** (top-right).',
          '**Select Employee:** (Admins only) Choose the employee record.',
          '**Check Balance:** The system displays the "Available Balance" in minutes for the selected month.',
          '**Timings:** Specify the Start Date/Time and End Date/Time. The system automatically calculates the duration.',
          '**Reason:** Provide a mandatory explanation for the request.',
          'Click **"Submit Request"**.'
        ]
      },

      { type: 'heading', text: 'Approval Workflow' },
      {
        type: 'paragraph',
        text: 'Managers or Admins review and process requests from the approval dashboard.'
      },
      {
        type: 'steps',
        items: [
          'Go to [[Permissions → Approval|/dashboard/permissions/approval]].',
          'In the **"Pending Approvals"** section, click **"Review"** on a request row.',
          '**Audit Logs:** View the "Logs" to see if the request was edited or previously modified.',
          '**Actions:** You can Edit the timings if necessary, then click **"Approve"** or **"Reject"**.',
          'Once approved, the requested minutes are deducted from the employee\'s permission monthly balance.'
        ]
      },

      
      { type: 'tip', text: 'Employees can cancel their own "Pending" requests. Once a request is Approved or Rejected, it can no longer be cancelled or edited by the employee.' }
    ]
  },

  // -- GATE PASS --
  {
    id: 'gatepass',
    module: 'Operations',
    title: 'Gate Passes',
    summary: 'Request and manage temporary employee exits for official or personal reasons.',
    tags: ['gate pass', 'security', 'official visit', 'permission'],
    relatedPages: ['/gate-passes'],
    content: [
      {
        type: 'paragraph',
        text: 'Gate Passes are issued to employees who need to temporarily leave the premises during working hours. All requests must be tracked and approved to maintain accurate attendance records.'
      },
      { type: 'heading', text: 'Creating a Request' },
      {
        type: 'steps',
        items: [
          'Click the **Create Gate Pass** button to open the request modal.',
          'Select the **Gate Pass Type**: **Normal Pass** (Personal) or **Paid Amount** (Official Visit).',
          'Choose the **Employee** from the dropdown list.',
          'Set the **Start Date/Time** and **End Date/Time** for the expected absence.',
          'Provide a valid **Reason** for the exit and click **Create Request**.'
        ]
      },
      {
        type: 'warning',
        text: 'Gate pass requests must be approved by an Admin or Manager before they become effective.'
      },
    ]
  },

  // -- MISC & SETTINGS --
  {
    id: 'master-data-import',
    module: 'Settings',
    title: 'Master Data Import',
    summary: 'Bulk upload employees using Excel.',
    tags: ['import', 'excel', 'bulk upload', 'data migration'],
    relatedPages: ['/settings/master-data-import'],
    content: [
      {
        type: 'paragraph', text: 'Instead of adding employees one by one, use the Master Data Import tool to upload your entire workforce.'
      },
      {
        type: 'steps', items: [
          'Go to Settings -> Master Data Import.',
          'Download the sample Excel template.',
          'Fill your employee data exactly according to the template columns.',
          'Upload the file, review the mapping, and submit.'
        ]
      }
    ]
  }
  ,
  // -- SETTINGS --
  {
    id: 'settings-company',
    module: 'Settings',
    title: 'Company Settings',
    summary: 'Configure company profile, pay periods, and bank details.',
    tags: ['company', 'address', 'pay period', 'bank', 'workflow'],
    relatedPages: ['/settings/company-settings'],
    content: [
      { type: 'paragraph', text: 'Company Settings allow you to configure global preferences for the application.' },
      { type: 'heading', text: 'Pay Periods' },
      { type: 'paragraph', text: 'Define whether your organization runs on a weekly or monthly pay cycle, and set the start/end bounds for calculations.' },
      { type: 'heading', text: 'Approval Workflow' },
      { type: 'paragraph', text: 'Enable or disable the requirement for payroll to be approved before execution, ensuring better compliance.' }
    ]
  },
  {
    id: 'settings-attendance',
    module: 'Settings',
    title: 'Attendance Validation Settings',
    summary: 'Define grace periods, late/early limits, permission policies, and manual clock-in rules.',
    tags: ['attendance settings', 'grace period', 'late entry', 'early exit', 'permission minutes', 'manual clock in'],
    relatedPages: ['/settings/attendance-settings'],
    content: [
      {
        type: 'paragraph',
        text: 'These settings control how the system classifies each employee punch relative to their assigned shift. Changes here affect all attendance records going forward.'
      },
      { type: 'heading', text: 'Key Settings' },
      {
        type: 'list',
        items: [
          '**Grace Time (Entry / Exit):** Minutes an employee can clock in late or clock out early without any penalty.',
          '**Late Entry:** How many minutes beyond grace still counts as "Late", and how many late entries are allowed per month before stricter rules apply.',
          '**Early Exit:** Same logic as Late Entry, but for leaving before shift end.',
          '**Permission:** Min/max minutes per permission occurrence, total monthly pool, and the rounding increment for deductions.',
          '**Allow Employee Manual Clock In/Out:** When enabled, employees can clock in/out without face recognition.'
        ]
      },
      {
        type: 'tip',
        text: 'Click **Save Changes** after any update. Settings take effect on the next attendance processing cycle.'
      }
    ]
  },
  {
    id: 'settings-overtime',
    module: 'Settings',
    title: 'Overtime Settings',
    summary: 'Enable overtime system-wide and configure thresholds, rounding, calculation timing, and OT rate multiplier.',
    tags: ['overtime settings', 'ot settings', 'ot threshold', 'ot rounding', 'ot multiplier', 'overtime configuration', 'link with payroll'],
    relatedPages: ['/overtime/settings'],
    content: [
      {
        type: 'paragraph',
        text: 'Overtime Settings control the global rules that determine when and how overtime hours are counted and priced. All OT pages depend on this configuration being enabled first.'
      },
      { type: 'heading', text: 'Master Toggles' },
      {
        type: 'list',
        items: [
          '**Enable Overtime Calculation:** The master on/off switch. When off, OT Sync and Processing are disabled across the system.',
          '**OT Linked with Payroll:** When enabled, the "OT Linked" option appears on the Payroll Process page so approved OT amounts are added to payslips.'
        ]
      },
      { type: 'heading', text: 'Key Configuration Settings' },
      {
        type: 'list',
        items: [
          '**Calculation Timing:** Choose whether OT is counted Before Shift Start only, After Shift End only, or Both.',
          '**Threshold (minutes):** Minimum extra minutes before OT is triggered. Below this, no OT is recorded.',
          '**Rounding Interval & Method:** Snap calculated OT to the nearest interval (10/15/30/60 min). Method options: Nearest, Midpoint, or Start (always round down).',
          '**Rounding Mode (when timing is "Both"):** Apply rounding separately to before-shift and after-shift OT, or to the combined total.',
          '**Monthly Hours Strategy:** Choose Fixed Days (e.g. 26 days) or Calendar Days to derive the hourly rate divisor.',
          '**OT Multiplier:** The wage factor applied to the hourly rate (e.g. 1.5x for time-and-a-half). Use the quick presets (1.0x / 1.5x / 2.0x) or enter a custom value.'
        ]
      },
      {
        type: 'tip',
        text: 'Use the **Calculation Preview** panel (toggle "Show Calculation Preview") to test your current settings against sample shift and clock-in/out times before saving.'
      },
      {
        type: 'warning',
        text: 'All configuration fields are only visible when the master toggle is ON. Click **Save Configuration** after every change.'
      }
    ]
  },
  {
    id: 'settings-statutory',
    module: 'Settings',
    title: 'Statutory Configuration',
    summary: 'Configure PF, ESI, Professional Tax, and TDS calculations.',
    tags: ['statutory', 'pf', 'esi', 'tds', 'professional tax', 'compliance'],
    relatedPages: ['/statutory'],
    content: [
      { type: 'paragraph', text: 'Statutory settings allow you to map components to compliance deductions.' },
      { type: 'heading', text: 'Setting up PF / ESI' },
      {
        type: 'steps', items: [
          'Enable the required elements in the company settings.',
          'Go to Statutory Configuration.',
          'Select whether it applies equally to all employees or varies.',
          'Link it to your base payroll components (e.g., Basic) to calculate the deduction percentage automatically.'
        ]
      }
    ]
  },
  {
    id: 'settings-users',
    module: 'Settings',
    title: 'User Management & Roles',
    summary: 'Manage user access levels across Admin, HR Team, and Employee roles.',
    tags: ['users', 'roles', 'admin', 'change role', 'access'],
    relatedPages: ['/settings/user-management'],
    content: [
      { type: 'paragraph', text: 'The User Management page lists all profiles registered to your workspace and allows Administrators to adjust their core system privileges.' },
      { type: 'heading', text: 'Understanding Roles' },
      {
        type: 'list', items: [
          'Admin: Full system configuration access. (Note: You cannot change your own role).',
          'HR Team: Full access initially, but Admins can restrict their specific permissions using the Screen Access Control module.',
          'Employee: Restricted portal allowing users to view only their own personal data (such as attendance, leaves, and payslips).'
        ]
      },
      { type: 'heading', text: 'How to Change Roles' },
      {
        type: 'steps', items: [
          'Navigate to [[Settings → User Management|/dashboard/settings/user-management]].',
          'Use the dropdown in the Actions column to change their role.',
          'The change takes effect immediately.'
        ]
      },
    ]
  },

  {
    id: 'settings-smtp',
    module: 'Settings',
    title: 'SMTP Configuration',
    summary: 'Setup email servers to send notifications and payslips.',
    tags: ['smtp', 'email', 'notifications', 'payslip email', 'config'],
    relatedPages: ['/settings/smtp-configuration'],
    content: [
      { type: 'paragraph', text: 'Configure outbound email routing for system alerts and payslips. It is crucial to have the correct Host and Port combinations.' },
      { type: 'heading', text: 'Required Fields' },
      {
        type: 'list', items: [
          'SMTP Host / Server: The address of your email server (e.g., smtp.gmail.com).',
          'Port: Typically 587 (TLS) or 465 (SSL).',
          'Username & Password: The credentials used to authenticate with your server.',
          'Sender Information: The email and display name that will appear on outgoing messages.'
        ]
      },
      { type: 'heading', text: 'Testing & Saving' },
      {
        type: 'steps', items: [
          'Fill in all the required fields and select the correct Encryption Type.',
          'Click the "Test Connection" button to verify the system can reach your host using those credentials.',
          'If the test succeeds, click "Save Configuration".'
        ]
      },
    ]
  },
  {
    id: 'access-control',
    module: 'Settings',
    title: 'Screen Access Control',
    summary: 'Manage which pages and menus your HR Team and Employees can see.',
    tags: ['user access', 'screen access', 'menu', 'permissions', 'hide', 'roles'],
    relatedPages: ['/access-control'],
    content: [
      { type: 'paragraph', text: 'The Screen Access Control module allows Administrators to completely hide or reveal specific menus and pages for individual users.' },
      { type: 'heading', text: 'How to Grant or Disable Screen Access' },
      {
        type: 'steps', items: [
          'Navigate to [[Settings → Screen Access Control|/dashboard/access-control]].',
          'On the left side, you will see a list of all non-admin users (e.g., your HR Team members and standard Employees).',
          'Select the specific employee whose permissions you want to modify.',
          'On the right side, you will see a list of all application screens. Toggle the switch next to a page name to modify their access.',
          'Enable: Gives the employee permission to access and view that page.',
          'Disable: Disables access and entirely hides that menu from the employee.'
        ]
      },
      { type: 'warning', text: 'Admin accounts have universal access by default and therefore will not appear in the user list.' }
    ]
  }
  ,

  // -- EMPLOYEE INVITE --
  {
    id: 'employee-invite',
    module: 'Employees',
    title: 'Employee & HR Team Invite',
    summary: 'Send portal login invitations to employees and HR team members.',
    tags: ['invite', 'employee invite', 'hr invite', 'portal access', 'login invitation'],
    relatedPages: ['/employee-invite'],
    content: [
      { type: 'paragraph', text: 'The Employee Invite page allows Admins to grant portal login access to employees and new HR Team members.' },
      { type: 'heading', text: 'Inviting Employees' },
      {
        type: 'steps', items: [
          'Go to [[Employee Invite|/dashboard/employee-invite]] from the sidebar.',
          'The list shows all active employees who have not yet accepted an invitation.',
          'Search and select one or more employees using the checkboxes.',
          'Click "Send Invite" — a login invitation email is dispatched to each selected employee.'
        ]
      },
      { type: 'heading', text: 'Invite Statuses' },
      {
        type: 'list', items: [
          'Pending: The invitation has been sent and is awaiting acceptance (valid for 24 hours).',
          'Accepted: The employee has registered and activated their account.',
          'Expired: The 24-hour window has passed. You can re-send the invite.'
        ]
      },
      { type: 'heading', text: 'Inviting an HR Team Member' },
      {
        type: 'steps', items: [
          'In the HR Team section, enter the person\'s Full Name and Email.',
          'Click Send Invite — they will receive a registration link with the HR Team role pre-assigned.'
        ]
      },
      { type: 'warning', text: 'SMTP must be configured under Settings -> SMTP Configuration for invitation emails to be delivered.' }
    ]
  },

  // -- PAYROLL: COMPONENT MASTER --
  {
    id: 'component-master',
    module: 'Payroll',
    title: 'Payroll Component Master',
    summary: 'Create and manage the building blocks (earnings and deductions) used in salary structures.',
    tags: ['component master', 'payroll components', 'earnings', 'deductions', 'allowances', 'formula'],
    relatedPages: ['/component-master'],
    content: [
      { type: 'paragraph', text: 'The Component Master is where you define every earning and deduction item that can be used inside a Salary Structure.' },
      { type: 'heading', text: 'Component Types' },
      {
        type: 'list', items: [
          'Earning: Components that add to an employee\'s salary (e.g., Basic, HRA, Travel Allowance).',
          'Deduction: Components that reduce the net pay (e.g., PF, ESI, Professional Tax).'
        ]
      },
      { type: 'heading', text: 'Amount Types' },
      {
        type: 'list', items: [
          'Fixed: A constant rupee value applied to all assigned employees.',
          'Percentage: Calculated as a percentage of another component (e.g., HRA = 40% of Basic).',
          'Formula: Uses the Formula Builder to compute dynamically.'
        ]
      },
      { type: 'heading', text: 'Adding a Component' },
      {
        type: 'steps', items: [
          'Go to [[Payroll → Component Master|/dashboard/component-master]].',
          'Click "Add Component".',
          'Enter the Name, select Earning or Deduction, and choose the Amount Type.',
          'For Percentage types, specify the base component.',
          'Click Save.'
        ]
      },
      { type: 'tip', text: 'Create all required components here before building any Salary Structure.' }
    ]
  },

  // -- PAYROLL: SALARY STRUCTURES --
  {
    id: 'salary-structures',
    module: 'Payroll',
    title: 'Salary Structures',
    summary: 'Design salary templates by combining payroll components with calculation rules.',
    tags: ['salary structure', 'ctc', 'structure', 'pay structure', 'create structure'],
    relatedPages: ['/salary-structures'],
    content: [
      { type: 'paragraph', text: 'A Salary Structure is a named template that groups Payroll Components together with their calculation rules. Multiple structures can exist for different employee grades.' },
      { type: 'heading', text: 'Creating a Salary Structure' },
      {
        type: 'steps', items: [
          'Go to [[Payroll → Salary Structures|/dashboard/salary-structures]].',
          'Click "Create Structure".',
          'Give the structure a name (e.g., "Executive Grade", "Management Grade").',
          'Add components from the Component Master by selecting them from the dropdown.',
          'For each component, set the calculation method (Fixed or % of another component).',
          'Click Save Structure.'
        ]
      },
      { type: 'tip', text: 'Structure templates are shared across employees. Individual salary amounts are set during the Structure Assignment step.' }
    ]
  },

  // -- PAYROLL: STRUCTURE ASSIGNMENTS --
  {
    id: 'structure-assignments',
    module: 'Payroll',
    title: 'Structure Assignments',
    summary: 'Assign salary structures to employees and define their individual component values.',
    tags: ['structure assignment', 'assign salary', 'employee salary', 'ctc assignment', 'individual salary'],
    relatedPages: ['/structure-assignments'],
    content: [
      { type: 'paragraph', text: 'After creating a Salary Structure, you must assign it to specific employees and define the individual salary values for each.' },
      { type: 'heading', text: 'Assigning a Structure' },
      {
        type: 'steps', items: [
          'Go to [[Structure Assignments|/dashboard/structure-assignments]].',
          'Select a Salary Structure from the dropdown.',
          'Click "Add Assignment" to select one or more employees.',
          'For components with Individual type, set the exact rupee value for each employee.',
          'Click Save Assignments.'
        ]
      },
      { type: 'heading', text: 'Pay Days Configuration' },
      { type: 'paragraph', text: 'For each structure, you can choose between Calendar Days (actual month days) or a Custom fixed number of working days for pro-rata salary calculations.' },
      { type: 'warning', text: 'An employee must have a Structure Assignment before they can appear in the Payroll Process page.' }
    ]
  },

  // -- PAYROLL: PAYROLL PROCESS --
  {
    id: 'payroll-process',
    module: 'Payroll',
    title: 'Payroll Processing',
    summary: 'Execute monthly payroll for all assigned employees, review results, and finalize.',
    tags: ['payroll process', 'run payroll', 'process payroll', 'salary execution', 'payslip', 'finalize'],
    relatedPages: ['/payroll-process'],
    content: [
      { type: 'paragraph', text: 'The Payroll Process page computes net salaries for all employees who have a salary structure assigned. Before running payroll, ensure attendance records and leave records.' },

      { type: 'warning', text: 'Before processing: Employees showing "Unauthorized Absence" means their attendance is missing or incomplete. Go to [[Timestamp Management|/dashboard/time-stamp-management]] to select and correct their clock-in/out records.' },

      { type: 'tip', text: 'Before processing: If an employee was absent and submitted a leave request, approve it first. Go to [[Leave Page|/dashboard/leave]] to approve pending requests before running payroll. Approved leaves prevent unauthorized absence deductions.' },

      { type: 'heading', text: 'Step 1 — Run Payroll' },
      {
        type: 'steps', items: [
          'Go to [[Payroll Process|/dashboard/payroll-process]].',
          'Select the Pay Period Start and End dates.',
          'Select the Salary Structure to process.',
          'Optionally enable "OT Linked" to include approved Overtime amounts.',
          'Select employees using the checkboxes.',
          'Click "Process Selected" — the system calculates earnings, deductions, and attendance-based on employee.'
        ]
      },

      { type: 'heading', text: 'Step 2 — Review the Monthly Salary Report' },
      { type: 'paragraph', text: 'After processing, verify all employee salary breakdowns in the [[Reports|/dashboard/reports]] section under Monthly Salary Report before Verifying.' },

      { type: 'heading', text: 'Step 3 — Mark as Paid' },
      { type: 'paragraph', text: 'Once verified, go to the [[Payroll|/dashboard/payroll]] page and filter by the processed period. Review each employee\'s Total Amount and mark as Paid.' },
      { type: 'warning', text: 'Once finalized, the payroll period is locked. You cannot reprocess the same period unless you revork it.' }
    ]
  },

  // -- PAYROLL: PAYROLL RECORDS --
  {
    id: 'payroll-records',
    module: 'Payroll',
    title: 'Payroll Records & Export',
    summary: 'View historical payroll entries and export data to CSV.',
    tags: ['payroll records', 'payroll history', 'export payroll', 'csv export', 'payroll list'],
    relatedPages: ['/payroll'],
    content: [
      { type: 'paragraph', text: 'The Payroll Records page shows all finalized payroll entries across all pay periods.' },
      { type: 'heading', text: 'Filtering' },
      { type: 'paragraph', text: 'Use the Period Start, Period End, and Status filters at the top to narrow down the records you want to view.' },
      { type: 'heading', text: 'Exporting to CSV' },
      {
        type: 'steps', items: [
          'Apply any desired filters.',
          'Click the "Export" button in the top-right corner.',
          'A CSV file with employee names, departments, salary components, and net pay will download automatically.'
        ]
      }
    ]
  },

  // -- PAYROLL: PAYSLIP SENDER --
  {
    id: 'payslip-sender',
    module: 'Payroll',
    title: 'Payslip Sender',
    summary: 'Manage outbound email delivery of employee monthly payslips.',
    tags: ['payslip sender', 'send payslip', 'email payslip', 'automated dispatch', 'bulk email', 'email logs'],
    relatedPages: ['/payslip-sender'],
    content: [
      { type: 'paragraph', text: 'The Payslip Sender module allows you to dispatch secure employee payslips via email. You can configure automatic dispatches or send them in bulk manually.' },
      { type: 'heading', text: 'Automated Dispatch' },
      {
        type: 'list', items: [
          '**How it works:** When enabled, marking any payroll entry as **Paid** will automatically trigger a payslip email to that employee.',
          '**Enabling/Disabling:** Toggle the **Automated Payslip Dispatch** banner at the top of the page. This is a global setting.'
        ]
      },
      { type: 'heading', text: 'Manually Dispatching Payslips' },
      {
        type: 'steps', items: [
          'Select the desired **Pay Period** using the month picker.',
          'Filter the employee roster by searching or utilizing the **Payroll Status** filter (e.g. Paid, Draft, Not Processed).',
          'Only employees with **Approved** or **Paid** payroll entries are eligible for dispatch.',
          'Select individual employees or use **Select All Eligible** to choose all qualified entries.',
          'Click **Send Payslips to Selected** to initiate the dispatch process.'
        ]
      },
      { type: 'heading', text: 'Email Logs & Tracking' },
      {
        type: 'list', items: [
          '**Activity Feed:** The lower panel displays recent outbound payslip logs. You can track status (sent, failed, queued), timestamps, and specific error messages if delivery failed.',
          '**Bulk Clean-up:** Admins can select multiple logs and click the delete button to purge historical records.'
        ]
      },
      { type: 'warning', text: 'Before dispatching emails, make sure SMTP is configured under Settings → SMTP Configuration.' }
    ]
  },

  // -- OVERTIME --
  {
    id: 'overtime-structures',
    module: 'Overtime',
    title: 'OT Structures',
    summary: 'Create and manage the overtime calculation rules used for computing OT pay.',
    tags: ['ot structures', 'overtime', 'ot rate', 'overtime rules', 'create ot structure'],
    relatedPages: ['/overtime/structures'],
    content: [
      {
        type: 'paragraph',
        text: 'OT Structures define how overtime is calculated — the rate multiplier, eligible salary components, and rounding rules. You must create at least one structure before OT can be processed.'
      },
      { type: 'heading', text: 'Creating a Structure' },
      {
        type: 'steps',
        items: [
          'Click **Create Structure** and give it a name.',
          'After creation, the Edit modal opens automatically — configure the rate, eligible components, and rounding settings.',
          'Set the structure to Active when ready.'
        ]
      },
      {
        type: 'tip',
        text: 'Click **Edit** on an existing structure card to update its rules. Click the trash icon to delete — deletion is permanent and cannot be undone.'
      }
    ]
  },

  {
    id: 'overtime-employees',
    module: 'Overtime',
    title: 'OT Employees',
    summary: 'Control which employees are eligible to earn overtime pay.',
    tags: ['ot employees', 'overtime eligibility', 'ot eligible', 'overtime employee management'],
    relatedPages: ['/overtime/employees'],
    content: [
      {
        type: 'paragraph',
        text: 'The OT Employees page lets Admins toggle overtime eligibility per employee. Only eligible employees will have their extra hours computed and sent for approval.'
      },
      { type: 'heading', text: 'Enabling / Disabling OT' },
      {
        type: 'list',
        items: [
          '**Single toggle:** Click the green/grey toggle on any employee row to flip their eligibility instantly.',
          '**Bulk action:** Select multiple employees using the checkboxes, then click **Enable Selected** or **Disable Selected**.',
          '**Notes:** Use the Add/Edit Notes button to record a reason for any eligibility change (e.g., contractual exceptions).'
        ]
      }
    ]
  },

  {
    id: 'overtime-timestamps',
    module: 'Overtime',
    title: 'OT Time Stamp Management',
    summary: 'Review, correct, approve, or reject individual overtime records before they go to payroll.',
    tags: ['ot approvals', 'ot timestamp', 'overtime approval', 'approve ot', 'reject ot', 'revoke ot', 'ot sync'],
    relatedPages: ['/overtime/approvals'],
    content: [
      {
        type: 'paragraph',
        text: 'This page shows all overtime records generated from attendance data. Each record must be approved here before it can be included in payroll.'
      },
      { type: 'heading', text: 'Approving OT' },
      {
        type: 'steps',
        items: [
          'Filter by date range and status to find records.',
          'Click ✓ (Approve) to approve a single record, or select multiple and click **Approve Selected** for bulk approval.',
          'Click ✗ (Reject) — a mandatory rejection reason is required before confirming.'
        ]
      },
      { type: 'heading', text: 'Editing OT Hours' },
      {
        type: 'paragraph',
        text: 'Click the Edit (pencil) icon on a Pending record to correct the hours. Enter the adjusted time in HH:MM format and provide a mandatory modification reason. The system validates against the minimum threshold and applies rounding automatically.'
      },
      { type: 'heading', text: 'Revoking & Syncing' },
      {
        type: 'list',
        items: [
          '**Revoke:** On an Approved or Rejected record, click the Revoke (↩) icon to move it back to Pending. A reason is required.',
          '**Manual OT Sync:** Click the **Manual OT Sync** button to re-scan attendance data for the selected date range and generate new OT records for eligible employees.'
        ]
      },
      {
        type: 'warning',
        text: 'If the OT system is disabled in Company Settings, the Manual OT Sync button will be greyed out.'
      }
    ]
  },

  {
    id: 'overtime-processing',
    module: 'Overtime',
    title: 'OT Processing',
    summary: 'Calculate, batch-approve, and finalize overtime amounts before payroll.',
    tags: ['ot processing', 'overtime processing', 'process ot', 'ot worksheet', 'pending ot', 'approved ot'],
    relatedPages: ['/overtime/processing'],
    content: [
      {
        type: 'paragraph',
        text: 'OT Processing is where eligible overtime records are computed into final rupee amounts and finalized for payroll inclusion. It has three tabs: Process OT, Pending OT, and Approved OT.'
      },
      { type: 'heading', text: 'Process OT Tab' },
      {
        type: 'paragraph',
        text: 'Use the OT Worksheet to select employees and a date range, then run the calculation. The system reads approved OT hours from the Timestamps page and computes the pay amount using the assigned OT Structure.'
      },
      { type: 'heading', text: 'Pending OT Tab' },
      {
        type: 'paragraph',
        text: 'Lists all processed OT records but not yet finalized OT records. Select records and click **Bulk Approve** to finalize them, or use the individual **Approve** button.'
      },
      { type: 'heading', text: 'Approved OT Tab' },
      {
        type: 'paragraph',
        text: 'Shows all finalized OT amounts with a summary of total employees, total hours, and total payout. Use **Revoke** to push a record back to Pending if a correction is needed.'
      },
      {
        type: 'tip',
        text: 'Once OT is finalized here, enable **OT Linked** when running payroll on the [[Payroll Process|/dashboard/payroll-process]] page to automatically include the approved OT amounts in salary calculations.'
      }
    ]
  },

  // -- ADVANCES --
  {
    id: 'advances-module',
    module: 'Advances',
    title: 'Advances',
    summary: 'Request, approve, and auto-deduct employee salary advances across payrolls.',
    tags: ['advance', 'loan', 'advance request', 'advance approval', 'salary advance'],
    relatedPages: ['/advances', '/advances/request', '/advances/approval'],
    content: [
      { type: 'paragraph', text: 'Employees can request partial salary advances which are then repaid automatically through deductions across future payrolls.' },
      { type: 'heading', text: 'Requesting an Advance' },
      {
        type: 'steps', items: [
          'Go to [[Advances → Request|/dashboard/advances/request]].',
          'Enter the advance amount and the requested repayment tenure (months).',
          'The system checks against policy limits set in Settings -> Advance Settings.',
          'Submit the request for Admin or HR approval.'
        ]
      },
      { type: 'heading', text: 'Approving an Advance' },
      {
        type: 'steps', items: [
          'Go to [[Advances → Approval|/dashboard/advances/approval]].',
          'Review pending requests and click Approve or Reject.',
          'On approval, the monthly deduction amount is calculated and added to the employee\'s payroll deductions automatically.'
        ]
      }
    ]
  },

  {
    id: 'advance-settings',
    module: 'Advances',
    title: 'Advance Settings',
    summary: 'Configure default rules, limits, and policies for employee advance requests and repayments.',
    tags: ['advance', 'salary advance', 'loan settings', 'installments'],
    relatedPages: ['/advances/settings'],
    content: [
      {
        type: 'paragraph',
        text: 'Advance Settings allow you to define how employee advances are handled, including interest rates, maximum limits, repayment duration, and mandatory policies. These settings are automatically applied when employees request advances.'
      },
      {
        type: 'steps',
        items: [
          'Navigate to [[Advance Settings|/dashboard/advances/settings]].',
          'In the "Interest Rate" section, enter the Default Interest Rate (%). Use 0 for interest-free advances.',
          'In the "Amount Limits" section, set the Maximum Advance Amount. Leave it blank if there is no limit.',
          'In the "Installment Configuration" section, define the Minimum Installments (minimum repayment months).',
          'Set the Maximum Installments (maximum repayment duration allowed).',
          'In the "Advance Policies" section, enable "Require Justification" if employees must provide a reason when requesting an advance.',
          'Review all configurations carefully.',
          'Settings are applied automatically (or saved based on your system behavior).'
        ]
      },
      {
        type: 'warning',
        text: 'These settings directly impact how advances are requested, approved, and deducted in payroll. Incorrect configuration may lead to invalid requests or payroll miscalculations.'
      }
    ]
  },

  // -- REPORTS --
  {
    id: 'reports',
    module: 'Reports',
    title: 'Reports',
    summary: 'Generate and export HR, payroll, and statutory reports across three categories.',
    tags: ['reports', 'payroll report', 'attendance report', 'leave report', 'overtime report', 'statutory report', 'employee master', 'payslip', 'download report'],
    relatedPages: ['/reports'],
    content: [
      {
        type: 'paragraph',
        text: 'The Reports page organises all downloadable data into three tabs: Employee Master, Transaction, and Statutory. Employees see only their own payslip and leave data; Admins and HR see all reports.'
      },
      { type: 'heading', text: 'Employee Master Tab (Admin/HR only)' },
      {
        type: 'list',
        items: [
          '**Basic Information** — Employee profile details.',
          '**Salary Structure** — Salary component assignments per employee.',
          '**Tax Declarations** — Declared tax investments and exemptions.',
          '**Department / Designation** — Org-structure breakdown.',
          '**Holiday** — Company holiday list.'
        ]
      },
      { type: 'heading', text: 'Transaction Tab' },
      {
        type: 'list',
        items: [
          '**Monthly Salary** — Full earnings and deductions for a pay period. *(Admin/HR only)*',
          '**Payslip** — Individual payslip view. *(Available to Employees for their own data)*',
          '**Attendance** — Daily attendance status over a date range.',
          '**Leave Balances** — Leave granted, taken, and remaining per employee.',
          '**Overtime** — Approved OT hours and amounts. *(Admin/HR only)*',
          '**Permission Balance** — Permission minutes used vs. monthly limit. *(Admin/HR only)*'
        ]
      },
      { type: 'heading', text: 'Statutory Tab (Admin/HR only)' },
      {
        type: 'list',
        items: [
          '**Tax Deduction** — TDS deduction summary.',
          '**Provident Fund** — PF contribution breakdowns.',
          '**Professional Tax** — PT deductions by employee.'
        ]
      },
    ]
  },


  // -- WORK LOCATION & TRACKING --
  {
    id: 'location-employee-work',
    module: 'Location',
    title: 'My Work Journey',
    summary: 'Manage your daily work travel, track locations, and manage work sessions.',
    tags: ['my work journey', 'start work', 'start journey', 'location tracking', 'add new location', 'offline location'],
    relatedPages: ['/work-location'],
    content: [
      {
        type: 'paragraph',
        text: 'The My Work Journey page helps you log your daily field work, spanning travel to the site, working, and returning.'
      },
      { type: 'heading', text: 'The Journey Workflow' },
      {
        type: 'steps',
        items: [
          '**Start Journey:** Click this when you begin travel to your assigned worksite.',
          '**Reached Location:** Click once you arrive at the coordinate boundary.',
          '**Start Work:** Begins your actual work session (and live tracking if enabled).',
          '**Pause/Resume Work:** Use this if you need to pause. The system may also auto-pause if you go offline or leave the radius.',
          '**Complete Work:** Ends the session for this site.',
          '**Return & Next:** Choose to "Start Return Journey" (head back) or "Add New Location" if you are travelling to another site.'
        ]
      },
      { type: 'heading', text: 'Tracking & Alerts' },
      {
        type: 'list',
        items: [
          '**Radius Monitoring:** The dashboard shows a "Within Work Area" indicator. If you leave the allowed radius, you will be flagged.',
        ]
      }
    ]
  },

  {
    id: 'location-live-tracking',
    module: 'Location',
    title: 'Live Tracking Dashboard',
    summary: 'Real-time GPS visibility of field employees.',
    tags: ['live tracking', 'gps tracking', 'employee location', 'map tracking'],
    relatedPages: ['/location-tracking'],
    content: [
      {
        type: 'paragraph',
        text: 'The Live Tracking Dashboard gives Admins real-time visibility over all employees currently traveling or working.'
      },
      { type: 'heading', text: 'Map & Worker List' },
      {
        type: 'list',
        items: [
          '**Active Workers Panel:** Lists employees currently active. Badges show real-time states like TRAVELING, PAUSED, or OFFLINE.',
          '**Map View:** Displays the employee (Green Marker) against the assigned work site (Red Marker). A dashed Distance Gap Line appears between them.',
          '**Radius Overlay:** Shows the allowed radius. It turns red if the employee breaches the boundary.',
          '**Location Pings:** Click on an employee on the list or map to view their last known ping time and exact distance from the center.'
        ]
      }
    ]
  },

  {
    id: 'location-approval',
    module: 'Location',
    title: 'Work Location Approvals',
    summary: 'Review field work logs, view journey timelines, and approve travel allowances.',
    tags: ['work location approval', 'approve journey', 'travel allowance', 'journey timeline', 'map view'],
    relatedPages: ['/work-location-approval'],
    content: [
      {
        type: 'paragraph',
        text: 'Review daily journey logs and approve them for payroll inclusion. Pending work is grouped by employee and date.'
      },
      { type: 'heading', text: 'Reviewing Work' },
      {
        type: 'list',
        items: [
          '**Timeline (Clock icon):** View the exact sequence of events (e.g., Start Journey → Reached → Start Work → Paused).',
          '**Map View (Map icon):** Visualise the full day\'s travel route and the locations worked at.',
          '**Violations (Warning icon):** Check if the employee breached the allowed radius.'
        ]
      },
      { type: 'heading', text: 'Approval & Allowances' },
      {
        type: 'steps',
        items: [
          'Click the **Approve** button.',
          'If a travel allowance is applicable for the journey, enter it in the Work Amount field.',
          'If denying, click **Deny** and provide a mandatory reason.'
        ]
      }
    ]
  },

  {
    id: 'location-settings',
    module: 'Location',
    title: 'Location Tracking Settings',
    summary: 'Configure map providers, tracking intervals, and automated monitoring options.',
    tags: ['location settings', 'google maps api', 'tracking interval', 'radius monitoring'],
    relatedPages: ['/location-settings'],
    content: [
      {
        type: 'paragraph',
        text: 'Control behaviour for live tracking and maps across the organisation. Changes take effect immediately.'
      },
      { type: 'heading', text: 'Map Provider' },
      {
        type: 'paragraph',
        text: 'By default, the system uses OpenStreetMap. Toggle **Enable Google Maps** to switch providers. You must provide a valid API key with Maps JS, Geocoding, and Places APIs enabled. Click **Validate** to test.'
      },
      { type: 'heading', text: 'Tracking Intervals & Boundaries' },
      {
        type: 'list',
        items: [
          '**Live GPS Tracking:** Determines the polling frequency (in minutes) while traveling.',
          '**Radius Monitoring:** Determines how often the system checks if the employee is within the allowed boundary while actually working.',
          '**Add New Location:** If enabled, employees can dynamically add new sites to visit during their day without requesting HR first.'
        ]
      }
    ]
  },

  // -- HOLIDAYS --
  {
    id: 'holidays',
    module: 'Attendance',
    title: 'Holidays',
    summary: 'Define public, company, and recurring weekly holidays that impact attendance and payroll calculations.',
    tags: ['holiday', 'holidays', 'public holiday', 'weekly holiday'],
    relatedPages: ['/holidays'],
    content: [
      {
        type: 'paragraph',
        text: 'Holidays configured here are automatically applied during attendance and payroll processing. Employees will not be marked absent or penalized on these dates, including recurring weekly holidays.'
      },
      {
        type: 'steps',
        items: [
          'Navigate to [[Holidays|/dashboard/holidays]].',
          'Click on the "Add Holiday" button.',
          'Enter the Holiday Name.',
          'Select the Holiday Type (e.g., Public Holiday or Company Holiday).',
          'To create a recurring weekly holiday, enable "Weekly Holiday".',
          'Select one or more days (e.g., Sunday, Saturday) for the weekly holiday.',
          'If it is a one-time holiday, choose the specific Date.',
          'Add a Description .',
          'Click "Save Holiday" to apply the changes.'
        ]
      }
    ]
  },

  // -- HIK DEVICE EMPLOYEES --
  {
    id: 'hik-device-employees',
    module: 'Attendance',
    title: 'Hikvision Device Employees',
    summary: 'Enroll employees on biometric devices and sync attendance data.',
    tags: ['hikvision', 'biometric', 'device sync', 'face enrol device', 'hik device'],
    relatedPages: ['/attendance/hik-device-employees'],
    content: [
      { type: 'paragraph', text: 'This module connects to your Hikvision biometric hardware to manage employee enrolments and pull attendance timestamps.' },
      {
        type: 'steps', items: [
          'Go to [[Attendance → Device Employees|/dashboard/attendance/device-employees]].',
          'Select the target device from the device list.',
          'Check the employees you want to upload and click "Upload to Device".',
          'To pull attendance records, In the Manual Device Fetch section select the device and the date range and click fetch — the timestamps will appear in [[Clock in/out page|/dashboard/attendance/clock-in-out]] or view in the [[Timestamp management page|/dashboard/attendance/timestamp-management]].'
        ]
      },
      { type: 'tip', text: 'Configure device credentials under [[Hik Device Controller|/dashboard/settings/hik-device-controller]] before attempting to sync.' }
    ]
  },

  {
    id: 'hikvision-controller',
    module: 'Settings',
    title: 'Hikvision Controller',
    summary: 'Configure and manage biometric devices to sync attendance data automatically.',
    tags: ['hikvision', 'biometric', 'device', 'attendance sync'],
    relatedPages: ['/settings/hik-device-controller'],
    content: [
      {
        type: 'paragraph',
        text: 'The Hikvision Controller allows you to connect biometric devices, manage their configurations, and automatically sync attendance records into the system.'
      },
      {
        type: 'steps',
        items: [
          'Navigate to [[Hik Device Controller|/dashboard/settings/hik-device-controller]].',
          'Click on "Add" to register a new device.',
          'Enter the Device Name.',
          'Provide the Device IP and Port (e.g., 192.168.x.x:port).',
          'Enter the Device Username and Password.',
          'Click "Test Connection" to verify connectivity.',
          'Enable the device using the toggle switch.',
          'Optionally enable "Background Auto-Sync" to fetch attendance records automatically.',
          'Click "Save Configuration & Update Device" to apply the settings.'
        ]
      },
      {
        type: 'warning',
        text: 'Ensure the device is accessible over the network and credentials are correct. Incorrect configuration will prevent attendance data from syncing.'
      }
    ]
  },

  // -- VISITOR CAPTURES --
  {
    id: 'visitor-captures',
    module: 'Attendance',
    title: 'Visitor Captures',
    summary: 'View captured visitor photos by web cam attendance.',
    tags: ['visitor', 'visitor capture', 'device visitor', 'biometric'],
    relatedPages: ['/visitor-records'],
    content: [
      {
        type: 'paragraph',
        text: 'This page displays photos of unrecognized individuals or visitors captured by web cam attendance.'
      },
      { type: 'heading', text: 'Viewing Visitor History' },
      {
        type: 'list',
        items: [
          'Click on any visitor photo card to view their complete history.',
          'The resulting modal shows their Total Visits and a detailed log of exact entry/exit timestamps.'
        ]
      }
    ]
  },

  // -- WORK LOCATION ASSIGNMENT --
  {
    id: 'work-location-assignment',
    module: 'Location',
    title: 'Work Location Assignment',
    summary: 'View and manage work locations assigned to employees via gate passes.',
    tags: ['work location assignment', 'assigned location', 'gate pass location'],
    relatedPages: ['/work-location-assignment'],
    content: [
      {
        type: 'paragraph',
        text: 'This page provides a directory of all active work locations currently assigned to your employees for field tracking.'
      },
      { type: 'heading', text: 'Understanding Assignments' },
      {
        type: 'paragraph',
        text: 'Assigned  work location to an employee, you must create a **Paid Gate Pass** (via [[Gate Pass|/dashboard/gate-passes]]) and assign the location during the gate pass creation process.'
      },
      { type: 'heading', text: 'Monitoring Locations' },
      {
        type: 'list',
        items: [
          'Use the Search & Filter controls to locate specific employees or assignment statuses.',
          'Click the blue location address link on any assignment row to open the Map Modal. This visually plots the employee\'s assigned work location and designated boundary radius.'
        ]
      }
    ]
  },
  {
    id: 'employee-payslip',
    module: 'Reports',
    title: 'Downloading Your Payslip',
    summary: 'View and download your monthly salary slip.',
    tags: ['payslip', 'salary slip', 'download', 'pay slip'],
    relatedPages: ['/reports'],
    content: [
      {
        type: 'paragraph',
        text: 'Employees can download their monthly payslips directly from the Reports page.'
      },
      {
        type: 'steps',
        items: [
          'Navigate to the [[Reports|/dashboard/reports]] page.',
          'Select the desired month and year from the date picker.',
          'Click on the **Payslip** tab.',
          'Click the **Download** button to save your payslip as a PDF.'
        ]
      }
    ]
  },
  // -- SHIFT ATTENDANCE REPORT SENDER --
  {
    id: 'shift-attendance-notifier',
    module: 'Settings',
    title: 'Shift Attendance Notifier Settings',
    summary: 'Configure automated shift attendance reports delivered daily via email to designated recipients.',
    tags: ['shift report', 'report sender', 'automated report', 'attendance email', 'email broadcast', 'cron report', 'auto send', 'testing sample'],
    relatedPages: ['/settings/shift-attendance-notifier'],
    content: [
      {
        type: 'paragraph',
        text: 'The Shift Attendance Notifier allows administrators and managers to configure automated daily email summaries of shift attendance. Once set up, the system compiles attendance metrics (Total employees assigned to the shift, Present "Clocked In" employees, Absent "Not Clocked In" employees, and Unassigned Employees "Clocked In" ) and dispatches them directly to your designated recipients.'
      },
      { type: 'heading', text: 'Key Parameters' },
      {
        type: 'list',
        items: [
          '**Shift Target:** The system automatically monitors active shifts configured in your workspace.',
          '**Sending Gap (Offset):** Set the exact number of minutes after a shift starts when the automated report should be compiled and sent (adjustable from 1 to 60 minutes).',
          '**Engine Status:** Displays whether the background automated sending engine is Active or on Standby, alongside the last successful dispatch timestamp.'
        ]
      },
      { type: 'heading', text: 'Managing Broadcast Recipients' },
      {
        type: 'steps',
        items: [
          'Navigate to [[Settings → Shift Attendance Notifier|/dashboard/settings/shift-attendance-notifier]] from the sidebar.',
          'Select existing internal Employees from the list by checking the box next to their name.',
          'To add external users, enter their Name and Email in the External Recipients inputs and click Add.',
          'Ensure all intended recipients have their selection checkbox checked.'
        ]
      },
      { type: 'heading', text: 'Testing & Automated Execution' },
      {
        type: 'steps',
        items: [
          'Click the **Testing** button at the top to instantly dispatch a sample report template with mock attendance data to all selected recipients.',
          'Once verified, click **Start Auto Send** to activate the background automated engine. Note: Configuration settings and recipient selections are locked while automated sending is active.',
          'To modify recipients or timing offset, click **Stop Auto Send** first, make your changes, click **Save**, and then reactivate.'
        ]
      },
      {
        type: 'warning',
        text: 'Stopping the Auto Send will immediately halt daily automated email deliveries to all selected recipients.'
      },
      {
        type: 'tip',
        text: 'Check the Recent Activity Log at the bottom of the page to audit all past report dispatches and delivery statuses.'
      }
    ]
  },
  // -- TIMESTAMP MISMATCH REPORT --
  {
    id: 'timestamp-mismatch-report',
    module: 'Reports',
    title: 'Timestamp Mismatch Report',
    summary: 'Diagnostic report identifying synchronization issues, missing logs, and attendance status discrepancies with actionable resolutions.',
    tags: ['timestamp mismatch', 'mismatch report', 'diagnostic report', 'attendance discrepancy', 'missing clock in', 'missing clock out', 'sync attendance', 'unauthorized absence', 'fix the issue'],
    relatedPages: ['/reports'],
    content: [
      {
        type: 'paragraph',
        text: 'The Timestamp Mismatch Report is an advanced diagnostic report designed to identify inconsistencies between raw clock-in/out timestamps and calculated attendance logs. It help to find root causes of the Unauthorized Absence of an employee while try to process the payroll and provides solutions.'
      },
      { type: 'heading', text: 'Common Inconsistency Scenarios & Solutions' },
      {
        type: 'list',
        items: [
          '**Missing Attendance Logs (Sync Issue):** Raw IN/OUT clock timestamps exist in the system, but the daily attendance record was not generated. *Resolution:* Navigate to [[Attendance Logs|/dashboard/attendance-logs]], select the date, and click "Update".',
          '**Unauthorized Absence:** An employee was scheduled for a shift but has no clock timestamps and no approved leave request on file. *Resolution:* Review pending leave requests or apply for leave on behalf of the employee via [[Attendance → Leave|/dashboard/leave]].',
          '**Single-Sided Clock Events:** An employee clocked IN but forgot to clock OUT. *Resolution:* Navigate to [[Timestamp Management|/dashboard/time-stamp-management]] to manually insert the missing IN or OUT timestamp, then re-sync the attendance log.',
          '**Policy & Status Mismatches:** Valid timestamps exist, but the attendance status was marked as First Off, Second Off, or Absent due to late arrivals or early departures exceeding grace limits without an approved permission or gate pass. *Resolution:* Verify the shift schedule and employee permissions, then adjust the attendance status if warranted.'
        ]
      },
      { type: 'heading', text: 'Exporting & Managing the Report' },
      {
        type: 'steps',
        items: [
          'Navigate to [[Reports|/dashboard/reports]] from the main menu.',
          'Select the **Transaction** report category from the top navigation tabs.',
          'Click on the **Timestamp Mismatch** button in the secondary menu.',
          'Use the global date range, department, and employee filters to isolate specific records.',
          'Click the **Export** dropdown in the top right to download the complete diagnostic audit as an Excel spreadsheet or PDF, or print directly.'
        ]
      },
      {
        type: 'tip',
        text: 'Review the "Fix the Issue" column on the far right of the report grid for direct guidance on exactly which screen to visit to resolve each specific discrepancy.'
      }
    ]
  },
  {
    id: 'payslip-sender',
    module: 'Payroll',
    title: 'Payslip Sender & Automated Dispatch',
    summary: 'Batch dispatch employee payslips via email or configure automated delivery upon payroll approval/payment.',
    tags: ['payslip', 'payslips', 'email', 'dispatch', 'sender', 'auto send', 'payroll'],
    relatedPages: ['/payroll/payslip-sender', '/payroll'],
    content: [
      {
        type: 'paragraph',
        text: 'The Payslip Sender module allows HR administrators and payroll managers to securely dispatch premium, password-protected or formatted HTML payslips directly to employee email addresses. It supports both manual batch selection and automated dispatch workflows.'
      },
      { type: 'heading', text: 'Two Methods for Dispatching Payslips' },
      {
        type: 'list',
        items: [
          '**Method 1: Manual Batch Dispatch:** Search and filter employees by month, department, or keyword (name, code, email). Select eligible employees and click "Send Payslip to Selected" to batch dispatch emails instantly.',
          '**Method 2: Automated Dispatch on Paid Status:** Enable the automated delivery toggle at the top of the screen. When active, any payroll entry transitioned to "Paid" status (either individually or via bulk actions in the Payroll list) will automatically trigger an immediate payslip email dispatch.'
        ]
      },
      { type: 'heading', text: 'Validation Guardrails & Rules' },
      {
        type: 'list',
        items: [
          '**Payroll Processing Requirement:** Employees whose payroll has not been calculated or finalized for the selected month cannot be selected for payslip dispatch. Their status will display as "Payroll Not Processed", preventing accidental blank deliveries.',
          '**Reprocessing & Actioning:** If an employee is un-processed, use the action button to navigate directly to the payroll calculation worksheet to process and generate their salary entry before dispatching.',
          '**Valid Email Check:** The system verifies recipient email addresses prior to dispatch. If an email is invalid or missing, the failure event is recorded in the activity log with the exact reason.'
        ]
      },
      { type: 'heading', text: 'Monitoring & Activity Audit' },
      {
        type: 'paragraph',
        text: 'The bottom section of the Payslip Sender screen provides a real-time activity log. Every delivery attempt — both automated and manual — is recorded with timestamps, delivery status (Sent vs. Failed), and detailed diagnostic error messages.'
      }
    ]
  }
];

export const EMPLOYEE_ALLOWED_ARTICLES = new Set([
  'dashboard-overview',
  'clock-in-out',
  'leave-management',
  'permission-requests',
  'gatepass',
  'advances-module',
  'location-employee-work',
  'employee-payslip'
]);


export function getArticlesForPage(pathname: string, isEmployee: boolean = false): HelpArticle[] {
  // Strip the /dashboard prefix so we can match against relatedPages like '/employees'
  const normalized = pathname.replace(/^\/dashboard/, '') || '/';

  return helpArticles.filter((article) => {
    if (isEmployee && !EMPLOYEE_ALLOWED_ARTICLES.has(article.id)) return false;

    return article.relatedPages.some((p) => {
      // Exact match: e.g. '/employees' === '/employees'
      if (normalized === p) return true;
      // Prefix match for nested pages: e.g. '/attendance/face-enrollment' starts with '/attendance'
      // but only allow if the article page is a genuine parent (avoid false positives)
      if (normalized.startsWith(p + '/')) return true;
      return false;
    });
  });
}

export function searchArticles(query: string, isEmployee: boolean = false): HelpArticle[] {
  const q = query.toLowerCase().trim();
  
  let baseArticles = helpArticles;
  if (isEmployee) {
    baseArticles = baseArticles.filter(a => EMPLOYEE_ALLOWED_ARTICLES.has(a.id));
  }
  
  if (!q) return baseArticles;
  
  return baseArticles.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q)) ||
      a.module.toLowerCase().includes(q)
  );
}
