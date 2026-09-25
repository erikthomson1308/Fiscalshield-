/* Roteador de documentos fiscais.
 *
 * Decide, pelo XML, qual validador atende - e carrega apenas a base daquele
 * tipo. As duas bases somadas passam de tres megabytes; carregar as duas em
 * toda visita cobraria de quem so precisa de uma.
 *
 * O reconhecimento e pelo elemento raiz e pelos grupos presentes, nao pelo
 * nome do arquivo: arquivo renomeado e comum, e o conteudo nao mente.
 */
(function (raiz) {
  'use strict';

  var TIPOS = {
    nfe: {
      chave: 'nfe',
      rotulo: 'NF-e / NFC-e',
      descricao: 'Nota Fiscal Eletrônica e Nota Fiscal de Consumidor',
      marcas: ['infNFe', 'nfeProc', 'NFe'],
      dados: 'data/nfe/',
      scripts: ['assets/js/nfe/base.js', 'assets/js/nfe/tributos.js',
        'assets/js/nfe/motor.js', 'assets/js/nfe/relatorio.js'],
      // Modulos que podem nao existir na build. O de mapeamento SAP sai da
      // versao publica por classificacao, e a tela dele some sozinha quando
      // os dados faltam - entao a ausencia do arquivo nao pode derrubar o
      // carregamento inteiro.
      opcionais: ['assets/js/nfe/mapeamento-sap.js'],
      embutida: 'data/nfe/base-embutida.js',
      espaco: 'NFe'
    },
    nfse: {
      chave: 'nfse',
      rotulo: 'NFS-e nacional',
      descricao: 'Declaração de Prestação de Serviços e NFS-e de padrão nacional',
      marcas: ['infDPS', 'infNFSe', 'DPS', 'NFSe'],
      dados: 'data/nfse/',
      scripts: ['assets/js/nfse/base.js', 'assets/js/nfse/motor.js',
        'assets/js/nfse/relatorio.js'],
      opcionais: [],
      embutida: 'data/nfse/base-embutida.js',
      espaco: 'NFSe'
    }
  };

  var carregados = Object.create(null);

  /** Tipos que esta instalacao oferece. A versao publica traz so a NF-e. */
  function ativos() {
    var lista = raiz.TIPOS_ATIVOS || Object.keys(TIPOS);
    return lista.filter(function (t) { return !!TIPOS[t]; });
  }
  function ativo(chave) { return ativos().indexOf(chave) !== -1; }

  /** Identifica o tipo pelo conteudo. Devolve a chave ou null. */
  function identifica(texto) {
    var amostra = texto.slice(0, 4000);
    // infDPS e infNFSe sao inequivocos; infNFe idem. A ordem importa porque
    // uma NFS-e completa contem a DPS dentro dela.
    if (/<(\w+:)?infDPS[\s>]/.test(amostra) || /<(\w+:)?infNFSe[\s>]/.test(amostra)) {
      return 'nfse';
    }
    if (/<(\w+:)?infNFe[\s>]/.test(amostra)) return 'nfe';
    if (/<(\w+:)?DPS[\s>]/.test(amostra) || /<(\w+:)?NFSe[\s>]/.test(amostra)) {
      return 'nfse';
    }
    if (/<(\w+:)?(nfeProc|NFe)[\s>]/.test(amostra)) return 'nfe';
    return null;
  }

  function carregaScript(url) {
    return new Promise(function (ok, erro) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { ok(url); };
      s.onerror = function () {
        erro(new Error('Não foi possível carregar ' + url));
      };
      document.head.appendChild(s);
    });
  }

  function emSequencia(urls) {
    return urls.reduce(function (p, u) {
      return p.then(function () { return carregaScript(u); });
    }, Promise.resolve());
  }

  /** Carrega o que puder, sem derrubar o conjunto se um arquivo faltar. */
  function opcionalmente(urls) {
    return urls.reduce(function (p, u) {
      return p.then(function () {
        return carregaScript(u).catch(function () { return null; });
      });
    }, Promise.resolve());
  }

  /** Carrega o validador do tipo pedido, uma unica vez. */
  function prepara(chave) {
    var t = TIPOS[chave];
    if (!t) return Promise.reject(new Error('Tipo desconhecido: ' + chave));
    if (!ativo(chave)) {
      return Promise.reject(new Error(
        'Esta versão do site valida apenas '
        + ativos().map(function (k) { return TIPOS[k].rotulo; }).join(' e ')
        + '. O documento enviado é ' + t.rotulo + '.'));
    }
    if (carregados[chave]) return carregados[chave];

    // A base embutida só existe no pacote offline; sem ela, os scripts
    // buscam os .json, o que exige o site servido por HTTP. Por isso a
    // tentativa com ela vem primeiro e a falha não é erro.
    carregados[chave] = carregaScript(t.embutida)
      .catch(function () { return null; })
      .then(function () { return opcionalmente(t.opcionais || []); })
      .then(function () { return emSequencia(t.scripts); })
      .then(function () {
        var ns = raiz[t.espaco];
        if (!ns || !ns.Base) {
          throw new Error('O validador de ' + t.rotulo + ' não inicializou.');
        }
        return ns.Base.carrega(t.dados).then(function () { return ns; });
      });

    return carregados[chave];
  }

  raiz.Roteador = {
    TIPOS: TIPOS,
    ativos: ativos,
    ativo: ativo,
    identifica: identifica,
    prepara: prepara,
    carregado: function (chave) { return !!carregados[chave]; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
