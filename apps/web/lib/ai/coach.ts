import "server-only";

// AI Growth Coach — natural-language assistant seam (Phase R2.3). A
// credential-gated adapter, exactly like the bKash / Steadfast / SMS / fraud
// integrations in this codebase: when no key is configured it reports
// { configured: false } and the UI falls back to the deterministic health score
// + recommendations (lib/admin/healthScore) — never a fabricated answer.
//
// When AI_COACH_API_KEY is set it calls an OpenAI-compatible chat-completions
// endpoint (AI_COACH_API_URL, default OpenAI) with a Bengali system prompt and
// the seller's own health context, so the answer is grounded in real numbers.

export interface CoachContext {
  score: number;
  grade: string;
  /** compact factor list: "momentum:82, repeat:40, cod:91, ..." */
  factors: string;
  /** the store's currency-formatted week-over-week, etc., as plain strings. */
  highlights: string[];
}

export interface CoachReply {
  configured: boolean;
  answer?: string;
  error?: string;
}

const SYSTEM_PROMPT =
  "তুমি 'Hybrid' — বাংলাদেশের ছোট ই-কমার্স/F-commerce বিক্রেতাদের জন্য একজন ব্যবসায়িক গ্রোথ কোচ। " +
  "সবসময় সহজ, বন্ধুত্বপূর্ণ বাংলায় উত্তর দাও। বিক্রেতার দেওয়া বাস্তব পরিসংখ্যানের ভিত্তিতে সংক্ষিপ্ত, " +
  "প্রয়োগযোগ্য পরামর্শ দাও (২-৪টি বুলেট)। সংখ্যা বানিয়ে বলো না — শুধু যা দেওয়া হয়েছে তা ব্যবহার করো।";

export async function askGrowthCoach(
  question: string,
  context: CoachContext,
): Promise<CoachReply> {
  const apiKey = process.env.AI_COACH_API_KEY;
  if (!apiKey) return { configured: false };

  const url = process.env.AI_COACH_API_URL ?? "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_COACH_MODEL ?? "gpt-4o-mini";
  const q = question.trim().slice(0, 1000);
  if (!q) return { configured: true, error: "empty" };

  const contextBlock = [
    `Business health score: ${context.score}/100 (grade ${context.grade}).`,
    `Factors: ${context.factors}.`,
    ...context.highlights,
  ].join("\n");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `${contextBlock}\n\nপ্রশ্ন: ${q}` },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { configured: true, error: `http_${res.status}` };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) return { configured: true, error: "empty_response" };
    return { configured: true, answer };
  } catch {
    return { configured: true, error: "network" };
  }
}
