import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, ComposedChart,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Home, FileText, Plug, BarChart3, Settings, Upload, Trash2, Plus, X, Check,
  TrendingUp, TrendingDown, Loader2, AlertTriangle, Zap, Wallet, Gauge,
  Wind, ChefHat, Shirt, Tv, Lightbulb, Monitor, Pencil, Save, CalendarDays, Activity,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#0F172A",
  bgDeep: "#0B1220",
  card: "#1E293B",
  border: "#334155",
  text: "#F1F5F9",
  sub: "#94A3B8",
  amber: "#F59E0B",
  blue: "#3B82F6",
  green: "#10B981",
  success: "#22C55E",
  warn: "#F97316",
  error: "#EF4444",
  violet: "#8B5CF6",
  cyan: "#06B6D4",
  yellow: "#FBBF24",
  gray: "#6B7280",
};

const CATEGORIAS = {
  "Climatización": { color: "#F59E0B", Icon: Wind },
  "Cocina": { color: "#EF4444", Icon: ChefHat },
  "Lavado": { color: "#3B82F6", Icon: Shirt },
  "Entretenimiento": { color: "#8B5CF6", Icon: Tv },
  "Iluminación": { color: "#FBBF24", Icon: Lightbulb },
  "Tecnología": { color: "#06B6D4", Icon: Monitor },
  "Otros": { color: "#6B7280", Icon: Plug },
};
const CATS = Object.keys(CATEGORIAS);

const MESES = { ENE: 0, FEB: 1, MAR: 2, ABR: 3, MAY: 4, JUN: 5, JUL: 6, AGO: 7, SEP: 8, OCT: 9, NOV: 10, DIC: 11 };

/* ------------------------------------------------------------------ */
/*  Datos de ejemplo                                                   */
/* ------------------------------------------------------------------ */
const FACTURAS_DEMO = [
  { id: "1", periodo: "JUL 2026", consumoKwh: 283, importeTotal: 59792.38, diasFacturados: 30, distribuidora: "Edenor", fechaCarga: "2026-08-07" },
];

const APARATOS_DEMO = [];

const CONFIG_DEMO = { tarifaKwh: 150, moneda: "ARS", actualizado: new Date().toISOString().slice(0, 10) };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const fmtARS = (n) =>
  (Number(n) || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fmtKwh = (n) => `${(Number(n) || 0).toFixed(1)} kWh`;
const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));

const ordenPeriodo = (p) => {
  if (!p) return 0;
  const [m, y] = String(p).trim().toUpperCase().split(/\s+/);
  const mi = MESES[m?.slice(0, 3)] ?? 0;
  return (Number(y) || 0) * 12 + mi;
};

const consumoAparato = (a) => (num(a.potenciaW) / 1000) * num(a.horasDiarias) * 30 * (num(a.cantidad) || 1);

/* ---------- Supabase: config + helpers ---------- */
const SUPABASE_URL = "https://geievuasaxdrrykuouil.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlaWV2dWFzYXhkcnJ5a3VvdWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjk4NTksImV4cCI6MjEwMTgwNTg1OX0.YVVdzuqm1wyHslrPgvV9PD2mOSmKoyM3uKfnb4tibpo";

const SESSION_STORAGE_KEY = "consumo_electrico_session";

async function supaAuth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.error || `Error ${res.status}`);
  }
  return data;
}

const supaSignUp = (email, password) => supaAuth("signup", { email, password });
const supaSignIn = (email, password) => supaAuth("token?grant_type=password", { email, password });

async function supaFetch(path, session, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      Prefer: options.prefer || "return=representation",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status} en ${path}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* mapeo DB (snake_case) <-> app (camelCase) */
const facturaFromDb = (r) => ({
  id: r.id, periodo: r.periodo, consumoKwh: r.consumo_kwh, importeTotal: r.importe_total,
  diasFacturados: r.dias_facturados, distribuidora: r.distribuidora, fechaCarga: r.fecha_carga,
});
const facturaToDb = (f) => ({
  periodo: f.periodo, consumo_kwh: f.consumoKwh, importe_total: f.importeTotal,
  dias_facturados: f.diasFacturados, distribuidora: f.distribuidora, fecha_carga: f.fechaCarga,
});
const aparatoFromDb = (r) => ({
  id: r.id, nombre: r.nombre, marca: r.marca, modelo: r.modelo,
  potenciaW: r.potencia_w, horasDiarias: r.horas_diarias, cantidad: r.cantidad, categoria: r.categoria,
});
const aparatoToDb = (a) => ({
  nombre: a.nombre, marca: a.marca, modelo: a.modelo,
  potencia_w: a.potenciaW, horas_diarias: a.horasDiarias, cantidad: a.cantidad, categoria: a.categoria,
});

const fileToBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });

/* ------------------------------------------------------------------ */
/*  Primitivas de UI                                                   */
/* ------------------------------------------------------------------ */
const cardStyle = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
};

const inputStyle = {
  background: C.bgDeep,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  padding: "9px 11px",
  width: "100%",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

function Card({ children, style }) {
  return <div style={{ ...cardStyle, padding: 20, ...style }}>{children}</div>;
}

function Btn({ children, onClick, color = C.amber, variant = "solid", disabled, style, type = "button" }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 9,
    padding: "9px 14px",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "filter .15s ease, background .15s ease",
    border: `1px solid ${color}`,
    background: variant === "solid" ? color : "transparent",
    color: variant === "solid" ? "#0B1220" : color,
    ...style,
  };
  return (
    <button type={type} className="btn" style={base} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.sub, marginBottom: 6, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

function ChartCard({ title, subtitle, height = 280, children, right }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</h3>
          {subtitle && <p style={{ margin: "3px 0 0", fontSize: 12, color: C.sub }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      <div style={{ width: "100%", height }}>{children}</div>
    </Card>
  );
}

const tipProps = {
  contentStyle: { background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.5)" },
  labelStyle: { color: C.sub, marginBottom: 4, fontWeight: 600 },
  itemStyle: { color: C.text },
  cursor: { fill: "rgba(148,163,184,0.08)" },
};

const axisProps = { stroke: C.sub, tick: { fill: C.sub, fontSize: 11 }, tickLine: false, axisLine: { stroke: C.border } };

function Kpi({ Icon, label, value, sub, color, trend }) {
  return (
    <Card style={{ padding: 18, position: "relative", overflow: "hidden" }}>
      <div
        aria-hidden
        style={{ position: "absolute", inset: "0 auto 0 0", width: 3, background: color, borderRadius: "12px 0 0 12px" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: C.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
          {label}
        </span>
        <Icon size={17} color={color} />
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minHeight: 18 }}>
        {sub && <span style={{ fontSize: 12, color: C.sub }}>{sub}</span>}
        {trend !== undefined && trend !== null && isFinite(trend) && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 12,
              fontWeight: 700,
              color: trend > 0 ? C.error : C.success,
            }}
          >
            {trend > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */
export default function App() {
  const [seccion, setSeccion] = useState("dashboard");
  const [cargando, setCargando] = useState(true);

  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup"
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authCargando, setAuthCargando] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authAviso, setAuthAviso] = useState(null);

  const [facturas, setFacturas] = useState([]);
  const [aparatos, setAparatos] = useState([]);
  const [config, setConfig] = useState(CONFIG_DEMO);

  // Facturas: carga con AI / manual
  const [aiCargando, setAiCargando] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [borrador, setBorrador] = useState(null);

  // Electrodomésticos
  const [apForm, setApForm] = useState(null);
  const [equipoAiCargando, setEquipoAiCargando] = useState(false);
  const [equipoAiError, setEquipoAiError] = useState(null);

  // Configuración
  const [tarifaInput, setTarifaInput] = useState("");
  const [tarifaGuardada, setTarifaGuardada] = useState(false);

  /* ---------- restaurar sesión guardada ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw));
      else setCargando(false);
    } catch {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [session]);

  /* ---------- carga inicial (después de autenticarse) ---------- */
  useEffect(() => {
    if (!session) {
      setCargando(false);
      return;
    }
    (async () => {
      setCargando(true);
      try {
        const [fRows, aRows, cRows] = await Promise.all([
          supaFetch("facturas?select=*", session),
          supaFetch("aparatos?select=*", session),
          supaFetch("config?select=*", session),
        ]);
        setFacturas((fRows || []).map(facturaFromDb));
        setAparatos((aRows || []).map(aparatoFromDb));
        if (cRows && cRows.length > 0) {
          setConfig({ tarifaKwh: cRows[0].tarifa_kwh });
          setTarifaInput(String(cRows[0].tarifa_kwh));
        } else {
          // primera vez de este usuario: sembramos la config por defecto
          await supaFetch("config", session, { method: "POST", body: { tarifa_kwh: CONFIG_DEMO.tarifaKwh } });
          setConfig(CONFIG_DEMO);
          setTarifaInput(String(CONFIG_DEMO.tarifaKwh));
        }
      } catch (err) {
        console.error(err);
        const msg = String(err.message || "");
        if (/JWT|token|401/i.test(msg)) {
          // sesión vencida o inválida: volvemos a pedir login
          setSession(null);
        } else {
          setAuthError("No se pudieron cargar tus datos desde Supabase: " + err.message);
        }
      } finally {
        setCargando(false);
      }
    })();
  }, [session]);

  /* ---------- auth ---------- */
  const handleAuthSubmit = async () => {
    setAuthError(null);
    setAuthAviso(null);
    if (!authEmail.trim() || !authPass) {
      setAuthError("Completá email y contraseña.");
      return;
    }
    setAuthCargando(true);
    try {
      if (authMode === "signup") {
        const data = await supaSignUp(authEmail.trim(), authPass);
        if (data.access_token) {
          setSession(data);
        } else {
          setAuthAviso("Cuenta creada. Revisá tu email para confirmar la cuenta y después iniciá sesión.");
          setAuthMode("signin");
        }
      } else {
        const data = await supaSignIn(authEmail.trim(), authPass);
        setSession(data);
      }
    } catch (err) {
      setAuthError(err.message || "Ocurrió un error de autenticación.");
    } finally {
      setAuthCargando(false);
    }
  };

  const cerrarSesion = () => {
    setSession(null);
    setFacturas([]);
    setAparatos([]);
    setConfig(CONFIG_DEMO);
    setAuthEmail("");
    setAuthPass("");
  };

  /* ---------- persistencia (Supabase REST) ---------- */
  const guardarFacturas = useCallback(
    (next) => setFacturas(next),
    []
  );

  const agregarFactura = useCallback(
    async (factura) => {
      const [row] = await supaFetch("facturas", session, { method: "POST", body: facturaToDb(factura) });
      setFacturas((prev) => [...prev, facturaFromDb(row)]);
    },
    [session]
  );

  const eliminarFactura = useCallback(
    async (id) => {
      await supaFetch(`facturas?id=eq.${id}`, session, { method: "DELETE", prefer: "return=minimal" });
      setFacturas((prev) => prev.filter((f) => f.id !== id));
    },
    [session]
  );

  const guardarAparatos = useCallback((next) => setAparatos(next), []);

  const upsertAparato = useCallback(
    async (aparato) => {
      if (aparato.id) {
        const [row] = await supaFetch(`aparatos?id=eq.${aparato.id}`, session, {
          method: "PATCH",
          body: aparatoToDb(aparato),
        });
        setAparatos((prev) => prev.map((a) => (a.id === aparato.id ? aparatoFromDb(row) : a)));
      } else {
        const [row] = await supaFetch("aparatos", session, { method: "POST", body: aparatoToDb(aparato) });
        setAparatos((prev) => [...prev, aparatoFromDb(row)]);
      }
    },
    [session]
  );

  const eliminarAparato = useCallback(
    async (id) => {
      await supaFetch(`aparatos?id=eq.${id}`, session, { method: "DELETE", prefer: "return=minimal" });
      setAparatos((prev) => prev.filter((a) => a.id !== id));
    },
    [session]
  );

  const guardarConfig = useCallback(
    async (next) => {
      setConfig(next);
      try {
        await supaFetch("config", session, {
          method: "POST",
          body: { tarifa_kwh: next.tarifaKwh },
          prefer: "resolution=merge-duplicates,return=minimal",
        });
      } catch (err) {
        console.error("No se pudo guardar config", err);
      }
    },
    [session]
  );

  /* ---------- derivados ---------- */
  const tarifa = num(config.tarifaKwh) || 0;

  const facturasOrd = useMemo(
    () => [...facturas].sort((a, b) => ordenPeriodo(a.periodo) - ordenPeriodo(b.periodo)),
    [facturas]
  );

  const ultima = facturasOrd[facturasOrd.length - 1] || null;
  const anterior = facturasOrd[facturasOrd.length - 2] || null;

  const promedioKwh = facturasOrd.length ? facturasOrd.reduce((s, f) => s + num(f.consumoKwh), 0) / facturasOrd.length : 0;
  const promedioArs = facturasOrd.length ? facturasOrd.reduce((s, f) => s + num(f.importeTotal), 0) / facturasOrd.length : 0;

  const tendKwh = ultima && anterior && num(anterior.consumoKwh) ? ((num(ultima.consumoKwh) - num(anterior.consumoKwh)) / num(anterior.consumoKwh)) * 100 : null;
  const tendArs = ultima && anterior && num(anterior.importeTotal) ? ((num(ultima.importeTotal) - num(anterior.importeTotal)) / num(anterior.importeTotal)) * 100 : null;

  const aparatosCalc = useMemo(
    () =>
      aparatos
        .map((a) => {
          const kwh = consumoAparato(a);
          return { ...a, kwh, costo: kwh * tarifa };
        })
        .sort((x, y) => y.kwh - x.kwh),
    [aparatos, tarifa]
  );

  const totalMapeado = aparatosCalc.reduce((s, a) => s + a.kwh, 0);
  const realUltimo = ultima ? num(ultima.consumoKwh) : 0;
  const pctMapeado = realUltimo ? (totalMapeado / realUltimo) * 100 : 0;
  const noMapeado = Math.max(0, realUltimo - totalMapeado);
  const excedido = totalMapeado > realUltimo && realUltimo > 0;

  const proyeccion = useMemo(() => {
    if (!ultima || !num(ultima.diasFacturados)) return null;
    const diario = num(ultima.consumoKwh) / num(ultima.diasFacturados);
    const hoy = new Date();
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    return { kwh: diario * diasMes, costo: diario * diasMes * tarifa, diario };
  }, [ultima, tarifa]);

  const serieHist = useMemo(
    () =>
      facturasOrd.map((f) => ({
        periodo: f.periodo,
        kwh: num(f.consumoKwh),
        importe: num(f.importeTotal),
        estimado: Number(totalMapeado.toFixed(1)),
      })),
    [facturasOrd, totalMapeado]
  );

  const porCategoria = useMemo(() => {
    const map = {};
    CATS.forEach((c) => (map[c] = 0));
    aparatosCalc.forEach((a) => {
      const cat = CATEGORIAS[a.categoria] ? a.categoria : "Otros";
      map[cat] += a.kwh;
    });
    return CATS.map((c) => ({ categoria: c, kwh: Number(map[c].toFixed(1)), costo: map[c] * tarifa, color: CATEGORIAS[c].color })).filter(
      (d) => d.kwh > 0
    );
  }, [aparatosCalc, tarifa]);

  const coberturaData = excedido
    ? [
        { name: "Cubierto por factura", value: realUltimo, color: C.blue },
        { name: "Exceso estimado", value: totalMapeado - realUltimo, color: C.warn },
      ]
    : [
        { name: "Mapeado", value: Number(totalMapeado.toFixed(1)), color: C.green },
        { name: "Sin identificar", value: Number(noMapeado.toFixed(1)), color: C.gray },
      ];

  const colorCobertura = pctMapeado > 80 ? C.success : pctMapeado >= 50 ? C.amber : C.error;

  /* ---------- facturas: AI ---------- */
  const analizarImagen = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setAiError(null);
    setAiCargando(true);
    try {
      const base64 = await fileToBase64(file);
      const media = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: media, data: base64 } },
                {
                  type: "text",
                  text: `Analizá esta factura de electricidad y extraé los siguientes datos en formato JSON ÚNICAMENTE (sin texto adicional, sin markdown):
{
  "periodo": "MMM YYYY" (ej: "ENE 2025"),
  "fechaVencimiento": "DD/MM/YYYY",
  "consumoKwh": número,
  "importeTotal": número (en pesos, sin puntos de miles),
  "diasFacturados": número,
  "consumoDiarioPromedio": número,
  "distribuidora": "nombre de la empresa"
}
Si no podés leer algún campo, usá null.`,
                },
              ],
            },
          ],
        }),
      });
      const data = await response.json();
      const text = (data.content || []).find((b) => b.type === "text")?.text || "";
      const d = JSON.parse(text.replace(/```json|```/g, "").trim());
      setBorrador({
        periodo: d.periodo || "",
        consumoKwh: d.consumoKwh ?? "",
        importeTotal: d.importeTotal ?? "",
        diasFacturados: d.diasFacturados ?? "",
        distribuidora: d.distribuidora || "",
        origen: "ai",
      });
    } catch (err) {
      console.error(err);
      setAiError("No se pudo leer la factura. Revisá que la imagen sea nítida o cargá los datos a mano.");
    } finally {
      setAiCargando(false);
      e.target.value = "";
    }
  };

  const guardarBorrador = async () => {
    if (!borrador || !borrador.periodo) return;
    const nueva = {
      periodo: String(borrador.periodo).toUpperCase(),
      consumoKwh: num(borrador.consumoKwh),
      importeTotal: num(borrador.importeTotal),
      diasFacturados: num(borrador.diasFacturados) || 30,
      distribuidora: borrador.distribuidora || "—",
      fechaCarga: new Date().toISOString().slice(0, 10),
    };
    try {
      await agregarFactura(nueva);
      setBorrador(null);
      setAiError(null);
    } catch (err) {
      setAiError("No se pudo guardar la factura en Supabase: " + err.message);
    }
  };

  /* ---------- electrodomésticos ---------- */
  const nuevoAparato = () =>
    setApForm({ id: null, nombre: "", marca: "", modelo: "", potenciaW: "", horasDiarias: "", cantidad: 1, categoria: "Otros" });

  const guardarAparato = async () => {
    if (!apForm || !apForm.nombre.trim()) return;
    const item = {
      id: apForm.id || null,
      nombre: apForm.nombre.trim(),
      marca: apForm.marca,
      modelo: apForm.modelo,
      potenciaW: num(apForm.potenciaW),
      horasDiarias: num(apForm.horasDiarias),
      cantidad: num(apForm.cantidad) || 1,
      categoria: apForm.categoria,
    };
    try {
      await upsertAparato(item);
      setApForm(null);
    } catch (err) {
      setEquipoAiError("No se pudo guardar el equipo en Supabase: " + err.message);
    }
  };

  const analizarEquipoFoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setEquipoAiError(null);
    setEquipoAiCargando(true);
    try {
      const base64 = await fileToBase64(file);
      const media = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: media, data: base64 } },
                {
                  type: "text",
                  text: `Mirá esta foto de un electrodoméstico (puede mostrar el equipo, su etiqueta de especificaciones, o ambos). Identificá marca y modelo exactos. Si la etiqueta muestra directamente el consumo (W), usá ese dato. Si no, buscá en internet la ficha técnica oficial del fabricante para ese modelo específico y obtené la potencia nominal de consumo en Watts.

Respondé ÚNICAMENTE con un JSON, sin texto adicional ni markdown:
{
  "marca": "string o null",
  "modelo": "string o null",
  "potenciaW": número o null (potencia nominal en Watts),
  "categoriaSugerida": una de ["Climatización","Cocina","Lavado","Entretenimiento","Iluminación","Tecnología","Otros"] o null,
  "fuente": "breve nota de dónde salió el dato: etiqueta / ficha del fabricante / estimación por modelo similar"
}
Si no podés identificar el equipo con confianza, poné todos los campos en null salvo una "fuente" que lo explique.`,
                },
              ],
            },
          ],
        }),
      });
      const data = await response.json();
      const textBlock = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const jsonMatch = textBlock.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("La respuesta no contiene JSON");
      const d = JSON.parse(jsonMatch[0]);
      if (!d.marca && !d.modelo && !d.potenciaW) {
        setEquipoAiError(
          d.fuente || "No se pudo identificar el equipo en la foto ni encontrar su ficha técnica. Cargá los datos a mano."
        );
        return;
      }
      setApForm((prev) => ({
        ...prev,
        marca: d.marca || prev.marca,
        modelo: d.modelo || prev.modelo,
        potenciaW: d.potenciaW ?? prev.potenciaW,
        categoria: d.categoriaSugerida && CATS.includes(d.categoriaSugerida) ? d.categoriaSugerida : prev.categoria,
        fuentePotencia: d.fuente || "",
      }));
    } catch (err) {
      console.error(err);
      setEquipoAiError("No se pudo analizar la foto. Revisá que se vea bien la marca/modelo, o cargá los datos a mano.");
    } finally {
      setEquipoAiCargando(false);
      e.target.value = "";
    }
  };

  /* ---------- render helpers ---------- */
  const nav = [
    { id: "dashboard", label: "Dashboard", Icon: Home },
    { id: "facturas", label: "Facturas", Icon: FileText },
    { id: "aparatos", label: "Electrodomésticos", Icon: Plug },
    { id: "analisis", label: "Análisis", Icon: BarChart3 },
    { id: "config", label: "Configuración", Icon: Settings },
  ];

  /* ================= DASHBOARD ================= */
  const renderDashboard = () => {
    if (!facturas.length) return renderVacio();
    return (
      <>
        <div className="grid-kpi">
          <Kpi Icon={Zap} label="Consumo último mes" value={fmtKwh(realUltimo)} sub={ultima?.periodo} color={C.blue} trend={tendKwh} />
          <Kpi Icon={Wallet} label="Gasto último mes" value={fmtARS(ultima?.importeTotal)} sub={ultima?.distribuidora} color={C.green} trend={tendArs} />
          <Kpi Icon={Activity} label="Promedio histórico" value={fmtKwh(promedioKwh)} sub={`${fmtARS(promedioArs)} por mes`} color={C.amber} />
          <Kpi
            Icon={Gauge}
            label="Consumo mapeado"
            value={`${pctMapeado.toFixed(0)}%`}
            sub={`${fmtKwh(totalMapeado)} de ${fmtKwh(realUltimo)}`}
            color={colorCobertura}
          />
          <Kpi
            Icon={CalendarDays}
            label="Proyección mes actual"
            value={proyeccion ? fmtKwh(proyeccion.kwh) : "—"}
            sub={proyeccion ? `${fmtARS(proyeccion.costo)} · ${proyeccion.diario.toFixed(1)} kWh/día` : "Sin datos"}
            color={C.violet}
          />
          <Kpi Icon={Plug} label="Equipos registrados" value={String(aparatos.length)} sub={`${porCategoria.length} categorías activas`} color={C.cyan} />
        </div>

        <div className="grid-2" style={{ marginTop: 18 }}>
          <ChartCard title="Evolución del consumo" subtitle="kWh facturados por período">
            <ResponsiveContainer>
              <AreaChart data={serieHist} margin={{ top: 6, right: 10, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gKwh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.blue} stopOpacity={0.75} />
                    <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="periodo" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...tipProps} formatter={(v) => [fmtKwh(v), "Consumo"]} />
                <Area type="monotone" dataKey="kwh" stroke={C.blue} strokeWidth={2.5} fill="url(#gKwh)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Evolución del gasto" subtitle="Importe total facturado">
            <ResponsiveContainer>
              <LineChart data={serieHist} margin={{ top: 6, right: 10, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gArs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.green} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="periodo" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip {...tipProps} formatter={(v) => [fmtARS(v), "Importe"]} />
                <Line type="monotone" dataKey="importe" stroke={C.green} strokeWidth={3} dot={{ r: 4, fill: C.green }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div style={{ marginTop: 18 }}>
          <ChartCard title="Top consumidores del hogar" subtitle="Estimación mensual por equipo" height={300}>
            <ResponsiveContainer>
              <BarChart data={aparatosCalc.slice(0, 7).map((a) => ({ ...a, nombre: a.nombre }))} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                <XAxis type="number" {...axisProps} />
                <YAxis type="category" dataKey="nombre" width={150} {...axisProps} />
                <Tooltip {...tipProps} formatter={(v) => [fmtKwh(v), "Estimado"]} />
                <Bar dataKey="kwh" radius={[0, 6, 6, 0]} barSize={18}>
                  {aparatosCalc.slice(0, 7).map((a, i) => (
                    <Cell key={a.id} fill={i === 0 ? C.amber : i === 1 ? C.blue : i === 2 ? C.green : CATEGORIAS[a.categoria]?.color || C.gray} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </>
    );
  };

  /* ================= VACÍO ================= */
  const renderVacio = () => (
    <Card style={{ padding: 48, textAlign: "center" }}>
      <div
        style={{
          width: 64, height: 64, borderRadius: 16, margin: "0 auto 20px",
          background: "rgba(245,158,11,.12)", border: `1px solid ${C.amber}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Zap size={30} color={C.amber} />
      </div>
      <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Empezá por tu última factura</h2>
      <p style={{ margin: "0 auto 22px", maxWidth: 460, color: C.sub, fontSize: 14, lineHeight: 1.6 }}>
        Subí una foto de la boleta y se completan solos el período, los kWh, el importe y los días facturados. Después
        cargás tus electrodomésticos para ver qué parte del consumo explica cada uno.
      </p>
      <Btn onClick={() => setSeccion("facturas")}>
        <Upload size={16} /> Cargar primera factura
      </Btn>
    </Card>
  );

  /* ================= FACTURAS ================= */
  const renderFacturas = () => (
    <>
      <div className="grid-2">
        <Card>
          <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>Leer factura con IA</h3>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
            Subí una foto o captura (JPG, PNG o WEBP). Los datos se extraen automáticamente y los revisás antes de guardar.
          </p>

          <label
            className="drop"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 10, padding: "28px 16px", border: `1.5px dashed ${C.border}`, borderRadius: 12,
              cursor: aiCargando ? "wait" : "pointer", background: C.bgDeep, textAlign: "center",
            }}
          >
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={analizarImagen} disabled={aiCargando} style={{ display: "none" }} />
            {aiCargando ? (
              <>
                <Loader2 size={26} color={C.amber} className="spin" />
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Leyendo la factura…</span>
                <span style={{ fontSize: 12, color: C.sub }}>Puede tardar unos segundos</span>
              </>
            ) : (
              <>
                <Upload size={26} color={C.amber} />
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Elegir imagen de la factura</span>
                <span style={{ fontSize: 12, color: C.sub }}>Si tenés un PDF, subí una captura de la página</span>
              </>
            )}
          </label>

          {aiError && (
            <div
              style={{
                marginTop: 14, padding: "10px 12px", borderRadius: 9, fontSize: 12, lineHeight: 1.5,
                background: "rgba(239,68,68,.1)", border: `1px solid ${C.error}`, color: "#FCA5A5",
                display: "flex", gap: 8, alignItems: "flex-start",
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{aiError}</span>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Btn
              variant="ghost"
              color={C.blue}
              onClick={() =>
                setBorrador({ periodo: "", consumoKwh: "", importeTotal: "", diasFacturados: "", distribuidora: "", origen: "manual" })
              }
            >
              <Plus size={16} /> Cargar a mano
            </Btn>
          </div>
        </Card>

        <Card>
          {borrador ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                  {borrador.origen === "ai" ? "Revisá los datos leídos" : "Nueva factura"}
                </h3>
                <button className="icon-btn" onClick={() => setBorrador(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub }}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Período (MMM AAAA)">
                  <input style={inputStyle} value={borrador.periodo} placeholder="AGO 2026" onChange={(e) => setBorrador({ ...borrador, periodo: e.target.value })} />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Consumo (kWh)">
                    <input style={inputStyle} type="number" value={borrador.consumoKwh} onChange={(e) => setBorrador({ ...borrador, consumoKwh: e.target.value })} />
                  </Field>
                  <Field label="Importe total ($)">
                    <input style={inputStyle} type="number" value={borrador.importeTotal} onChange={(e) => setBorrador({ ...borrador, importeTotal: e.target.value })} />
                  </Field>
                  <Field label="Días facturados">
                    <input style={inputStyle} type="number" value={borrador.diasFacturados} onChange={(e) => setBorrador({ ...borrador, diasFacturados: e.target.value })} />
                  </Field>
                  <Field label="Distribuidora">
                    <input style={inputStyle} value={borrador.distribuidora} onChange={(e) => setBorrador({ ...borrador, distribuidora: e.target.value })} />
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <Btn onClick={guardarBorrador} color={C.green} disabled={!borrador.periodo}>
                    <Check size={16} /> Guardar factura
                  </Btn>
                  <Btn variant="ghost" color={C.sub} onClick={() => setBorrador(null)}>
                    Cancelar
                  </Btn>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", minHeight: 220, color: C.sub, textAlign: "center", gap: 8 }}>
              <FileText size={26} color={C.border} style={{ margin: "0 auto" }} />
              <span style={{ fontSize: 13 }}>Los datos extraídos aparecen acá para que los confirmes.</span>
            </div>
          )}
        </Card>
      </div>

      <Card style={{ marginTop: 18, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Facturas cargadas</h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: C.sub }}>{facturas.length} períodos registrados</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr style={{ color: C.sub, textAlign: "left" }}>
                {["Período", "Consumo", "Importe", "Días", "$/kWh", "Distribuidora", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: `1px solid ${C.border}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...facturasOrd].reverse().map((f) => (
                <tr key={f.id} className="row">
                  <td style={{ padding: "12px 16px", fontWeight: 700 }}>{f.periodo}</td>
                  <td style={{ padding: "12px 16px", color: C.blue, fontWeight: 600 }}>{fmtKwh(f.consumoKwh)}</td>
                  <td style={{ padding: "12px 16px", color: C.green, fontWeight: 600 }}>{fmtARS(f.importeTotal)}</td>
                  <td style={{ padding: "12px 16px", color: C.sub }}>{f.diasFacturados}</td>
                  <td style={{ padding: "12px 16px", color: C.sub }}>
                    {num(f.consumoKwh) ? fmtARS(num(f.importeTotal) / num(f.consumoKwh)) : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", color: C.sub }}>{f.distribuidora}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <button
                      className="icon-btn"
                      title="Eliminar factura"
                      onClick={() => eliminarFactura(f.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, padding: 4 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!facturas.length && (
                <tr>
                  <td colSpan={7} style={{ padding: "28px 16px", textAlign: "center", color: C.sub }}>
                    Todavía no hay facturas. Subí una imagen o cargala a mano.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );

  /* ================= ELECTRODOMÉSTICOS ================= */
  const renderAparatos = () => (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Equipos del hogar</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.sub }}>
            {fmtKwh(totalMapeado)} estimados por mes · {fmtARS(totalMapeado * tarifa)} a la tarifa actual
          </p>
        </div>
        <Btn onClick={nuevoAparato}>
          <Plus size={16} /> Agregar equipo
        </Btn>
      </div>

      {apForm && (
        <Card style={{ marginBottom: 18, borderColor: C.amber }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{apForm.id ? "Editar equipo" : "Nuevo equipo"}</h3>
            <button className="icon-btn" onClick={() => setApForm(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub }}>
              <X size={18} />
            </button>
          </div>
          <label
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", marginBottom: 16,
              borderRadius: 12, border: `1.5px dashed ${equipoAiCargando ? C.amber : C.border}`,
              cursor: equipoAiCargando ? "wait" : "pointer", background: C.bgDeep,
            }}
          >
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={analizarEquipoFoto} disabled={equipoAiCargando} style={{ display: "none" }} />
            {equipoAiCargando ? (
              <Loader2 size={18} className="spin" style={{ color: C.amber }} />
            ) : (
              <Upload size={18} style={{ color: C.sub }} />
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {equipoAiCargando ? "Buscando ficha técnica del fabricante…" : "Identificar con foto (opcional)"}
              </div>
              <div style={{ fontSize: 12, color: C.sub }}>
                Subí una foto del equipo o su etiqueta — buscamos marca, modelo y potencia (W) en internet
              </div>
            </div>
          </label>

          {equipoAiError && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 16,
                borderRadius: 10, background: "rgba(239,68,68,0.08)", border: `1px solid ${C.error}`,
                fontSize: 12.5, color: C.error,
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{equipoAiError}</span>
            </div>
          )}

          {apForm.fuentePotencia && (
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 16, marginTop: -8 }}>
              Fuente del dato de potencia: {apForm.fuentePotencia}
            </div>
          )}

          <div className="grid-form">
            <Field label="Nombre">
              <input style={inputStyle} value={apForm.nombre} placeholder="Aire acondicionado" onChange={(e) => setApForm({ ...apForm, nombre: e.target.value })} />
            </Field>
            <Field label="Marca">
              <input style={inputStyle} value={apForm.marca} onChange={(e) => setApForm({ ...apForm, marca: e.target.value })} />
            </Field>
            <Field label="Modelo">
              <input style={inputStyle} value={apForm.modelo} onChange={(e) => setApForm({ ...apForm, modelo: e.target.value })} />
            </Field>
            <Field label="Potencia (W)">
              <input style={inputStyle} type="number" value={apForm.potenciaW} onChange={(e) => setApForm({ ...apForm, potenciaW: e.target.value })} />
            </Field>
            <Field label="Horas por día">
              <input style={inputStyle} type="number" step="0.5" value={apForm.horasDiarias} onChange={(e) => setApForm({ ...apForm, horasDiarias: e.target.value })} />
            </Field>
            <Field label="Cantidad">
              <input style={inputStyle} type="number" value={apForm.cantidad} onChange={(e) => setApForm({ ...apForm, cantidad: e.target.value })} />
            </Field>
            <Field label="Categoría">
              <select style={inputStyle} value={apForm.categoria} onChange={(e) => setApForm({ ...apForm, categoria: e.target.value })}>
                {CATS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={guardarAparato} color={C.green} disabled={!apForm.nombre.trim()}>
              <Save size={16} /> Guardar equipo
            </Btn>
            <span style={{ fontSize: 12, color: C.sub }}>
              Estimado: {fmtKwh(consumoAparato(apForm))} · {fmtARS(consumoAparato(apForm) * tarifa)} por mes
            </span>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ color: C.sub, textAlign: "left" }}>
                {["#", "Equipo", "Categoría", "Potencia", "Uso diario", "Cant.", "kWh/mes", "$/mes", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: `1px solid ${C.border}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aparatosCalc.map((a, i) => {
                const cat = CATEGORIAS[a.categoria] || CATEGORIAS["Otros"];
                const CatIcon = cat.Icon;
                return (
                  <tr key={a.id} className="row">
                    <td style={{ padding: "12px 14px", color: i < 3 ? C.amber : C.sub, fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, background: `${cat.color}22`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <CatIcon size={15} color={cat.color} />
                        </span>
                        <span>
                          <span style={{ fontWeight: 600, display: "block" }}>{a.nombre}</span>
                          <span style={{ fontSize: 11, color: C.sub }}>{[a.marca, a.modelo].filter(Boolean).join(" · ")}</span>
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cat.color, background: `${cat.color}1a`, padding: "3px 8px", borderRadius: 999 }}>
                        {a.categoria}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: C.sub }}>{num(a.potenciaW)} W</td>
                    <td style={{ padding: "12px 14px", color: C.sub }}>{num(a.horasDiarias)} h</td>
                    <td style={{ padding: "12px 14px", color: C.sub }}>{a.cantidad}</td>
                    <td style={{ padding: "12px 14px", color: C.blue, fontWeight: 700 }}>{fmtKwh(a.kwh)}</td>
                    <td style={{ padding: "12px 14px", color: C.green, fontWeight: 700 }}>{fmtARS(a.costo)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="icon-btn" title="Editar" onClick={() => setApForm({ ...a })} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, padding: 4 }}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Eliminar"
                        onClick={() => eliminarAparato(a.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, padding: 4 }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!aparatos.length && (
                <tr>
                  <td colSpan={9} style={{ padding: "28px 16px", textAlign: "center", color: C.sub }}>
                    Agregá tu primer equipo para empezar a explicar el consumo de la factura.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );

  /* ================= ANÁLISIS ================= */
  const renderAnalisis = () => (
    <>
      <div className="grid-2">
        <ChartCard
          title="Cobertura del consumo"
          subtitle={`Factura de ${ultima?.periodo || "—"} contra la suma de tus equipos`}
          height={280}
          right={
            <span style={{ fontSize: 26, fontWeight: 800, color: colorCobertura, letterSpacing: "-0.02em" }}>
              {pctMapeado.toFixed(0)}%
            </span>
          }
        >
          <ResponsiveContainer>
            <PieChart>
              <Pie data={coberturaData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={3} stroke="none">
                {coberturaData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip {...tipProps} formatter={(v, n) => [fmtKwh(v), n]} />
              <Legend wrapperStyle={{ fontSize: 12, color: C.sub }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Lectura del período</h3>
          {excedido ? (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(249,115,22,.1)", border: `1px solid ${C.warn}`, display: "flex", gap: 10, marginBottom: 16 }}>
              <AlertTriangle size={16} color={C.warn} style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "#FDBA74" }}>
                Los equipos suman {fmtKwh(totalMapeado)}, más de lo que registra la factura ({fmtKwh(realUltimo)}). Revisá
                las horas de uso diario: suelen estar sobreestimadas en climatización.
              </p>
            </div>
          ) : (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: `${colorCobertura}1a`, border: `1px solid ${colorCobertura}`, marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: colorCobertura }}>
                {pctMapeado > 80
                  ? "Tenés casi todo el consumo identificado. Los ajustes finos ya se hacen sobre hábitos de uso."
                  : pctMapeado >= 50
                  ? "Falta identificar una parte relevante. Sumá termotanque, bomba de agua o equipos en standby."
                  : "La mayor parte del consumo sigue sin explicación. Cargá más equipos para encontrar dónde se va la energía."}
              </p>
            </div>
          )}
          <div style={{ display: "grid", gap: 12 }}>
            {[
              { l: "Consumo real facturado", v: fmtKwh(realUltimo), c: C.blue },
              { l: "Explicado por equipos", v: fmtKwh(totalMapeado), c: C.green },
              { l: "Sin identificar", v: fmtKwh(noMapeado), c: C.gray },
              { l: "Costo del consumo sin identificar", v: fmtARS(noMapeado * tarifa), c: C.warn },
            ].map((r) => (
              <div key={r.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: C.sub }}>{r.l}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: r.c }}>{r.v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid-2" style={{ marginTop: 18 }}>
        <ChartCard title="Consumo por categoría" subtitle="kWh mensuales estimados">
          <ResponsiveContainer>
            <BarChart data={porCategoria} margin={{ top: 6, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="categoria" {...axisProps} interval={0} angle={-18} textAnchor="end" height={54} />
              <YAxis {...axisProps} />
              <Tooltip {...tipProps} formatter={(v, n, p) => [`${fmtKwh(v)} · ${fmtARS(p.payload.costo)}`, p.payload.categoria]} />
              <Bar dataKey="kwh" radius={[6, 6, 0, 0]}>
                {porCategoria.map((d) => (
                  <Cell key={d.categoria} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribución por equipo" subtitle="Participación en el consumo estimado">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={aparatosCalc}
                dataKey="kwh"
                nameKey="nombre"
                outerRadius={95}
                stroke="none"
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {aparatosCalc.map((a) => (
                  <Cell key={a.id} fill={CATEGORIAS[a.categoria]?.color || C.gray} />
                ))}
              </Pie>
              <Tooltip {...tipProps} formatter={(v, n) => [fmtKwh(v), n]} />
              <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, color: C.sub, maxWidth: 130 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid-2" style={{ marginTop: 18 }}>
        <ChartCard title="Real vs. estimado" subtitle="Factura del mes contra la suma de equipos">
          <ResponsiveContainer>
            <ComposedChart data={serieHist} margin={{ top: 6, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="periodo" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip {...tipProps} formatter={(v, n) => [fmtKwh(v), n === "kwh" ? "Real facturado" : "Estimado equipos"]} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "kwh" ? "Real facturado" : "Estimado equipos")} />
              <Bar dataKey="kwh" fill={C.blue} radius={[6, 6, 0, 0]} barSize={26} />
              <Line type="monotone" dataKey="estimado" stroke={C.amber} strokeWidth={3} strokeDasharray="6 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Perfil energético del hogar" subtitle="Peso relativo de cada categoría">
          <ResponsiveContainer>
            <RadarChart data={porCategoria} outerRadius={95}>
              <PolarGrid stroke={C.border} />
              <PolarAngleAxis dataKey="categoria" tick={{ fill: C.sub, fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: C.sub, fontSize: 10 }} stroke={C.border} />
              <Radar name="kWh/mes" dataKey="kwh" stroke={C.violet} fill={C.violet} fillOpacity={0.45} strokeWidth={2} />
              <Tooltip {...tipProps} formatter={(v) => [fmtKwh(v), "Estimado"]} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );

  /* ================= CONFIG ================= */
  const renderConfig = () => (
    <div style={{ maxWidth: 560 }}>
      <Card>
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>Tarifa eléctrica</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
          Se usa para calcular el costo mensual de cada equipo. Podés sacarla de tu última factura dividiendo el importe
          total por los kWh consumidos.
        </p>
        <Field label="Precio por kWh (ARS)">
          <input
            style={inputStyle}
            type="number"
            value={tarifaInput}
            onChange={(e) => {
              setTarifaInput(e.target.value);
              setTarifaGuardada(false);
            }}
          />
        </Field>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <Btn
            color={C.green}
            onClick={() => {
              guardarConfig({ ...config, tarifaKwh: num(tarifaInput), moneda: "ARS", actualizado: new Date().toISOString().slice(0, 10) });
              setTarifaGuardada(true);
            }}
          >
            <Save size={16} /> Guardar tarifa
          </Btn>
          {tarifaGuardada && (
            <span style={{ fontSize: 12.5, color: C.success, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Check size={14} /> Tarifa guardada
            </span>
          )}
        </div>
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}`, fontSize: 12.5, color: C.sub, display: "grid", gap: 6 }}>
          <div>Última actualización: <strong style={{ color: C.text }}>{config.actualizado || "—"}</strong></div>
          <div>Moneda: <strong style={{ color: C.text }}>{config.moneda || "ARS"}</strong></div>
          {ultima && num(ultima.consumoKwh) > 0 && (
            <div>
              Referencia de tu última factura:{" "}
              <strong style={{ color: C.amber }}>{fmtARS(num(ultima.importeTotal) / num(ultima.consumoKwh))} / kWh</strong>
            </div>
          )}
        </div>
      </Card>
    </div>
  );

  /* ---------- loading ---------- */
  if (cargando) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, fontFamily: "Inter, sans-serif", gap: 12 }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
        <Loader2 size={22} color={C.amber} className="spin" />
        <span style={{ fontSize: 14 }}>Cargando tus datos…</span>
      </div>
    );
  }

  /* ---------- auth gate ---------- */
  if (!session) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif", padding: 16 }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
        <Card style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: C.amber, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={19} color={C.bgDeep} />
            </span>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>Consumo eléctrico</span>
          </div>

          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>
            {authMode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
          </h2>
          <p style={{ margin: "0 0 18px", fontSize: 13, color: C.sub }}>
            Tus facturas y equipos quedan guardados en tu cuenta y disponibles desde cualquier dispositivo.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Email">
              <input
                style={inputStyle}
                type="email"
                value={authEmail}
                placeholder="vos@email.com"
                onChange={(e) => setAuthEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuthSubmit()}
              />
            </Field>
            <Field label="Contraseña">
              <input
                style={inputStyle}
                type="password"
                value={authPass}
                placeholder="••••••••"
                onChange={(e) => setAuthPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuthSubmit()}
              />
            </Field>
          </div>

          {authError && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginTop: 14,
                borderRadius: 10, background: "rgba(239,68,68,0.08)", border: `1px solid ${C.error}`,
                fontSize: 12.5, color: C.error,
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{authError}</span>
            </div>
          )}
          {authAviso && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: C.success }}>{authAviso}</div>
          )}

          <Btn onClick={handleAuthSubmit} color={C.amber} disabled={authCargando} style={{ width: "100%", justifyContent: "center", marginTop: 16 }}>
            {authCargando ? <Loader2 size={16} className="spin" /> : null}
            {authMode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
          </Btn>

          <button
            onClick={() => {
              setAuthMode(authMode === "signin" ? "signup" : "signin");
              setAuthError(null);
              setAuthAviso(null);
            }}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: 12.5, marginTop: 14, width: "100%", textAlign: "center" }}
          >
            {authMode === "signin" ? "¿No tenés cuenta? Registrate" : "¿Ya tenés cuenta? Iniciá sesión"}
          </button>
        </Card>
      </div>
    );
  }


  const titulos = {
    dashboard: ["Consumo del hogar", "Resumen de facturas, tendencia y proyección"],
    facturas: ["Facturas", "Cargá boletas por imagen o a mano"],
    aparatos: ["Electrodomésticos", "Estimá cuánto consume cada equipo"],
    analisis: ["Análisis", "Qué explica el consumo de tu factura"],
    config: ["Configuración", "Tarifa y parámetros de cálculo"],
  };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .btn:hover:not(:disabled) { filter: brightness(1.12); }
        .icon-btn:hover { color: #F1F5F9 !important; }
        .drop:hover { border-color: ${C.amber} !important; }
        .row { border-bottom: 1px solid ${C.border}; transition: background .15s ease; }
        .row:hover { background: rgba(148,163,184,.06); }
        .row:last-child { border-bottom: none; }
        input:focus, select:focus { border-color: ${C.amber} !important; }
        table th { white-space: nowrap; }
        .grid-kpi { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
        .grid-2 { display: grid; gap: 16px; grid-template-columns: 1fr; }
        .grid-form { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
        @media (min-width: 900px) { .grid-2 { grid-template-columns: 1fr 1fr; } .grid-form { grid-template-columns: repeat(4, 1fr); } }
        .sidebar { display: none; }
        .topnav { display: flex; }
        @media (min-width: 768px) { .sidebar { display: flex; } .topnav { display: none; } }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 8px; }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <aside
          className="sidebar"
          style={{
            width: 232, flexShrink: 0, flexDirection: "column", gap: 4, padding: 18,
            borderRight: `1px solid ${C.border}`, background: C.bgDeep, position: "sticky", top: 0, height: "100vh",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 22px" }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: C.amber, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={19} color={C.bgDeep} />
            </span>
            <span>
              <span style={{ display: "block", fontWeight: 800, fontSize: 14.5, letterSpacing: "-0.02em" }}>Consumo</span>
              <span style={{ display: "block", fontSize: 11, color: C.sub }}>Energía del hogar</span>
            </span>
          </div>
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setSeccion(id)}
              style={{
                display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 9,
                border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit",
                textAlign: "left", width: "100%", transition: "background .15s ease",
                background: seccion === id ? "rgba(245,158,11,.14)" : "transparent",
                color: seccion === id ? C.amber : C.sub,
              }}
            >
              <Icon size={17} /> {label}
            </button>
          ))}
          <div style={{ marginTop: "auto", padding: "12px 10px", fontSize: 11.5, color: C.sub, borderTop: `1px solid ${C.border}` }}>
            Tarifa vigente
            <div style={{ color: C.amber, fontWeight: 700, fontSize: 15, marginTop: 3 }}>{fmtARS(tarifa)} / kWh</div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, wordBreak: "break-all" }}>{session?.user?.email}</div>
              <button
                onClick={cerrarSesion}
                style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: 12, padding: 0, display: "flex", alignItems: "center", gap: 6 }}
              >
                <X size={13} /> Cerrar sesión
              </button>
            </div>
          </div>
        </aside>

        {/* Contenido */}
        <main style={{ flex: 1, minWidth: 0, padding: "22px clamp(14px, 3vw, 30px) 40px" }}>
          <nav className="topnav" style={{ gap: 8, overflowX: "auto", paddingBottom: 14, marginBottom: 8 }}>
            {nav.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setSeccion(id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 999,
                  fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                  border: `1px solid ${seccion === id ? C.amber : C.border}`,
                  background: seccion === id ? "rgba(245,158,11,.14)" : "transparent",
                  color: seccion === id ? C.amber : C.sub,
                }}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </nav>

          <header style={{ marginBottom: 20 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>{titulos[seccion][0]}</h1>
            <p style={{ margin: "5px 0 0", fontSize: 13.5, color: C.sub }}>{titulos[seccion][1]}</p>
          </header>

          {seccion === "dashboard" && renderDashboard()}
          {seccion === "facturas" && renderFacturas()}
          {seccion === "aparatos" && renderAparatos()}
          {seccion === "analisis" && (facturas.length || aparatos.length ? renderAnalisis() : renderVacio())}
          {seccion === "config" && renderConfig()}
        </main>
      </div>
    </div>
  );
}
