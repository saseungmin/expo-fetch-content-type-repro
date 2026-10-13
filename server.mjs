import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";

const records = [];
const artifacts = new URL("./artifacts/", import.meta.url);
await mkdir(artifacts, { recursive: true });

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost:8787");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (request.method === "GET" && url.pathname === "/payload-without-type") {
    response.writeHead(200, { "Content-Length": "12" });
    response.end("test payload");
    return;
  }
  if (request.method === "GET" && url.pathname === "/results") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(records, null, 2));
    return;
  }
  if (!['PUT', 'POST'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const record = {
      time: new Date().toISOString(),
      method: request.method,
      implementation: url.searchParams.get("implementation"),
      test: url.searchParams.get("test"),
      expectedContentType: url.searchParams.get("expected"),
      receivedContentType: request.headers["content-type"] ?? null,
      bodyBytes: body.length,
      bodyText: body.toString("utf8"),
    };
    records.push(record);
    await writeFile(new URL("wire-results.json", artifacts), JSON.stringify(records, null, 2));
    console.log(JSON.stringify(record));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(record));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  }
});

server.listen(8787, "127.0.0.1", () => {
  console.log("Echo server: http://127.0.0.1:8787 (iOS loopback / Android adb reverse)");
});
