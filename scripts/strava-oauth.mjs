import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = '229941';
const CLIENT_SECRET = '51041455b8db07b69f9acb161001f58ed6fda727';
const REDIRECT_URI = 'http://localhost:3000';
const SCOPE = 'activity:read_all,read';

const authUrl =
  `https://www.strava.com/oauth/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&approval_prompt=force` +
  `&scope=${SCOPE}`;

console.log('\nAbra esta URL no navegador:\n');
console.log(authUrl);
console.log('\nAguardando callback em http://localhost:3000 ...\n');
console.log('(certifique-se de que o servidor Next.js está parado)\n');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('Código de autorização não encontrado.');
    return;
  }

  console.log('Código recebido, trocando pelo token...');

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
  }).toString();

  const options = {
    hostname: 'www.strava.com',
    path: '/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const tokenReq = https.request(options, (tokenRes) => {
    let data = '';
    tokenRes.on('data', (chunk) => (data += chunk));
    tokenRes.on('end', () => {
      const token = JSON.parse(data);

      if (token.errors) {
        console.error('Erro da API Strava:', JSON.stringify(token.errors));
        res.writeHead(500);
        res.end('Erro ao obter token. Veja o terminal.');
        server.close();
        return;
      }

      const tokenPath = path.join(__dirname, '..', 'data', 'strava-token.json');
      const toSave = {
        token_type: token.token_type,
        access_token: token.access_token,
        expires_at: token.expires_at,
        expires_in: token.expires_in,
        refresh_token: token.refresh_token,
        scope: token.scope,
      };

      fs.writeFileSync(tokenPath, JSON.stringify(toSave, null, 2));
      console.log('\nToken salvo em data/strava-token.json');
      console.log('Escopo:', token.scope);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Autorizado com sucesso! Token salvo. Pode fechar esta aba.</h1>');
      server.close();
    });
  });

  tokenReq.on('error', (err) => {
    console.error('Erro na requisição:', err);
    res.writeHead(500);
    res.end('Erro interno.');
  });

  tokenReq.write(body);
  tokenReq.end();
});

server.listen(3000, 'localhost');
