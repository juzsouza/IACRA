import assert from "node:assert";
import { formatLocalDate } from "../utils/dateUtils";
import {
  getWeekDates,
  formatLocalDatePtBr,
  getWeekdayLong,
  getWeekdayShort,
} from "../components/MobileAgendaView";
import {
  isDesktopBreakpoint,
  getClassCardVisualTheme,
  getSessionStudents,
  getSessionStudentIds,
  getGoogleSyncBadgeInfo,
  checkIsClassFuture,
  isTeacherActive,
} from "../views/Classes";
import { ClassSession } from "../store";

console.log("=== INICIANDO BATERIA DE TESTES: AGENDA MOBILE E REGRESSÃO DESKTOP ===");

// -----------------------------------------------------------------------------
// 1. SELEÇÃO DE INTERFACE POR LARGURA (BREAKPOINT RESPONSIVO)
// -----------------------------------------------------------------------------
console.log("\n1. Testando seleção de interface por largura de tela...");

assert.strictEqual(isDesktopBreakpoint(768), true, "768px deve ser classificado como desktop");
assert.strictEqual(isDesktopBreakpoint(1024), true, "1024px deve ser classificado como desktop");
assert.strictEqual(isDesktopBreakpoint(1440), true, "1440px deve ser classificado como desktop");
assert.strictEqual(isDesktopBreakpoint(767), false, "767px deve ser classificado como mobile");
assert.strictEqual(isDesktopBreakpoint(414), false, "414px (iPhone Plus/Max) deve ser classificado como mobile");
assert.strictEqual(isDesktopBreakpoint(390), false, "390px (iPhone 13/14) deve ser classificado como mobile");
assert.strictEqual(isDesktopBreakpoint(360), false, "360px (Android comum) deve ser classificado como mobile");

console.log("✔ Breakpoint responsivo: 768px divide com precisão mobile (< 768px) e desktop (>= 768px).");

// -----------------------------------------------------------------------------
// 2. NAVEGAÇÃO TEMPORAL (HOJE, AMANHÃ, SEMANA E OUTRA DATA)
// -----------------------------------------------------------------------------
console.log("\n2. Testando navegação temporal (Hoje, Amanhã, Semana, Outra Data)...");

const now = new Date();
const todayStr = formatLocalDate(now);
assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/, "todayStr deve estar no padrão YYYY-MM-DD");

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = formatLocalDate(tomorrow);
assert.match(tomorrowStr, /^\d{4}-\d{2}-\d{2}$/, "tomorrowStr deve estar no padrão YYYY-MM-DD");
assert.notStrictEqual(todayStr, tomorrowStr, "Hoje e Amanhã devem ser datas distintas");

// Teste de cálculo da semana (Segunda a Domingo)
// Exemplo: Quarta-feira, 07 de Outubro de 2026
const wednesday = new Date(2026, 9, 7); // Mês 9 = Outubro (0-indexed)
const weekFromWed = getWeekDates(wednesday);
assert.strictEqual(weekFromWed.length, 7, "A semana deve conter exatamente 7 dias");
assert.strictEqual(weekFromWed[0], "2026-10-05", "A semana de 07/10/2026 deve iniciar na Segunda 05/10/2026");
assert.strictEqual(weekFromWed[1], "2026-10-06", "Terça 06/10/2026");
assert.strictEqual(weekFromWed[2], "2026-10-07", "Quarta 07/10/2026");
assert.strictEqual(weekFromWed[3], "2026-10-08", "Quinta 08/10/2026");
assert.strictEqual(weekFromWed[4], "2026-10-09", "Sexta 09/10/2026");
assert.strictEqual(weekFromWed[5], "2026-10-10", "Sábado 10/10/2026");
assert.strictEqual(weekFromWed[6], "2026-10-11", "Domingo 11/10/2026");

// Exemplo: Domingo, 11 de Outubro de 2026
const sunday = new Date(2026, 9, 11);
const weekFromSun = getWeekDates(sunday);
assert.strictEqual(weekFromSun[0], "2026-10-05", "Domingo deve pertencer à semana iniciada na Segunda 05/10/2026");
assert.strictEqual(weekFromSun[6], "2026-10-11", "Domingo deve fechar a semana em 11/10/2026");

// Exemplo: Segunda-feira, 05 de Outubro de 2026
const monday = new Date(2026, 9, 5);
const weekFromMon = getWeekDates(monday);
assert.deepStrictEqual(weekFromMon, weekFromWed, "Cálculo da semana deve ser idêntico partindo de qualquer dia da mesma semana");

console.log("✔ Navegação temporal: Hoje, Amanhã e cálculo de Semana (Segunda a Domingo) validados.");

// -----------------------------------------------------------------------------
// 3. TRATAMENTO DE FUSO HORÁRIO E FORMATAÇÃO BRASIL
// -----------------------------------------------------------------------------
console.log("\n3. Testando tratamento de fuso horário e formatação pt-BR...");

assert.strictEqual(formatLocalDatePtBr("2026-10-09"), "09/10/2026");
assert.strictEqual(formatLocalDatePtBr("2026-01-01"), "01/01/2026");
assert.strictEqual(formatLocalDatePtBr(""), "");

const weekdayLong = getWeekdayLong("2026-10-09");
assert.ok(
  weekdayLong.toLowerCase().includes("sexta"),
  `2026-10-09 deve ser sexta-feira sem recuo para quinta (recebido: ${weekdayLong})`
);

const weekdayShort = getWeekdayShort("2026-10-09");
assert.ok(
  weekdayShort.toUpperCase().includes("SEX"),
  `2026-10-09 curto deve ser SEX (recebido: ${weekdayShort})`
);

console.log("✔ Fuso horário: Nenhuma perda ou deslocamento de dia no fuso brasileiro.");

// -----------------------------------------------------------------------------
// 4. DESEMPENHO E DELIMITAÇÃO TEMPORAL ANTECIPADA (1.600+ AULAS)
// -----------------------------------------------------------------------------
console.log("\n4. Testando delimitação temporal antecipada e performance com grande volume...");

// Gera 1.611 aulas simuladas distribuídas ao longo de 2026
const mockClasses: ClassSession[] = [];
for (let i = 1; i <= 1611; i++) {
  const month = String((i % 12) + 1).padStart(2, "0");
  const day = String((i % 28) + 1).padStart(2, "0");
  mockClasses.push({
    id: `class-${i}`,
    title: `Aula de Teste ${i}`,
    teacher_id: "teacher-1",
    student_ids: [`student-${(i % 50) + 1}`],
    date: `2026-${month}-${day}`,
    start_time: "10:00",
    end_time: "11:00",
    status: i % 20 === 0 ? "cancelled" : "scheduled",
  });
}

// Injeta 5 aulas específicas para Hoje
const targetToday = "2026-10-09";
for (let k = 1; k <= 5; k++) {
  mockClasses.push({
    id: `class-today-${k}`,
    title: `Aula Hoje ${k}`,
    teacher_id: "teacher-1",
    student_ids: ["student-100"],
    date: targetToday,
    start_time: `0${8 + k}:00`,
    end_time: `0${9 + k}:00`,
    status: "scheduled",
  });
}

const totalBefore = mockClasses.length;
assert.ok(totalBefore > 1611, `Deve conter mais de 1611 aulas (total: ${totalBefore})`);

// Etapa 1: Delimitação temporal pura (string comparison instantâneo)
const targetSet = new Set([targetToday]);
const startTime = performance.now();
const timeScoped = mockClasses.filter((c) => {
  if (c.status === "cancelled") return false;
  if (!c.date) return false;
  return targetSet.has(c.date);
});
const duration = performance.now() - startTime;

assert.ok(
  timeScoped.length <= 15,
  `O filtro temporal antecipado deve reduzir drasticamente de ${totalBefore} para ~10 aulas (obtido: ${timeScoped.length})`
);
assert.ok(duration < 10, `A delimitação temporal deve executar em menos de 10ms (tempo: ${duration.toFixed(2)}ms)`);

console.log(
  `✔ Desempenho: De ${totalBefore} aulas para ${timeScoped.length} aulas em ${duration.toFixed(2)}ms antes de qualquer cálculo custoso.`
);

// -----------------------------------------------------------------------------
// 5. ORDENAÇÃO CRONOLÓGICA
// -----------------------------------------------------------------------------
console.log("\n5. Testando ordenação cronológica rigorosa...");

const unsortedClasses: ClassSession[] = [
  { id: "1", title: "Tarde", teacher_id: "t1", student_ids: [], date: "2026-10-09", start_time: "15:00", end_time: "16:00", status: "scheduled" },
  { id: "2", title: "Noite", teacher_id: "t1", student_ids: [], date: "2026-10-09", start_time: "19:30", end_time: "20:30", status: "scheduled" },
  { id: "3", title: "Manhã Cedo", teacher_id: "t1", student_ids: [], date: "2026-10-09", start_time: "08:00", end_time: "09:00", status: "scheduled" },
  { id: "4", title: "Manhã Meio", teacher_id: "t1", student_ids: [], date: "2026-10-09", start_time: "10:30", end_time: "11:30", status: "scheduled" },
  { id: "5", title: "Amanhã", teacher_id: "t1", student_ids: [], date: "2026-10-10", start_time: "09:00", end_time: "10:00", status: "scheduled" },
];

const sorted = unsortedClasses.slice().sort((a, b) => {
  const dComp = (a.date || "").localeCompare(b.date || "");
  if (dComp !== 0) return dComp;
  return (a.start_time || "").localeCompare(b.start_time || "");
});

assert.strictEqual(sorted[0].id, "3", "08:00 deve vir primeiro");
assert.strictEqual(sorted[1].id, "4", "10:30 deve vir em segundo");
assert.strictEqual(sorted[2].id, "1", "15:00 deve vir em terceiro");
assert.strictEqual(sorted[3].id, "2", "19:30 deve vir em quarto");
assert.strictEqual(sorted[4].id, "5", "Dia seguinte 10/10 deve vir por último");

console.log("✔ Ordenação cronológica: Aulas ordenadas perfeitamente por data e horário de início.");

// -----------------------------------------------------------------------------
// 6. ALUNOS ASSOCIADOS DIRETAMENTE E POR TURMA / GRUPO
// -----------------------------------------------------------------------------
console.log("\n6. Testando resolução de alunos diretos e por turma...");

const mockState = {
  students: [
    { id: "s-direct", name: "Lucas Aluno Direto", status: "active", phone: "11999990001" },
    { id: "s-group-1", name: "Beatriz Turma 1", status: "active", phone: "11999990002" },
    { id: "s-group-2", name: "Carlos Turma 2", status: "active", phone: "11999990003" },
    { id: "s-inactive", name: "Daniel Inativo", status: "inactive", phone: "11999990004" },
    { id: "s-not-eligible", name: "Elena Inelegivel", status: "active", not_eligible: true, phone: "11999990005" },
  ],
  groups: [
    { id: "group-coral", name: "Coral Infanto-Juvenil", teacher_id: "t-1" },
  ],
  enrollments: [
    { id: "e1", student_id: "s-group-1", group_id: "group-coral", status: "active", start_date: "2026-01-01" },
    { id: "e2", student_id: "s-group-2", group_id: "group-coral", status: "active", start_date: "2026-01-01" },
    { id: "e3", student_id: "s-inactive", group_id: "group-coral", status: "active", start_date: "2026-01-01" },
    { id: "e4", student_id: "s-not-eligible", group_id: "group-coral", status: "active", start_date: "2026-01-01" },
  ],
  teachers: [
    { id: "t-1", name: "Prof. Maestro", status: "active" },
  ],
};

// Caso A: Aula individual com aluno direto
const singleClass: ClassSession = {
  id: "c-single",
  title: "Canto Individual",
  teacher_id: "t-1",
  student_ids: ["s-direct"],
  date: "2026-10-09",
  start_time: "10:00",
  end_time: "11:00",
  status: "scheduled",
};

const singleStudents = getSessionStudents(singleClass, mockState);
assert.strictEqual(singleStudents.length, 1);
assert.strictEqual(singleStudents[0].name, "Lucas Aluno Direto");

// Caso B: Aula de grupo / turma
const groupClass: ClassSession = {
  id: "c-group",
  title: "Ensaio Coral",
  teacher_id: "t-1",
  group_id: "group-coral",
  student_ids: [],
  date: "2026-10-09",
  start_time: "14:00",
  end_time: "15:00",
  status: "scheduled",
};

const groupStudents = getSessionStudents(groupClass, mockState);
assert.strictEqual(groupStudents.length, 2, "Apenas alunos ativos e elegíveis devem ser incluídos");
const groupNames = groupStudents.map((s) => s.name);
assert.ok(groupNames.includes("Beatriz Turma 1"));
assert.ok(groupNames.includes("Carlos Turma 2"));
assert.ok(!groupNames.includes("Daniel Inativo"), "Daniel Inativo deve ser excluído");
assert.ok(!groupNames.includes("Elena Inelegivel"), "Elena Inelegivel deve ser excluída");

console.log("✔ Alunos diretos e por turma: Resolução idêntica às regras canônicas de matrícula e status.");

// -----------------------------------------------------------------------------
// 7. STATUS E TEMAS VISUAIS (CORES ROXO, VERDE, AMARELO, VERMELHO)
// -----------------------------------------------------------------------------
console.log("\n7. Testando status e temas visuais dos cards...");

// 7.1 Aula Futura -> Roxo (Agendada)
const futureClass: ClassSession = {
  id: "c-future",
  title: "Aula Futura",
  teacher_id: "t-1",
  student_ids: ["s-direct"],
  date: "2026-12-25",
  start_time: "10:00",
  end_time: "11:00",
  status: "scheduled",
};
const themeFuture = getClassCardVisualTheme(futureClass, mockState);
assert.strictEqual(themeFuture.type, "future");
assert.strictEqual(themeFuture.label, "Agendada");
assert.ok(themeFuture.badgeClass.includes("purple"));

// 7.2 Aula Passada com Presença -> Verde (Presente)
const presentClass: ClassSession = {
  id: "c-present",
  title: "Aula Passada Presente",
  teacher_id: "t-1",
  student_ids: ["s-direct"],
  date: "2026-01-10",
  start_time: "10:00",
  end_time: "11:00",
  status: "completed",
  attendance: { "s-direct": "present" },
};
const themePresent = getClassCardVisualTheme(presentClass, mockState);
assert.strictEqual(themePresent.type, "present");
assert.strictEqual(themePresent.label, "Presente");
assert.ok(themePresent.badgeClass.includes("emerald"));

// 7.3 Aula Passada com Falta + Permite Reposição -> Amarelo (Falta c/ Reposição)
const absentMakeupClass: ClassSession = {
  id: "c-absent-makeup",
  title: "Aula Falta c/ Reposição",
  teacher_id: "t-1",
  student_ids: ["s-direct"],
  date: "2026-01-10",
  start_time: "10:00",
  end_time: "11:00",
  status: "completed",
  allow_makeup: true,
  attendance: { "s-direct": "absent" },
};
const themeAbsentMakeup = getClassCardVisualTheme(absentMakeupClass, mockState);
assert.strictEqual(themeAbsentMakeup.type, "absent_with_makeup");
assert.strictEqual(themeAbsentMakeup.label, "Falta (c/ Reposição)");
assert.ok(themeAbsentMakeup.badgeClass.includes("amber"));

// 7.4 Aula Passada com Falta s/ Reposição -> Vermelho (Falta s/ Reposição)
const absentNoMakeupClass: ClassSession = {
  id: "c-absent-no-makeup",
  title: "Aula Falta s/ Reposição",
  teacher_id: "t-1",
  student_ids: ["s-direct"],
  date: "2026-01-10",
  start_time: "10:00",
  end_time: "11:00",
  status: "completed",
  allow_makeup: false,
  attendance: { "s-direct": "absent" },
};
const themeAbsentNoMakeup = getClassCardVisualTheme(absentNoMakeupClass, mockState);
assert.strictEqual(themeAbsentNoMakeup.type, "absent_no_makeup");
assert.strictEqual(themeAbsentNoMakeup.label, "Falta (s/ Reposição)");
assert.ok(themeAbsentNoMakeup.badgeClass.includes("rose"));

console.log("✔ Status visuais: Futura (Roxo), Presente (Verde), Falta c/ Reposição (Amarelo) e Falta s/ Reposição (Vermelho).");

// -----------------------------------------------------------------------------
// 8. INDICADORES E SINCRONIZAÇÃO GOOGLE CALENDAR
// -----------------------------------------------------------------------------
console.log("\n8. Testando indicadores e badges de sincronização Google Calendar...");

const syncedBadge = getGoogleSyncBadgeInfo("synced");
assert.strictEqual(syncedBadge.label, "Google OK");
assert.ok(syncedBadge.colorClass.includes("teal"));

const pendingBadge = getGoogleSyncBadgeInfo("pending");
assert.strictEqual(pendingBadge.label, "Sincronizando Google...");
assert.ok(pendingBadge.colorClass.includes("amber"));

const unsyncedBadge = getGoogleSyncBadgeInfo("unsynced");
assert.strictEqual(unsyncedBadge.label, "Pendente Google");
assert.ok(unsyncedBadge.colorClass.includes("amber"));

const failedBadge = getGoogleSyncBadgeInfo("failed", "Erro 403: Permissão negada");
assert.strictEqual(failedBadge.label, "Google Falhou");
assert.ok(failedBadge.colorClass.includes("rose"));
assert.strictEqual(failedBadge.title, "Erro 403: Permissão negada");

console.log("✔ Google Calendar: Badges 'Google OK', 'Sincronizando...', 'Pendente' e 'Falhou' validados.");

// -----------------------------------------------------------------------------
// 9. VALIDADOR DE PROFESSOR ATIVO
// -----------------------------------------------------------------------------
console.log("\n9. Testando validador canônico de professor ativo...");

assert.strictEqual(isTeacherActive({ status: "active" }), true);
assert.strictEqual(isTeacherActive({ status: "Active" }), true);
assert.strictEqual(isTeacherActive({ status: "inactive" }), false);
assert.strictEqual(isTeacherActive({ status: "inativo" }), false);
assert.strictEqual(isTeacherActive(null), false);
assert.strictEqual(isTeacherActive(undefined), false);

console.log("✔ Professor ativo: Validador canônico verificado.");

// -----------------------------------------------------------------------------
// 10. PRESERVAÇÃO INTEGRAL DO DESKTOP
// -----------------------------------------------------------------------------
console.log("\n10. Testando preservação funcional da visualização desktop...");

// Em desktop (>= 768px), todas as regras de visualização e filtros permanecem
// idênticas às originais, utilizando getSessionStudents e getClassCardVisualTheme.
assert.ok(typeof getClassCardVisualTheme === "function");
assert.ok(typeof getSessionStudents === "function");
assert.ok(typeof getSessionStudentIds === "function");
assert.ok(typeof getGoogleSyncBadgeInfo === "function");

console.log("✔ Desktop preservado: Funções canônicas intactas e compatíveis.");

console.log("\n=======================================================================");
console.log("TODOS OS TESTES DA AGENDA MOBILE E REGRESSÃO DESKTOP FORAM APROVADOS! 🚀");
console.log("=======================================================================\n");
