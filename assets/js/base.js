/* Base de dados: carga e indexacao.
 *
 * Os JSON de data/ sao gerados por tools/build_db.py a partir dos documentos
 * oficiais. Este modulo apenas carrega e indexa - nenhuma regra e escrita
 * aqui, para que a base continue sendo a unica fonte da verdade.
 */
(function (raiz) {
  'use strict';

  var base = {
    pronta: false,
    campos: [],
    porCaminho: Object.create(null),
    filhosDe: Object.create(null),
    porId: Object.create(null),
    regras: [],
    porRegra: Object.create(null),
    porCampoId: Object.create(null),
    dfe: [],
    dfePorTag: Object.create(null),
    fontes: null,
    ajustes: null
  };

  function indexa() {
    base.campos.forEach(function (c) {
      base.porCaminho[c.caminho] = c;
      (base.porId[c.id] || (base.porId[c.id] = [])).push(c);
      var corte = c.caminho.lastIndexOf('/');
      var pai = corte === -1 ? '' : c.caminho.slice(0, corte);
      (base.filhosDe[pai] || (base.filhosDe[pai] = [])).push(c);
    });

    // ordem declarada no leiaute: e o que permite conferir a ordem dos
    // elementos no XML, que o schema da NF-e exige. A chave e o numero de
    // sequencia do documento oficial, nao a ordem alfabetica do caminho.
    Object.keys(base.filhosDe).forEach(function (pai) {
      base.filhosDe[pai].sort(function (a, b) {
        return (a.ordem || 0) - (b.ordem || 0);
      });
      base.filhosDe[pai].forEach(function (c, n) { c.posicao = n; });
    });

    base.regras.forEach(function (r) {
      base.porRegra[r.codigo] = r;
      (base.porCampoId[r.campo_id] || (base.porCampoId[r.campo_id] = [])).push(r);
    });

    base.dfe.forEach(function (c) {
      if (!base.dfePorTag[c.tag]) base.dfePorTag[c.tag] = c;
    });
  }

  function pegaJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('Não foi possível carregar ' + url + ' (HTTP ' + r.status + ')');
      return r.json();
    });
  }

  /** Carrega a base. Devolve uma Promise que resolve com o proprio objeto.
   *
   * Duas origens possiveis, nessa ordem:
   *
   * 1. `data/base-embutida.js`, se tiver sido carregado pelo index.html. E o
   *    que permite abrir o site com duplo clique no arquivo, sem servidor -
   *    sob file:// o navegador recusa o fetch dos JSON, mas executa <script>
   *    normalmente.
   * 2. Os arquivos .json, quando o site esta servido por HTTP.
   *
   * O resultado e o mesmo: os dois vem do mesmo gerador.
   */
  function carrega(prefixo) {
    prefixo = prefixo || 'data/';

    var embutida = raiz.__BASE_EMBUTIDA__;
    if (embutida && embutida.layout) {
      base.origemDaCarga = 'embutida';
      return Promise.resolve(aplica(embutida.layout, embutida.regras,
        embutida.dfe, embutida.fontes, embutida.ajustes));
    }

    base.origemDaCarga = 'json';
    return Promise.all([
      pegaJSON(prefixo + 'layout.json'),
      pegaJSON(prefixo + 'regras.json'),
      pegaJSON(prefixo + 'layout-dfe.json'),
      pegaJSON(prefixo + 'fontes.json'),
      pegaJSON(prefixo + 'ajustes.json').catch(function () { return null; })
    ]).then(function (r) {
      return aplica(r[0], r[1], r[2], r[3], r[4]);
    });
  }

  function aplica(layout, regras, dfe, fontes, ajustes) {
    base.campos = layout.campos;
    base.geradoEm = layout.gerado_em;
    base.regras = (regras && regras.regras) || [];
    base.dfe = (dfe && dfe.campos) || [];
    base.fontes = fontes || null;
    base.ajustes = ajustes || null;
    indexa();
    base.pronta = true;
    return base;
  }

  /** Carga sincrona a partir de objetos ja lidos - usada nos testes em Node. */
  function carregaDe(layout, regras, dfe, fontes) {
    base.campos = layout.campos;
    base.geradoEm = layout.gerado_em;
    base.regras = (regras && regras.regras) || [];
    base.dfe = (dfe && dfe.campos) || [];
    base.fontes = fontes || null;
    indexa();
    base.pronta = true;
    return base;
  }

  /** Definicao oficial de um caminho XML, ou null. */
  function campo(caminho) { return base.porCaminho[caminho] || null; }

  /** Filhos previstos para um caminho, na ordem do leiaute. */
  function previstos(caminho) { return base.filhosDe[caminho] || []; }

  /** Regras oficiais associadas ao ID de um campo. */
  function regrasDe(id) { return base.porCampoId[id] || []; }

  /** Regra oficial pelo codigo completo (ex.: 'W16-10'). */
  function regra(codigo) { return base.porRegra[codigo] || null; }

  /** Todos os caminhos XML que correspondem a um ID do leiaute. */
  function caminhosDe(id) {
    return (base.porId[id] || []).map(function (c) { return c.caminho; });
  }

  /** Interpreta 'Ocor.' do leiaute: '1-1', '0-990', '1-N'. */
  function ocorrencia(txt) {
    var m = /^(\d+)\s*-\s*(\d+|N)$/i.exec(txt || '');
    if (!m) return { min: 0, max: Infinity, bruto: txt || '' };
    return {
      min: parseInt(m[1], 10),
      max: /^n$/i.test(m[2]) ? Infinity : parseInt(m[2], 10),
      bruto: txt
    };
  }

  /** Interpreta 'Tam.' do leiaute: '2', '1-60', '13v2', '12v0-4', '0 ou 14'. */
  function tamanho(txt) {
    txt = (txt || '').trim();
    if (!txt) return null;

    var mLista = /^\d+(?:\s*,\s*\d+)+$/.exec(txt);
    if (mLista) {
      return {
        tipo: 'exatos',
        exatos: txt.split(',').map(function (x) { return parseInt(x, 10); }),
        bruto: txt
      };
    }
    var mOu = /^(\d+)\s*ou\s*(\d+)$/i.exec(txt);
    if (mOu) {
      return { tipo: 'exatos', exatos: [+mOu[1], +mOu[2]], bruto: txt };
    }
    var mDec = /^(\d+)(?:-(\d+))?v(\d+)(?:-(\d+))?$/i.exec(txt);
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
    var mFaixa = /^(\d+)-(\d+)$/.exec(txt);
    if (mFaixa) return { tipo: 'faixa', min: +mFaixa[1], max: +mFaixa[2], bruto: txt };

    var mFixo = /^(\d+)$/.exec(txt);
    if (mFixo) return { tipo: 'fixo', n: +mFixo[1], bruto: txt };

    return null;
  }

  /** O leiaute admite conteudo vazio neste campo? */
  function aceitaVazio(def) {
    if (!def) return false;
    if (/aceita\s+valor\s+nulo/i.test((def.obs || '') + ' ' + (def.desc || ''))) {
      return true;
    }
    var t = tamanho(def.tam);
    if (t && t.tipo === 'exatos' && t.exatos.indexOf(0) !== -1) return true;
    if (t && t.tipo === 'faixa' && t.min === 0) return true;
    return false;
  }

  raiz.Base = {
    dados: base,
    carrega: carrega,
    carregaDe: carregaDe,
    campo: campo,
    aceitaVazio: aceitaVazio,
    previstos: previstos,
    regrasDe: regrasDe,
    regra: regra,
    caminhosDe: caminhosDe,
    ocorrencia: ocorrencia,
    tamanho: tamanho
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.Base;
})(typeof globalThis !== 'undefined' ? globalThis : this);
