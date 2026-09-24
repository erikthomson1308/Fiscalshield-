/* Ligação da interface: carga da base, leitura dos arquivos, abas e exportação. */
(function () {
  'use strict';

  var Base = window.Base;
  var Motor = window.Motor;
  var Rel = window.Relatorio;

  var resultados = [];
  var lidosEmMemoria = [];
  var atual = 0;
  var filtroBase = '';

  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------------
  // carga da base
  // ------------------------------------------------------------------
  function selo(html, cor) {
    var s = $('selo-base');
    s.innerHTML = '<span class="pulso"' + (cor ? ' style="background:' + cor + '"' : '')
      + '></span> ' + html;
  }

  Base.carrega('data/').then(function (b) {
    selo('base <b>' + b.campos.length + '</b> campos · <b>'
      + b.regras.length + '</b> regras · ' + (b.geradoEm || '').slice(0, 10));
    rodapeFontes(b);
    $('area-solta').classList.add('pronto');
  }).catch(function (e) {
    selo('falha ao carregar a base', '#DC0A0A');
    $('painel-base-inicial').insertAdjacentHTML('afterbegin',
      '<div class="achado erro"><p class="achado-msg">A base de dados não carregou.</p>'
      + '<p class="achado-detalhe">' + Rel.esc(e.message) + '</p>'
      + '<p class="achado-detalhe">Se você abriu o arquivo <code>index.html</code> '
      + 'diretamente pelo Explorador de Arquivos, o navegador bloqueia a leitura '
      + 'dos dados por segurança. Publique a pasta no GitHub Pages ou rode um '
      + 'servidor local.</p></div>');
  });

  function rodapeFontes(b) {
    var f = (b.fontes && b.fontes.fontes) || [];
    $('rodape-fontes').innerHTML = '<b>Base de dados</b><br>'
      + f.map(function (x) {
        return '<div class="fonte-item">' + Rel.esc(x.titulo)
          + '<br><span class="mono">' + Rel.esc(x.pdf || x.md || x.arquivo || '')
          + '</span></div>';
      }).join('');
  }

  // ------------------------------------------------------------------
  // entrada de arquivos
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

  function leArquivo(f) {
    return new Promise(function (ok, erro) {
      var r = new FileReader();
      r.onload = function () { ok({ nome: f.name, texto: r.result }); };
      r.onerror = function () { erro(new Error('Não foi possível ler ' + f.name)); };
      r.readAsText(f, 'UTF-8');
    });
  }

  function opcoes() {
    return {
      tolerancia: parseFloat($('opt-tolerancia').value),
      ordem: $('opt-ordem').value,
      mapeamento: $('opt-mapeamento').checked
    };
  }

  function processa(lista) {
    if (!Base.dados.pronta) {
      alert('A base de dados ainda está carregando. Tente novamente em instantes.');
      return;
    }
    var arquivos = Array.prototype.slice.call(lista).filter(function (f) {
      return /\.xml$/i.test(f.name);
    });
    if (!arquivos.length) {
      alert('Selecione arquivos XML de NF-e ou NFC-e.');
      return;
    }

    Promise.all(arquivos.map(leArquivo)).then(function (lidos) {
      lidosEmMemoria = lidos;
      valida();
      $('painel-base-inicial').hidden = true;
      $('painel-resultado').hidden = false;
      $('painel-resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (e) {
      alert(e.message);
    });
  }

  function valida() {
    var op = opcoes();
    resultados = lidosEmMemoria.map(function (a) {
      return Motor.valida(a.texto, a.nome, op);
    });
    if (atual >= resultados.length) atual = 0;
    desenhaBarra();
    desenha();
  }

  // ------------------------------------------------------------------
  // desenho
  // ------------------------------------------------------------------
  function desenhaBarra() {
    if (resultados.length < 2) { $('barra-arquivos').innerHTML = ''; return; }
    $('barra-arquivos').innerHTML = resultados.map(function (r, n) {
      var estado = r.totais.erros ? 'reprovado'
        : (r.totais.avisos ? 'alerta' : 'aprovado');
      return '<button class="chip-arquivo' + (n === atual ? ' ativo' : '')
        + '" data-n="' + n + '"><span class="ponto ' + estado + '"></span>'
        + Rel.esc(r.arquivo) + '</button>';
    }).join('');
    Array.prototype.forEach.call(
      $('barra-arquivos').querySelectorAll('.chip-arquivo'), function (b) {
        b.addEventListener('click', function () {
          atual = parseInt(b.dataset.n, 10);
          desenhaBarra(); desenha();
        });
      });
  }

  function desenha() {
    var r = resultados[atual];
    if (!r) return;
    $('placar').innerHTML = Rel.placar(r);
    $('aba-resumo').innerHTML = Rel.resumo(r);
    $('aba-achados').innerHTML = Rel.achados(r);
    $('aba-campos').innerHTML = Rel.campos(r);
    $('aba-tributos').innerHTML = Rel.tributos(r);
    $('aba-reforma').innerHTML = Rel.reforma(r);
    desenhaBase();
  }

  function desenhaBase() {
    $('aba-base').innerHTML = Rel.baseDeDados(filtroBase);
    var campo = $('busca-base');
    if (!campo) return;
    campo.addEventListener('input', function () {
      var pos = campo.selectionStart;
      filtroBase = campo.value;
      clearTimeout(campo._t);
      campo._t = setTimeout(function () {
        desenhaBase();
        var novo = $('busca-base');
        if (novo) { novo.focus(); novo.setSelectionRange(pos, pos); }
      }, 220);
    });
  }

  // ------------------------------------------------------------------
  // abas
  // ------------------------------------------------------------------
  Array.prototype.forEach.call($('abas').querySelectorAll('.aba'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call($('abas').querySelectorAll('.aba'), function (x) {
        x.classList.remove('ativa');
      });
      b.classList.add('ativa');
      ['resumo', 'achados', 'campos', 'tributos', 'reforma', 'base']
        .forEach(function (nome) {
          $('aba-' + nome).hidden = (nome !== b.dataset.aba);
        });
    });
  });

  // ------------------------------------------------------------------
  // exportação
  // ------------------------------------------------------------------
  function baixa(nome, conteudo, tipo) {
    var blob = new Blob([conteudo], { type: tipo + ';charset=utf-8' });
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

  $('btn-html').addEventListener('click', function () {
    baixa('fiscal-shield-' + carimbo() + '.html',
      Rel.relatorioHTML(resultados), 'text/html');
  });
  $('btn-json').addEventListener('click', function () {
    baixa('fiscal-shield-' + carimbo() + '.json',
      Rel.paraJSON(resultados), 'application/json');
  });
  $('btn-csv').addEventListener('click', function () {
    baixa('fiscal-shield-achados-' + carimbo() + '.csv',
      Rel.paraCSV(resultados), 'text/csv');
  });

  // as opcoes valem de imediato: revalida o que ja esta carregado
  ['opt-tolerancia', 'opt-ordem', 'opt-mapeamento'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      if (lidosEmMemoria.length) valida();
    });
  });
})();
