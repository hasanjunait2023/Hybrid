// CSV remittance parser contract (blueprint S-COD-RECON / brief §2.6 step 2).
//
// One parsed line == one consignment the courier reports on. The matcher keys on
// consignmentId (fallback orderNumber). collected/remitted are what the courier
// SAYS it collected / paid out — never assumed, never fabricated; if a column is
// absent the value is null and the matcher leaves that money state OWED.
//
// IMPORTANT — column names are UNCONFIRMED. The real Steadfast remittance CSV
// header names have NOT been verified against a live merchant report (brief §2.6
// "Live-deferred", open decision #6). The parser is therefore COLUMN-MAPPED: the
// caller supplies a ColumnMap binding our logical fields to the actual headers in
// the uploaded file. The SteadfastCsvParser ships a best-guess default map that
// MUST be reviewed against a real report before it is trusted in production.

export interface ParsedLine {
  // The line number in the source CSV (1-based, excluding header) — for
  // surfacing which rows failed or went unmatched.
  rowNumber: number;
  consignmentId: string | null;
  orderNumber: string | null;
  collectedAmount: number | null; // courier reports collected at delivery
  netRemitted: number | null; // amount actually paid out to the merchant
  // The raw cell values, kept for audit + the parse-preview UI.
  raw: Record<string, string>;
}

export interface ParseError {
  rowNumber: number;
  message: string; // human-readable, names the offending column/value
}

export interface ParseResult {
  lines: ParsedLine[];
  errors: ParseError[]; // malformed rows — REPORTED, never silently dropped
  // The header row as parsed, so the UI can show a column-mapping preview.
  headers: string[];
}

// Binds our logical fields to the literal CSV header names. Every courier (and
// possibly every account) may differ; this is the seam that keeps us from
// hardcoding guessed headers as if confirmed.
export interface ColumnMap {
  consignmentId: string;
  orderNumber?: string;
  collectedAmount?: string;
  netRemitted?: string;
}

export interface CsvParser {
  readonly provider: string;
  // The default column map for this courier. FLAGGED as unconfirmed until a real
  // report is supplied; the caller may override it.
  readonly defaultColumnMap: ColumnMap;
  parse(csv: string, columnMap?: ColumnMap): ParseResult;
}
