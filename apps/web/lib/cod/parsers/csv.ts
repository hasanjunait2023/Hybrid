// Minimal RFC-4180-ish CSV tokenizer (no dependency). Handles quoted fields,
// embedded commas/quotes ("" escape), and CRLF/LF line endings. Deliberately
// small — remittance CSVs are simple tabular exports, not arbitrary spreadsheets.
//
// Fail-closed posture (CLAUDE.md guardrail): a row whose column count does not
// match the header is reported as an error, never coerced or dropped silently.

export interface RawCsv {
  headers: string[];
  // Each record is header -> cell. Records with the wrong arity are excluded
  // from `records` and listed in `malformedRows` (1-based, header excluded).
  records: Record<string, string>[];
  malformedRows: { rowNumber: number; cols: number; expected: number }[];
}

// Tokenize one CSV file into a header row + value rows. Pure string work.
export function tokenizeCsv(input: string): { rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Strip a UTF-8 BOM if present (Excel exports add one).
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow — the following \n closes the row
    } else {
      field += ch;
    }
  }
  // Flush the trailing field/row if the file did not end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows };
}

// Parse into header-keyed records, reporting any row whose arity is wrong.
export function parseCsvRecords(input: string): RawCsv {
  const { rows } = tokenizeCsv(input);
  // Drop fully-empty trailing rows (blank lines).
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0]!.trim() === ""));
  if (nonEmpty.length === 0) {
    return { headers: [], records: [], malformedRows: [] };
  }
  const headers = (nonEmpty[0] ?? []).map((h) => h.trim());
  const records: Record<string, string>[] = [];
  const malformedRows: RawCsv["malformedRows"] = [];

  for (let i = 1; i < nonEmpty.length; i += 1) {
    const cells = nonEmpty[i]!;
    if (cells.length !== headers.length) {
      malformedRows.push({ rowNumber: i, cols: cells.length, expected: headers.length });
      continue;
    }
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = (cells[idx] ?? "").trim();
    });
    records.push(rec);
  }
  return { headers, records, malformedRows };
}
