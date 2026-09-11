import { createServer } from "node:http";
import { resolve } from "node:path";
import next from "next";
import { openStore } from "./alert-store.mjs";
import { createAlertService } from "./alert-service.mjs";
import { createHandler } from "./http.mjs";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
const username = process.env.APP_USERNAME ?? "admin";
const password = process.env.APP_PASSWORD ?? "";
if (!password || password.length < 12 || username.includes(":")) throw new Error("请设置 APP_PASSWORD（至少 12 个字符）；APP_USERNAME 不能包含冒号。");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须是 1–65535 的端口号。");
const directory = resolve(process.env.ALERT_DATA_DIR ?? "./runtime-data");
const store = await openStore(directory);
const service = createAlertService(store);
const app = next({ dev: false, hostname: host, port });
await app.prepare();
const server = createServer(createHandler({ service, username, password, nextHandler: app.getRequestHandler() }));
server.requestTimeout = 30_000;
await new Promise((accept, reject) => { server.once("error", reject); server.listen(port, host, accept); });
service.start();
console.log(`Hynix Spread is listening on http://${host}:${port}; alert monitor checks every 10 seconds.`);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const closed = new Promise(accept => server.close(accept));
  await service.stop();
  await closed;
  await app.close();
  process.exit(0);
}
process.on("SIGTERM", () => { void shutdown(); });
process.on("SIGINT", () => { void shutdown(); });
