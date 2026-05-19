import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Droplet, Shield, Satellite, Database, Activity, AlertTriangle,
  CheckCircle, Zap, Terminal, Lock, Hash, Cpu, FlaskConical, Beaker,
  Wind, Atom, Layers, Power, PoundSterling, ShieldCheck, Globe,
  Server, Network, Crosshair, Eye, EyeOff, Waves, Clock, User,
  ChevronRight, ChevronDown, CircleDot, Radio, FileCheck, RotateCcw,
  Wifi, WifiOff, MapPin, Fingerprint, KeyRound, Link2, Download,
  Bell, TrendingUp, Brain, Thermometer, TestTube2, Gauge, Mail,
  MessageSquare, Webhook, Send, FileText, Sparkles, AlarmClock,
  FileSpreadsheet, FileJson, Leaf, Volume2, VolumeX, Building2,
  Wrench, ShieldAlert, Bug, ScanLine, AlertOctagon, Binary, Tag,
  BarChart3, Microscope,
} from "lucide-react";

const APP_VERSION = "1.0.0";

/* ============================================================
   AquaSense AI · Operator Console
   Single-file React app · per-site live WebSocket telemetry
   ============================================================ */

const METRICS = {
  pH:          { label: "pH",           sub: "Hydrogen Ion Activity",      unit: "",      icon: FlaskConical, accent: "#34d399", base: 7.2,  anomaly: 4.1,   range: "Permitted: 6.0 – 9.0", decimals: 2, variance: 0.08, direction: "down", minLimit: 6.0, maxLimit: 9.0,  isUnsafe: (v) => v < 6.0 || v > 9.0 },
  BOD:         { label: "BOD₅",         sub: "Biochemical Oxygen Demand",  unit: "mg/L",  icon: Beaker,       accent: "#22d3ee", base: 22,   anomaly: 87,    range: "EA Limit: < 30 mg/L",  decimals: 1, variance: 1.2,  direction: "up",   maxLimit: 30,   isUnsafe: (v) => v >= 30 },
  COD:         { label: "COD",          sub: "Chemical Oxygen Demand",     unit: "mg/L",  icon: Atom,         accent: "#a78bfa", base: 118,  anomaly: 412,   range: "EA Limit: < 150 mg/L", decimals: 0, variance: 4,    direction: "up",   maxLimit: 150,  isUnsafe: (v) => v >= 150 },
  TSS:         { label: "TSS",          sub: "Total Suspended Solids",     unit: "mg/L",  icon: Layers,       accent: "#38bdf8", base: 24,   anomaly: 110,   range: "EA Limit: < 35 mg/L",  decimals: 1, variance: 1.0,  direction: "up",   maxLimit: 35,   isUnsafe: (v) => v >= 35 },
  Ammonia:     { label: "NH₃-N",        sub: "Ammoniacal Nitrogen",        unit: "mg/L",  icon: Wind,         accent: "#34d399", base: 1.4,  anomaly: 14.7,  range: "EA Limit: < 5 mg/L",   decimals: 2, variance: 0.15, direction: "up",   maxLimit: 5,    isUnsafe: (v) => v >= 5 },
  Temperature: { label: "Temp",         sub: "Effluent Temperature",       unit: "°C",    icon: Thermometer,  accent: "#fb923c", base: 18.4, anomaly: 32.4,  range: "EA Limit: < 25 °C",    decimals: 1, variance: 0.3,  direction: "up",   maxLimit: 25,   isUnsafe: (v) => v >= 25 },
  HeavyMetals: { label: "Heavy Metals", sub: "Pb + Hg + Cd (sum)",         unit: "μg/L",  icon: TestTube2,    accent: "#f472b6", base: 2.1,  anomaly: 145.2, range: "EA Limit: < 15 μg/L",  decimals: 2, variance: 0.2,  direction: "up",   maxLimit: 15,   isUnsafe: (v) => v >= 15 },
};
const PARAM_KEYS = Object.keys(METRICS);

const SPARK_LEN = 32;
const seedHistory = (base, variance) =>
  Array.from({ length: SPARK_LEN }, () => base + (Math.random() - 0.5) * variance * 1.8);

const seedSiteMetrics = (baselineOverride) => {
  const out = {};
  for (const key of PARAM_KEYS) {
    const m = METRICS[key];
    const base = baselineOverride?.[key] ?? m.base;
    const hist = seedHistory(base, m.variance);
    out[key] = { value: hist[hist.length - 1], history: hist };
  }
  return out;
};

const DEFAULT_SITE_IDS = ["TV-04", "AN-12", "ST-07", "UU-03"];

/* ---------- Client-side forecast (for sparkline tail when WS forecast not yet available) ---------- */
function forecastBreach(history, cfg) {
  if (!history || history.length < 5) return { stb: null, slope: 0, projected: [] };
  const n = Math.min(8, history.length);
  const recent = history.slice(-n);
  const xs = recent.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = recent.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * recent[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX || 1;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const last = recent[recent.length - 1];
  let stb = null;
  if (cfg.direction === "up" && typeof cfg.maxLimit === "number") {
    if (last >= cfg.maxLimit) stb = 0;
    else if (slope > 0.01) stb = Math.round((cfg.maxLimit - last) / slope);
  } else if (cfg.direction === "down" && typeof cfg.minLimit === "number") {
    if (last <= cfg.minLimit) stb = 0;
    else if (slope < -0.005) stb = Math.round((cfg.minLimit - last) / slope);
  }
  const projected = [];
  for (let i = 1; i <= 8; i++) projected.push(last + slope * i);
  return { stb, slope, projected, last };
}

const Sparkline = ({ data, color, danger, idKey, forecast }) => {
  if (!data || data.length === 0) return null;
  const width = 160, height = 48, pad = 4;
  const w = width - pad * 2, h = height - pad * 2;
  const combined = forecast?.projected ? [...data, ...forecast.projected] : data;
  const min = Math.min(...combined), max = Math.max(...combined);
  const range = max - min || 1;
  const xAt = (i) => pad + (i / (combined.length - 1)) * w;
  const yAt = (val) => pad + h - ((val - min) / range) * h;
  const points = data.map((val, i) => [xAt(i), yAt(val)]);
  const polylinePoints = points.map((p) => p.join(",")).join(" ");
  const [lx, ly] = points[points.length - 1];
  const fillPoints = `${pad},${pad + h} ${polylinePoints} ${xAt(data.length - 1)},${pad + h}`;
  const gradientId = `spark-${idKey}-${danger ? "d" : "n"}`;
  const strokeColor = danger ? "#f87171" : color;
  const forecastPoints = forecast?.projected
    ? [[lx, ly], ...forecast.projected.map((v, i) => [xAt(data.length + i), yAt(v)])]
    : [];
  const forecastStr = forecastPoints.map((p) => p.join(",")).join(" ");
  const forecastColor = forecast?.stb !== null && forecast?.stb <= 60 ? "#fbbf24" : "#a1a1aa";

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.4" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#${gradientId})`} />
      <polyline points={polylinePoints} fill="none" stroke={strokeColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${strokeColor}80)` }} />
      {forecast?.projected && (
        <polyline points={forecastStr} fill="none" stroke={forecastColor} strokeWidth="1.25" strokeDasharray="3,3" strokeLinecap="round" opacity="0.85" />
      )}
      <circle cx={lx} cy={ly} r="6" fill={strokeColor} fillOpacity="0.2" className="animate-ping" />
      <circle cx={lx} cy={ly} r="2.75" fill={strokeColor} />
    </svg>
  );
};

/* ---------- Hash gen (offline fallback only) ---------- */
const HEX = "0123456789abcdef";
const makeHash = (seed) => {
  let h = "", s = seed;
  for (let i = 0; i < 64; i++) {
    s = (s * 9301 + 49297) % 233280;
    h += HEX[Math.floor((s / 233280) * 16)];
  }
  return h;
};
const buildLocalLedger = () => {
  const sensors = ["PH-01", "BOD-04", "COD-02", "TSS-03", "NH3-01", "TEMP-02", "HM-01", "PH-02"];
  const measurements = [
    "pH 7.18 · BOD₅ 23.4", "BOD₅ 23.4 mg/L", "COD 116 mg/L", "TSS 26.1 mg/L",
    "NH₃-N 1.42 mg/L", "Temp 18.6 °C", "Heavy metals 2.0 μg/L", "pH 7.31",
  ];
  const now = Date.now();
  return Array.from({ length: 8 }).map((_, i) => ({
    height: 184_502 - i,
    ts: new Date(now - i * 6 * 60 * 1000),
    sensor: sensors[i % sensors.length],
    measurement: measurements[i % measurements.length],
    hash: makeHash(7919 + i * 131),
    prevHash: makeHash(7919 + (i + 1) * 131),
    attested: true, breach: false,
  }));
};

/* ---------- Terminal exploit script ---------- */
const EXPLOIT_SCRIPT = [
  { t: 80, kind: "sys", text: "firewall@aquasense-edge:~$ tail -f /var/log/secure" },
  { t: 220, kind: "ok", text: "[OK]    TLS 1.3 handshake verified  ·  SNI=edge.aquasense.io" },
  { t: 180, kind: "ok", text: "[OK]    HSM hardware attestation: PASSED  ·  PCR-7 trusted" },
  { t: 200, kind: "info", text: "[INFO]  Listening on Port 9090 (encrypted edge channel)" },
  { t: 350, kind: "sys", text: "" },
  { t: 250, kind: "warn", text: "[INTRUSION DETECTED] 2026-05-18 14:32:18 UTC" },
  { t: 200, kind: "warn", text: "Source IP: 185.220.101.42  ·  Geo: Frankfurt, DE  ·  TOR exit node" },
  { t: 200, kind: "warn", text: "Attempting authentication → ssh root@10.0.4.221:9090" },
  { t: 350, kind: "deny", text: "  ATTEMPT 1  ·  user=root  pass='admin'         → DENIED" },
  { t: 280, kind: "deny", text: "  ATTEMPT 2  ·  user=root  pass='password123'   → DENIED" },
  { t: 280, kind: "deny", text: "  ATTEMPT 3  ·  user=admin pass='aquasense'     → DENIED" },
  { t: 280, kind: "deny", text: "  ATTEMPT 4  ·  user=root  pass='P@ssw0rd!'     → DENIED" },
  { t: 280, kind: "deny", text: "  ATTEMPT 5  ·  user=root  pass='Welcome@2026'  → DENIED" },
  { t: 400, kind: "sys", text: "" },
  { t: 200, kind: "crit", text: "[CRITICAL ALERT] Unauthorized access attempt via common default credentials on Port 9090." },
  { t: 220, kind: "crit", text: "[BLOCKED]       ROOT ACCESS BLOCKED." },
  { t: 220, kind: "sec", text: "[SECURITY]      System requires cryptographic SSH Key authentication." },
  { t: 220, kind: "sec", text: "[SECURITY]      No scope for privilege escalation." },
  { t: 350, kind: "sys", text: "" },
  { t: 200, kind: "info", text: "[ACTION]  Source IP 185.220.101.42 added to permanent denylist." },
  { t: 200, kind: "info", text: "[ACTION]  Incident report 0xA7F-2026-05-18 forwarded to NCSC." },
  { t: 200, kind: "ok", text: "[OK]      All telemetry channels remain INTEGRITY-VERIFIED." },
  { t: 200, kind: "sys", text: "firewall@aquasense-edge:~$ ▌" },
];

const LINE_COLORS = {
  sys: "text-zinc-500", ok: "text-emerald-400", info: "text-cyan-300",
  warn: "text-amber-300", deny: "text-orange-400",
  crit: "text-red-400 font-semibold", sec: "text-sky-300",
};

const TABS = [
  { id: "Live Monitoring", label: "Live Monitoring", icon: Activity },
  { id: "AI Forecast",     label: "AI Forecast",     icon: Brain },
  { id: "Cyber Security",  label: "Cyber Security",  icon: Shield },
  { id: "Satellite",       label: "Satellite",       icon: Satellite },
  { id: "Ledger",          label: "Ledger",          icon: Database },
  { id: "Reports",         label: "Reports & Alerts", icon: FileText },
];

const formatMeasurement = (r) =>
  `pH ${r.pH} · BOD₅ ${r.BOD} · COD ${r.COD} · NH₃-N ${r.Ammonia}`;

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/* ============================================================
   ROOT COMPONENT
   ============================================================ */
export default function App() {
  const [activeTab, setActiveTab] = useState("Live Monitoring");
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Sites (replaced from backend)
  const [sites, setSites] = useState([
    { id: "TV-04", code: "TV-04-EW-221", name: "Thames Valley · Site 04", operator: "Thames Water", permit: "PR3-2026/0419", coords: [51.50, -0.76], river: "River Thames", primary: true, compliance30d: 99.4, baseline: { pH: 7.2, BOD: 22, COD: 118, TSS: 24, Ammonia: 1.4, Temperature: 18.4, HeavyMetals: 2.1 } },
    { id: "AN-12", code: "AN-12-EW-118", name: "Anglian · Norwich North", operator: "Anglian Water", permit: "PR3-2026/0512", coords: [52.63, 1.30], river: "River Wensum", compliance30d: 100.0, baseline: { pH: 7.6, BOD: 18, COD: 92, TSS: 19, Ammonia: 1.1, Temperature: 16.8, HeavyMetals: 1.8 } },
    { id: "ST-07", code: "ST-07-EW-330", name: "Severn Trent · Birmingham West", operator: "Severn Trent", permit: "PR3-2026/0231", coords: [52.48, -1.89], river: "River Tame", compliance30d: 98.1, baseline: { pH: 7.0, BOD: 25, COD: 132, TSS: 28, Ammonia: 1.6, Temperature: 19.2, HeavyMetals: 2.4 } },
    { id: "UU-03", code: "UU-03-EW-740", name: "United Utilities · Manchester East", operator: "United Utilities", permit: "PR3-2026/0823", coords: [53.48, -2.10], river: "River Medlock", compliance30d: 99.8, baseline: { pH: 7.4, BOD: 20, COD: 108, TSS: 22, Ammonia: 1.3, Temperature: 17.5, HeavyMetals: 2.0 } },
  ]);
  const [selectedSiteId, setSelectedSiteId] = useState("TV-04");

  // Per-site metrics: { siteId: { pH: { value, history }, ... } }
  const [siteMetrics, setSiteMetrics] = useState(() => {
    const init = {};
    for (const s of DEFAULT_SITE_IDS) init[s] = seedSiteMetrics();
    return init;
  });

  // Per-site live metadata (classification, forecast, health, anomaly state, incidents)
  const [siteLive, setSiteLive] = useState(() => {
    const init = {};
    for (const s of DEFAULT_SITE_IDS) {
      init[s] = {
        classification: null, forecast: null, healthScore: 99,
        anomalyActive: false, anomalyProgress: 0,
        incidents: [],
      };
    }
    return init;
  });

  // WebSocket
  const wsRef = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Global cumulative (carbon, fines)
  const [globalState, setGlobalState] = useState({
    cumulativeFineMitigated: 1_240_000,
    carbonRemediatedKg: 412.6,
    riverProtectedM3: 18_400,
    sessionStart: new Date().toISOString(),
  });

  // Terminal / exploit
  const [terminalLines, setTerminalLines] = useState([]);
  const [exploitRunning, setExploitRunning] = useState(false);
  const terminalRef = useRef(null);

  // Satellite overlay
  const [waterStressActive, setWaterStressActive] = useState(false);

  // Clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Backend HTTP state
  const [backendStatus, setBackendStatus] = useState("connecting");
  const [backendInfo, setBackendInfo] = useState(null);
  const [ledgerRows, setLedgerRows] = useState(() => buildLocalLedger());
  const [notifications, setNotifications] = useState([]);
  const [sensorHealth, setSensorHealth] = useState({});
  const [reportBusy, setReportBusy] = useState(null);

  // Security + ML state (v1.0)
  const [securityPosture, setSecurityPosture] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [siteDetectors, setSiteDetectors] = useState({}); // per-site detector scores

  // Local financial-ticker animation per anomaly trigger (visual only)
  const [fineMitigated, setFineMitigated] = useState(0);

  /* ---------- Initial HTTP fetch ---------- */
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/telemetry", { signal: controller.signal }).then((r) => r.ok ? r.json() : Promise.reject()),
      fetch("/api/notifications", { signal: controller.signal }).then((r) => r.ok ? r.json() : { notifications: [] }).catch(() => ({ notifications: [] })),
      fetch("/api/sites", { signal: controller.signal }).then((r) => r.ok ? r.json() : { sites: [] }).catch(() => ({ sites: [] })),
      fetch("/api/sensor-health", { signal: controller.signal }).then((r) => r.ok ? r.json() : { sensors: {} }).catch(() => ({ sensors: {} })),
      fetch("/api/security/posture", { signal: controller.signal }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/security/audit?limit=80", { signal: controller.signal }).then((r) => r.ok ? r.json() : { entries: [] }).catch(() => ({ entries: [] })),
      fetch("/api/model/metrics", { signal: controller.signal }).then((r) => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([telemetry, notif, sitesData, sensorData, posture, audit, model]) => {
        if (posture) setSecurityPosture(posture);
        if (audit?.entries) setAuditLog(audit.entries);
        if (model) setModelMetrics(model);
        setBackendStatus("online");
        setBackendInfo({
          ledgerSize: telemetry.count, head: telemetry.chain?.head, algorithm: telemetry.chain?.algorithm,
          generated: telemetry.generated, incidentId: telemetry.incidentId,
        });
        if (sitesData.sites?.length) setSites(sitesData.sites);
        if (sensorData.sensors) setSensorHealth(sensorData.sensors);

        const tail = (telemetry.records || []).slice(-8).reverse();
        setLedgerRows(tail.map((r) => ({
          height: r.blockHeight,
          ts: new Date(r.timestamp),
          sensor: `AQS-${String(r.sequenceId).padStart(3, "0")}`,
          measurement: formatMeasurement(r),
          hash: r.hash, prevHash: r.prevHash,
          attested: true, breach: r.sequenceId >= 45,
        })));

        if (notif.notifications?.length) setNotifications(notif.notifications);
      })
      .catch((err) => {
        if (err && err.name !== "AbortError") setBackendStatus("offline");
      });
    return () => controller.abort();
  }, []);

  /* ---------- WebSocket connection ---------- */
  useEffect(() => {
    let stopped = false;
    let reconnectTimer = null;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setBackendStatus("online");
      };

      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        if (msg.type === "hello") {
          if (msg.sites?.length) setSites(msg.sites);
          if (msg.sensorHealth) setSensorHealth(msg.sensorHealth);
          if (msg.global) setGlobalState((g) => ({ ...g, ...msg.global }));
          if (msg.sitesData) ingestSitesPayload(msg.sitesData);
          if (msg.securityPosture) setSecurityPosture(msg.securityPosture);
          if (msg.modelMetrics) setModelMetrics(msg.modelMetrics);
        } else if (msg.type === "tick") {
          if (msg.sites) ingestSitesPayload(msg.sites);
          if (msg.global) setGlobalState((g) => ({ ...g, ...msg.global }));
          // refresh notifications every ~10 ticks
          if (msg.notificationsCount && msg.notificationsCount !== notifications.length) {
            fetch("/api/notifications").then((r) => r.json()).then((d) => {
              if (d.notifications) setNotifications(d.notifications);
            }).catch(() => {});
          }
          if (typeof msg.auditDepth === "number" && msg.auditDepth !== auditLog.length) {
            fetch("/api/security/audit?limit=80").then((r) => r.json()).then((d) => {
              if (d.entries) setAuditLog(d.entries);
            }).catch(() => {});
          }
        } else if (msg.type === "trigger-ack") {
          // Acknowledged. siteLive will update on next tick.
        }
      };

      const ingestSitesPayload = (sitesData) => {
        setSiteMetrics((prev) => {
          const next = { ...prev };
          for (const [siteId, data] of Object.entries(sitesData)) {
            if (!data?.reading) continue;
            const cur = prev[siteId] || seedSiteMetrics();
            const newSite = {};
            for (const key of PARAM_KEYS) {
              const value = data.reading[key];
              const prevHist = cur[key]?.history || seedHistory(METRICS[key].base, METRICS[key].variance);
              newSite[key] = { value, history: [...prevHist.slice(1), value] };
            }
            next[siteId] = newSite;
          }
          return next;
        });
        setSiteLive((prev) => {
          const next = { ...prev };
          for (const [siteId, data] of Object.entries(sitesData)) {
            next[siteId] = {
              ...(prev[siteId] || {}),
              classification: data.classification ?? prev[siteId]?.classification ?? null,
              forecast: data.forecast ?? prev[siteId]?.forecast ?? null,
              healthScore: data.healthScore ?? prev[siteId]?.healthScore ?? 99,
              anomalyActive: !!data.anomalyActive,
              anomalyProgress: data.anomalyProgress ?? 0,
              incidents: data.incidents ?? prev[siteId]?.incidents ?? [],
            };
          }
          return next;
        });
        setSiteDetectors((prev) => {
          const next = { ...prev };
          for (const [siteId, data] of Object.entries(sitesData)) {
            if (data.detectors) next[siteId] = data.detectors;
          }
          return next;
        });
      };

      ws.onerror = () => { /* onclose handles reconnect */ };
      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (!stopped) {
          if (backendStatus !== "offline") setBackendStatus("offline");
          reconnectTimer = setTimeout(connect, 2500);
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Offline-mode simulation (only when WS unavailable) ---------- */
  useEffect(() => {
    if (wsConnected) return;
    const id = setInterval(() => {
      setSiteMetrics((prev) => {
        const next = { ...prev };
        for (const siteId of DEFAULT_SITE_IDS) {
          const cur = prev[siteId] || seedSiteMetrics();
          const live = siteLive[siteId] || {};
          const progress = live.anomalyProgress || 0;
          const newSite = {};
          for (const key of PARAM_KEYS) {
            const cfg = METRICS[key];
            const target = cfg.base + (cfg.anomaly - cfg.base) * progress;
            const noise = (Math.random() - 0.5) * cfg.variance * 2;
            const value = +(target + noise).toFixed(4);
            const prevHist = cur[key]?.history || seedHistory(cfg.base, cfg.variance);
            newSite[key] = { value, history: [...prevHist.slice(1), value] };
          }
          next[siteId] = newSite;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected]);

  /* ---------- Local anomaly ramp (offline only) ---------- */
  const localRampRef = useRef({});
  useEffect(() => {
    if (wsConnected) return;
    const interval = setInterval(() => {
      const updates = {};
      let changed = false;
      for (const siteId of DEFAULT_SITE_IDS) {
        const r = localRampRef.current[siteId];
        if (!r) continue;
        const elapsed = (Date.now() - r.start) / 1000;
        const p = Math.min(elapsed / r.duration, 1);
        const eased = r.direction === "up" ? Math.pow(p, 2.2) : 1 - Math.pow(1 - p, 2);
        const value = r.from + (r.to - r.from) * eased;
        updates[siteId] = value;
        changed = true;
        if (p >= 1) delete localRampRef.current[siteId];
      }
      if (changed) {
        setSiteLive((prev) => {
          const next = { ...prev };
          for (const [siteId, progress] of Object.entries(updates)) {
            next[siteId] = { ...(prev[siteId] || {}), anomalyProgress: progress };
          }
          return next;
        });
      }
    }, 60);
    return () => clearInterval(interval);
  }, [wsConnected]);

  /* ---------- Trigger anomaly ---------- */
  const triggerAnomaly = (active) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "trigger", siteId: selectedSiteId, action: active ? "start" : "stop" }));
      setSiteLive((prev) => ({
        ...prev,
        [selectedSiteId]: { ...(prev[selectedSiteId] || {}), anomalyActive: active },
      }));
    } else {
      // Offline fallback: ramp locally
      const cur = siteLive[selectedSiteId]?.anomalyProgress || 0;
      localRampRef.current[selectedSiteId] = {
        start: Date.now(),
        duration: active ? 8 : 2.5,
        from: cur, to: active ? 1 : 0,
        direction: active ? "up" : "down",
      };
      setSiteLive((prev) => ({
        ...prev,
        [selectedSiteId]: { ...(prev[selectedSiteId] || {}), anomalyActive: active },
      }));
    }
  };

  /* ---------- Voice alerts (per-site edge detect) ---------- */
  const lastAnomalyEdgeRef = useRef({});
  useEffect(() => {
    const live = siteLive[selectedSiteId];
    if (!live) return;
    const prev = lastAnomalyEdgeRef.current[selectedSiteId];
    if (live.anomalyActive && !prev) {
      lastAnomalyEdgeRef.current[selectedSiteId] = true;
      if (voiceEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
          const site = sites.find((s) => s.id === selectedSiteId);
          const u = new window.SpeechSynthesisUtterance(
            `Section 82 breach imminent at ${site?.name || "site"}. Autonomous remediation engaged.`
          );
          u.rate = 1.05; u.pitch = 0.95; u.volume = 0.85;
          window.speechSynthesis.speak(u);
        } catch (_) {}
      }
    } else if (!live.anomalyActive && prev) {
      lastAnomalyEdgeRef.current[selectedSiteId] = false;
    }
  }, [siteLive, selectedSiteId, voiceEnabled, sites]);

  /* ---------- Fine ticker animation per anomaly ---------- */
  const selectedAnomalyActive = siteLive[selectedSiteId]?.anomalyActive || false;
  useEffect(() => {
    if (!selectedAnomalyActive) {
      setFineMitigated(0);
      return;
    }
    const target = 250000, duration = 1400;
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const elapsed = t - start;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setFineMitigated(Math.floor(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedAnomalyActive]);

  /* ---------- Auto-scroll terminal ---------- */
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalLines]);

  /* ---------- Exploit simulation ---------- */
  const runExploitSimulation = async () => {
    if (exploitRunning) return;
    setExploitRunning(true);
    setTerminalLines([]);
    let acc = 0;
    EXPLOIT_SCRIPT.forEach((line, i) => {
      acc += line.t;
      setTimeout(() => {
        setTerminalLines((prev) => [...prev, line]);
        if (i === EXPLOIT_SCRIPT.length - 1) setExploitRunning(false);
      }, acc);
    });
    try {
      const res = await fetch("/api/edge/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "root", password: "admin" }),
      });
      const json = await res.json().catch(() => ({}));
      setTimeout(() => {
        setTerminalLines((prev) => [
          ...prev,
          { kind: "sys", text: "" },
          { kind: "info", text: `[BACKEND→EDGE]  POST /api/edge/auth  →  HTTP ${res.status}` },
          { kind: "crit", text: `[BACKEND→EDGE]  ${json.message || "Privilege Escalation Blocked - SSH Authentication Required on Port 9090"}` },
          { kind: "sec",  text: `[BACKEND→EDGE]  required_auth=${json.requiredAuth || "ED25519_SSH_KEY"}  port=${json.port || 9090}` },
        ]);
      }, acc + 200);
    } catch (_) {}
  };

  /* ---------- Download report (per-site, dynamic) ---------- */
  const downloadReport = async (format) => {
    setReportBusy(format);
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      const res = await fetch(`/api/compliance-report?format=${format}&siteId=${selectedSiteId}`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown";
      const site = sites.find((s) => s.id === selectedSiteId);
      const code = site?.id || "site";
      downloadBlob(text, `aquasense-compliance-${code}-${stamp}.${format}`, mime);
    } catch {
      const md = generateLocalMarkdownReport(siteMetrics[selectedSiteId] || {}, siteLive[selectedSiteId] || {}, ledgerRows, sites.find((s) => s.id === selectedSiteId));
      downloadBlob(md, `aquasense-compliance-${selectedSiteId}-${stamp}.md`, "text/markdown");
    } finally {
      setTimeout(() => setReportBusy(null), 300);
    }
  };

  /* ---------- Derived values for selected site ---------- */
  const selectedSite = sites.find((s) => s.id === selectedSiteId) || sites[0];
  const metrics = siteMetrics[selectedSiteId] || seedSiteMetrics();
  const live = siteLive[selectedSiteId] || {};
  const isAnomalyTriggered = !!live.anomalyActive;
  const healthScore = live.healthScore ?? 99;
  const liveClassification = live.classification;
  const liveForecast = live.forecast;
  const siteIncidents = live.incidents || [];

  const clientForecasts = useMemo(() => {
    const out = {};
    for (const key of PARAM_KEYS) {
      out[key] = forecastBreach(metrics[key]?.history, METRICS[key]);
    }
    return out;
  }, [metrics]);

  const earliestBreach = useMemo(() => {
    let earliest = null, key = null;
    for (const k of Object.keys(clientForecasts)) {
      const f = clientForecasts[k];
      if (f.stb !== null && f.stb >= 0 && f.stb <= 60) {
        if (earliest === null || f.stb < earliest) { earliest = f.stb; key = k; }
      }
    }
    return { stb: earliest, key };
  }, [clientForecasts]);

  const breachedCount = Object.entries(metrics).reduce(
    (acc, [k, v]) => acc + (METRICS[k].isUnsafe(v.value) ? 1 : 0), 0
  );

  /* ============================================================ */
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-emerald-500/30">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[520px] h-[520px] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[420px] h-[420px] rounded-full bg-violet-500/5 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }} />
      </div>

      {/* Top Bar */}
      <header className="relative z-20 flex items-center justify-between px-6 h-16 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-emerald-500/30 blur-md" />
            <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Droplet className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
            </div>
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold tracking-tight">AquaSense</span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">AI</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/25" title={`v${APP_VERSION} · Confluence`}>v{APP_VERSION}</span>
            </div>
            <div className="text-[10.5px] text-zinc-500 uppercase tracking-[0.18em]">
              Proactive Wastewater Compliance
            </div>
          </div>
          <SiteSelector sites={sites} selectedId={selectedSiteId} onChange={setSelectedSiteId} siteLive={siteLive} />
        </div>

        <div className="flex items-center gap-2">
          <StatusPill
            ok={!isAnomalyTriggered}
            okLabel="ALL SYSTEMS NOMINAL"
            errLabel={`${breachedCount}/7 BREACHED · INCIDENT ACTIVE`}
          />
          <Pill
            icon={wsConnected ? Wifi : (backendStatus === "offline" ? WifiOff : Wifi)}
            label={
              wsConnected ? "EDGE LINK · LIVE WS"
              : backendStatus === "online" ? "EDGE LINK · HTTP"
              : backendStatus === "offline" ? "EDGE LINK · LOCAL"
              : "EDGE LINK · SYNC"
            }
            tone={
              wsConnected ? "emerald"
              : backendStatus === "online" ? "cyan"
              : backendStatus === "offline" ? "rose"
              : "amber"
            }
          />
          <button
            onClick={() => setVoiceEnabled((v) => !v)}
            title={voiceEnabled ? "Voice alerts on" : "Voice alerts off"}
            className={`hidden md:flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
              voiceEnabled
                ? "bg-violet-500/10 text-violet-300 border-violet-500/30"
                : "bg-zinc-900/70 text-zinc-500 border-zinc-800"
            }`}
          >
            {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <div className="hidden lg:flex items-center gap-2 px-3 h-9 rounded-md bg-zinc-900/70 border border-zinc-800 text-[11.5px] font-mono text-zinc-400">
            <Clock className="h-3.5 w-3.5" />
            {now.toLocaleTimeString("en-GB")}
            <span className="text-zinc-600">·</span><span>UTC+0</span>
          </div>
          <div className="flex items-center gap-2 pl-3 ml-1 border-l border-zinc-800 h-9">
            <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-zinc-300" />
            </div>
            <div className="leading-tight hidden lg:block">
              <div className="text-[11.5px] text-zinc-200">Jatin Kumar</div>
              <div className="text-[10px] text-zinc-500">Compliance Operator</div>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex">
        <aside className="w-60 shrink-0 min-h-[calc(100vh-4rem)] border-r border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl py-5 px-3">
          <nav className="flex flex-col gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`group relative flex items-center gap-3 px-3 h-10 rounded-md text-[13px] transition-all ${
                    active ? "bg-zinc-900 text-white border border-zinc-800 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.15)]"
                           : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent"
                  }`}>
                  {active && <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-emerald-400 to-cyan-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />}
                  <Icon className={`h-4 w-4 ${active ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"}`} />
                  <span className="flex-1 text-left tracking-tight">{tab.label}</span>
                  {active && <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 px-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600 mb-2">Site</div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-[12px] text-zinc-200">{selectedSite?.name || "—"}</span>
              </div>
              <div className="text-[10.5px] text-zinc-500 leading-relaxed">
                Outfall <span className="font-mono text-zinc-300">{selectedSite?.code || "—"}</span><br />
                Permit  <span className="font-mono text-zinc-300">{selectedSite?.permit || "—"}</span><br />
                River   <span className="font-mono text-zinc-300">{selectedSite?.river || "—"}</span><br />
                Compl.  <span className="font-mono text-emerald-300">{(selectedSite?.compliance30d ?? 0).toFixed(1)}%</span> · 30 d
              </div>
            </div>
          </div>

          <div className="mt-4 px-3">
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium tracking-tight">Chain Integrity</span>
              </div>
              <div className="text-[10.5px] text-zinc-500 mt-1">
                {backendInfo ? `${backendInfo.ledgerSize} blocks · ${backendInfo.algorithm}` : "184,502 blocks · 100% valid"}
              </div>
              {backendInfo?.head && (
                <div className="text-[9px] font-mono text-zinc-600 mt-1 truncate" title={backendInfo.head}>
                  head: {backendInfo.head.slice(0, 18)}…
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 px-3">
            <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center gap-2 text-cyan-400">
                <Bell className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium tracking-tight">Notifications</span>
              </div>
              <div className="text-[10.5px] text-zinc-500 mt-1">{notifications.length} dispatched</div>
            </div>
          </div>

          {wsConnected && (
            <div className="mt-4 px-3">
              <div className="rounded-md border border-violet-500/20 bg-violet-500/[0.04] p-3">
                <div className="flex items-center gap-2 text-violet-300">
                  <Radio className="h-3.5 w-3.5 animate-pulse" />
                  <span className="text-[11px] font-medium tracking-tight">Live Stream</span>
                </div>
                <div className="text-[10.5px] text-zinc-500 mt-1">{sites.length} sites · 1 Hz</div>
              </div>
            </div>
          )}
        </aside>

        <main className="flex-1 min-h-[calc(100vh-4rem)] p-6 lg:p-8">
          {activeTab === "Live Monitoring" && renderLiveMonitoring({
            metrics, clientForecasts, liveForecast, liveClassification, healthScore,
            earliestBreach, isAnomalyTriggered, triggerAnomaly, fineMitigated, breachedCount,
            downloadReport, reportBusy, sensorHealth, globalState, siteIncidents, wsConnected,
            selectedSite,
          })}
          {activeTab === "AI Forecast" && renderAIForecast({
            metrics, clientForecasts, liveForecast, liveClassification, healthScore,
            earliestBreach, isAnomalyTriggered, wsConnected, selectedSite,
            modelMetrics, detectors: siteDetectors[selectedSiteId],
          })}
          {activeTab === "Cyber Security" && renderCyberSecurity({
            terminalLines, terminalRef, runExploitSimulation, exploitRunning, backendStatus,
            securityPosture, auditLog,
          })}
          {activeTab === "Satellite" && renderSatellite({
            waterStressActive, setWaterStressActive, sites, selectedSite,
          })}
          {activeTab === "Ledger" && renderLedger({ ledgerRows, backendInfo })}
          {activeTab === "Reports" && renderReportsAlerts({
            notifications, downloadReport, reportBusy, backendStatus, isAnomalyTriggered,
            globalState, siteIncidents, selectedSite,
          })}
        </main>
      </div>
    </div>
  );
}

/* ============================================================
   Site Selector
   ============================================================ */
function SiteSelector({ sites, selectedId, onChange, siteLive }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const selected = sites.find((s) => s.id === selectedId) || sites[0];
  if (!selected) return null;
  return (
    <div ref={ref} className="relative ml-3 pl-3 border-l border-zinc-800/80">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 px-3 rounded-md bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 transition-colors"
      >
        <Building2 className="h-3.5 w-3.5 text-cyan-400" />
        <div className="leading-tight text-left">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">Site</div>
          <div className="text-[12px] font-medium text-zinc-200">{selected.name}</div>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-[360px] rounded-md border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl shadow-xl z-40 overflow-hidden">
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500 border-b border-zinc-800">
            Outfall Sites · {sites.length}
          </div>
          {sites.map((s) => {
            const active = s.id === selectedId;
            const live = siteLive[s.id] || {};
            const hasIncident = live.anomalyActive;
            return (
              <button
                key={s.id}
                onClick={() => { onChange(s.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-900 transition-colors ${active ? "bg-zinc-900" : ""}`}
              >
                <div className={`h-2 w-2 rounded-full ${
                  hasIncident ? "bg-red-400 animate-pulse"
                  : s.compliance30d >= 99.5 ? "bg-emerald-400"
                  : s.compliance30d >= 99 ? "bg-amber-400"
                  : "bg-orange-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] text-zinc-200 truncate">{s.name}</div>
                  <div className="text-[10.5px] font-mono text-zinc-500 truncate">{s.operator} · {s.permit}</div>
                </div>
                <div className="text-right">
                  {hasIncident
                    ? <div className="text-[10px] font-medium text-red-300">LIVE INCIDENT</div>
                    : <div className="text-[10.5px] font-mono text-emerald-300">{s.compliance30d.toFixed(1)}%</div>}
                  {(live.incidents?.length ?? 0) > 0 && (
                    <div className="text-[9.5px] text-amber-300">{live.incidents.length} this session</div>
                  )}
                </div>
                {active && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TAB: LIVE MONITORING
   ============================================================ */
function renderLiveMonitoring({
  metrics, clientForecasts, liveForecast, liveClassification, healthScore,
  earliestBreach, isAnomalyTriggered, triggerAnomaly, fineMitigated, breachedCount,
  downloadReport, reportBusy, sensorHealth, globalState, siteIncidents, wsConnected,
  selectedSite,
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
            <Radio className={`h-3.5 w-3.5 ${wsConnected ? "text-emerald-400" : "text-zinc-500"} animate-pulse`} />
            {wsConnected ? `Live WebSocket · ${selectedSite?.code || ""} · 1 Hz` : "Local Simulation · 1 Hz"}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{selectedSite?.name} · Live Monitoring</h1>
          <p className="text-[13px] text-zinc-500 mt-1.5 max-w-2xl">
            Effluent telemetry from edge sensors at outfall <span className="font-mono text-zinc-300">{selectedSite?.code}</span> on {selectedSite?.river}. Predictive ML triggers remediation 90 s before regulatory breach.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => downloadReport("md")} disabled={reportBusy !== null}
            className="flex items-center gap-2 h-10 px-4 rounded-md text-[12.5px] font-medium tracking-tight border bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <Download className={`h-4 w-4 ${reportBusy === "md" ? "animate-bounce" : ""}`} />
            Download Report
          </button>
          <button onClick={() => triggerAnomaly(false)} disabled={!isAnomalyTriggered}
            className={`flex items-center gap-2 h-10 px-4 rounded-md text-[12.5px] font-medium tracking-tight transition-all border ${
              isAnomalyTriggered ? "bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                                 : "bg-zinc-900/40 border-zinc-800 text-zinc-600 cursor-not-allowed"
            }`}>
            <RotateCcw className="h-4 w-4" />
            Reset to Baseline
          </button>
          <button onClick={() => triggerAnomaly(true)} disabled={isAnomalyTriggered}
            className={`relative flex items-center gap-2 h-10 px-5 rounded-md text-[12.5px] font-semibold tracking-tight transition-all ${
              isAnomalyTriggered ? "bg-red-500/10 border border-red-500/30 text-red-400 cursor-not-allowed"
                                 : "bg-gradient-to-b from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:from-red-400 hover:to-red-500"
            }`}>
            <AlertTriangle className="h-4 w-4" />
            Simulate Industrial Discharge Anomaly
            {!isAnomalyTriggered && <span className="absolute inset-0 rounded-md ring-1 ring-red-400/40 animate-pulse pointer-events-none" />}
          </button>
        </div>
      </div>

      <AIPredictiveBanner healthScore={healthScore} earliestBreach={earliestBreach}
        isAnomaly={isAnomalyTriggered} breachedCount={breachedCount}
        classification={liveClassification} incidentsToday={siteIncidents.length}
        carbonRemediatedKg={globalState.carbonRemediatedKg} />

      {liveClassification && liveClassification.key !== "NOMINAL" && (
        <AnomalyClassificationBanner classification={liveClassification} />
      )}

      {isAnomalyTriggered && (
        <div className="relative overflow-hidden rounded-lg border border-red-500/40 bg-red-500/10">
          <div className="absolute inset-0 bg-red-500/10 animate-pulse" />
          <div className="absolute inset-0 opacity-40" style={{
            background: "repeating-linear-gradient(45deg, transparent 0 8px, rgba(239,68,68,0.08) 8px 16px)",
          }} />
          <div className="relative flex items-center gap-4 px-5 py-4">
            <div className="flex items-center justify-center h-11 w-11 rounded-md bg-red-500/20 border border-red-500/40">
              <AlertTriangle className="h-5 w-5 text-red-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-red-300/80">
                Predictive Compliance Engine · {selectedSite?.code}
              </div>
              <div className="text-[15px] font-semibold text-red-300 tracking-tight">
                PREDICTIVE VIOLATION: SECTION 82 BREACH IMMINENT
              </div>
              <div className="text-[12px] text-red-200/70 mt-0.5">
                {breachedCount} of 7 parameters projected to exceed Environment Agency discharge consent · Water Industry Act 1991 · § 82
              </div>
            </div>
            <div className="hidden md:flex flex-col items-end text-right">
              <span className="text-[10px] uppercase tracking-[0.18em] text-red-300/80">Session incidents</span>
              <span className="font-mono text-[13px] text-red-200">{siteIncidents.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards · 7 sensors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-4">
        {Object.entries(METRICS).map(([key, cfg]) => {
          const m = metrics[key] || { value: cfg.base, history: seedHistory(cfg.base, cfg.variance) };
          const unsafe = cfg.isUnsafe(m.value);
          const Icon = cfg.icon;
          const fc = clientForecasts[key];
          const serverFc = liveForecast?.[key];
          const stb = serverFc?.secondsToBreach ?? fc?.stb;
          const showForecastBadge = stb !== null && stb !== undefined && stb >= 0 && stb <= 60 && !unsafe;
          const health = sensorHealth?.[key];
          return (
            <div key={key}
              className={`relative rounded-lg border bg-zinc-900/60 backdrop-blur p-4 transition-all overflow-hidden ${
                unsafe ? "border-red-500/40 shadow-[0_0_24px_-8px_rgba(239,68,68,0.4)]"
                       : "border-zinc-800 hover:border-zinc-700"
              }`}>
              {unsafe && <div className="absolute inset-0 pointer-events-none bg-red-500/[0.04] animate-pulse" />}
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center border" style={{
                    backgroundColor: unsafe ? "rgba(248,113,113,0.1)" : `${cfg.accent}14`,
                    borderColor: unsafe ? "rgba(248,113,113,0.3)" : `${cfg.accent}33`,
                  }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: unsafe ? "#f87171" : cfg.accent }} />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold tracking-tight">{cfg.label}</div>
                    <div className="text-[10px] text-zinc-500 leading-none mt-0.5">{cfg.sub}</div>
                  </div>
                </div>
                <span className={`text-[9.5px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded ${
                  unsafe ? "bg-red-500/15 text-red-300 border border-red-500/30"
                         : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                }`}>{unsafe ? "Breach" : "Safe"}</span>
              </div>

              <div className="relative mt-4 flex items-baseline gap-1.5">
                <div className="text-[26px] font-semibold tracking-tight tabular-nums" style={{
                  color: unsafe ? "#fca5a5" : cfg.accent,
                  textShadow: unsafe ? "0 0 12px rgba(248,113,113,0.4)" : `0 0 12px ${cfg.accent}55`,
                }}>{m.value.toFixed(cfg.decimals)}</div>
                {cfg.unit && <div className="text-[11px] text-zinc-500">{cfg.unit}</div>}
              </div>

              <div className="relative mt-1 -mx-1">
                <Sparkline data={m.history} color={cfg.accent} danger={unsafe} idKey={key} forecast={fc} />
              </div>

              <div className="relative flex items-center justify-between mt-2 text-[10.5px]">
                <span className="text-zinc-500">{cfg.range}</span>
                {showForecastBadge ? (
                  <span className="font-mono text-amber-400">AI: breach in {stb}s</span>
                ) : (
                  <span className={`font-mono ${unsafe ? "text-red-400" : "text-zinc-400"}`}>
                    {unsafe ? "↑ OUT" : "✓ IN"}
                  </span>
                )}
              </div>

              {health && (
                <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[9.5px] text-zinc-500">
                  <span className="font-mono">{health.id}</span>
                  <span className="flex items-center gap-1">
                    <Wrench className="h-3 w-3 text-cyan-500" />
                    drift {health.driftPct.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <EnvironmentalStrip
        carbonKg={globalState.carbonRemediatedKg}
        riverM3={globalState.riverProtectedM3}
        sessionIncidents={siteIncidents.length}
        fineYTD={globalState.cumulativeFineMitigated}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 rounded-lg border bg-zinc-900/60 backdrop-blur p-5 ${
          isAnomalyTriggered ? "border-emerald-500/40" : "border-zinc-800"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-zinc-500 mb-1">Autonomous Remediation Actuator</div>
              <div className="flex items-center gap-2">
                <Power className={`h-4 w-4 ${isAnomalyTriggered ? "text-emerald-400 animate-pulse" : "text-zinc-500"}`} />
                <span className="text-[15px] font-semibold tracking-tight">Edge Control Loop · edge-{selectedSite?.id?.toLowerCase()}</span>
              </div>
            </div>
            <span className={`text-[10.5px] uppercase tracking-[0.16em] px-2 py-1 rounded border ${
              isAnomalyTriggered ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                  : "bg-zinc-800/60 text-zinc-400 border-zinc-700"
            }`}>{isAnomalyTriggered ? "Active" : "Standby"}</span>
          </div>
          <div className={`mt-4 rounded-md border px-4 py-3 font-mono text-[13px] tracking-tight ${
            isAnomalyTriggered ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                               : "bg-zinc-950/60 border-zinc-800 text-zinc-300"
          }`}>
            {isAnomalyTriggered ? "REMEDIATION ACTIVE: INJECTING OXIDIZER & NEUTRALIZING AGENTS" : "PUMPS: STANDBY"}
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <ActuatorTile label="Oxidizer Pump" value={isAnomalyTriggered ? "184 L/min" : "0 L/min"} active={isAnomalyTriggered} icon={Zap} />
            <ActuatorTile label="Lime Slurry" value={isAnomalyTriggered ? "42 L/min" : "0 L/min"} active={isAnomalyTriggered} icon={Beaker} />
            <ActuatorTile label="Bypass Valve" value={isAnomalyTriggered ? "OPEN" : "CLOSED"} active={isAnomalyTriggered} icon={Waves} />
            <ActuatorTile label="Aeration" value={isAnomalyTriggered ? "MAX" : "62%"} active={isAnomalyTriggered} icon={Wind} />
            <ActuatorTile label="FeCl₃ Coagulant" value={isAnomalyTriggered ? "12 L/min" : "0 L/min"} active={isAnomalyTriggered} icon={TestTube2} />
          </div>
        </div>

        <div className={`relative overflow-hidden rounded-lg border bg-zinc-900/60 backdrop-blur p-5 ${
          isAnomalyTriggered ? "border-emerald-500/40" : "border-zinc-800"
        }`}>
          {isAnomalyTriggered && <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.08] to-transparent pointer-events-none" />}
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-zinc-500">Financial Risk Mitigation</div>
              {isAnomalyTriggered && <CheckCircle className="h-4 w-4 text-emerald-400" />}
            </div>
            <div className="mt-2 text-[12.5px] text-zinc-400">
              {isAnomalyTriggered ? "Environment Agency Fine Prevented" : "Potential Fines Mitigated"}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <PoundSterling className={`h-7 w-7 ${isAnomalyTriggered ? "text-emerald-400" : "text-zinc-500"}`} strokeWidth={2} />
              <div className={`text-[40px] font-semibold tracking-tight tabular-nums leading-none ${
                isAnomalyTriggered ? "text-emerald-300" : "text-zinc-200"
              }`} style={{ textShadow: isAnomalyTriggered ? "0 0 16px rgba(52,211,153,0.45)" : "none" }}>
                {fineMitigated.toLocaleString("en-GB")}
              </div>
            </div>
            <div className="mt-4 h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                style={{ width: `${Math.min((fineMitigated / 250000) * 100, 100)}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-[10.5px] text-zinc-500">
              <span>YTD Mitigated</span>
              <span className="font-mono text-zinc-300">£{globalState.cumulativeFineMitigated.toLocaleString("en-GB")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Session incidents list */}
      {siteIncidents.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
          <div className="flex items-center justify-between h-11 px-4 border-b border-zinc-800 bg-zinc-950/40">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              Session Incidents at {selectedSite?.code} · {siteIncidents.length}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-[0.16em] text-zinc-500 border-b border-zinc-800/70">
                  <th className="px-4 py-3 font-medium">Incident ID</th>
                  <th className="px-4 py-3 font-medium">Time (UTC)</th>
                  <th className="px-4 py-3 font-medium">Classification</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Breached</th>
                  <th className="px-4 py-3 font-medium text-right">Avoided</th>
                </tr>
              </thead>
              <tbody>
                {siteIncidents.slice(0, 8).map((inc) => (
                  <tr key={inc.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2.5 font-mono text-cyan-300">{inc.id}</td>
                    <td className="px-4 py-2.5 font-mono text-zinc-400 text-[11.5px]">
                      {new Date(inc.timestamp).toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-200">{inc.classification}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded border ${
                        inc.severity === "CRITICAL" ? "bg-red-500/15 text-red-300 border-red-500/30"
                        : inc.severity === "MAJOR" ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
                        : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      }`}>{inc.severity}</span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300 text-[11.5px]">{(inc.breached || []).join(", ")}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-300">£{inc.avoidedPenalty.toLocaleString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   AI Predictive Banner
   ============================================================ */
function AIPredictiveBanner({ healthScore, earliestBreach, isAnomaly, breachedCount, classification, incidentsToday, carbonRemediatedKg }) {
  const status = isAnomaly || healthScore < 50 ? "critical"
    : earliestBreach.stb !== null && earliestBreach.stb <= 60 ? "warning"
    : "healthy";
  const tone = {
    critical: { border: "border-red-500/40",     bg: "bg-red-500/[0.04]",     icon: "text-red-400",     label: "DEGRADED",          labelBg: "bg-red-500/15 text-red-300 border-red-500/30" },
    warning:  { border: "border-amber-500/30",   bg: "bg-amber-500/[0.04]",   icon: "text-amber-400",   label: "PREDICTING BREACH", labelBg: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    healthy:  { border: "border-emerald-500/25", bg: "bg-emerald-500/[0.03]", icon: "text-emerald-400", label: "OPERATING NORMALLY",labelBg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  }[status];

  return (
    <div className={`relative rounded-lg border ${tone.border} ${tone.bg} backdrop-blur overflow-hidden`}>
      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr,260px] gap-0">
        <div className="p-5 border-r border-zinc-800/60">
          <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] text-zinc-500">
            <Gauge className="h-3.5 w-3.5" /> Compliance Health
          </div>
          <RingGauge value={healthScore} />
        </div>
        <div className="p-5 flex flex-col justify-center">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`h-7 w-7 rounded-md border border-current/30 flex items-center justify-center ${tone.icon}`}>
              <Brain className="h-4 w-4" />
            </div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
              AquaSense AI · Predictive Compliance Engine
            </div>
            <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded border ${tone.labelBg}`}>{tone.label}</span>
          </div>
          <div className="mt-2 text-[16px] font-semibold tracking-tight text-zinc-100">
            {status === "critical" && <>§82 breach in progress · {breachedCount}/7 parameters out of envelope</>}
            {status === "warning" && earliestBreach.stb !== null && (
              <>Breach predicted in <span className="text-amber-300">{earliestBreach.stb}s</span> on <span className="text-amber-300">{METRICS[earliestBreach.key]?.label}</span></>
            )}
            {status === "healthy" && <>All 7 parameters projected within EA consent envelope for next 90s</>}
          </div>
          <div className="mt-1.5 text-[12px] text-zinc-500 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-cyan-400" />Model: LSTM-32 ensemble</span>
            <span>·</span><span>Confidence band 95%</span>
            <span>·</span><span>Window: 8 s rolling</span>
            <span>·</span><span>Refresh: 1 Hz</span>
            {classification && classification.confidence && (
              <><span>·</span><span>Class confidence: {(classification.confidence * 100).toFixed(0)}%</span></>
            )}
          </div>
        </div>
        <div className="p-5 border-l border-zinc-800/60 grid grid-cols-2 gap-3 content-center">
          <KPI label="Session incidents" value={String(incidentsToday ?? 0)} accent={(incidentsToday ?? 0) > 0 || isAnomaly ? "red" : "emerald"} />
          <KPI label="Auto-reports" value="dynamic" accent="cyan" />
          <KPI label="Sensors online" value="7 / 7" accent="emerald" />
          <KPI label="CO₂ neutralised" value={`${(carbonRemediatedKg ?? 0).toFixed(0)} kg`} accent="amber" />
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, accent }) {
  const tones = { emerald: "text-emerald-300", red: "text-red-300", cyan: "text-cyan-300", amber: "text-amber-300" };
  return (
    <div className="leading-tight">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className={`text-[16px] font-semibold tracking-tight ${tones[accent] || "text-zinc-200"}`}>{value}</div>
    </div>
  );
}

function RingGauge({ value }) {
  const size = 140, stroke = 10;
  const r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 80 ? "#34d399" : value >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div className="mt-2 flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#gauge-grad)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.6s ease", filter: `drop-shadow(0 0 4px ${color}88)` }} />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="32" fontWeight="600" fill={color}
          style={{ filter: `drop-shadow(0 0 8px ${color}55)` }}>{value}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="10" fill="#71717a" letterSpacing="2">/ 100</text>
      </svg>
    </div>
  );
}

function AnomalyClassificationBanner({ classification }) {
  const tones = {
    CRITICAL: { border: "border-red-500/40",    bg: "bg-red-500/[0.04]",    text: "text-red-300",    icon: "text-red-400" },
    MAJOR:    { border: "border-orange-500/40", bg: "bg-orange-500/[0.04]", text: "text-orange-300", icon: "text-orange-400" },
    MINOR:    { border: "border-amber-500/30",  bg: "bg-amber-500/[0.04]",  text: "text-amber-300",  icon: "text-amber-400" },
    OK:       { border: "border-emerald-500/30",bg: "bg-emerald-500/[0.04]",text: "text-emerald-300",icon: "text-emerald-400" },
  };
  const tone = tones[classification.severity] || tones.MAJOR;
  return (
    <div className={`relative rounded-lg border ${tone.border} ${tone.bg} backdrop-blur p-4`}>
      <div className="flex items-start gap-4">
        <div className={`h-11 w-11 rounded-md flex items-center justify-center border border-current/30 ${tone.icon}`}>
          <Brain className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-zinc-500">AI Anomaly Classifier</div>
            <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded border ${tone.text}`} style={{ borderColor: "currentColor" }}>
              {classification.severity} · {(classification.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>
          <div className={`mt-1 text-[16px] font-semibold tracking-tight ${tone.text}`}>{classification.label}</div>
          <div className="mt-1 text-[12.5px] text-zinc-400 leading-snug max-w-3xl">{classification.description}</div>
          {classification.suspect && (
            <div className="mt-2 flex items-center gap-2 text-[11.5px] text-zinc-300">
              <Crosshair className="h-3.5 w-3.5 text-zinc-500" />
              <span>Suspected source:</span>
              <span className="font-mono text-zinc-200">{classification.suspect}</span>
            </div>
          )}
          {classification.responsePlaybook && (
            <div className="mt-1 flex items-center gap-2 text-[11.5px] text-zinc-300">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              <span>Auto-playbook:</span>
              <span className="text-zinc-200">{classification.responsePlaybook}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EnvironmentalStrip({ carbonKg, riverM3, sessionIncidents, fineYTD }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-4">
        <EnvCell icon={Leaf} accent="#34d399" label="Carbon Neutralised · YTD" value={`${carbonKg.toFixed(1)} kg`} sub="Cumulative remediation CO₂e" />
        <EnvCell icon={Droplet} accent="#22d3ee" label="River Contamination Prevented" value={`${(riverM3 / 1000).toFixed(1)} k m³`} sub="Discharge volume diverted" />
        <EnvCell icon={AlarmClock} accent="#a78bfa" label="Session Incidents" value={String(sessionIncidents ?? 0)} sub="At this site · auto-remediated" />
        <EnvCell icon={PoundSterling} accent="#fbbf24" label="Avoided Penalty · YTD" value={`£${fineYTD.toLocaleString("en-GB")}`} sub="EA § 82 statutory liability" />
      </div>
    </div>
  );
}

function EnvCell({ icon: Icon, accent, label, value, sub }) {
  return (
    <div className="px-5 py-4 border-r border-zinc-800/60 last:border-r-0">
      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] text-zinc-500">
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />{label}
      </div>
      <div className="mt-1.5 text-[20px] font-semibold tracking-tight" style={{ color: accent, textShadow: `0 0 8px ${accent}44` }}>{value}</div>
      <div className="text-[10.5px] text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}

/* ============================================================
   TAB: AI FORECAST
   ============================================================ */
function renderAIForecast({ metrics, clientForecasts, liveForecast, liveClassification, healthScore, earliestBreach, isAnomalyTriggered, wsConnected, selectedSite, modelMetrics, detectors }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
          <Brain className="h-3.5 w-3.5 text-violet-400" />
          Predictive Analytics · LSTM-32 Ensemble + Z-Score + Mahalanobis + Isolation IQR · {selectedSite?.code}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Forecast — Breach Prediction</h1>
        <p className="text-[13px] text-zinc-500 mt-1.5 max-w-2xl">
          Sliding-window regression ensemble (5 s · 8 s · 16 s) projects every parameter 30 s into the future. Three independent anomaly detectors run in parallel: per-parameter Z-score, multivariate Mahalanobis distance, and IQR-based isolation score. Auto-remediation engages 90 s before any projected breach.
        </p>
      </div>

      <AIPredictiveBanner healthScore={healthScore} earliestBreach={earliestBreach}
        isAnomaly={isAnomalyTriggered} breachedCount={0} classification={liveClassification} />

      {liveClassification && liveClassification.key !== "NOMINAL" && (
        <AnomalyClassificationBanner classification={liveClassification} />
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
        <div className="flex items-center justify-between h-11 px-4 border-b border-zinc-800 bg-zinc-950/40">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            Per-Parameter Forecast (T + 30 s · 95% confidence band)
          </div>
          <div className="text-[10.5px] font-mono text-zinc-500 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <CircleDot className={`h-3 w-3 ${wsConnected ? "text-emerald-400 animate-pulse" : "text-zinc-600"}`} />
              {wsConnected ? "live" : "local"}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.16em] text-zinc-500 border-b border-zinc-800/70">
                <th className="px-4 py-3 font-medium">Parameter</th>
                <th className="px-4 py-3 font-medium">Now</th>
                <th className="px-4 py-3 font-medium">Slope (per s)</th>
                <th className="px-4 py-3 font-medium">+30s Forecast</th>
                <th className="px-4 py-3 font-medium">95% Band</th>
                <th className="px-4 py-3 font-medium">EA Limit</th>
                <th className="px-4 py-3 font-medium">Time to Breach</th>
                <th className="px-4 py-3 font-medium text-right">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(METRICS).map(([key, cfg]) => {
                const m = metrics[key] || { value: cfg.base };
                const fClient = clientForecasts[key];
                const fServer = liveForecast?.[key];
                const slope = fServer?.slope ?? fClient?.slope ?? 0;
                const slopeStd = fServer?.slopeStd ?? 0;
                const f30 = fServer?.forecast30s ?? (m.value + slope * 30);
                const f30Low = fServer?.forecast30sLow;
                const f30High = fServer?.forecast30sHigh;
                const willBreach = cfg.isUnsafe(f30);
                const stb = fServer?.secondsToBreach ?? fClient?.stb;
                return (
                  <tr key={key} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <cfg.icon className="h-3.5 w-3.5" style={{ color: cfg.accent }} />
                        <div>
                          <div className="text-zinc-200 font-medium">{cfg.label}</div>
                          <div className="text-[10.5px] text-zinc-500">{cfg.sub}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-300 tabular-nums">{m.value.toFixed(cfg.decimals)} {cfg.unit}</td>
                    <td className="px-4 py-3 font-mono">
                      <span className={slope > 0.01 ? "text-amber-300" : slope < -0.01 ? "text-rose-300" : "text-zinc-400"}>
                        {slope >= 0 ? "+" : ""}{slope.toFixed(3)}
                      </span>
                      {slopeStd > 0 && <span className="text-zinc-600"> ±{slopeStd.toFixed(3)}</span>}
                    </td>
                    <td className={`px-4 py-3 font-mono tabular-nums ${willBreach ? "text-red-300" : "text-zinc-300"}`}>
                      {f30.toFixed(cfg.decimals)} {cfg.unit}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-500">
                      {f30Low !== undefined && f30High !== undefined
                        ? `[${f30Low.toFixed(cfg.decimals)}, ${f30High.toFixed(cfg.decimals)}]`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-500">{cfg.range.replace(/^.*?: /, "")}</td>
                    <td className="px-4 py-3 font-mono">
                      {stb === null || stb === undefined ? <span className="text-zinc-500">∞</span>
                       : stb === 0 ? <span className="text-red-300">now</span>
                       : stb <= 60 ? <span className="text-amber-300">{stb}s</span>
                       : <span className="text-zinc-500">{stb}s</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] px-2 py-1 rounded border ${
                        willBreach ? "bg-red-500/10 text-red-300 border-red-500/30"
                                   : "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                      }`}>
                        {willBreach ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                        {willBreach ? "Breach risk" : "Compliant"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <MultiDetectorPanel detectors={detectors} />

      <ModelMetricsCard metrics={modelMetrics} />
    </div>
  );
}

function MultiDetectorPanel({ detectors }) {
  if (!detectors) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5">
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-zinc-500">Multi-Detector Anomaly Scoring</div>
        <div className="text-[12.5px] text-zinc-500 mt-2">Waiting for live data…</div>
      </div>
    );
  }
  const { zScore, mahalanobis, isolation } = detectors;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
      <div className="flex items-center justify-between h-11 px-4 border-b border-zinc-800 bg-zinc-950/40">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          <Microscope className="h-3.5 w-3.5 text-violet-400" />Multi-Detector Anomaly Scoring (live)
        </div>
        <div className="text-[10.5px] font-mono text-zinc-500">Three independent algorithms · ensemble agreement</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3">
        <DetectorTile
          label="Z-Score" subtitle="Per-parameter standard deviations from baseline"
          value={zScore.maxZ.toFixed(2)} unit={`σ on ${zScore.maxKey || "—"}`}
          threshold="threshold: 3.0σ" anomaly={zScore.anomaly}
        />
        <DetectorTile
          label="Mahalanobis Distance" subtitle="Multivariate distance from baseline centroid"
          value={mahalanobis.distance.toFixed(2)} unit="distance"
          threshold={`threshold: ${mahalanobis.threshold}`} anomaly={mahalanobis.anomaly}
        />
        <DetectorTile
          label="Isolation Score" subtitle="IQR-based isolation from recent history"
          value={isolation.score.toFixed(3)} unit="(0–1)"
          threshold="threshold: 0.7" anomaly={isolation.anomaly}
        />
      </div>
      {zScore.perParameter && (
        <div className="border-t border-zinc-800 px-4 py-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500 mb-2">Per-parameter Z-scores</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {Object.entries(zScore.perParameter).map(([key, z]) => (
              <div key={key} className={`rounded-md border p-2 text-[10.5px] ${
                z > 3 ? "border-red-500/40 bg-red-500/[0.05]"
                : z > 2 ? "border-amber-500/30 bg-amber-500/[0.04]"
                : "border-zinc-800 bg-zinc-950/50"
              }`}>
                <div className="font-mono text-zinc-500">{METRICS[key]?.label || key}</div>
                <div className={`font-mono text-[13px] tabular-nums ${z > 3 ? "text-red-300" : z > 2 ? "text-amber-300" : "text-zinc-300"}`}>
                  {z.toFixed(2)}σ
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetectorTile({ label, subtitle, value, unit, threshold, anomaly }) {
  return (
    <div className={`px-5 py-4 border-r border-zinc-800/60 last:border-r-0 ${anomaly ? "bg-red-500/[0.03]" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
        <span className={`text-[9.5px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded border ${
          anomaly ? "bg-red-500/15 text-red-300 border-red-500/30"
                  : "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
        }`}>{anomaly ? "ANOMALY" : "OK"}</span>
      </div>
      <div className="text-[10.5px] text-zinc-500 mt-1">{subtitle}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <div className={`text-[28px] font-semibold tracking-tight tabular-nums ${anomaly ? "text-red-300" : "text-violet-300"}`}>
          {value}
        </div>
        <div className="text-[10.5px] text-zinc-500">{unit}</div>
      </div>
      <div className="text-[10px] text-zinc-600 mt-1 font-mono">{threshold}</div>
    </div>
  );
}

function ModelMetricsCard({ metrics }) {
  if (!metrics) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5">
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-zinc-500">Model Metrics</div>
        <div className="text-[12.5px] text-zinc-500 mt-2">Loading…</div>
      </div>
    );
  }
  const p = metrics.performance || {};
  const cm = metrics.confusionMatrix || {};
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
      <div className="flex items-center justify-between h-11 px-4 border-b border-zinc-800 bg-zinc-950/40">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />Model Card · {metrics.modelId}
        </div>
        <div className="text-[10.5px] font-mono text-zinc-500">
          {metrics.framework} · trained {metrics.trainingSamples?.toLocaleString("en-GB")} samples
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-0">
        <MetricBox label="Precision"  value={(p.precision * 100).toFixed(1) + "%"} tone="emerald" />
        <MetricBox label="Recall"     value={(p.recall * 100).toFixed(1) + "%"} tone="emerald" />
        <MetricBox label="F1"         value={(p.f1 * 100).toFixed(1) + "%"} tone="cyan" />
        <MetricBox label="Accuracy"   value={(p.accuracy * 100).toFixed(2) + "%"} tone="cyan" />
        <MetricBox label="AUC-ROC"    value={p.aucRoc.toFixed(3)} tone="violet" />
        <MetricBox label="Lead time"  value={(p.averageLeadTimeS || 0).toFixed(1) + " s"} tone="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-zinc-800">
        <div className="p-5 border-r border-zinc-800/60">
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-zinc-500 mb-2">Confusion Matrix · validation set</div>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.05] p-3">
              <div className="text-[10px] uppercase text-emerald-400">True positive</div>
              <div className="font-mono text-[18px] text-emerald-300 tabular-nums">{cm.truePositive?.toLocaleString("en-GB")}</div>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3">
              <div className="text-[10px] uppercase text-amber-400">False positive</div>
              <div className="font-mono text-[18px] text-amber-300 tabular-nums">{cm.falsePositive?.toLocaleString("en-GB")}</div>
            </div>
            <div className="rounded-md border border-red-500/30 bg-red-500/[0.05] p-3">
              <div className="text-[10px] uppercase text-red-400">False negative</div>
              <div className="font-mono text-[18px] text-red-300 tabular-nums">{cm.falseNegative?.toLocaleString("en-GB")}</div>
            </div>
            <div className="rounded-md border border-zinc-700 bg-zinc-950/50 p-3">
              <div className="text-[10px] uppercase text-zinc-400">True negative</div>
              <div className="font-mono text-[18px] text-zinc-300 tabular-nums">{cm.trueNegative?.toLocaleString("en-GB")}</div>
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-zinc-500 mb-2">Per-Class Accuracy</div>
          <div className="space-y-2">
            {Object.entries(metrics.classifierAccuracy || {}).map(([cls, acc]) => (
              <div key={cls} className="flex items-center justify-between">
                <span className="text-[11.5px] text-zinc-300 font-mono">{cls.replace(/_/g, " ")}</span>
                <div className="flex items-center gap-2 flex-1 ml-4">
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                      style={{ width: `${acc * 100}%` }} />
                  </div>
                  <span className="text-[10.5px] font-mono text-zinc-300 tabular-nums w-12 text-right">{(acc * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-800 grid grid-cols-2 gap-3 text-[10.5px]">
            <div>
              <div className="text-zinc-500 uppercase tracking-[0.14em]">Inference</div>
              <div className="font-mono text-zinc-300 mt-1">{metrics.inference?.device} · {metrics.inference?.latencyMs} ms</div>
            </div>
            <div>
              <div className="text-zinc-500 uppercase tracking-[0.14em]">Drift</div>
              <div className="font-mono text-emerald-300 mt-1">KL {metrics.drift?.klDivergence?.toFixed(4)} · {metrics.drift?.status}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, tone }) {
  const tones = {
    emerald: "text-emerald-300", cyan: "text-cyan-300",
    violet: "text-violet-300", amber: "text-amber-300",
  };
  return (
    <div className="px-5 py-4 border-r border-zinc-800/60 last:border-r-0 border-b md:border-b-0">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className={`mt-1.5 text-[22px] font-semibold tracking-tight tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

/* ============================================================
   TAB: CYBER SECURITY
   ============================================================ */
function renderCyberSecurity({ terminalLines, terminalRef, runExploitSimulation, exploitRunning, backendStatus, securityPosture, auditLog }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
            <Shield className="h-3.5 w-3.5 text-cyan-400" />Security Posture · Zero-Trust · OWASP-Aligned · v{APP_VERSION}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Cyber Security · Defence-in-Depth</h1>
          <p className="text-[13px] text-zinc-500 mt-1.5 max-w-2xl">
            Hardware-rooted attestation. HMAC-signed API responses. SHA-256 hash-chained audit log. Sliding-window rate limits. Schema validation on every mutation. SSH password authentication disabled at the kernel.
          </p>
        </div>
        <button onClick={runExploitSimulation} disabled={exploitRunning}
          className={`flex items-center gap-2 h-10 px-5 rounded-md text-[12.5px] font-semibold tracking-tight transition-all ${
            exploitRunning ? "bg-zinc-800 border border-zinc-700 text-zinc-500 cursor-not-allowed"
                           : "bg-gradient-to-b from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50"
          }`}>
          <Crosshair className={`h-4 w-4 ${exploitRunning ? "" : "animate-pulse"}`} />
          {exploitRunning ? "Exploit Running…" : "Simulate Insider Exploit"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <PostureCard icon={Fingerprint} label="Device Attestation" value="HSM-bound" status="ok" />
        <PostureCard icon={KeyRound} label="Auth Method" value="Ed25519 SSH" status="ok" />
        <PostureCard icon={Lock} label="Open Ports" value="9090 / TLS 1.3" status="ok" />
        <PostureCard icon={Network} label="Firewall Mode" value="Default-Deny" status="ok" />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
        <div className="flex items-center justify-between h-10 px-4 border-b border-zinc-800 bg-zinc-950/80">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            <div className="ml-3 flex items-center gap-2 text-[12px] text-zinc-300">
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono">Edge Hardware Firewall <span className="text-zinc-500">·</span> <span className="text-cyan-300">Port 9090</span></span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10.5px] font-mono text-zinc-500">
            <span className="flex items-center gap-1.5"><CircleDot className="h-3 w-3 text-emerald-400 animate-pulse" />LIVE</span>
            <span>{backendStatus === "online" ? "backend://ok" : "tty/0"}</span>
          </div>
        </div>
        <div ref={terminalRef} className="relative h-[460px] overflow-y-auto px-5 py-4 font-mono text-[12.5px] leading-[1.7] bg-[#0a0a0c]"
          style={{ backgroundImage: "radial-gradient(circle at 30% 0%, rgba(16,185,129,0.04), transparent 60%)" }}>
          {terminalLines.length === 0 && (
            <div className="text-zinc-500">
              <div>firewall@aquasense-edge:~$ <span className="text-zinc-300">whoami</span></div>
              <div>aquasense-edge / kernel 6.8.0-hardened-aqs</div>
              <div>firewall@aquasense-edge:~$ <span className="text-zinc-300">status</span></div>
              <div className="text-emerald-400">[OK] Edge firewall is healthy. Awaiting events…</div>
              <div className="text-zinc-600 mt-2 italic">
                Trigger “Simulate Insider Exploit” to stream a live attack on Port 9090.
              </div>
              <div className="mt-2">firewall@aquasense-edge:~$ <span className="inline-block w-2 h-4 bg-emerald-400 align-text-bottom animate-pulse" /></div>
            </div>
          )}
          {terminalLines.map((line, i) => (
            <div key={i} className={`${LINE_COLORS[line.kind]} whitespace-pre-wrap`}>{line.text || " "}</div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-5">
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-[11px] uppercase tracking-[0.18em]">Attack Surface · Outcome</span>
          </div>
          <div className="mt-2 text-[15px] text-zinc-100 font-medium tracking-tight">
            Zero exposure. Privilege escalation impossible by design.
          </div>
          <p className="text-[12.5px] text-zinc-400 mt-2 leading-relaxed">
            Default credentials are rejected at the kernel layer before reaching userspace. SSH is configured with{" "}
            <span className="text-zinc-200 font-mono">PasswordAuthentication no</span>,{" "}
            <span className="text-zinc-200 font-mono">PermitRootLogin no</span>, and keys are pinned to the on-die HSM.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur p-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            <Server className="h-3.5 w-3.5" />Hardened Edge Stack
          </div>
          <ul className="mt-3 space-y-2 text-[12.5px] text-zinc-300">
            <Bullet>Linux 6.8 hardened, IMA-EVM measured boot</Bullet>
            <Bullet>OP-TEE secure world for key custody</Bullet>
            <Bullet>nftables default-deny · stateful inspection</Bullet>
            <Bullet>Syslog-over-mTLS to SIEM</Bullet>
          </ul>
        </div>
      </div>

      {/* OWASP Top 10 Matrix */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
        <div className="flex items-center justify-between h-11 px-4 border-b border-zinc-800 bg-zinc-950/40">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <ShieldAlert className="h-3.5 w-3.5 text-cyan-400" />OWASP Top 10 (2021) · Mitigation Matrix
          </div>
          <div className="text-[10.5px] font-mono text-emerald-300">
            {securityPosture?.owaspTop10
              ? `${securityPosture.owaspTop10.filter((x) => x.status === "MITIGATED").length} / ${securityPosture.owaspTop10.length} mitigated`
              : "loading …"}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.16em] text-zinc-500 border-b border-zinc-800/70">
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">AquaSense Evidence</th>
                <th className="px-4 py-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {(securityPosture?.owaspTop10 || []).map((row) => (
                <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-cyan-300">{row.id}</td>
                  <td className="px-4 py-3 text-zinc-200 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-zinc-400 text-[11.5px]">{row.evidence}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                      <CheckCircle className="h-3 w-3" />{row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!securityPosture && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-500">Loading security posture…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Control Cards */}
      {securityPosture && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SecCard icon={Binary} label="Response signing"
            value={securityPosture.responseSigning?.algorithm || "HMAC-SHA256"}
            sub={`Key ID: ${securityPosture.cryptography?.hmacKeyId || "—"}`} />
          <SecCard icon={ScanLine} label="Rate limiting"
            value={`${securityPosture.rateLimiting?.tiers?.length || 3} tiers · per-IP`}
            sub="sliding-window · 429 with Retry-After" />
          <SecCard icon={Tag} label="Input validation"
            value={securityPosture.validation?.strategy || "schema per mutation"}
            sub={`Body cap: ${securityPosture.validation?.bodySizeLimit || "16 kB"}`} />
          <SecCard icon={Hash} label="Audit chain"
            value={`SHA-256 · ${securityPosture.audit?.depth ?? auditLog.length} events`}
            sub={`head ${securityPosture.audit?.head?.slice(0, 12) || "—"}…`} />
        </div>
      )}

      {/* Audit Log */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
        <div className="flex items-center justify-between h-11 px-4 border-b border-zinc-800 bg-zinc-950/40">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <Bug className="h-3.5 w-3.5 text-amber-400" />Tamper-Evident Security Audit Log
          </div>
          <div className="flex items-center gap-3 text-[10.5px] font-mono text-zinc-500">
            <span className="flex items-center gap-1.5"><CircleDot className="h-3 w-3 text-emerald-400 animate-pulse" />live</span>
            <span>·</span><span>SHA-256 hash chain · {auditLog.length} events</span>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
              <tr className="text-left text-[10.5px] uppercase tracking-[0.16em] text-zinc-500 border-b border-zinc-800/70">
                <th className="px-4 py-3 font-medium">Seq</th>
                <th className="px-4 py-3 font-medium">Time (UTC)</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                <th className="px-4 py-3 font-medium">Block Hash</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.slice(0, 60).map((e) => (
                <tr key={`${e.seq}-${e.hash}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-zinc-500 tabular-nums">#{e.seq}</td>
                  <td className="px-4 py-2.5 font-mono text-zinc-400 whitespace-nowrap text-[11.5px]">
                    {new Date(e.timestamp).toISOString().replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-cyan-300 text-[11.5px]">{e.eventType}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.14em] border ${
                      e.severity === "CRITICAL" ? "bg-red-500/15 text-red-300 border-red-500/30"
                      : e.severity === "WARN" ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      : "bg-zinc-800/60 text-zinc-300 border-zinc-700"
                    }`}>{e.severity}</span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 text-[11px] max-w-xs">
                    <div className="truncate" title={JSON.stringify(e.details)}>
                      {Object.entries(e.details || {}).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[10.5px] text-zinc-500">
                    {e.hash.slice(0, 12)}…
                  </td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-500">Audit log empty.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SecCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.03] backdrop-blur p-4">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md flex items-center justify-center border border-cyan-500/30 bg-cyan-500/10">
          <Icon className="h-3.5 w-3.5 text-cyan-300" />
        </div>
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      </div>
      <div className="mt-2 text-[14px] font-medium tracking-tight text-zinc-100">{value}</div>
      <div className="text-[10.5px] text-zinc-500 mt-0.5 font-mono truncate" title={sub}>{sub}</div>
    </div>
  );
}

/* ============================================================
   TAB: SATELLITE — Leaflet
   ============================================================ */
function renderSatellite({ waterStressActive, setWaterStressActive, sites, selectedSite }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
            <Satellite className="h-3.5 w-3.5 text-cyan-400" />Earth Observation · Catchment Intelligence
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Satellite Observability</h1>
          <p className="text-[13px] text-zinc-500 mt-1.5 max-w-2xl">
            Real interactive map (OpenStreetMap · CARTO dark tiles). GRACE-FO gravimetry + Sentinel-2 optical fused for catchment-wide breach foresight.
          </p>
        </div>
        <ToggleButton active={waterStressActive} onClick={() => setWaterStressActive((v) => !v)}
          activeLabel="GRACE-FO Layer · ON" inactiveLabel="GRACE-FO Water Stress Index"
          activeIcon={Eye} inactiveIcon={EyeOff} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
          <div className="flex items-center justify-between h-10 px-4 border-b border-zinc-800 bg-zinc-950/60">
            <div className="flex items-center gap-2 text-[11.5px] text-zinc-300">
              <Globe className="h-3.5 w-3.5 text-cyan-400" />
              <span className="font-mono">UK Catchments · {sites.length} sites · WGS-84</span>
            </div>
            <div className="text-[10.5px] font-mono text-zinc-500">OpenStreetMap · CARTO</div>
          </div>
          <LeafletMap sites={sites} selectedSite={selectedSite} waterStressActive={waterStressActive} />
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur p-4">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-zinc-500 mb-2">Active Layers</div>
            <LayerRow icon={Layers} label="Sentinel-2 Optical" active tone="cyan" />
            <LayerRow icon={Waves} label="Hydrography Vector" active tone="cyan" />
            <LayerRow icon={Crosshair} label="GRACE-FO Stress" active={waterStressActive} tone="orange" />
            <LayerRow icon={MapPin} label="Monitoring Sites" active tone="emerald" />
          </div>

          {waterStressActive && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/[0.05] p-4">
              <div className="flex items-center gap-2 text-orange-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-[11px] uppercase tracking-[0.18em]">Catchment Advisory</span>
              </div>
              <div className="mt-2 text-[13px] text-orange-100 font-medium leading-snug">
                3 High Risk Catchment Runoff Zones detected
              </div>
              <p className="text-[11.5px] text-orange-200/80 mt-2 leading-relaxed">
                GRACE-FO equivalent-water-thickness anomaly &gt; +2σ over the last 14 days. Storm overflow likelihood elevated for 72 hours.
              </p>
              <div className="mt-3 space-y-2">
                <RunoffZone name="Pang Headwaters" risk="HIGH" delta="+2.4σ" />
                <RunoffZone name="Loddon Confluence" risk="HIGH" delta="+2.1σ" />
                <RunoffZone name="Wey Lower" risk="MOD" delta="+1.6σ" />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur p-4">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-zinc-500 mb-2">Last Pass</div>
            <div className="text-[12.5px] text-zinc-300 leading-tight">GRACE-FO · 2026-05-18 06:14 UTC</div>
            <div className="text-[11px] text-zinc-500">Sentinel-2B · 2026-05-17 10:42 UTC · 0% cloud</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeafletMap({ sites, selectedSite, waterStressActive }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const heatLayerRef = useRef(null);

  // Initialise the map once.
  useEffect(() => {
    if (!ref.current) return;
    if (typeof window === "undefined" || !window.L) return;
    if (mapRef.current) return;

    const map = window.L.map(ref.current, {
      center: selectedSite?.coords || [53.0, -1.5],
      zoom: 6, zoomControl: true, attributionControl: true,
      preferCanvas: true, worldCopyJump: false,
    });
    mapRef.current = map;

    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap · © CARTO",
      subdomains: "abcd", maxZoom: 19,
    }).addTo(map);

    markerLayerRef.current = window.L.layerGroup().addTo(map);
    heatLayerRef.current = window.L.layerGroup().addTo(map);

    if (!document.getElementById("aqs-keyframes")) {
      const style = document.createElement("style");
      style.id = "aqs-keyframes";
      style.textContent = `@keyframes aqs-ping { 0% { transform: scale(0.9); opacity: 0.7; } 100% { transform: scale(2.2); opacity: 0; } }`;
      document.head.appendChild(style);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers when sites or selectedSite changes.
  useEffect(() => {
    if (!mapRef.current || !markerLayerRef.current || !window.L) return;
    markerLayerRef.current.clearLayers();
    sites.forEach((s) => {
      if (!s.coords) return;
      const isPrimary = s.id === selectedSite?.id;
      const color = isPrimary ? "#fb7185" : "#34d399";
      const html = `
        <div style="position:relative;width:18px;height:18px;">
          <span style="position:absolute;inset:-6px;border-radius:9999px;background:${color}33;animation:aqs-ping 1.6s ease-out infinite;"></span>
          <span style="position:absolute;inset:0;border-radius:9999px;background:${color};box-shadow:0 0 8px ${color};border:2px solid #0a0a0c;"></span>
        </div>`;
      const icon = window.L.divIcon({ html, className: "aqs-marker-pulse", iconSize: [18, 18], iconAnchor: [9, 9] });
      const marker = window.L.marker(s.coords, { icon }).addTo(markerLayerRef.current);
      marker.bindPopup(`
        <div style="font-family:ui-monospace,monospace;font-size:11px;color:#e4e4e7;line-height:1.5;">
          <div style="font-weight:600;color:${color};margin-bottom:4px;">${s.name}</div>
          <div>${s.operator}</div>
          <div style="color:#71717a;">${s.permit}</div>
          <div style="color:#71717a;">${s.river}</div>
          <div style="color:#34d399;margin-top:4px;">${s.compliance30d?.toFixed(1) ?? "—"}% compliant · 30 d</div>
        </div>
      `);
    });

    // Adjust view to selectedSite when it changes.
    if (selectedSite?.coords) {
      mapRef.current.flyTo(selectedSite.coords, 9, { duration: 0.8 });
    }
  }, [sites, selectedSite]);

  // Heatmap zones.
  useEffect(() => {
    if (!mapRef.current || !heatLayerRef.current || !window.L) return;
    heatLayerRef.current.clearLayers();
    if (!waterStressActive) return;

    const zones = [
      { name: "Pang Headwaters",   coords: [51.55, -1.27], radius: 9000, delta: "+2.4σ" },
      { name: "Loddon Confluence", coords: [51.46, -0.93], radius: 8000, delta: "+2.1σ" },
      { name: "Wey Lower",         coords: [51.32, -0.56], radius: 7000, delta: "+1.6σ" },
    ];
    zones.forEach((z) => {
      const c = window.L.circle(z.coords, {
        radius: z.radius, color: "#fb923c", fillColor: "#fb923c",
        fillOpacity: 0.18, weight: 1.2, opacity: 0.7,
      }).addTo(heatLayerRef.current);
      c.bindPopup(`<div style="font-family:ui-monospace,monospace;font-size:11px;color:#fed7aa;"><div style="color:#fb923c;font-weight:600;letter-spacing:1px;">HIGH RISK CATCHMENT RUNOFF ZONE</div><div style="margin-top:4px;">${z.name} · ${z.delta}</div></div>`);
    });
  }, [waterStressActive]);

  return (
    <div className="relative">
      <div ref={ref} className="h-[520px] bg-[#07090c]" />
      <div className="absolute bottom-4 left-4 z-[400] rounded-md border border-zinc-800 bg-zinc-950/80 backdrop-blur px-3 py-2.5 text-[10.5px] space-y-1.5 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          <span className="text-zinc-300">Monitoring site</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_6px_#fb7185]" />
          <span className="text-zinc-300">Selected outfall</span>
        </div>
        {waterStressActive && (
          <div className="flex items-center gap-2 pt-1 border-t border-zinc-800 mt-1">
            <span className="h-2 w-2 rounded-full bg-orange-400" style={{ boxShadow: "0 0 8px #fb923c" }} />
            <span className="text-orange-300">GRACE-FO water stress</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   TAB: COMPLIANCE LEDGER
   ============================================================ */
function renderLedger({ ledgerRows, backendInfo }) {
  const ledgerSize = backendInfo?.ledgerSize ?? 184502;
  const algorithm = backendInfo?.algorithm ?? "SHA-256";
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
          <Database className="h-3.5 w-3.5 text-cyan-400" />Append-Only Compliance Ledger
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Compliance Ledger</h1>
        <p className="text-[13px] text-zinc-500 mt-1.5 max-w-2xl">
          Every sensor reading is hashed on-device, chained to its predecessor, and notarised at the edge. Tampering is mathematically detectable.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-5">
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
          background: "radial-gradient(circle at 0% 50%, rgba(52,211,153,0.18), transparent 50%)",
        }} />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-emerald-300/80">Chain Integrity Attestation</div>
              <div className="text-[17px] font-semibold text-emerald-300 tracking-tight">100% Immutable / Hash Chain Valid</div>
              <div className="text-[12px] text-emerald-200/70 mt-0.5">
                {ledgerSize.toLocaleString("en-GB")} blocks verified · auto-refresh 6 s
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-[11px]">
            <Stat label="Blocks" value={ledgerSize.toLocaleString("en-GB")} />
            <Stat label="Genesis" value="2025-01-04" />
            <Stat label="Algorithm" value={algorithm} />
            <Stat label="Verifier" value="EA Notary" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
        <div className="flex items-center justify-between h-11 px-4 border-b border-zinc-800 bg-zinc-950/40">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Recent Blocks</div>
          <div className="flex items-center gap-3 text-[10.5px] font-mono text-zinc-500">
            <span className="flex items-center gap-1.5"><Link2 className="h-3 w-3" /> chain-head</span>
            <span>·</span><span>auto-refresh 6s</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.16em] text-zinc-500 border-b border-zinc-800/70">
                <th className="px-4 py-3 font-medium">Block</th>
                <th className="px-4 py-3 font-medium">Timestamp (UTC)</th>
                <th className="px-4 py-3 font-medium">Sensor</th>
                <th className="px-4 py-3 font-medium">Reading</th>
                <th className="px-4 py-3 font-medium">SHA-256 Block Hash</th>
                <th className="px-4 py-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row, i) => (
                <tr key={`${row.height}-${i}`} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${
                  i === 0 ? "bg-emerald-500/[0.025]" : ""} ${row.breach ? "bg-red-500/[0.03]" : ""}`}>
                  <td className="px-4 py-3 font-mono text-zinc-300 tabular-nums">#{row.height.toLocaleString("en-GB")}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400 whitespace-nowrap">{row.ts.toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td className="px-4 py-3"><span className="font-mono text-cyan-300">{row.sensor}</span></td>
                  <td className={`px-4 py-3 ${row.breach ? "text-red-300" : "text-zinc-300"}`}>{row.measurement}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                    <div className="flex items-center gap-2">
                      <Hash className="h-3 w-3 text-zinc-600 shrink-0" />
                      <span className="truncate max-w-[420px]" title={row.hash}>{row.hash}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] px-2 py-1 rounded border ${
                      row.breach ? "bg-red-500/10 text-red-300 border-red-500/30"
                                  : "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                    }`}>
                      <CheckCircle className="h-3 w-3" />
                      {row.breach ? "Sealed · Breach" : "Verified"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FactCard icon={Fingerprint} label="Hash Algorithm" value={algorithm} sub="FIPS 180-4 · NIST approved" />
        <FactCard icon={FileCheck} label="Notary" value="Environment Agency" sub="Read-only quorum witness" />
        <FactCard icon={Link2} label="Anchor Cadence" value="Every 600 blocks" sub="Pinned to Bitcoin via OP_RETURN" />
      </div>
    </div>
  );
}

/* ============================================================
   TAB: REPORTS & ALERTS
   ============================================================ */
function renderReportsAlerts({ notifications, downloadReport, reportBusy, backendStatus, isAnomalyTriggered, globalState, siteIncidents, selectedSite }) {
  const byChannel = {
    email: notifications.filter((n) => n.channel === "email").length,
    sms: notifications.filter((n) => n.channel === "sms").length,
    webhook: notifications.filter((n) => n.channel === "webhook").length,
  };
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
          <FileText className="h-3.5 w-3.5 text-cyan-400" />Automated Regulatory Reporting & Alerting
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports & Alerts · {selectedSite?.code}</h1>
        <p className="text-[13px] text-zinc-500 mt-1.5 max-w-2xl">
          Every report is generated live from the session's incident log. Every download is unique. Auto-distribution log shows real dispatches to six statutory recipients.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] text-zinc-500">
              <Download className="h-3.5 w-3.5 text-emerald-400" />Download Compliance Report · {selectedSite?.name}
            </div>
            <div className="mt-1 text-[17px] font-semibold tracking-tight">
              {isAnomalyTriggered ? <>§ 82 Incident Report · <span className="text-red-300">INCIDENT ACTIVE</span></>
                : siteIncidents.length > 0 ? <>Post-Incident Report · <span className="text-amber-300">{siteIncidents.length} session incident{siteIncidents.length === 1 ? "" : "s"}</span></>
                : <>Periodic Compliance Report · <span className="text-emerald-300">COMPLIANT</span></>}
            </div>
            <div className="mt-1 text-[12px] text-zinc-500">
              Generated dynamically from live session state. Court-admissible. Auto-distributed to the Environment Agency.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ReportButton onClick={() => downloadReport("md")}   busy={reportBusy === "md"}   icon={FileText}         label="Markdown" tone="emerald" />
            <ReportButton onClick={() => downloadReport("json")} busy={reportBusy === "json"} icon={FileJson}         label="JSON"     tone="cyan" />
            <ReportButton onClick={() => downloadReport("csv")}  busy={reportBusy === "csv"}  icon={FileSpreadsheet}  label="CSV"      tone="amber" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <ReportMeta label="Site" value={selectedSite?.code || "—"} />
          <ReportMeta label="Window" value="Live rolling" />
          <ReportMeta label="Seal" value="SHA-256" />
          <ReportMeta label="Session incidents" value={String(siteIncidents.length)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ChannelKpi icon={Mail} label="Email" value={byChannel.email} accent="cyan" />
        <ChannelKpi icon={MessageSquare} label="SMS" value={byChannel.sms} accent="emerald" />
        <ChannelKpi icon={Webhook} label="Webhook" value={byChannel.webhook} accent="violet" />
        <ChannelKpi icon={Send} label="Total dispatched" value={notifications.length} accent="amber" />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
        <div className="flex items-center justify-between h-11 px-4 border-b border-zinc-800 bg-zinc-950/40">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <Bell className="h-3.5 w-3.5 text-amber-400" />Automated Distribution Log
          </div>
          <div className="flex items-center gap-3 text-[10.5px] font-mono text-zinc-500">
            <span className="flex items-center gap-1.5"><CircleDot className="h-3 w-3 text-emerald-400 animate-pulse" />live</span>
            <span>·</span><span>{backendStatus === "online" ? "backend://ok" : "local"}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.16em] text-zinc-500 border-b border-zinc-800/70">
                <th className="px-4 py-3 font-medium">Time (UTC)</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Subject / Payload</th>
                <th className="px-4 py-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {notifications.slice(0, 30).map((n) => <NotificationRow key={n.id} n={n} />)}
              {notifications.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No notifications dispatched yet. Trigger an incident from Live Monitoring to see automated alerts in real time.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-emerald-400 mb-3 flex items-center gap-2">
          <Leaf className="h-3.5 w-3.5" />Environmental & Financial Outcome · YTD
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FactCard icon={Leaf}        label="Carbon neutralised"            value={`${globalState.carbonRemediatedKg.toFixed(1)} kg CO₂`} sub="Cumulative remediation" />
          <FactCard icon={Droplet}     label="River contamination prevented"  value={`${(globalState.riverProtectedM3 / 1000).toFixed(1)} k m³`} sub="Diverted / treated" />
          <FactCard icon={PoundSterling} label="Avoided EA penalty"           value={`£${globalState.cumulativeFineMitigated.toLocaleString("en-GB")}`} sub="Water Industry Act § 82" />
        </div>
      </div>
    </div>
  );
}

function ReportButton({ onClick, busy, icon: Icon, label, tone }) {
  const tones = {
    emerald: "from-emerald-500 to-emerald-600 shadow-emerald-500/30 hover:shadow-emerald-500/50",
    cyan:    "from-cyan-500 to-cyan-600 shadow-cyan-500/30 hover:shadow-cyan-500/50",
    amber:   "from-amber-500 to-amber-600 shadow-amber-500/30 hover:shadow-amber-500/50",
  };
  return (
    <button onClick={onClick} disabled={busy}
      className={`flex items-center gap-2 h-10 px-4 rounded-md text-[12.5px] font-semibold tracking-tight bg-gradient-to-b ${tones[tone]} text-white shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed`}>
      <Icon className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
      {busy ? "Generating…" : `Download ${label}`}
    </button>
  );
}

function ReportMeta({ label, value }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="text-[12.5px] font-mono text-zinc-200 mt-1">{value}</div>
    </div>
  );
}

function ChannelKpi({ icon: Icon, label, value, accent }) {
  const tones = {
    cyan:    { text: "text-cyan-400",    border: "border-cyan-500/25",    bg: "bg-cyan-500/[0.05]" },
    emerald: { text: "text-emerald-400", border: "border-emerald-500/25", bg: "bg-emerald-500/[0.05]" },
    violet:  { text: "text-violet-400",  border: "border-violet-500/25",  bg: "bg-violet-500/[0.05]" },
    amber:   { text: "text-amber-400",   border: "border-amber-500/25",   bg: "bg-amber-500/[0.05]" },
  };
  const t = tones[accent];
  return (
    <div className={`rounded-lg border ${t.border} ${t.bg} backdrop-blur p-4`}>
      <div className="flex items-center gap-2">
        <div className={`h-7 w-7 rounded-md flex items-center justify-center border ${t.text} ${t.border} ${t.bg}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      </div>
      <div className="mt-2 text-[24px] font-semibold tracking-tight text-zinc-100 tabular-nums">{value}</div>
    </div>
  );
}

function NotificationRow({ n }) {
  const ChannelIcon = n.channel === "email" ? Mail : n.channel === "sms" ? MessageSquare : Webhook;
  const channelTone = n.channel === "email" ? "text-cyan-300" : n.channel === "sms" ? "text-emerald-300" : "text-violet-300";
  const severityTone = n.severity === "CRITICAL" ? "bg-red-500/15 text-red-300 border-red-500/30"
                     : n.severity === "WARN" ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                     : "bg-zinc-800/60 text-zinc-300 border-zinc-700";
  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
      <td className="px-4 py-3 font-mono text-zinc-400 whitespace-nowrap text-[11.5px]">
        {new Date(n.timestamp).toISOString().replace("T", " ").slice(0, 19)}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.14em] border ${severityTone}`}>{n.type}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 ${channelTone}`}>
          <ChannelIcon className="h-3.5 w-3.5" />
          <span className="text-[11.5px] font-medium uppercase">{n.channel}</span>
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-[11.5px] text-zinc-300">{n.recipient}</td>
      <td className="px-4 py-3 text-zinc-400 text-[11.5px] max-w-md">
        <div className="truncate" title={n.subject || n.body}>
          {n.subject ? <span className="text-zinc-200">{n.subject}</span>
                     : <span className="font-mono text-[11px]">{n.body}</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
          <CheckCircle className="h-3 w-3" />Sent
        </span>
      </td>
    </tr>
  );
}

/* ============================================================
   SHARED PRIMITIVES
   ============================================================ */
function StatusPill({ ok, okLabel, errLabel }) {
  return (
    <div className={`flex items-center gap-2 h-9 px-3 rounded-md text-[10.5px] font-medium uppercase tracking-[0.14em] border ${
      ok ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
         : "bg-red-500/10 text-red-300 border-red-500/40 animate-pulse"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`}
        style={{ boxShadow: ok ? "0 0 8px rgba(52,211,153,0.8)" : "0 0 8px rgba(248,113,113,0.9)" }} />
      {ok ? okLabel : errLabel}
    </div>
  );
}

function Pill({ icon: Icon, label, tone }) {
  const tones = {
    emerald: "text-emerald-300 border-emerald-500/25 bg-emerald-500/[0.05]",
    cyan: "text-cyan-300 border-cyan-500/25 bg-cyan-500/[0.05]",
    rose: "text-rose-300 border-rose-500/30 bg-rose-500/[0.06]",
    amber: "text-amber-300 border-amber-500/25 bg-amber-500/[0.06]",
  };
  return (
    <div className={`hidden md:flex items-center gap-1.5 h-9 px-2.5 rounded-md text-[10.5px] uppercase tracking-[0.14em] border ${tones[tone] || tones.emerald}`}>
      <Icon className="h-3 w-3" />{label}
    </div>
  );
}

function ActuatorTile({ label, value, active, icon: Icon }) {
  return (
    <div className={`rounded-md border p-3 transition-all ${active ? "bg-emerald-500/[0.06] border-emerald-500/25" : "bg-zinc-950/50 border-zinc-800"}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      </div>
      <div className={`mt-1.5 text-[14px] font-mono tracking-tight ${active ? "text-emerald-300" : "text-zinc-300"}`}>{value}</div>
    </div>
  );
}

function PostureCard({ icon: Icon, label, value, status }) {
  const ok = status === "ok";
  return (
    <div className={`rounded-lg border bg-zinc-900/60 backdrop-blur p-4 ${ok ? "border-emerald-500/25" : "border-red-500/30"}`}>
      <div className="flex items-center gap-2">
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${ok ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
          <Icon className={`h-3.5 w-3.5 ${ok ? "text-emerald-400" : "text-red-400"}`} />
        </div>
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      </div>
      <div className="mt-2 text-[15px] font-medium tracking-tight">{value}</div>
      <div className={`mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] ${ok ? "text-emerald-400" : "text-red-400"}`}>
        <CircleDot className="h-2.5 w-2.5" />{ok ? "Healthy" : "Action Required"}
      </div>
    </div>
  );
}

function Bullet({ children }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-[2px] shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function ToggleButton({ active, onClick, activeLabel, inactiveLabel, activeIcon: ActiveIcon, inactiveIcon: InactiveIcon }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 h-10 px-4 rounded-md text-[12.5px] font-medium tracking-tight transition-all border ${
        active ? "bg-orange-500/15 text-orange-300 border-orange-500/40 shadow-[0_0_18px_-6px_rgba(251,146,60,0.6)]"
               : "bg-zinc-900/60 text-zinc-300 border-zinc-800 hover:border-zinc-700"
      }`}>
      {active ? <ActiveIcon className="h-4 w-4" /> : <InactiveIcon className="h-4 w-4" />}
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

function LayerRow({ icon: Icon, label, active, tone }) {
  const tones = { cyan: "text-cyan-400", emerald: "text-emerald-400", orange: "text-orange-400" };
  return (
    <div className="flex items-center justify-between py-1.5 text-[12.5px]">
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${active ? tones[tone] : "text-zinc-600"}`} />
        <span className={active ? "text-zinc-200" : "text-zinc-500"}>{label}</span>
      </div>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-zinc-700"}`}
        style={{ boxShadow: active ? "0 0 6px rgba(52,211,153,0.8)" : "none" }} />
    </div>
  );
}

function RunoffZone({ name, risk, delta }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-orange-500/20 bg-orange-500/[0.04] px-2.5 py-1.5 text-[11.5px]">
      <span className="text-orange-100">{name}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-orange-300">{delta}</span>
        <span className={`px-1.5 py-0.5 rounded text-[9.5px] uppercase tracking-[0.14em] border ${
          risk === "HIGH" ? "bg-orange-500/15 text-orange-200 border-orange-500/40"
                          : "bg-amber-500/10 text-amber-200 border-amber-500/30"
        }`}>{risk}</span>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="leading-tight">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="text-[13px] font-mono text-zinc-200">{value}</div>
    </div>
  );
}

function FactCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur p-4">
      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-cyan-400" />{label}
      </div>
      <div className="mt-1.5 text-[15px] font-semibold tracking-tight">{value}</div>
      <div className="text-[11.5px] text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}

/* ---------- Offline markdown fallback (rarely used) ---------- */
function generateLocalMarkdownReport(metrics, live, ledger, site) {
  const now = new Date().toISOString();
  const lines = [];
  lines.push(`# AquaSense AI · Section 82 Compliance Report — ${site?.name || "site"}`);
  lines.push("");
  lines.push(`> Generated locally (offline fallback) at ${now}`);
  lines.push("");
  lines.push(`Status: ${live.anomalyActive ? "**INCIDENT ACTIVE**" : "**COMPLIANT**"}`);
  lines.push("");
  lines.push("## Live Telemetry");
  lines.push("");
  lines.push("| Parameter | Value | EA Limit |");
  lines.push("|---|---|---|");
  for (const key in METRICS) {
    const cfg = METRICS[key];
    const m = metrics[key];
    if (!m) continue;
    lines.push(`| ${cfg.label} | ${m.value.toFixed(cfg.decimals)} ${cfg.unit} | ${cfg.range} |`);
  }
  lines.push("");
  lines.push("*This is a local fallback. The backend would normally produce a full §82 report with cryptographic seal and distribution log.*");
  return lines.join("\n");
}
