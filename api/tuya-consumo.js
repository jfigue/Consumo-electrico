import crypto from "crypto";

const TUYA_BASE = "https://openapi.tuyaus.com";

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
  const clientId = process.env.TUYA_CLIENT_ID;
  const secret = process.env.TUYA_CLIENT_SECRET;
  const deviceId = process.env.TUYA_DEVICE_ID;

  if (!clientId || !secret || !deviceId) {
    return res.status(500).json({ error: "Faltan TUYA_CLIENT_ID / TUYA_CLIENT_SECRET / TUYA_DEVICE_ID en las variables de entorno de Vercel" });
  }

  try {
    const accessToken = await getAccessToken(clientId, secret);

    const t = Date.now().toString();
    const path = `/v1.0/devices/${deviceId}/status`;
    const sign = buildSign({ clientId, secret, accessToken, method: "GET", path, body: "", t });

    const statusRes = await fetch(TUYA_BASE + path, {
      method: "GET",
      headers: { client_id: clientId, access_token: accessToken, sign, t, sign_method: "HMAC-SHA256" },
    });
    const statusData = await statusRes.json();

    if (!statusData.success) {
      return res.status(400).json({ error: statusData.msg || `Error de Tuya (code ${statusData.code})` });
    }

    const raw = statusData.result || [];
    const get = (code) => raw.find((d) => d.code === code)?.value;

    // Escalas estándar de Tuya para enchufes con medición de energía (pueden variar según el modelo)
    const curPower = get("cur_power");
    const curVoltage = get("cur_voltage");
    const curCurrent = get("cur_current");
    const addEle = get("add_ele");

    return res.status(200).json({
      raw,
      potenciaW: curPower != null ? curPower / 10 : null,
      voltajeV: curVoltage != null ? curVoltage / 10 : null,
      corrienteA: curCurrent != null ? curCurrent / 1000 : null,
      energiaAcumuladaKwh: addEle != null ? addEle / 100 : null,
      leidoEn: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error al consultar Tuya: " + err.message });
  }
}
