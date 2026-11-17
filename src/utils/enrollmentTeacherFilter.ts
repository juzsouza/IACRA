/** Filtro exclusivamente visual de matrículas por professor, sem alterar dados. */
export type TeacherLinkedEnrollment = { teacher_id?: string | null; group_id?: string | null };
export type TeacherLinkedGroup = { id: string; teacher_id?: string | null };
export type TeacherDirectoryEntry = { id: string; name?: string | null };

export const normalizeTeacherName = (name?: string | null): string =>
  (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function resolveEnrollmentTeacherId(
  enrollment: TeacherLinkedEnrollment,
  groups: TeacherLinkedGroup[],
): string | null {
  // O professor explícito na matrícula prevalece sobre o professor do grupo.
  if (enrollment.teacher_id) return enrollment.teacher_id;
  if (!enrollment.group_id) return null;
  return groups.find(group => group.id === enrollment.group_id)?.teacher_id || null;
}

export function matchesEnrollmentTeacher(
  enrollment: TeacherLinkedEnrollment,
  groups: TeacherLinkedGroup[],
  teachers: TeacherDirectoryEntry[],
  selectedTeacherId: string,
  teacherSearch: string,
): boolean {
  if (!selectedTeacherId && !teacherSearch.trim()) return true;
  const teacherId = resolveEnrollmentTeacherId(enrollment, groups);
  if (!teacherId) return false;
  if (selectedTeacherId) return teacherId === selectedTeacherId;
  const teacher = teachers.find(item => item.id === teacherId);
  return Boolean(teacher && normalizeTeacherName(teacher.name).includes(normalizeTeacherName(teacherSearch)));
}
