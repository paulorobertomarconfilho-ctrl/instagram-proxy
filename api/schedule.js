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
  const { id: bodyId, igId, token, imageUrl, videoUrl, caption, mediaType, format, scheduledFor, accountName, userTags, carouselItems } = req.body || {};
  const isCarousel = mediaType === 'CAROUSEL' && Array.isArray(carouselItems) && carouselItems.length >= 2;
  if(!igId || !token || !scheduledFor || !(imageUrl || videoUrl || isCarousel)){
    return res.status(400).json({ error: 'Faltam dados: igId, token, scheduledFor e imageUrl/videoUrl (ou pelo menos 2 itens de carrossel) sao obrigatorios.' });
  }
  const when = new Date(scheduledFor);
  if(isNaN(when.getTime())){
    return res.status(400).json({ error: 'Data/hora de agendamento invalida.' });
  }
  const list = await readQueue();

  if(bodyId){
    const idx = list.findIndex(item => item.id === bodyId);
    if(idx === -1){
      return res.status(404).json({ error: 'Agendamento nao encontrado (pode ja ter sido publicado ou cancelado).' });
    }
    if(list[idx].status !== 'pending'){
      return res.status(400).json({ error: 'Esse agendamento ja foi publicado ou cancelado, nao da pra editar.' });
    }
    list[idx] = {
      ...list[idx],
      igId, token, imageUrl,
      videoUrl: videoUrl || '',
      carouselItems: isCarousel ? carouselItems : [],
      caption: caption || '',
      mediaType: mediaType || 'IMAGE',
      format: format || list[idx].format || '',
      scheduledFor: when.toISOString(),
      accountName: accountName || list[idx].accountName || '',
      userTags: Array.isArray(userTags) ? userTags.filter(t => t && t.username) : [],
      updatedAt: new Date().toISOString(),
      creationId: null
    };
    await writeQueue(list);
    return res.status(200).json({ success: true, id: bodyId });
  }

  const id = 'sched-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  list.push({
    id, igId, token, imageUrl,
    videoUrl: videoUrl || '',
    carouselItems: isCarousel ? carouselItems : [],
    caption: caption || '',
    mediaType: mediaType || 'IMAGE',
    format: format || '',
    scheduledFor: when.toISOString(),
    accountName: accountName || '',
    userTags: Array.isArray(userTags) ? userTags.filter(t => t && t.username) : [],
    createdAt: new Date().toISOString(),
    status: 'pending',
    creationId: null
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
