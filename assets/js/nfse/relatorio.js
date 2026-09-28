/* Telas de resultado do validador de NFS-e. */
(function (raiz) {
  'use strict';

  raiz.NFSe = raiz.NFSe || {};

  var Base = raiz.NFSe.Base;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(tag, attrs, html) {
    var a = [];
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] !== '' && attrs[k] != null) a.push(k + '="' + esc(attrs[k]) + '"');
    });
    return '<' + tag + (a.length ? ' ' + a.join(' ') : '') + '>'
      + (html === undefined ? '' : html) + '</' + tag + '>';
  }
  function vazio(t) { return el('p', { class: 'sumiu' }, esc(t)); }
  function tabela(cabecalhos, linhas, altura) {
    if (!linhas) return vazio('Nada a exibir.');
    return el('div', { class: 'rolagem', style: altura ? 'max-height:' + altura : '' },
      el('table', {},
        el('thead', {}, el('tr', {}, cabecalhos.map(function (h) {
          return el('th', {}, h);
        }).join('')))
        + el('tbody', {}, linhas)));
  }

  // ------------------------------------------------------------------
  function placar(r) {
    var t = r.totais;
    function m(c, n, rot) {
      return el('div', { class: 'marcador ' + c },
        el('div', { class: 'n' }, esc(n)) + el('div', { class: 'r' }, esc(rot)));
    }
    return m(t.erros ? 'erro' : 'ok', t.erros, 'não conformidades')
      + m(t.avisos ? 'aviso' : 'ok', t.avisos, 'advertências')
      + m('info', t.mapeados, 'campos no leiaute')
      + m(t.foraMapeamento ? 'aviso' : 'ok', t.foraMapeamento, 'fora do mapeamento')
      + m(r.risco === 'Alto' ? 'erro' : (r.risco === 'Médio' ? 'aviso' : 'ok'),
        r.risco, 'risco fiscal');
  }

  // ------------------------------------------------------------------
  function resumo(r) {
    var c = r.cabecalho;
    if (!c.id && !r.totais.elementos) {
      return el('h2', {}, 'Resumo')
        + el('div', { class: 'achado erro' },
          el('p', { class: 'achado-msg' }, 'O arquivo não pôde ser lido.')
          + el('p', { class: 'achado-detalhe' },
            esc((r.achados[0] || {}).detalhe || '')));
    }
    function dado(rot, val) {
      return el('div', {}, el('span', {}, esc(rot)) + el('b', {}, esc(val || '—')));
    }
    var amb = { '1': 'Produção', '2': 'Homologação' }[c.tpAmb] || c.tpAmb;
    var emit = { '1': 'Prestador', '2': 'Tomador', '3': 'Intermediário' }[c.tpEmit]
      || c.tpEmit;

    var vigente = Base.dados.versoes[Base.dados.vigente];
    var aviso = el('div', { class: 'achado info' },
      el('p', { class: 'achado-msg' },
        'Conferido contra o leiaute ' + esc(vigente.rotulo))
      + el('p', { class: 'achado-detalhe' }, esc(vigente.nota)));

    var rot = r.roteamento;
    var municipio = rot
      ? esc(rot.nome + '/' + rot.uf) + ' em ' + esc(dataBR(rot.dataReferencia))
        + ': ' + (rot.mei ? 'prestador MEI, emite sempre pelo padrão nacional'
          : (rot.aderente ? 'aderente ao Emissor Nacional' : 'não aderente ao Emissor Nacional'))
        + (rot.ajuste ? ' (ajuste declarado: troca em '
          + esc(dataBR(rot.ajuste.emissorNacionalDesde)) + ')' : '')
        + '. Convênio: ' + esc(rot.convenio || '—') + '.'
      : 'não verificado — relação de municípios indisponível ou cLocEmi ausente.';
    var rn = r.regrasNegocio;
    var alcance = el('div', { class: 'achado info' },
      el('p', { class: 'achado-msg' }, 'Alcance desta conferência')
      + el('p', { class: 'achado-detalhe' }, '<b>Município emissor:</b> ' + municipio)
      + el('p', { class: 'achado-detalhe' }, '<b>Regras de negócio:</b> '
        + (rn ? rn.conferidas.length + ' regras do Anexo VI avaliadas com os dados do '
          + 'próprio XML' : 'não avaliadas') + '.')
      + el('p', { class: 'achado-detalhe' }, '<b>Não conferido daqui:</b> '
        + 'o que depende de consulta ao Sistema Nacional — existência do CNPJ/CPF '
        + 'na Receita, cadastro municipal (CNC) e inscrição municipal, '
        + 'parametrização do município (alíquota de ISSQN, código de tributação '
        + 'municipal, benefícios, retenções permitidas), NFS-e referenciada '
        + 'existente e assinatura digital. A SEFIN Nacional ainda pode rejeitar '
        + 'por esses motivos.'));

    return el('h2', {}, 'Resumo do documento')
      + el('p', { class: 'mono', style: 'color:#011B35;margin:0 0 14px' },
        'Identificador: ' + esc(c.id || '—'))
      + el('div', { class: 'linha-dados' },
        dado('Tipo', c.tipoDoc) + dado('Série / Número', c.serie + ' / ' + c.numero)
        + dado('Competência', c.competencia) + dado('Emissão', (c.emissao || '').slice(0, 19).replace('T', ' '))
        + dado('Ambiente', amb) + dado('Emitente', emit)
        + dado('Município emissor', c.cLocEmi))
      + el('div', { class: 'linha-dados' },
        dado('Prestador', c.prestador) + dado('Tomador', c.tomador)
        + dado('Valor do serviço', c.valor))
      + aviso
      + alcance
      + el('h3', { style: 'margin-top:18px' }, 'Parecer')
      + (r.totais.erros === 0 && r.totais.avisos === 0
        ? el('div', { class: 'achado info' },
          el('p', { class: 'achado-msg' }, 'Nenhuma divergência encontrada.')
          + el('p', { class: 'achado-detalhe' },
            'Foram conferidos ' + r.totais.mapeados + ' campos contra o leiaute, '
            + 'a adesão do município na data da DPS, o identificador, os '
            + 'documentos das partes, o par CST × cClassTrib e as regras de '
            + 'negócio listadas acima.'))
        : achados(r, true));
  }

  function dataBR(iso) {
    var p = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return p ? p[3] + '/' + p[2] + '/' + p[1] : (iso || '—');
  }

  // ------------------------------------------------------------------
  function achados(r, semTitulo) {
    if (!r.achados.length) {
      return (semTitulo ? '' : el('h2', {}, 'Achados')) + vazio('Nenhum achado.');
    }
    var peso = { erro: 0, aviso: 1, info: 2 };
    var lista = r.achados.slice().sort(function (a, b) {
      return (peso[a.nivel] - peso[b.nivel]) || a.grupo.localeCompare(b.grupo);
    });
    var html = lista.map(function (a) {
      var rot = { erro: 'não conformidade', aviso: 'advertência',
        info: 'informação' }[a.nivel];
      var corpo = el('p', { class: 'achado-msg' }, esc(a.titulo));
      if (a.detalhe) corpo += el('p', { class: 'achado-detalhe' }, esc(a.detalhe));
      if (a.esperado || a.obtido) {
        corpo += el('p', { class: 'achado-detalhe mono' },
          (a.esperado ? 'esperado: ' + esc(a.esperado) : '')
          + (a.esperado && a.obtido ? '<br>' : '')
          + (a.obtido ? 'obtido: ' + esc(a.obtido) : ''));
      }
      var fonte = a.regra
        ? el('b', {}, 'Regra ' + esc(a.regra.codigo)
            + (a.regra.efeito ? ' — ' + esc(a.regra.efeito) : ''))
          + (a.regra.msg ? ' · ' + esc(a.regra.msg) : '')
          + (a.regra.regra ? '<br>' + esc(a.regra.regra.slice(0, 380)) : '')
        : (a.fonte ? el('b', {}, 'Fonte: ') + esc(a.fonte) : '');
      if (fonte) corpo += el('p', { class: 'achado-fonte' }, fonte);

      return el('div', { class: 'achado ' + a.nivel },
        el('div', { class: 'achado-topo' },
          el('span', { class: 'etiqueta ' + a.nivel }, rot)
          + el('span', { class: 'tag' }, esc(a.grupo))
          + el('span', { class: 'achado-alvo' },
            esc(a.alvo) + (a.linha ? ' · linha ' + a.linha : ''))) + corpo);
    }).join('');
    return (semTitulo ? '' : el('h2', {}, 'Achados (' + lista.length + ')')) + html;
  }

  // ------------------------------------------------------------------
  function campos(r) {
    if (!r.arvore) return el('h2', {}, 'Campos') + vazio('Sem árvore.');
    var porAlvo = {};
    r.achados.forEach(function (a) {
      if (!porAlvo[a.alvo] || a.nivel === 'erro') porAlvo[a.alvo] = a.nivel;
    });
    var linhas = [];
    ['infDPS', 'infNFSe'].forEach(function (anc) {
      var no = raiz.Leitor.acha(r.arvore, anc);
      if (!no) return;
      raiz.Leitor.percorre(no, function (n) {
        if (n.filhos.length) return;
        var d = Base.campo(n.caminho);
        var nivel = porAlvo[n.caminho] || '';
        linhas.push(el('tr', { class: nivel ? 'linha-' + nivel : '' },
          el('td', { class: 'cod' }, esc(n.caminho.replace('NFSe/infNFSe/', '')))
          + el('td', {}, esc(n.texto.length > 60 ? n.texto.slice(0, 60) + '…' : n.texto))
          + el('td', {}, esc(d ? d.tipo : '')) + el('td', {}, esc(d ? d.ocor : ''))
          + el('td', {}, esc(d ? d.tam : ''))
          + el('td', {}, d ? (d.corrigido
            ? el('span', { class: 'tag ajuste' }, 'correção declarada')
            : esc(Base.dados.vigente.toUpperCase()))
            : el('span', { class: 'tag aviso' }, 'fora do mapeamento'))
          + el('td', {}, esc(d ? d.desc.slice(0, 120) : ''))));
      });
    });
    return el('h2', {}, 'Campos conferidos (' + linhas.length + ')')
      + tabela(['Caminho', 'Valor', 'Tipo', 'Ocor.', 'Tam.', 'Origem', 'Descrição'],
        linhas.join(''));
  }

  // ------------------------------------------------------------------
  function reforma(r) {
    var t = el('h2', {}, 'Reforma Tributária — IBS e CBS');
    var s = raiz.NFSe.Motor.IBSCBS_SUSPENSO;
    var nota = el('div', { class: 'achado aviso' },
      el('p', { class: 'achado-msg' }, 'A exigência dos grupos IBSCBS está suspensa')
      + el('p', { class: 'achado-detalhe' }, esc(s.texto))
      + el('p', { class: 'achado-fonte' },
        el('b', {}, 'Fonte: ') + esc(s.desde)
        + ' · previsão de religar a exigência: ' + esc(s.previsao)));

    if (!r.rtc || !r.rtc.presente) {
      return t + nota + el('div', { class: 'achado info' },
        el('p', { class: 'achado-msg' }, 'O documento não traz os grupos IBSCBS.')
        + el('p', { class: 'achado-detalhe' },
          'Isso não é divergência hoje: a nota é autorizada normalmente. A '
          + 'LC 214/2025 segue válida, então o dado precisará existir quando a '
          + 'exigência for religada.'));
    }
    var linhas = r.rtc.pares.map(function (p) {
      return el('tr', { class: p.ok ? '' : 'linha-erro' },
        el('td', { class: 'cod' }, esc(p.cst))
        + el('td', { class: 'cod' }, esc(p.cclasstrib))
        + el('td', {}, esc(p.par ? p.par.desc_cclasstrib : '—'))
        + el('td', {}, esc(p.par ? p.par.lc : ''))
        + el('td', {}, p.ok ? el('span', { class: 'tag ok' }, 'par válido')
          : el('span', { class: 'tag erro' }, 'fora da associação')));
    }).join('');
    return t + nota
      + el('h3', {}, 'Par CST × cClassTrib (' + r.rtc.pares.length + ')')
      + el('p', { class: 'achado-detalhe' },
        'Conferido contra a associação oficial do Anexo VI, que traz '
        + Base.tabela('associacao_cst_cclasstrib').length + ' pares com a base legal.')
      + tabela(['CST', 'cClassTrib', 'Descrição', 'LC 214/2025', 'Situação'], linhas);
  }

  // ------------------------------------------------------------------
  function comparativo(par) {
    var d = Base.dados;
    par = par || 'nt004_nt007';
    var c = d.comparativos[par];
    var opcoes = Object.keys(d.comparativos).map(function (k) {
      var p = k.split('_');
      return el('option', { value: k, selected: k === par ? 'selected' : '' },
        p[0].toUpperCase() + ' → ' + p[1].toUpperCase());
    }).join('');

    var cabecalho = el('h2', {}, 'Comparativo entre versões')
      + el('p', { class: 'achado-detalhe' },
        'Três versões do leiaute convivem, e a mais nova não é a que vale. '
        + 'O que está em Produção é a ' + esc(d.versoes[d.vigente].rotulo)
        + '. Validar contra uma versão futura acusaria erro em nota correta.')
      + el('div', { class: 'linha-dados' },
        Object.keys(d.versoes).map(function (k) {
          var v = d.versoes[k];
          var marca = v.vigente
            ? el('span', { class: 'tag ok' }, 'em Produção')
            : el('span', { class: 'tag' }, v.situacao.replace('_', ' '));
          return el('div', { style: 'min-width:210px' },
            el('span', {}, esc(v.rotulo))
            + el('b', {}, v.leiaute.length + ' campos · '
              + v.regras.length + ' regras ') + marca);
        }).join(''))
      + el('label', { class: 'opcao', style: 'margin:14px 0' },
        el('span', {}, 'Comparar')
        + el('select', { id: 'sel-comparativo' }, opcoes));

    if (!c) return cabecalho + vazio('Comparativo indisponível.');

    function linhasDe(lista, classe) {
      return lista.map(function (x) {
        return el('tr', { class: classe },
          el('td', { class: 'cod' },
            esc((x.caminho || '').replace('NFSe/infNFSe/DPS/infDPS/', '')))
          + el('td', {}, esc(x.ele || '')) + el('td', {}, esc(x.tipo || ''))
          + el('td', {}, esc(x.ocor || '')) + el('td', {}, esc(x.tam || ''))
          + el('td', {}, x.reforma
            ? el('span', { class: 'tag ajuste' }, 'Reforma') : '')
          + el('td', {}, esc((x.desc || '').slice(0, 110))));
      }).join('');
    }

    var alterados = c.alterados.map(function (x) {
      var quais = Object.keys(x.mudou).map(function (campo) {
        return el('span', { class: 'tag' }, campo) + ' '
          + esc(x.mudou[campo][0] || '—') + ' → '
          + el('b', {}, esc(x.mudou[campo][1] || '—'));
      }).join('<br>');
      return el('tr', {},
        el('td', { class: 'cod' },
          esc(x.caminho.replace('NFSe/infNFSe/DPS/infDPS/', '')))
        + el('td', {}, quais) + el('td', {}, esc((x.desc || '').slice(0, 130))));
    }).join('');

    var cabCampos = ['Caminho', 'Ele', 'Tipo', 'Ocor.', 'Tam.', '', 'Descrição'];

    return cabecalho
      + el('div', { class: 'placar' },
        el('div', { class: 'marcador info' },
          el('div', { class: 'n' }, c.em_comum) + el('div', { class: 'r' }, 'em comum'))
        + el('div', { class: 'marcador ok' },
          el('div', { class: 'n' }, c.novos.length) + el('div', { class: 'r' }, 'novos'))
        + el('div', { class: 'marcador erro' },
          el('div', { class: 'n' }, c.retirados.length)
          + el('div', { class: 'r' }, 'retirados'))
        + el('div', { class: 'marcador aviso' },
          el('div', { class: 'n' }, c.alterados.length)
          + el('div', { class: 'r' }, 'definição alterada')))
      + el('h3', {}, 'Definição alterada — é aqui que a integração quebra')
      + (alterados
        ? tabela(['Caminho', 'O que mudou', 'Descrição'], alterados, '340px')
        : vazio('Nenhuma alteração de definição.'))
      + el('h3', { style: 'margin-top:20px' }, 'Campos novos (' + c.novos.length + ')')
      + tabela(cabCampos, linhasDe(c.novos, ''), '400px')
      + el('h3', { style: 'margin-top:20px' },
        'Campos retirados (' + c.retirados.length + ')')
      + tabela(cabCampos, linhasDe(c.retirados, 'linha-erro'), '340px');
  }

  // ------------------------------------------------------------------
  function baseDeDados(filtro) {
    var d = Base.dados;
    var f = (filtro || '').trim().toLowerCase();

    var fontes = (d.fontes && d.fontes.fontes || []).map(function (x) {
      return el('tr', {},
        el('td', {}, esc(x.titulo)) + el('td', { class: 'cod' }, esc(x.arquivo))
        + el('td', {}, esc(x.situacao || ''))
        + el('td', { class: 'cod', title: esc(x.sha256 || '') },
          esc((x.sha256 || '').slice(0, 16) + '…')));
    }).join('');

    var correcoes = d.campos.filter(function (c) { return c.corrigido; });
    var blocoCorrecoes = correcoes.length
      ? el('h3', { style: 'margin-top:20px' },
        'Correções declaradas (' + correcoes.length + ')')
        + el('p', { class: 'achado-detalhe' },
          'Defeitos encontrados nos próprios anexos oficiais, corrigidos com '
          + 'evidência na documentação e registrados um a um.')
        + correcoes.map(function (c) {
          return el('div', { class: 'achado info' },
            el('p', { class: 'achado-msg' },
              el('span', { class: 'tag ajuste' }, 'correção') + ' '
              + esc(c.caminho.replace('NFSe/infNFSe/', '')))
            + el('p', { class: 'achado-detalhe' }, esc(c.corrigido)));
        }).join('')
      : '';

    var cabecalho = el('h2', {}, 'Base de dados')
      + el('p', { class: 'achado-detalhe' },
        'Tudo o que a ferramenta verifica sai daqui. A base é gerada por '
        + '<code>tools/build_db_nfse.py</code> a partir dos anexos oficiais '
        + 'do Comitê Gestor da NFS-e — nenhuma regra é escrita à mão.')
      + tabela(['Documento', 'Arquivo', 'Situação', 'SHA-256'], fontes, '260px')
      + blocoCorrecoes
      + el('h3', { style: 'margin-top:20px' }, 'Consultar')
      + el('input', { class: 'busca', id: 'busca-base', type: 'search',
        value: filtro || '',
        placeholder: 'Buscar campo, regra, código de erro (E0004), CST ou cClassTrib…' });

    if (!f) {
      return cabecalho + vazio('Digite acima para consultar ' + d.campos.length
        + ' campos, ' + d.regras.length + ' regras e as tabelas de domínio.');
    }

    var campos = d.campos.filter(function (c) {
      return (c.caminho + ' ' + c.desc).toLowerCase().indexOf(f) !== -1;
    }).slice(0, 150);
    var regras = d.regras.filter(function (r) {
      return ((r.codigo || '') + ' ' + (r.caminho || '') + ' ' + (r.regra || '')
        + ' ' + (r.msg || '')).toLowerCase().indexOf(f) !== -1;
    }).slice(0, 120);
    var pares = Base.tabela('associacao_cst_cclasstrib').filter(function (p) {
      return (p.cst + ' ' + p.cclasstrib + ' ' + (p.desc_cclasstrib || ''))
        .toLowerCase().indexOf(f) !== -1;
    }).slice(0, 80);

    return cabecalho
      + el('h3', {}, 'Campos (' + campos.length + ')')
      + tabela(['Caminho', 'Ele', 'Tipo', 'Ocor.', 'Tam.', 'Descrição'],
        campos.map(function (c) {
          return el('tr', {},
            el('td', { class: 'cod' }, esc(c.caminho.replace('NFSe/infNFSe/', '')))
            + el('td', {}, esc(c.ele)) + el('td', {}, esc(c.tipo))
            + el('td', {}, esc(c.ocor)) + el('td', {}, esc(c.tam))
            + el('td', {}, esc(c.desc.slice(0, 140))));
        }).join(''), '360px')
      + el('h3', { style: 'margin-top:18px' }, 'Regras (' + regras.length + ')')
      + tabela(['Código', 'Efeito', 'Campo', 'Regra', 'Mensagem de erro'],
        regras.map(function (r) {
          return el('tr', {},
            el('td', { class: 'cod' }, esc(r.codigo))
            + el('td', {}, esc(r.efeito)) + el('td', { class: 'cod' }, esc(r.campo))
            + el('td', {}, esc((r.regra || '').slice(0, 220)))
            + el('td', {}, esc(r.msg)));
        }).join(''), '360px')
      + (pares.length
        ? el('h3', { style: 'margin-top:18px' },
          'Associação CST × cClassTrib (' + pares.length + ')')
          + tabela(['CST', 'Descrição do CST', 'cClassTrib', 'Descrição', 'LC'],
            pares.map(function (p) {
              return el('tr', {},
                el('td', { class: 'cod' }, esc(p.cst))
                + el('td', {}, esc((p.desc_cst || '').slice(0, 70)))
                + el('td', { class: 'cod' }, esc(p.cclasstrib))
                + el('td', {}, esc((p.desc_cclasstrib || '').slice(0, 90)))
                + el('td', {}, esc(p.lc || '')));
            }).join(''), '320px')
        : '');
  }

  raiz.NFSe.Relatorio = {
    placar: placar, resumo: resumo, achados: achados, campos: campos,
    reforma: reforma, comparativo: comparativo, baseDeDados: baseDeDados,
    esc: esc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.NFSe.Relatorio;
})(typeof globalThis !== 'undefined' ? globalThis : this);
