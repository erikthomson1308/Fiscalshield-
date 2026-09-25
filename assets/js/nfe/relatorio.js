/* Montagem das telas de resultado e das exportacoes. */
(function (raiz) {
  'use strict';

  raiz.NFe = raiz.NFe || {};

  var Base = raiz.NFe.Base;
  var T = raiz.NFe.Tributos;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(tag, attrs, html) {
    var a = [];
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] !== '' && attrs[k] !== null && attrs[k] !== undefined) {
        a.push(k + '="' + esc(attrs[k]) + '"');
      }
    });
    return '<' + tag + (a.length ? ' ' + a.join(' ') : '') + '>'
      + (html === undefined ? '' : html) + '</' + tag + '>';
  }
  function vazio(texto) { return el('p', { class: 'sumiu' }, esc(texto)); }

  // ------------------------------------------------------------------
  function placar(r) {
    var t = r.totais;
    function m(classe, n, rotulo) {
      return el('div', { class: 'marcador ' + classe },
        el('div', { class: 'n' }, esc(n)) + el('div', { class: 'r' }, esc(rotulo)));
    }
    var classeRisco = r.risco === 'Alto' ? 'erro' : (r.risco === 'Médio' ? 'aviso' : 'ok');
    return m(t.erros ? 'erro' : 'ok', t.erros, 'não conformidades')
      + m(t.avisos ? 'aviso' : 'ok', t.avisos, 'advertências')
      + m('info', t.mapeados, 'campos no leiaute')
      + m(t.foraMapeamento ? 'aviso' : 'ok', t.foraMapeamento, 'fora do mapeamento')
      + m(classeRisco, r.risco, 'risco fiscal');
  }

  // ------------------------------------------------------------------
  function resumo(r) {
    var c = r.cabecalho;
    if (!c.chave && !r.totais.elementos) {
      return el('h2', {}, 'Resumo')
        + el('div', { class: 'achado erro' },
          el('p', { class: 'achado-msg' }, 'O arquivo não pôde ser lido como NF-e.')
          + el('p', { class: 'achado-detalhe' },
            esc((r.achados[0] || {}).detalhe || '')));
    }

    function dado(rotulo, valor) {
      return el('div', {}, el('span', {}, esc(rotulo))
        + el('b', {}, esc(valor || '—')));
    }
    var ambiente = { '1': 'Produção', '2': 'Homologação' }[c.tpAmb] || c.tpAmb;
    var finalidade = { '1': 'Normal', '2': 'Complementar', '3': 'Ajuste',
      '4': 'Devolução', '5': 'Nota de crédito', '6': 'Nota de débito' }[c.finNFe]
      || c.finNFe;
    var regime = { '1': 'Simples Nacional', '2': 'Simples Nacional — excesso de sublimite',
      '3': 'Regime Normal', '4': 'MEI' }[c.crt] || c.crt;

    var cabecalho = el('div', { class: 'linha-dados' },
      dado('Modelo', c.modelo === '55' ? '55 — NF-e' : (c.modelo === '65' ? '65 — NFC-e' : c.modelo))
      + dado('Série / Número', c.serie + ' / ' + c.numero)
      + dado('Emissão', (c.emissao || '').replace('T', ' ').slice(0, 19))
      + dado('Ambiente', ambiente)
      + dado('Finalidade', finalidade)
      + dado('Regime (CRT)', regime)
      + dado('Itens', c.itens)
      + dado('Valor total', c.vNF ? 'R$ ' + T.moeda(parseFloat(c.vNF)) : '—'));

    var partes = el('div', { class: 'linha-dados' },
      dado('Emitente', c.emitente)
      + dado('CNPJ/CPF do emitente', c.emitenteDoc)
      + dado('Destinatário', c.destinatario)
      + dado('CNPJ/CPF do destinatário', c.destinatarioDoc)
      + dado('Natureza da operação', c.natOp));

    var chave = el('p', { class: 'mono', style: 'color:#011B35;margin:0 0 14px' },
      'Chave de acesso: ' + esc(c.chave || '—'));

    // parecer
    var parecer;
    if (r.totais.erros === 0 && r.totais.avisos === 0) {
      parecer = el('div', { class: 'achado info' },
        el('p', { class: 'achado-msg' }, 'Nenhuma divergência encontrada.')
        + el('p', { class: 'achado-detalhe' },
          'Foram conferidos ' + r.totais.mapeados + ' campos contra o leiaute '
          + 'oficial, além da chave de acesso, dos documentos do emitente e '
          + 'destinatário e da reconciliação dos totalizadores. '
          + 'A conferência não abrange regras estaduais de benefício fiscal '
          + 'nem a validação cadastral junto à SEFAZ.'));
    } else {
      var porGrupo = {};
      r.achados.forEach(function (a) {
        if (!porGrupo[a.grupo]) porGrupo[a.grupo] = { erro: 0, aviso: 0 };
        porGrupo[a.grupo][a.nivel === 'erro' ? 'erro' : 'aviso']++;
      });
      var linhas = Object.keys(porGrupo).sort(function (a, b) {
        return (porGrupo[b].erro - porGrupo[a].erro)
          || (porGrupo[b].aviso - porGrupo[a].aviso);
      }).map(function (g) {
        return el('tr', {},
          el('td', {}, esc(g))
          + el('td', { class: 'num' }, porGrupo[g].erro
            ? el('span', { class: 'tag erro' }, porGrupo[g].erro) : '—')
          + el('td', { class: 'num' }, porGrupo[g].aviso
            ? el('span', { class: 'tag aviso' }, porGrupo[g].aviso) : '—'));
      }).join('');
      parecer = el('div', { class: 'rolagem', style: 'max-height:340px' },
        el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'Natureza da divergência')
            + el('th', { style: 'text-align:right' }, 'Não conformidades')
            + el('th', { style: 'text-align:right' }, 'Advertências')))
          + el('tbody', {}, linhas)));
    }

    return el('h2', {}, 'Resumo do documento') + chave + cabecalho + partes
      + el('h3', { style: 'margin-top:18px' }, 'Parecer') + parecer;
  }

  // ------------------------------------------------------------------
  function achados(r) {
    if (!r.achados.length) {
      return el('h2', {}, 'Achados') + vazio('Nenhum achado a exibir.');
    }
    var peso = { erro: 0, aviso: 1, info: 2 };
    var lista = r.achados.slice().sort(function (a, b) {
      return (peso[a.nivel] - peso[b.nivel]) || a.grupo.localeCompare(b.grupo);
    });

    var html = lista.map(function (a) {
      var rotuloNivel = { erro: 'não conformidade', aviso: 'advertência',
        info: 'informação' }[a.nivel];
      var topo = el('span', { class: 'etiqueta ' + a.nivel }, rotuloNivel)
        + el('span', { class: 'tag' }, esc(a.grupo))
        + el('span', { class: 'achado-alvo' },
          esc(a.alvo) + (a.linha ? ' · linha ' + a.linha : ''));

      var corpo = el('p', { class: 'achado-msg' }, esc(a.titulo));
      if (a.detalhe) corpo += el('p', { class: 'achado-detalhe' }, esc(a.detalhe));
      if (a.esperado || a.obtido) {
        corpo += el('p', { class: 'achado-detalhe mono' },
          (a.esperado ? 'esperado: ' + esc(a.esperado) : '')
          + (a.esperado && a.obtido ? '<br>' : '')
          + (a.obtido ? 'obtido: ' + esc(a.obtido) : ''));
      }
      var fonte = '';
      if (a.regra) {
        fonte = el('b', {}, 'Regra ' + esc(a.regra.codigo)
          + (a.regra.msg ? ' — rejeição ' + esc(a.regra.msg) : ''))
          + (a.regra.erro ? ' · ' + esc(a.regra.erro) : '')
          + (a.regra.regra ? '<br>' + esc(a.regra.regra.slice(0, 400)) : '');
      } else if (a.fonte) {
        fonte = el('b', {}, 'Fonte: ') + esc(a.fonte);
      }
      if (fonte) corpo += el('p', { class: 'achado-fonte' }, fonte);

      return el('div', { class: 'achado ' + a.nivel },
        el('div', { class: 'achado-topo' }, topo) + corpo);
    }).join('');

    return el('h2', {}, 'Achados (' + lista.length + ')') + html;
  }

  // ------------------------------------------------------------------
  function campos(r) {
    if (!r.arvore) return el('h2', {}, 'Campos') + vazio('Sem árvore para exibir.');

    var porAlvo = {};
    r.achados.forEach(function (a) {
      if (!porAlvo[a.alvo] || a.nivel === 'erro') porAlvo[a.alvo] = a.nivel;
    });

    var linhas = [];
    ['infNFe', 'infNFeSupl'].forEach(function (ancora) {
      var no = raiz.Leitor.acha(r.arvore, ancora);
      if (!no) return;
      raiz.Leitor.percorre(no, function (n) {
        if (n.filhos.length) return;
        var def = Base.campo(n.caminho);
        var nivel = porAlvo[n.caminho] || '';
        linhas.push(el('tr', { class: nivel ? 'linha-' + nivel : '' },
          el('td', { class: 'cod' }, esc(def ? def.id : '—'))
          + el('td', { class: 'cod' }, esc(n.caminho))
          + el('td', {}, esc(n.texto.length > 70 ? n.texto.slice(0, 70) + '…' : n.texto))
          + el('td', {}, esc(def ? def.tipo : ''))
          + el('td', {}, esc(def ? def.ocor : ''))
          + el('td', {}, esc(def ? def.tam : ''))
          + el('td', {}, def
            ? (def.fonte === 'ajuste'
              ? el('span', { class: 'tag ajuste' }, 'ajuste declarado')
              : esc(def.doc || '') + (def.pagina ? ', p. ' + def.pagina : ''))
            : el('span', { class: 'tag aviso' }, 'fora do mapeamento'))
          + el('td', {}, esc(def ? def.desc : ''))));
      });
    });

    return el('h2', {}, 'Campos conferidos (' + linhas.length + ')')
      + el('p', { class: 'achado-detalhe' },
        'Cada linha traz o valor enviado e a definição oficial correspondente, '
        + 'com o documento e a página em que ela consta.')
      + el('div', { class: 'rolagem' }, el('table', {},
        el('thead', {}, el('tr', {},
          ['ID', 'Caminho', 'Valor', 'Tipo', 'Ocor.', 'Tam.', 'Fonte', 'Descrição']
            .map(function (h) { return el('th', {}, h); }).join('')))
        + el('tbody', {}, linhas.join(''))));
  }

  // ------------------------------------------------------------------
  function tributos(r) {
    if (!r.fiscal) return el('h2', {}, 'Tributos') + vazio('Sem dados fiscais.');

    var tolPct = (r.opcoes.tolerancia * 100).toString().replace('.', ',');
    var intro = el('p', { class: 'achado-detalhe' },
      'Tolerância aplicada: ' + tolPct + '% ou um centavo, o que for maior. '
      + 'Cada linha cita a regra de validação oficial e o número da rejeição '
      + 'que a SEFAZ devolveria.');

    var linhasTot = r.fiscal.totais.map(function (t) {
      return el('tr', { class: t.ok ? '' : 'linha-erro' },
        el('td', { class: 'cod' }, esc(t.campo))
        + el('td', { class: 'num' }, T.moeda(t.declarado))
        + el('td', { class: 'num' }, T.moeda(t.somado))
        + el('td', { class: 'num' }, T.moeda(t.diferenca))
        + el('td', {}, t.ok ? el('span', { class: 'tag ok' }, 'confere')
          : el('span', { class: 'tag erro' }, 'não confere'))
        + el('td', { class: 'cod' }, esc(t.regra)
          + (t.msg ? ' · rejeição ' + esc(t.msg) : ''))
        + el('td', {}, esc(t.ressalva || '')));
    }).join('');

    var tabelaTot = el('h3', {}, 'Reconciliação dos totalizadores')
      + el('div', { class: 'rolagem', style: 'max-height:460px' }, el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Campo')
          + el('th', { style: 'text-align:right' }, 'Declarado')
          + el('th', { style: 'text-align:right' }, 'Soma dos itens')
          + el('th', { style: 'text-align:right' }, 'Diferença')
          + el('th', {}, 'Situação') + el('th', {}, 'Regra')
          + el('th', {}, 'Ressalva da regra')))
        + el('tbody', {}, linhasTot)));

    // composicao do vNF
    var vnf = r.fiscal.totais.filter(function (t) { return t.composicao; })[0];
    var comp = '';
    if (vnf) {
      comp = el('h3', { style: 'margin-top:22px' }, 'Composição do valor total (regra W16-10)')
        + el('div', { class: 'rolagem', style: 'max-height:340px' }, el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'Sinal') + el('th', {}, 'Campo')
            + el('th', { style: 'text-align:right' }, 'Valor')))
          + el('tbody', {}, vnf.composicao.map(function (c) {
            return el('tr', {}, el('td', {}, c.sinal)
              + el('td', { class: 'cod' }, esc(c.campo))
              + el('td', { class: 'num' }, T.moeda(c.valor)));
          }).join('')
            + el('tr', { style: 'font-weight:700;background:#F8EADD' },
              el('td', {}, '=') + el('td', {}, 'total calculado')
              + el('td', { class: 'num' }, T.moeda(vnf.somado))))));
    }

    // itens
    var linhasItens = r.fiscal.itens.map(function (i) {
      return el('tr', { class: i.divergencias ? 'linha-erro' : '' },
        el('td', { class: 'num' }, esc(i.item))
        + el('td', { class: 'cod' }, esc(i.codigo))
        + el('td', {}, esc((i.descricao || '').slice(0, 52)))
        + el('td', { class: 'cod' }, esc(i.ncm))
        + el('td', { class: 'cod' }, esc(i.cfop))
        + el('td', { class: 'cod' }, esc(i.cst || ''))
        + el('td', { class: 'num' }, i.vProd === null ? '—' : T.moeda(i.vProd))
        + el('td', {}, i.divergencias
          ? el('span', { class: 'tag erro' }, i.divergencias + ' divergência(s)')
          : el('span', { class: 'tag ok' }, 'confere')));
    }).join('');

    var tabelaItens = el('h3', { style: 'margin-top:22px' },
      'Itens (' + r.fiscal.itens.length + ')')
      + el('div', { class: 'rolagem', style: 'max-height:420px' }, el('table', {},
        el('thead', {}, el('tr', {},
          ['Item', 'Código', 'Descrição', 'NCM', 'CFOP', 'CST/CSOSN', 'Valor', 'Situação']
            .map(function (h) { return el('th', {}, h); }).join('')))
        + el('tbody', {}, linhasItens)));

    return el('h2', {}, 'Tributos') + intro + tabelaTot + comp + tabelaItens;
  }

  // ------------------------------------------------------------------
  function reforma(r) {
    var titulo = el('h2', {}, 'Reforma Tributária — IBS, CBS e IS');
    if (!r.fiscal || !r.fiscal.rtc.presente) {
      return titulo + el('div', { class: 'achado info' },
        el('p', { class: 'achado-msg' }, 'O documento não traz os grupos de IBS/CBS/IS.')
        + el('p', { class: 'achado-detalhe' },
          'A nota foi conferida apenas pelos tributos vigentes (ICMS, IPI, PIS, '
          + 'COFINS, ISSQN). Isso não é uma divergência: os grupos da Reforma '
          + 'passam a ser exigidos conforme o cronograma da NT 2025.002-RTC. '
          + 'Quando a exigência alcançar esta operação, os campos precisarão '
          + 'ser enviados pelo sistema de origem.'));
    }

    var rtc = r.fiscal.rtc;
    var linhas = rtc.itens.map(function (i) {
      return el('tr', { class: i.divergencias ? 'linha-erro' : '' },
        el('td', { class: 'num' }, esc(i.item))
        + el('td', { class: 'cod' }, esc(i.cst || '—'))
        + el('td', { class: 'cod' }, esc(i.cClassTrib || '—'))
        + el('td', { class: 'num' }, i.vBC === undefined || i.vBC === null ? '—' : T.moeda(i.vBC))
        + el('td', { class: 'num' }, i.vIBSUF === undefined ? '—' : T.moeda(i.vIBSUF))
        + el('td', { class: 'num' }, i.vIBSMun === undefined ? '—' : T.moeda(i.vIBSMun))
        + el('td', { class: 'num' }, i.vCBS === undefined ? '—' : T.moeda(i.vCBS))
        + el('td', {}, i.divergencias
          ? el('span', { class: 'tag erro' }, i.divergencias + ' divergência(s)')
          : el('span', { class: 'tag ok' }, 'confere')));
    }).join('');

    var tabela = el('div', { class: 'rolagem' }, el('table', {},
      el('thead', {}, el('tr', {},
        ['Item', 'CST', 'cClassTrib', 'Base', 'IBS UF', 'IBS Município', 'CBS', 'Situação']
          .map(function (h) { return el('th', {}, h); }).join('')))
      + el('tbody', {}, linhas)));

    var totais = '';
    if (rtc.totais.length) {
      totais = el('h3', { style: 'margin-top:22px' }, 'Totalizadores da Reforma')
        + el('div', { class: 'rolagem', style: 'max-height:280px' }, el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'Campo')
            + el('th', { style: 'text-align:right' }, 'Declarado')
            + el('th', { style: 'text-align:right' }, 'Soma dos itens')
            + el('th', { style: 'text-align:right' }, 'Diferença')
            + el('th', {}, 'Situação')))
          + el('tbody', {}, rtc.totais.map(function (t) {
            return el('tr', { class: t.ok ? '' : 'linha-erro' },
              el('td', { class: 'cod' }, esc(t.campo))
              + el('td', { class: 'num' }, T.moeda(t.declarado))
              + el('td', { class: 'num' }, T.moeda(t.somado))
              + el('td', { class: 'num' }, T.moeda(t.diferenca))
              + el('td', {}, t.ok ? el('span', { class: 'tag ok' }, 'confere')
                : el('span', { class: 'tag erro' }, 'não confere')));
          }).join(''))));
    }

    var pend = rtc.pendencias.map(function (p) {
      return el('div', { class: 'achado info' },
        el('p', { class: 'achado-msg' }, esc(p.titulo))
        + el('p', { class: 'achado-detalhe' }, esc(p.texto)
          + (p.link ? ' ' + el('a', { href: p.link, target: '_blank',
            rel: 'noopener' }, 'Abrir a tabela oficial') : '')));
    }).join('');

    return titulo + tabela + totais
      + el('h3', { style: 'margin-top:22px' }, 'O que esta ferramenta não decide')
      + pend;
  }

  // ------------------------------------------------------------------
  function baseDeDados(filtro) {
    var d = Base.dados;
    var f = (filtro || '').trim().toLowerCase();

    var fontes = (d.fontes && d.fontes.fontes || []).map(function (x) {
      return el('tr', {},
        el('td', {}, esc(x.titulo))
        + el('td', { class: 'cod' }, esc(x.pdf || x.md || x.arquivo || ''))
        + el('td', { class: 'num' }, esc((x.campos_pdf || 0) + (x.campos_md || 0) || x.campos || 0))
        + el('td', { class: 'num' }, esc(x.regras || 0))
        + el('td', { class: 'cod', title: esc(x.pdf_sha256 || x.sha256 || '') },
          esc((x.pdf_sha256 || x.sha256 || '').slice(0, 16) + '…')));
    }).join('');

    var cabecalho = el('h2', {}, 'Base de dados')
      + el('p', { class: 'achado-detalhe' },
        'Tudo o que a ferramenta verifica sai daqui. A base é gerada por '
        + '<code>tools/build_db.py</code> a partir dos documentos abaixo — '
        + 'nenhuma regra é escrita à mão no código do site. Para atualizar, '
        + 'troque o documento e rode o gerador de novo.')
      + el('div', { class: 'rolagem', style: 'max-height:240px' }, el('table', {},
        el('thead', {}, el('tr', {},
          ['Documento', 'Arquivo', 'Campos', 'Regras', 'SHA-256']
            .map(function (h) { return el('th', {}, h); }).join('')))
        + el('tbody', {}, fontes)))
      + el('p', { class: 'achado-detalhe', style: 'margin-top:10px' },
        'Base gerada em ' + esc((d.geradoEm || '').replace('T', ' ').replace('Z', ' UTC'))
        + ' · ' + d.campos.length + ' campos · ' + d.regras.length + ' regras'
        + (d.dfe && d.dfe.length
          ? ' · ' + d.dfe.length + ' campos do layout DFe com mapeamento SAP.'
          : '.'));

    var ajustes = '';
    var declarados = d.campos.filter(function (c) { return c.fonte === 'ajuste'; });
    if (declarados.length) {
      ajustes = el('h3', { style: 'margin-top:22px' },
        'Ajustes declarados (' + declarados.length + ')')
        + el('p', { class: 'achado-detalhe' },
          'Complementos registrados em <code>data/ajustes.json</code>, separados '
          + 'do que foi extraído automaticamente, cada um com sua justificativa.')
        + declarados.map(function (c) {
          return el('div', { class: 'achado info' },
            el('p', { class: 'achado-msg' },
              el('span', { class: 'tag ajuste' }, 'ajuste') + ' '
              + esc(c.caminho))
            + el('p', { class: 'achado-detalhe' }, esc(c.justificativa || '')));
        }).join('');
    }

    var busca = el('h3', { style: 'margin-top:22px' }, 'Consultar campos e regras')
      + el('input', { class: 'busca', id: 'busca-base', type: 'search',
        value: filtro || '',
        placeholder: 'Buscar por tag, caminho, ID do leiaute, código de regra ou número de rejeição…' });

    if (!f) {
      return cabecalho + ajustes + busca
        + vazio('Digite acima para consultar os ' + d.campos.length
          + ' campos e as ' + d.regras.length + ' regras da base.');
    }

    var campos = d.campos.filter(function (c) {
      return c.caminho.toLowerCase().indexOf(f) !== -1
        || (c.id || '').toLowerCase().indexOf(f) !== -1
        || (c.desc || '').toLowerCase().indexOf(f) !== -1;
    }).slice(0, 200);

    var regras = d.regras.filter(function (x) {
      return (x.codigo || '').toLowerCase().indexOf(f) !== -1
        || (x.msg || '').indexOf(f) !== -1
        || (x.regra || '').toLowerCase().indexOf(f) !== -1
        || (x.erro || '').toLowerCase().indexOf(f) !== -1;
    }).slice(0, 120);

    var tabCampos = campos.length ? el('div', { class: 'rolagem', style: 'max-height:420px' },
      el('table', {},
        el('thead', {}, el('tr', {},
          ['ID', 'Caminho', 'Ele', 'Tipo', 'Ocor.', 'Tam.', 'Domínio', 'Fonte']
            .map(function (h) { return el('th', {}, h); }).join('')))
        + el('tbody', {}, campos.map(function (c) {
          return el('tr', {},
            el('td', { class: 'cod' }, esc(c.id))
            + el('td', { class: 'cod' }, esc(c.caminho))
            + el('td', {}, esc(c.ele))
            + el('td', {}, esc(c.tipo))
            + el('td', {}, esc(c.ocor))
            + el('td', {}, esc(c.tam))
            + el('td', {}, c.dominio
              ? esc(c.dominio.valores.map(function (v) { return v.valor; })
                .slice(0, 14).join(', '))
                + (c.dominio.fechado ? ' ' + el('span', { class: 'tag' }, 'fechado') : '')
              : '—')
            + el('td', {}, c.fonte === 'ajuste'
              ? el('span', { class: 'tag ajuste' }, 'ajuste declarado')
              : esc(c.doc || '') + (c.pagina ? ', p. ' + c.pagina : '')));
        }).join(''))))
      : vazio('Nenhum campo encontrado.');

    var tabRegras = regras.length ? el('div', { class: 'rolagem', style: 'max-height:420px' },
      el('table', {},
        el('thead', {}, el('tr', {},
          ['Código', 'Modelo', 'Rejeição', 'Efeito', 'Enunciado oficial', 'Mensagem de erro']
            .map(function (h) { return el('th', {}, h); }).join('')))
        + el('tbody', {}, regras.map(function (x) {
          return el('tr', {},
            el('td', { class: 'cod' }, esc(x.codigo))
            + el('td', {}, esc(x.modelo))
            + el('td', { class: 'cod' }, esc(x.msg))
            + el('td', {}, esc(x.efeito))
            + el('td', {}, esc((x.regra || '').slice(0, 260)))
            + el('td', {}, esc(x.erro)));
        }).join(''))))
      : vazio('Nenhuma regra encontrada.');

    return cabecalho + ajustes + busca
      + el('h3', {}, 'Campos (' + campos.length + ')') + tabCampos
      + el('h3', { style: 'margin-top:18px' }, 'Regras (' + regras.length + ')') + tabRegras
      + (raiz.NFe.MapeamentoSAP ? raiz.NFe.MapeamentoSAP.render(f, el, esc) : '');
  }

  // ------------------------------------------------------------------
  // exportacoes
  // ------------------------------------------------------------------
  function relatorioHTML(resultados) {
    // Mesmo sistema de cores da tela: TR Orange #D64000, uma unica fundacao
    // (Bold Navy), um unico par secundario (Amber), blocos de canto vivo e
    // grafite no texto - cinza nao e cor de texto na marca.
    var estilo = 'body{font:14px/1.5 "Clario",Arial,Helvetica,sans-serif;'
      + 'color:#212223;margin:0;background:#F9F7F5}'
      + 'main{max-width:1100px;margin:0 auto;padding:26px}'
      + 'h1{font-size:21px;margin:0 0 4px}h2{font-size:17px;margin:26px 0 10px}'
      + 'h3{font-size:14px;margin:18px 0 8px}'
      + 'a{color:#011B35}'
      + '.cab{background:#011B35;color:#fff;padding:20px 26px;border-bottom:4px solid #D64000}'
      + '.cab p{margin:0;color:#fff;opacity:.85;font-size:13px}'
      + '.cartao{background:#fff;border:1px solid #E5E5E5;padding:20px;margin-bottom:16px}'
      + 'table{border-collapse:collapse;width:100%;font-size:12.5px;background:#fff}'
      + 'th,td{padding:6px 10px;border-bottom:1px solid #E5E5E5;text-align:left;vertical-align:top}'
      + 'th{background:#011B35;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#fff;font-weight:700}'
      + '.num{text-align:right;font-family:Consolas,monospace}'
      + '.cod{font-family:Consolas,monospace;font-size:11.5px}'
      + '.achado{border:1px solid #E5E5E5;border-left:5px solid #011B35;padding:11px 14px;margin-bottom:9px;background:#fff}'
      + '.achado.erro{border-left-color:#DC0A0A;border-left-width:6px}'
      + '.achado.aviso{border-left-color:#D4792A;background:#F8EADD}'
      + '.achado.info{border-left-color:#0099C4;background:#F9F7F5}'
      + '.achado-msg{font-weight:700;margin:0 0 5px}'
      + '.achado-detalhe{font-size:12.5px;color:#212223;margin:0 0 5px}'
      + '.achado-fonte{font-size:11px;color:#212223;border-top:1px solid #E5E5E5;padding-top:5px;margin:0}'
      + '.achado-fonte b{color:#011B35}'
      + '.achado-topo{margin-bottom:5px}'
      + '.etiqueta{font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;margin-right:6px}'
      + '.etiqueta.erro{background:#DC0A0A;color:#fff}'
      + '.etiqueta.aviso{background:#fff;color:#212223;border:2px solid #D4792A}'
      + '.etiqueta.info{background:#fff;color:#212223;border:2px solid #0099C4}'
      + '.tag{display:inline-block;font-size:10.5px;padding:1px 6px;background:#F9F7F5;border:1px solid #E5E5E5;margin-right:5px}'
      + '.tag.ok{background:#fff;border-color:#387C2B;color:#387C2B;font-weight:700}'
      + '.tag.erro{background:#fff;border-color:#DC0A0A;color:#DC0A0A;font-weight:700}'
      + '.tag.aviso{background:#F8EADD;border-color:#D4792A;color:#212223;font-weight:700}'
      + '.tag.ajuste{background:#fff;border:2px solid #D64000;color:#D64000;font-weight:700}'
      + '.placar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}'
      + '.marcador{border:1px solid #E5E5E5;border-left:5px solid #011B35;padding:10px 14px;background:#fff;min-width:130px}'
      + '.marcador .n{font-size:22px;font-weight:700}'
      + '.marcador .r{font-size:10.5px;text-transform:uppercase;color:#011B35;font-weight:700}'
      + '.marcador.erro{border-left-color:#DC0A0A}.marcador.erro .n{color:#DC0A0A}'
      + '.marcador.aviso{border-left-color:#D4792A}'
      + '.marcador.ok{border-left-color:#387C2B}.marcador.ok .n{color:#387C2B}'
      + '.marcador.info{border-left-color:#D64000}.marcador.info .n{color:#D64000}'
      + '.linha-dados{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:12px;font-size:12.5px}'
      + '.linha-dados span{display:block;font-size:10.5px;text-transform:uppercase;color:#011B35;font-weight:700}'
      + '.linha-erro{box-shadow:inset 5px 0 0 #DC0A0A}.rolagem{overflow:auto}'
      + '.sumiu{color:#212223;font-style:italic}'
      + '.rodape{font-size:11.5px;color:#212223;padding:16px 26px 30px;max-width:1100px;margin:0 auto;'
      + 'border-top:4px solid #D64000}'
      + '@media print{body{background:#fff}.cartao{break-inside:avoid}}';

    var corpo = resultados.map(function (r) {
      return el('section', { class: 'cartao' },
        el('h2', { style: 'margin-top:0' }, esc(r.arquivo))
        + el('div', { class: 'placar' }, placar(r))
        + resumo(r) + achados(r) + tributos(r) + reforma(r));
    }).join('');

    var d = Base.dados;
    var fontes = (d.fontes && d.fontes.fontes || []).map(function (x) {
      return '<li>' + esc(x.titulo) + ' — <code>'
        + esc(x.pdf || x.md || x.arquivo || '') + '</code></li>';
    }).join('');

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
      + '<title>Relatório de validação — Fiscal Shield</title>'
      + '<style>' + estilo + '</style></head><body>'
      + '<div class="cab"><h1>Fiscal Shield — Relatório de validação</h1>'
      + '<p>Gerado em ' + esc(new Date().toLocaleString('pt-BR'))
      + ' · ' + resultados.length + ' documento(s)</p></div>'
      + '<main>' + corpo + '</main>'
      + '<div class="rodape"><b>Base utilizada</b><ul>' + fontes + '</ul>'
      + 'Ferramenta de apoio à conferência técnica. Não substitui a análise do '
      + 'time fiscal nem a autorização da SEFAZ.</div>'
      + '</body></html>';
  }

  function paraCSV(resultados) {
    var cab = ['arquivo', 'chave', 'nivel', 'grupo', 'titulo', 'alvo', 'linha',
      'esperado', 'obtido', 'regra', 'rejeicao', 'fonte'];
    function campo(v) {
      var s = String(v === null || v === undefined ? '' : v).replace(/"/g, '""');
      return '"' + s + '"';
    }
    var linhas = [cab.join(';')];
    resultados.forEach(function (r) {
      r.achados.forEach(function (a) {
        linhas.push([r.arquivo, r.cabecalho.chave || '', a.nivel, a.grupo,
          a.titulo, a.alvo, a.linha, a.esperado, a.obtido,
          a.regra ? a.regra.codigo : '', a.regra ? a.regra.msg : '', a.fonte]
          .map(campo).join(';'));
      });
    });
    return '\uFEFF' + linhas.join('\r\n');
  }

  function paraJSON(resultados) {
    return JSON.stringify({
      ferramenta: 'Fiscal Shield',
      gerado_em: new Date().toISOString(),
      base: {
        gerado_em: Base.dados.geradoEm,
        campos: Base.dados.campos.length,
        regras: Base.dados.regras.length,
        fontes: (Base.dados.fontes && Base.dados.fontes.fontes) || []
      },
      documentos: resultados.map(function (r) {
        return {
          arquivo: r.arquivo, ok: r.ok, risco: r.risco,
          cabecalho: r.cabecalho, totais: r.totais,
          achados: r.achados, fiscal: r.fiscal
        };
      })
    }, null, 2);
  }

  raiz.NFe.Relatorio = {
    placar: placar, resumo: resumo, achados: achados, campos: campos,
    tributos: tributos, reforma: reforma, baseDeDados: baseDeDados,
    relatorioHTML: relatorioHTML, paraCSV: paraCSV, paraJSON: paraJSON,
    esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.NFe.Relatorio;
})(typeof globalThis !== 'undefined' ? globalThis : this);
