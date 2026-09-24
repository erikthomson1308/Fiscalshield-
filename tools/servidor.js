/* Servidor local, sem dependencia nenhuma.
 *
 *   node tools/servidor.js [porta]
 *
 * Existe por um motivo pratico: abrir o index.html direto do disco nao
 * funciona, porque o navegador bloqueia a leitura dos JSON da base em
 * file://. E o site publicado fica atras da lista de IPs permitidos do
 * enterprise, que barra a saida de alguns nos do Zscaler. Com este servidor
 * o site roda na propria maquina, identico ao publicado.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const porta = parseInt(process.argv[2], 10) || 8000;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const servidor = http.createServer((req, res) => {
  let alvo;
  try {
    alvo = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400).end('Requisição inválida');
    return;
  }
  if (alvo.endsWith('/')) alvo += 'index.html';

  // impede sair da pasta do projeto
  const arquivo = path.resolve(raiz, '.' + alvo);
  if (arquivo !== raiz && !arquivo.startsWith(raiz + path.sep)) {
    res.writeHead(403).end('Fora do projeto');
    return;
  }

  fs.readFile(arquivo, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado: ' + alvo);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(arquivo).toLowerCase()]
        || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(conteudo);
  });
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('\n  A porta %d já está em uso.', porta);
    console.error('  Rode com outra porta:  node tools/servidor.js 8001\n');
  } else {
    console.error('\n  Erro ao subir o servidor: %s\n', e.message);
  }
  process.exit(1);
});

servidor.listen(porta, '127.0.0.1', () => {
  console.log('');
  console.log('  Fiscal Shield rodando em  http://localhost:%d', porta);
  console.log('  Pasta servida: %s', raiz);
  console.log('');
  console.log('  Feche esta janela para parar.');
  console.log('');
});
