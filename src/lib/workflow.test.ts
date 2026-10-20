import { describe, expect, it } from 'vitest';
import { canTransition } from './workflow';

describe('task transition rules', () => {
  it('requires a ten-character explanation for hold and skip', () => {
    expect(canTransition({ from: 'pending', to: 'on_hold', role: 'end_user', isAssignee: true, isScopedReviewer: false, comment: 'too short' })).toBe(false);
    expect(canTransition({ from: 'pending', to: 'on_hold', role: 'end_user', isAssignee: true, isScopedReviewer: false, comment: 'Waiting for access' })).toBe(true);
    expect(canTransition({ from: 'pending', to: 'skipped', role: 'end_user', isAssignee: true, isScopedReviewer: false, comment: 'Not applicable' })).toBe(true);
  });

  it('only permits the assigned user to change their workflow state', () => {
    expect(canTransition({ from: 'pending', to: 'in_progress', role: 'end_user', isAssignee: false, isScopedReviewer: false })).toBe(false);
    expect(canTransition({ from: 'pending', to: 'in_progress', role: 'end_user', isAssignee: true, isScopedReviewer: false })).toBe(true);
    expect(canTransition({ from: 'pending', to: 'submitted', role: 'end_user', isAssignee: true, isScopedReviewer: false })).toBe(true);
  });

  it('locks submitted work to review and requires return comments', () => {
    expect(canTransition({ from: 'submitted', to: 'verified', role: 'assigner', isAssignee: false, isScopedReviewer: true })).toBe(true);
    expect(canTransition({ from: 'submitted', to: 'returned', role: 'assigner', isAssignee: false, isScopedReviewer: true })).toBe(false);
    expect(canTransition({ from: 'submitted', to: 'returned', role: 'assigner', isAssignee: false, isScopedReviewer: true, comment: 'Please attach receipt' })).toBe(true);
    expect(canTransition({ from: 'submitted', to: 'in_progress', role: 'end_user', isAssignee: true, isScopedReviewer: false })).toBe(false);
  });

  it('only allows Super Admin to exceptionally reopen verified tasks', () => {
    expect(canTransition({ from: 'verified', to: 'returned', role: 'assigner', isAssignee: false, isScopedReviewer: true, comment: 'Correction' })).toBe(false);
    expect(canTransition({ from: 'verified', to: 'returned', role: 'super_admin', isAssignee: false, isScopedReviewer: true, comment: 'Correction' })).toBe(true);
  });
});