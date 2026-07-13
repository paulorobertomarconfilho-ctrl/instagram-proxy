// Servidor intermediário (proxy) para publicar no Instagram.
// Recebe o pedido da Central de Testes, repassa pra API oficial da Meta,
// e devolve a resposta. Isso existe porque navegadores bloqueiam
// chamadas diretas do JS do navegador pra graph.facebook.com (CORS).

export default async function handler(req, res) {
  // Libera acesso vindo de qualquer origem (a própria ferramenta faz a chamada)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { igId, token, imageUrl, caption } = req.body || {};

  if (!igId || !token || !imageUrl) {
    return res.status(400).json({ error: 'Faltam dados: igId, token e imageUrl são obrigatórios.' });
  }

  try {
    // Etapa 1: criar o container de mídia
    const createRes = await fetch(`https://graph.instagram.com/v21.0/${igId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: caption || '',
        access_token: token
      })
    });
    const createData = await createRes.json();

    if (createData.error) {
      return res.status(400).json({ error: createData.error.message || 'Erro ao criar o container de mídia.' });
    }

    // Etapa 2: publicar o container
    const publishRes = await fetch(`https://graph.instagram.com/v21.0/${igId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: createData.id,
        access_token: token
      })
    });
    const publishData = await publishRes.json();

    if (publishData.error) {
      return res.status(400).json({ error: publishData.error.message || 'Erro ao publicar.' });
    }

    return res.status(200).json({ success: true, post_id: publishData.id });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no servidor: ' + err.message });
  }
}
