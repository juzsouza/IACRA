import assert from "node:assert";
import {
  getDynamicCurrentCompetence,
  getNextCompetence,
  classifyDashboardMonthPeriod,
  buildDashboardMonthsRange,
  getDefaultDashboardPeriodRange,
} from "../components/SchoolGrowthChart";

function runTests() {
  console.log("=== Running Dashboard Period Classification & Range Tests ===");

  // 1. Dynamic current month and next month detection for September 2026
  const sepDate = new Date("2026-09-29T12:00:00Z");
  const sepNow = getDynamicCurrentCompetence(sepDate);
  assert.strictEqual(sepNow.key, "2026-09");
  assert.strictEqual(sepNow.year, 2026);
  assert.strictEqual(sepNow.monthIdx, 8);
  assert.strictEqual(sepNow.monthLabel, "Set/26");
  assert.strictEqual(sepNow.monthName, "Setembro de 2026");

  const nextAfterSep = getNextCompetence(sepDate);
  assert.strictEqual(nextAfterSep.key, "2026-10");
  assert.strictEqual(nextAfterSep.year, 2026);
  assert.strictEqual(nextAfterSep.monthIdx, 9);
  assert.strictEqual(nextAfterSep.monthLabel, "Out/26");
  assert.strictEqual(nextAfterSep.monthName, "Outubro de 2026");

  // 2. Verify default period range in September 2026 includes Jun/26 through Out/26 (Proj.)
  const sepRange = getDefaultDashboardPeriodRange(sepDate);
  assert.strictEqual(sepRange.startMonthKey, "2026-06");
  assert.strictEqual(sepRange.endMonthKey, "2026-10");
  assert.strictEqual(sepRange.months.length, 5);

  assert.deepStrictEqual(
    sepRange.months.map((m) => m.monthLabel),
    ["Jun/26", "Jul/26", "Ago/26", "Set/26", "Out/26 (Proj.)"]
  );
  assert.deepStrictEqual(
    sepRange.months.map((m) => m.monthName),
    [
      "Junho de 2026",
      "Julho de 2026",
      "Agosto de 2026",
      "Setembro de 2026",
      "Outubro de 2026",
    ]
  );

  const [jun26, jul26, ago26, set26, out26] = sepRange.months;

  // Junho/2026 = Realizado
  assert.strictEqual(jun26.type, "realized");
  assert.strictEqual(jun26.statusLabel, "Realizado");
  assert.strictEqual(jun26.isProjected, false);
  assert.strictEqual(jun26.isCurrentMonth, false);
  assert.strictEqual(jun26.monthLabel, "Jun/26");

  // Julho/2026 = Realizado
  assert.strictEqual(jul26.type, "realized");
  assert.strictEqual(jul26.statusLabel, "Realizado");
  assert.strictEqual(jul26.isProjected, false);
  assert.strictEqual(jul26.isCurrentMonth, false);
  assert.strictEqual(jul26.monthLabel, "Jul/26");

  // Agosto/2026 = Realizado
  assert.strictEqual(ago26.type, "realized");
  assert.strictEqual(ago26.statusLabel, "Realizado");
  assert.strictEqual(ago26.isProjected, false);
  assert.strictEqual(ago26.isCurrentMonth, false);
  assert.strictEqual(ago26.monthLabel, "Ago/26");

  // Setembro/2026 = Realizado / Atual (NÃO Projetado, SEM "(Proj.)")
  assert.strictEqual(set26.type, "realized");
  assert.strictEqual(set26.statusLabel, "Realizado");
  assert.strictEqual(set26.isProjected, false);
  assert.strictEqual(set26.isCurrentMonth, true);
  assert.strictEqual(set26.monthLabel, "Set/26");
  assert.ok(!set26.monthLabel.includes("(Proj.)"));

  // Outubro/2026 = Projetado (projeção começa no mês seguinte ao atual e está incluída no range padrão)
  assert.strictEqual(out26.type, "projected");
  assert.strictEqual(out26.statusLabel, "Projetado");
  assert.strictEqual(out26.isProjected, true);
  assert.strictEqual(out26.isCurrentMonth, false);
  assert.strictEqual(out26.monthLabel, "Out/26 (Proj.)");

  // 3. Dynamic rollover test: when calendar reaches October 2026 (2026-10) -> includes November 2026 (2026-11)
  const octRange = getDefaultDashboardPeriodRange(new Date("2026-10-15T12:00:00Z"));
  assert.strictEqual(octRange.currentCompetence.key, "2026-10");
  assert.strictEqual(octRange.endMonthKey, "2026-11");
  assert.deepStrictEqual(
    octRange.months.map((m) => m.monthLabel),
    ["Jun/26", "Jul/26", "Ago/26", "Set/26", "Out/26", "Nov/26 (Proj.)"]
  );

  // 4. Dynamic rollover test: when calendar reaches November 2026 (2026-11) -> includes December 2026 (2026-12)
  const novRange = getDefaultDashboardPeriodRange(new Date("2026-11-10T12:00:00Z"));
  assert.strictEqual(novRange.currentCompetence.key, "2026-11");
  assert.strictEqual(novRange.endMonthKey, "2026-12");
  assert.deepStrictEqual(
    novRange.months.map((m) => m.monthLabel),
    ["Jun/26", "Jul/26", "Ago/26", "Set/26", "Out/26", "Nov/26", "Dez/26 (Proj.)"]
  );

  // 5. Dynamic year-boundary rollover test: when calendar reaches December 2026 (2026-12) -> includes January 2027 (2027-01)
  const decRange = getDefaultDashboardPeriodRange(new Date("2026-12-10T12:00:00Z"));
  assert.strictEqual(decRange.currentCompetence.key, "2026-12");
  assert.strictEqual(decRange.endMonthKey, "2027-01");
  const lastTwoInDec = decRange.months.slice(-2);
  assert.strictEqual(lastTwoInDec[0].monthLabel, "Dez/26");
  assert.strictEqual(lastTwoInDec[0].isCurrentMonth, true);
  assert.strictEqual(lastTwoInDec[0].isProjected, false);
  assert.strictEqual(lastTwoInDec[1].monthLabel, "Jan/27 (Proj.)");
  assert.strictEqual(lastTwoInDec[1].isCurrentMonth, false);
  assert.strictEqual(lastTwoInDec[1].isProjected, true);

  // 6. Verify buildDashboardMonthsRange directly
  const customMonths = buildDashboardMonthsRange("2026-08", "2026-10", "2026-09");
  assert.strictEqual(customMonths.length, 3);
  assert.strictEqual(customMonths[0].statusLabel, "Realizado");
  assert.strictEqual(customMonths[1].statusLabel, "Realizado");
  assert.strictEqual(customMonths[1].isCurrentMonth, true);
  assert.strictEqual(customMonths[2].statusLabel, "Projetado");
  assert.strictEqual(customMonths[2].isProjected, true);

  console.log("ALL DASHBOARD PERIOD CLASSIFICATION & RANGE TESTS PASSED!");
}

runTests();
