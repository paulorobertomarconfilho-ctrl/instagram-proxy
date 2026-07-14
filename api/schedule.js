// Gerencia a fila de publicacoes agendadas.
// Guarda tudo num unico arquivo JSON dentro do Vercel Blob (privado).
// GET lista os agendamentos, POST cria um novo, DELETE cancela.

import { get, put } from '@vercel/blob';

const FILE = 'scheduled-posts.json';

async function readQueue(){
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

async function writeQueue(list){
  await put(FILE, JSON.stringify(list), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

if(req.method === 'OPTIONS') return res.status(200).end();

if(req.method === 'GET'){
  const list = await readQueue();
  const safe = list.map(({ token, ...rest }) => rest);
  safe.sort((a,b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  return res.status(200).json({ items: safe });
}

if(req.method === 'POST'){
  const { igId, token, imageUrl, caption, mediaType, scheduledFor, accountName, userTags, locationId } = req.body || {};
  if(!igId || !token || !imageUrl || !scheduledFor){
    return res.status(400).json({ error: 'Faltam dados: igId, token, imageUrl e scheduledFor sao obrigatorios.' });
  }
  const when = new Date(scheduledFor);
  if(isNaN(when.getTime())){
    return res.status(400).json({ error: 'Data/hora de agendamento invalida.' });
  }
  const list = await readQueue();
  const id = 'sched-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  list.push({
    id, igId, token, imageUrl,
    caption: caption || '',
    mediaType: mediaType || 'IMAGE',
    scheduledFor: when.toISOString(),
    accountName: accountName || '',
    userTags: Array.isArray(userTags) ? userTags.filter(t => t && t.username) : [],
    locationId: locationId || '',
    createdAt: new Date().toISOString(),
    status: 'pending'
  });
  await writeQueue(list);
  return res.status(200).json({ success: true, id });
}

if(req.method === 'DELETE'){
  const id = (req.query && req.query.id) || (req.body && req.body.id);
  if(!id) return res.status(400).json({ error: 'Faltou o id do agendamento.' });
  const list = await readQueue();
  const next = list.filter(item => item.id !== id);
  await writeQueue(next);
  return res.status(200).json({ success: true });
}

return res.status(405).json({ error: 'Metodo nao permitido.' });
}
