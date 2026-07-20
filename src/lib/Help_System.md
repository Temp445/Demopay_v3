## Role

You are a **Senior UX Architect, Technical Writer, and Enterprise Software Documentation Specialist**.

Your task is to design a **complete in-application Help System** for a **multi-tenant Payroll system** used for managing employees, attendance, leave, overtime, advances, payroll processing, and settings.

The help system must enable **users to fully operate the application without external documentation or training**.

* * *

# System Context

The application includes:

### Application Scope

* **Major feature modules:** Employees, Attendance & Biometrics (including Hikvision integration), Leave, Overtime (OT), Payroll Processing, Advances, Location Tracking, and Settings/Administration.
* **Serverless Edge Functions** integrated with **Supabase (PostgreSQL)**
* **Email notifications** (SMTP-ready infrastructure)
* **Zustand stores for state management** (`authStore`, `tenantStore`, `notificationStore`, etc.)
* **Dynamic theming** with module-specific colors and Dark/Light mode support
* **Multi-tenant architecture** with complete organization isolation via Row Level Security (RLS)
* **Comprehensive role-based access control (RBAC)** with module, screen, and CRUD-level permission granularity
* **Real-time attendance processing** including facial recognition, live tracking, and location-based validation
* **Complex Overtime (OT) and Payroll Calculation Engine** with custom formula builders and master data management
* **PWA support with offline capability**

* * *

# Help System Objectives

The help system must:

1. Allow users to **understand any page instantly**
2. Explain **how workflows move across modules** (e.g., Attendance to Overtime, then to Payroll)
3. Provide **clear troubleshooting when data is missing**
4. Explain **permissions and role limitations**
5. Support **new users (e.g., employees, new managers) and advanced users (HR/Admins)**
6. Work **inside the application UI**
7. Enable **AI chatbot assistance using system knowledge**

Users should feel **confident performing tasks without external training or manuals**.

* * *

# Required Output Structure

Produce the documentation in the following sections.

* * *

# 1. Help System Architecture

Design the **overall help framework** inside the application.

Include:

* Global help navigation
* Contextual page help
* Guided workflows
* Embedded troubleshooting
* Searchable knowledge base
* AI chatbot integration
* Role-based help visibility

Explain:

* how help content is organized
* how users access help
* how help adapts based on user role
* how multilingual support works

* * *

# 2. Help Navigation UX Design

Design the best **user-friendly help navigation system**.

Include:

### Global Help Access

Examples:

* floating help button
* keyboard shortcut
* help sidebar
* command palette

### Contextual Help

* page-level help
* field-level help (e.g., to explain fields in the Salary Formula Builder or OT Structures)
* tooltips
* guided walkthroughs (e.g., for initial company setup and master data import)

### Progressive Help Layers

Explain the structure:

| Level | Description |
| --- | --- |
| Quick Tips | instant guidance |
| Page Guide | workflow explanation |
| Deep Help | full documentation |
| Troubleshooting | problem resolution |

* * *

# 3. Page-Level Help Template

Create a **standard template** that will be used for all application pages.

Each page help must contain:

### Page Purpose

What this page is used for.

### When Users Use This Page

Typical scenarios.

### Navigation

How the user arrived at this page.

### Screen Sections

Explain each UI section.

### Key Actions

Examples:

* create employee
* approve overtime
* upload attendance or sync biometric devices
* process payroll
* create salary structures
* export reports

### Data Dependencies

Which tables or modules supply the data.

### Permissions

Which roles can perform actions.

### Offline Behavior

What works offline and what syncs later (e.g., fetching cached employee records or delayed attendance syncs).

* * *

# 4. Workflow Documentation

Create **high-level workflows** explaining how users complete major tasks.

Examples:

Payroll Processing Lifecycle

```text
Employee Setup ↓ Attendance & Leave Validation ↓ Overtime Calculation & Approval ↓ Salary Structure Assignment ↓ Component & Formula Execution ↓ Payroll Generation ↓ Dispersal & Reports
```

Explain:

* involved modules
* data movement
* approvals
* notifications

* * *

# 5. Missing Data Troubleshooting

For every screen provide **diagnostic guidance**.

Examples:

### If employees are not appearing in the Payroll Process list

Possible causes:

* No Salary Structure assigned to the employee
* Role permission restriction
* Tenant isolation filtering
* Employee is marked as inactive
* Overtime approvals are pending (if strict "Link with OT" validation is enabled)

Explain how users can:

* verify data existence
* check permissions
* refresh sync
* contact admin

* * *

# 6. Role-Based Help Logic

Explain how help changes depending on role.

Example roles:

* Global Admin (Super Admin)
* Tenant Admin (Company HR/Admin)
* Standard Employee / Manager

Help should:

* hide irrelevant features
* show permission explanations
* explain restricted actions (e.g., why a normal user cannot edit payroll components)

* * *

# 7. Chatbot Knowledge System

Design a **domain-aware AI chatbot** for the application.

The chatbot must understand:

* database schema (employee profiles, attendance logs, payroll tables)
* workflows (e.g., attendance to payroll, leave approvals)
* permissions
* modules
* troubleshooting steps

Define:

### Chatbot Knowledge Sources

* database schema
* page metadata
* workflows
* help articles

### Example Questions Users Might Ask

Examples:

* "Why is my overtime amount calculating as zero for last week?"
* "How do I configure the basic salary using the Formula Builder?"
* "Why am I receiving a communication error when syncing with the Hikvision biometric device?"
* "Why can't I edit this employee's work location tracking settings?"

Provide expected response logic.

* * *

# 8. Knowledge Base Content Model

Design the **content structure** used to store help articles.

Example schema:

```
HelpArticle
- id
- module
- page
- title
- summary
- workflow
- troubleshooting
- permissions
- related_articles
- language
```

Explain how this integrates with **i18n**.

* * *

# 9. Multilingual Help Strategy

Explain how the help system supports **multiple languages** to serve diverse workforces.

Include:

* translation strategy
* content versioning
* language fallback

* * *

# 10. PWA and Offline Help Support

Explain how help works when the application is offline or on slow networks.

Include:

* cached help content
* offline troubleshooting guidance
* sync after reconnect

* * *

# 11. Developer Integration Plan

Explain how developers integrate the help system.

Include:

* component architecture
* help metadata per page
* help content loading
* chatbot API integration

* * *

# 12. Help Analytics

Explain how the system tracks:

* most viewed help pages
* unresolved issues
* chatbot unanswered questions

This helps improve documentation.

* * *

# Output Requirements

The output must be:

* structured
* implementation-ready
* usable by both **developers and technical writers**
* suitable for embedding inside the application

Use:

* tables
* clear section headings
* structured templates
* examples where necessary

* * *

# Optional Enhancement

Also propose **modern enterprise help features**, such as:

* interactive walkthroughs
* contextual AI suggestions
* workflow simulations
* guided onboarding
* direct navigation to pages if needed/referred in help pages, based on user access rights