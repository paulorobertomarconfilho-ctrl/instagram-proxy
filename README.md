# Servidor de publicação Instagram

Esse projeto é uma "ponte" (proxy) entre a Central de Testes e a API do Instagram.
Existe porque navegadores bloqueiam chamadas diretas de JavaScript pra API da Meta (CORS).

## Como publicar (deploy) no Vercel — grátis, sem cartão de crédito

1. Crie uma conta em https://vercel.com (pode entrar com GitHub, Google ou e-mail)
2. Depois de logado, clique em "Add New" → "Project"
3. Se pedir um repositório do GitHub: crie um repositório novo no GitHub, suba esses arquivos nele (pasta `api/publish.js`, `package.json`), e importe esse repositório no Vercel
4. Clique em "Deploy" — leva menos de 1 minuto
5. No final, o Vercel te dá uma URL, tipo: `https://seu-projeto.vercel.app`
6. Sua função vai estar disponível em: `https://seu-projeto.vercel.app/api/publish`

Guarde essa URL final — é ela que vamos colar na Central de Testes.
