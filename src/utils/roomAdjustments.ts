/**
 * Regras de apresentação da reserva de salas.
 * A autorização de escrita e a proteção de horários permanecem nas RPCs.
 */
export function automaticRoomActivity(
  isRaphaelRoom: boolean,
  classTitle: string | undefined,
  typedActivity: string
): string {
  if (!isRaphaelRoom) return typedActivity.trim();
  const title = (classTitle || '').trim();
  return (title.length >= 2 ? title : 'Atendimento Raphael').slice(0, 100);
}

export function filteredRoomClasses<T extends { teacher_id: string }>(
  classes: T[],
  teacherId: string
): T[] {
  return teacherId ? classes.filter(c => c.teacher_id === teacherId) : classes;
}

export function filteredRoomReservations<
  T extends { class_id: string; room_slug: string }
>(
  reservations: T[],
  teacherId: string,
  roomSlug: string,
  teacherByClassId: ReadonlyMap<string, string>
): T[] {
  return reservations.filter(a =>
    (!roomSlug || a.room_slug === roomSlug) &&
    (!teacherId || teacherByClassId.get(a.class_id) === teacherId)
  );
}

/** Hide future booking choices only when EVERY linked student is known inactive.
 * Keep classes with no student link and mixed/unknown memberships visible for
 * manual review rather than guessing their scheduling eligibility.
 */
export function classHasEligibleStudents(
  studentIds: readonly string[],
  studentStatusById: ReadonlyMap<string,'active'|'inactive'>
): boolean {
  if (studentIds.length === 0) return true;
  return !studentIds.every(id => studentStatusById.get(id) === 'inactive');
}
