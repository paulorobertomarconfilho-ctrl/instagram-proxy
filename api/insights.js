// Busca métricas reais de um post publicado no Instagram (alcance, curtidas,
// comentários, salvamentos etc.) usando a API oficial da Meta.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { token, mediaId, mediaType } = req.body || {};
  if (!token || !mediaId) {
    return res.status(400).json({ error: 'Faltam dados: token e mediaId são obrigatórios.' });
  }

  // Métricas válidas mudam conforme o tipo de mídia (FEED post vs STORY).
  const isStory = mediaType === 'STORIES';
  const metrics = isStory
    ? 'reach,shares,total_interactions,views,replies'
    : 'reach,likes,comments,saved,shares,total_interactions,views';

  try {
    const url = `https://graph.instagram.com/v21.0/${mediaId}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`;
    const igRes = await fetch(url);
    const data = await igRes.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message || 'Erro ao buscar métricas.' });
    }

    const result = {};
    (data.data || []).forEach(m => {
      const v = (m.values && m.values[0] && typeof m.values[0].value !== 'undefined')
        ? m.values[0].value
        : (m.total_value && typeof m.total_value.value !== 'undefined' ? m.total_value.value : null);
      result[m.name] = v;
    });

    return res.status(200).json({ metrics: result });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no servidor: ' + err.message });
  }
}
