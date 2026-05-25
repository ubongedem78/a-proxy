const https = require("https");
const http = require("http");

const USER = process.env.SP_USER;
const PASS = process.env.SP_PASS;
const PORT = process.env.PORT;
const HOST = "api.ci.spglobal.com";
console.log("AUTH TEST:", Buffer.from(`${USER}:${PASS}`).toString("base64"));
const BASIC = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST,
        path,
        method: "GET",
        headers: {
          Authorization: BASIC,
          Accept: "application/json",
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(buf) });
          } catch (_) {
            resolve({ status: res.statusCode, body: buf });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

const server = http.createServer(async (req, res) => {
  setCORS(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.url === "/debug") {
    const today = new Date().toISOString().slice(0, 10);
    const twoWeeksAgo = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      return d.toISOString().slice(0, 10);
    })();

    const currentFilter = encodeURIComponent('symbol IN ("PCAAS00","DTMSC01")');
    const historyFilter = encodeURIComponent(
      `symbol IN ("PCAAS00") AND assessDate >= "${twoWeeksAgo}" AND assessDate <= "${today}" AND bate == "c"`,
    );

    try {
      const [cur, hist] = await Promise.all([
        apiGet(`/market-data/v3/value/current/symbol?filter=${currentFilter}`),
        apiGet(`/market-data/v3/value/history/symbol?filter=${historyFilter}`),
      ]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          {
            host: HOST,
            current: { status: cur.status, body: cur.body },
            history: { status: hist.status, body: hist.body },
          },
          null,
          2,
        ),
      );
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (!req.url.startsWith("/market-data/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        error: "Not found. Valid paths: /market-data/*, /debug",
      }),
    );
  }

  try {
    const result = await apiGet(req.url);
    res.writeHead(result.status, { "Content-Type": "application/json" });
    res.end(
      typeof result.body === "string"
        ? result.body
        : JSON.stringify(result.body),
    );
    console.log(`[proxy] ${req.url.slice(0, 90)} → ${result.status}`);
  } catch (err) {
    console.error("[proxy] error:", err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🟢  NNPC Ticker Proxy  →  http://localhost:${PORT}`);
  console.log(`    Host:  ${HOST}`);
  console.log(`    User:  ${USER}`);
  console.log(`    Debug: http://localhost:${PORT}/debug`);
  console.log(`    Started: ${new Date().toLocaleString()}\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n❌  Port ${PORT} already in use — close the other process and retry.\n`,
    );
  } else {
    console.error("[proxy] server error:", err);
  }
  process.exit(1);
});
