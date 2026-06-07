// Excel export for the admin poll results drawer.
//
// Single sheet, organized vertically by question:
//   - Header rows: poll title + total response count
//   - For each question:
//       • Question text
//       • Options table (Option / Count / %) sorted by count desc, OR
//       • Text answers list (Voter / Response — Voter hidden when anonymous)
// Voters for non-anonymous multi/single questions are listed under each
// option as indented rows.

import type { PollResults } from "@/types/golf";

interface ExportInput {
  pollTitle: string;
  results: PollResults;
  isAnonymous: boolean;
}

export async function exportPollResultsToExcel({
  pollTitle,
  results,
  isAnonymous,
}: ExportInput) {
  const XLSX = await import("xlsx");

  const aoa: (string | number)[][] = [];
  aoa.push([pollTitle]);
  aoa.push([
    `${results.total_respondents} response${results.total_respondents === 1 ? "" : "s"}${isAnonymous ? " · anonymous" : ""}`,
  ]);
  aoa.push([]);

  for (const q of results.questions) {
    aoa.push([q.question_text]);

    if (q.options && q.options.length > 0) {
      aoa.push(["Option", "Count", "%"]);
      const sorted = [...q.options].sort((a, b) => b.count - a.count);
      for (const o of sorted) {
        const pct =
          results.total_respondents > 0
            ? Math.round((o.count / results.total_respondents) * 100)
            : 0;
        aoa.push([o.option_text, o.count, pct]);
        if (!isAnonymous && o.voters && o.voters.length > 0) {
          for (const v of o.voters) {
            // Indent voter under the option for readability.
            aoa.push(["  ↳ " + (v.display_name || "(unknown)")]);
          }
        }
      }
    }

    if (q.text_answers) {
      if (q.text_answers.length === 0) {
        aoa.push(["(no responses)"]);
      } else {
        aoa.push(isAnonymous ? ["Response"] : ["Voter", "Response"]);
        for (const a of q.text_answers) {
          aoa.push(
            isAnonymous
              ? [a.text]
              : [a.display_name || "(unknown)", a.text],
          );
        }
      }
    }

    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Reasonable column widths so things aren't squished on open.
  ws["!cols"] = [{ wch: 40 }, { wch: 10 }, { wch: 8 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Results");

  const safeName = pollTitle.replace(/[^a-z0-9-]+/gi, "_").substring(0, 50) || "poll";
  const date = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `poll-${safeName}-${date}.xlsx`);
}
