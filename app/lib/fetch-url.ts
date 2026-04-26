const MAX_BYTES = 1_500_000; // ~1.5MB raw limit
const MAX_TEXT_CHARS = 20_000;
const TIMEOUT_MS = 15_000;

export type FetchedUrl = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  title: string | null;
  text: string;
  truncated: boolean;
};

function isPublicHttp(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "0.0.0.0") return false;
  // block IPv4 private / loopback / link-local / meta
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  // block obvious IPv6 local
  if (host.startsWith("::") || host.includes("fc00:") || host.includes("fe80:"))
    return false;
  return true;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function htmlToText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(cleaned)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
  return { title, text };
}

export async function fetchUrl(rawUrl: string): Promise<FetchedUrl> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("유효한 URL이 아닙니다.");
  }
  if (!isPublicHttp(parsed)) {
    throw new Error("차단된 주소입니다 (내부/사설 IP는 읽을 수 없어요).");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "mint-bot/1.0 (+https://mint.local) Claude-Code-User-Agent",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : "fetch 실패";
    throw new Error(`요청 실패: ${msg}`);
  }
  clearTimeout(timeout);

  const contentType = res.headers.get("content-type") ?? "";
  const reader = res.body?.getReader();
  if (!reader) throw new Error("응답 본문이 비어 있습니다.");

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let raw = "";
  let truncated = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    raw += decoder.decode(value, { stream: true });
    if (received > MAX_BYTES) {
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
  }
  raw += decoder.decode();

  let title: string | null = null;
  let text = raw;
  if (contentType.includes("html") || /<html[\s>]/i.test(raw)) {
    const parsedHtml = htmlToText(raw);
    title = parsedHtml.title;
    text = parsedHtml.text;
  }

  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
    truncated = true;
  }

  return {
    url: rawUrl,
    finalUrl: res.url,
    status: res.status,
    contentType,
    title,
    text,
    truncated,
  };
}
