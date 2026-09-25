/* Teste dos dois validadores, fora do navegador.
 *
 *   node tools/testa.js [arquivo.xml ...]
 *
 * Sem argumentos, valida todos os XML de exemplos/ - que incluem NF-e e
 * DPS. Reproduz o que o roteador faz na pagina: reconhece o documento pelo
 * conteudo e manda para o motor daquele tipo.
 *
 * O ponto do teste nao e achar erro nos exemplos: e conferir, a cada mudanca
 * na base, que nenhum documento valido passou a acusar erro que nao existe.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const raizProjeto = path.resolve(__dirname, '..');
const dir = (p) => path.join(raizProjeto, p);
const leJSON = (p) => JSON.parse(fs.readFileSync(dir(p), 'utf8'));
const existe = (p) => fs.existsSync(dir(p));

require(dir('assets/js/leitor.js'));

// Os dois validadores sao opcionais: a versao publica traz so a NF-e, e o
// teste precisa rodar igual nas duas builds sem exigir o que nao existe.
const disponiveis = {};

if (existe('assets/js/nfe/motor.js') && existe('data/nfe/layout.json')) {
  require(dir('assets/js/nfe/base.js'));
  require(dir('assets/js/nfe/tributos.js'));
  require(dir('assets/js/nfe/motor.js'));
  global.NFe.Base.carregaDe(
    leJSON('data/nfe/layout.json'), leJSON('data/nfe/regras.json'),
    existe('data/nfe/layout-dfe.json')
      ? leJSON('data/nfe/layout-dfe.json') : { campos: [] },
    leJSON('data/nfe/fontes.json'));
  disponiveis.nfe = true;
  console.log('NF-e   : %d campos | %d regras',
    global.NFe.Base.dados.campos.length, global.NFe.Base.dados.regras.length);
}

if (existe('assets/js/nfse/motor.js') && existe('data/nfse/versoes.json')) {
  require(dir('assets/js/nfse/base.js'));
  require(dir('assets/js/nfse/motor.js'));
  global.NFSe.Base.carregaDe(
    leJSON('data/nfse/versoes.json'), leJSON('data/nfse/tabelas.json'),
    leJSON('data/nfse/comparativo.json'), leJSON('data/nfse/fontes.json'));
  disponiveis.nfse = true;
  console.log('NFS-e  : %s | %d campos | %d regras | %d pares CST×cClassTrib',
    global.NFSe.Base.dados.vigente.toUpperCase(),
    global.NFSe.Base.dados.campos.length, global.NFSe.Base.dados.regras.length,
    (global.NFSe.Base.dados.tabelas.associacao_cst_cclasstrib
      || { itens: [] }).itens.length);
}

if (!Object.keys(disponiveis).length) {
  console.log('Nenhum validador disponível nesta pasta.');
  process.exit(1);
}

// ---- roteamento, igual ao da pagina
function identifica(texto) {
  const a = texto.slice(0, 4000);
  if (/<(\w+:)?infDPS[\s>]/.test(a) || /<(\w+:)?infNFSe[\s>]/.test(a)) return 'nfse';
  if (/<(\w+:)?infNFe[\s>]/.test(a)) return 'nfe';
  if (/<(\w+:)?DPS[\s>]/.test(a) || /<(\w+:)?NFSe[\s>]/.test(a)) return 'nfse';
  if (/<(\w+:)?(nfeProc|NFe)[\s>]/.test(a)) return 'nfe';
  return null;
}
const MOTOR = { nfe: () => global.NFe.Motor, nfse: () => global.NFSe.Motor };
const ROTULO = { nfe: 'NF-e / NFC-e', nfse: 'NFS-e nacional' };

let alvos = process.argv.slice(2);
if (!alvos.length) {
  const pasta = dir('exemplos');
  alvos = fs.existsSync(pasta)
    ? fs.readdirSync(pasta).filter((f) => f.toLowerCase().endsWith('.xml'))
      .map((f) => path.join(pasta, f))
    : [];
}
if (!alvos.length) { console.log('\nNenhum XML em exemplos/.'); process.exit(0); }

let totalErros = 0;
let naoReconhecidos = 0;
const porGrupo = {};

for (const arquivo of alvos) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  const tipo = identifica(texto);
  const nome = path.basename(arquivo);

  console.log('\n' + '='.repeat(78));
  if (!tipo) {
    console.log('%s  ->  NÃO RECONHECIDO', nome);
    naoReconhecidos++;
    continue;
  }
  if (!disponiveis[tipo]) {
    console.log('%s  ->  %s (validador ausente nesta build)', nome, ROTULO[tipo]);
    continue;
  }

  const r = MOTOR[tipo]().valida(texto, nome,
    { ordem: 'aviso', mapeamento: true, tolerancia: 0.001 });

  console.log('%s  ->  %s', nome, ROTULO[tipo]);
  console.log('  elementos %d | mapeados %d | fora do mapeamento %d',
    r.totais.elementos, r.totais.mapeados, r.totais.foraMapeamento);
  console.log('  ERROS %d | avisos %d | informações %d | risco %s',
    r.totais.erros, r.totais.avisos, r.totais.informacoes, r.risco);

  totalErros += r.totais.erros;
  for (const a of r.achados) porGrupo[a.grupo] = (porGrupo[a.grupo] || 0) + 1;

  for (const a of r.achados.filter((x) => x.nivel === 'erro').slice(0, 20)) {
    console.log('   [%s] %s', a.grupo, a.titulo);
    console.log('        alvo: %s', a.alvo);
    if (a.esperado) console.log('        esperado: %s', a.esperado.slice(0, 110));
    if (a.obtido) console.log('        obtido:   %s', a.obtido.slice(0, 110));
    if (a.regra) console.log('        regra %s', a.regra.codigo);
  }
  for (const a of r.achados.filter((x) => x.nivel === 'aviso').slice(0, 8)) {
    console.log('   [aviso] %s — %s', a.titulo, a.alvo);
  }
}

console.log('\n' + '='.repeat(78));
console.log('achados por grupo:');
Object.keys(porGrupo).sort((a, b) => porGrupo[b] - porGrupo[a])
  .forEach((g) => console.log('   ' + g.padEnd(24) + porGrupo[g]));
console.log('\ntotal de erros: %d | não reconhecidos: %d',
  totalErros, naoReconhecidos);
