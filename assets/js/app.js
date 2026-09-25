/* Interface unica para os dois validadores.
 *
 * O usuario larga o XML e a ferramenta descobre o que e. Cada tipo tem suas
 * telas - a NF-e reconcilia totalizadores, a NFS-e compara versoes de
 * leiaute - entao as abas sao montadas conforme o documento, em vez de
 * mostrar aba vazia para o que nao se aplica.
 */
(function () {
  'use strict';

  var Roteador = window.Roteador;

  var ABAS = {
    nfe: [
      ['resumo', 'Resumo'], ['achados', 'Achados'], ['campos', 'Campos'],
      ['tributos', 'Tributos'], ['reforma', 'Reforma (IBS/CBS/IS)'],
      ['base', 'Base de dados']
    ],
    nfse: [
      ['resumo', 'Resumo'], ['achados', 'Achados'], ['campos', 'Campos'],
      ['reforma', 'IBS / CBS'], ['comparativo', 'Comparativo de versões'],
      ['base', 'Base de dados']
    ]
  };

  var resultados = [];
  var lidos = [];
  var atual = 0;
  var abaAtiva = 'resumo';
  var filtroBase = '';
  var parComparativo = 'nt004_nt007';

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function selo(html, cor) {
    $('selo-base').innerHTML = '<span class="pulso"'
      + (cor ? ' style="background:' + cor + '"' : '') + '></span> ' + html;
  }

  // O selo sai dos tipos que esta build oferece, nunca de texto fixo: a
  // versao publica nao valida NFS-e e nao pode anunciar que valida.
  selo('pronto · ' + Roteador.ativos().map(function (t) {
    return Roteador.TIPOS[t].rotulo;
  }).join(' e '));

  // ------------------------------------------------------------------
  // exemplos prontos, para quem chega sem um XML a mao.
  // Vem embutidos como script porque buscar arquivo com fetch nao funciona
  // com o site aberto direto do disco, que e como a copia distribuida roda.
  // ------------------------------------------------------------------
  (function montaExemplos() {
    var cat = window.__EXEMPLOS__;
    if (!cat) return;
    var nomes = Object.keys(cat).filter(function (n) {
      return Roteador.ativo(cat[n].tipo);
    });
    if (!nomes.length) return;

    $('exemplos-lista').innerHTML = nomes.map(function (n) {
      var e = cat[n];
      var comDefeito = n.indexOf('defeito') !== -1;
      return '<button class="exemplo' + (comDefeito ? ' defeituoso' : '')
        + '" data-nome="' + esc(n) + '">'
        + '<b>' + esc(e.rotulo) + '</b>'
        + '<em>' + esc(e.nota) + '</em>'
        + '<span class="tag' + (comDefeito ? ' erro' : '') + '">'
        + esc(Roteador.TIPOS[e.tipo].rotulo) + '</span></button>';
    }).join('');

    Array.prototype.forEach.call(
      $('exemplos-lista').querySelectorAll('.exemplo'), function (b) {
        b.addEventListener('click', function () {
          var nome = b.dataset.nome;
          lidos = [{ nome: nome, texto: cat[nome].xml }];
          atual = 0;
          selo('validando o exemplo…');
          valida().then(function () {
            $('painel-inicial').hidden = true;
            $('painel-resultado').hidden = false;
            $('painel-resultado').scrollIntoView(
              { behavior: 'smooth', block: 'start' });
          }).catch(function (e) {
            selo('falha', '#DC0A0A');
            alert(e.message);
          });
        });
      });

    $('exemplos').hidden = false;
  })();

  // ------------------------------------------------------------------
  var area = $('area-solta');
  var entrada = $('entrada-arquivos');

  area.addEventListener('click', function () { entrada.click(); });
  area.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); }
  });
  entrada.addEventListener('change', function () {
    if (entrada.files.length) processa(entrada.files);
    entrada.value = '';
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    area.addEventListener(ev, function (e) {
      e.preventDefault(); e.stopPropagation(); area.classList.add('sobre');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    area.addEventListener(ev, function (e) {
      e.preventDefault(); e.stopPropagation(); area.classList.remove('sobre');
    });
  });
  area.addEventListener('drop', function (e) {
    if (e.dataTransfer.files.length) processa(e.dataTransfer.files);
  });

  function le(f) {
    return new Promise(function (ok, erro) {
      var r = new FileReader();
      r.onload = function () { ok({ nome: f.name, texto: r.result }); };
      r.onerror = function () { erro(new Error('Não foi possível ler ' + f.name)); };
      r.readAsText(f, 'UTF-8');
    });
  }

  function opcoes() {
    return {
      ordem: $('opt-ordem').value,
      mapeamento: $('opt-mapeamento').checked,
      tolerancia: parseFloat($('opt-tolerancia').value)
    };
  }

  function processa(lista) {
    var arquivos = Array.prototype.slice.call(lista)
      .filter(function (f) { return /\.xml$/i.test(f.name); });
    if (!arquivos.length) { alert('Selecione arquivos XML.'); return; }

    selo('lendo os arquivos…');
    Promise.all(arquivos.map(le)).then(function (r) {
      lidos = r;
      return valida();
    }).then(function () {
      $('painel-inicial').hidden = true;
      $('painel-resultado').hidden = false;
      $('painel-resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (e) {
      selo('falha ao validar', '#DC0A0A');
      alert(e.message);
    });
  }

  function valida() {
    var op = opcoes();
    var tipos = {};
    lidos.forEach(function (a) {
      var t = Roteador.identifica(a.texto);
      if (t) tipos[t] = true;
    });

    var necessarios = Object.keys(tipos);
    if (!necessarios.length) {
      return Promise.reject(new Error(
        'Nenhum dos arquivos é uma NF-e, NFC-e, DPS ou NFS-e. A ferramenta '
        + 'reconhece o documento pelo conteúdo, não pelo nome do arquivo.'));
    }

    selo('carregando a base de ' + necessarios.map(function (t) {
      return Roteador.TIPOS[t].rotulo;
    }).join(' e ') + '…');

    return Promise.all(necessarios.map(Roteador.prepara)).then(function () {
      resultados = lidos.map(function (a) {
        var tipo = Roteador.identifica(a.texto);
        if (!tipo) return { tipo: null, arquivo: a.nome, ns: null, r: null };
        var ns = window[Roteador.TIPOS[tipo].espaco];
        return {
          tipo: tipo, arquivo: a.nome, ns: ns,
          r: ns.Motor.valida(a.texto, a.nome, op)
        };
      });
      if (atual >= resultados.length) atual = 0;
      atualizaSelo();
      barra();
      desenha();
    });
  }

  function atualizaSelo() {
    var partes = [];
    Object.keys(Roteador.TIPOS).forEach(function (t) {
      if (!Roteador.carregado(t)) return;
      var ns = window[Roteador.TIPOS[t].espaco];
      if (!ns || !ns.Base.dados.pronta) return;
      var d = ns.Base.dados;
      partes.push('<b>' + Roteador.TIPOS[t].rotulo + '</b> '
        + (d.campos ? d.campos.length : 0) + ' campos');
    });
    selo(partes.join(' · ') || 'pronto');
  }

  // ------------------------------------------------------------------
  function barra() {
    if (resultados.length < 2) { $('barra-arquivos').innerHTML = ''; return; }
    $('barra-arquivos').innerHTML = resultados.map(function (x, n) {
      var estado = !x.r ? 'alerta'
        : (x.r.totais.erros ? 'reprovado'
          : (x.r.totais.avisos ? 'alerta' : 'aprovado'));
      var marca = x.tipo ? Roteador.TIPOS[x.tipo].rotulo : 'não reconhecido';
      return '<button class="chip-arquivo' + (n === atual ? ' ativo' : '')
        + '" data-n="' + n + '"><span class="ponto ' + estado + '"></span>'
        + esc(x.arquivo) + ' <span class="tag">' + esc(marca)
        + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(
      $('barra-arquivos').querySelectorAll('.chip-arquivo'), function (b) {
        b.addEventListener('click', function () {
          atual = +b.dataset.n; abaAtiva = 'resumo'; barra(); desenha();
        });
      });
  }

  function desenha() {
    var x = resultados[atual];
    if (!x) return;

    if (!x.tipo) {
      $('placar').innerHTML = '';
      $('abas').innerHTML = '';
      $('painel-conteudo').innerHTML =
        '<div class="achado erro"><p class="achado-msg">'
        + esc(x.arquivo) + ' não foi reconhecido</p>'
        + '<p class="achado-detalhe">O arquivo não contém <code>infNFe</code>, '
        + '<code>infDPS</code> nem <code>infNFSe</code>. A ferramenta '
        + 'identifica o documento pelo conteúdo, não pelo nome do arquivo.'
        + '</p></div>';
      return;
    }

    $('placar').innerHTML = x.ns.Relatorio.placar(x.r);

    var abas = ABAS[x.tipo];
    if (!abas.some(function (a) { return a[0] === abaAtiva; })) abaAtiva = 'resumo';

    $('abas').innerHTML = abas.map(function (a) {
      return '<button class="aba' + (a[0] === abaAtiva ? ' ativa' : '')
        + '" data-aba="' + a[0] + '">' + esc(a[1]) + '</button>';
    }).join('');
    Array.prototype.forEach.call($('abas').querySelectorAll('.aba'), function (b) {
      b.addEventListener('click', function () {
        abaAtiva = b.dataset.aba; desenha();
      });
    });

    $('painel-conteudo').innerHTML = conteudo(x, abaAtiva);
    ligaInterativos(x);
  }

  function conteudo(x, aba) {
    var Rel = x.ns.Relatorio;
    switch (aba) {
      case 'resumo': return Rel.resumo(x.r);
      case 'achados': return Rel.achados(x.r);
      case 'campos': return Rel.campos(x.r);
      case 'tributos': return Rel.tributos(x.r);
      case 'reforma': return Rel.reforma(x.r);
      case 'comparativo': return Rel.comparativo(parComparativo);
      case 'base': return Rel.baseDeDados(filtroBase);
      default: return '';
    }
  }

  function ligaInterativos(x) {
    var busca = $('busca-base');
    if (busca) {
      busca.addEventListener('input', function () {
        var pos = busca.selectionStart;
        filtroBase = busca.value;
        clearTimeout(busca._t);
        busca._t = setTimeout(function () {
          $('painel-conteudo').innerHTML = conteudo(x, 'base');
          ligaInterativos(x);
          var novo = $('busca-base');
          if (novo) { novo.focus(); novo.setSelectionRange(pos, pos); }
        }, 220);
      });
    }
    var sel = $('sel-comparativo');
    if (sel) {
      sel.addEventListener('change', function () {
        parComparativo = sel.value;
        $('painel-conteudo').innerHTML = conteudo(x, 'comparativo');
        ligaInterativos(x);
      });
    }
  }

  // ------------------------------------------------------------------
  function baixa(nome, texto, tipo) {
    var blob = new Blob([texto], { type: tipo + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function carimbo() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function relatorioDe(grupo, tipo) {
    var Rel = grupo.ns.Relatorio;
    if (Rel.relatorioHTML) return Rel.relatorioHTML(grupo.itens);
    var corpo = grupo.itens.map(function (r) {
      return '<section class="cartao"><h2>' + esc(r.arquivo) + '</h2>'
        + Rel.resumo(r) + Rel.achados(r) + '</section>';
    }).join('');
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
      + '<title>Relatório — ' + esc(Roteador.TIPOS[tipo].rotulo) + '</title>'
      + '<style>body{font:14px/1.5 "Clario",Arial,sans-serif;color:#212223;'
      + 'background:#F9F7F5;margin:0}main{max-width:1050px;margin:0 auto;'
      + 'padding:24px}.cab{background:#011B35;color:#fff;padding:20px 26px;'
      + 'border-bottom:4px solid #D64000}.cartao{background:#fff;'
      + 'border:1px solid #E5E5E5;padding:20px;margin-bottom:16px}'
      + 'table{border-collapse:collapse;width:100%;font-size:12.5px}'
      + 'th,td{padding:6px 10px;border-bottom:1px solid #E5E5E5;text-align:left;'
      + 'vertical-align:top}th{background:#011B35;color:#fff;font-size:11px;'
      + 'text-transform:uppercase}.achado{border:1px solid #E5E5E5;'
      + 'border-left:5px solid #011B35;padding:11px 14px;margin-bottom:9px}'
      + '.achado.erro{border-left-color:#DC0A0A}.achado.aviso{'
      + 'border-left-color:#D4792A;background:#F8EADD}.achado.info{'
      + 'border-left-color:#0099C4;background:#F9F7F5}.achado-msg{'
      + 'font-weight:700;margin:0 0 5px}.achado-detalhe{font-size:12.5px;'
      + 'margin:0 0 5px}.achado-fonte{font-size:11px;border-top:1px solid '
      + '#E5E5E5;padding-top:5px;margin:0}.etiqueta{font-size:10px;'
      + 'font-weight:700;text-transform:uppercase;padding:2px 7px;'
      + 'margin-right:6px}.etiqueta.erro{background:#DC0A0A;color:#fff}'
      + '.tag{display:inline-block;font-size:10.5px;padding:1px 6px;'
      + 'border:1px solid #E5E5E5;margin-right:5px}.linha-erro{'
      + 'box-shadow:inset 5px 0 0 #DC0A0A}.rolagem{overflow:auto}'
      + '.marcador{display:inline-block;border:1px solid #E5E5E5;'
      + 'border-left:5px solid #011B35;padding:10px 14px;margin-right:8px}'
      + '.marcador .n{font-size:22px;font-weight:700}.marcador .r{'
      + 'font-size:10.5px;text-transform:uppercase}'
      + '.linha-dados{display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px}'
      + '.linha-dados span{display:block;font-size:10.5px;'
      + 'text-transform:uppercase;color:#011B35}</style></head><body>'
      + '<div class="cab"><h1>Fiscal Shield — '
      + esc(Roteador.TIPOS[tipo].rotulo) + '</h1></div><main>'
      + corpo + '</main></body></html>';
  }

  $('btn-html').addEventListener('click', function () {
    var porTipo = {};
    resultados.forEach(function (x) {
      if (!x.tipo) return;
      (porTipo[x.tipo] || (porTipo[x.tipo] = { ns: x.ns, itens: [] }))
        .itens.push(x.r);
    });
    var partes = Object.keys(porTipo).map(function (t) {
      return relatorioDe(porTipo[t], t);
    });
    if (!partes.length) { alert('Nenhum documento reconhecido.'); return; }
    baixa('fiscal-shield-' + carimbo() + '.html', partes.join('\n'), 'text/html');
  });

  $('btn-json').addEventListener('click', function () {
    baixa('fiscal-shield-' + carimbo() + '.json', JSON.stringify({
      ferramenta: 'Fiscal Shield',
      gerado_em: new Date().toISOString(),
      documentos: resultados.map(function (x) {
        return {
          arquivo: x.arquivo,
          tipo: x.tipo ? Roteador.TIPOS[x.tipo].rotulo : 'não reconhecido',
          resultado: x.r
        };
      })
    }, null, 2), 'application/json');
  });

  $('btn-csv').addEventListener('click', function () {
    var linhas = ['arquivo;tipo;nivel;grupo;titulo;alvo;linha;esperado;obtido;regra'];
    function campo(v) {
      return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    }
    resultados.forEach(function (x) {
      if (!x.r) return;
      x.r.achados.forEach(function (a) {
        linhas.push([x.arquivo, Roteador.TIPOS[x.tipo].rotulo, a.nivel,
          a.grupo, a.titulo, a.alvo, a.linha, a.esperado, a.obtido,
          a.regra ? a.regra.codigo : ''].map(campo).join(';'));
      });
    });
    baixa('fiscal-shield-achados-' + carimbo() + '.csv',
      '\uFEFF' + linhas.join('\r\n'), 'text/csv');
  });

  ['opt-ordem', 'opt-mapeamento', 'opt-tolerancia'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      if (lidos.length) valida().catch(function (e) { alert(e.message); });
    });
  });
})();
