// Recebe conta/formato/tema da Central de Testes e gera o conteúdo (legenda/roteiro)
// chamando a API da Anthropic a partir do servidor.
// A chave fica guardada como variável de ambiente no Vercel, nunca aparece no navegador.

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da Anthropic não configurada no servidor.' });
  }

  const { accountName, niche, tone, format, topic } = req.body || {};
  if (!topic) {
    return res.status(400).json({ error: 'Tema ou produto não informado.' });
  }

  const prompt = 'Você é um criador de conteúdo para Instagram no Brasil.\n' +
    'Conta: ' + (accountName || '') + '\n' +
    'Nicho: ' + (niche || '') + '\n' +
    'Tom de voz: ' + (tone || '') + '\n' +
    'Formato pedido: ' + (format || '') + '\n' +
    'Tema/produto: ' + topic + '\n\n' +
    'Escreva o conteúdo pronto pra usar, em português do Brasil, seguindo o tom de voz da conta. Se for Reel, inclua roteiro curto (cenas) + legenda. Se for carrossel, liste os 5 slides. Seja direto, sem introduções nem explicações extras, só o conteúdo final.';

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const aiData = await aiRes.json();

    if (aiData.error) {
      return res.status(400).json({ error: aiData.error.message || 'Erro ao gerar conteúdo.' });
    }

    const text = (aiData.content || []).map(b => b.text || '').join('\n').trim();
    if (!text) {
      return res.status(500).json({ error: 'Não recebi conteúdo da IA. Tenta de novo.' });
    }

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no servidor: ' + err.message });
  }
}
