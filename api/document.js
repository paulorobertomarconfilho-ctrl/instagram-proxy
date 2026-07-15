// Biblioteca de documentos de referência por conta (PDF, planilha, texto).
// O texto de cada documento é extraído aqui no servidor e guardado junto,
// pra depois ser usado como contexto extra na geração de legenda/roteiro
// (ver api/generate.js). Tudo fica num único arquivo JSON no Vercel Blob,
// igual ao padrão já usado em log.js e schedule.js.
//
// GET    ?accountId=xxx -> lista os documentos dessa conta (com o texto)
// POST   { accountId, name, type, base64 } -> extrai o texto e salva
// DELETE ?id=xxx -> remove um documento

import { get, put } from '@vercel/blob';

const FILE = 'documents.json';
const MAX_TEXT_CHARS = 12000; // limite pra não deixar o prompt gigante depois

async function readDocs(){
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

async function writeDocs(list){
  await put(FILE, JSON.stringify(list), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

async function extractText(type, buffer){
  const t = (type || '').toLowerCase();
  if(t.includes('pdf')){
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text || '';
  }
  if(t.includes('spreadsheet') || t.includes('excel') || t.includes('csv') || t.endsWith('.csv')){
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let out = '';
    wb.SheetNames.forEach(name => {
      out += '--- ' + name + ' ---\n';
      out += XLSX.utils.sheet_to_csv(wb.Sheets[name]) + '\n';
    });
    return out;
  }
  // txt, md, ou qualquer outro texto simples
  return buffer.toString('utf-8');
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS') return res.status(200).end();

  if(req.method === 'GET'){
    const list = await readDocs();
    const accountId = req.query && req.query.accountId;
    const filtered = accountId ? list.filter(d => d.accountId === accountId) : list;
    return res.status(200).json({ items: filtered });
  }

  if(req.method === 'POST'){
    const { accountId, name, type, base64 } = req.body || {};
    if(!accountId || !name || !base64){
      return res.status(400).json({ error: 'Faltam dados: accountId, name e base64 sao obrigatorios.' });
    }
    try{
      const buffer = Buffer.from(base64, 'base64');
      if(buffer.length > 4.5 * 1024 * 1024){
        return res.status(400).json({ error: 'Arquivo grande demais (limite de 4,5MB por documento).' });
      }
      let text = '';
      try{
        text = await extractText(type, buffer);
      }catch(e){
        text = '';
      }
      text = (text || '').trim().slice(0, MAX_TEXT_CHARS);

      const list = await readDocs();
      const doc = {
        id: 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        accountId, name, type: type || '',
        text,
        textTruncated: text.length >= MAX_TEXT_CHARS,
        uploadedAt: new Date().toISOString()
      };
      list.push(doc);
      await writeDocs(list);
      return res.status(200).json({ success: true, doc });
    }catch(error){
      return res.status(500).json({ error: 'Erro ao processar documento: ' + error.message });
    }
  }

  if(req.method === 'DELETE'){
    const id = (req.query && req.query.id) || (req.body && req.body.id);
    if(!id) return res.status(400).json({ error: 'Faltou o id do documento.' });
    const list = await readDocs();
    const next = list.filter(d => d.id !== id);
    await writeDocs(next);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Metodo nao permitido.' });
}
