// Funcoes compartilhadas pra criar e publicar carrosseis (varias fotos/videos
// num post so) via Instagram Graph API. O prefixo "_" no nome do arquivo faz
// a Vercel NAO tratar isso como uma rota/funcao propria -- e so um modulo
// importado por publish.js e cron-publish.js.

const GRAPH = 'https://graph.instagram.com/v21.0';

// Cria um container "filho" do carrossel (uma foto ou video individual,
// sem legenda propria -- a legenda vai so no container pai).
export async function createCarouselChild(igId, token, item){
  const body = { access_token: token, is_carousel_item: true };
  if(item.type === 'video'){
    body.media_type = 'VIDEO';
    body.video_url = item.url;
  } else {
    body.image_url = item.url;
  }
  const res = await fetch(`${GRAPH}/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if(data.error) throw new Error(data.error.message || 'Erro ao criar um item do carrossel.');
  if(!data.id){
    // A Meta às vezes devolve uma resposta sem "error" e sem "id" (falha
    // momentânea). Sem essa checagem, o id undefined seguia adiante e só
    // dava erro confuso ("resource does not exist") bem mais tarde.
    throw new Error('O Instagram não retornou um ID pra um item do carrossel (resposta inesperada). Tenta de novo em alguns segundos.');
  }
  return data.id;
}

// Espera um container terminar de processar no Instagram (video demora, foto
// costuma ser rapido mas tambem passa por aqui por seguranca).
export async function pollUntilFinished(creationId, token, { maxAttempts, delayMs }){
  for(let i = 0; i < maxAttempts; i++){
    const res = await fetch(`${GRAPH}/${creationId}?fields=status_code&access_token=${token}`);
    const data = await res.json();
    if(data.status_code === 'FINISHED') return true;
    if(data.status_code === 'ERROR') throw new Error('Um item do carrossel falhou ao processar no Instagram.');
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

// Cria todos os containers filhos do carrossel, em ordem, esperando cada
// video terminar de processar antes de seguir pro proximo item.
export async function buildCarouselChildren(igId, token, items){
  const ids = [];
  for(const item of items){
    const id = await createCarouselChild(igId, token, item);
    if(item.type === 'video'){
      const ready = await pollUntilFinished(id, token, { maxAttempts: 30, delayMs: 3000 });
      if(!ready) throw new Error('Um video do carrossel demorou demais pra processar. Tenta "Agendar" em vez de "Publicar agora".');
    }
    ids.push(id);
  }
  return ids;
}

// Cria o container "pai" do carrossel, referenciando os filhos ja prontos.
export async function createCarouselParent(igId, token, childrenIds, caption){
  const res = await fetch(`${GRAPH}/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      media_type: 'CAROUSEL',
      children: childrenIds.join(','),
      caption: caption || ''
    })
  });
  const data = await res.json();
  if(data.error) throw new Error(data.error.message || 'Erro ao criar o carrossel.');
  if(!data.id){
    throw new Error('O Instagram não retornou um ID de criação pro carrossel (resposta inesperada). Tenta de novo em alguns segundos.');
  }
  return data.id;
}

// Publica um container (carrossel, foto, video, reel, story -- qualquer um).
export async function publishContainer(igId, token, creationId){
  const res = await fetch(`${GRAPH}/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: token })
  });
  const data = await res.json();
  if(data.error) throw new Error(data.error.message || 'Erro ao publicar.');
  if(!data.id){
    throw new Error('O Instagram não retornou um ID de post ao publicar (resposta inesperada). Confira no app se ele foi publicado antes de tentar de novo.');
  }
  return data.id;
}
