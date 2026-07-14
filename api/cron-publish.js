// Publica automaticamente os posts agendados cujo horario ja chegou.
// Chamado pelo cron nativo do Vercel (1x/dia no plano Hobby) e,
// opcionalmente, por um pinger externo (ex: cron-job.org) a cada poucos
// minutos pra ter mais precisao de horario.
//
// Video demora bem mais que imagem pra processar no Instagram. Se o video
// nao terminar de processar dentro do tempo desta execucao, o item fica
// "pending" com o creationId salvo, e o PROXIMO ciclo do cron continua o
// acompanhamento a partir dali (sem criar um container novo).

import { get, put } from '@vercel/blob';
import { buildCarouselChildren, createCarouselParent, publishContainer } from './_igCarousel.js';

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

async function publishToInstagram(item){
  const { igId, token, imageUrl, videoUrl, caption, mediaType, userTags, carouselItems, creationId: existingCreationId } = item;
  const isCarousel = mediaType === 'CAROUSEL' && Array.isArray(carouselItems) && carouselItems.length >= 2;
  const isVideo = !!videoUrl;
  let creationId = existingCreationId || null;

  if(!creationId){
    if(isCarousel){
      const childrenIds = await buildCarouselChildren(igId, token, carouselItems);
      creationId = await createCarouselParent(igId, token, childrenIds, caption || '');
    } else {
      const createBody = { access_token: token };

      if(isVideo){
        createBody.video_url = videoUrl;
        if(mediaType === 'REELS'){
          createBody.media_type = 'REELS';
        } else if(mediaType === 'STORIES'){
          createBody.media_type = 'STORIES';
        } else {
          createBody.media_type = 'VIDEO';
        }
        if(mediaType !== 'STORIES'){
          createBody.caption = caption || '';
        }
      } else {
        createBody.image_url = imageUrl;
        if(mediaType === 'STORIES'){
          createBody.media_type = 'STORIES';
        } else {
          createBody.caption = caption || '';
        }
      }

      if(Array.isArray(userTags) && userTags.length > 0){
        createBody.user_tags = userTags
          .filter(t => t && t.username)
          .map(t => ({ username: t.username, x: t.x, y: t.y }));
      }

      const createRes = await fetch(`https://graph.instagram.com/v21.0/${igId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createBody)
      });
      const createData = await createRes.json();
      if(createData.error){
        throw new Error(createData.error.message || 'Erro ao criar o container de midia.');
      }
      creationId = createData.id;
    }
  }

  // Video/carrossel: acompanha por bem mais tempo, mas sem estourar o tempo desta execucao.
  const maxAttempts = (isVideo || isCarousel) ? 70 : 8;
  const delayMs = (isVideo || isCarousel) ? 3000 : 2000;

  let ready = false;
  for(let i = 0; i < maxAttempts; i++){
    const statusRes = await fetch(`https://graph.instagram.com/v21.0/${creationId}?fields=status_code&access_token=${token}`);
    const statusData = await statusRes.json();
    if(statusData.status_code === 'FINISHED'){ ready = true; break; }
    if(statusData.status_code === 'ERROR'){
      throw new Error('O video falhou ao processar no Instagram.');
    }
    await new Promise(r => setTimeout(r, delayMs));
  }

  if(!ready){
    // Ainda processando: nao e erro, so nao terminou a tempo. Fica pending
    // com o creationId salvo pra retomar no proximo ciclo do cron.
    return { status: 'processing', creationId };
  }

  const postId = await publishContainer(igId, token, creationId);
  return { status: 'published', postId };
}

export default async function handler(req, res){
  const auth = req.headers.authorization || '';
  const secretParam = (req.query && req.query.secret) || '';
  const expected = process.env.CRON_SECRET;
  const authorized = expected && (auth === `Bearer ${expected}` || secretParam === expected);

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
    const result = await publishToInstagram(item);
    if(result.status === 'published'){
      item.status = 'published';
      item.publishedAt = new Date().toISOString();
      item.postId = result.postId;
      results.push({ id: item.id, ok: true });
    } else {
      item.creationId = result.creationId;
      results.push({ id: item.id, ok: true, processing: true });
    }
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
