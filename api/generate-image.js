// Gera uma imagem de fundo a partir de uma descrição em texto, usando a API
// de imagens da OpenAI (gpt-image-1). Devolve a imagem em base64 pro cliente
// (que já sabe subir base64 pro /api/upload, mesmo caminho usado em toda a
// ferramenta de artes/edição de imagem — evita duplicar a lógica de hospedagem).
//
// A chave fica guardada como variável de ambiente no Vercel (OPENAI_API_KEY),
// nunca aparece no navegador nem no código do GitHub.

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' });
  }

  const { prompt, width, height } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Faltou a descrição da imagem.' });
  }

  // gpt-image-1 só aceita alguns tamanhos fixos; escolhe o mais próximo do
  // formato pedido (retrato pra Reel/Story, paisagem, ou quadrado).
  let size = '1024x1024';
  if (width && height) {
    const ratio = width / height;
    if (ratio < 0.9) size = '1024x1536';
    else if (ratio > 1.2) size = '1536x1024';
  }

  try {
    const aiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size,
        n: 1
      })
    });
    const aiData = await aiRes.json();

    if (aiData.error) {
      return res.status(400).json({ error: aiData.error.message || 'Erro ao gerar imagem.' });
    }

    const item = (aiData.data || [])[0];
    if (!item) {
      return res.status(500).json({ error: 'A OpenAI não devolveu nenhuma imagem.' });
    }

    let base64 = item.b64_json;
    if (!base64 && item.url) {
      const imgRes = await fetch(item.url);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      base64 = buf.toString('base64');
    }
    if (!base64) {
      return res.status(500).json({ error: 'Resposta da OpenAI sem imagem utilizável.' });
    }

    return res.status(200).json({ base64 });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no servidor: ' + err.message });
  }
}
