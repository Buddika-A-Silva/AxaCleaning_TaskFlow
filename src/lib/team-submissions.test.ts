import { describe, expect, it } from 'vitest';
import { isFinalWorkerSubmission, type WorkerSubmission } from './team-submissions';

const team: WorkerSubmission[] = [
  { profile_id: 'worker-1', worker_submitted_at: null },
  { profile_id: 'worker-2', worker_submitted_at: null },
];

describe('team worker submissions', () => {
  it('lets a solo worker complete the task in one submission', () => {
    expect(isFinalWorkerSubmission([{ profile_id: 'worker-1', worker_submitted_at: null }], 'worker-1')).toBe(true);
  });

  it('keeps a team submission open until every teammate has submitted', () => {
    expect(isFinalWorkerSubmission(team, 'worker-1')).toBe(false);
    expect(isFinalWorkerSubmission([
      { profile_id: 'worker-1', worker_submitted_at: null },
      { profile_id: 'worker-2', worker_submitted_at: '2026-01-01T10:00:00Z' },
    ], 'worker-1')).toBe(true);
  });

  it('does not allow a worker to submit the same work twice', () => {
    expect(isFinalWorkerSubmission([
      { profile_id: 'worker-1', worker_submitted_at: '2026-01-01T10:00:00Z' },
      { profile_id: 'worker-2', worker_submitted_at: '2026-01-01T10:00:00Z' },
    ], 'worker-1')).toBe(false);
  });
});
