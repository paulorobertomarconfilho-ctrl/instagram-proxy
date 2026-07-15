// Recebe a URL de um vídeo já enviado (blob público) e a URL do logotipo da
// conta, sobrepõe o logotipo no rodapé do vídeo usando ffmpeg, e sobe o
// resultado num novo blob público (pasta de vídeos), devolvendo a nova URL.
//
// Roda no runtime Node.js normal (precisa de child_process/fs, que não
// funcionam no Edge). O binário do ffmpeg vem do pacote @ffmpeg-installer/ffmpeg,
// que já inclui o executável certo pra plataforma -- não precisa instalar nada
// à parte no servidor.

import { put } from '@vercel/blob';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

export const config = {
  maxDuration: 60
};

async function downloadTo(url, filePath){
  const res = await fetch(url);
  if(!res.ok) throw new Error('Falha ao baixar ' + url + ' (status ' + res.status + ')');
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buf);
}

function runFfmpeg(args){
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath.path, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if(code === 0) resolve();
      else reject(new Error('ffmpeg saiu com código ' + code + ': ' + stderr.slice(-800)));
    });
  });
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' });

  if(!process.env.VIDEO_BLOB_READ_WRITE_TOKEN){
    return res.status(500).json({ error: 'VIDEO_BLOB_READ_WRITE_TOKEN nao esta visivel neste runtime.' });
  }

  const { videoUrl, logoUrl } = req.body || {};
  if(!videoUrl || !logoUrl){
    return res.status(400).json({ error: 'Faltam dados: videoUrl e logoUrl sao obrigatorios.' });
  }

  const tmp = os.tmpdir();
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const inputPath = path.join(tmp, 'in-' + stamp + '.mp4');
  const logoPath = path.join(tmp, 'logo-' + stamp + '.png');
  const outputPath = path.join(tmp, 'out-' + stamp + '.mp4');

  try{
    await Promise.all([
      downloadTo(videoUrl, inputPath),
      downloadTo(logoUrl, logoPath)
    ]);

    // Logotipo com ~16% da largura do vídeo, centralizado, com uma margem
    // embaixo (4% da altura). "force_original_aspect_ratio=decrease" evita
    // distorcer o logotipo.
    const filter =
      '[1:v]scale=iw*0.16:-1[logo];' +
      '[0:v][logo]overlay=(main_w-overlay_w)/2:main_h-overlay_h-(main_h*0.04)';

    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-i', logoPath,
      '-filter_complex', filter,
      '-preset', 'veryfast',
      '-c:a', 'copy',
      outputPath
    ]);

    const outBuf = await readFile(outputPath);
    const blob = await put('watermarked-' + stamp + '.mp4', outBuf, {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
      token: process.env.VIDEO_BLOB_READ_WRITE_TOKEN
    });

    return res.status(200).json({ success: true, url: blob.url });
  }catch(error){
    return res.status(500).json({ error: error.message });
  }finally{
    await Promise.allSettled([
      unlink(inputPath),
      unlink(logoPath),
      unlink(outputPath)
    ]);
  }
}
