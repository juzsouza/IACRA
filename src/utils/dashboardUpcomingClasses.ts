/**
 * Contagem de aulas ainda não iniciadas, usando sempre o horário da escola
 * (America/Sao_Paulo), independentemente do fuso do navegador.
 * Não altera o status de aulas antigas nem qualquer registro no banco.
 */
export interface SchoolClock {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
}

export interface ScheduledClassLike {
  status?: string | null;
  date?: string | null;
  start_time?: string | null;
}

export const getSchoolClock = (reference: Date = new Date()): SchoolClock => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(reference);
  const fields: Record<string, string> = {};
  for (const part of parts) fields[part.type] = part.value;

  return {
    date: `${fields.year}-${fields.month}-${fields.day}`,
    time: `${fields.hour}:${fields.minute}`,
  };
};

export const isFutureScheduledClass = (
  session: ScheduledClassLike,
  clock: SchoolClock,
): boolean => {
  if (session.status !== 'scheduled' || !session.date || !session.start_time) {
    return false;
  }

  const date = session.date.slice(0, 10);
  const time = session.start_time.slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return false;
  }

  return date > clock.date || (date === clock.date && time >= clock.time);
};
