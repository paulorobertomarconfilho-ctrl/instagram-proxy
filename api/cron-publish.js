// Publica automaticamente os posts agendados cujo horario ja chegou.
// Chamado pelo cron nativo do Vercel (1x/dia no plano Hobby) e,
// opcionalmente, por um pinger externo (ex: cron-job.org) a cada poucos
// minutos pra ter mais precisao de horario.

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
    allowOverwrite: true,
    cacheControlMaxAge: 0
  });
}

async function publishToInstagram({ igId, token, imageUrl, caption, mediaType }){
  const createUrl = 'https://graph.instagram.com/v21.0/' + igId + '/media';
  const createBody = { image_url: imageUrl, access_token: token };
  if(mediaType === 'STORIES'){
    createBody.media_type = 'STORIES';
  } else {
    createBody.caption = caption || '';
  }

const createRes = await fetch(createUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(createBody)
});
  const createData = await createRes.json();
  if(createData.error){
    throw new Error(createData.error.message || 'Erro ao criar o container de midia.');
  }
  const creationId = createData.id;

let ready = false;
  for(let i = 0; i < 8; i++){
    const statusUrl = 'https://graph.instagram.com/v21.0/' + creationId + '?fields=status_code&access_token=' + token;
    const statusRes = await fetch(statusUrl);
    const statusData = await statusRes.json();
    if(statusData.status_code === 'FINISHED'){ ready = true; break; }
    if(statusData.status_code === 'ERROR'){
      throw new Error('A imagem falhou ao processar no Instagram.');
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  if(!ready){
    throw new Error('A imagem demorou demais pra processar.');
  }

const publishUrl = 'https://graph.instagram.com/v21.0/' + igId + '/media_publish';
  const publishRes = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: token })
  });
  const publishData = await publishRes.json();
  if(publishData.error){
    throw new Error(publishData.error.message || 'Erro ao publicar.');
  }
  return publishData.id;
}

export default async function handler(req, res){
  const auth = req.headers.authorization || '';
  const secretParam = (req.query && req.query.secret) || '';
  const expected = process.env.CRON_SECRET;
  const authorized = expected && (auth === 'Bearer ' + expected || secretParam === expected);

if(!authorized){
  return res.status(401).json({ error: 'Nao autorizado.' });
}

const list = await readQueue();
  const now = Date.now();
  let changed = false;
  const results = [];

for(const item of list){
  if(item.status !== 'pending') continue;
  if(new Date(item.scheduledFor).getTime() > now) continue;

  try{
    const postId = await publishToInstagram(item);
    item.status = 'published';
    item.publishedAt = new Date().toISOString();
    item.postId = postId;
    results.push({ id: item.id, ok: true });
  }catch(err){
    item.status = 'error';
    item.error = err.message || String(err);
    results.push({ id: item.id, ok: false, error: item.error });
  }
  changed = true;
}

if(changed){
  await writeQueue(list);
}

return res.status(200).json({ checked: list.length, processed: results.length, results });
}
