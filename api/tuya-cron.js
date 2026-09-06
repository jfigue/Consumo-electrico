import crypto from "crypto";

const TUYA_BASE = "https://openapi.tuyaus.com";
const SUPABASE_URL = "https://geievuasaxdrrykuouil.supabase.co";

function sha256Hex(str) {
  return crypto.createHash("sha256").update(str || "", "utf8").digest("hex");
}

function hmacSha256Upper(str, secret) {
  return crypto.createHmac("sha256", secret).update(str, "utf8").digest("hex").toUpperCase();
}

function buildSign({ clientId, secret, accessToken, method, path, body, t }) {
  const contentHash = sha256Hex(body || "");
  const stringToSign = [method, contentHash, "", path].join("\n");
  const str = clientId + (accessToken || "") + t + stringToSign;
  return hmacSha256Upper(str, secret);
}

async function getAccessToken(clientId, secret) {
  const t = Date.now().toString();
  const path = "/v1.0/token?grant_type=1";
  const sign = buildSign({ clientId, secret, method: "GET", path, body: "", t });
  const res = await fetch(TUYA_BASE + path, {
    method: "GET",
    headers: { client_id: clientId, sign, t, sign_method: "HMAC-SHA256" },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.msg || `No se pudo obtener el token de Tuya (code ${data.code})`);
  return data.result.access_token;
}

export default async function handler(req, res) {
  // protección: solo el scheduler (con el secreto correcto) puede disparar esto
  const secretRecibido = req.query.secret || req.headers["x-cron-secret"];
  if (!process.env.CRON_SECRET || secretRecibido !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const clientId = process.env.TUYA_CLIENT_ID;
  const tuyaSecret = process.env.TUYA_CLIENT_SECRET;
  const deviceIdsRaw = process.env.TUYA_DEVICE_IDS || process.env.TUYA_DEVICE_ID;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.APP_USER_ID;

  if (!clientId || !tuyaSecret || !deviceIdsRaw || !serviceRoleKey || !userId) {
    return res.status(500).json({ error: "Faltan variables de entorno en Vercel (Tuya, service role o user id)" });
  }

  const deviceIds = deviceIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const resultados = [];

  try {
    const accessToken = await getAccessToken(clientId, tuyaSecret);

    for (const deviceId of deviceIds) {
      try {
        const t = Date.now().toString();
        const path = `/v1.0/devices/${deviceId}/status`;
        const sign = buildSign({ clientId, secret: tuyaSecret, accessToken, method: "GET", path, body: "", t });

        const statusRes = await fetch(TUYA_BASE + path, {
          method: "GET",
          headers: { client_id: clientId, access_token: accessToken, sign, t, sign_method: "HMAC-SHA256" },
        });
        const statusData = await statusRes.json();

        if (!statusData.success) {
          resultados.push({ deviceId, ok: false, error: statusData.msg || `Error de Tuya (code ${statusData.code})` });
          continue;
        }

        const raw = statusData.result || [];
        const get = (code) => raw.find((d) => d.code === code)?.value;

        const curPower = get("cur_power");
        const curVoltage = get("cur_voltage");
        const curCurrent = get("cur_current");
        const addEle = get("add_ele");

        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/lecturas_enchufe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            user_id: userId,
            device_id: deviceId,
            leido_en: new Date().toISOString(),
            potencia_w: curPower != null ? curPower / 10 : null,
            voltaje_v: curVoltage != null ? curVoltage / 10 : null,
            corriente_a: curCurrent != null ? curCurrent / 1000 : null,
            energia_acumulada_kwh: addEle != null ? addEle / 100 : null,
          }),
        });

        if (!insertRes.ok) {
          const errText = await insertRes.text();
          resultados.push({ deviceId, ok: false, error: "Error al guardar en Supabase: " + errText });
        } else {
          resultados.push({ deviceId, ok: true });
        }
      } catch (err) {
        resultados.push({ deviceId, ok: false, error: err.message });
      }
    }

    const huboError = resultados.some((r) => !r.ok);
    return res.status(huboError ? 207 : 200).json({ ok: !huboError, leidoEn: new Date().toISOString(), resultados });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error en el cron de Tuya: " + err.message });
  }
}
