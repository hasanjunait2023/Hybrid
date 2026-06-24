// SteadfastCsvParser (blueprint S-COD-RECON / brief §2.6 step 2).
//
// !!! COLUMN NAMES ARE UNCONFIRMED !!!
// The header names below are a BEST GUESS from Phase-1 research. Steadfast's real
// remittance CSV header names have NOT been verified against a live merchant
// report (brief §2.6 "Live-deferred"; open decision #6 — founder must provide a
// scrubbed real report before this map is trusted). The parser is column-mapped
// precisely so a one-line map edit (not a code rewrite) fixes the real headers.
//
// Until then the default map is exported as SUSPECTED so the UI can flag it and
// the column-mapping preview lets the operator re-bind columns at upload time.
import type { ColumnMap, CsvParser, ParseResult, ParsedLine, ParseError } from "./types";
import { parseCsvRecords } from "./csv";

// Best-guess Steadfast headers — UNCONFIRMED. Override at upload if the real file
// differs (the parse-preview shows the actual headers for re-binding).
export const STEADFAST_DEFAULT_COLUMN_MAP: ColumnMap = {
  consignmentId: "Consignment ID",
  orderNumber: "Invoice",
  collectedAmount: "Collected Amount",
  netRemitted: "COD Amount",
};

// True while the headers above remain unverified against a real report. The UI
// reads this to show a "columns unconfirmed — verify against your CSV" warning.
export const STEADFAST_COLUMNS_CONFIRMED = false;

// Parse a money cell: strips ৳, commas, spaces; rejects non-numeric. Returns
// null for an empty cell (money state stays OWED), throws-as-error semantics are
// handled by the caller via the errors array.
function parseAmount(value: string | undefined): { value: number | null; bad: boolean } {
  if (value == null || value.trim() === "") return { value: null, bad: false };
  const cleaned = value.replace(/[৳,\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { value: null, bad: true };
  return { value: n, bad: false };
}

function normalizeId(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export class SteadfastCsvParser implements CsvParser {
  readonly provider = "steadfast";
  readonly defaultColumnMap = STEADFAST_DEFAULT_COLUMN_MAP;

  parse(csv: string, columnMap: ColumnMap = STEADFAST_DEFAULT_COLUMN_MAP): ParseResult {
    const { headers, records, malformedRows } = parseCsvRecords(csv);
    const lines: ParsedLine[] = [];
    const errors: ParseError[] = [];

    // Header-presence check: the consignmentId column is REQUIRED — without it
    // nothing can match. Fail the whole file fast with a clear column-named error.
    if (records.length > 0 && !headers.includes(columnMap.consignmentId)) {
      errors.push({
        rowNumber: 0,
        message: `প্রয়োজনীয় কলাম পাওয়া যায়নি: "${columnMap.consignmentId}"। CSV হেডার মিলিয়ে দেখুন।`,
      });
      return { lines, errors, headers };
    }

    // Malformed (wrong-arity) rows are reported, not dropped.
    for (const m of malformedRows) {
      errors.push({
        rowNumber: m.rowNumber,
        message: `লাইন ${m.rowNumber}: ${m.cols}টি কলাম, প্রত্যাশিত ${m.expected}টি।`,
      });
    }

    records.forEach((rec, idx) => {
      const rowNumber = idx + 1;
      const consignmentId = normalizeId(rec[columnMap.consignmentId]);
      const orderNumber = columnMap.orderNumber ? normalizeId(rec[columnMap.orderNumber]) : null;
      const collected = parseAmount(columnMap.collectedAmount ? rec[columnMap.collectedAmount] : undefined);
      const remitted = parseAmount(columnMap.netRemitted ? rec[columnMap.netRemitted] : undefined);

      if (collected.bad || remitted.bad) {
        errors.push({
          rowNumber,
          message: `লাইন ${rowNumber}: টাকার ঘর পড়া যায়নি (collected/remitted)।`,
        });
        return;
      }
      if (!consignmentId && !orderNumber) {
        errors.push({
          rowNumber,
          message: `লাইন ${rowNumber}: কনসাইনমেন্ট আইডি বা অর্ডার নম্বর নেই।`,
        });
        return;
      }

      lines.push({
        rowNumber,
        consignmentId,
        orderNumber,
        collectedAmount: collected.value,
        netRemitted: remitted.value,
        raw: rec,
      });
    });

    return { lines, errors, headers };
  }
}
