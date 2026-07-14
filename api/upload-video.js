// Gera um token temporario pra o navegador enviar o video DIRETO pro Vercel
// Blob (sem passar pelo corpo desta funcao, que tem limite pequeno de tamanho).
// Isso permite subir videos grandes (Reels, Stories em video) sem estourar
// o limite de ~4.5MB das Vercel Functions.

import { handleUpload } from '@vercel/blob/client';

export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo nao permitido. Use POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  const body = await request.json();

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
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

    return new Response(JSON.stringify(jsonResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
