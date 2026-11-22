import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowRight, BadgeCheck, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Clock3, FileText, Filter, LayoutDashboard, LogOut, Menu, Pencil, Plus, Search, Settings, ShieldCheck, Trash2, Users, WalletCards } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import Decimal from 'decimal.js';
import { budgetBalance, calculateLineTotal, formatMoney, sumMoney } from './lib/money';
import { toCsv } from './lib/csv';
import { formatDateKey, formatMonthKey, getMonthCalendarDays, parseMonthKey, taskOccursOnCalendarDay } from './lib/calendar';
import { isDuplicateTaskReferenceError } from './lib/task-errors';
import { hasCompletionPhoto } from './lib/task-completion';
import { hasHoursForEveryService } from './lib/task-service-progress';
import { isFinalWorkerSubmission } from './lib/team-submissions';
import axaLogo from './LOGO.jpeg';

function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  return <span className={`brand ${light ? 'brand-light' : ''} ${compact ? 'brand-compact' : ''}`}>
    <img className="brand-logo-image" src={axaLogo} alt="" />
    <span>{t('companyName')}</span>
  </span>;
}

type Profile = { id: string; organisation_id: string; full_name: string; username: string; role: 'super_admin' | 'assigner' | 'end_user'; is_active: boolean; must_reset_password: boolean; can_manage_users: boolean };
type Task = { id: string; organisation_id: string; reference: string; title: string; description: string; status: string; priority: string; start_date?: string; due_date: string; budget_limit: number | null; currency: string; assignee_id: string; assigner_id: string; version: number; is_draft?: boolean; customer_name?: string; apartment_number?: string; apartment_block?: string; customer_address?: string; customer_phone?: string; assigned_hours?: number; worker_comment?: string };
type EmployeeSummary = { full_name: string | null; username?: string | null; employee_id: string | null };
type Related<T> = T | T[] | null;
type TaskAssignment = { task_id?: string; profile_id: string; assigned_hours: number | null; worker_submitted_at: string | null; profiles?: Related<EmployeeSummary> };
type TaskService = { id: string; assigned_hours: number | null; cleaning_areas: Related<{ name: string }>; cleaning_subtasks: Related<{ name: string }> };
type TaskServiceLog = { task_id?: string; selection_id: string; profile_id: string; actual_hours: number | null; worker_comment: string | null; is_completed: boolean; profiles?: Related<EmployeeSummary> };
type TaskPhoto = { id: string; photo_type: 'assignment' | 'completion'; object_path: string; original_name: string; uploaded_by: string };
type TaskEquipmentItem = { equipment_id: string; quantity: number; returned_quantity: number | null; cleaning_equipment: Related<{ name: string }> };
type WorkerOption = { id: string; full_name: string; username: string; employee_id: string | null };
type ReportAssignment = { task_id: string; profile_id: string; assigned_hours: number | null; profiles: Related<EmployeeSummary> };
type ReportServiceLog = { task_id: string; profile_id: string; actual_hours: number | null };

function firstRelated<T>(value: Related<T> | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function Login() {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (!supabase) { setError(t('notConfigured')); return; }
    setBusy(true);
    const { data, error: authError } = await supabase.functions.invoke('username-login', { body: { identifier: identifier.trim(), password } });
    if (authError || !data?.access_token || !data?.refresh_token) setError(t('loginError'));
    else {
      const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      if (sessionError) setError(t('loginError')); else navigate('/app');
    }
    setBusy(false);
  };
  return <main className="auth-page">
    <section className="auth-art" aria-label="AXA Cleaning introduction">
      <Brand light />
      <div className="art-copy"><span className="eyebrow">{t('marketingEyebrow')}</span><h1>{t('marketingHeadline')}</h1><p>{t('tagline')}</p>
        <div className="art-stat"><div className="stat-check"><Check size={17} /></div><div><strong>{t('marketingStatTitle')}</strong><span>{t('marketingStatText')}</span></div></div>
      </div>
      <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-footer">{t('marketingFooter')}</div>
    </section>
    <section className="auth-panel">
      <div className="auth-top"><span className="auth-mobile-brand"><Brand compact /></span></div>
      <div className="login-form-wrap"><span className="eyebrow">YOUR WORKSPACE, READY</span><h2>{t('loginTitle')}</h2><p className="subtitle">{t('loginSubtitle')}</p>
        <form onSubmit={(event) => void submit(event)} className="login-form">
          <label htmlFor="identifier">{t('usernameEmail')}</label><input id="identifier" autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} required placeholder="alex@company.com" />
          <div className="password-label"><label htmlFor="password">{t('password')}</label><Link to="/forgot-password">{t('forgotPassword')}</Link></div>
          <div className="password-input"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" className="text-button" onClick={() => setShowPassword(!showPassword)} aria-label={t(showPassword ? 'hidePassword' : 'showPassword')}>{t(showPassword ? 'hidePassword' : 'showPassword')}</button></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {!isSupabaseConfigured && <div className="config-note"><ShieldCheck size={18} /><span><b>{t('backendMissing')}</b><small>{t('backendMissingHint')}</small></span></div>}
          <button className="primary-button login-button" disabled={busy || !isSupabaseConfigured}>{busy ? t('signingIn') : t('signIn')}<ArrowRight size={17} /></button>
        </form><p className="no-registration">{t('noRegistration')}</p><div className="secure-note"><ShieldCheck size={15} /> {t('secureAccess')}</div>
      </div><footer className="auth-copyright">© 2026 {t('companyName')} <span>·</span> {t('productBy')}</footer>
    </section>
  </main>;
}

const navItems = [
  { to: '/app', key: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/tasks', key: 'myTasks', icon: ClipboardList },
  { to: '/app/calendar', key: 'calendar', icon: CalendarDays, roles: ['assigner', 'super_admin'] },
  { to: '/app/reviews', key: 'reviews', icon: BadgeCheck, roles: ['assigner', 'super_admin'] },
  { to: '/app/people', key: 'people', icon: Users, roles: ['super_admin'] },
  { to: '/app/reports', key: 'reports', icon: WalletCards },
  { to: '/app/audit', key: 'auditLog', icon: ShieldCheck, roles: ['super_admin'] },
];

function AppShell({ user, profile, onSignOut, children }: { user: User; profile: Profile | null; onSignOut: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const admin = profile?.role !== 'end_user';
  const name = profile?.full_name || user.email?.split('@')[0] || 'there';
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <Link className="side-brand" to="/app"><Brand /></Link>
      <div className="workspace-chip"><div className="workspace-avatar">{name.slice(0, 1).toUpperCase()}</div><span><b>{t('workspace')}</b><small>{t('businessWorkspace')}</small></span><ChevronDown size={15} /></div>
      <span className="nav-caption">{t('workspace').toUpperCase()}</span><nav className="main-nav" aria-label={t('mainNavigation')}>
        {navItems.filter(item => !item.roles || item.roles.includes(profile?.role ?? 'end_user')).map(item => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}><Icon size={18} /><span>{t(item.key)}</span>{item.key === 'reviews' && <span className="nav-count">3</span>}</NavLink>; })}
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Activity size={16} /></div><b>{t('needHelp')}</b><span>{t('helpSubtitle')}</span><button type="button">{t('helpCenter')} <ArrowRight size={14} /></button></div><NavLink className="nav-link" to="/app/settings"><Settings size={18} /><span>{t('settings')}</span></NavLink>
        <div className="profile-row"><div className="profile-avatar">{name.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{name}</b><small>{profile?.role === 'super_admin' ? t('admin') : profile?.role === 'assigner' ? t('assignerRole') : t('user')}</small></div><button className="icon-button signout" onClick={onSignOut} aria-label={t('signOut')}><LogOut size={17} /></button></div>
      </div>
    </aside>
    {menuOpen && <button className="sidebar-overlay" aria-label={t('close')} onClick={() => setMenuOpen(false)} />}
    <div className="main-column"><header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)} aria-label={t('menu')}><Menu size={20} /></button>    <div className="breadcrumb"><span>{t('workspace')}</span><span className="crumb-slash">/</span><b>{t('dashboard')}</b></div><div className="top-actions"><label className="global-search"><Search size={16} /><input placeholder={t('search')} aria-label={t('search')} /><kbd>⌘ K</kbd></label><button className="icon-button notification-button" aria-label={t('notifications')}><Bell size={19} /><i /></button><div className="top-avatar">{name.slice(0, 1).toUpperCase()}</div></div></header>
      {admin && <div className="role-banner"><span className="role-dot" /> {profile?.role === 'super_admin' ? t('mainAdminWorkspace') : t('assignerWorkspace')} <span>·</span> {t('teamOverview')}</div>}
      <main className="page-content">{children}</main><footer className="app-footer"><span>© 2026 {t('companyName')}</span><span>{t('productBy')} <span className="footer-heart">✦</span></span></footer>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{navItems.slice(0, 4).filter(item => !item.roles || item.roles.includes(profile?.role ?? 'end_user')).map(item => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}><Icon size={19} /><span>{t(item.key)}</span></NavLink>; })}</nav>
  </div>;
}

function useTasks(profile: Profile | null) {
  return useQuery({ queryKey: ['tasks', profile?.id, profile?.role], enabled: Boolean(supabase && profile), queryFn: async () => {
    const { data, error } = await supabase!.from('tasks').select('id,organisation_id,reference,title,description,status,priority,start_date,due_date,budget_limit,currency,assignee_id,assigner_id,assigned_hours,is_draft,version').is('deleted_at', null).order('due_date', { ascending: true }).limit(100);
    if (error) throw error; return (data ?? []) as Task[];
  } });
}

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const statusKey: Record<string, string> = { pending: 'pending', in_progress: 'inProgress', on_hold: 'onHold', skipped: 'skipped', submitted: 'submitted', verified: 'verified', returned: 'returned', cancelled: 'cancelled' };
  return <span className={`status-pill status-${status}`}><i />{t(statusKey[status] ?? 'pending')}</span>;
}
function PriorityPill({ priority }: { priority: string }) {
  const { t } = useTranslation();
  return <span className={`priority-text priority-${priority}`}><i />{t(priority)}</span>;
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof ClipboardList; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} /></div><span className="metric-label">{label}</span><div className="metric-bottom"><strong>{value}</strong></div></article>;
}

function Dashboard({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError, refetch } = useTasks(profile);
  const admin = profile?.role !== 'end_user';
  const { data: metrics } = useQuery<{ total_tasks: number; pending_tasks: number; in_progress_tasks: number; on_hold_tasks: number; overdue_tasks: number; submitted_tasks: number; verified_tasks: number; over_budget_tasks: number }>({ queryKey: ['dashboard-metrics', profile?.id], enabled: Boolean(admin && supabase && profile), queryFn: async () => { const { data, error } = await supabase!.rpc('get_dashboard_metrics').single(); if (error) throw error; return data as { total_tasks: number; pending_tasks: number; in_progress_tasks: number; on_hold_tasks: number; overdue_tasks: number; submitted_tasks: number; verified_tasks: number; over_budget_tasks: number }; } });
  const now = new Date();
  const todayStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const filteredTasks = tasks.filter(task => !task.is_draft);
  const dueToday = filteredTasks.filter(task => task.due_date === todayStr && !['verified', 'cancelled'].includes(task.status));
  const upcoming = filteredTasks.filter(task => task.due_date > todayStr && !['verified', 'cancelled'].includes(task.status)).slice(0, 4);
  const overdue = filteredTasks.filter(task => task.due_date < todayStr && !['verified', 'cancelled'].includes(task.status));
  const submitted = filteredTasks.filter(task => task.status === 'submitted');
  const name = profile?.full_name.split(' ')[0] ?? 'Alex';
  const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  return <>
    <div className="page-heading"><div><div className="date-overline"><CalendarDays size={14} /> {dateLabel}</div><h1>{profile ? t('welcomeName', { name }) : t('welcome')}</h1><p>{t('welcomeSubtitle')}</p></div>{admin && <Link className="primary-button create-button" to="/app/tasks/new"><Plus size={17} />{t('newTask')}</Link>}</div>
    {admin ? <>
      <section className="metrics-grid" aria-label={t('taskOverview')}>
        <MetricCard label={t('pending')} value={metrics?.pending_tasks ?? '—'} icon={ClipboardList} tone="purple" />
        <MetricCard label={t('inProgress')} value={metrics?.in_progress_tasks ?? '—'} icon={Clock3} tone="blue" />
        <MetricCard label={t('onHold')} value={metrics?.on_hold_tasks ?? '—'} icon={Activity} tone="amber" />
        <MetricCard label={t('overdue')} value={metrics?.overdue_tasks ?? '—'} icon={CalendarDays} tone="amber" />
        <MetricCard label={t('submitted')} value={metrics?.submitted_tasks ?? '—'} icon={BadgeCheck} tone="blue" />
        <MetricCard label={t('verified')} value={metrics?.verified_tasks ?? '—'} icon={Check} tone="green" />
        <MetricCard label={t('overBudget')} value={metrics?.over_budget_tasks ?? '—'} icon={CircleDollarSign} tone="green" />
      </section>
      <section className="dashboard-grid"><div className="panel tasks-panel"><div className="panel-heading"><div><h2>{t('teamTasks')}</h2><span>{t('teamTasksSubtitle')}</span></div><div className="panel-actions"><button className="subtle-button"><Filter size={15} />{t('filter')}</button><Link className="view-link" to="/app/tasks">{t('viewAll')} <ArrowRight size={15} /></Link></div></div>
        <TaskTable tasks={filteredTasks.slice(0, 6)} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} profile={profile} />
      </div><aside className="right-column"><div className="panel review-panel"><div className="panel-heading compact"><div><h2>{t('needsReview')}</h2><span>{t('reviewSubtitle')}</span></div><div className="review-count">{submitted.length.toString().padStart(2, '0')}</div></div>{submitted.length ? submitted.slice(0, 3).map(task => <TaskMini key={task.id} task={task} />) : <div className="empty-mini"><span className="empty-check"><Check size={15} /></span><b>{t('allCaughtUp')}</b><span>{t('newSubmissions')}</span></div>}<Link className="review-link" to="/app/reviews">{t('openReviewQueue')} <ArrowRight size={14} /></Link></div>
        <div className="panel activity-panel"><div className="panel-heading compact"><div><h2>{t('recentActivity')}</h2><span>{t('latestUpdates')}</span></div><button className="icon-button" aria-label={t('moreActivity')}>···</button></div><div className="activity-empty"><span className="activity-line"><i /></span><p>{t('emptyActivity')}</p></div></div></aside></section>
    </> : <>
      <section className="user-metrics"><MetricCard label={t('dueToday')} value={dueToday.length} icon={CalendarDays} tone="purple" /><MetricCard label={t('upcoming')} value={upcoming.length} icon={Clock3} tone="blue" /><MetricCard label={t('overdue')} value={overdue.length} icon={Activity} tone="amber" /></section>
      {overdue.length > 0 && <TaskSection title={t('overdue')} accent="rose" tasks={overdue} />}
      <section className="panel user-tasks-panel"><div className="panel-heading"><div><h2>{t('today')}</h2><span>{t('taskCount', { count: dueToday.length })}</span></div><Link className="view-link" to="/app/tasks">{t('viewAll')} <ArrowRight size={15} /></Link></div>{dueToday.length ? <TaskList tasks={dueToday} /> : <EmptyTasks t={t} />}</section>
      <TaskSection title={t('upcoming')} accent="blue" tasks={upcoming} />
    </>}
  </>;
}

function TaskTable({ tasks, isLoading, isError, onRetry, profile }: { tasks: Task[]; isLoading: boolean; isError: boolean; onRetry: () => void; profile: Profile | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const canDeleteTasks = profile?.role === 'super_admin';
  const deleteTask = async (task: Task) => {
    if (!supabase || !canDeleteTasks || deletingTaskId) return;
    if (!window.confirm(t('deleteTaskConfirm', { reference: task.reference }))) return;
    setDeletingTaskId(task.id);
    setDeleteError('');
    try {
      const { error } = await supabase.rpc('delete_task', { target_task: task.id, expected_version: task.version });
      if (error) {
        setDeleteError(error.code === '40001' ? t('taskConflict') : t('deleteTaskFailed'));
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['task-register'] }),
        queryClient.invalidateQueries({ queryKey: ['task-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['task', task.id] }),
        queryClient.invalidateQueries({ queryKey: ['task-exception', task.id] }),
      ]);
    } catch (error) {
      console.error('Task deletion failed', error);
      setDeleteError(t('deleteTaskFailed'));
    } finally {
      setDeletingTaskId(null);
    }
  };
  if (isLoading) return <div className="skeleton-rows" aria-label={t('loading')}><span /><span /><span /><span /></div>;
  if (isError) return <div className="inline-error"><span>{t('connectionError')}</span><button onClick={onRetry}>{t('retry')}</button></div>;
  if (!tasks.length) return <>{deleteError && <div className="form-error" role="alert">{deleteError}</div>}<EmptyTasks t={t} /></>;
  return <>{deleteError && <div className="form-error" role="alert">{deleteError}</div>}<div className="table-scroll"><table className="task-table"><thead><tr><th>{t('taskName')}</th><th>{t('assignee')}</th><th>{t('priority')}</th><th>{t('status')}</th><th>{t('dueDate')}</th><th />{canDeleteTasks&&<th>{t('actions')}</th>}</tr></thead><tbody>{tasks.map(task => <tr key={task.id}><td><Link className="task-title-cell" to={`/app/tasks/${task.id}`}><span className="task-code">{task.reference}</span><b>{task.title}</b></Link></td><td><span className="table-assignee"><span className="assignee-avatar">{task.assignee_id.slice(0, 1).toUpperCase()}</span>{t('teamMember')}</span></td><td><PriorityPill priority={task.priority} /></td><td>{task.is_draft?<span className="draft-badge">{t('draft')}</span>:<StatusPill status={task.status} />}</td><td className="due-date">{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${task.due_date}T12:00:00`))}</td><td><Link className="row-arrow" to={`/app/tasks/${task.id}`} aria-label={`${t('taskDetails')}: ${task.title}`}><ArrowRight size={16} /></Link></td>{canDeleteTasks&&<td><button type="button" className="icon-button task-delete-button" aria-label={`${t('deleteTask')} ${task.reference}`} title={t('deleteTask')} disabled={deletingTaskId!==null} onClick={()=>void deleteTask(task)}>{deletingTaskId===task.id?t('deleting'):<Trash2 size={16}/>}</button></td>}</tr>)}</tbody></table></div></>;
}
function TaskMini({ task }: { task: Task }) { return <Link className="task-mini" to={`/app/tasks/${task.id}`}><span className="mini-icon"><FileText size={16} /></span><span className="mini-copy"><b>{task.title}</b><small>{task.reference}</small></span><ArrowRight size={15} /></Link>; }
function TaskList({ tasks }: { tasks: Task[] }) { return <div className="task-card-list">{tasks.map(task => <TaskCard key={task.id} task={task} />)}</div>; }
function TaskCard({ task }: { task: Task }) {
  const { i18n } = useTranslation();
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${task.due_date}T12:00:00`));
  return <Link to={`/app/tasks/${task.id}`} className="task-card"><div className="task-card-top"><span className="task-code">{task.reference}</span><StatusPill status={task.status} /></div><h3>{task.title}</h3><p>{task.description}</p><div className="task-card-bottom"><span className="task-card-due"><CalendarDays size={15} />{date}</span><PriorityPill priority={task.priority} /><span className="task-card-budget"><CircleDollarSign size={15} />{task.budget_limit === null ? '—' : formatMoney(task.budget_limit, task.currency, i18n.language)}</span></div></Link>;
}
function TaskSection({ title, accent, tasks }: { title: string; accent: string; tasks: Task[] }) { if (!tasks.length) return null; return <section className={`task-section section-${accent}`}><div className="section-title"><span className="section-indicator" /><h2>{title}</h2><span className="section-total">{tasks.length}</span></div><TaskList tasks={tasks.slice(0, 3)} /></section>; }
function EmptyTasks({ t }: { t: (key: string) => string }) { return <div className="empty-state"><div className="empty-illustration"><ClipboardList size={24} /></div><b>{t('noTasks')}</b><span>{t('noTasksHint')}</span></div>; }

function TaskListPage({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation();
  const [exportError, setExportError] = useState('');
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [assignee, setAssignee] = useState('all'); const [priority, setPriority] = useState('all'); const [month, setMonth] = useState(''); const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState(''); const [overBudgetOnly, setOverBudgetOnly] = useState(false);
  const taskPages = useInfiniteQuery({ queryKey: ['task-register',profile?.id,profile?.role], enabled: Boolean(supabase&&profile), initialPageParam: 0, queryFn: async ({pageParam}) => { const {data,error}=await supabase!.from('tasks').select('id,organisation_id,reference,title,description,status,priority,start_date,due_date,budget_limit,currency,assignee_id,assigner_id,assigned_hours,is_draft,version').is('deleted_at',null).order('due_date',{ascending:true}).range(pageParam,pageParam+49);if(error)throw error;return (data??[]) as Task[]; }, getNextPageParam:(lastPage,_pages,lastPageParam)=>lastPage.length===50?lastPageParam+50:undefined });
  const data = useMemo(() => taskPages.data?.pages.flat() ?? [], [taskPages.data]); const isLoading=taskPages.isLoading; const isError=taskPages.isError; const refetch=taskPages.refetch;
  const { data: people = [] } = useQuery({ queryKey: ['task-filter-people', profile?.id], enabled: Boolean(supabase && profile && profile.role !== 'end_user'), queryFn: async () => { const { data, error } = await supabase!.from('profiles').select('id,full_name').eq('role','end_user').eq('is_active',true).is('deleted_at',null).order('full_name'); if (error) throw error; return data ?? []; } });
  const taskIds = data.map(task => task.id);
  const { data: lines = [] } = useQuery({ queryKey: ['expense-filter-totals', profile?.id, taskIds.join(',')], enabled: Boolean(supabase && profile && taskIds.length), queryFn: async () => { const { data, error } = await supabase!.from('expense_lines').select('task_id,line_total').is('deleted_at',null).in('task_id', taskIds); if (error) throw error; return data ?? []; } });
  const spentByTask = useMemo(() => lines.reduce<Record<string,string>>((totals, line) => { totals[line.task_id] = sumMoney([totals[line.task_id] ?? '0', String(line.line_total)]); return totals; }, {}), [lines]);
  const tasks = useMemo(() => data.filter(task => (status === 'all' || task.status === status) && (assignee === 'all' || task.assignee_id === assignee) && (priority === 'all' || task.priority === priority) && (!month || task.due_date.startsWith(month)) && (!fromDate || task.due_date >= fromDate) && (!toDate || task.due_date <= toDate) && (!overBudgetOnly || (task.budget_limit !== null && new Decimal(spentByTask[task.id] ?? '0').greaterThan(task.budget_limit))) && `${task.reference} ${task.title} ${task.description}`.toLowerCase().includes(query.toLowerCase())), [data, query, status, assignee, priority, month, fromDate, toDate, overBudgetOnly, spentByTask]);
  const exportTasks = async () => { if(!supabase)return;setExportError(''); const {data:rows,error}=await supabase.rpc('export_tasks_csv',{task_assignee:assignee==='all'?null:assignee,task_status_filter:status==='all'?null:status,task_priority_filter:priority==='all'?null:priority,date_from:fromDate||null,date_to:toDate||null,due_month:month?`${month}-01`:null,search_term:query||null,over_budget_only:overBudgetOnly}); if(error){setExportError(t('exportFailed'));return;} const exportRows = (rows ?? []) as Array<{reference:string;title:string;status:string;priority:string;due_date:string;assignee_name:string;budget:number|null;spent:number;currency:string}>; const csv = toCsv(exportRows.map(row => ({ reference:row.reference, title:row.title, status:row.status, priority:row.priority, due_date:row.due_date, assignee:row.assignee_name, budget:row.budget, spent:row.spent, currency:row.currency })), [{key:'reference',label:t('reference')},{key:'title',label:t('taskName')},{key:'status',label:t('status')},{key:'priority',label:t('priority')},{key:'due_date',label:t('dueDate')},{key:'assignee',label:t('assignee')},{key:'budget',label:t('budget')},{key:'spent',label:t('spent')},{key:'currency',label:t('currency')}]);
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'taskflow-tasks.csv'; anchor.click(); URL.revokeObjectURL(url); };
  const reset = () => { setQuery(''); setStatus('all'); setAssignee('all'); setPriority('all'); setMonth(''); setFromDate(''); setToDate(''); setOverBudgetOnly(false); };
  return <><div className="page-heading"><div><div className="date-overline"><ClipboardList size={14} /> {t('workspace')}</div><h1>{t('myTasks')}</h1><p>{t('tasksSubtitle')}</p></div>{profile?.role !== 'end_user' && <Link className="primary-button create-button" to="/app/tasks/new"><Plus size={17} />{t('newTask')}</Link>}</div><div className="panel list-page-panel"><div className="list-toolbar filter-toolbar"><label className="list-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('searchTasks')} /></label><select aria-label={t('status')} value={status} onChange={e => setStatus(e.target.value)}><option value="all">{t('allStatuses')}</option>{['pending','in_progress','on_hold','skipped','submitted','verified','returned','cancelled'].map(s => <option value={s} key={s}>{t(({in_progress:'inProgress',on_hold:'onHold',cancelled:'cancelled'} as Record<string,string>)[s] ?? s)}</option>)}</select>{profile?.role !== 'end_user' && <select aria-label={t('assignee')} value={assignee} onChange={e => setAssignee(e.target.value)}><option value="all">{t('allPeople')}</option>{people.map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select>}<select aria-label={t('priority')} value={priority} onChange={e => setPriority(e.target.value)}><option value="all">{t('allPriorities')}</option>{['urgent','high','medium','low'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select><label className="month-filter">{t('month')}<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><label className="date-filter">{t('from')}<input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label><label className="date-filter">{t('to')}<input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label><label className="budget-filter"><input type="checkbox" checked={overBudgetOnly} onChange={e=>setOverBudgetOnly(e.target.checked)}/>{t('overBudget')}</label><button className="subtle-button" onClick={reset}>{t('resetFilters')}</button>{profile?.role !== 'end_user' && <button className="subtle-button" onClick={()=>void exportTasks()}>{t('exportCsv')}</button>}</div>{exportError && <div className="form-error export-error" role="alert">{exportError}</div>}<TaskTable tasks={tasks} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} profile={profile} />{taskPages.hasNextPage&&<div className="pagination-control"><button className="subtle-button" disabled={taskPages.isFetchingNextPage} onClick={()=>void taskPages.fetchNextPage()}>{taskPages.isFetchingNextPage?t('loading'):t('loadMoreTasks')}</button></div>}</div></>;
}

function ReviewQueue({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation(); const { data = [], isLoading, isError, refetch } = useTasks(profile);
  const queue = data.filter(task => task.status === 'submitted');
  return <><div className="page-heading"><div><div className="date-overline"><BadgeCheck size={14}/>{t('workspace')}</div><h1>{t('reviews')}</h1><p>{t('reviewSubtitle')}</p></div><span className="review-count large-count">{queue.length}</span></div><section className="panel review-queue-panel"><div className="panel-heading"><div><h2>{t('needsReview')}</h2><span>{t('reviewSubtitle')}</span></div></div>{isLoading ? <div className="skeleton-rows"><span/><span/><span/></div> : isError ? <div className="inline-error">{t('connectionError')}<button onClick={() => void refetch()}>{t('retry')}</button></div> : queue.length ? <TaskList tasks={queue}/> : <EmptyTasks t={t}/>}</section></>;
}

function ReportsPage({ profile }: { profile: Profile | null }) {
  const { t }=useTranslation();
  const {data:tasks=[],isLoading,isError,refetch}=useTasks(profile);
  const {data:lines=[]}=useQuery({queryKey:['report-expenses',profile?.id],enabled:Boolean(supabase&&profile),queryFn:async()=>{const {data,error}=await supabase!.from('expense_lines').select('task_id,line_total').is('deleted_at',null).limit(5000);if(error)throw error;return data??[];}});
  const {data:assignments=[]}=useQuery<ReportAssignment[]>({queryKey:['report-assignments',profile?.id],enabled:Boolean(supabase&&profile),queryFn:async()=>{const {data,error}=await supabase!.from('task_assignments').select('task_id,profile_id,assigned_hours,profiles(full_name,employee_id)').limit(5000);if(error)throw error;return (data??[]) as ReportAssignment[];}});
  const {data:serviceLogs=[]}=useQuery<ReportServiceLog[]>({queryKey:['report-service-hours',profile?.id],enabled:Boolean(supabase&&profile),queryFn:async()=>{const {data,error}=await supabase!.from('task_service_logs').select('task_id,profile_id,actual_hours').limit(5000);if(error)throw error;return (data??[]) as ReportServiceLog[];}});
  const workerHours=useMemo(()=>{
    const rows=new Map<string,{profile_id:string;name:string;employee_id:string;assigned:number;actual:number}>();
    for(const assignment of assignments){
      const person=firstRelated(assignment.profiles);const row=rows.get(assignment.profile_id)??{profile_id:assignment.profile_id,name:person?.full_name??assignment.profile_id,employee_id:person?.employee_id??'',assigned:0,actual:0};
      row.assigned+=Number(assignment.assigned_hours??0);rows.set(assignment.profile_id,row);
    }
    for(const log of serviceLogs){
      const row=rows.get(log.profile_id)??{profile_id:log.profile_id,name:log.profile_id,employee_id:'',assigned:0,actual:0};
      row.actual+=Number(log.actual_hours??0);rows.set(log.profile_id,row);
    }
    return [...rows.values()];
  },[assignments,serviceLogs]);
  const totalSpent=sumMoney(lines.map(line=>String(line.line_total)));
  const exportReport=()=>{const csv=toCsv(tasks.map(task=>({reference:task.reference,title:task.title,status:task.status,priority:task.priority,due_date:task.due_date,budget:task.budget_limit,currency:task.currency,spent:sumMoney(lines.filter(line=>line.task_id===task.id).map(line=>String(line.line_total)))})),[{key:'reference',label:t('reference')},{key:'title',label:t('taskName')},{key:'status',label:t('status')},{key:'priority',label:t('priority')},{key:'due_date',label:t('dueDate')},{key:'budget',label:t('budget')},{key:'spent',label:t('spent')},{key:'currency',label:t('currency')}]);const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='taskflow-report.csv';link.click();URL.revokeObjectURL(url);};
  return <><div className="page-heading"><div><div className="date-overline"><WalletCards size={14}/>{t('workspace')}</div><h1>{t('reports')}</h1><p>{t('reportsSubtitle')}</p></div><div className="calendar-heading-actions">{profile?.role !== 'end_user'&&<Link className="secondary-button" to="/app/calendar"><CalendarDays size={16}/>{t('calendar')}</Link>}<button className="primary-button create-button" onClick={exportReport} disabled={isLoading||isError}>{t('exportCsv')}</button></div></div>
    <section className="metrics-grid"><MetricCard label={t('totalTasks')} value={tasks.length} icon={ClipboardList} tone="purple"/><MetricCard label={t('awaitingReview')} value={tasks.filter(task=>task.status==='submitted').length} icon={BadgeCheck} tone="amber"/><MetricCard label={t('completedTasks')} value={tasks.filter(task=>task.status==='verified').length} icon={Check} tone="green"/><MetricCard label={t('spent')} value={formatMoney(totalSpent,'EUR','en-GB')} icon={CircleDollarSign} tone="blue"/></section>
    <section className="panel report-panel"><div className="panel-heading"><div><h2>{t('workerHours')}</h2><span>{t('workerHoursHint')}</span></div></div><div className="worker-hours-list">{workerHours.map(row=><div className="worker-hours-row" key={row.profile_id}><b>{row.name}</b><span>{row.employee_id||'—'}</span><span>{t('assignedHours')}: {row.assigned}</span><span>{t('actualHours')}: {row.actual}</span></div>)}{!workerHours.length&&<div className="empty-expenses">{t('noTasksHint')}</div>}</div></section>
    <section className="panel report-panel"><div className="panel-heading"><div><h2>{t('taskOverview')}</h2><span>{t('reportsSubtitle')}</span></div></div><TaskTable tasks={tasks.slice(0,50)} isLoading={isLoading} isError={isError} onRetry={()=>void refetch()} profile={profile}/></section></>;
}

type CalendarAssignment = { task_id: string; profile_id: string; assigned_hours: number | null; profiles: Related<EmployeeSummary> };
type CalendarServiceHour = { task_id: string; actual_hours: number | null };
type CalendarWorker = { id: string; full_name: string };
type TaskCalendarData = { tasks: Task[]; assignments: CalendarAssignment[]; serviceHours: CalendarServiceHour[]; workers: CalendarWorker[] };

async function loadTaskCalendar(month: string): Promise<TaskCalendarData> {
  const client = supabase;
  if (!client) throw new Error('Backend not configured');
  const { year, month: monthNumber } = parseMonthKey(month);
  const monthStart = `${month}-01`;
  const monthEnd = formatDateKey(new Date(year, monthNumber, 0));
  const pageSize = 500;
  const tasks: Task[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('tasks')
      .select('id,organisation_id,reference,title,description,status,priority,start_date,due_date,budget_limit,currency,assignee_id,assigner_id,assigned_hours,is_draft,version,customer_name,apartment_number,apartment_block,customer_address')
      .is('deleted_at', null)
      .eq('is_draft', false)
      .lte('start_date', monthEnd)
      .gte('due_date', monthStart)
      .order('start_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Task[];
    tasks.push(...page);
    if (page.length < pageSize) break;
  }

  if (!tasks.length) return { tasks, assignments: [], serviceHours: [], workers: [] };

  const taskIdBatches: string[][] = [];
  for (let index = 0; index < tasks.length; index += pageSize) {
    taskIdBatches.push(tasks.slice(index, index + pageSize).map(task => task.id));
  }
  const [assignmentResults, hoursResults] = await Promise.all([
    Promise.all(taskIdBatches.map(ids => client.from('task_assignments')
      .select('task_id,profile_id,assigned_hours,profiles(full_name,username,employee_id)')
      .in('task_id', ids))),
    Promise.all(taskIdBatches.map(ids => client.from('task_service_logs')
      .select('task_id,actual_hours')
      .in('task_id', ids))),
  ]);
  for (const result of [...assignmentResults, ...hoursResults]) {
    if (result.error) throw result.error;
  }

  const assignments = assignmentResults.flatMap(result => result.data ?? []) as CalendarAssignment[];
  const serviceHours = hoursResults.flatMap(result => result.data ?? []) as CalendarServiceHour[];
  const workerIds = [...new Set([...tasks.map(task => task.assignee_id), ...assignments.map(item => item.profile_id)])];
  const workerBatches: string[][] = [];
  for (let index = 0; index < workerIds.length; index += pageSize) {
    workerBatches.push(workerIds.slice(index, index + pageSize));
  }
  const workerResults = await Promise.all(workerBatches.map(ids => client.from('profiles')
    .select('id,full_name')
    .in('id', ids)));
  for (const result of workerResults) {
    if (result.error) throw result.error;
  }

  return {
    tasks,
    assignments,
    serviceHours,
    workers: workerResults.flatMap(result => result.data ?? []) as CalendarWorker[],
  };
}

function TaskCalendarPage({ profile }: { profile: Profile | null }) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(() => formatMonthKey(new Date()));
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['task-calendar', profile?.id, month],
    enabled: Boolean(supabase && profile && month),
    queryFn: () => loadTaskCalendar(month),
  });
  const days = getMonthCalendarDays(month);
  const { year, month: monthNumber } = parseMonthKey(month);
  const monthDate = new Date(year, monthNumber - 1, 1);
  const monthLabel = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(monthDate);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(new Date(2024, 0, index + 1)));
  const assignmentsByTask = new Map<string, CalendarAssignment[]>();
  for (const assignment of data?.assignments ?? []) {
    const group = assignmentsByTask.get(assignment.task_id) ?? [];
    group.push(assignment);
    assignmentsByTask.set(assignment.task_id, group);
  }
  const hoursByTask = new Map<string, number>();
  for (const item of data?.serviceHours ?? []) {
    hoursByTask.set(item.task_id, (hoursByTask.get(item.task_id) ?? 0) + Number(item.actual_hours ?? 0));
  }
  const workerNames = new Map((data?.workers ?? []).map(worker => [worker.id, worker.full_name]));
  const changeMonth = (amount: number) => setMonth(formatMonthKey(new Date(year, monthNumber - 1 + amount, 1)));

  return <>
    <div className="page-heading">
      <div><div className="date-overline"><CalendarDays size={14}/>{t('workspace')}</div><h1>{t('calendar')}</h1><p>{t('calendarHint')}</p></div>
      <div className="calendar-controls">
        <button type="button" className="icon-button" aria-label={t('previousMonth')} onClick={() => changeMonth(-1)}><ChevronLeft size={18}/></button>
        <input className="calendar-month" type="month" aria-label={t('monthFilter')} value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }}/>
        <button type="button" className="icon-button" aria-label={t('nextMonth')} onClick={() => changeMonth(1)}><ChevronRight size={18}/></button>
      </div>
    </div>
    <section className="panel calendar-panel">
      <div className="panel-heading"><div><h2>{monthLabel}</h2><span>{t('calendarTaskCount', { count: data?.tasks.length ?? 0 })}</span></div></div>
      {isLoading ? <div className="skeleton-rows"><span/><span/><span/></div> : isError ? <div className="inline-error">{t('connectionError')}<button onClick={() => void refetch()}>{t('retry')}</button></div> :
        <div className="calendar-scroll"><div className="calendar-grid">
          <div className="calendar-weekdays">{weekdays.map(day => <b key={day}>{day}</b>)}</div>
          <div className="calendar-days">
            {days.map(day => {
              const dayKey = formatDateKey(day);
              const dayTasks = (data?.tasks ?? []).filter(task => taskOccursOnCalendarDay(task, dayKey));
              const inMonth = day.getMonth() === monthNumber - 1;
              return <div className={`calendar-day ${inMonth ? '' : 'calendar-day-outside'} ${dayTasks.length ? 'has-tasks' : ''}`} key={dayKey}>
                <span className="calendar-day-number">{day.getDate()}</span>
                <span className="calendar-day-count">{dayTasks.length ? t('calendarDayTaskCount', { count: dayTasks.length }) : ''}</span>
                <div className="calendar-task-list">
                  {dayTasks.map(task => <CalendarTaskCard
                    key={task.id}
                    task={task}
                    assignments={assignmentsByTask.get(task.id) ?? []}
                    actualHours={hoursByTask.get(task.id) ?? 0}
                    workerNames={workerNames}
                    t={t}
                  />)}
                </div>
              </div>;
            })}
          </div>
        </div></div>}
    </section>
  </>;
}

function CalendarTaskCard({ task, assignments, actualHours, workerNames, t }: {
  task: Task;
  assignments: CalendarAssignment[];
  actualHours: number;
  workerNames: Map<string, string>;
  t: (key: string) => string;
}) {
  const members = assignments.length
    ? [...new Set(assignments.map(item => firstRelated(item.profiles)?.full_name ?? workerNames.get(item.profile_id) ?? t('worker')))]
    : [workerNames.get(task.assignee_id) ?? t('worker')];
  const allocationValues = assignments.map(item => item.assigned_hours).filter((value): value is number => value !== null);
  const allocatedHours = allocationValues.length
    ? allocationValues.reduce((total, value) => total + Number(value), 0)
    : task.assigned_hours;
  const location = [
    task.customer_address,
    [task.apartment_block, task.apartment_number].filter(Boolean).join(' '),
  ].filter(Boolean).join(' · ') || '—';

  return <Link className="calendar-task-card" to={`/app/tasks/${task.id}`}>
    <span className="calendar-task-topline"><span className="calendar-task-reference">{task.reference}</span><span className="calendar-task-badges"><PriorityPill priority={task.priority}/><StatusPill status={task.status}/></span></span>
    <b className="calendar-task-title">{task.title}</b>
    <span className="calendar-task-detail">{t('location')}: {location} · {t('taskTeam')}: {members.join(', ')}</span>
    <span className="calendar-task-hours">{t('allocatedTime')}: {allocatedHours === null || allocatedHours === undefined ? '—' : `${allocatedHours}h`} · {t('actualHours')}: {actualHours}h</span>
  </Link>;
}

function SettingsPage({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [timezone,setTimezone]=useState('Europe/Bucharest');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [areaName,setAreaName]=useState('');
  const [subtaskName,setSubtaskName]=useState('');
  const [selectedArea,setSelectedArea]=useState('');
  const [equipmentName,setEquipmentName]=useState('');
  useEffect(()=>{if(supabase&&profile)void supabase.from('profiles').select('timezone').eq('id',profile.id).maybeSingle().then(({data})=>{if(data?.timezone)setTimezone(data.timezone);});},[profile]);
  const areasQuery=useQuery({queryKey:['settings-areas'],enabled:Boolean(supabase&&profile?.role==='super_admin'),queryFn:async()=>{const {data,error}=await supabase!.from('cleaning_areas').select('id,name,is_active,sort_order').order('sort_order').order('name');if(error)throw error;return data??[];}});
  const subtasksQuery=useQuery({queryKey:['settings-subtasks'],enabled:Boolean(supabase&&profile?.role==='super_admin'),queryFn:async()=>{const {data,error}=await supabase!.from('cleaning_subtasks').select('id,area_id,name,is_active').order('name');if(error)throw error;return data??[];}});
  const equipmentQuery=useQuery({queryKey:['settings-equipment'],enabled:Boolean(supabase&&profile?.role==='super_admin'),queryFn:async()=>{const {data,error}=await supabase!.from('cleaning_equipment').select('id,name,is_active').order('name');if(error)throw error;return data??[];}});
  const save=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!supabase||!profile)return;setBusy(true);const {error}=await supabase.from('profiles').update({timezone}).eq('id',profile.id);setMessage(error?t('saveFailed'):t('settingsSaved'));setBusy(false);};
  const addArea=async()=>{if(!supabase||areaName.trim().length<2)return;const {error}=await supabase.from('cleaning_areas').insert({name:areaName.trim(),organisation_id:profile?.organisation_id});if(error)setMessage(t('saveFailed'));else{setAreaName('');await qc.invalidateQueries({queryKey:['settings-areas']});}};
  const addSubtask=async()=>{if(!supabase||!selectedArea||subtaskName.trim().length<2)return;const {error}=await supabase.from('cleaning_subtasks').insert({name:subtaskName.trim(),area_id:selectedArea,organisation_id:profile?.organisation_id});if(error)setMessage(t('saveFailed'));else{setSubtaskName('');await qc.invalidateQueries({queryKey:['settings-subtasks']});}};
  const addEquipment=async()=>{if(!supabase||equipmentName.trim().length<2)return;const {error}=await supabase.from('cleaning_equipment').insert({name:equipmentName.trim(),organisation_id:profile?.organisation_id});if(error)setMessage(t('saveFailed'));else{setEquipmentName('');await qc.invalidateQueries({queryKey:['settings-equipment']});}};
  const catalogKey=(table:'cleaning_areas'|'cleaning_subtasks'|'cleaning_equipment')=>table==='cleaning_areas'?'settings-areas':table==='cleaning_subtasks'?'settings-subtasks':'settings-equipment';
  const toggleRecord=async(table:'cleaning_areas'|'cleaning_subtasks'|'cleaning_equipment',id:string,active:boolean)=>{if(!supabase)return;const {error}=await supabase.from(table).update({is_active:!active}).eq('id',id);if(error)setMessage(t('saveFailed'));else await qc.invalidateQueries({queryKey:[catalogKey(table)]});};
  const renameRecord=async(table:'cleaning_areas'|'cleaning_subtasks'|'cleaning_equipment',id:string,currentName:string)=>{if(!supabase)return;const name=window.prompt(t('renameItem'),currentName)?.trim();if(!name||name.length<2)return;const {error}=await supabase.from(table).update({name}).eq('id',id);if(error)setMessage(t('saveFailed'));else await qc.invalidateQueries({queryKey:[catalogKey(table)]});};
  const deleteRecord=async(table:'cleaning_areas'|'cleaning_subtasks'|'cleaning_equipment',id:string)=>{if(!supabase||!window.confirm(t('deleteConfirm')))return;const {error}=await supabase.from(table).delete().eq('id',id);if(error)setMessage(t('deleteFailed'));else await qc.invalidateQueries({queryKey:[catalogKey(table)]});};
  const areas=areasQuery.data??[]; const subtasks=subtasksQuery.data??[]; const equipment=equipmentQuery.data??[];
  return <><div className="page-heading"><div><div className="date-overline"><Settings size={14}/>{t('workspace')}</div><h1>{t('settings')}</h1><p>{t('settingsSubtitle')}</p></div></div>
    <form className="panel settings-panel" onSubmit={event=>void save(event)}><div className="settings-section"><h2>{t('profile')}</h2><p>{profile?.full_name} · @{profile?.username}</p><Field label={t('timezone')}><select value={timezone} onChange={event=>setTimezone(event.target.value)}>{['Europe/Bucharest','Europe/London','Europe/Paris','UTC','America/New_York'].map(zone=><option value={zone} key={zone}>{zone}</option>)}</select></Field></div>{message&&<div className="inline-notice" role="status">{message}</div>}<div className="form-actions"><button className="primary-button" disabled={busy}>{busy?t('saving'):t('save')}</button></div></form>
    {profile?.role==='super_admin'&&<><section className="panel catalog-panel"><div className="panel-heading"><div><h2>{t('cleaningAreas')}</h2><span>{t('catalogHint')}</span></div></div><div className="catalog-add"><input value={areaName} onChange={e=>setAreaName(e.target.value)} placeholder={t('areaName')} /><button type="button" className="primary-button" onClick={()=>void addArea()}><Plus size={15}/>{t('add')}</button></div><div className="catalog-list">{areas.map(area=><div className="catalog-row" key={area.id}><b>{area.name}</b><button type="button" className="subtle-button" onClick={()=>void renameRecord('cleaning_areas',area.id,area.name)}>{t('edit')}</button><button type="button" className="subtle-button" onClick={()=>void toggleRecord('cleaning_areas',area.id,area.is_active)}>{area.is_active?t('deactivate'):t('reactivate')}</button><button type="button" className="subtle-button danger-button" onClick={()=>void deleteRecord('cleaning_areas',area.id)}>{t('delete')}</button></div>)}</div></section>
    <section className="panel catalog-panel"><div className="panel-heading"><div><h2>{t('cleaningSubtasks')}</h2><span>{t('catalogHint')}</span></div></div><div className="catalog-add"><select value={selectedArea} onChange={e=>setSelectedArea(e.target.value)}><option value="">{t('selectArea')}</option>{areas.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select><input value={subtaskName} onChange={e=>setSubtaskName(e.target.value)} placeholder={t('subtaskName')}/><button type="button" className="primary-button" onClick={()=>void addSubtask()}><Plus size={15}/>{t('add')}</button></div><div className="catalog-list">{subtasks.map(subtask=><div className="catalog-row" key={subtask.id}><span><b>{subtask.name}</b><small>{areas.find(area=>area.id===subtask.area_id)?.name||''}</small></span><button type="button" className="subtle-button" onClick={()=>void renameRecord('cleaning_subtasks',subtask.id,subtask.name)}>{t('edit')}</button><button type="button" className="subtle-button" onClick={()=>void toggleRecord('cleaning_subtasks',subtask.id,subtask.is_active)}>{subtask.is_active?t('deactivate'):t('reactivate')}</button><button type="button" className="subtle-button danger-button" onClick={()=>void deleteRecord('cleaning_subtasks',subtask.id)}>{t('delete')}</button></div>)}</div></section>
    <section className="panel catalog-panel"><div className="panel-heading"><div><h2>{t('equipment')}</h2><span>{t('equipmentHint')}</span></div></div><div className="catalog-add"><input value={equipmentName} onChange={e=>setEquipmentName(e.target.value)} placeholder={t('equipmentName')}/><button type="button" className="primary-button" onClick={()=>void addEquipment()}><Plus size={15}/>{t('add')}</button></div><div className="catalog-list">{equipment.map(item=><div className="catalog-row" key={item.id}><b>{item.name}</b><button type="button" className="subtle-button" onClick={()=>void renameRecord('cleaning_equipment',item.id,item.name)}>{t('edit')}</button><button type="button" className="subtle-button" onClick={()=>void toggleRecord('cleaning_equipment',item.id,item.is_active)}>{item.is_active?t('deactivate'):t('reactivate')}</button><button type="button" className="subtle-button danger-button" onClick={()=>void deleteRecord('cleaning_equipment',item.id)}>{t('delete')}</button></div>)}</div></section></>}
  </>;
}

function AuditPage() {
  const { t }=useTranslation();const {data:events=[],isLoading,isError,refetch}=useQuery({queryKey:['audit-events'],enabled:Boolean(supabase),queryFn:async()=>{const {data,error}=await supabase!.from('audit_events').select('id,actor_id,action,entity_type,entity_id,details,created_at').order('created_at',{ascending:false}).limit(100);if(error)throw error;return data??[];}});
  return <><div className="page-heading"><div><div className="date-overline"><ShieldCheck size={14}/>{t('workspace')}</div><h1>{t('auditLog')}</h1><p>{t('auditSubtitle')}</p></div></div><section className="panel audit-panel"><div className="panel-heading"><div><h2>{t('auditLog')}</h2><span>{t('auditLastHundred')}</span></div></div>{isLoading?<div className="skeleton-rows"><span/><span/><span/></div>:isError?<div className="inline-error">{t('connectionError')}<button onClick={()=>void refetch()}>{t('retry')}</button></div>:<div className="table-scroll"><table className="task-table"><thead><tr><th>{t('date')}</th><th>{t('actor')}</th><th>{t('action')}</th><th>{t('entity')}</th><th>{t('details')}</th></tr></thead><tbody>{events.map(event=><tr key={event.id}><td>{new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(event.created_at))}</td><td>{event.actor_id?.slice(0,8)??'—'}</td><td>{event.action}</td><td>{event.entity_type}</td><td>{JSON.stringify(event.details)}</td></tr>)}</tbody></table>{!events.length&&<EmptyTasks t={t}/>}</div>}</section></>;
}

type ManagedProfile = { id: string; full_name: string; username: string; role: Profile['role']; recovery_email: string | null; is_active: boolean; job_position: 'employee' | 'manager'; manager_id: string | null; phone: string | null; employee_id: string | null; department: string | null; timezone: string };
type TemporaryCredentials = { username: string; password: string };
function PeoplePage({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const [open, setOpen] = useState(false); const [editing, setEditing] = useState<ManagedProfile | null>(null); const [scopeOpen, setScopeOpen] = useState(false); const [message, setMessage] = useState(''); const [credentials, setCredentials] = useState<TemporaryCredentials | null>(null); const [busy, setBusy] = useState(false);
  const { data: people = [], isLoading, isError, refetch } = useQuery({ queryKey: ['people', profile?.organisation_id], enabled: Boolean(supabase && profile?.role === 'super_admin'), queryFn: async () => {
    const { data, error } = await supabase!.from('profiles').select('id,full_name,username,role,recovery_email,is_active,job_position,manager_id,phone,employee_id,department,timezone').order('full_name'); if (error) throw error; return (data ?? []) as ManagedProfile[];
  } });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage(''); setBusy(true); if (!supabase) { setBusy(false); return; }
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const payload = { id: editing?.id, email, username: String(form.get('username')).trim().toLowerCase(), full_name: String(form.get('full_name')).trim(), role: String(form.get('role')), phone: String(form.get('phone') || '').trim() || null, employee_id: String(form.get('employee_id') || '').trim() || null, department: String(form.get('department') || '').trim() || null, language: 'en', timezone: String(form.get('timezone') || editing?.timezone || 'Europe/Bucharest'), job_position: String(form.get('job_position')), manager_id: String(form.get('manager_id') || '') || null };
    const { data, error } = await supabase.functions.invoke('admin-user-upsert', { body: payload });
    if (error) {
      let failure = t('accountSaveFailed');
      const context = error.context as Response | undefined;
      if (context instanceof Response) { const body = await context.clone().json().catch(() => null) as { error?: string } | null; if (body?.error) failure = body.error; }
      setMessage(failure);
    } else {
      if (editing) setMessage(t('userUpdated'));
      else {
        setMessage(t('accountCreated'));
        if (typeof data?.username === 'string' && typeof data?.temporary_password === 'string') setCredentials({ username: data.username, password: data.temporary_password });
      }
      setOpen(false); setEditing(null); await qc.invalidateQueries({ queryKey: ['people'] });
    }
    setBusy(false);
  };
  const resetTemporaryPassword = async (person: ManagedProfile) => {
    if (!supabase || !window.confirm(t('resetTempConfirm'))) return;
    setBusy(true); setMessage('');
    const { data, error } = await supabase.functions.invoke('admin-user-upsert', { body: { action: 'reset-password', user_id: person.id } });
    if (error) setMessage(t('accountSaveFailed'));
    else if (typeof data?.username === 'string' && typeof data?.temporary_password === 'string') {
      setCredentials({ username: data.username, password: data.temporary_password }); setMessage(t('temporaryPasswordReady'));
    }
    setBusy(false);
  };
  const copyCredentials = async () => {
    if (!credentials) return;
    try { await navigator.clipboard.writeText(`Username: ${credentials.username}\nTemporary password: ${credentials.password}`); setMessage(t('credentialsCopied')); }
    catch { setMessage(t('copyCredentialsFailed')); }
  };
  const toggleActive = async (person: ManagedProfile) => {
    if (!supabase || person.id === profile?.id) return;
    const { error } = await supabase.functions.invoke('admin-user-upsert', { body: { id: person.id, email: person.recovery_email, username: person.username, full_name: person.full_name, role: person.role, is_active: !person.is_active, job_position: person.job_position, manager_id: person.manager_id, phone: person.phone, employee_id: person.employee_id, department: person.department, language: 'en', timezone: person.timezone } });
    if (error) setMessage(t('accountSaveFailed')); else { setMessage(person.is_active ? t('userDeactivated') : t('userReactivated')); await qc.invalidateQueries({ queryKey: ['people'] }); }
  };
  const updateScope = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if(!supabase)return; setBusy(true); setMessage(''); const form=new FormData(event.currentTarget); const assignerId=String(form.get('assigner_id')); const endUserIds=form.getAll('end_user_ids').map(String); const {error}=await supabase.functions.invoke('admin-user-upsert',{body:{action:'set-scope',assigner_id:assignerId,end_user_ids:endUserIds}}); if(error)setMessage(t('scopeSaveFailed'));else{setMessage(t('scopeSaved'));setScopeOpen(false);await qc.invalidateQueries({queryKey:['people']});}setBusy(false);
  };
  return <><div className="page-heading"><div><div className="date-overline"><Users size={14}/>{t('workspace')}</div><h1>{t('people')}</h1><p>{t('peopleSubtitle')}</p></div>{profile?.role === 'super_admin' && <button className="primary-button create-button" onClick={() => { setMessage(''); setEditing(null); setOpen(!open); }}><Plus size={16}/>{t('addUser')}</button>}</div>
    {message && <div className="inline-notice" role="status">{message}</div>}
    {credentials && <section className="panel temporary-credentials" aria-live="polite"><div><h2>{t('temporaryPasswordReady')}</h2><p>{t('temporaryPasswordHint')}</p></div><dl><div><dt>{t('username')}</dt><dd>{credentials.username}</dd></div><div><dt>{t('temporaryPassword')}</dt><dd><code>{credentials.password}</code></dd></div></dl><div className="form-actions"><button type="button" className="secondary-button" onClick={() => void copyCredentials()}>{t('copyCredentials')}</button><button type="button" className="subtle-button" onClick={() => setCredentials(null)}>{t('dismiss')}</button></div></section>}
    {open && <UserForm key={editing?.id ?? 'new'} role={profile?.role ?? 'end_user'} people={people} user={editing} busy={busy} onCancel={() => { setOpen(false); setEditing(null); }} onSubmit={submit} />}
    {profile?.role==='super_admin' && <><button className="subtle-button scope-toggle" onClick={()=>setScopeOpen(!scopeOpen)}><Users size={15}/>{t('manageAssignerScope')}</button>{scopeOpen&&<form className="panel create-form scope-form" onSubmit={event=>void updateScope(event)}><h2>{t('manageAssignerScope')}</h2><Field label={t('assignerRole')}><select name="assigner_id" required defaultValue=""><option value="" disabled>{t('selectAssignee')}</option>{people.filter(person=>person.role==='assigner'&&person.is_active).map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</select></Field><Field label={t('allowedEndUsers')}><select name="end_user_ids" multiple size={Math.min(6,Math.max(2,people.filter(person=>person.role==='end_user'&&person.is_active).length))} aria-label={t('allowedEndUsers')}>{people.filter(person=>person.role==='end_user'&&person.is_active).map(person=><option key={person.id} value={person.id}>{person.full_name} · @{person.username}</option>)}</select></Field><small>{t('scopeMultiSelect')}</small><div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setScopeOpen(false)}>{t('cancel')}</button><button className="primary-button" disabled={busy}>{busy?t('saving'):t('saveScope')}</button></div></form>}</>}
    <section className="panel list-page-panel people-panel"><div className="panel-heading"><div><h2>{t('people')}</h2><span>{t('peopleSubtitle')}</span></div></div>{isLoading ? <div className="skeleton-rows"><span/><span/><span/></div> : isError ? <div className="inline-error">{t('connectionError')}<button onClick={() => void refetch()}>{t('retry')}</button></div> : <div className="table-scroll"><table className="task-table people-table"><thead><tr><th>{t('name')}</th><th>{t('username')}</th><th>{t('accessRole')}</th><th>{t('jobPosition')}</th><th>{t('reportsTo')}</th><th>{t('email')}</th><th>{t('status')}</th><th/></tr></thead><tbody>{people.map(person => { const manager = people.find(candidate => candidate.id === person.manager_id); return <tr key={person.id}><td><b>{person.full_name}</b></td><td>@{person.username}</td><td>{person.role === 'super_admin' ? t('mainAdmin') : person.role === 'assigner' ? t('assignerRole') : t('user')}</td><td>{person.job_position === 'manager' ? t('managerPosition') : t('employeePosition')}</td><td>{manager?.full_name ?? '—'}</td><td>{person.recovery_email ?? '—'}</td><td><span className={`status-pill ${person.is_active ? 'status-verified' : 'status-cancelled'}`}><i/>{person.is_active ? t('active') : t('inactive')}</span></td><td><div className="people-row-actions">{profile?.role === 'super_admin' && <><button className="subtle-button" disabled={busy} onClick={() => { setMessage(''); setEditing(person); setOpen(true); }}><Pencil size={14}/>{t('editUser')}</button><button className="subtle-button" disabled={busy || person.id === profile.id} onClick={() => void resetTemporaryPassword(person)}>{t('resetTempPassword')}</button>{person.id !== profile.id && <button className="subtle-button" disabled={busy} onClick={() => void toggleActive(person)}>{person.is_active ? t('deactivate') : t('reactivate')}</button>}</>}</div></td></tr>; })}</tbody></table></div>}</section></>;
}

const taskFormSchema = z.object({
  reference: z.string().trim().min(2).max(40),
  title: z.string().trim().min(3).max(150),
  description: z.string().max(10000),
  assignee: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  startDate: z.string().min(1),
  dueDate: z.string().min(1),
  budget: z.string().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).refine(value => value.dueDate >= value.startDate, { path: ['dueDate'], message: 'Due date cannot be before the start date.' })
  .refine(value => !value.budget || /^\d{1,12}(\.\d{1,2})?$/.test(value.budget), { path: ['budget'], message: 'Enter a non-negative amount with up to two decimals.' });
type TaskFormValues = z.infer<typeof taskFormSchema>;

async function uploadTaskPhotos(task: Task, files: File[], photoType: 'assignment' | 'completion') {
  if (!supabase) throw new Error('Backend not configured');
  let pendingPath: string | null = null;
  try {
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
        throw new Error('Choose JPG, PNG or WebP images under 10 MB.');
      }
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${task.organisation_id}/${task.id}/${photoType}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('task-proofs').upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      pendingPath = path;
      const { error: registerError } = await supabase.rpc('register_task_photo', {
        photo_task_id: task.id, photo_type: photoType, photo_path: path,
        photo_name: file.name, photo_mime: file.type, photo_size: file.size,
      });
      if (registerError) throw registerError;
      pendingPath = null;
    }
  } catch (error) {
    if (pendingPath) {
      const { error: cleanupError } = await supabase.storage.from('task-proofs').remove([pendingPath]);
      if (cleanupError) console.error('Task photo upload cleanup failed', cleanupError);
    }
    throw error;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '';
}

function CreateTaskPage({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [formError, setFormError] = useState('');
  const [activeTab, setActiveTab] = useState<'assignment'|'customer'|'services'>('assignment');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [assignedHours, setAssignedHours] = useState('');
  const [assignmentPhotos, setAssignmentPhotos] = useState<File[]>([]);
  const [selectedServices, setSelectedServices] = useState<Record<string, { areaId: string; subtaskId: string; hours: string }>>({});
  const [selectedEquipment, setSelectedEquipment] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState({ customer_name: '', apartment_number: '', apartment_block: '', customer_address: '', customer_phone: '' });
  const { data: people = [], isLoading } = useQuery({ queryKey: ['permitted-users', profile?.id], enabled: Boolean(supabase && profile && profile.role !== 'end_user'), queryFn: async () => {
    const { data, error } = await supabase!.from('profiles').select('id,full_name,username,employee_id').eq('role','end_user').eq('is_active',true).is('deleted_at',null).order('full_name');
    if (error) throw error; return data ?? [];
  } });
  const { data: areas=[] } = useQuery({ queryKey:['cleaning-areas'], enabled:Boolean(supabase), queryFn:async()=>{const {data,error}=await supabase!.from('cleaning_areas').select('id,name,sort_order').eq('is_active',true).order('sort_order').order('name');if(error)throw error;return data??[];} });
  const { data: subtasks=[] } = useQuery({ queryKey:['cleaning-subtasks'], enabled:Boolean(supabase), queryFn:async()=>{const {data,error}=await supabase!.from('cleaning_subtasks').select('id,area_id,name,sort_order').eq('is_active',true).order('sort_order').order('name');if(error)throw error;return data??[];} });
  const { data: equipment=[] } = useQuery({ queryKey:['cleaning-equipment'], enabled:Boolean(supabase), queryFn:async()=>{const {data,error}=await supabase!.from('cleaning_equipment').select('id,name').eq('is_active',true).order('name');if(error)throw error;return data??[];} });
  const { register, handleSubmit, formState:{errors,isSubmitting} } = useForm<TaskFormValues>({ resolver:zodResolver(taskFormSchema), defaultValues:{reference:'',title:'',description:'',assignee:'',priority:'medium',startDate:new Date().toISOString().slice(0,10),dueDate:'',budget:'',currency:'EUR'} });
  const saveTask = async (values: TaskFormValues, draft: boolean) => {
    setFormError('');
    if (!supabase) { setFormError(t('backendMissing')); return; }
    if (!profile) { setFormError(t('connectionError')); return; }
    if (profile.role === 'end_user') { setFormError(t('noPermission')); return; }
    if (!draft && !assignees.length) { setActiveTab('assignment'); setFormError(t('selectAtLeastOneWorker')); return; }
    if (customer.customer_name.trim().length < 2 || customer.apartment_number.trim().length < 1 || customer.apartment_block.trim().length < 1 || customer.customer_address.trim().length < 3 || customer.customer_phone.trim().length < 5) { setActiveTab('customer'); setFormError(t('customerDetailsRequired')); return; }
    if (assignedHours && (!/^\d+(\.\d{1,2})?$/.test(assignedHours) || Number(assignedHours) <= 0)) { setActiveTab('assignment'); setFormError(t('invalidAssignedHours')); return; }
    if (!Object.keys(selectedServices).length) { setActiveTab('services'); setFormError(t('serviceHoursRequired')); return; }
    if (Object.values(selectedServices).some(service=>service.hours&&(!/^\d+(\.\d{1,2})?$/.test(service.hours)||Number(service.hours)<=0))) { setActiveTab('services'); setFormError(t('invalidAssignedHours')); return; }
    const serviceSelections = Object.values(selectedServices).map(service=>({area_id:service.areaId,subtask_id:service.subtaskId||null,assigned_hours:service.hours?Number(service.hours):null}));
    const equipmentItems = Object.entries(selectedEquipment).filter(([,quantity])=>quantity>0).map(([equipment_id,quantity])=>({equipment_id,quantity}));
    const {data,error}=await supabase.rpc('create_cleaning_task',{
      task_reference:values.reference,task_title:values.title,task_description:values.description,
      task_priority:values.priority,task_start:values.startDate,task_due:values.dueDate,
      task_assigned_hours:assignedHours?Number(assignedHours):null,assignee_ids:draft?[]:assignees,service_selections:serviceSelections,
      equipment_items:equipmentItems,customer,task_budget:values.budget?values.budget:null,task_currency:values.currency,task_is_draft:draft
    });
    if(error){
      console.error('Task creation failed',error);
      if(isDuplicateTaskReferenceError(error)){setActiveTab('assignment');setFormError(t('duplicateTaskReference'));return;}
      setFormError(`${t('taskValidationError')} ${error.message}`);return;
    }
    try {
      if (assignmentPhotos.length) await uploadTaskPhotos(data as Task, assignmentPhotos, 'assignment');
    } catch {
      await qc.invalidateQueries({queryKey:['tasks']});
      navigate(`/app/tasks/${data.id}`, { state: { photoUploadFailed: true } });
      return;
    }
    await qc.invalidateQueries({queryKey:['tasks']});
    navigate(`/app/tasks/${data.id}`);
  };
  const handleInvalid = (invalid: FieldErrors<TaskFormValues>) => {
    const assignmentFields = ['reference', 'title', 'priority', 'startDate', 'dueDate', 'budget', 'currency'];
    setActiveTab(assignmentFields.some(field => field in invalid) ? 'assignment' : 'customer');
    setFormError(t('taskFormFieldsInvalid'));
  };
  const submit = handleSubmit(values => saveTask(values, false), handleInvalid);
  const saveDraft = handleSubmit(values => saveTask(values, true), handleInvalid);
  const toggleAssignee=(id:string)=>setAssignees(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  const toggleSubtask=(areaId:string,subtaskId:string)=>{
    const key=subtaskId;
    setSelectedServices(current=>{
      const next={...current};
      if(next[key])delete next[key];else next[key]={areaId,subtaskId,hours:''};
      return next;
    });
  };
  return <><div className="detail-back"><Link to="/app/tasks">← {t('myTasks')}</Link></div>
    <div className="page-heading"><div><div className="date-overline"><Plus size={14}/>{t('createTask')}</div><h1>{t('newTask')}</h1><p>{t('createTaskSubtitle')}</p></div></div>
    <form className="panel create-form task-wizard" onSubmit={event=>void submit(event)} noValidate>
      {formError&&<div className="form-error form-summary" role="alert">{formError}</div>}
      <div className="wizard-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab==='assignment'} className={activeTab==='assignment'?'active':''} onClick={()=>setActiveTab('assignment')}>1 · {t('employeeAssignment')}</button>
        <button type="button" role="tab" aria-selected={activeTab==='customer'} className={activeTab==='customer'?'active':''} onClick={()=>setActiveTab('customer')}>2 · {t('customerDetails')}</button>
        <button type="button" role="tab" aria-selected={activeTab==='services'} className={activeTab==='services'?'active':''} onClick={()=>setActiveTab('services')}>3 · {t('taskDetails')}</button>
      </div>
      {activeTab==='assignment'&&<div className="wizard-panel"><div className="form-grid">
        <Field label={t('reference')} error={errors.reference?.message}><input {...register('reference')} placeholder="TSK-1042"/></Field>
        <Field label={t('title')} error={errors.title?.message}><input {...register('title')} maxLength={150}/></Field>
        <Field label={t('priority')}><select {...register('priority')}><option value="low">{t('low')}</option><option value="medium">{t('medium')}</option><option value="high">{t('high')}</option><option value="urgent">{t('urgent')}</option></select></Field>
        <Field label={t('startDate')} error={errors.startDate?.message}><input type="date" {...register('startDate')}/></Field>
        <Field label={t('dueDate')} error={errors.dueDate?.message}><input type="date" {...register('dueDate')}/></Field>
        <Field label={t('taskEstimateOptional')}><input type="number" min="0.25" step="0.25" value={assignedHours} onChange={event=>setAssignedHours(event.target.value)} placeholder="2"/></Field>
        <Field label={t('budget')} error={errors.budget?.message}><input inputMode="decimal" placeholder="0.00" {...register('budget')}/></Field>
        <Field label={t('currency')}><select {...register('currency')}><option value="EUR">EUR · Euro</option><option value="RON">RON · Romanian leu</option><option value="USD">USD · US dollar</option></select></Field>
      </div><div className="assignment-section"><h2>{t('assignedEmployees')}</h2><p>{t('groupTaskHint')}</p><div className="employee-picker">{people.map(person=><label className={`employee-option ${assignees.includes(person.id)?'selected':''}`} key={person.id}><input type="checkbox" checked={assignees.includes(person.id)} onChange={()=>toggleAssignee(person.id)} /><span className="employee-avatar">{person.full_name.slice(0,1).toUpperCase()}</span><span><b>{person.full_name}</b><small>{person.employee_id?`${t('employeeId')}: ${person.employee_id}`:`@${person.username}`}</small></span></label>)}</div>{isLoading&&<span>{t('loading')}</span>}</div></div>}
      {activeTab==='customer'&&<div className="wizard-panel"><div className="form-grid">
        <Field label={t('customerName')}><input value={customer.customer_name} onChange={e=>setCustomer({...customer,customer_name:e.target.value})} required/></Field>
        <Field label={t('apartmentNumber')}><input value={customer.apartment_number} onChange={e=>setCustomer({...customer,apartment_number:e.target.value})} required/></Field>
        <Field label={t('apartmentBlock')}><input value={customer.apartment_block} onChange={e=>setCustomer({...customer,apartment_block:e.target.value})} required/></Field>
        <Field label={t('customerPhone')}><input type="tel" value={customer.customer_phone} onChange={e=>setCustomer({...customer,customer_phone:e.target.value})} required/></Field>
        <Field label={t('customerAddress')} wide><textarea rows={3} value={customer.customer_address} onChange={e=>setCustomer({...customer,customer_address:e.target.value})} required/></Field>
        <Field label={t('description')} error={errors.description?.message} wide><textarea rows={3} maxLength={10000} {...register('description')}/></Field>
      </div></div>}
      {activeTab==='services'&&<div className="wizard-panel">
        <p className="service-estimate-hint">{t('serviceEstimateOptionalHint')}</p>
        <div className="service-grid">{areas.map(area=><section className="service-area" key={area.id}><h2>{area.name}</h2>{subtasks.filter(subtask=>subtask.area_id===area.id).map(subtask=>{const selected=Boolean(selectedServices[subtask.id]);return <label className={`service-check ${selected?'selected':''}`} key={subtask.id}><input type="checkbox" checked={selected} onChange={()=>toggleSubtask(area.id,subtask.id)} /><span>{subtask.name}</span>{selected&&<input className="service-hours" type="number" min="0.25" step="0.25" placeholder={t('serviceEstimateOptional')} value={selectedServices[subtask.id]?.hours||''} onChange={e=>setSelectedServices({...selectedServices,[subtask.id]:{...selectedServices[subtask.id],hours:e.target.value}})} />}</label>;})}</section>)}</div>
        <section className="equipment-section"><h2>{t('equipment')}</h2><p>{t('equipmentHint')}</p><div className="equipment-picker">{equipment.map(item=>                <label className="equipment-option" key={item.id}><input type="checkbox" checked={(selectedEquipment[item.id]??0)>0} onChange={e=>setSelectedEquipment({...selectedEquipment,[item.id]:e.target.checked?1:0})}/><span>{item.name}</span>{(selectedEquipment[item.id]??0)>0&&<input type="number" min="1" step="1" value={selectedEquipment[item.id]??1} onChange={e=>setSelectedEquipment({...selectedEquipment,[item.id]:Math.max(1,Number(e.target.value))})}/>}</label>)}</div></section>
      </div>}
      {activeTab==='assignment'&&<section className="assignment-section photo-upload-section"><h2>{t('assignmentPhotos')}</h2><p>{t('assignmentPhotosHint')}</p><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event=>setAssignmentPhotos(Array.from(event.target.files??[]))}/>{assignmentPhotos.length>0&&<small>{t('photosSelected', {count:assignmentPhotos.length})}</small>}</section>}
      <div className="wizard-actions"><button type="button" className="secondary-button" onClick={()=>activeTab==='assignment'?setActiveTab('assignment'):setActiveTab(activeTab==='services'?'customer':'assignment')}>{t('back')}</button><div>{activeTab!=='services'?<button type="button" className="primary-button" onClick={()=>setActiveTab(activeTab==='assignment'?'customer':'services')}>{t('continue')} <ArrowRight size={15}/></button>:<><Link className="secondary-button" to="/app/tasks">{t('cancel')}</Link><button type="button" className="secondary-button" disabled={isSubmitting} onClick={()=>void saveDraft()}>{t('saveDraft')}</button><button className="primary-button" disabled={isSubmitting}>{isSubmitting?t('saving'):t('assignTask')} <ArrowRight size={15}/></button></>}</div></div>
    </form></>;
}

function Field({ label, error, wide = false, children }: { label: string; error?: string; wide?: boolean; children: ReactNode }) {
  return <div className={`form-field ${wide ? 'field-wide' : ''}`}><label>{label}{children}</label>{error && <span className="field-error">{error}</span>}</div>;
}

function UserForm({ role, people, user, busy, onCancel, onSubmit }: { role: Profile['role']; people: ManagedProfile[]; user: ManagedProfile | null; busy: boolean; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const { t } = useTranslation();
  const availableManagers = people.filter(person => person.job_position === 'manager' && person.id !== user?.id && (person.is_active || person.id === user?.manager_id));
  return <form className="panel create-form people-form" onSubmit={onSubmit}><div className="panel-heading form-panel-heading"><div><h2>{user ? t('editUser') : t('addUser')}</h2><span>{user ? t('userManagementHint') : t('accountCreationHint')}</span></div><button className="icon-button" type="button" onClick={onCancel} aria-label={t('close')}>×</button></div><div className="form-grid"><Field label={t('name')}><input name="full_name" required minLength={2} autoComplete="name" defaultValue={user?.full_name}/></Field><Field label={t('username')}><input name="username" required minLength={3} autoComplete="username" defaultValue={user?.username}/></Field><Field label={t('emailOptional')}><input name="email" type="email" autoComplete="email" defaultValue={user?.recovery_email ?? ''}/></Field><Field label={t('accessRole')}><select name="role" defaultValue={user?.role ?? 'end_user'}><option value="end_user">{t('user')}</option>{role === 'super_admin' && <option value="assigner">{t('assignerRole')}</option>}{role === 'super_admin' && user && <option value="super_admin">{t('mainAdmin')}</option>}</select></Field><Field label={t('jobPosition')}><select name="job_position" defaultValue={user?.job_position ?? 'employee'}><option value="employee">{t('employeePosition')}</option><option value="manager">{t('managerPosition')}</option></select></Field><Field label={t('reportsTo')}><select name="manager_id" defaultValue={user?.manager_id ?? ''}><option value="">{t('noManager')}</option>{availableManagers.map(manager=><option key={manager.id} value={manager.id}>{manager.full_name}{manager.is_active ? '' : ` · ${t('inactive')}`}</option>)}</select></Field><Field label={t('phone')}><input name="phone" type="tel" autoComplete="tel" defaultValue={user?.phone ?? ''}/></Field><Field label={t('employeeId')}><input name="employee_id" required minLength={2} maxLength={40} defaultValue={user?.employee_id ?? ''}/></Field><Field label={t('department')}><input name="department" defaultValue={user?.department ?? ''}/></Field></div><div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>{t('cancel')}</button><button className="primary-button" disabled={busy}>{busy ? t('saving') : user ? t('saveChanges') : t('createAccount')}</button></div></form>;
}

function TaskDetail({ profile }: { profile: Profile | null }) {
  const { taskId = '' } = useParams(); const { t } = useTranslation(); const qc = useQueryClient(); const location = useLocation(); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(location.state?.photoUploadFailed ? t('photoUploadFailed') : ''); const [expenseOpen, setExpenseOpen] = useState(false); const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0,10)); const [category, setCategory] = useState(''); const [expenseDescription, setExpenseDescription] = useState(''); const [quantity, setQuantity] = useState('1'); const [unitAmount, setUnitAmount] = useState(''); const [proofFile, setProofFile] = useState<File | null>(null); const [completionFiles, setCompletionFiles] = useState<File[]>([]); const [assignmentFiles, setAssignmentFiles] = useState<File[]>([]); const [serviceProgress, setServiceProgress] = useState<Record<string, { hours: string; completed: boolean; comment: string }>>({}); const [equipmentReturns, setEquipmentReturns] = useState<Record<string, string>>({}); const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const taskQuery = useQuery({ queryKey: ['task', taskId], enabled: Boolean(supabase && taskId), queryFn: async () => { const { data, error } = await supabase!.from('tasks').select('*').eq('id', taskId).single(); if (error) throw error; return data as Task; } });
  const expenseQuery = useQuery({ queryKey: ['expenses', taskId], enabled: Boolean(supabase && taskId), queryFn: async () => { const { data, error } = await supabase!.from('expense_lines').select('id,category,description,quantity,unit_amount,line_total,expense_date').eq('task_id', taskId).is('deleted_at', null).order('expense_date'); if (error) throw error; return data ?? []; } });
  const proofQuery = useQuery({ queryKey: ['proofs', taskId], enabled: Boolean(supabase && taskId), queryFn: async () => { const { data, error } = await supabase!.from('expense_proofs').select('id,task_id,expense_line_id,object_path,original_name,mime_type,size_bytes').eq('task_id', taskId).is('deleted_at', null); if (error) throw error; return data ?? []; } });
  const historyQuery = useQuery({ queryKey: ['task-history', taskId], enabled: Boolean(supabase && taskId), queryFn: async () => { const { data, error } = await supabase!.from('task_status_history').select('id,from_status,to_status,comment,created_at,actor_id').eq('task_id', taskId).order('created_at', { ascending: true }); if (error) throw error; return data ?? []; } });
  const assignmentsQuery = useQuery<TaskAssignment[]>({ queryKey:['task-assignments',taskId],enabled:Boolean(supabase&&taskId),queryFn:async()=>{const {data,error}=await supabase!.from('task_assignments').select('profile_id,assigned_hours,worker_submitted_at,profiles(full_name,username,employee_id)').eq('task_id',taskId);if(error)throw error;return (data??[]) as TaskAssignment[];}});
  const servicesQuery = useQuery<TaskService[]>({ queryKey:['task-services',taskId],enabled:Boolean(supabase&&taskId),queryFn:async()=>{const {data,error}=await supabase!.from('task_service_selections').select('id,assigned_hours,cleaning_areas(name),cleaning_subtasks(name)').eq('task_id',taskId);if(error)throw error;return (data??[]) as TaskService[];}});
  const serviceLogsQuery = useQuery<TaskServiceLog[]>({ queryKey:['task-service-logs',taskId],enabled:Boolean(supabase&&taskId),queryFn:async()=>{const {data,error}=await supabase!.from('task_service_logs').select('task_id,selection_id,profile_id,actual_hours,worker_comment,is_completed,profiles(full_name,employee_id)').eq('task_id',taskId);if(error)throw error;return (data??[]) as TaskServiceLog[];}});
  const photosQuery = useQuery<TaskPhoto[]>({ queryKey:['task-photos',taskId],enabled:Boolean(supabase&&taskId),queryFn:async()=>{const {data,error}=await supabase!.from('task_photos').select('id,photo_type,object_path,original_name,uploaded_by').eq('task_id',taskId).order('created_at');if(error)throw error;return (data??[]) as TaskPhoto[];}});
  const equipmentQuery = useQuery<TaskEquipmentItem[]>({ queryKey:['task-equipment',taskId],enabled:Boolean(supabase&&taskId),queryFn:async()=>{const {data,error}=await supabase!.from('task_equipment').select('equipment_id,quantity,returned_quantity,cleaning_equipment(name)').eq('task_id',taskId);if(error)throw error;return (data??[]) as TaskEquipmentItem[];}});
  const workersQuery = useQuery<WorkerOption[]>({ queryKey:['task-worker-options',profile?.id],enabled:Boolean(supabase&&profile&&profile.role!=='end_user'),queryFn:async()=>{const {data,error}=await supabase!.from('profiles').select('id,full_name,username,employee_id').eq('role','end_user').eq('is_active',true).is('deleted_at',null).order('full_name');if(error)throw error;return (data??[]) as WorkerOption[];}});
  useEffect(()=>{if(serviceLogsQuery.data&&profile){setServiceProgress(Object.fromEntries(serviceLogsQuery.data.filter(log=>log.profile_id===profile.id).map(log=>[log.selection_id,{hours:log.actual_hours==null?'':String(log.actual_hours),completed:log.is_completed,comment:log.worker_comment??''}])));}},[serviceLogsQuery.data,profile]);
  useEffect(()=>{if(equipmentQuery.data)setEquipmentReturns(Object.fromEntries(equipmentQuery.data.map(item=>[item.equipment_id,item.returned_quantity==null?'':String(item.returned_quantity)])));},[equipmentQuery.data]);
  const task = taskQuery.data;
  const uploadPhotos = async (type:'assignment'|'completion', files:File[]) => {
    if(!task||!files.length)return;
    setBusy(true);setNotice('');
    try { await uploadTaskPhotos(task,files,type);setAssignmentFiles([]);setCompletionFiles([]);await qc.invalidateQueries({queryKey:['task-photos',taskId]}); }
    catch(error) { await qc.invalidateQueries({queryKey:['task-photos',taskId]});const details=getErrorMessage(error);console.error('Task photo upload failed',error);setNotice(details?`${t('photoUploadFailed')} ${details}`:t('photoUploadFailed')); }
    finally { setBusy(false); }
  };
  const finalizeDraft = async () => {
    if(!supabase||!task||!selectedAssignees.length){setNotice(t('selectAtLeastOneWorker'));return;}
    setBusy(true);setNotice('');
    const {error}=await supabase.rpc('finalize_cleaning_task',{target_task:task.id,assignee_ids:selectedAssignees});
    if(error)setNotice(t('taskValidationError'));
    else {setSelectedAssignees([]);await Promise.all([qc.invalidateQueries({queryKey:['task',taskId]}),qc.invalidateQueries({queryKey:['tasks']}),qc.invalidateQueries({queryKey:['task-assignments',taskId]}),qc.invalidateQueries({queryKey:['task-service-logs',taskId]})]);}
    setBusy(false);
  };
  const saveServiceProgress = async (serviceId:string) => {
    const progress=serviceProgress[serviceId];
    if(!supabase||!task||!progress||!progress.hours||!Number.isFinite(Number(progress.hours))||Number(progress.hours)<0){setNotice(t('invalidWorkedHours'));return;}
    setBusy(true);setNotice('');
    const {error}=await supabase.rpc('save_task_service_progress',{target_task:task.id,target_selection:serviceId,actual:Number(progress.hours),completed:progress.completed,worker_comment_text:progress.comment.trim()||null});
    if(error)setNotice(t('saveFailed'));
    else await qc.invalidateQueries({queryKey:['task-service-logs',taskId]});
    setBusy(false);
  };
  const saveEquipmentReturn = async (equipmentId:string) => {
    if(!supabase||!task)return;const value=equipmentReturns[equipmentId];if(value==null||value===''||!Number.isInteger(Number(value))||Number(value)<0){setNotice(t('invalidReturnQuantity'));return;}
    setBusy(true);setNotice('');const {error}=await supabase.rpc('save_task_equipment_return',{target_task:task.id,target_equipment:equipmentId,returned:Number(value)});
    if(error)setNotice(t('saveFailed'));else await qc.invalidateQueries({queryKey:['task-equipment',taskId]});setBusy(false);
  };
  const transition = async (next: string) => {
    if (!supabase || !task) return;
    if (['on_hold','skipped','returned','cancelled'].includes(next) && reason.trim().length < (next === 'cancelled' ? 1 : 10)) { setNotice(next === 'returned' ? t('returnComment') : next === 'cancelled' ? t('cancelComment') : t(next === 'on_hold' ? 'holdComment' : 'skipComment')); return; }
    const assignments=assignmentsQuery.data??[];
    const currentAssignment=assignments.find(assignment=>assignment.profile_id===profile?.id);
    const finalWorkerSubmission=isFinalWorkerSubmission(assignments,profile?.id??'');
    if (next === 'submitted') {
      if (!currentAssignment) { setNotice(t('notAssignedToTask')); return; }
      if (currentAssignment.worker_submitted_at) { setNotice(t('alreadySubmittedWork')); return; }
      if (finalWorkerSubmission) {
        const logs=serviceLogsQuery.data??[];
        const services=servicesQuery.data??[];
        if (!hasHoursForEveryService(services.map(service=>service.id),logs)) { setNotice(t('serviceProgressHoursRequired')); return; }
        const completedServices=new Set(logs.filter(log=>log.actual_hours!=null&&log.is_completed).map(log=>log.selection_id));
        const exceedsTaskHours=assignments.some(assignment=>{
          const total=logs.filter(log=>log.profile_id===assignment.profile_id).reduce((sum,log)=>sum+Number(log.actual_hours??0),0);
          return assignment.assigned_hours!=null&&total>Number(assignment.assigned_hours);
        });
        const mismatched = exceedsTaskHours || logs.some(log=>{
          if(log.actual_hours==null)return false;
          const service=services.find(item=>item.id===log.selection_id);
          return (!log.is_completed&&!completedServices.has(log.selection_id))
            || (service?.assigned_hours!=null&&Number(log.actual_hours)>Number(service.assigned_hours));
        });
        if (mismatched && reason.trim().length < 3) { setNotice(t('hoursMismatchComment')); return; }
        if (!hasCompletionPhoto(photosQuery.data??[])&&!completionFiles.length) { setNotice(t('completionPhotoRequired')); return; }
      }
    }
    if (next === 'submitted' && !window.confirm(t(assignments.length > 1 ? 'submitMyWorkConfirm' : 'submitConfirm'))) return;
    setBusy(true); setNotice('');
    if(next==='submitted'&&completionFiles.length){
      try { await uploadTaskPhotos(task,completionFiles,'completion');setCompletionFiles([]);await qc.invalidateQueries({queryKey:['task-photos',taskId]}); }
      catch(error) { await qc.invalidateQueries({queryKey:['task-photos',taskId]});const details=getErrorMessage(error);console.error('Task photo upload failed',error);setNotice(details?`${t('photoUploadFailed')} ${details}`:t('photoUploadFailed'));setBusy(false);return; }
    }
    if (next === 'submitted') {
      const { data, error } = await supabase.rpc('submit_task_work', { target_task: task.id, reason: reason.trim() || null, expected_version: task.version });
      if (error) setNotice(error.code === '40001' ? t('taskConflict') : error.message || t('transitionFailed'));
      else {
        setReason('');
        setNotice(t(data?.status === 'submitted' ? 'teamSubmissionComplete' : 'yourWorkSubmitted'));
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['task', taskId] }),
          qc.invalidateQueries({ queryKey: ['tasks'] }),
          qc.invalidateQueries({ queryKey: ['task-assignments', taskId] }),
          qc.invalidateQueries({ queryKey: ['task-service-logs', taskId] }),
        ]);
      }
      setBusy(false);
      return;
    }
    const { error } = await supabase.rpc('transition_task', { target_task: task.id, next_status: next, reason: reason.trim() || null, expected_version: task.version });
    if (error) setNotice(error.code === '40001' ? t('taskConflict') : error.message || t('transitionFailed')); else { setReason(''); await Promise.all([qc.invalidateQueries({ queryKey: ['task', taskId] }), qc.invalidateQueries({ queryKey: ['tasks'] })]); }
    setBusy(false);
  };
  const saveExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setNotice('');
    if (!supabase || !task || !profile || !proofFile) { setNotice(t('proofRequired')); return; }
    const permitted = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!permitted.includes(proofFile.type) || proofFile.size < 1 || proofFile.size > 10 * 1024 * 1024) { setNotice(t('invalidProof')); return; }
    if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(unitAmount) || Number(unitAmount) <= 0 || !/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0 || category.trim().length < 2 || expenseDescription.trim().length < 3) { setNotice(t('invalidExpense')); return; }
    setBusy(true);
    const extension = proofFile.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `${task.organisation_id}/${task.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('task-proofs').upload(path, proofFile, { contentType: proofFile.type, upsert: false });
    if (uploadError) { setNotice(t('uploadFailed')); setBusy(false); return; }
    const { data: line, error: lineError } = await supabase.rpc('save_expense_line', { line_task_id: task.id, line_id: null, line_date: expenseDate, line_category: category.trim(), line_description: expenseDescription.trim(), line_quantity: quantity, line_unit_amount: unitAmount });
    if (lineError) { await supabase.storage.from('task-proofs').remove([path]); setNotice(t('saveFailed')); setBusy(false); return; }
    const { error: metadataError } = await supabase.rpc('register_expense_proof', { proof_task_id: task.id, proof_expense_id: line.id, proof_path: path, proof_name: proofFile.name, proof_mime: proofFile.type, proof_size: proofFile.size });
    if (metadataError) { await supabase.storage.from('task-proofs').remove([path]); await supabase.rpc('discard_expense_line', { line_id: line.id }); setNotice(t('uploadFailed')); setBusy(false); return; }
    setCategory(''); setExpenseDescription(''); setQuantity('1'); setUnitAmount(''); setProofFile(null); setExpenseOpen(false);
    await Promise.all([qc.invalidateQueries({ queryKey: ['expenses', task.id] }), qc.invalidateQueries({ queryKey: ['proofs', task.id] })]);
    setBusy(false);
  };
  if (taskQuery.isLoading) return <div className="loading-state">{t('loading')}</div>;
  if (!task) return <div className="panel empty-state">{t('connectionError')}</div>;
  const assignments=assignmentsQuery.data??[];const currentAssignment=assignments.find(assignment=>assignment.profile_id===profile?.id);const currentWorkerSubmitted=Boolean(currentAssignment?.worker_submitted_at);const services=servicesQuery.data??[];const serviceLogs=serviceLogsQuery.data??[];const taskPhotos=photosQuery.data??[];const assignmentPhotos=taskPhotos.filter(photo=>photo.photo_type==='assignment');const completionPhotos=taskPhotos.filter(photo=>photo.photo_type==='completion');const equipment=equipmentQuery.data??[];
  const isOwner = profile?.id === task.assignee_id || assignments.some(assignment => assignment.profile_id === profile?.id); const total = sumMoney(expenseQuery.data?.map(line => String(line.line_total)) ?? []); const budget = task.budget_limit; const balance = budgetBalance(budget, total); const overBudget = budget !== null && new Decimal(total).greaterThan(budget);
  return <><div className="detail-back"><Link to="/app/tasks">← {t('myTasks')}</Link></div><div className="page-heading detail-heading"><div><div className="date-overline">{task.reference} <span>·</span> {task.is_draft?t('draftTask'):t('taskDetails')}</div><h1>{task.title}</h1><p>{task.description}</p></div>{task.is_draft?<span className="draft-badge">{t('draft')}</span>:<StatusPill status={task.status} />}</div><div className="detail-grid"><div className="panel detail-main"><div className="panel-heading"><div><h2>{t('expenseTotal')}</h2><span>{t('expenseSubtitle')}</span></div>{!task.is_draft&&isOwner && ['pending','in_progress','on_hold','skipped','returned'].includes(task.status) && <button className="subtle-button" onClick={() => setExpenseOpen(!expenseOpen)}><Plus size={15} />{t('addExpense')}</button>}</div>
    {expenseOpen && <form className="expense-form" onSubmit={event => void saveExpense(event)}><div className="expense-form-grid"><label>{t('date')}<input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required /></label><label>{t('category')}<input value={category} onChange={e => setCategory(e.target.value)} minLength={2} maxLength={80} required /></label><label className="expense-wide">{t('description')}<input value={expenseDescription} onChange={e => setExpenseDescription(e.target.value)} minLength={3} maxLength={300} required /></label><label>{t('quantity')}<input inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} required /></label><label>{t('unitAmount')}<input inputMode="decimal" value={unitAmount} onChange={e => setUnitAmount(e.target.value)} required /></label><label className="expense-wide">{t('proof')}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={e => setProofFile(e.target.files?.[0] ?? null)} required /><small>{t('proofLimit')}</small></label></div><div className="expense-live-total">{t('lineTotal')} <b>{formatMoney(calculateLineTotal(quantity || '0', unitAmount || '0'), task.currency, 'en-GB')}</b></div><div className="expense-form-actions"><button type="button" className="secondary-button" onClick={() => setExpenseOpen(false)}>{t('cancel')}</button><button className="primary-button" disabled={busy}>{busy ? t('saving') : t('save')}</button></div></form>}
    <div className="task-operation-summary">
      <section><h3>{t('customer')}</h3><p><b>{task.customer_name || '—'}</b></p><p>{task.apartment_block ? `${t('apartmentBlock')}: ${task.apartment_block}` : ''}{task.apartment_number ? ` · ${t('apartmentNumber')}: ${task.apartment_number}` : ''}</p><p>{task.customer_address || '—'}</p><p>{task.customer_phone || '—'}</p></section>
      <section><h3>{t('taskTeam')}</h3>{assignments.map(assignment=>{const person=firstRelated(assignment.profiles);const hours=serviceLogs.filter(log=>log.profile_id===assignment.profile_id).reduce((sum,log)=>sum+Number(log.actual_hours??0),0);const over=assignment.assigned_hours!=null&&hours>Number(assignment.assigned_hours);return <p className={over?'hours-over':''} key={assignment.profile_id}><b>{person?.full_name || assignment.profile_id}</b>{person?.employee_id ? ` · ${person.employee_id}` : ''}<small>{t('workerSubmissionStatus')}: {assignment.worker_submitted_at?t('workerSubmitted'):t('workerNotSubmitted')}</small><small>{t('assignedHours')}: {assignment.assigned_hours??'—'} · {t('actualHours')}: {hours}</small></p>;})}</section>
      <section><h3>{t('servicesAndHours')}</h3>{services.map(service=>{const logs=serviceLogs.filter(log=>log.selection_id===service.id);return <p key={service.id}><b>{firstRelated(service.cleaning_areas)?.name || ''}{firstRelated(service.cleaning_subtasks)?.name ? ` · ${firstRelated(service.cleaning_subtasks)?.name}` : ''}</b><span>{t('assignedHours')}: {service.assigned_hours ?? '—'}{logs.map(log=><small key={log.profile_id}>{firstRelated(log.profiles)?.full_name||t('worker')}: {log.actual_hours??'—'}h {log.is_completed?t('completed'):t('incomplete')}</small>)}</span></p>;})}</section>
      <section><h3>{t('equipmentToBring')}</h3>{equipment.map(item=><div className="equipment-return-row" key={item.equipment_id}><b>{firstRelated(item.cleaning_equipment)?.name || item.equipment_id} × {item.quantity}</b>{profile?.role==='end_user'&&isOwner&&['pending','in_progress','on_hold','skipped','returned'].includes(task.status)?<><label>{t('returnedQuantity')}<input type="number" min="0" max={item.quantity} step="1" value={equipmentReturns[item.equipment_id]??''} onChange={event=>setEquipmentReturns(current=>({...current,[item.equipment_id]:event.target.value}))}/></label><button type="button" className="subtle-button" disabled={busy} onClick={()=>void saveEquipmentReturn(item.equipment_id)}>{t('confirmReturn')}</button></>:<span>{t('returnedQuantity')}: {item.returned_quantity??'—'} / {item.quantity}</span>}</div>)}</section>
    </div>
    <section className="panel task-photo-panel"><div className="panel-heading"><div><h2>{t('taskPhotos')}</h2><span>{t('taskPhotosHint')}</span></div></div><div className="task-photo-groups"><div><h3>{t('assignmentPhotos')}</h3><TaskPhotoGrid photos={assignmentPhotos}/></div><div><h3>{t('completionPhotos')}</h3><TaskPhotoGrid photos={completionPhotos}/></div></div>
      {profile?.role!=='end_user'&&task.is_draft&&<div className="photo-upload-controls"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event=>setAssignmentFiles(Array.from(event.target.files??[]))}/><button type="button" className="secondary-button" disabled={busy||!assignmentFiles.length} onClick={()=>void uploadPhotos('assignment',assignmentFiles)}>{t('uploadPhotos')}</button></div>}
      {profile?.role==='end_user'&&isOwner&&['pending','in_progress','on_hold','skipped','returned','submitted'].includes(task.status)&&<div className="photo-upload-controls"><label>{t('addCompletionPhotos')}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={event=>setCompletionFiles(Array.from(event.target.files??[]))}/></label>{completionFiles.length>0&&<small>{t('photosSelected',{count:completionFiles.length})}</small>}<button type="button" className="secondary-button" disabled={busy||!completionFiles.length} onClick={()=>void uploadPhotos('completion',completionFiles)}>{t('uploadPhotos')}</button></div>}
    </section>
    {profile?.id && (profile.role==='end_user' || services.length>0) && <section className="panel service-progress"><h3>{t('servicesAndHours')}</h3>{services.map(service=>{const progress=serviceProgress[service.id]??{hours:'',completed:false,comment:''};const mismatch=service.assigned_hours!=null&&Number(progress.hours||0)>Number(service.assigned_hours);const workerCanEdit=profile.role==='end_user'&&isOwner&&!currentWorkerSubmitted&&['pending','in_progress','on_hold','skipped','returned'].includes(task.status);return <div className={`service-progress-row ${mismatch?'hours-over':''}`} key={service.id}><div><b>{firstRelated(service.cleaning_areas)?.name||''}{firstRelated(service.cleaning_subtasks)?.name?` · ${firstRelated(service.cleaning_subtasks)?.name}`:''}</b><small>{t('assignedHours')}: {service.assigned_hours??'—'}</small></div>{workerCanEdit?<><input aria-label={t('actualHours')} type="number" min="0" step="0.25" value={progress.hours} onChange={event=>setServiceProgress(current=>({...current,[service.id]:{...progress,hours:event.target.value}}))}/><label className="service-complete"><input type="checkbox" checked={progress.completed} onChange={event=>setServiceProgress(current=>({...current,[service.id]:{...progress,completed:event.target.checked}}))}/>{t('completed')}</label><input className="service-worker-comment" aria-label={t('workerComment')} value={progress.comment} onChange={event=>setServiceProgress(current=>({...current,[service.id]:{...progress,comment:event.target.value}}))} placeholder={t('workerComment')}/><button type="button" className="subtle-button" disabled={busy} onClick={()=>void saveServiceProgress(service.id)}>{t('save')}</button></>:<div className="service-log-readonly">{serviceLogs.filter(log=>log.selection_id===service.id).map(log=><small key={log.profile_id}>{firstRelated(log.profiles)?.full_name||t('worker')}: {log.actual_hours??'—'}h · {log.is_completed?t('completed'):t('incomplete')}</small>)}</div>}{mismatch&&<span className="hours-warning">!</span>}</div>;})}</section>}
    <div className="budget-summary"><div><span>{t('budget')}</span><b>{budget === null ? t('noLimit') : formatMoney(budget, task.currency, 'en-GB')}</b></div><div><span>{t('spent')}</span><b>{formatMoney(total, task.currency, 'en-GB')}</b></div><div><span>{t('remaining')}</span><b className={overBudget ? 'over-budget-text' : ''}>{balance.remaining === null ? '—' : formatMoney(balance.remaining, task.currency, 'en-GB')}</b></div></div>{overBudget && <div className="over-budget-alert"><CircleDollarSign size={17} /><span><b>{t('limitExceeded')}</b> · {t('overage')}: {formatMoney(balance.overage, task.currency, 'en-GB')}</span></div>}{notice && <div className="form-error proof-error" role="alert">{notice}</div>}<div className="expense-table-wrap"><table className="expense-table"><thead><tr><th>{t('date')}</th><th>{t('category')}</th><th>{t('description')}</th><th>{t('quantity')}</th><th>{t('lineTotal')}</th><th>{t('proof')}</th></tr></thead><tbody>{expenseQuery.data?.map(line => <tr key={line.id}><td>{line.expense_date}</td><td>{line.category}</td><td>{line.description}</td><td>{line.quantity}</td><td>{formatMoney(String(line.line_total), task.currency, 'en-GB')}</td><td>{proofQuery.data?.filter(proof => proof.expense_line_id === line.id).map(proof => <ProofLink key={proof.id} path={proof.object_path} name={proof.original_name} />)}</td></tr>)}</tbody></table>{!expenseQuery.data?.length && <div className="empty-expenses">{t('noTasksHint')}</div>}</div><div className="task-detail-meta"><div><span>{t('priority')}</span><PriorityPill priority={task.priority} /></div><div><span>{t('dueDate')}</span><b>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(`${task.due_date}T12:00:00`))}</b></div></div><div className="history-block"><h3>{t('statusHistory')}</h3>{historyQuery.data?.map(item => <div className="history-entry" key={item.id}><StatusPill status={item.to_status}/><span>{new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at))}</span>{item.comment && <p>{item.comment}</p>}</div>)}</div></div><aside className="panel detail-actions">{task.is_draft&&profile?.role!=='end_user'?<><h2>{t('finalizeDraft')}</h2><p>{t('finalizeDraftHint')}</p><div className="draft-worker-picker">{(workersQuery.data??[]).map(worker=><label key={worker.id}><input type="checkbox" checked={selectedAssignees.includes(worker.id)} onChange={()=>setSelectedAssignees(current=>current.includes(worker.id)?current.filter(id=>id!==worker.id):[...current,worker.id])}/><span>{worker.full_name}</span><small>{worker.employee_id||`@${worker.username}`}</small></label>)}</div><button className="primary-button full-button" disabled={busy||!selectedAssignees.length} onClick={()=>void finalizeDraft()}>{busy?t('saving'):t('finalizeAndAssign')} <ArrowRight size={15}/></button></>:<><h2>{t('nextSteps')}</h2><p>{t('nextStepsSubtitle')}</p>{profile?.role==='end_user'&&currentWorkerSubmitted&&task.status!=='submitted'&&<div className="verified-note">{t('yourWorkSubmitted')}</div>}{isOwner && !currentWorkerSubmitted && ['pending','returned'].includes(task.status) && <button className="primary-button full-button" disabled={busy} onClick={() => void transition('in_progress')}>{t('inProgress')}</button>}{isOwner && !currentWorkerSubmitted && ['pending','in_progress','on_hold','skipped','returned'].includes(task.status) &&
      <><textarea className="reason-input" value={reason} onChange={e => setReason(e.target.value)} placeholder={t('workerComment')} /><button className="secondary-button full-button" disabled={busy} onClick={() => void transition('on_hold')}>{t('onHold')}</button><button className="secondary-button full-button" disabled={busy} onClick={() => void transition('skipped')}>{t('skipped')}</button><button className="primary-button full-button" disabled={busy} onClick={() => void transition('submitted')}>{assignments.length>1?t('submitMyWork'):t('submitForReview')} <ArrowRight size={15} /></button></>
    }{!isOwner && task.status === 'submitted' && <><textarea className="reason-input" value={reason} onChange={e => setReason(e.target.value)} placeholder={t('returnComment')} /><button className="primary-button full-button" disabled={busy} onClick={() => void transition('verified')}>{t('verify')} <Check size={15} /></button><button className="secondary-button full-button" disabled={busy} onClick={() => void transition('returned')}>{t('returnForCorrection')}</button></>}{task.status === 'verified' && <div className="verified-note"><ShieldCheck size={18} />{t('verified')} · {t('recordLocked')}</div>}</>}</aside></div></>;
}

function ProofLink({ path, name }: { path: string; name: string }) {
  const { t } = useTranslation(); const [error, setError] = useState('');
  const open = async () => { if (!supabase) return; const { data, error: signedError } = await supabase.storage.from('task-proofs').createSignedUrl(path, 120); if (signedError || !data?.signedUrl) { setError(t('proofUnavailable')); return; } window.open(data.signedUrl, '_blank', 'noopener,noreferrer'); };
  return <button className="proof-link" onClick={() => void open()} aria-label={`${t('openProof')}: ${name}`} title={error || name}><FileText size={14}/>{name}</button>;
}

function TaskPhotoGrid({ photos }: { photos: Array<{ id: string; object_path: string; original_name: string }> }) {
  const { t } = useTranslation();
  if (!photos.length) return <p className="empty-photo-state">{t('noPhotos')}</p>;
  return <div className="task-photo-grid">{photos.map(photo=><TaskPhotoImage key={photo.id} path={photo.object_path} name={photo.original_name}/>)}</div>;
}

function TaskPhotoImage({ path, name }: { path: string; name: string }) {
  const { t }=useTranslation();const [url,setUrl]=useState('');const [error,setError]=useState(false);
  useEffect(()=>{let mounted=true;if(!supabase){setError(true);return;}void supabase.storage.from('task-proofs').createSignedUrl(path,300).then(({data,error:signError})=>{if(!mounted)return;if(signError||!data?.signedUrl)setError(true);else setUrl(data.signedUrl);});return()=>{mounted=false;};},[path]);
  return <a className="task-photo" href={url||undefined} target="_blank" rel="noreferrer" aria-label={`${t('openProof')}: ${name}`}>{url?<img src={url} alt={name}/>:<span>{error?t('proofUnavailable'):t('loading')}</span>}<small>{name}</small></a>;
}

function ExceptionalTaskActions({ profile, taskId }: { profile: Profile | null; taskId: string }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const [reason,setReason]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const {data:task}=useQuery({queryKey:['task-exception',taskId],enabled:Boolean(supabase&&profile&&(profile.role==='super_admin'||profile.role==='assigner')),queryFn:async()=>{const {data,error:queryError}=await supabase!.from('tasks').select('id,status,version').eq('id',taskId).maybeSingle();if(queryError)throw queryError;return data;}});
  if(!task||profile?.role==='end_user'||!(task.status==='pending'||(task.status==='verified'&&profile?.role==='super_admin')))return null;
  const nextStatus=task.status==='verified'?'returned':'cancelled';
  const submit=async()=>{if(reason.trim().length<1){setError(t(task.status==='verified'?'reopenComment':'cancelComment'));return;}if(!supabase)return;setBusy(true);setError('');const {error:rpcError}=await supabase.rpc('transition_task',{target_task:task.id,next_status:nextStatus,reason:reason.trim(),expected_version:task.version});if(rpcError)setError(t('connectionError'));else{setReason('');await Promise.all([qc.invalidateQueries({queryKey:['task',taskId]}),qc.invalidateQueries({queryKey:['task-exception',taskId]}),qc.invalidateQueries({queryKey:['tasks']})]);}setBusy(false);};
  return <section className="panel exception-panel"><h2>{task.status==='verified'?t('reopen'):t('cancelTask')}</h2><p>{task.status==='verified'?t('reopenComment'):t('cancelComment')}</p><label className="sr-only" htmlFor="exception-reason">{task.status==='verified'?t('reopenComment'):t('cancelComment')}</label><textarea id="exception-reason" className="reason-input" value={reason} onChange={event=>setReason(event.target.value)} minLength={1}/>{error&&<span role="alert" className="field-error">{error}</span>}<button className="secondary-button full-button" disabled={busy} onClick={()=>void submit()}>{busy?t('saving'):task.status==='verified'?t('reopen'):t('cancelTask')}</button></section>;
}

function TaskPage({ profile }: { profile: Profile | null }) {
  const { taskId = '' } = useParams();
  return <><TaskDetail profile={profile}/><ExceptionalTaskActions profile={profile} taskId={taskId}/></>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null); const [profile, setProfile] = useState<Profile | null>(null); const [ready, setReady] = useState(false); const queryClient = useQueryClient(); const navigate = useNavigate(); const location = useLocation(); const { i18n, t } = useTranslation();
  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    const loadProfile = async (currentUser: User | null) => {
      if (!active) return;
      setUser(currentUser);
      if (!currentUser) { setProfile(null); setReady(true); return; }
      const { data } = await supabase!.from('profiles').select('id,organisation_id,full_name,username,role,is_active,must_reset_password').eq('id', currentUser.id).maybeSingle();
      if (active) { setProfile(data as Profile | null); setReady(true); }
    };
    void supabase.auth.getSession().then(({ data }) => loadProfile(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void loadProfile(session?.user ?? null); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [i18n]);
  useEffect(() => {
    const client = supabase;
    if (!client || !profile) return;
    const channel = client.channel(`task-updates-${profile.id}`);
    const invalidateTaskData = (taskId?: string) => {
      const taskDetailQueryPrefixes = [
        ['task'],
        ['task-assignments'],
        ['task-service-logs'],
        ['task-photos'],
        ['task-equipment'],
        ['expenses'],
        ['proofs'],
        ['task-history'],
      ];
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['task-register'] }),
        queryClient.invalidateQueries({ queryKey: ['task-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['report-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['report-service-hours'] }),
        ...taskDetailQueryPrefixes.map(prefix =>
          queryClient.invalidateQueries({ queryKey: taskId ? [...prefix, taskId] : prefix }),
        ),
      ]);
    };
    const taskIdFromRow = (row: unknown) => {
      if (typeof row !== 'object' || row === null) return undefined;
      const record = row as { id?: unknown; task_id?: unknown };
      return typeof record.task_id === 'string' ? record.task_id : typeof record.id === 'string' ? record.id : undefined;
    };
    const onTaskRelatedChange = (payload: { new: unknown; old: unknown }) => {
      invalidateTaskData(taskIdFromRow(payload.new) ?? taskIdFromRow(payload.old));
    };
    for (const table of ['tasks', 'task_assignments', 'task_service_logs', 'task_photos', 'task_equipment', 'expense_lines', 'expense_proofs', 'task_status_history']) {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: `organisation_id=eq.${profile.organisation_id}`,
      }, onTaskRelatedChange);
    }
    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Task updates realtime subscription failed', error ?? status);
      }
    });
    return () => { void client.removeChannel(channel); };
  }, [profile, queryClient]);
  const signOut = async () => { await supabase?.auth.signOut(); setUser(null); setProfile(null); queryClient.clear(); navigate('/login'); };
  if (!ready) return <div className="splash"><img className="splash-logo" src={axaLogo} alt="" /><span>AXA Cleaning</span></div>;
  if (!user) return <Routes><Route path="/forgot-password" element={<ForgotPassword />} /><Route path="*" element={<Login />} /></Routes>;
  if (profile?.must_reset_password || location.pathname === '/reset-password') return <ResetPassword onComplete={() => setProfile(current => current ? { ...current, must_reset_password: false } : current)} />;
  return <AppShell user={user} profile={profile} onSignOut={() => void signOut()}><Routes><Route path="/app" element={<Dashboard profile={profile} />} /><Route path="/app/tasks" element={<TaskListPage profile={profile} />} /><Route path="/app/tasks/new" element={<CreateTaskPage profile={profile} />} /><Route path="/app/tasks/:taskId" element={<TaskPage profile={profile}/>} /><Route path="/app/calendar" element={profile && profile.role !== 'end_user' ? <TaskCalendarPage profile={profile} /> : <div className="panel empty-state">{t('noPermission')}</div>} /><Route path="/app/reviews" element={<ReviewQueue profile={profile} />} /><Route path="/app/people" element={profile?.role === 'super_admin' ? <PeoplePage profile={profile} /> : <div className="panel empty-state">{t('noPermission')}</div>} /><Route path="/app/reports" element={<ReportsPage profile={profile} />} /><Route path="/app/audit" element={profile?.role === 'super_admin' ? <AuditPage /> : <div className="panel empty-state">{t('noPermission')}</div>} /><Route path="/app/settings" element={<SettingsPage profile={profile} />} /><Route path="*" element={<Dashboard profile={profile} />} /></Routes></AppShell>;
}

function ForgotPassword() {
  const { t } = useTranslation(); const [email,setEmail]=useState(''); const [sent,setSent]=useState(false); const [error,setError]=useState('');
  const submit=async (event:FormEvent<HTMLFormElement>)=>{event.preventDefault(); if (!supabase) {setError(t('notConfigured'));return;} const {error: resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}${import.meta.env.BASE_URL}reset-password`}); if(resetError)setError(t('connectionError'));else setSent(true);};
  return <main className="forgot-page"><div className="forgot-card"><div className="forgot-brand"><Brand/></div><span className="eyebrow">{t('accountRecovery')}</span><h1>{t('forgotPassword')}</h1><p>{sent ? t('resetIfExists') : t('loginSubtitle')}</p>{!sent&&<form className="login-form" onSubmit={event=>void submit(event)}><label htmlFor="reset-email">{t('email')}</label><input id="reset-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>{error&&<span role="alert" className="form-error">{error}</span>}<button className="primary-button">{t('sendResetLink')} <ArrowRight size={16}/></button></form>}<Link to="/login" className="view-link">← {t('back')}</Link><div className="brand-credit">{t('productBy')}</div></div></main>;
}

function ResetPassword({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation(); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) { setError(t('passwordPolicy')); return; }
    if (password !== confirm) { setError(t('passwordMismatch')); return; }
    if (!supabase) { setError(t('notConfigured')); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    const completion = updateError ? { error: updateError } : await supabase.rpc('complete_password_reset');
    if (completion.error) setError(t('passwordUpdateFailed')); else { onComplete(); navigate('/app'); }
    setBusy(false);
  };
  return <main className="forgot-page"><div className="forgot-card"><div className="forgot-brand"><Brand/></div><span className="eyebrow">{t('passwordReset')}</span><h1>{t('choosePassword')}</h1><p>{t('passwordPolicy')}</p><form className="login-form" onSubmit={event => void submit(event)}><label htmlFor="new-password">{t('newPassword')}</label><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required/><label htmlFor="confirm-password">{t('confirmPassword')}</label><input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} required/>{error && <span role="alert" className="form-error">{error}</span>}<button className="primary-button" disabled={busy}>{busy ? t('saving') : t('save')} <ArrowRight size={16}/></button></form><div className="brand-credit">{t('productBy')}</div></div></main>;
}
