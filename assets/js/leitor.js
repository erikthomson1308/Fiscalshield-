/* Leitor de XML.
 *
 * Um analisador proprio, em vez do DOMParser do navegador, por tres motivos
 * praticos: entrega a linha e a coluna de cada elemento (o que torna cada
 * apontamento localizavel no arquivo), preserva a ordem de irmaos (que o
 * leiaute da NF-e exige) e roda igual no navegador e no Node, o que permite
 * testar o motor sem abrir o site.
 */
(function (raiz) {
  'use strict';

  var ENTIDADES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"
  };

  function decodifica(s) {
    if (s.indexOf('&') === -1) return s;
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (todo, corpo) {
      if (corpo.charAt(0) === '#') {
        var n = corpo.charAt(1) === 'x' || corpo.charAt(1) === 'X'
          ? parseInt(corpo.slice(2), 16)
          : parseInt(corpo.slice(1), 10);
        return isNaN(n) ? todo : String.fromCodePoint(n);
      }
      return Object.prototype.hasOwnProperty.call(ENTIDADES, corpo)
        ? ENTIDADES[corpo] : todo;
    });
  }

  function semPrefixo(nome) {
    var p = nome.indexOf(':');
    return p === -1 ? nome : nome.slice(p + 1);
  }

  function lerAtributos(bruto) {
    var atr = {};
    var re = /([A-Za-z_:][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    var m;
    while ((m = re.exec(bruto)) !== null) {
      atr[m[1]] = decodifica(m[3] !== undefined ? m[3] : m[4]);
    }
    return atr;
  }

  function novoNo(nome, linha, coluna, pai) {
    return {
      nome: semPrefixo(nome),
      nomeBruto: nome,
      atributos: {},
      filhos: [],
      texto: '',
      linha: linha,
      coluna: coluna,
      pai: pai || null,
      caminho: '',
      indice: 0
    };
  }

  /**
   * @param {string} texto conteudo do arquivo XML
   * @returns {{ok:boolean, erro:string, raiz:object, versaoXml:string,
   *            encoding:string, nos:number}}
   */
  function lerXML(texto) {
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);

    var i = 0, linha = 1, inicioLinha = 0;
    var pilha = [], raizNo = null, total = 0;
    var versaoXml = '', encoding = '';

    function avanca(ate) {
      for (var k = i; k < ate; k++) {
        if (texto.charCodeAt(k) === 10) { linha++; inicioLinha = k + 1; }
      }
      i = ate;
    }
    function coluna() { return i - inicioLinha + 1; }
    function falha(msg) {
      return { ok: false, erro: msg + ' (linha ' + linha + ')', raiz: null };
    }

    while (i < texto.length) {
      var abre = texto.indexOf('<', i);

      if (abre === -1) break;

      if (abre > i) {                                   // texto entre tags
        var bruto = texto.slice(i, abre);
        if (pilha.length) pilha[pilha.length - 1].texto += bruto;
        avanca(abre);
      }

      // ---- declaracao / instrucao de processamento
      if (texto.startsWith('<?', i)) {
        var fimPi = texto.indexOf('?>', i);
        if (fimPi === -1) return falha('Instrução de processamento não fechada');
        var pi = texto.slice(i, fimPi);
        var mv = /version\s*=\s*["']([^"']+)["']/.exec(pi);
        var me = /encoding\s*=\s*["']([^"']+)["']/.exec(pi);
        if (mv) versaoXml = mv[1];
        if (me) encoding = me[1];
        avanca(fimPi + 2);
        continue;
      }

      // ---- comentario
      if (texto.startsWith('<!--', i)) {
        var fimC = texto.indexOf('-->', i);
        if (fimC === -1) return falha('Comentário não fechado');
        avanca(fimC + 3);
        continue;
      }

      // ---- CDATA
      if (texto.startsWith('<![CDATA[', i)) {
        var fimD = texto.indexOf(']]>', i);
        if (fimD === -1) return falha('Seção CDATA não fechada');
        if (pilha.length) {
          pilha[pilha.length - 1].texto += texto.slice(i + 9, fimD);
        }
        avanca(fimD + 3);
        continue;
      }

      // ---- DOCTYPE e demais declaracoes
      if (texto.startsWith('<!', i)) {
        var fimB = texto.indexOf('>', i);
        if (fimB === -1) return falha('Declaração não fechada');
        avanca(fimB + 1);
        continue;
      }

      // ---- fechamento
      if (texto.startsWith('</', i)) {
        var fimF = texto.indexOf('>', i);
        if (fimF === -1) return falha('Tag de fechamento não fechada');
        var nomeF = semPrefixo(texto.slice(i + 2, fimF).trim());
        var atual = pilha[pilha.length - 1];
        if (!atual) return falha('Fechamento &lt;/' + nomeF + '&gt; sem abertura');
        if (atual.nome !== nomeF) {
          return falha('Fechamento &lt;/' + nomeF + '&gt; não corresponde a &lt;'
            + atual.nome + '&gt; aberto na linha ' + atual.linha);
        }
        pilha.pop();
        avanca(fimF + 1);
        continue;
      }

      // ---- abertura
      var fimA = -1, aspas = 0;
      for (var k = i + 1; k < texto.length; k++) {
        var c = texto.charAt(k);
        if (c === '"' || c === "'") {
          if (aspas === 0) aspas = c.charCodeAt(0);
          else if (aspas === c.charCodeAt(0)) aspas = 0;
        } else if (c === '>' && aspas === 0) { fimA = k; break; }
      }
      if (fimA === -1) return falha('Tag de abertura não fechada');

      var interno = texto.slice(i + 1, fimA);
      var vazia = interno.endsWith('/');
      if (vazia) interno = interno.slice(0, -1);

      var mNome = /^([A-Za-z_:][\w.:-]*)/.exec(interno);
      if (!mNome) return falha('Nome de elemento inválido');

      var no = novoNo(mNome[1], linha, coluna(), pilha[pilha.length - 1] || null);
      var restoAtr = interno.slice(mNome[1].length);
      if (restoAtr.trim()) no.atributos = lerAtributos(restoAtr);

      if (no.pai) {
        no.indice = no.pai.filhos.length;
        no.pai.filhos.push(no);
        no.caminho = no.pai.caminho + '/' + no.nome;
      } else {
        if (raizNo) return falha('Mais de um elemento raiz no arquivo');
        no.caminho = no.nome;
        raizNo = no;
      }
      total++;

      if (!vazia) pilha.push(no);
      avanca(fimA + 1);
    }

    if (pilha.length) {
      var aberto = pilha[pilha.length - 1];
      return { ok: false, raiz: null,
        erro: 'Elemento &lt;' + aberto.nome + '&gt; aberto na linha '
          + aberto.linha + ' nunca foi fechado' };
    }
    if (!raizNo) return { ok: false, raiz: null, erro: 'Arquivo sem elemento raiz' };

    (function normaliza(n) {
      n.texto = decodifica(n.texto).trim();
      n.filhos.forEach(normaliza);
    })(raizNo);

    return { ok: true, erro: '', raiz: raizNo, versaoXml: versaoXml,
      encoding: encoding, nos: total };
  }

  /** Percorre a arvore chamando visita(no) em profundidade, na ordem do arquivo. */
  function percorre(no, visita) {
    visita(no);
    for (var k = 0; k < no.filhos.length; k++) percorre(no.filhos[k], visita);
  }

  /** Primeiro descendente (ou o proprio no) com o nome dado. */
  function acha(no, nome) {
    if (!no) return null;
    if (no.nome === nome) return no;
    for (var k = 0; k < no.filhos.length; k++) {
      var r = acha(no.filhos[k], nome);
      if (r) return r;
    }
    return null;
  }

  /** Filhos diretos com o nome dado. */
  function filhos(no, nome) {
    if (!no) return [];
    return no.filhos.filter(function (f) { return f.nome === nome; });
  }

  /** Filho direto unico; devolve o no ou null. */
  function filho(no, nome) {
    var l = filhos(no, nome);
    return l.length ? l[0] : null;
  }

  /** Texto de um filho direto, ou '' se nao existir. */
  function valor(no, nome) {
    var f = filho(no, nome);
    return f ? f.texto : '';
  }

  raiz.Leitor = { lerXML: lerXML, percorre: percorre, acha: acha,
    filhos: filhos, filho: filho, valor: valor };

  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.Leitor;
})(typeof globalThis !== 'undefined' ? globalThis : this);
