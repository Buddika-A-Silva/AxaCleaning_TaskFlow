type ServiceProgressLog = { selection_id: string; actual_hours: number | null };

export function hasHoursForEveryService(serviceIds: string[], logs: ServiceProgressLog[]): boolean {
  return serviceIds.every(serviceId =>
    logs.some(log => log.selection_id === serviceId && log.actual_hours !== null),
  );
}
