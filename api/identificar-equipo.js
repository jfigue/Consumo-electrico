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
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1200,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } },
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

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({ error: data.error?.message || "Error en la API de Anthropic" });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno al identificar el equipo: " + err.message });
  }
}
