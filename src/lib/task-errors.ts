type DatabaseError = { code?: string; message?: string };

export function isDuplicateTaskReferenceError(error: DatabaseError): boolean {
  return error.code === '23505' && error.message?.includes('tasks_organisation_id_reference_key') === true;
}
