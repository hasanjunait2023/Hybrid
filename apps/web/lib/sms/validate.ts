// Unicode Bangla SMS validation (M3 / BTRC).
//
// Bangladeshi operators require Bengali SMS in Unicode (UCS-2), not romanized
// "Banglish". Unicode SMS also segments at 70 chars (not 160), so cost + length
// must be checked. This module classifies encoding, counts segments, and
// enforces a Bengali-content rule so a seller can't accidentally ship a
// transliterated Latin message in place of the Bengali template.
//
// Pure + dependency-free → unit-tested; called from the SMS send path and from
// template/campaign save so bad content is rejected before it costs money.

const BENGALI = /[ঀ-৿]/;
// GSM 03.38 basic + extended set. Anything outside it forces UCS-2 (Unicode).
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

export type SmsEncoding = "gsm7" | "unicode";

export function smsEncoding(text: string): SmsEncoding {
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch) || GSM7_EXT.includes(ch)) continue;
    return "unicode";
  }
  return "gsm7";
}

export interface SmsAnalysis {
  encoding: SmsEncoding;
  length: number;
  segments: number;
  hasBengali: boolean;
  hasLatinLetters: boolean;
}

export function analyzeSms(text: string): SmsAnalysis {
  const encoding = smsEncoding(text);
  // GSM-7 extended chars count as 2; UCS-2 surrogate pairs count as 2 units.
  let units = 0;
  for (const ch of text) {
    if (encoding === "gsm7") units += GSM7_EXT.includes(ch) ? 2 : 1;
    else units += ch.codePointAt(0)! > 0xffff ? 2 : 1;
  }
  const per = encoding === "gsm7" ? 160 : 70;
  const perMulti = encoding === "gsm7" ? 153 : 67;
  const segments = units === 0 ? 0 : units <= per ? 1 : Math.ceil(units / perMulti);
  return {
    encoding,
    length: units,
    segments,
    hasBengali: BENGALI.test(text),
    hasLatinLetters: /[A-Za-z]/.test(text),
  };
}

export type SmsValidationCode = "EMPTY" | "TOO_LONG" | "NOT_BENGALI";

export interface SmsValidationResult {
  ok: boolean;
  code?: SmsValidationCode;
  message?: string;
  analysis: SmsAnalysis;
}

export interface SmsValidationOptions {
  /** Max billable segments (cost guard). Default 4. */
  maxSegments?: number;
  /**
   * Require the content to contain Unicode Bengali. Set when sending a Bengali
   * template / customer-facing message so romanized "Banglish" (Latin only) is
   * rejected per BTRC. Brand tokens like bKash stay Latin, so we only reject
   * when there is NO Bengali at all and the text is clearly Latin prose.
   */
  requireBengali?: boolean;
}

export function validateSmsContent(
  text: string,
  options: SmsValidationOptions = {},
): SmsValidationResult {
  const maxSegments = options.maxSegments ?? 4;
  const analysis = analyzeSms(text);

  if (text.trim().length === 0) {
    return { ok: false, code: "EMPTY", message: "মেসেজ খালি রাখা যাবে না।", analysis };
  }
  if (analysis.segments > maxSegments) {
    return {
      ok: false,
      code: "TOO_LONG",
      message: `মেসেজ অনেক বড় (${analysis.segments} সেগমেন্ট, সর্বোচ্চ ${maxSegments})। ছোট করুন।`,
      analysis,
    };
  }
  if (options.requireBengali && !analysis.hasBengali && analysis.hasLatinLetters) {
    return {
      ok: false,
      code: "NOT_BENGALI",
      message:
        "মেসেজটি বাংলায় লিখুন (ইউনিকোড)। রোমান হরফে (Banglish) বাংলা SMS অপারেটর/BTRC নিয়মে গ্রহণযোগ্য নয়।",
      analysis,
    };
  }
  return { ok: true, analysis };
}
