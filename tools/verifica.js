/* Portao de publicacao: confere o motor contra o esperado.
 *
 *   node tools/verifica.js
 *
 * Diferente de tools/testa.js, que so mostra o resultado, este compara com
 * exemplos/esperado.json e devolve codigo de saida diferente de zero quando
 * algo nao bate. E o que o fluxo do GitHub Actions roda antes de publicar.
 *
 * Confere as duas direcoes, e a segunda e a que costuma faltar:
 *
 *   - documento valido nao pode gerar apontamento (falso positivo)
 *   - documento com defeito TEM de gerar os apontamentos previstos
 *
 * Sem a segunda, um motor que aprovasse tudo passaria no teste.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const raizProjeto = path.resolve(__dirname, '..');
const dir = (p) => path.join(raizProjeto, p);
const leJSON = (p) => JSON.parse(fs.readFileSync(dir(p), 'utf8'));
const existe = (p) => fs.existsSync(dir(p));

require(dir('assets/js/leitor.js'));

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
  disponiveis.nfe = global.NFe;
}
if (existe('assets/js/nfse/motor.js') && existe('data/nfse/versoes.json')) {
  require(dir('assets/js/nfse/base.js'));
  require(dir('assets/js/nfse/motor.js'));
  global.NFSe.Base.carregaDe(
    leJSON('data/nfse/versoes.json'), leJSON('data/nfse/tabelas.json'),
    leJSON('data/nfse/comparativo.json'), leJSON('data/nfse/fontes.json'),
    existe('data/nfse/municipios.json')
      ? leJSON('data/nfse/municipios.json') : null);
  disponiveis.nfse = global.NFSe;
}

const esperado = leJSON('exemplos/esperado.json');
const opcoes = { ordem: 'aviso', mapeamento: true, tolerancia: 0.001 };

let falhas = 0;
let conferidos = 0;
let pulados = 0;

function falha(arquivo, msg) {
  console.log('  FALHOU  %s', arquivo);
  console.log('          %s', msg);
  falhas++;
}

console.log('validadores nesta build: %s',
  Object.keys(disponiveis).join(', ') || 'nenhum');
console.log('');

// --------------------------------------------------------------------
// Os arquivos que o roteador pede existem nesta build?
//
// Esta checagem nasceu de uma falha em producao. O roteador listava
// mapeamento-sap.js entre os scripts obrigatorios, e a versao publica o
// remove por classificacao: o site quebrava ao carregar qualquer documento,
// com "nao foi possivel carregar". O teste nao viu nada, porque roda no Node
// e nunca tocou no caminho de carregamento do navegador.
//
// Conferir a lista declarada contra o que existe em disco fecha esse buraco
// sem precisar de navegador no fluxo de publicacao.
// --------------------------------------------------------------------
require(dir('assets/js/roteador.js'));
const TIPOS = (global.Roteador || { TIPOS: {} }).TIPOS;

console.log('scripts declarados pelo roteador:');
Object.keys(TIPOS).forEach((chave) => {
  const t = TIPOS[chave];
  if (!disponiveis[chave]) {
    console.log('  %s: validador ausente nesta build, não verificado', chave);
    return;
  }
  (t.scripts || []).forEach((p) => {
    if (!existe(p)) {
      falha(p, 'declarado obrigatório para ' + t.rotulo + ' e ausente nesta '
        + 'build — o site quebraria ao carregar um documento desse tipo');
    }
  });
  const semOpcional = (t.opcionais || []).filter((p) => !existe(p));
  console.log('  %s: %d obrigatório(s) presente(s), %d opcional(is) ausente(s)%s',
    chave, (t.scripts || []).filter(existe).length, semOpcional.length,
    existe(t.embutida) ? '' : ', sem base embutida');
});
console.log('');

for (const arquivo of Object.keys(esperado)) {
  if (arquivo.startsWith('_')) continue;
  const exp = esperado[arquivo];
  const caminho = dir(path.join('exemplos', arquivo));

  // a checagem do validador vem antes da do arquivo: a versao publica nao
  // leva os exemplos de NFS-e, e cobrar a existencia deles ali seria falha
  // inventada
  const ns = disponiveis[exp.tipo];
  if (!ns) {
    console.log('  pulado  %s (validador de %s ausente nesta build)',
      arquivo, exp.tipo);
    pulados++;
    continue;
  }
  if (!fs.existsSync(caminho)) {
    falha(arquivo, 'arquivo de exemplo não existe');
    continue;
  }

  const r = ns.Motor.valida(fs.readFileSync(caminho, 'utf8'), arquivo, opcoes);
  const titulos = r.achados.map((a) => a.titulo);
  const regras = r.achados.filter((a) => a.regra).map((a) => a.regra.codigo);
  let ok = true;

  if (exp.erros !== undefined && r.totais.erros !== exp.erros) {
    falha(arquivo, 'esperava ' + exp.erros + ' erro(s), obteve '
      + r.totais.erros + ' — ' + (r.totais.erros > exp.erros
        ? 'possível falso positivo' : 'o motor deixou de apontar algo'));
    r.achados.filter((a) => a.nivel === 'erro').forEach((a) => {
      console.log('            · [%s] %s — %s', a.grupo, a.titulo, a.alvo);
    });
    ok = false;
  }
  if (exp.avisos !== undefined && r.totais.avisos !== exp.avisos) {
    falha(arquivo, 'esperava ' + exp.avisos + ' advertência(s), obteve '
      + r.totais.avisos);
    ok = false;
  }
  if (exp.erros_minimo !== undefined && r.totais.erros < exp.erros_minimo) {
    falha(arquivo, 'esperava ao menos ' + exp.erros_minimo
      + ' erro(s), obteve ' + r.totais.erros);
    ok = false;
  }
  (exp.exige_regra || []).forEach((codigo) => {
    if (regras.indexOf(codigo) === -1) {
      falha(arquivo, 'o motor não citou a regra ' + codigo);
      ok = false;
    }
  });
  (exp.exige_titulo || []).forEach((trecho) => {
    if (!titulos.some((t) => t.indexOf(trecho) !== -1)) {
      falha(arquivo, 'o motor não apontou: ' + trecho);
      ok = false;
    }
  });

  conferidos++;
  if (ok) {
    console.log('  ok      ' + arquivo.padEnd(42) + r.totais.erros
      + ' erro(s), ' + r.totais.avisos + ' advertência(s)');
  }
}

console.log('');
console.log('%d conferido(s), %d pulado(s), %d falha(s)',
  conferidos, pulados, falhas);

if (falhas) {
  console.log('\nA publicação não deve seguir: o motor mudou de comportamento.');
  console.log('Se a mudança for proposital, atualize exemplos/esperado.json.');
  process.exit(1);
}
console.log('\nMotor íntegro nas duas direções: não inventa apontamento em '
  + 'documento válido e não deixa passar defeito conhecido.');
