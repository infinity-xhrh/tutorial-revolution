/** Public endpoint only. API credentials and the shared budget stay on this server. */
export const DEFAULT_API_URL = "https://stellaris-mod-academy-hua.cheeky-cup-6627.chatgpt.site";
export const MAX_MESSAGE_BYTES = 8192;
export const MAX_REQUEST_BYTES = 40_000;

/** @typedef {{ role: 'user' | 'assistant', content: string, localOnly?: boolean }} Message */
/** @param {string} text */
export const utf8Bytes = (text) => new TextEncoder().encode(text).length;

/** Undefined uses the shared service; an explicitly empty value disables it.
 * @param {string | undefined} value
 */
export function resolveApiUrl(value) {
    if (value === undefined) return DEFAULT_API_URL;
    if (!value.trim()) return "";
    const url = new URL(value.trim());
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        throw new Error("PUBLIC_TUTORIAL_ASSISTANT_API_URL 必须是 HTTPS 网站地址；本地开发可使用 HTTP localhost。不能包含路径、凭据或查询参数。");
    }
    return url.origin;
}

/** Same bounds as the shared service: six messages, 24,000 UTF-8 bytes total.
 * @param {Message[]} messages
 * @returns {Message[]}
 */
export function boundedHistory(messages) {
    const result = [];
    let bytes = 0;
    for (const item of messages.slice().reverse()) {
        if (item.localOnly) continue;
        const size = utf8Bytes(item.content);
        if (size > MAX_MESSAGE_BYTES) continue;
        if (result.length >= 6 || bytes + size > 24_000) break;
        result.unshift({ role: item.role, content: item.content });
        bytes += size;
    }
    return result;
}

/** Check the actual serialized size too: escaping control characters adds bytes.
 * @param {string} message
 * @param {Message[]} history
 */
export function prepareRequest(message, history) {
    const text = message.trim();
    if (!text) throw new Error("请先输入你的问题。");
    if (utf8Bytes(text) > MAX_MESSAGE_BYTES) throw new Error("问题超过 8192 UTF-8 字节，请缩短内容或只保留相关代码。");
    const kept = boundedHistory(history);
    let body = JSON.stringify({ message: text, history: kept, lessonId: "home" });
    while (utf8Bytes(body) > MAX_REQUEST_BYTES && kept.length) {
        kept.shift();
        body = JSON.stringify({ message: text, history: kept, lessonId: "home" });
    }
    if (utf8Bytes(body) > MAX_REQUEST_BYTES) throw new Error("问题编码后过长，请缩短内容。");
    return body;
}

/** Source destinations always stay on the original tutorial site.
 * @param {unknown} lesson
 */
export function sourceHref(lesson) {
    const route = typeof lesson === "string" && /^[\p{L}\p{N}_-]{1,200}$/u.test(lesson) ? lesson : "knowledge";
    return `${DEFAULT_API_URL}/#/${encodeURIComponent(route)}`;
}

/** @param {unknown} value */
export function parseReply(value) {
    if (!value || typeof value !== "object" || !("content" in value) || typeof value.content !== "string" || !value.content.trim()) {
        throw new Error("服务返回了无法识别的答案。本页不会自动重新调用，请稍后检查服务状态。");
    }
    const rawSources = "sources" in value && Array.isArray(value.sources) ? value.sources : [];
    const sources = rawSources.slice(0, 8).flatMap((source) => {
        if (!source || typeof source !== "object" || typeof source.id !== "string" || typeof source.title !== "string") return [];
        return [{ id: source.id.slice(0, 200), title: source.title.slice(0, 300), href: sourceHref(source.relatedLesson) }];
    });
    return { content: value.content, sources };
}

/** @param {unknown} value */
export function errorMessage(value) {
    return value && typeof value === "object" && "message" in value && typeof value.message === "string"
        ? value.message.slice(0, 1000)
        : "问答暂不可用。本页不会自动重试，教程仍可阅读。";
}
