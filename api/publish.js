// Servidor intermediário (proxy) para publicar no Instagram.
// Recebe o pedido da Central de Testes, repassa pra API oficial da Meta,
// e devolve a resposta. Isso existe porque navegadores bloqueiam
// chamadas diretas do JS do navegador pra graph.facebook.com (CORS).

import { buildCarouselChildren, createCarouselParent, publishContainer } from './_igCarousel.js';

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

const { igId, token, imageUrl, videoUrl, caption, mediaType, userTags, carouselItems } = req.body || {};

const isCarousel = mediaType === 'CAROUSEL' && Array.isArray(carouselItems) && carouselItems.length > 0;

if (!igId || !token) {
  return res.status(400).json({ error: 'Faltam dados: igId e token são obrigatórios.' });
}

if (isCarousel) {
  if (carouselItems.length < 2) {
    return res.status(400).json({ error: 'O carrossel precisa de pelo menos 2 itens (fotos ou vídeos). Selecione mais na etapa "2. Imagem".' });
  }
  if (carouselItems.length > 10) {
    return res.status(400).json({ error: 'O carrossel aceita no máximo 10 itens. Você selecionou ' + carouselItems.length + '.' });
  }
} else if (!imageUrl && !videoUrl) {
  return res.status(400).json({ error: 'Faltam dados: imageUrl ou videoUrl são obrigatórios.' });
}

const isVideo = !!videoUrl;
const isStory = mediaType === 'STORIES';
const isReel = mediaType === 'REELS';

try {
  if (isCarousel) {
    const childrenIds = await buildCarouselChildren(igId, token, carouselItems);
    const parentId = await createCarouselParent(igId, token, childrenIds, caption || '');

    let ready = false;
    for (let i = 0; i < 15; i++) {
      const statusRes = await fetch(`https://graph.instagram.com/v21.0/${parentId}?fields=status_code&access_token=${token}`);
      const statusData = await statusRes.json();
      if (statusData.status_code === 'FINISHED') { ready = true; break; }
      if (statusData.status_code === 'ERROR') {
        return res.status(400).json({ error: 'O carrossel falhou ao processar no Instagram.' });
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    if (!ready) {
      return res.status(400).json({ error: 'O carrossel demorou demais pra processar. Tenta "Agendar" em vez de "Publicar agora".' });
    }

    const postId = await publishContainer(igId, token, parentId);
    return res.status(200).json({ success: true, post_id: postId });
  }

  const createBody = { access_token: token };

  if (isVideo) {
    createBody.video_url = videoUrl;
    if (isReel) {
      createBody.media_type = 'REELS';
    } else if (isStory) {
      createBody.media_type = 'STORIES';
    } else {
      createBody.media_type = 'VIDEO';
    }
    if (!isStory) {
      createBody.caption = caption || '';
    }
  } else {
    createBody.image_url = imageUrl;
    if (isStory) {
      createBody.media_type = 'STORIES';
    } else {
      createBody.caption = caption || '';
    }
  }

  if (Array.isArray(userTags) && userTags.length > 0) {
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

  if (createData.error) {
    return res.status(400).json({ error: createData.error.message || 'Erro ao criar o container de mídia.' });
  }

  const creationId = createData.id;

  // Vídeo demora bem mais que imagem pra processar no Instagram.
  const maxAttempts = isVideo ? 80 : 8;
  const delayMs = isVideo ? 3000 : 2000;

  let ready = false;
  for (let i = 0; i < maxAttempts; i++) {
    const statusRes = await fetch(`https://graph.instagram.com/v21.0/${creationId}?fields=status_code&access_token=${token}`);
    const statusData = await statusRes.json();
    if (statusData.status_code === 'FINISHED') {
      ready = true;
      break;
    }
    if (statusData.status_code === 'ERROR') {
      return res.status(400).json({ error: isVideo ? 'O vídeo falhou ao processar no Instagram. Confira o formato/tamanho do arquivo.' : 'A imagem falhou ao processar no Instagram. Confira se o link é público e termina em .jpg/.png.' });
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  if (!ready) {
    return res.status(400).json({
      error: isVideo
        ? 'O vídeo está demorando mais que o normal pra processar. Em vez de "Publicar agora", tenta "Agendar" (mesmo que pra daqui a poucos minutos) — o agendamento continua tentando automaticamente até terminar.'
        : 'A imagem demorou demais pra processar. Tenta de novo em alguns segundos.'
    });
  }

  const publishRes = await fetch(`https://graph.instagram.com/v21.0/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
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
