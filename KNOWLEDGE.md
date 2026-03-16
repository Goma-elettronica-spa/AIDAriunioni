## Riunioni in Cloud — Project Knowledge

### Purpose

SaaS multi-tenant for structured executive monthly meetings. Executives prepare before the meeting (KPIs, highlights, commitments, tasks, slides), meetings are recorded and transcribed, AI generates summaries (PDF, Word, PPTX) and suggests tasks.

### User Roles (flexible, managed by org_admin)

- `superadmin`: platform admin, manages all tenants
- `org_admin`: organization admin, manages users, meetings, configuration
- `information_officer`: data supervisor, can edit anyone's data with audit log, approves pre-meeting brief
- `dirigente`: executive, fills pre-meeting data, manages own tasks

### Key Entities (all tables already exist on Supabase)

- tenants: organizations (e.g. "GOMA")
- users: linked to auth.users, has role + tenant_id + job_title
- meetings: lifecycle draft > pre_meeting > in_progress > completed
- highlights: 3 per executive per meeting, each with metric
- commitments: monthly or quarterly promises
- kpi_definitions: persistent KPIs per executive
- kpi_entries: monthly KPI values with delta tracking
- kpi_variance_explanations: why a KPI changed + delta portion
- board_tasks: unified kanban (pre_meeting + ai_suggested source)
- suggested_tasks: AI-generated post-meeting
- slide_uploads: PDF slides per executive per meeting
- meeting_briefs: 1-pager with IO approval workflow
- audit_logs: append-only, tracks IO modifications
- calendar_events: Teams calendar sync

### Auth

- Magic Link only (no passwords)
- Roles stored in public.users.role
- RLS on every table via tenant_id

### Design

- Minimal black & white, Inter font, shadcn/ui only
- Kanban: todo (gray), wip (blue), done (green), stuck (red), waiting_for (orange)
