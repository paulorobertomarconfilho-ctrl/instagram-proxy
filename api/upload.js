// Recebe uma imagem (em base64) da Central de Testes e envia pro ImgBB,
// devolvendo o link público da imagem hospedada.
// A chave do ImgBB fica guardada como variável de ambiente no Vercel,
// nunca aparece no código público do GitHub.

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

  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave do ImgBB não configurada no servidor.' });
  }

  const { imageBase64 } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: 'Nenhuma imagem recebida.' });
  }

  try {
    const params = new URLSearchParams();
    params.append('key', apiKey);
    params.append('image', imageBase64);

    const uploadRes = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: params
    });
    const uploadData = await uploadRes.json();

    if (!uploadData.success) {
      return res.status(400).json({ error: uploadData.error?.message || 'Erro ao enviar imagem pro ImgBB.' });
    }

    return res.status(200).json({ url: uploadData.data.url });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no servidor: ' + err.message });
  }
}
