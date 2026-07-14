// Gera um token temporario pra o navegador enviar o video DIRETO pro Vercel
// Blob (sem passar pelo corpo desta funcao, que tem limite pequeno de tamanho).
// Isso permite subir videos grandes (Reels, Stories em video) sem estourar
// o limite de ~4.5MB das Vercel Functions.
//
// Roda no runtime Node.js normal (igual as outras rotas) -- o handleUpload
// usa modulos nativos do Node (crypto, stream) que nao funcionam no Edge.

import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido. Use POST.' });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: [
            'video/mp4',
            'video/quicktime',
            'video/webm',
            'video/x-m4v',
            'video/x-matroska'
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 500 * 1024 * 1024
        };
      },
      onUploadCompleted: async () => {
        // nada extra pra fazer aqui, so confirma que o upload terminou
      }
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
