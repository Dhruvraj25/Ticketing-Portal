// ── Getting Started Steps ──────────────────────────────────────────────────

export interface StepCard {
  icon: string
  title: string
  description: string
}

export const gettingStartedSteps: StepCard[] = [
  {
    icon: 'LogIn',
    title: 'First Login',
    description:
      'Use your credentials provided by your administrator to log in. If you are a new client, you will receive a welcome email with a link to set up your password and complete your registration.',
  },
  {
    icon: 'KeyRound',
    title: 'Change Password',
    description:
      'Navigate to your Profile settings to update your password. Use a strong, unique password with a mix of letters, numbers, and symbols for security.',
  },
  {
    icon: 'UserCheck',
    title: 'Complete Profile',
    description:
      'Fill in your profile details including your name, contact information, and avatar. A complete profile helps team members identify you and improves collaboration.',
  },
  {
    icon: 'LayoutDashboard',
    title: 'Dashboard Overview',
    description:
      'The Dashboard is your central hub. View ticket summaries, recent activity, project metrics, and quick access to your most-used features at a glance.',
  },
  {
    icon: 'Menu',
    title: 'Navigation Menu',
    description:
      'The sidebar menu on the left provides access to all features. Items are role-based — you only see what is relevant to your role.',
  },
  {
    icon: 'Bell',
    title: 'Notifications',
    description:
      'Stay updated with real-time notifications for ticket updates, assignments, approvals, and more.',
  },
  {
    icon: 'Settings',
    title: 'Profile Settings',
    description:
      'Manage your account preferences, notification settings, and theme (light/dark mode) from your profile.',
  },
]

// ── Role-Based Guide Content ───────────────────────────────────────────────

export interface GuideItem {
  title: string
  description: string
}

export const clientGuide: GuideItem[] = [
  { title: 'Creating a Ticket', description: 'Click "Create Ticket" from the sidebar or dashboard. Fill in the required fields: title, description, project, module, environment, and priority.' },
  { title: 'Uploading Attachments', description: 'Use the attachment button when creating or commenting on a ticket. Supported formats include images, PDF, Word, Excel, and ZIP files (max 10 MB each).' },
  { title: 'Selecting Project', description: 'Choose the relevant project from the dropdown. Only projects associated with your account will appear.' },
  { title: 'Selecting Module', description: 'After selecting a project, choose the specific module affected. Modules help route tickets to the right team.' },
  { title: 'Environment', description: 'Specify where the issue was found: Production, Staging, Development, or Testing.' },
  { title: 'Priority', description: 'Set priority based on impact: Low (minor), Medium (moderate), High (major), Critical (system down).' },
  { title: 'Tracking Ticket', description: 'View your tickets from the "My Tickets" page. Each ticket shows its current status, assigned developer, and updates.' },
  { title: 'Approving Estimate', description: 'Review the estimated hours and completion date. Approved estimates move the ticket to development.' },
  { title: 'Rejecting Estimate', description: 'Provide feedback on what needs to change. The manager will revise and resubmit for your approval.' },
  { title: 'Requesting Revision', description: 'After a ticket is resolved, request changes if the result does not meet requirements.' },
  { title: 'Viewing Support Hours', description: 'Your Support Wallet shows purchased, consumed, and remaining support hours.' },
  { title: 'Viewing Notifications', description: 'Click the bell icon in the sidebar to view notifications. Click any notification to navigate to the relevant ticket.' },
  { title: 'Closing Ticket', description: 'When satisfied with the resolution, approve the ticket to close it. Can be reopened within 7 days.' },
  { title: 'Reopening Ticket', description: 'If the same issue recurs within 7 days, reopen the ticket. After 7 days, create a new ticket referencing the original.' },
]

export const managerGuide: GuideItem[] = [
  { title: 'Assign Ticket', description: 'Review new tickets and assign them to the appropriate developer based on workload and expertise.' },
  { title: 'Assign Resource', description: 'Assign a specific developer considering current workload, skill set, and priority.' },
  { title: 'Approve Estimate', description: 'Review estimates submitted by developers. Ensure hours, timeline, and scope are reasonable.' },
  { title: 'Approve Additional Hours', description: 'When a ticket exceeds its estimate, request additional hours from the client with clear reasoning.' },
  { title: 'Approve Revision', description: 'Review revision requests from clients. Approve legitimate requests and reassign to the developer.' },
  { title: 'Manage Projects', description: 'Create and manage projects, assign managers, and configure project settings and workflows.' },
  { title: 'Monitor Work', description: 'Use the dashboard and reports to track productivity, resolution times, and project progress.' },
  { title: 'Reports', description: 'Access detailed reports on ticket volumes, resolution times, developer performance, and satisfaction.' },
  { title: 'Notifications', description: 'Configure notification preferences for ticket assignments, approvals, and team activities.' },
]

export const resourceGuide: GuideItem[] = [
  { title: 'View Assigned Tickets', description: 'Access "My Tickets" to see all tickets assigned to you. Filter by status, priority, or project.' },
  { title: 'Start Working', description: 'Click "Start Working" to begin tracking time. This signals that the ticket is actively being worked on.' },
  { title: 'Stop Working', description: 'Use "Stop Working" to pause time tracking when you switch tasks or take a break.' },
  { title: 'Submit Work', description: 'When work is complete, submit it for review with notes about what was done and tested.' },
  { title: 'Log Time', description: 'Log time against tickets manually or use the timer. Accurate tracking helps with billing and planning.' },
  { title: 'Request Additional Hours', description: 'If a ticket needs more time than estimated, submit a request with clear explanation.' },
  { title: 'Resolve Ticket', description: 'Mark the ticket as resolved when work is complete and tested. It moves to manager review.' },
  { title: 'Notifications', description: 'Receive notifications for new assignments, revision requests, and status changes.' },
]

export const adminGuide: GuideItem[] = [
  { title: 'Customer Onboarding', description: 'Use the onboarding wizard to set up new clients with projects, modules, and user accounts.' },
  { title: 'User Management', description: 'Manage all users — create, edit, or deactivate accounts. Assign roles and permissions.' },
  { title: 'Project Creation', description: 'Create new projects with custom settings, assign managers, and configure workflows.' },
  { title: 'Assign Managers', description: 'Assign project managers to oversee projects, teams, and client communication.' },
  { title: 'Support Hours', description: 'Configure support hour allocations, prepaid packages, renewal terms, and low-balance alerts.' },
  { title: 'Wallet Management', description: 'Monitor all support wallets, add hours, adjust balances, and review consumption patterns.' },
  { title: 'System Reports', description: 'Access system-wide reports on ticket trends, team performance, and client satisfaction.' },
  { title: 'Notification Settings', description: 'Configure system-wide notification settings, email templates, and Teams integration.' },
  { title: 'General Administration', description: 'Manage branding, integrations, security policies, and system settings.' },
]

// ── Ticket Lifecycle Stages ────────────────────────────────────────────────

export interface LifecycleStage {
  icon: string
  title: string
  description: string
  color: string
}


export const ticketLifecycleStages: LifecycleStage[] = [
  { icon: 'PlusCircle', title: 'Create Ticket', description: 'A client or team member creates a new ticket describing the issue or request.', color: 'text-blue-500 dark:text-blue-400' },
  { icon: 'ClipboardCheck', title: 'Manager Review', description: 'A manager reviews the ticket for clarity, completeness, and priority assignment.', color: 'text-indigo-500 dark:text-indigo-400' },
  { icon: 'UserPlus', title: 'Assign Resource', description: 'The manager assigns a developer based on workload, expertise, and priority.', color: 'text-violet-500 dark:text-violet-400' },
  { icon: 'Code2', title: 'Development', description: 'The developer works on the ticket, tracking time and updating progress.', color: 'text-amber-500 dark:text-amber-400' },
  { icon: 'FileText', title: 'Estimate Approval', description: 'An estimate is sent to the client for approval before continued work.', color: 'text-orange-500 dark:text-orange-400' },
  { icon: 'Clock', title: 'Waiting for Client', description: 'The ticket awaits client feedback, approval, or additional information.', color: 'text-rose-500 dark:text-rose-400' },
  { icon: 'RefreshCw', title: 'Revision', description: 'The client requests changes. The ticket goes back for rework.', color: 'text-purple-500 dark:text-purple-400' },
  { icon: 'CheckCircle2', title: 'Resolved', description: 'Work is complete and the solution is delivered to the client for verification.', color: 'text-emerald-500 dark:text-emerald-400' },
  { icon: 'CheckSquare', title: 'Closed', description: 'The client confirms satisfaction and the ticket is closed.', color: 'text-green-500 dark:text-green-400' },
]

// Status Guide

export interface StatusGuide {
  status: string
  meaning: string
  who: string
  next: string
  color: string
}

export const statusGuides: StatusGuide[] = [
  { status: 'New', meaning: 'Ticket has been submitted and is awaiting initial review.', who: 'Manager reviews and assigns the ticket.', next: 'Ticket moves to Assigned or Manager Review.', color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' },
  { status: 'Assigned', meaning: 'A developer has been assigned to work on the ticket.', who: 'Manager assigns the ticket to a developer.', next: 'Developer starts working, status changes to In Progress.', color: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30' },
  { status: 'In Progress', meaning: 'The developer is actively working on the ticket.', who: 'Developer works on and updates the ticket.', next: 'Moves to Resolved when work is complete.', color: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' },
  { status: 'Waiting for Client', meaning: 'Waiting on client input, approval, or additional information.', who: 'Client provides feedback or approval.', next: 'Moves to In Progress or Resolved based on client response.', color: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30' },
  { status: 'Revision Requested', meaning: 'Client has requested changes to the completed work.', who: 'Client requests changes; manager reviews and reassigns.', next: 'Ticket goes back to In Progress for revision work.', color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30' },
  { status: 'Resolved', meaning: 'Work is complete and solution is delivered for verification.', who: 'Developer completes work and marks as resolved.', next: 'Client verifies and approves, moving to Closed.', color: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' },
  { status: 'Closed', meaning: 'Ticket is complete and approved by the client.', who: 'Client approves the resolved ticket.', next: 'Ticket lifecycle ends. Can be reopened within 7 days.', color: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30' },
  { status: 'Reopened', meaning: 'A closed ticket has been reopened with the same issue.', who: 'Client reopens within 7 days.', next: 'Goes back to Assigned for the original developer.', color: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30' },
  { status: 'Estimate Pending', meaning: 'Awaiting client approval of the effort estimate.', who: 'Client reviews and approves or rejects the estimate.', next: 'Approved: moves to In Progress. Rejected: manager revises.', color: 'bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30' },
  { status: 'Additional Hours Pending', meaning: 'Additional hours requested beyond the original estimate.', who: 'Client approves or rejects additional hours request.', next: 'Approved: added to support wallet. Rejected: manager adjusts scope.', color: 'bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-500/30' },
]

// Priority Guide

export interface PriorityGuide {
  level: string
  description: string
  usage: string
  color: string
}

export const priorityGuides: PriorityGuide[] = [
  { level: 'Low', description: 'Minor issues that do not block work.', usage: 'Cosmetic changes, documentation updates, nice-to-have features.', color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/15 border-green-200 dark:border-green-500/30' },
  { level: 'Medium', description: 'Issues with moderate impact on workflow.', usage: 'Feature requests, non-urgent bug fixes, improvements.', color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30' },
  { level: 'High', description: 'Major issues that affect productivity.', usage: 'Critical bugs, broken functionality, blocking issues for key users.', color: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/15 border-orange-200 dark:border-orange-500/30' },
  { level: 'Critical', description: 'System-wide issues that halt operations.', usage: 'Production outages, data loss, security breaches, system-down scenarios.', color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-500/30' },
]

// Notification Events

export interface NotificationEvent {
  event: string
  description: string
  channels: string[]
}

export const notificationEvents: NotificationEvent[] = [
  { event: 'Ticket Created', description: 'When a new ticket is submitted by a client or team member.', channels: ['In-App', 'Email', 'Teams'] },
  { event: 'Ticket Assigned', description: 'When a ticket is assigned to a developer or manager.', channels: ['In-App', 'Email', 'Teams'] },
  { event: 'Estimate Approved', description: 'When a client approves a submitted estimate.', channels: ['In-App', 'Email'] },
  { event: 'Revision Requested', description: 'When a client requests changes to completed work.', channels: ['In-App', 'Email', 'Teams'] },
  { event: 'Ticket Closed', description: 'When a ticket is approved and closed by the client.', channels: ['In-App', 'Email'] },
  { event: 'Support Hours Added', description: 'When additional support hours are added to a wallet.', channels: ['In-App', 'Email'] },
  { event: 'Wallet Low', description: 'When remaining support hours fall below the defined threshold.', channels: ['In-App', 'Email', 'Teams'] },
]

// Support Hours

export interface SupportConcept {
  title: string
  description: string
  icon: string
}

export const supportHoursConcepts: SupportConcept[] = [
  { title: 'Support Hours', description: 'Prepaid hours purchased as part of your support plan. Each ticket consumes hours based on the work performed.', icon: 'Clock' },
  { title: 'Hypercare', description: 'Intensive support period after a major release or go-live, with faster response times and dedicated resources.', icon: 'Zap' },
  { title: 'Billable', description: 'Hours consumed by active ticket work such as development, testing, and documentation.', icon: 'Receipt' },
  { title: 'Non-Billable', description: 'Hours used for internal activities that do not directly involve client work, such as meetings or admin tasks.', icon: 'ClockOff' },
  { title: 'Consumed Hours', description: 'Total support hours used so far in the current billing period.', icon: 'TrendingDown' },
  { title: 'Remaining Hours', description: 'Available support hours left in your plan before the next renewal.', icon: 'TrendingUp' },
  { title: 'Additional Hours', description: 'Extra hours purchased beyond the base plan when the allocated hours are exhausted.', icon: 'PlusCircle' },
  { title: 'Wallet', description: 'Your Support Wallet tracks all purchased, consumed, and remaining hours across billing cycles.', icon: 'Wallet' },
]

// FAQ

export interface FAQItem {
  question: string
  answer: string
}

export const faqItems: FAQItem[] = [
  { question: 'How do I create a ticket?', answer: 'Navigate to Tickets > Create Ticket from the sidebar. Fill in the required fields including title, description, project, and priority. Click Submit to create the ticket.' },
  { question: 'How do I upload screenshots?', answer: 'Use the attachment button (paperclip icon) when creating or commenting on a ticket. You can upload images, PDFs, and other documents up to 10 MB each.' },
  { question: 'How do I request a revision?', answer: 'When a ticket is in Resolved status, you can submit a revision request with details on what needs to change. The manager will review and reassign it.' },
  { question: 'Can I reopen a ticket?', answer: 'Yes, within 7 days of closure. Navigate to the closed ticket and click Reopen. After 7 days, please create a new ticket referencing the original.' },
  { question: 'Why cannot I create tickets?', answer: 'Ticket creation may be restricted if your support wallet is exhausted, your account is inactive, or your role does not have permission. Contact your administrator.' },
  { question: 'How are support hours deducted?', answer: 'Hours are deducted based on the actual time logged by developers against your tickets. Managers log hours, and the system automatically deducts from your wallet.' },
  { question: 'How are estimates approved?', answer: 'When a developer completes an estimate, a notification is sent to the client for review. The client can approve or reject with feedback.' },
  { question: 'How do Teams notifications work?', answer: 'When enabled, the system sends notifications to your configured Microsoft Teams channel for ticket assignments, updates, and approvals.' },
  { question: 'How do Email notifications work?', answer: 'Email notifications are sent to your registered email address for important events. You can configure which events trigger emails in your profile settings.' },
  { question: 'How do I change my password?', answer: 'Go to your Profile page, click Change Password, enter your current and new password, and save the changes.' },
  { question: 'How do I contact support?', answer: 'Use the Contact Support section on this page or email the support team directly. Response times vary based on your support plan.' },
]

// Troubleshooting

export interface TroubleshootingItem {
  problem: string
  cause: string
  solution: string
  icon: string
}

export const troubleshootingItems: TroubleshootingItem[] = [
  { problem: 'Did not receive email', cause: 'Email might be in spam/junk folder, or the notification settings might not include email.', solution: 'Check your spam folder, verify notification settings in your profile, and ensure your email address is correct.', icon: 'MailX' },
  { problem: 'Did not receive Teams notification', cause: 'Teams integration might not be configured, or the webhook URL could be invalid.', solution: 'Contact your administrator to verify Teams integration settings and webhook configuration.', icon: 'ShieldOff' },
  { problem: 'Attachment upload failed', cause: 'File size may exceed the 10 MB limit, or the file format might not be supported.', solution: 'Compress large files, check supported formats (images, PDF, Word, Excel, ZIP), and try again.', icon: 'XCircle' },
  { problem: 'Login problem', cause: 'Incorrect credentials, expired password, or account may be deactivated.', solution: 'Use Forgot Password to reset your credentials, or contact your administrator to verify account status.', icon: 'LogIn' },
  { problem: 'Forgot password', cause: 'Password not remembered after a long period of inactivity.', solution: 'Click Forgot Password on the login page to receive a password reset link via email.', icon: 'KeyRound' },
  { problem: 'Permission denied', cause: 'Your user role does not have access to the requested feature or action.', solution: 'Contact your manager or administrator to request the necessary permissions for your role.', icon: 'ShieldOff' },
  { problem: 'Ticket submission failed', cause: 'Network issues, missing required fields, or exhausted support wallet.', solution: 'Check all required fields are filled, verify your internet connection, and check your support wallet balance.', icon: 'XCircle' },
  { problem: 'Browser compatibility', cause: 'Using an outdated or unsupported browser version.', solution: 'Use the latest version of Chrome, Firefox, Edge, or Safari for the best experience.', icon: 'Globe' },
  { problem: 'Network issues', cause: 'Unstable internet connection or firewall blocking requests.', solution: 'Check your internet connection, disable VPN if used, or contact your IT department for firewall assistance.', icon: 'WifiOff' },
]

// Contact

export interface ContactInfo {
  email: string
  hours: string
  emergency: string
  sla: string
  portal: string
}

export const contactInfo: ContactInfo = {
  email: 'support@supporthub.com',
  hours: 'Monday to Friday, 9:00 AM - 6:00 PM (EST)',
  emergency: 'emergency@supporthub.com (24/7 for Critical issues)',
  sla: 'Critical: 4 hours | High: 8 hours | Medium: 24 hours | Low: 48 hours',
  portal: 'support.supporthub.com',
}

// Release Notes

export interface ReleaseNote {
  version: string
  date: string
  features: string[]
  fixes: string[]
  improvements: string[]
}

export const releaseNotes: ReleaseNote[] = [
  {
    version: 'v2.1.0',
    date: 'July 2026',
    features: ['Teams integration', 'Enhanced dashboard', 'Multi-project wallet'],
    fixes: ['Notification delay fix', 'Upload timeout fix', 'Role mapping fix'],
    improvements: ['Search perf', 'Page load times', 'Mobile responsiveness'],
  },
  {
    version: 'v2.0.0',
    date: 'May 2026',
    features: ['Support wallet', 'Feedback system', 'Role-based dashboards'],
    fixes: ['Session expiry fix', 'Duplicate notification fix', 'Time tracking fix'],
    improvements: ['Redesigned ticket page', 'Activity logging', 'Accessibility'],
  },
  {
    version: 'v1.5.0',
    date: 'March 2026',
    features: ['Email templates', 'Module management', 'Onboarding wizard'],
    fixes: ['Timezone display fix', 'File upload fix'],
    improvements: ['UI library update', 'Better validation'],
  },
  {
    version: 'v1.0.0',
    date: 'January 2026',
    features: ['Ticketing system', 'Auth and roles', 'Basic lifecycle'],
    fixes: [],
    improvements: [],
  },
]

export interface SearchableItem {
  id: string
  section: string
  text: string
  keywords: string
}

export const searchableItems: SearchableItem[] = [
  ...gettingStartedSteps.map((s, i) => ({ id: 'gs-' + i, section: 'Getting Started', text: s.title + ' - ' + s.description, keywords: s.title.toLowerCase() })),
  ...clientGuide.map((g, i) => ({ id: 'cg-' + i, section: 'Client Guide', text: g.title + ' - ' + g.description, keywords: g.title.toLowerCase() })),
  ...managerGuide.map((g, i) => ({ id: 'mg-' + i, section: 'Manager Guide', text: g.title + ' - ' + g.description, keywords: g.title.toLowerCase() })),
  ...resourceGuide.map((g, i) => ({ id: 'rg-' + i, section: 'Resource Guide', text: g.title + ' - ' + g.description, keywords: g.title.toLowerCase() })),
  ...adminGuide.map((g, i) => ({ id: 'ag-' + i, section: 'Admin Guide', text: g.title + ' - ' + g.description, keywords: g.title.toLowerCase() })),
  ...faqItems.map((f, i) => ({ id: 'faq-' + i, section: 'FAQ', text: f.question + ' - ' + f.answer, keywords: f.question.toLowerCase() })),
  ...troubleshootingItems.map((t, i) => ({ id: 'tr-' + i, section: 'Troubleshooting', text: t.problem + ' - ' + t.solution, keywords: t.problem.toLowerCase() })),
  ...releaseNotes.map((r, i) => ({ id: 'rn-' + i, section: 'Release Notes', text: r.version + ' (' + r.date + ') ' + r.features.join(', '), keywords: r.version.toLowerCase() })),
]