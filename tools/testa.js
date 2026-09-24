/* Teste de fumaca do motor, fora do navegador.
 *
 *   node tools/testa.js [arquivo.xml ...]
 *
 * Sem argumentos, valida todos os XML de exemplos/. Serve para conferir o
 * motor sem depender do navegador e para checar, a cada mudanca na base, que
 * nenhuma nota valida passou a acusar erro inventado.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const raizProjeto = path.resolve(__dirname, '..');
const dir = (p) => path.join(raizProjeto, p);

global.fetch = undefined;
require(dir('assets/js/base.js'));
require(dir('assets/js/leitor.js'));
require(dir('assets/js/tributos.js'));
require(dir('assets/js/motor.js'));

const leJSON = (p) => JSON.parse(fs.readFileSync(dir(p), 'utf8'));
// o layout DFe/SAP nao existe na versao publica do site, e o motor nao
// depende dele: alimenta apenas a consulta de mapeamento
const leOpcional = (p) => (fs.existsSync(dir(p)) ? leJSON(p) : { campos: [] });

const layout = leJSON('data/layout.json');
const regras = leJSON('data/regras.json');
const dfe = leOpcional('data/layout-dfe.json');
const fontes = leJSON('data/fontes.json');

// aplica os ajustes declarados, como o build_db.py faz
global.Base.carregaDe(layout, regras, dfe, fontes);

console.log('base: %d campos | %d regras | %d campos DFe',
  layout.campos.length, regras.regras.length, dfe.campos.length);

let alvos = process.argv.slice(2);
if (!alvos.length) {
  const pasta = dir('exemplos');
  if (fs.existsSync(pasta)) {
    alvos = fs.readdirSync(pasta)
      .filter((f) => f.toLowerCase().endsWith('.xml'))
      .map((f) => path.join(pasta, f));
  }
}
if (!alvos.length) {
  console.log('\nNenhum XML para testar. Coloque arquivos em exemplos/.');
  process.exit(0);
}

let totalErros = 0;
const porGrupo = {};

for (const arquivo of alvos) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  const inicio = Date.now();
  const r = global.Motor.valida(texto, path.basename(arquivo), {
    ordem: 'aviso', mapeamento: true, tolerancia: 0.001
  });
  const ms = Date.now() - inicio;

  console.log('\n' + '='.repeat(78));
  console.log('%s  (%d ms)', path.basename(arquivo), ms);
  console.log('  chave %s', r.cabecalho.chave || '—');
  console.log('  mod %s  serie %s  nº %s  itens %s  vNF %s  CRT %s',
    r.cabecalho.modelo, r.cabecalho.serie, r.cabecalho.numero,
    r.cabecalho.itens, r.cabecalho.vNF, r.cabecalho.crt);
  console.log('  elementos %d | mapeados %d | fora do mapeamento %d',
    r.totais.elementos, r.totais.mapeados, r.totais.foraMapeamento);
  console.log('  ERROS %d | avisos %d | risco %s',
    r.totais.erros, r.totais.avisos, r.risco);

  totalErros += r.totais.erros;

  for (const a of r.achados) {
    porGrupo[a.grupo] = (porGrupo[a.grupo] || 0) + 1;
  }

  const mostra = r.achados.filter((a) => a.nivel === 'erro').slice(0, 25);
  for (const a of mostra) {
    console.log('   [%s] %s', a.grupo, a.titulo);
    console.log('        alvo: %s (linha %d)', a.alvo, a.linha);
    if (a.esperado) console.log('        esperado: %s', a.esperado.slice(0, 110));
    if (a.obtido) console.log('        obtido:   %s', a.obtido.slice(0, 110));
    if (a.fonte) console.log('        fonte:    %s', a.fonte.slice(0, 110));
  }
  const avisos = r.achados.filter((a) => a.nivel === 'aviso');
  if (avisos.length) {
    console.log('   --- avisos (%d):', avisos.length);
    for (const a of avisos.slice(0, 12)) {
      console.log('   [%s] %s — %s', a.grupo, a.titulo, a.alvo);
    }
  }

  if (r.fiscal) {
    const naoFecham = r.fiscal.totais.filter((t) => !t.ok);
    console.log('   totalizadores conferidos: %d | não fecham: %d',
      r.fiscal.totais.length, naoFecham.length);
    if (r.fiscal.rtc.presente) {
      console.log('   RTC presente: %d itens com IBS/CBS', r.fiscal.rtc.itens.length);
    }
  }
}

console.log('\n' + '='.repeat(78));
console.log('achados por grupo:');
Object.keys(porGrupo).sort((a, b) => porGrupo[b] - porGrupo[a])
  .forEach((g) => console.log('   ' + g.padEnd(22) + porGrupo[g]));
console.log('\ntotal de erros: %d', totalErros);
