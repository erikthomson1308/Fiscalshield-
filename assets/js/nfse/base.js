/* Base de dados da NFS-e nacional: carga e indexacao.
 *
 * Tres versoes do leiaute convivem, e a mais nova nao e a que vale. A base
 * carrega as tres, mas so a marcada como vigente e usada para validar - as
 * outras servem ao comparativo. Validar contra a NT 009 acusaria erro em
 * nota correta.
 */
(function (raiz) {
  'use strict';

  raiz.NFSe = raiz.NFSe || {};

  var base = {
    pronta: false,
    vigente: null,          // chave da versao em Producao
    versoes: {},            // todas, para o comparativo
    campos: [],             // leiaute da versao vigente
    porCaminho: Object.create(null),
    filhosDe: Object.create(null),
    regras: [],
    porRegra: Object.create(null),
    porCaminhoRegra: Object.create(null),
    tabelas: {},
    municipios: null,
    parCstClasse: Object.create(null),
    comparativos: {},
    fontes: null
  };

  function indexa() {
    var v = base.versoes[base.vigente];
    base.campos = v.leiaute;
    base.regras = v.regras;

    base.campos.forEach(function (c, n) {
      base.porCaminho[c.caminho] = c;
      c.posicao = n;
      var corte = c.caminho.lastIndexOf('/');
      var pai = corte === -1 ? '' : c.caminho.slice(0, corte);
      (base.filhosDe[pai] || (base.filhosDe[pai] = [])).push(c);
    });

    base.regras.forEach(function (r) {
      if (r.codigo) base.porRegra[r.codigo] = r;
      if (r.caminho) {
        (base.porCaminhoRegra[r.caminho]
          || (base.porCaminhoRegra[r.caminho] = [])).push(r);
      }
    });

    var assoc = (base.tabelas.associacao_cst_cclasstrib || {}).itens || [];
    assoc.forEach(function (p) {
      base.parCstClasse[p.cst + '|' + p.cclasstrib] = p;
    });
  }

  function pegaJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('Não foi possível carregar ' + url
        + ' (HTTP ' + r.status + ')');
      return r.json();
    });
  }

  function aplica(versoes, tabelas, comparativo, fontes, municipios) {
    base.vigente = versoes.vigente;
    base.versoes = versoes.versoes;
    base.geradoEm = versoes.gerado_em;
    base.tabelas = (tabelas && tabelas.tabelas) || {};
    base.comparativos = (comparativo && comparativo.comparativos) || {};
    base.fontes = fontes || null;
    base.municipios = municipios || null;
    indexa();
    base.pronta = true;
    return base;
  }

  function carrega(prefixo) {
    prefixo = prefixo || 'data/';

    var embutida = raiz.__BASE_NFSE__;
    // a tabela de municipios vem em script proprio, gerado por
    // build_municipios.py; sob file:// e o unico jeito de ela chegar
    var municipiosEmbutidos = raiz.__MUNICIPIOS_NFSE__ || null;
    if (embutida && embutida.versoes) {
      base.origemDaCarga = 'embutida';
      return Promise.resolve(aplica(embutida.versoes, embutida.tabelas,
        embutida.comparativo, embutida.fontes,
        embutida.municipios || municipiosEmbutidos));
    }

    base.origemDaCarga = 'json';
    return Promise.all([
      pegaJSON(prefixo + 'versoes.json'),
      pegaJSON(prefixo + 'tabelas.json'),
      pegaJSON(prefixo + 'comparativo.json'),
      pegaJSON(prefixo + 'fontes.json'),
      pegaJSON(prefixo + 'municipios.json').catch(function () {
        return municipiosEmbutidos;
      })
    ]).then(function (r) { return aplica(r[0], r[1], r[2], r[3], r[4]); });
  }

  function carregaDe(versoes, tabelas, comparativo, fontes, municipios) {
    return aplica(versoes, tabelas, comparativo, fontes, municipios);
  }

  /* Situacao do municipio emissor na adesao ao padrao nacional.
     E a primeira pergunta de qualquer erro de NFS-e: se o municipio nao e
     aderente ao Emissor Nacional, o documento nao deveria ser uma DPS, e
     olhar o conteudo leva ao diagnostico errado. */
  function municipio(codigo) {
    if (!base.municipios || !codigo) return null;
    return base.municipios.municipios[String(codigo)] || null;
  }

  function fonteMunicipios() {
    return base.municipios ? base.municipios.fonte : null;
  }

  function resumoMunicipios() {
    return base.municipios ? base.municipios.resumo : null;
  }

  function campo(caminho) { return base.porCaminho[caminho] || null; }
  function previstos(caminho) { return base.filhosDe[caminho] || []; }
  function regra(codigo) { return base.porRegra[codigo] || null; }
  function regrasDe(caminho) { return base.porCaminhoRegra[caminho] || []; }

  /** O par CST + cClassTrib consta na tabela oficial de associacao? */
  function parValido(cst, classe) {
    if (!cst || !classe) return null;
    return base.parCstClasse[cst + '|' + classe] || null;
  }

  function tabela(nome) {
    return (base.tabelas[nome] || {}).itens || [];
  }

  /** Interpreta 'Ocor.': '1-1', '0-1', '1-N'. */
  function ocorrencia(txt) {
    var m = /^(\d+)\s*-\s*(\d+|N)$/i.exec((txt || '').trim());
    if (!m) return { min: 0, max: Infinity, bruto: txt || '' };
    return {
      min: parseInt(m[1], 10),
      max: /^n$/i.test(m[2]) ? Infinity : parseInt(m[2], 10),
      bruto: txt
    };
  }

  /** Interpreta 'Tam.': '13', '1-15', '1-4V2', '15V2'. O separador de
   *  decimais nos anexos da NFS-e e V maiusculo. */
  function tamanho(txt) {
    txt = (txt || '').trim();
    if (!txt) return null;

    var mDec = /^(\d+)(?:-(\d+))?V(\d+)(?:-(\d+))?$/i.exec(txt);
    if (mDec) {
      return {
        tipo: 'decimal',
        intMin: mDec[2] ? +mDec[1] : 1,
        intMax: mDec[2] ? +mDec[2] : +mDec[1],
        decMin: mDec[4] ? +mDec[3] : 0,
        decMax: mDec[4] ? +mDec[4] : +mDec[3],
        bruto: txt
      };
    }
    var mFaixa = /^(\d+)\s*-\s*(\d+)$/.exec(txt);
    if (mFaixa) return { tipo: 'faixa', min: +mFaixa[1], max: +mFaixa[2], bruto: txt };

    var mFixo = /^(\d+)$/.exec(txt);
    if (mFixo) return { tipo: 'fixo', n: +mFixo[1], bruto: txt };

    return null;
  }

  raiz.NFSe.Base = {
    dados: base, carrega: carrega, carregaDe: carregaDe,
    campo: campo, previstos: previstos, regra: regra, regrasDe: regrasDe,
    parValido: parValido, tabela: tabela,
    municipio: municipio, fonteMunicipios: fonteMunicipios,
    resumoMunicipios: resumoMunicipios,
    ocorrencia: ocorrencia, tamanho: tamanho
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.NFSe.Base;
})(typeof globalThis !== 'undefined' ? globalThis : this);
