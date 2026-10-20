import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowRight, BadgeCheck, Bell, CalendarDays, Check, ChevronDown, CircleDollarSign, ClipboardList, Clock3, FileText, Filter, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, ShieldCheck, Users, WalletCards } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import Decimal from 'decimal.js';
import { budgetBalance, calculateLineTotal, formatMoney, sumMoney } from './lib/money';
import { toCsv } from './lib/csv';

type Profile = { id: string; organisation_id: string; full_name: string; username: string; role: 'super_admin' | 'assigner' | 'end_user'; language: 'en' | 'ro'; is_active: boolean; must_reset_password: boolean; can_manage_users: boolean };
type Task = { id: string; organisation_id: string; reference: string; title: string; description: string; status: string; priority: string; due_date: string; budget_limit: number | null; currency: string; assignee_id: string; assigner_id: string; version: number };

function LanguageSwitch() {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const language = i18n.language.startsWith('ro') ? 'ro' : 'en';
  const toggle = async () => {
    const next = language === 'en' ? 'ro' : 'en';
    sessionStorage.setItem('taskflow-language', next);
    await i18n.changeLanguage(next);
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (data.user) await supabase.from('profiles').update({ language: next }).eq('id', data.user.id);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
    }
  };
  return <button className="language-switch" onClick={() => void toggle()} aria-label={language === 'en' ? 'Switch language to Romanian' : 'Schimbă limba în engleză'}>{language.toUpperCase()} <ChevronDown size={14} /></button>;
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
    <section className="auth-art" aria-label="TaskFlow introduction">
      <div className="brand brand-light"><span className="brand-mark"><Check size={19} strokeWidth={3} /></span><span>TaskFlow <b>SME</b></span></div>
      <div className="art-copy"><span className="eyebrow">{t('marketingEyebrow')}</span><h1>{t('marketingHeadline')}</h1><p>{t('tagline')}</p>
        <div className="art-stat"><div className="stat-check"><Check size={17} /></div><div><strong>{t('marketingStatTitle')}</strong><span>{t('marketingStatText')}</span></div></div>
      </div>
      <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-footer">{t('marketingFooter')}</div>
    </section>
    <section className="auth-panel">
      <div className="auth-top"><span className="auth-mobile-brand"><span className="brand-mark"><Check size={17} strokeWidth={3} /></span>TaskFlow SME</span><LanguageSwitch /></div>
      <div className="login-form-wrap"><span className="eyebrow">YOUR WORKSPACE, READY</span><h2>{t('loginTitle')}</h2><p className="subtitle">{t('loginSubtitle')}</p>
        <form onSubmit={(event) => void submit(event)} className="login-form">
          <label htmlFor="identifier">{t('usernameEmail')}</label><input id="identifier" autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} required placeholder="alex@company.com" />
          <div className="password-label"><label htmlFor="password">{t('password')}</label><Link to="/forgot-password">{t('forgotPassword')}</Link></div>
          <div className="password-input"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" className="text-button" onClick={() => setShowPassword(!showPassword)} aria-label={t(showPassword ? 'hidePassword' : 'showPassword')}>{t(showPassword ? 'hidePassword' : 'showPassword')}</button></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {!isSupabaseConfigured && <div className="config-note"><ShieldCheck size={18} /><span><b>{t('backendMissing')}</b><small>{t('backendMissingHint')}</small></span></div>}
          <button className="primary-button login-button" disabled={busy || !isSupabaseConfigured}>{busy ? t('signingIn') : t('signIn')}<ArrowRight size={17} /></button>
        </form><p className="no-registration">{t('noRegistration')}</p><div className="secure-note"><ShieldCheck size={15} /> {t('secureAccess')}</div>
      </div><footer className="auth-copyright">© 2026 TaskFlow SME <span>·</span> {t('workDays')}</footer>
    </section>
  </main>;
}

const navItems = [
  { to: '/app', key: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/tasks', key: 'myTasks', icon: ClipboardList },
  { to: '/app/reviews', key: 'reviews', icon: BadgeCheck, roles: ['assigner', 'super_admin'] },
  { to: '/app/people', key: 'people', icon: Users, roles: ['assigner', 'super_admin'] },
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
      <Link className="brand side-brand" to="/app"><span className="brand-mark"><Check size={18} strokeWidth={3} /></span><span>TaskFlow <b>SME</b></span></Link>
      <div className="workspace-chip"><div className="workspace-avatar">{name.slice(0, 1).toUpperCase()}</div><span><b>{t('workspace')}</b><small>{t('businessWorkspace')}</small></span><ChevronDown size={15} /></div>
      <span className="nav-caption">{t('workspace').toUpperCase()}</span><nav className="main-nav" aria-label={t('mainNavigation')}>
        {navItems.filter(item => !item.roles || item.roles.includes(profile?.role ?? 'end_user')).map(item => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}><Icon size={18} /><span>{t(item.key)}</span>{item.key === 'reviews' && <span className="nav-count">3</span>}</NavLink>; })}
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Activity size={16} /></div><b>{t('needHelp')}</b><span>{t('helpSubtitle')}</span><button type="button">{t('helpCenter')} <ArrowRight size={14} /></button></div><NavLink className="nav-link" to="/app/settings"><Settings size={18} /><span>{t('settings')}</span></NavLink>
        <div className="profile-row"><div className="profile-avatar">{name.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{name}</b><small>{profile?.role === 'super_admin' ? t('admin') : profile?.role === 'assigner' ? t('assignerRole') : t('user')}</small></div><button className="icon-button signout" onClick={onSignOut} aria-label={t('signOut')}><LogOut size={17} /></button></div>
      </div>
    </aside>
    {menuOpen && <button className="sidebar-overlay" aria-label={t('close')} onClick={() => setMenuOpen(false)} />}
    <div className="main-column"><header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)} aria-label={t('menu')}><Menu size={20} /></button><div className="breadcrumb"><span>{t('workspace')}</span><span className="crumb-slash">/</span><b>{t('dashboard')}</b></div><div className="top-actions"><label className="global-search"><Search size={16} /><input placeholder={t('search')} aria-label={t('search')} /><kbd>⌘ K</kbd></label><button className="icon-button notification-button" aria-label={t('notifications')}><Bell size={19} /><i /></button><LanguageSwitch /><div className="top-avatar">{name.slice(0, 1).toUpperCase()}</div></div></header>
      {admin && <div className="role-banner"><span className="role-dot" /> {t('assignerWorkspace')} <span>·</span> {t('teamOverview')}</div>}
      <main className="page-content">{children}</main><footer className="app-footer"><span>© 2026 TaskFlow SME</span><span>Made for focused teams <span className="footer-heart">✦</span></span></footer>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{navItems.slice(0, 4).filter(item => !item.roles || item.roles.includes(profile?.role ?? 'end_user')).map(item => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}><Icon size={19} /><span>{t(item.key)}</span></NavLink>; })}</nav>
  </div>;
}

function useTasks(profile: Profile | null) {
  return useQuery({ queryKey: ['tasks', profile?.id, profile?.role], enabled: Boolean(supabase && profile), queryFn: async () => {
    const { data, error } = await supabase!.from('tasks').select('id,organisation_id,reference,title,description,status,priority,due_date,budget_limit,currency,assignee_id,assigner_id,version').is('deleted_at', null).order('due_date', { ascending: true }).limit(100);
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
  const { t, i18n } = useTranslation();
  const { data: tasks = [], isLoading, isError, refetch } = useTasks(profile);
  const admin = profile?.role !== 'end_user';
  const { data: metrics } = useQuery<{ total_tasks: number; pending_tasks: number; in_progress_tasks: number; on_hold_tasks: number; overdue_tasks: number; submitted_tasks: number; verified_tasks: number; over_budget_tasks: number }>({ queryKey: ['dashboard-metrics', profile?.id], enabled: Boolean(admin && supabase && profile), queryFn: async () => { const { data, error } = await supabase!.rpc('get_dashboard_metrics').single(); if (error) throw error; return data as { total_tasks: number; pending_tasks: number; in_progress_tasks: number; on_hold_tasks: number; overdue_tasks: number; submitted_tasks: number; verified_tasks: number; over_budget_tasks: number }; } });
  const now = new Date();
  const todayStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const filteredTasks = tasks.filter(task => {
    if (!admin && profile && task.assignee_id !== profile.id) return false;
    return true;
  });
  const dueToday = filteredTasks.filter(task => task.due_date === todayStr && !['verified', 'cancelled'].includes(task.status));
  const upcoming = filteredTasks.filter(task => task.due_date > todayStr && !['verified', 'cancelled'].includes(task.status)).slice(0, 4);
  const overdue = filteredTasks.filter(task => task.due_date < todayStr && !['verified', 'cancelled'].includes(task.status));
  const submitted = filteredTasks.filter(task => task.status === 'submitted');
  const name = profile?.full_name.split(' ')[0] ?? 'Alex';
  const dateLabel = new Intl.DateTimeFormat(i18n.language === 'ro' ? 'ro-RO' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
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
        <TaskTable tasks={filteredTasks.slice(0, 6)} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} />
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

function TaskTable({ tasks, isLoading, isError, onRetry }: { tasks: Task[]; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  const { t, i18n } = useTranslation();
  if (isLoading) return <div className="skeleton-rows" aria-label={t('loading')}><span /><span /><span /><span /></div>;
  if (isError) return <div className="inline-error"><span>{t('connectionError')}</span><button onClick={onRetry}>{t('retry')}</button></div>;
  if (!tasks.length) return <EmptyTasks t={t} />;
  return <div className="table-scroll"><table className="task-table"><thead><tr><th>{t('taskName')}</th><th>{t('assignee')}</th><th>{t('priority')}</th><th>{t('status')}</th><th>{t('dueDate')}</th><th /></tr></thead><tbody>{tasks.map(task => <tr key={task.id}><td><Link className="task-title-cell" to={`/app/tasks/${task.id}`}><span className="task-code">{task.reference}</span><b>{task.title}</b></Link></td><td><span className="table-assignee"><span className="assignee-avatar">{task.assignee_id.slice(0, 1).toUpperCase()}</span>{t('teamMember')}</span></td><td><PriorityPill priority={task.priority} /></td><td><StatusPill status={task.status} /></td><td className="due-date">{new Intl.DateTimeFormat(i18n.language === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${task.due_date}T12:00:00`))}</td><td><Link className="row-arrow" to={`/app/tasks/${task.id}`} aria-label={`${t('taskDetails')}: ${task.title}`}><ArrowRight size={16} /></Link></td></tr>)}</tbody></table></div>;
}
function TaskMini({ task }: { task: Task }) { return <Link className="task-mini" to={`/app/tasks/${task.id}`}><span className="mini-icon"><FileText size={16} /></span><span className="mini-copy"><b>{task.title}</b><small>{task.reference}</small></span><ArrowRight size={15} /></Link>; }
function TaskList({ tasks }: { tasks: Task[] }) { return <div className="task-card-list">{tasks.map(task => <TaskCard key={task.id} task={task} />)}</div>; }
function TaskCard({ task }: { task: Task }) {
  const { i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${task.due_date}T12:00:00`));
  return <Link to={`/app/tasks/${task.id}`} className="task-card"><div className="task-card-top"><span className="task-code">{task.reference}</span><StatusPill status={task.status} /></div><h3>{task.title}</h3><p>{task.description}</p><div className="task-card-bottom"><span className="task-card-due"><CalendarDays size={15} />{date}</span><PriorityPill priority={task.priority} /><span className="task-card-budget"><CircleDollarSign size={15} />{task.budget_limit === null ? '—' : formatMoney(task.budget_limit, task.currency, i18n.language)}</span></div></Link>;
}
function TaskSection({ title, accent, tasks }: { title: string; accent: string; tasks: Task[] }) { if (!tasks.length) return null; return <section className={`task-section section-${accent}`}><div className="section-title"><span className="section-indicator" /><h2>{title}</h2><span className="section-total">{tasks.length}</span></div><TaskList tasks={tasks.slice(0, 3)} /></section>; }
function EmptyTasks({ t }: { t: (key: string) => string }) { return <div className="empty-state"><div className="empty-illustration"><ClipboardList size={24} /></div><b>{t('noTasks')}</b><span>{t('noTasksHint')}</span></div>; }

function TaskListPage({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation();
  const [exportError, setExportError] = useState('');
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [assignee, setAssignee] = useState('all'); const [priority, setPriority] = useState('all'); const [month, setMonth] = useState(''); const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState(''); const [overBudgetOnly, setOverBudgetOnly] = useState(false);
  const taskPages = useInfiniteQuery({ queryKey: ['task-register',profile?.id,profile?.role], enabled: Boolean(supabase&&profile), initialPageParam: 0, queryFn: async ({pageParam}) => { const {data,error}=await supabase!.from('tasks').select('id,organisation_id,reference,title,description,status,priority,due_date,budget_limit,currency,assignee_id,assigner_id,version').is('deleted_at',null).order('due_date',{ascending:true}).range(pageParam,pageParam+49);if(error)throw error;return (data??[]) as Task[]; }, getNextPageParam:(lastPage,_pages,lastPageParam)=>lastPage.length===50?lastPageParam+50:undefined });
  const data = useMemo(() => taskPages.data?.pages.flat() ?? [], [taskPages.data]); const isLoading=taskPages.isLoading; const isError=taskPages.isError; const refetch=taskPages.refetch;
  const { data: people = [] } = useQuery({ queryKey: ['task-filter-people', profile?.id], enabled: Boolean(supabase && profile && profile.role !== 'end_user'), queryFn: async () => { const { data, error } = await supabase!.from('profiles').select('id,full_name').eq('role','end_user').eq('is_active',true).is('deleted_at',null).order('full_name'); if (error) throw error; return data ?? []; } });
  const taskIds = data.map(task => task.id);
  const { data: lines = [] } = useQuery({ queryKey: ['expense-filter-totals', profile?.id, taskIds.join(',')], enabled: Boolean(supabase && profile && taskIds.length), queryFn: async () => { const { data, error } = await supabase!.from('expense_lines').select('task_id,line_total').is('deleted_at',null).in('task_id', taskIds); if (error) throw error; return data ?? []; } });
  const spentByTask = useMemo(() => lines.reduce<Record<string,string>>((totals, line) => { totals[line.task_id] = sumMoney([totals[line.task_id] ?? '0', String(line.line_total)]); return totals; }, {}), [lines]);
  const tasks = useMemo(() => data.filter(task => (!profile || profile.role !== 'end_user' || task.assignee_id === profile.id) && (status === 'all' || task.status === status) && (assignee === 'all' || task.assignee_id === assignee) && (priority === 'all' || task.priority === priority) && (!month || task.due_date.startsWith(month)) && (!fromDate || task.due_date >= fromDate) && (!toDate || task.due_date <= toDate) && (!overBudgetOnly || (task.budget_limit !== null && new Decimal(spentByTask[task.id] ?? '0').greaterThan(task.budget_limit))) && `${task.reference} ${task.title} ${task.description}`.toLowerCase().includes(query.toLowerCase())), [data, profile, query, status, assignee, priority, month, fromDate, toDate, overBudgetOnly, spentByTask]);
  const exportTasks = async () => { if(!supabase)return;setExportError(''); const {data:rows,error}=await supabase.rpc('export_tasks_csv',{task_assignee:assignee==='all'?null:assignee,task_status_filter:status==='all'?null:status,task_priority_filter:priority==='all'?null:priority,date_from:fromDate||null,date_to:toDate||null,due_month:month?`${month}-01`:null,search_term:query||null,over_budget_only:overBudgetOnly}); if(error){setExportError(t('exportFailed'));return;} const exportRows = (rows ?? []) as Array<{reference:string;title:string;status:string;priority:string;due_date:string;assignee_name:string;budget:number|null;spent:number;currency:string}>; const csv = toCsv(exportRows.map(row => ({ reference:row.reference, title:row.title, status:row.status, priority:row.priority, due_date:row.due_date, assignee:row.assignee_name, budget:row.budget, spent:row.spent, currency:row.currency })), [{key:'reference',label:t('reference')},{key:'title',label:t('taskName')},{key:'status',label:t('status')},{key:'priority',label:t('priority')},{key:'due_date',label:t('dueDate')},{key:'assignee',label:t('assignee')},{key:'budget',label:t('budget')},{key:'spent',label:t('spent')},{key:'currency',label:t('currency')}]); const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'taskflow-tasks.csv'; anchor.click(); URL.revokeObjectURL(url); };
  const reset = () => { setQuery(''); setStatus('all'); setAssignee('all'); setPriority('all'); setMonth(''); setFromDate(''); setToDate(''); setOverBudgetOnly(false); };
  return <><div className="page-heading"><div><div className="date-overline"><ClipboardList size={14} /> {t('workspace')}</div><h1>{t('myTasks')}</h1><p>{t('tasksSubtitle')}</p></div>{profile?.role !== 'end_user' && <Link className="primary-button create-button" to="/app/tasks/new"><Plus size={17} />{t('newTask')}</Link>}</div><div className="panel list-page-panel"><div className="list-toolbar filter-toolbar"><label className="list-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('searchTasks')} /></label><select aria-label={t('status')} value={status} onChange={e => setStatus(e.target.value)}><option value="all">{t('allStatuses')}</option>{['pending','in_progress','on_hold','skipped','submitted','verified','returned','cancelled'].map(s => <option value={s} key={s}>{t(({in_progress:'inProgress',on_hold:'onHold',cancelled:'cancelled'} as Record<string,string>)[s] ?? s)}</option>)}</select>{profile?.role !== 'end_user' && <select aria-label={t('assignee')} value={assignee} onChange={e => setAssignee(e.target.value)}><option value="all">{t('allPeople')}</option>{people.map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select>}<select aria-label={t('priority')} value={priority} onChange={e => setPriority(e.target.value)}><option value="all">{t('allPriorities')}</option>{['urgent','high','medium','low'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select><label className="month-filter">{t('month')}<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><label className="date-filter">{t('from')}<input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label><label className="date-filter">{t('to')}<input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label><label className="budget-filter"><input type="checkbox" checked={overBudgetOnly} onChange={e=>setOverBudgetOnly(e.target.checked)}/>{t('overBudget')}</label><button className="subtle-button" onClick={reset}>{t('resetFilters')}</button>{profile?.role !== 'end_user' && <button className="subtle-button" onClick={()=>void exportTasks()}>{t('exportCsv')}</button>}</div>{exportError && <div className="form-error export-error" role="alert">{exportError}</div>}<TaskTable tasks={tasks} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} />{taskPages.hasNextPage&&<div className="pagination-control"><button className="subtle-button" disabled={taskPages.isFetchingNextPage} onClick={()=>void taskPages.fetchNextPage()}>{taskPages.isFetchingNextPage?t('loading'):t('loadMoreTasks')}</button></div>}</div></>;
}

function ReviewQueue({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation(); const { data = [], isLoading, isError, refetch } = useTasks(profile);
  const queue = data.filter(task => task.status === 'submitted');
  return <><div className="page-heading"><div><div className="date-overline"><BadgeCheck size={14}/>{t('workspace')}</div><h1>{t('reviews')}</h1><p>{t('reviewSubtitle')}</p></div><span className="review-count large-count">{queue.length}</span></div><section className="panel review-queue-panel"><div className="panel-heading"><div><h2>{t('needsReview')}</h2><span>{t('reviewSubtitle')}</span></div></div>{isLoading ? <div className="skeleton-rows"><span/><span/><span/></div> : isError ? <div className="inline-error">{t('connectionError')}<button onClick={() => void refetch()}>{t('retry')}</button></div> : queue.length ? <TaskList tasks={queue}/> : <EmptyTasks t={t}/>}</section></>;
}

function ReportsPage({ profile }: { profile: Profile | null }) {
  const { t, i18n } = useTranslation(); const { data: tasks = [], isLoading, isError, refetch } = useTasks(profile);
  const { data: lines = [] } = useQuery({ queryKey: ['report-expenses', profile?.id], enabled: Boolean(supabase && profile), queryFn: async () => { const { data, error } = await supabase!.from('expense_lines').select('task_id,line_total').is('deleted_at',null).limit(5000); if (error) throw error; return data ?? []; } });
  const totalSpent = sumMoney(lines.map(line => String(line.line_total)));
  const exportReport = () => { const csv = toCsv(tasks.map(task => ({reference:task.reference,title:task.title,status:task.status,priority:task.priority,due_date:task.due_date,budget:task.budget_limit,currency:task.currency,spent:sumMoney(lines.filter(line=>line.task_id===task.id).map(line=>String(line.line_total)))})),[{key:'reference',label:t('reference')},{key:'title',label:t('taskName')},{key:'status',label:t('status')},{key:'priority',label:t('priority')},{key:'due_date',label:t('dueDate')},{key:'budget',label:t('budget')},{key:'spent',label:t('spent')},{key:'currency',label:t('currency')}]); const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='taskflow-report.csv';link.click();URL.revokeObjectURL(url);};
  return <><div className="page-heading"><div><div className="date-overline"><WalletCards size={14}/>{t('workspace')}</div><h1>{t('reports')}</h1><p>{t('reportsSubtitle')}</p></div><button className="primary-button create-button" onClick={exportReport} disabled={isLoading || isError}>{t('exportCsv')}</button></div><section className="metrics-grid"><MetricCard label={t('totalTasks')} value={tasks.length} icon={ClipboardList} tone="purple"/><MetricCard label={t('awaitingReview')} value={tasks.filter(task=>task.status==='submitted').length} icon={BadgeCheck} tone="amber"/><MetricCard label={t('completedTasks')} value={tasks.filter(task=>task.status==='verified').length} icon={Check} tone="green"/><MetricCard label={t('spent')} value={formatMoney(totalSpent,'EUR',i18n.language==='ro'?'ro-RO':'en-GB')} icon={CircleDollarSign} tone="blue"/></section><section className="panel report-panel"><div className="panel-heading"><div><h2>{t('taskOverview')}</h2><span>{t('reportsSubtitle')}</span></div></div><TaskTable tasks={tasks.slice(0,50)} isLoading={isLoading} isError={isError} onRetry={()=>void refetch()}/></section></>;
}

function SettingsPage({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation(); const [timezone,setTimezone]=useState('Europe/Bucharest'); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{if(supabase&&profile)void supabase.from('profiles').select('timezone').eq('id',profile.id).maybeSingle().then(({data})=>{if(data?.timezone)setTimezone(data.timezone);});},[profile]);
  const save=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!supabase||!profile)return;setBusy(true);const {error}=await supabase.from('profiles').update({timezone}).eq('id',profile.id);setMessage(error?t('saveFailed'):t('settingsSaved'));setBusy(false);};
  return <><div className="page-heading"><div><div className="date-overline"><Settings size={14}/>{t('workspace')}</div><h1>{t('settings')}</h1><p>{t('settingsSubtitle')}</p></div></div><form className="panel settings-panel" onSubmit={event=>void save(event)}><div className="settings-section"><h2>{t('profile')}</h2><p>{profile?.full_name} · @{profile?.username}</p><Field label={t('language')}><div className="settings-language"><LanguageSwitch/><span>{t('languagePreferenceHint')}</span></div></Field><Field label={t('timezone')}><select value={timezone} onChange={event=>setTimezone(event.target.value)}>{['Europe/Bucharest','Europe/London','Europe/Paris','UTC','America/New_York'].map(zone=><option value={zone} key={zone}>{zone}</option>)}</select></Field></div>{message&&<div className="inline-notice" role="status">{message}</div>}<div className="form-actions"><button className="primary-button" disabled={busy}>{busy?t('saving'):t('save')}</button></div></form></>;
}

function AuditPage() {
  const { t, i18n }=useTranslation();const {data:events=[],isLoading,isError,refetch}=useQuery({queryKey:['audit-events'],enabled:Boolean(supabase),queryFn:async()=>{const {data,error}=await supabase!.from('audit_events').select('id,actor_id,action,entity_type,entity_id,details,created_at').order('created_at',{ascending:false}).limit(100);if(error)throw error;return data??[];}});
  return <><div className="page-heading"><div><div className="date-overline"><ShieldCheck size={14}/>{t('workspace')}</div><h1>{t('auditLog')}</h1><p>{t('auditSubtitle')}</p></div></div><section className="panel audit-panel"><div className="panel-heading"><div><h2>{t('auditLog')}</h2><span>{t('auditLastHundred')}</span></div></div>{isLoading?<div className="skeleton-rows"><span/><span/><span/></div>:isError?<div className="inline-error">{t('connectionError')}<button onClick={()=>void refetch()}>{t('retry')}</button></div>:<div className="table-scroll"><table className="task-table"><thead><tr><th>{t('date')}</th><th>{t('actor')}</th><th>{t('action')}</th><th>{t('entity')}</th><th>{t('details')}</th></tr></thead><tbody>{events.map(event=><tr key={event.id}><td>{new Intl.DateTimeFormat(i18n.language==='ro'?'ro-RO':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(event.created_at))}</td><td>{event.actor_id?.slice(0,8)??'—'}</td><td>{event.action}</td><td>{event.entity_type}</td><td>{JSON.stringify(event.details)}</td></tr>)}</tbody></table>{!events.length&&<EmptyTasks t={t}/>}</div>}</section></>;
}

type ManagedProfile = { id: string; full_name: string; username: string; role: string; recovery_email: string | null; is_active: boolean };
function PeoplePage({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const [open, setOpen] = useState(false); const [scopeOpen, setScopeOpen] = useState(false); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const { data: people = [], isLoading, isError, refetch } = useQuery({ queryKey: ['people', profile?.organisation_id], enabled: Boolean(supabase && profile && profile.role !== 'end_user'), queryFn: async () => {
    const { data, error } = await supabase!.from('profiles').select('id,full_name,username,role,recovery_email,is_active').order('full_name'); if (error) throw error; return (data ?? []) as ManagedProfile[];
  } });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage(''); setBusy(true); if (!supabase) { setBusy(false); return; }
    const form = new FormData(event.currentTarget);
    const payload = { email: String(form.get('email')), username: String(form.get('username')).toLowerCase(), full_name: String(form.get('full_name')), role: String(form.get('role')), recovery_email: String(form.get('recovery_email') || form.get('email')), phone: String(form.get('phone')), employee_id: String(form.get('employee_id')), department: String(form.get('department')), language: String(form.get('language')), timezone: 'Europe/Bucharest', can_manage_users: form.get('can_manage_users') === 'on' };
    const { error } = await supabase.functions.invoke('admin-user-upsert', { body: payload });
    if (error) setMessage(t('accountSaveFailed')); else { setMessage(t('inviteSent')); setOpen(false); await qc.invalidateQueries({ queryKey: ['people'] }); }
    setBusy(false);
  };
  const toggleActive = async (person: ManagedProfile) => {
    if (!supabase || person.role === 'super_admin') return;
    const { error } = await supabase.functions.invoke('admin-user-upsert', { body: { id: person.id, username: person.username, full_name: person.full_name, role: person.role, is_active: !person.is_active } });
    if (error) setMessage(t('accountSaveFailed')); else await qc.invalidateQueries({ queryKey: ['people'] });
  };
  const updateScope = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if(!supabase)return; setBusy(true); setMessage(''); const form=new FormData(event.currentTarget); const assignerId=String(form.get('assigner_id')); const endUserIds=form.getAll('end_user_ids').map(String); const {error}=await supabase.functions.invoke('admin-user-upsert',{body:{action:'set-scope',assigner_id:assignerId,end_user_ids:endUserIds}}); if(error)setMessage(t('scopeSaveFailed'));else{setMessage(t('scopeSaved'));setScopeOpen(false);await qc.invalidateQueries({queryKey:['people']});}setBusy(false);
  };
  return <><div className="page-heading"><div><div className="date-overline"><Users size={14}/>{t('workspace')}</div><h1>{t('people')}</h1><p>{t('peopleSubtitle')}</p></div><button className="primary-button create-button" onClick={() => { setMessage(''); setOpen(!open); }}><Plus size={16}/>{t('inviteUser')}</button></div>
    {message && <div className="inline-notice" role="status">{message}</div>}
    {open && <InviteForm role={profile?.role ?? 'end_user'} busy={busy} onCancel={() => setOpen(false)} onSubmit={submit} />}
    {profile?.role==='super_admin' && <><button className="subtle-button scope-toggle" onClick={()=>setScopeOpen(!scopeOpen)}><Users size={15}/>{t('manageAssignerScope')}</button>{scopeOpen&&<form className="panel create-form scope-form" onSubmit={event=>void updateScope(event)}><h2>{t('manageAssignerScope')}</h2><Field label={t('assignerRole')}><select name="assigner_id" required defaultValue=""><option value="" disabled>{t('selectAssignee')}</option>{people.filter(person=>person.role==='assigner'&&person.is_active).map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</select></Field><Field label={t('allowedEndUsers')}><select name="end_user_ids" multiple size={Math.min(6,Math.max(2,people.filter(person=>person.role==='end_user'&&person.is_active).length))} aria-label={t('allowedEndUsers')}>{people.filter(person=>person.role==='end_user'&&person.is_active).map(person=><option key={person.id} value={person.id}>{person.full_name} · @{person.username}</option>)}</select></Field><small>{t('scopeMultiSelect')}</small><div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setScopeOpen(false)}>{t('cancel')}</button><button className="primary-button" disabled={busy}>{busy?t('saving'):t('saveScope')}</button></div></form>}</>}
    <section className="panel list-page-panel people-panel"><div className="panel-heading"><div><h2>{t('people')}</h2><span>{t('peopleSubtitle')}</span></div></div>{isLoading ? <div className="skeleton-rows"><span/><span/><span/></div> : isError ? <div className="inline-error">{t('connectionError')}<button onClick={() => void refetch()}>{t('retry')}</button></div> : <div className="table-scroll"><table className="task-table people-table"><thead><tr><th>{t('name')}</th><th>{t('username')}</th><th>{t('role')}</th><th>{t('email')}</th><th>{t('status')}</th><th/></tr></thead><tbody>{people.map(person => <tr key={person.id}><td><b>{person.full_name}</b></td><td>@{person.username}</td><td>{person.role === 'super_admin' ? t('admin') : person.role === 'assigner' ? t('assignerRole') : t('user')}</td><td>{person.recovery_email ?? '—'}</td><td><span className={`status-pill ${person.is_active ? 'status-verified' : 'status-cancelled'}`}><i/>{person.is_active ? t('active') : t('inactive')}</span></td><td>{person.role !== 'super_admin' && <button className="subtle-button" onClick={() => void toggleActive(person)}>{person.is_active ? t('deactivate') : t('reactivate')}</button>}</td></tr>)}</tbody></table></div>}</section></>;
}

const taskFormSchema = z.object({
  reference: z.string().trim().min(2).max(40),
  title: z.string().trim().min(3).max(150),
  description: z.string().max(10000),
  assignee: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  startDate: z.string().min(1),
  dueDate: z.string().min(1),
  budget: z.string().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).refine(value => value.dueDate >= value.startDate, { path: ['dueDate'], message: 'Due date cannot be before the start date.' })
  .refine(value => !value.budget || /^\d{1,12}(\.\d{1,2})?$/.test(value.budget), { path: ['budget'], message: 'Enter a non-negative amount with up to two decimals.' });
type TaskFormValues = z.infer<typeof taskFormSchema>;

function CreateTaskPage({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation(); const navigate = useNavigate(); const qc = useQueryClient(); const [formError, setFormError] = useState('');
  const { data: people = [], isLoading } = useQuery({ queryKey: ['permitted-users', profile?.id], enabled: Boolean(supabase && profile && profile.role !== 'end_user'), queryFn: async () => {
    const { data, error } = await supabase!.from('profiles').select('id,full_name,username').eq('role', 'end_user').eq('is_active', true).is('deleted_at', null).order('full_name');
    if (error) throw error; return data ?? [];
  } });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<TaskFormValues>({ resolver: zodResolver(taskFormSchema), defaultValues: { reference: '', title: '', description: '', assignee: '', priority: 'medium', startDate: new Date().toISOString().slice(0,10), dueDate: '', budget: '', currency: 'EUR' } });
  const submit = handleSubmit(async values => {
    setFormError('');
    if (!supabase || !profile) return;
    const { data, error } = await supabase.rpc('create_task', { task_reference: values.reference, task_title: values.title, task_description: values.description, task_assignee: values.assignee, task_priority: values.priority, task_start: values.startDate, task_due: values.dueDate, task_budget: values.budget ? values.budget : null, task_currency: values.currency, task_tags: [] });
    if (error) { setFormError(t('taskValidationError')); return; }
    await qc.invalidateQueries({ queryKey: ['tasks'] });
    navigate(`/app/tasks/${data.id}`);
  });
  return <><div className="detail-back"><Link to="/app/tasks">← {t('myTasks')}</Link></div><div className="page-heading"><div><div className="date-overline"><Plus size={14}/>{t('createTask')}</div><h1>{t('newTask')}</h1><p>{t('createTaskSubtitle')}</p></div></div><form className="panel create-form" onSubmit={event => void submit(event)} noValidate>
    {formError && <div className="form-error form-summary" role="alert">{formError}</div>}
    <div className="form-grid"><Field label={t('reference')} error={errors.reference?.message}><input {...register('reference')} placeholder="TSK-1042" /></Field><Field label={t('title')} error={errors.title?.message}><input {...register('title')} maxLength={150} /></Field>
      <Field label={t('assignee')} error={errors.assignee?.message}><select {...register('assignee')} disabled={isLoading}><option value="">{t('selectAssignee')}</option>{people.map(person => <option key={person.id} value={person.id}>{person.full_name} · @{person.username}</option>)}</select></Field>
      <Field label={t('priority')}><select {...register('priority')}><option value="low">{t('low')}</option><option value="medium">{t('medium')}</option><option value="high">{t('high')}</option><option value="urgent">{t('urgent')}</option></select></Field>
      <Field label={t('startDate')} error={errors.startDate?.message}><input type="date" {...register('startDate')} /></Field><Field label={t('dueDate')} error={errors.dueDate?.message}><input type="date" {...register('dueDate')} /></Field>
      <Field label={t('budget')} error={errors.budget?.message}><input inputMode="decimal" placeholder="0.00" {...register('budget')} /></Field><Field label={t('currency')}><select {...register('currency')}><option value="EUR">EUR · Euro</option><option value="RON">RON · Romanian leu</option><option value="USD">USD · US dollar</option></select></Field>
      <Field label={t('description')} error={errors.description?.message} wide><textarea rows={5} maxLength={10000} {...register('description')} /></Field></div>
    <div className="form-actions"><Link className="secondary-button" to="/app/tasks">{t('cancel')}</Link><button className="primary-button" disabled={isSubmitting || isLoading}>{isSubmitting ? t('saving') : t('createTask')} <ArrowRight size={15}/></button></div>
  </form></>;
}

function Field({ label, error, wide = false, children }: { label: string; error?: string; wide?: boolean; children: ReactNode }) {
  return <div className={`form-field ${wide ? 'field-wide' : ''}`}><label>{label}{children}</label>{error && <span className="field-error">{error}</span>}</div>;
}

function InviteForm({ role, busy, onCancel, onSubmit }: { role: Profile['role']; busy: boolean; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const { t } = useTranslation(); const [inviteRole, setInviteRole] = useState<'assigner' | 'end_user'>('end_user');
  return <form className="panel create-form people-form" onSubmit={onSubmit}><div className="panel-heading form-panel-heading"><div><h2>{t('inviteUser')}</h2><span>{t('inviteSubtitle')}</span></div><button className="icon-button" type="button" onClick={onCancel} aria-label={t('close')}>×</button></div><div className="form-grid"><Field label={t('name')}><input name="full_name" required minLength={2} autoComplete="name"/></Field><Field label={t('username')}><input name="username" required minLength={3} pattern="[a-zA-Z0-9._-]+" autoComplete="username"/></Field><Field label={t('email')}><input name="email" type="email" required autoComplete="email"/></Field><Field label={t('role')}><select name="role" value={inviteRole} onChange={event => setInviteRole(event.target.value as 'assigner' | 'end_user')}><option value="end_user">{t('user')}</option>{role === 'super_admin' && <option value="assigner">{t('assignerRole')}</option>}</select></Field><Field label={t('phone')}><input name="phone" type="tel" autoComplete="tel"/></Field><Field label={t('employeeId')}><input name="employee_id"/></Field><Field label={t('department')}><input name="department"/></Field><Field label={t('language')}><select name="language" defaultValue="en"><option value="en">English</option><option value="ro">Română</option></select></Field>{role === 'super_admin' && inviteRole === 'assigner' && <label className="permission-field"><input type="checkbox" name="can_manage_users"/>{t('canManageUsers')}</label>}</div><div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>{t('cancel')}</button><button className="primary-button" disabled={busy}>{busy ? t('saving') : t('sendInvitation')}</button></div></form>;
}

function TaskDetail({ profile }: { profile: Profile | null }) {
  const { taskId = '' } = useParams(); const { t, i18n } = useTranslation(); const qc = useQueryClient(); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [expenseOpen, setExpenseOpen] = useState(false); const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0,10)); const [category, setCategory] = useState(''); const [expenseDescription, setExpenseDescription] = useState(''); const [quantity, setQuantity] = useState('1'); const [unitAmount, setUnitAmount] = useState(''); const [proofFile, setProofFile] = useState<File | null>(null);
  const taskQuery = useQuery({ queryKey: ['task', taskId], enabled: Boolean(supabase && taskId), queryFn: async () => { const { data, error } = await supabase!.from('tasks').select('*').eq('id', taskId).single(); if (error) throw error; return data as Task; } });
  const expenseQuery = useQuery({ queryKey: ['expenses', taskId], enabled: Boolean(supabase && taskId), queryFn: async () => { const { data, error } = await supabase!.from('expense_lines').select('id,category,description,quantity,unit_amount,line_total,expense_date').eq('task_id', taskId).is('deleted_at', null).order('expense_date'); if (error) throw error; return data ?? []; } });
  const proofQuery = useQuery({ queryKey: ['proofs', taskId], enabled: Boolean(supabase && taskId), queryFn: async () => { const { data, error } = await supabase!.from('expense_proofs').select('id,task_id,expense_line_id,object_path,original_name,mime_type,size_bytes').eq('task_id', taskId).is('deleted_at', null); if (error) throw error; return data ?? []; } });
  const historyQuery = useQuery({ queryKey: ['task-history', taskId], enabled: Boolean(supabase && taskId), queryFn: async () => { const { data, error } = await supabase!.from('task_status_history').select('id,from_status,to_status,comment,created_at,actor_id').eq('task_id', taskId).order('created_at', { ascending: true }); if (error) throw error; return data ?? []; } });
  const task = taskQuery.data;
  const transition = async (next: string) => {
    if (!supabase || !task) return;
    if (['on_hold','skipped','returned','cancelled'].includes(next) && reason.trim().length < (next === 'cancelled' ? 1 : 10)) { setNotice(next === 'returned' ? t('returnComment') : next === 'cancelled' ? t('cancelComment') : t(next === 'on_hold' ? 'holdComment' : 'skipComment')); return; }
    if (next === 'submitted' && !window.confirm(t('submitConfirm'))) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.rpc('transition_task', { target_task: task.id, next_status: next, reason: reason.trim() || null, expected_version: task.version });
    if (error) setNotice(error.code === '40001' ? t('taskConflict') : t('transitionFailed')); else { setReason(''); await Promise.all([qc.invalidateQueries({ queryKey: ['task', taskId] }), qc.invalidateQueries({ queryKey: ['tasks'] })]); }
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
  const isOwner = profile?.id === task.assignee_id; const total = sumMoney(expenseQuery.data?.map(line => String(line.line_total)) ?? []); const budget = task.budget_limit; const balance = budgetBalance(budget, total); const overBudget = budget !== null && new Decimal(total).greaterThan(budget);
  return <><div className="detail-back"><Link to="/app/tasks">← {t('myTasks')}</Link></div><div className="page-heading detail-heading"><div><div className="date-overline">{task.reference} <span>·</span> {t('taskDetails')}</div><h1>{task.title}</h1><p>{task.description}</p></div><StatusPill status={task.status} /></div><div className="detail-grid"><div className="panel detail-main"><div className="panel-heading"><div><h2>{t('expenseTotal')}</h2><span>{t('expenseSubtitle')}</span></div>{isOwner && ['pending','in_progress','on_hold','skipped','returned'].includes(task.status) && <button className="subtle-button" onClick={() => setExpenseOpen(!expenseOpen)}><Plus size={15} />{t('addExpense')}</button>}</div>
    {expenseOpen && <form className="expense-form" onSubmit={event => void saveExpense(event)}><div className="expense-form-grid"><label>{t('date')}<input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required /></label><label>{t('category')}<input value={category} onChange={e => setCategory(e.target.value)} minLength={2} maxLength={80} required /></label><label className="expense-wide">{t('description')}<input value={expenseDescription} onChange={e => setExpenseDescription(e.target.value)} minLength={3} maxLength={300} required /></label><label>{t('quantity')}<input inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} required /></label><label>{t('unitAmount')}<input inputMode="decimal" value={unitAmount} onChange={e => setUnitAmount(e.target.value)} required /></label><label className="expense-wide">{t('proof')}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={e => setProofFile(e.target.files?.[0] ?? null)} required /><small>{t('proofLimit')}</small></label></div><div className="expense-live-total">{t('lineTotal')} <b>{formatMoney(calculateLineTotal(quantity || '0', unitAmount || '0'), task.currency, i18n.language === 'ro' ? 'ro-RO' : 'en-GB')}</b></div><div className="expense-form-actions"><button type="button" className="secondary-button" onClick={() => setExpenseOpen(false)}>{t('cancel')}</button><button className="primary-button" disabled={busy}>{busy ? t('saving') : t('save')}</button></div></form>}
    <div className="budget-summary"><div><span>{t('budget')}</span><b>{budget === null ? t('noLimit') : formatMoney(budget, task.currency, i18n.language === 'ro' ? 'ro-RO' : 'en-GB')}</b></div><div><span>{t('spent')}</span><b>{formatMoney(total, task.currency, i18n.language === 'ro' ? 'ro-RO' : 'en-GB')}</b></div><div><span>{t('remaining')}</span><b className={overBudget ? 'over-budget-text' : ''}>{balance.remaining === null ? '—' : formatMoney(balance.remaining, task.currency, i18n.language === 'ro' ? 'ro-RO' : 'en-GB')}</b></div></div>{overBudget && <div className="over-budget-alert"><CircleDollarSign size={17} /><span><b>{t('limitExceeded')}</b> · {t('overage')}: {formatMoney(balance.overage, task.currency, i18n.language === 'ro' ? 'ro-RO' : 'en-GB')}</span></div>}{notice && <div className="form-error proof-error" role="alert">{notice}</div>}<div className="expense-table-wrap"><table className="expense-table"><thead><tr><th>{t('date')}</th><th>{t('category')}</th><th>{t('description')}</th><th>{t('quantity')}</th><th>{t('lineTotal')}</th><th>{t('proof')}</th></tr></thead><tbody>{expenseQuery.data?.map(line => <tr key={line.id}><td>{line.expense_date}</td><td>{line.category}</td><td>{line.description}</td><td>{line.quantity}</td><td>{formatMoney(String(line.line_total), task.currency, i18n.language === 'ro' ? 'ro-RO' : 'en-GB')}</td><td>{proofQuery.data?.filter(proof => proof.expense_line_id === line.id).map(proof => <ProofLink key={proof.id} path={proof.object_path} name={proof.original_name} />)}</td></tr>)}</tbody></table>{!expenseQuery.data?.length && <div className="empty-expenses">{t('noTasksHint')}</div>}</div><div className="task-detail-meta"><div><span>{t('priority')}</span><PriorityPill priority={task.priority} /></div><div><span>{t('dueDate')}</span><b>{new Intl.DateTimeFormat(i18n.language === 'ro' ? 'ro-RO' : 'en-GB', { dateStyle: 'medium' }).format(new Date(`${task.due_date}T12:00:00`))}</b></div></div><div className="history-block"><h3>{t('statusHistory')}</h3>{historyQuery.data?.map(item => <div className="history-entry" key={item.id}><StatusPill status={item.to_status}/><span>{new Intl.DateTimeFormat(i18n.language === 'ro' ? 'ro-RO' : 'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at))}</span>{item.comment && <p>{item.comment}</p>}</div>)}</div></div><aside className="panel detail-actions"><h2>{t('nextSteps')}</h2><p>{t('nextStepsSubtitle')}</p>{isOwner && ['pending','returned'].includes(task.status) && <button className="primary-button full-button" disabled={busy} onClick={() => void transition('in_progress')}>{t('inProgress')}</button>}{isOwner && ['pending','in_progress','returned'].includes(task.status) &&
      <><textarea className="reason-input" value={reason} onChange={e => setReason(e.target.value)} placeholder={t('holdComment')} /><button className="secondary-button full-button" disabled={busy} onClick={() => void transition('on_hold')}>{t('onHold')}</button><button className="secondary-button full-button" disabled={busy} onClick={() => void transition('skipped')}>{t('skipped')}</button><button className="primary-button full-button" disabled={busy} onClick={() => void transition('submitted')}>{t('submitForReview')} <ArrowRight size={15} /></button></>
    }{!isOwner && task.status === 'submitted' && <><textarea className="reason-input" value={reason} onChange={e => setReason(e.target.value)} placeholder={t('returnComment')} /><button className="primary-button full-button" disabled={busy} onClick={() => void transition('verified')}>{t('verify')} <Check size={15} /></button><button className="secondary-button full-button" disabled={busy} onClick={() => void transition('returned')}>{t('returnForCorrection')}</button></>}{task.status === 'verified' && <div className="verified-note"><ShieldCheck size={18} />{t('verified')} · {t('recordLocked')}</div>}</aside></div></>;
}

function ProofLink({ path, name }: { path: string; name: string }) {
  const { t } = useTranslation(); const [error, setError] = useState('');
  const open = async () => { if (!supabase) return; const { data, error: signedError } = await supabase.storage.from('task-proofs').createSignedUrl(path, 120); if (signedError || !data?.signedUrl) { setError(t('proofUnavailable')); return; } window.open(data.signedUrl, '_blank', 'noopener,noreferrer'); };
  return <button className="proof-link" onClick={() => void open()} aria-label={`${t('openProof')}: ${name}`} title={error || name}><FileText size={14}/>{name}</button>;
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
      const { data } = await supabase!.from('profiles').select('id,organisation_id,full_name,username,role,language,is_active,must_reset_password').eq('id', currentUser.id).maybeSingle();
      if (active) { setProfile(data as Profile | null); if (data?.language) await i18n.changeLanguage(data.language); setReady(true); }
    };
    void supabase.auth.getSession().then(({ data }) => loadProfile(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void loadProfile(session?.user ?? null); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [i18n]);
  const signOut = async () => { await supabase?.auth.signOut(); setUser(null); setProfile(null); queryClient.clear(); navigate('/login'); };
  if (!ready) return <div className="splash"><div className="brand-mark"><Check size={18} /></div><span>TaskFlow SME</span></div>;
  if (!user) return <Routes><Route path="/forgot-password" element={<ForgotPassword />} /><Route path="*" element={<Login />} /></Routes>;
  if (profile?.must_reset_password || location.pathname === '/reset-password') return <ResetPassword onComplete={() => setProfile(current => current ? { ...current, must_reset_password: false } : current)} />;
  return <AppShell user={user} profile={profile} onSignOut={() => void signOut()}><Routes><Route path="/app" element={<Dashboard profile={profile} />} /><Route path="/app/tasks" element={<TaskListPage profile={profile} />} /><Route path="/app/tasks/new" element={<CreateTaskPage profile={profile} />} /><Route path="/app/tasks/:taskId" element={<TaskPage profile={profile}/>} /><Route path="/app/reviews" element={<ReviewQueue profile={profile} />} /><Route path="/app/people" element={<PeoplePage profile={profile} />} /><Route path="/app/reports" element={<ReportsPage profile={profile} />} /><Route path="/app/audit" element={profile?.role === 'super_admin' ? <AuditPage /> : <div className="panel empty-state">{t('noPermission')}</div>} /><Route path="/app/settings" element={<SettingsPage profile={profile} />} /><Route path="*" element={<Dashboard profile={profile} />} /></Routes></AppShell>;
}

function ForgotPassword() {
  const { t } = useTranslation(); const [email,setEmail]=useState(''); const [sent,setSent]=useState(false); const [error,setError]=useState('');
  const submit=async (event:FormEvent<HTMLFormElement>)=>{event.preventDefault(); if (!supabase) {setError(t('notConfigured'));return;} const {error: resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}${import.meta.env.BASE_URL}reset-password`}); if(resetError)setError(t('connectionError'));else setSent(true);};
  return <main className="forgot-page"><div className="forgot-card"><div className="brand"><span className="brand-mark"><Check size={18}/></span><span>TaskFlow <b>SME</b></span><LanguageSwitch/></div><span className="eyebrow">{t('accountRecovery')}</span><h1>{t('forgotPassword')}</h1><p>{sent ? t('resetIfExists') : t('loginSubtitle')}</p>{!sent&&<form className="login-form" onSubmit={event=>void submit(event)}><label htmlFor="reset-email">{t('email')}</label><input id="reset-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>{error&&<span role="alert" className="form-error">{error}</span>}<button className="primary-button">{t('sendResetLink')} <ArrowRight size={16}/></button></form>}<Link to="/login" className="view-link">← {t('back')}</Link></div></main>;
}

function ResetPassword({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation(); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) { setError(t('passwordPolicy')); return; }
    if (password !== confirm) { setError(t('passwordMismatch')); return; }
    if (!supabase) { setError(t('notConfigured')); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    const completion = updateError ? { error: updateError } : await supabase.rpc('complete_password_reset');
    if (completion.error) setError(t('passwordUpdateFailed')); else { onComplete(); navigate('/app'); }
    setBusy(false);
  };
  return <main className="forgot-page"><div className="forgot-card"><div className="brand"><span className="brand-mark"><Check size={18}/></span><span>TaskFlow <b>SME</b></span><LanguageSwitch/></div><span className="eyebrow">{t('passwordReset')}</span><h1>{t('choosePassword')}</h1><p>{t('passwordPolicy')}</p><form className="login-form" onSubmit={event => void submit(event)}><label htmlFor="new-password">{t('newPassword')}</label><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required/><label htmlFor="confirm-password">{t('confirmPassword')}</label><input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} required/>{error && <span role="alert" className="form-error">{error}</span>}<button className="primary-button" disabled={busy}>{busy ? t('saving') : t('save')} <ArrowRight size={16}/></button></form></div></main>;
}
