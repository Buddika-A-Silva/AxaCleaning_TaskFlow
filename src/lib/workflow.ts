export type TaskStatus = 'pending' | 'in_progress' | 'on_hold' | 'skipped' | 'submitted' | 'verified' | 'returned' | 'cancelled';
export type ActorRole = 'super_admin' | 'assigner' | 'end_user';

export interface TransitionRequest {
  from: TaskStatus;
  to: TaskStatus;
  role: ActorRole;
  isAssignee: boolean;
  isScopedReviewer: boolean;
  comment?: string;
}

export function canTransition({ from, to, role, isAssignee, isScopedReviewer, comment = '' }: TransitionRequest): boolean {
  const note = comment.trim();
  if ((to === 'on_hold' || to === 'skipped') && note.length < 10) return false;
  if (to === 'returned' && note.length < 10) return false;
  if (role === 'end_user' && isAssignee) {
    if (from === 'pending') return ['in_progress', 'on_hold', 'skipped', 'submitted'].includes(to);
    if (from === 'in_progress') return ['on_hold', 'skipped', 'submitted'].includes(to);
    if (from === 'on_hold' || from === 'skipped') return to === 'in_progress' || to === 'submitted';
    if (from === 'returned') return ['in_progress', 'on_hold', 'skipped', 'submitted'].includes(to);
    return false;
  }
  if ((role === 'assigner' || role === 'super_admin') && isScopedReviewer) {
    if (from === 'submitted') return to === 'verified' || to === 'returned';
    if (role === 'super_admin' && from === 'verified') return to === 'returned';
  }
  if (role === 'assigner' && isScopedReviewer && from === 'pending') return to === 'cancelled';
  if (role === 'super_admin' && isScopedReviewer && !['verified', 'cancelled'].includes(from)) return to === 'cancelled';
  return false;
}
