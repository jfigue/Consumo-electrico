export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY no está configurada en el servidor" });
  }

  const { base64, mediaType } = req.body || {};
  if (!base64) {
    return res.status(400).json({ error: "Falta la imagen (base64)" });
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } },
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

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({ error: data.error?.message || "Error en la API de Anthropic" });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno al leer la factura: " + err.message });
  }
}
