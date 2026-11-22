export type WorkerSubmission = {
  profile_id: string;
  worker_submitted_at: string | null;
};

export function isFinalWorkerSubmission(assignments: WorkerSubmission[], profileId: string): boolean {
  const currentAssignment = assignments.find(assignment => assignment.profile_id === profileId);
  return Boolean(
    currentAssignment
    && !currentAssignment.worker_submitted_at
    && assignments.every(assignment =>
      assignment.profile_id === profileId || assignment.worker_submitted_at !== null,
    ),
  );
}
