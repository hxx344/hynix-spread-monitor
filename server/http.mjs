import { timingSafeEqual } from "node:crypto";

function equal(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
const json = (response, status, value) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
};
async function body(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 64 * 1024) throw new Error("请求内容过大。");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("请求必须是有效 JSON。"); }
}

export function createHandler({ service, username, password, nextHandler }) {
  const credential = Buffer.from(`${username}:${password}`).toString("base64");
  return async (request, response) => {
    try {
      const path = new URL(request.url, "http://localhost").pathname;
      if (path === "/healthz" && request.method === "GET") return json(response, 200, { status: "ok" });
      if (!equal(request.headers.authorization ?? "", `Basic ${credential}`)) {
        response.writeHead(401, { "WWW-Authenticate": 'Basic realm="Hynix Spread", charset="UTF-8"', "Cache-Control": "no-store" });
        response.end("Authentication required");
        return;
      }
      if (path === "/api/quote" && request.method === "GET") {
        try { return json(response, 200, await service.quote()); }
        catch { return json(response, 503, { error: "实时行情暂不可用" }); }
      }
      if (path === "/api/alerts" || path === "/api/alerts/test") {
        if (path === "/api/alerts" && request.method === "GET") return json(response, 200, service.view());
        const expected = path.endsWith("/test") ? "POST" : "PUT";
        if (request.method !== expected) return json(response, 405, { error: "不支持此请求方法。" });
        const origin = request.headers.origin;
        if (request.headers["sec-fetch-site"] === "cross-site" || (origin && new URL(origin).host !== request.headers.host)) return json(response, 403, { error: "不接受跨站配置请求。" });
        if (!request.headers["content-type"]?.startsWith("application/json")) return json(response, 415, { error: "请使用 JSON 请求。" });
        const input = await body(request);
        try {
          const result = path.endsWith("/test") ? await service.test() : await service.update(input);
          return json(response, 200, result);
        } catch (error) { return json(response, path.endsWith("/test") ? 502 : 400, { error: error.message }); }
      }
      await nextHandler(request, response);
    } catch {
      if (!response.headersSent) json(response, 400, { error: "无法处理请求，请检查输入后重试。" });
      else response.end();
    }
  };
}
