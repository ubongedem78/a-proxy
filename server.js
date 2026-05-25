const https = require("https");
const http = require("http");

const USER = process.env.API_USER;
const PASS = process.env.API_PASS;
const PORT = process.env.PORT;
const HOST = "api.ci.spglobal.com";

console.log("AUTH TEST:", Buffer.from(`${USER}:${PASS}`).toString("base64"));
const BASIC = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

const TICKER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>NNPC Live Prices</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#111827;--divider:rgba(255,255,255,0.07);
  --text:#e8edf5;--muted:#6b7a99;--label:#94a3c8;
  --up:#22c55e;--down:#f43f5e;--neutral:#94a3c8;
  --font:'Inter','Segoe UI',system-ui,Arial,sans-serif;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--font);overflow:hidden}
#strip{width:100%;height:100%;overflow:hidden;position:relative;display:flex;align-items:center}
#strip::before,#strip::after{content:'';position:absolute;top:0;bottom:0;width:48px;z-index:2;pointer-events:none}
#strip::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
#strip::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
#track{display:flex;align-items:center;white-space:nowrap;will-change:transform}
@keyframes scroll{from{transform:translateX(0)}to{transform:translateX(var(--dist,-50%))}}
#strip:hover #track{animation-play-state:paused}
.card{display:inline-flex;align-items:center;gap:10px;padding:0 22px;height:100%;border-right:1px solid var(--divider);cursor:default}
.card:hover{background:rgba(255,255,255,0.03)}
.name{font-size:.72rem;font-weight:600;color:var(--label);letter-spacing:.03em}
.price{font-size:.95rem;font-weight:700;color:var(--text);letter-spacing:-.01em}
.unit{font-size:.62rem;color:var(--muted)}
.chg{font-size:.73rem;font-weight:600}
.chg.up{color:var(--up)}.chg.down{color:var(--down)}.chg.flat{color:var(--neutral)}
.sk{display:inline-flex;align-items:center;gap:8px;padding:0 22px;height:100%;border-right:1px solid var(--divider)}
.sk-line{border-radius:3px;background:linear-gradient(90deg,#1a2235 25%,#232f47 50%,#1a2235 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
#err{display:none;position:absolute;inset:0;align-items:center;justify-content:center;font-size:.72rem;color:#f87171}
#err.show{display:flex}
</style>
</head>
<body>
<div id="strip">
  <div id="track"></div>
  <div id="err">&#9888; Unable to load prices</div>
</div>
<script>
const REFRESH_MS = 15 * 60 * 1000;
const COMMODITIES = [
  {symbol:"PCAAS00",name:"Dated Brent",unit:"$/bbl"},
  {symbol:"PCACG00",name:"WTI Cushing",unit:"$/bbl"},
  {symbol:"AAEUQ00",name:"OPEC Basket",unit:"$/bbl"},
  {symbol:"AWAFA00",name:"WAF Index",unit:"$/bbl"},
  {symbol:"PCAAT00",name:"Dubai Mo01",unit:"$/bbl"},
  {symbol:"AAQZB00",name:"Agbami FOB",unit:"$/bbl"},
  {symbol:"PCNGA00",name:"Akpo FOB",unit:"$/bbl"},
  {symbol:"PCAIC00",name:"Bonny Light FOB",unit:"$/bbl"},
  {symbol:"PCNGC00",name:"Bonga FOB",unit:"$/bbl"},
  {symbol:"AFONA00",name:"Egina FOB",unit:"$/bbl"},
  {symbol:"AAEIZ00",name:"Escravos FOB",unit:"$/bbl"},
  {symbol:"AAXUO00",name:"Erha FOB",unit:"$/bbl"},
  {symbol:"PCABC00",name:"Forcados FOB",unit:"$/bbl"},
  {symbol:"PCAID00",name:"Qua Iboe FOB",unit:"$/bbl"},
  {symbol:"AAXUQ00",name:"Usan FOB",unit:"$/bbl"},
  {symbol:"NMNG001",name:"NYMEX Nat Gas",unit:"$/MMBtu"},
  {symbol:"DTMSC01",name:"Dutch TTF",unit:"$/MMBtu"},
  {symbol:"AAOVQ00",name:"LNG Japan/Korea",unit:"$/MMBtu"},
  {symbol:"AASYR00",name:"NBP London",unit:"$/MMBtu"},
];
const SYMBOLS = COMMODITIES.map(c => c.symbol);

async function apiFetch(path) {
  const res = await fetch(path, {headers:{Accept:"application/json"}});
  const json = await res.json().catch(() => { throw new Error("Non-JSON ("+res.status+")"); });
  if (!res.ok) throw new Error("API "+res.status+": "+(json.error||JSON.stringify(json)));
  return json;
}
function symFilter(extra) {
  const base = "symbol IN ("+SYMBOLS.map(s=>'"'+s+'"').join(",")+")";
  return encodeURIComponent(extra ? base+" AND "+extra : base);
}
function isoDate(d) { return d.toISOString().slice(0,10); }
function fetchCurrent() {
  return apiFetch("/market-data/v3/value/current/symbol?filter="+symFilter());
}
function fetchHistory() {
  const to   = isoDate(new Date());
  const from = isoDate(new Date(Date.now() - 14*864e5));
  const extra = 'assessDate>="'+from+'" AND assessDate<="'+to+'" AND bate=="c"';
  return apiFetch("/market-data/v3/value/history/symbol?filter="+symFilter(extra)+"&page_size=2000");
}
function parseCurrent(p) {
  const map = {};
  for (const row of p?.results||[]) {
    const e = (row.data||[]).find(x=>x.bate?.toLowerCase()==="c") || row.data?.[0];
    if (e) { const v=parseFloat(e.value); if(!isNaN(v)&&v>0) map[row.symbol]={value:v,date:e.assessDate?.slice(0,10)}; }
  }
  return map;
}
function parseHistory(p) {
  const map = {};
  for (const row of p?.results||[]) {
    const closes = (row.data||[])
      .filter(x=>x.bate?.toLowerCase()==="c"&&x.assessDate)
      .map(x=>({date:x.assessDate.slice(0,10),val:parseFloat(x.value)}))
      .filter(x=>!isNaN(x.val)&&x.val>0)
      .sort((a,b)=>a.date<b.date?-1:1);
    if (closes.length) map[row.symbol]=closes;
  }
  return map;
}
function buildItems(curMap, histMap) {
  return COMMODITIES.map(c => {
    const cur  = curMap[c.symbol]??null;
    const hist = histMap[c.symbol]||[];
    let price=null, prev=null;
    if (cur) {
      price = cur.value;
      const last = hist[hist.length-1];
      prev = (last && last.date===cur.date) ? (hist[hist.length-2]?.val??null) : (last?.val??null);
    } else if (hist.length>=2) { price=hist[hist.length-1].val; prev=hist[hist.length-2].val; }
    else if (hist.length===1)  { price=hist[0].val; }
    const pct = (price&&prev&&prev!==0) ? ((price-prev)/prev)*100 : null;
    return {...c, price, pct};
  });
}
function fmt(v) {
  return (v==null||isNaN(v)) ? "—" : v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:3});
}
const track = document.getElementById("track");
const errEl = document.getElementById("err");
function makeCard(item) {
  const card  = document.createElement("div"); card.className="card"; card.title=item.name+" ("+item.symbol+")";
  const name  = document.createElement("span"); name.className="name";  name.textContent=item.name;
  const price = document.createElement("span"); price.className="price"; price.textContent=fmt(item.price);
  const unit  = document.createElement("span"); unit.className="unit";  unit.textContent=item.unit;
  const chg   = document.createElement("span"); chg.className="chg";
  if (item.price===null) { chg.classList.add("flat"); chg.textContent="N/A"; }
  else if (item.pct!=null) {
    const flat=Math.abs(item.pct)<0.005, up=item.pct>0;
    chg.classList.add(flat?"flat":up?"up":"down");
    chg.textContent = flat?"▸ 0.00%":(up?"▲ ":"▼ ")+Math.abs(item.pct).toFixed(2)+"%";
  } else { chg.classList.add("flat"); chg.textContent="—"; }
  card.append(name,price,unit,chg);
  return card;
}
function skeleton() {
  track.innerHTML=""; track.style.animation="none";
  for (let i=0;i<COMMODITIES.length*2;i++) {
    const s=document.createElement("div"); s.className="sk";
    s.innerHTML='<div class="sk-line" style="height:10px;width:80px"></div><div class="sk-line" style="height:15px;width:110px"></div>';
    track.appendChild(s);
  }
}
function render(items) {
  track.innerHTML=""; track.style.animation="none"; errEl.classList.remove("show");
  const frag=document.createDocumentFragment();
  for (let p=0;p<2;p++) for (const item of items) frag.appendChild(makeCard(item));
  track.appendChild(frag);
  requestAnimationFrame(()=>{
    const half=track.scrollWidth/2;
    track.style.setProperty("--dist","-"+half+"px");
    track.style.animation="scroll "+(half/55).toFixed(1)+"s linear infinite";
  });
}
let _timer=null;
async function refresh() {
  clearTimeout(_timer);
  try {
    const [cur,hist] = await Promise.all([fetchCurrent(),fetchHistory()]);
    render(buildItems(parseCurrent(cur),parseHistory(hist)));
  } catch(err) {
    console.error("[ticker]",err);
    errEl.classList.add("show");
    track.innerHTML=""; track.style.animation="none";
  }
  _timer=setTimeout(refresh,REFRESH_MS);
}
skeleton(); refresh();
</script>
</body>
</html>`;

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST,
        path,
        method: "GET",
        headers: { Authorization: BASIC, Accept: "application/json" },
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

  if (req.url === "/" || req.url === "/ticker") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
    });
    return res.end(TICKER_HTML);
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
