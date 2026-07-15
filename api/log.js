// Guarda o "Conteudo gerado, por dia" (registro de posts: rascunhos e
// publicados, com metricas) num arquivo JSON no Vercel Blob (privado),
// igual ja acontece com os agendamentos em scheduled-posts.json.
// Antes esse registro vivia so no localStorage de cada navegador, entao um
// post feito no computador nao aparecia no celular (e vice-versa). Agora
// fica num lugar so, compartilhado entre qualquer aparelho/navegador.
//
// GET  -> retorna { items: [...] } com todo o registro.
// POST -> recebe { items: [...] } (a lista inteira, ja mesclada pelo
//         cliente) e substitui o arquivo salvo.

import { get, put } from '@vercel/blob';

const FILE = 'log-entries.json';

async function readLog(){
  try{
    const result = await get(FILE, { access: 'private' });
    if(!result || result.statusCode !== 200 || !result.stream) return [];
    const chunks = [];
    for await (const chunk of result.stream) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(text || '[]');
  }catch(e){
    return [];
  }
}

async function writeLog(list){
  await put(FILE, JSON.stringify(list), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS') return res.status(200).end();

  if(req.method === 'GET'){
    const list = await readLog();
    return res.status(200).json({ items: list });
  }

  if(req.method === 'POST'){
    const { items } = req.body || {};
    if(!Array.isArray(items)){
      return res.status(400).json({ error: 'Faltou "items" (array) no corpo.' });
    }
    await writeLog(items);
    return res.status(200).json({ success: true, count: items.length });
  }

  return res.status(405).json({ error: 'Metodo nao permitido.' });
}
