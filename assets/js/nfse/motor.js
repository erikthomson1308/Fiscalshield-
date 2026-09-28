/* Motor de validacao da NFS-e nacional (DPS e NFS-e).
 *
 * Confere o XML contra o leiaute e as regras de negocio dos anexos oficiais
 * do Comite Gestor. Cada apontamento cita o codigo de erro (E####) e a
 * mensagem que o Ambiente de Dados Nacional devolveria.
 *
 * Duas particularidades desta validacao, que nao existem na NF-e:
 *
 * 1. O documento pode ser uma DPS (o que o contribuinte envia) ou uma NFS-e
 *    (o que o Ambiente Nacional devolve). Os caminhos do leiaute sao
 *    ancorados em NFSe/infNFSe, entao uma DPS avulsa precisa do prefixo.
 *
 * 2. A obrigatoriedade dos grupos IBSCBS esta suspensa. Tratar campo ausente
 *    como nao conformidade hoje seria acusar erro em nota correta.
 */
(function (raiz) {
  'use strict';

  raiz.NFSe = raiz.NFSe || {};

  var Base = raiz.NFSe.Base;
  var Leitor = raiz.Leitor;

  var PREFIXO_DPS = 'NFSe/infNFSe/DPS';
  var FORA_DO_ESCOPO = { Signature: 1 };

  // NT 004 v2.0 desligou a obrigatoriedade dos grupos IBSCBS em Producao e
  // Producao Restrita. Ha previsao de religar; ate la, ausencia e informacao.
  var IBSCBS_SUSPENSO = {
    suspenso: true,
    desde: 'NT 004 versão 2.0, publicada em 10/12/2025',
    previsao: '03/08/2026',
    texto: 'A obrigatoriedade dos grupos IBSCBS está suspensa em Produção e '
      + 'Produção Restrita. Documentos sem esses grupos são autorizados e '
      + 'recepcionados normalmente pelo Ambiente de Dados Nacional.'
  };

  function Coletor() { this.itens = []; this.conferidos = 0; }
  Coletor.prototype.add = function (o) {
    this.itens.push({
      nivel: o.nivel, grupo: o.grupo, alvo: o.alvo || '', linha: o.linha || 0,
      titulo: o.titulo, detalhe: o.detalhe || '',
      esperado: o.esperado === undefined ? '' : String(o.esperado),
      obtido: o.obtido === undefined ? '' : String(o.obtido),
      fonte: o.fonte || '', regra: o.regra || null
    });
  };

  function citaRegra(codigo) {
    var r = Base.regra(codigo);
    if (!r) return { fonte: 'Regra ' + codigo, regra: null };
    return {
      fonte: 'Regra ' + r.codigo + (r.efeito ? ' — ' + r.efeito : ''),
      regra: r
    };
  }

  function primeiraRegra(caminho) {
    var rs = Base.regrasDe(caminho);
    return rs.length ? rs[0] : null;
  }

  // ------------------------------------------------------------------
  function dvCNPJ(base12) {
    function calc(seq, pesos) {
      var s = 0;
      for (var i = 0; i < seq.length; i++) s += +seq.charAt(i) * pesos[i];
      var r = s % 11;
      return r < 2 ? 0 : 11 - r;
    }
    var d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return '' + d1 + calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  }
  function cnpjValido(v) {
    return /^\d{14}$/.test(v) && !/^(\d)\1{13}$/.test(v)
      && dvCNPJ(v.slice(0, 12)) === v.slice(12);
  }
  function cpfValido(v) {
    if (!/^\d{11}$/.test(v) || /^(\d)\1{10}$/.test(v)) return false;
    function calc(n) {
      var s = 0;
      for (var i = 0; i < n; i++) s += +v.charAt(i) * (n + 1 - i);
      var r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    }
    return calc(9) === +v.charAt(9) && calc(10) === +v.charAt(10);
  }

  // ------------------------------------------------------------------
  // conteudo de um campo
  // ------------------------------------------------------------------
  function confereValor(no, def, col) {
    if (no.filhos.length) return;
    if (def.ele === 'G' || def.ele === 'Raiz') return;

    var v = no.texto;
    var regra = primeiraRegra(def.caminho);

    if (v === '') {
      col.add({
        nivel: 'erro', grupo: 'Conteúdo', alvo: no.caminho, linha: no.linha,
        titulo: 'Campo presente mas vazio',
        detalhe: def.desc, fonte: 'Leiaute ' + Base.dados.vigente.toUpperCase(),
        regra: regra
      });
      return;
    }

    if (def.tipo === 'N' && !/^-?\d+(\.\d+)?$/.test(v)) {
      col.add({
        nivel: 'erro', grupo: 'Tipo', alvo: no.caminho, linha: no.linha,
        titulo: 'Valor não numérico em campo numérico',
        esperado: 'apenas dígitos, separador decimal ponto', obtido: v,
        detalhe: def.desc, fonte: 'Leiaute', regra: regra
      });
      return;
    }
    if (def.tipo === 'D') {
      var ok = /^\d{4}-\d{2}-\d{2}$/.test(v)
        || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([-+]\d{2}:\d{2}|Z)?$/.test(v)
        || /^\d{4}-\d{2}$/.test(v);
      if (!ok) {
        col.add({
          nivel: 'erro', grupo: 'Tipo', alvo: no.caminho, linha: no.linha,
          titulo: 'Data fora do formato', obtido: v,
          esperado: 'AAAA-MM-DD, AAAA-MM ou AAAA-MM-DDThh:mm:ssTZD',
          detalhe: def.desc, fonte: 'Leiaute', regra: regra
        });
      }
    }

    var t = Base.tamanho(def.tam);
    if (t) {
      // Nos anexos da NFS-e um numero solto em Tam. e o maximo, nao o exato:
      // xNome com 150 nao significa preencher 150 caracteres. O tamanho fixo
      // de identificadores e codigos e conferido pela composicao declarada e
      // pelas regras de negocio, que e onde esse conhecimento mora.
      if (t.tipo === 'fixo' && v.length > t.n) {
        col.add({
          nivel: 'erro', grupo: 'Tamanho', alvo: no.caminho, linha: no.linha,
          titulo: 'Valor acima do tamanho previsto',
          esperado: 'até ' + t.n + ' caracteres',
          obtido: v.length + ' caracteres',
          detalhe: v.slice(0, 80), fonte: 'Leiaute', regra: regra
        });
      } else if (t.tipo === 'faixa' && (v.length < t.min || v.length > t.max)) {
        col.add({
          nivel: 'erro', grupo: 'Tamanho', alvo: no.caminho, linha: no.linha,
          titulo: 'Tamanho fora da faixa prevista',
          esperado: 'de ' + t.min + ' a ' + t.max + ' caracteres',
          obtido: v.length + ' caracteres', detalhe: v.slice(0, 80),
          fonte: 'Leiaute', regra: regra
        });
      } else if (t.tipo === 'decimal') {
        var p = v.split('.');
        var dec = p[1] ? p[1].length : 0;
        if (p[0].replace('-', '').length > t.intMax) {
          col.add({
            nivel: 'erro', grupo: 'Tamanho', alvo: no.caminho, linha: no.linha,
            titulo: 'Parte inteira acima do previsto',
            esperado: 'até ' + t.intMax + ' dígitos', obtido: v,
            fonte: 'Leiaute', regra: regra
          });
        }
        if (dec > t.decMax) {
          col.add({
            nivel: 'erro', grupo: 'Casas decimais', alvo: no.caminho,
            linha: no.linha, titulo: 'Casas decimais acima do previsto',
            esperado: 'até ' + t.decMax + ' casas (' + t.bruto + ')',
            obtido: dec + ' casas', detalhe: v, fonte: 'Leiaute', regra: regra
          });
        }
      }
    }
    col.conferidos++;
  }

  // ------------------------------------------------------------------
  function confereFilhos(no, col, opcoes) {
    var previstos = Base.previstos(no.caminho);
    if (!previstos.length) return;

    var contagem = Object.create(null);
    no.filhos.forEach(function (f) {
      contagem[f.nome] = (contagem[f.nome] || 0) + 1;
    });

    // Conjuntos de escolha. O leiaute da NFS-e usa CE para elemento
    // alternativo (CNPJ ou CPF ou NIF do prestador) e CG para grupo
    // alternativo (endereco nacional ou no exterior). Todos os membros vem
    // marcados 1-1, mas so um deve aparecer - exigir cada um deles
    // individualmente acusaria erro em qualquer nota correta.
    var emEscolha = Object.create(null);
    ['CE', 'CG'].forEach(function (marca) {
      var alt = previstos.filter(function (d) { return d.ele === marca; });
      if (alt.length < 2) return;
      alt.forEach(function (d) { emEscolha[d.tag] = true; });

      var usados = alt.filter(function (d) { return contagem[d.tag]; });
      var exigido = alt.some(function (d) {
        return Base.ocorrencia(d.ocor).min >= 1;
      });
      var rotulo = marca === 'CE' ? 'campos' : 'grupos';

      if (usados.length > 1) {
        col.add({
          nivel: 'erro', grupo: 'Estrutura', alvo: no.caminho, linha: no.linha,
          titulo: 'Mais de uma alternativa informada',
          detalhe: 'Em <' + no.nome + '> o leiaute admite apenas um destes '
            + rotulo + '.',
          esperado: alt.map(function (d) { return d.tag; }).join(' ou '),
          obtido: usados.map(function (d) { return d.tag; }).join(' e '),
          fonte: 'Leiaute — elementos marcados como ' + marca
        });
      } else if (usados.length === 0 && exigido) {
        col.add({
          nivel: 'erro', grupo: 'Obrigatório', alvo: no.caminho,
          linha: no.linha,
          titulo: 'Nenhuma das alternativas obrigatórias foi informada',
          esperado: alt.map(function (d) { return d.tag; }).join(' ou '),
          obtido: 'ausente',
          fonte: 'Leiaute — elementos marcados como ' + marca,
          regra: primeiraRegra(alt[0].caminho)
        });
      }
    });

    previstos.forEach(function (d) {
      if (d.ele === 'A' || d.ele === 'ID') return;
      if (emEscolha[d.tag]) return;
      if (FORA_DO_ESCOPO[d.tag]) return;
      var oc = Base.ocorrencia(d.ocor);
      var n = contagem[d.tag] || 0;

      if (n === 0 && oc.min >= 1) {
        var dentroIbscbs = d.caminho.indexOf('/IBSCBS') !== -1;
        if (dentroIbscbs && IBSCBS_SUSPENSO.suspenso
            && !no.caminho.match(/IBSCBS/)) return;

        col.add({
          nivel: 'erro', grupo: 'Obrigatório',
          alvo: no.caminho + '/' + d.tag, linha: no.linha,
          titulo: 'Campo obrigatório ausente',
          detalhe: d.desc, esperado: 'ocorrência ' + oc.bruto, obtido: 'ausente',
          fonte: 'Leiaute ' + Base.dados.vigente.toUpperCase(),
          regra: primeiraRegra(d.caminho)
        });
      } else if (n > oc.max) {
        col.add({
          nivel: 'erro', grupo: 'Ocorrência',
          alvo: no.caminho + '/' + d.tag, linha: no.linha,
          titulo: 'Elemento repetido acima do permitido',
          esperado: 'até ' + oc.max, obtido: n + ' ocorrências',
          detalhe: d.desc, fonte: 'Leiaute', regra: primeiraRegra(d.caminho)
        });
      }
    });

    if (opcoes.ordem !== 'ignora') {
      var ultima = -1, quebrou = null;
      for (var k = 0; k < no.filhos.length; k++) {
        var d = Base.campo(no.filhos[k].caminho);
        if (!d || d.posicao === undefined) continue;
        if (d.posicao < ultima) { quebrou = no.filhos[k]; break; }
        ultima = d.posicao;
      }
      if (quebrou) {
        col.add({
          nivel: opcoes.ordem === 'erro' ? 'erro' : 'aviso',
          grupo: 'Ordem', alvo: quebrou.caminho, linha: quebrou.linha,
          titulo: 'Elemento fora da ordem do leiaute',
          esperado: previstos.map(function (x) { return x.tag; }).join(' → '),
          obtido: no.filhos.map(function (x) { return x.nome; }).join(' → '),
          detalhe: 'O schema exige a sequência definida no leiaute.',
          fonte: 'Leiaute'
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // identificador da DPS: "DPS" + cMun(7) + tpInsc(1) + insc(14) + serie(5)
  //                       + nDPS(15) = 45 posicoes
  // ------------------------------------------------------------------
  function confereIdDPS(infDPS, col) {
    var id = infDPS.atributos.Id || infDPS.atributos.id || '';
    var cit = citaRegra('E0004');

    if (!id) {
      col.add({
        nivel: 'erro', grupo: 'Identificador', alvo: infDPS.caminho + '@Id',
        linha: infDPS.linha, titulo: 'Atributo Id ausente em infDPS',
        fonte: cit.fonte, regra: cit.regra
      });
      return null;
    }
    if (!/^DPS\d{42}$/.test(id)) {
      col.add({
        nivel: 'erro', grupo: 'Identificador', alvo: infDPS.caminho + '@Id',
        linha: infDPS.linha, titulo: 'Identificador da DPS fora do formato',
        esperado: 'literal "DPS" seguido de 42 dígitos (45 no total)',
        obtido: id + ' (' + id.length + ' caracteres)',
        fonte: cit.fonte, regra: cit.regra
      });
      return null;
    }

    var partes = {
      cMun: id.slice(3, 10),
      tpInsc: id.slice(10, 11),
      insc: id.slice(11, 25),
      serie: id.slice(25, 30),
      nDPS: id.slice(30, 45)
    };

    var prest = Leitor.acha(infDPS, 'prest');
    var cnpj = prest ? Leitor.valor(prest, 'CNPJ') : '';
    var cpf = prest ? Leitor.valor(prest, 'CPF') : '';

    function compara(rotulo, doXml, daChave) {
      if (!doXml) return;
      if (String(parseInt(doXml, 10)) !== String(parseInt(daChave, 10))) {
        col.add({
          nivel: 'erro', grupo: 'Identificador', alvo: infDPS.caminho + '@Id',
          linha: infDPS.linha,
          titulo: 'Identificador da DPS não confere com ' + rotulo,
          esperado: rotulo + ' = ' + doXml, obtido: 'no Id = ' + daChave,
          detalhe: 'As 42 posições do identificador são formadas pelos '
            + 'próprios dados da DPS.',
          fonte: cit.fonte, regra: cit.regra
        });
      }
    }

    compara('cLocEmi', Leitor.valor(infDPS, 'cLocEmi'), partes.cMun);
    compara('serie', Leitor.valor(infDPS, 'serie'), partes.serie);
    compara('nDPS', Leitor.valor(infDPS, 'nDPS'), partes.nDPS);

    if (cnpj) {
      if (partes.tpInsc !== '2') {
        col.add({
          nivel: 'erro', grupo: 'Identificador', alvo: infDPS.caminho + '@Id',
          linha: infDPS.linha,
          titulo: 'Tipo de inscrição federal no Id não corresponde ao emitente',
          esperado: '2, pois o prestador informou CNPJ', obtido: partes.tpInsc,
          fonte: cit.fonte, regra: cit.regra
        });
      }
      compara('CNPJ do prestador', cnpj, partes.insc);
    } else if (cpf) {
      if (partes.tpInsc !== '1') {
        col.add({
          nivel: 'erro', grupo: 'Identificador', alvo: infDPS.caminho + '@Id',
          linha: infDPS.linha,
          titulo: 'Tipo de inscrição federal no Id não corresponde ao emitente',
          esperado: '1, pois o prestador informou CPF', obtido: partes.tpInsc,
          fonte: cit.fonte, regra: cit.regra
        });
      }
      compara('CPF do prestador', cpf, partes.insc);
    }

    return partes;
  }

  // ------------------------------------------------------------------
  // Roteamento: a primeira pergunta de qualquer erro de NFS-e.
  //
  // Antes de olhar o que tem dentro do documento, vale perguntar para onde
  // ele foi. O padrao nacional so se aplica a municipio aderente ao Emissor
  // Nacional - e hoje cerca de metade dos municipios brasileiros nao e.
  //
  // Uma DPS gerada para municipio nao aderente chega ao destino errado e
  // costuma vir com campos zerados. Quem olha so o conteudo conclui que o
  // sistema de origem nao transmitiu o dado, e vai corrigir onde nada esta
  // quebrado. A causa e roteamento, nao payload.
  // ------------------------------------------------------------------
  function confereRoteamento(infDPS, tipoDoc, col) {
    var cLocEmi = Leitor.valor(infDPS, 'cLocEmi');
    var fonte = Base.fonteMunicipios();
    var rodape = fonte
      ? 'Lista de adesão publicada em ' + (fonte.arquivo || '')
        + (fonte.ultima_atualizacao_na_planilha
          ? ', atualizada em ' + fonte.ultima_atualizacao_na_planilha : '')
        + '. A adesão muda; a relação corrente está no painel oficial.'
      : 'Relação de municípios aderentes não carregada.';

    if (!cLocEmi) return null;
    if (!Base.dados.municipios) {
      col.add({
        nivel: 'aviso', grupo: 'Roteamento',
        alvo: infDPS.caminho + '/cLocEmi', linha: infDPS.linha,
        titulo: 'Adesão do município não verificada',
        detalhe: 'A relação de municípios aderentes não está carregada, '
          + 'então não foi possível conferir se o padrão nacional se aplica '
          + 'a este município.',
        obtido: cLocEmi, fonte: rodape
      });
      return null;
    }

    var m = Base.municipio(cLocEmi);
    if (!m) {
      var c37 = citaRegra('E0037');
      col.add({
        nivel: 'erro', grupo: 'Roteamento',
        alvo: infDPS.caminho + '/cLocEmi', linha: infDPS.linha,
        titulo: 'Município emissor não consta na relação oficial',
        detalhe: 'O código informado não foi encontrado entre os '
          + Object.keys(Base.dados.municipios.municipios).length
          + ' municípios da relação, que cobre toda a tabela do IBGE. '
          + 'Confira o código IBGE de sete dígitos.',
        obtido: cLocEmi, fonte: c37.fonte + ' · ' + rodape, regra: c37.regra
      });
      return null;
    }

    var onde = m.nome + '/' + m.uf;
    var data = dataReferencia(infDPS);
    var sit = situacaoEmissor(m, data);
    var aderenteEmissor = sit.aderente;
    var aderenteAmbiente = /^s/i.test(m.ambienteNacional || '');
    // MEI emite sempre pelo padrao nacional: as regras de convenio e de
    // parametrizacao do municipio (E0016, E0037, E0038, E0039) o excetuam
    var mei = Leitor.valor(Leitor.acha(infDPS, 'regTrib') || infDPS,
      'opSimpNac') === '2';
    var ajusteTxt = m.ajuste
      ? ' Ajuste declarado: Emissor Nacional desde '
        + dataBR(m.ajuste.emissorNacionalDesde) + ' — ' + m.ajuste.fonte
        + (m.ajuste.url ? ' (' + m.ajuste.url + ')' : '') + '.'
      : '';

    if (tipoDoc === 'DPS' && !mei && !/^conveniado ativo/i.test(m.convenio || '')) {
      var c38 = citaRegra('E0038');
      col.add({
        nivel: 'erro', grupo: 'Roteamento',
        alvo: infDPS.caminho + '/cLocEmi', linha: infDPS.linha,
        titulo: 'Convênio do município emissor não está ativo',
        detalhe: onde + ' consta como "' + (m.convenio || '—') + '" na relação '
          + 'oficial. O Sistema Nacional só recebe DPS de município com '
          + 'convênio ativo.',
        esperado: 'Conveniado Ativo', obtido: m.convenio || '—',
        fonte: c38.fonte + ' · ' + rodape, regra: c38.regra
      });
    }

    if (tipoDoc === 'DPS' && !aderenteEmissor && !mei) {
      var c39 = citaRegra('E0039');
      col.add({
        nivel: 'erro', grupo: 'Roteamento',
        alvo: infDPS.caminho + '/cLocEmi', linha: infDPS.linha,
        titulo: 'Município não é aderente ao Emissor Nacional — '
          + 'este documento não deveria ser uma DPS',
        detalhe: onde + (sit.porAjuste
          ? ' só passou a usar o Emissor Nacional em '
            + dataBR(m.ajuste.emissorNacionalDesde) + ', e esta DPS é de '
            + dataBR(data) + '. Nessa data o município ainda usava sistema '
            + 'próprio'
          : ' consta como não aderente ao Emissor Nacional')
          + (aderenteAmbiente
            ? ', embora receba documentos no Ambiente Nacional. Ou seja: o '
              + 'município mantém emissor próprio e compartilha a NFS-e '
              + 'depois. O documento deveria ter seguido como RPS para o '
              + 'webservice da prefeitura.'
            : ' nem ao Ambiente Nacional. O documento deveria ter seguido '
              + 'para o webservice da própria prefeitura.')
          + ' Campo zerado numa DPS assim é consequência da conversão '
          + 'indevida, não falta de dado no sistema de origem — a correção '
          + 'é de roteamento e parametrização, não de conteúdo.' + ajusteTxt,
        esperado: 'município aderente ao Emissor Nacional na data da DPS',
        obtido: onde + ' em ' + dataBR(data) + ' — Emissor Nacional: '
          + (sit.porAjuste ? 'ainda não (troca em '
            + dataBR(m.ajuste.emissorNacionalDesde) + ')'
            : (m.emissorNacional || '—'))
          + ', Ambiente Nacional: ' + (m.ambienteNacional || '—'),
        fonte: c39.fonte + ' · ' + rodape, regra: c39.regra
      });
    } else if (tipoDoc === 'DPS' && sit.porAjuste) {
      col.add({
        nivel: 'info', grupo: 'Roteamento',
        alvo: infDPS.caminho + '/cLocEmi', linha: infDPS.linha,
        titulo: 'Município aderente por ajuste declarado',
        detalhe: 'A planilha oficial ainda traz ' + onde + ' como não aderente, '
          + 'mas o município usa o Emissor Nacional desde '
          + dataBR(m.ajuste.emissorNacionalDesde) + '. Para uma DPS de '
          + dataBR(data) + ', enviar à SEFIN Nacional é o roteamento certo.'
          + ajusteTxt,
        fonte: m.ajuste.fonte
      });
    } else if (tipoDoc === 'NFS-e' && !aderenteAmbiente) {
      col.add({
        nivel: 'erro', grupo: 'Roteamento',
        alvo: infDPS.caminho + '/cLocEmi', linha: infDPS.linha,
        titulo: 'Município não é aderente ao Ambiente Nacional',
        detalhe: onde + ' não consta como aderente ao Ambiente Nacional, '
          + 'então não compartilha NFS-e no padrão nacional.',
        obtido: onde, fonte: rodape
      });
    }

    // a adesao tem data: documento anterior a ela nao seria aceito
    var compet = Leitor.valor(infDPS, 'dCompet');
    var mIni = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(m.inicioVigencia || '');
    if (compet && mIni && /^\d{4}-\d{2}/.test(compet) && !mei) {
      var inicio = mIni[3] + '-' + mIni[2] + '-' + mIni[1];
      var cmp = compet.length === 7 ? compet + '-31' : compet.slice(0, 10);
      if (cmp < inicio) {
        var c16 = citaRegra('E0016');
        col.add({
          nivel: 'erro', grupo: 'Roteamento',
          alvo: infDPS.caminho + '/dCompet', linha: infDPS.linha,
          titulo: 'Competência anterior ao início do convênio do município',
          detalhe: onde + ' tem convênio vigente desde ' + m.inicioVigencia
            + '. Documento com competência anterior a essa data não é '
            + 'aceito no padrão nacional.',
          esperado: 'competência a partir de ' + m.inicioVigencia,
          obtido: compet, fonte: c16.fonte + ' · ' + rodape, regra: c16.regra
        });
      }
    }

    return {
      codigo: cLocEmi, nome: m.nome, uf: m.uf,
      emissorNacional: m.emissorNacional,
      ambienteNacional: m.ambienteNacional,
      convenio: m.convenio, inicioVigencia: m.inicioVigencia,
      aderente: aderenteEmissor, dataReferencia: data,
      ajuste: m.ajuste || null, mei: mei, fonte: fonte
    };
  }

  /** Data que decide a adesao: a de emissao da DPS; na falta, a competencia. */
  function dataReferencia(infDPS) {
    var dh = Leitor.valor(infDPS, 'dhEmi');
    if (/^\d{4}-\d{2}-\d{2}/.test(dh)) return dh.slice(0, 10);
    var c = Leitor.valor(infDPS, 'dCompet');
    if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return c;
    if (/^\d{4}-\d{2}$/.test(c)) return c + '-01';
    return new Date().toISOString().slice(0, 10);
  }

  /** Adesao ao Emissor Nacional na data dada, considerando o ajuste
   *  declarado quando a planilha oficial ainda nao reflete a troca. */
  function situacaoEmissor(m, data) {
    var lista = /^s/i.test(m.emissorNacional || '');
    var a = m.ajuste;
    if (!a || !a.emissorNacionalDesde) return { aderente: lista, porAjuste: false };
    return { aderente: data >= a.emissorNacionalDesde, porAjuste: true };
  }

  function dataBR(iso) {
    var p = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return p ? p[3] + '/' + p[2] + '/' + p[1] : (iso || '—');
  }

  // ------------------------------------------------------------------
  var REGRA_DV = [
    [/\/infDPS\/prest\/CNPJ$/, 'E0080'], [/\/infDPS\/prest\/CPF$/, 'E0096'],
    [/\/infDPS\/toma\/CNPJ$/, 'E0188'], [/\/infDPS\/toma\/CPF$/, 'E0206'],
    [/\/infDPS\/interm\/CNPJ$/, 'E0248'], [/\/infDPS\/interm\/CPF$/, 'E0266'],
    [/\/docDedRed\/fornec\/CNPJ$/, 'E0478'], [/\/docDedRed\/fornec\/CPF$/, 'E0484'],
    [/\/IBSCBS\/dest\/CNPJ$/, 'E0911'], [/\/IBSCBS\/dest\/CPF$/, 'E0913'],
    [/\/gReeRepRes\/documentos\/fornec\/CNPJ$/, 'E0945'],
    [/\/gReeRepRes\/documentos\/fornec\/CPF$/, 'E0947']
  ];
  function regraDV(caminho) {
    for (var i = 0; i < REGRA_DV.length; i++) {
      if (REGRA_DV[i][0].test(caminho)) return citaRegra(REGRA_DV[i][1]);
    }
    return { fonte: 'Cálculo de dígito verificador — Receita Federal', regra: null };
  }

  function confereCadastro(raizNo, col) {
    Leitor.percorre(raizNo, function (no) {
      if (no.filhos.length || !no.texto) return;
      if (no.nome === 'CNPJ' && !cnpjValido(no.texto)) {
        var c1 = regraDV(no.caminho);
        col.add({
          nivel: 'erro', grupo: 'Cadastro', alvo: no.caminho, linha: no.linha,
          titulo: 'CNPJ com dígito verificador inválido', obtido: no.texto,
          fonte: c1.fonte, regra: c1.regra
        });
      }
      if (no.nome === 'CPF' && !cpfValido(no.texto)) {
        var c2 = regraDV(no.caminho);
        col.add({
          nivel: 'erro', grupo: 'Cadastro', alvo: no.caminho, linha: no.linha,
          titulo: 'CPF com dígito verificador inválido', obtido: no.texto,
          fonte: c2.fonte, regra: c2.regra
        });
      }
    });
  }

  // ------------------------------------------------------------------
  // Regras de negocio do Anexo VI que se decidem so com o XML.
  //
  // Das regras do Comite Gestor, parte depende de consulta que so o Sistema
  // Nacional faz (cadastro CNPJ, CNC municipal, parametrizacao de aliquota e
  // de beneficio, NFS-e ja emitida). Essas nao entram: afirmar o resultado
  // delas daqui seria inventar. As que entram abaixo sao as que o proprio
  // documento responde - coerencia entre campos, datas, faixas e calculos -
  // e cada uma cita o codigo que a SEFIN Nacional devolveria.
  // ------------------------------------------------------------------
  var OBRA = ['070201', '070202', '070401', '070501', '070502', '070601',
    '070602', '070701', '070801', '071701', '071901'];
  var INDOP_EXIGE_TOMADOR = ['030102', '050102', '100101', '100301', '100501',
    '030103', '050103', '100102', '100201', '100302', '100401', '100502',
    '100601'];
  var INDOP_IMOVEL = ['020101', '020201', '020301'];
  var TPOPER_SERVICOS = ['2505', '1509', '1712', '1005'];
  var PISCOFINS_SEM_BASE = ['00', '08', '09'];

  function noRel(d, rel) {
    var n = d, p = rel.split('/');
    for (var i = 0; i < p.length && n; i++) n = Leitor.filho(n, p[i]);
    return n || null;
  }
  function valRel(d, rel) {
    var n = noRel(d, rel);
    return n && !n.filhos.length ? n.texto : '';
  }
  function numero(s) {
    return s === '' || s == null || isNaN(+s) ? null : +s;
  }
  function emailValido(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s); }

  function confereRegrasNegocio(d, col) {
    var disparadas = 0;
    var conferidas = Object.create(null);

    function aponta(codigo, rel, titulo, esperado, obtido) {
      var r = Base.regra(codigo);
      var n = noRel(d, rel);
      disparadas++;
      col.add({
        nivel: 'erro', grupo: 'Regra de negócio',
        alvo: d.caminho + '/' + rel, linha: n ? n.linha : d.linha,
        titulo: titulo, detalhe: r ? (r.msg || r.regra) : '',
        esperado: esperado, obtido: obtido,
        fonte: 'Regra ' + codigo + (r && r.efeito ? ' — ' + r.efeito : ''),
        regra: r
      });
    }
    function regra(codigo, falhou, rel, titulo, esperado, obtido) {
      conferidas[codigo] = true;
      if (falhou) aponta(codigo, rel, titulo, esperado, obtido);
    }
    function tem(rel) { return !!noRel(d, rel); }
    function v(rel) { return valRel(d, rel); }

    var tpEmit = v('tpEmit');
    var opSN = v('prest/regTrib/opSimpNac');
    var regAp = v('prest/regTrib/regApTribSN');
    var regEsp = v('prest/regTrib/regEspTrib');
    var trib = v('valores/trib/tribMun/tribISSQN');
    var ret = v('valores/trib/tribMun/tpRetISSQN');
    var vServ = numero(v('valores/vServPrest/vServ'));
    var cTribNac = v('serv/cServ/cTribNac');
    var semIncidencia = ['2', '3', '4'].indexOf(trib) !== -1;
    var mei = opSN === '2';
    var regEspecial = regEsp !== '' && regEsp !== '0';
    var retido = ret === '2' || ret === '3';
    var dhEmi = v('dhEmi');
    var compet = v('dCompet');

    // ---- datas
    if (/^\d{4}-\d{2}-\d{2}/.test(dhEmi) && /^\d{4}-\d{2}(-\d{2})?$/.test(compet)) {
      var emi = dhEmi.slice(0, compet.length);
      regra('E0015', compet > emi, 'dCompet',
        'Competência posterior à data de emissão da DPS',
        'até ' + dhEmi.slice(0, 10), compet);
    }

    // ---- emitente
    regra('E9996', tpEmit === '2' || tpEmit === '3', 'tpEmit',
      'DPS emitida por tomador ou intermediário', '1 - Prestador', tpEmit);
    regra('E0029', tpEmit === '1' && tem('cMotivoEmisTI'), 'cMotivoEmisTI',
      'Motivo de emissão por tomador/intermediário informado com prestador emitente',
      'ausente quando tpEmit = 1', v('cMotivoEmisTI'));
    regra('E0034', tem('chNFSeRej')
      && !((tpEmit === '2' || tpEmit === '3') && v('cMotivoEmisTI') === '4'),
      'chNFSeRej', 'Chave de NFS-e rejeitada informada fora da situação prevista',
      'somente com tpEmit 2 ou 3 e cMotivoEmisTI = 4',
      'tpEmit ' + tpEmit + ', cMotivoEmisTI ' + (v('cMotivoEmisTI') || '—'));

    regra('E0112', tpEmit === '1' && tem('prest/NIF'), 'prest/NIF',
      'NIF do prestador informado com prestador emitente', 'ausente', v('prest/NIF'));
    regra('E0114', tpEmit === '1' && tem('prest/cNaoNIF'), 'prest/cNaoNIF',
      'cNaoNIF do prestador informado com prestador emitente', 'ausente',
      v('prest/cNaoNIF'));
    regra('E0121', tpEmit === '1' && tem('prest/xNome'), 'prest/xNome',
      'Nome do prestador informado com prestador emitente',
      'ausente — o Sistema Nacional usa o cadastro', v('prest/xNome'));
    regra('E0122', (tpEmit === '2' || tpEmit === '3') && !v('prest/xNome'),
      'prest/xNome', 'Nome do prestador ausente com tomador/intermediário emitente',
      'informado', 'ausente');
    regra('E0128', tpEmit === '1' && tem('prest/end'), 'prest/end',
      'Endereço do prestador informado com prestador emitente',
      'ausente — o Sistema Nacional usa o cadastro', 'informado');
    regra('E0129', (tpEmit === '2' || tpEmit === '3') && !tem('prest/end'),
      'prest/end', 'Endereço do prestador ausente com tomador/intermediário emitente',
      'informado', 'ausente');

    [['prest', 'E0115', 'E0123', 'E0148'], ['toma', 'E0226', 'E0233', 'E0247'],
      ['interm', 'E0286', 'E0292', 'E0300']].forEach(function (p) {
      var g = p[0];
      if (!tem(g)) return;
      regra(p[1], v(g + '/cNaoNIF') === '0', g + '/cNaoNIF',
        'cNaoNIF = 0 não é aceito na emissão', '1 ou 2', '0');
      regra(p[2], tem(g + '/NIF') && !v(g + '/xNome'), g + '/xNome',
        'Nome obrigatório quando o NIF é informado', 'informado', 'ausente');
      if (v(g + '/email')) {
        regra(p[3], !emailValido(v(g + '/email')), g + '/email',
          'E-mail fora do formato', 'nome@dominio.ext', v(g + '/email'));
      }
    });

    var raizPrest = v('prest/CNPJ').slice(0, 8);
    regra('E0202', raizPrest && v('toma/CNPJ').slice(0, 8) === raizPrest,
      'toma/CNPJ', 'Tomador com a mesma raiz de CNPJ do prestador',
      'raiz diferente de ' + raizPrest, v('toma/CNPJ'));
    regra('E0262', raizPrest && v('interm/CNPJ').slice(0, 8) === raizPrest,
      'interm/CNPJ', 'Intermediário com a mesma raiz de CNPJ do prestador',
      'raiz diferente de ' + raizPrest, v('interm/CNPJ'));

    // ---- regime de tributacao do prestador
    regra('E0162', !!regAp && (opSN === '1' || opSN === '2'),
      'prest/regTrib/regApTribSN',
      'Regime de apuração do Simples informado para não optante ou MEI',
      'ausente quando opSimpNac = 1 ou 2', regAp);
    regra('E0166', opSN === '3' && !regAp, 'prest/regTrib/regApTribSN',
      'Regime de apuração do Simples ausente para ME/EPP', 'informado', 'ausente');
    regra('E0172', semIncidencia && regEspecial, 'prest/regTrib/regEspTrib',
      'Regime especial informado em serviço imune, exportado ou sem incidência',
      '0 - Nenhum', regEsp);
    regra('E0174', mei && regEspecial, 'prest/regTrib/regEspTrib',
      'Regime especial informado para MEI', '0 - Nenhum', regEsp);
    regra('E0175', opSN === '3' && regAp === '1' && regEspecial,
      'prest/regTrib/regEspTrib',
      'Regime especial informado para ME/EPP que apura pelo Simples',
      '0 - Nenhum', regEsp);

    // ---- tomador e intermediario
    var cIndOp = v('IBSCBS/cIndOp');
    regra('E0187', INDOP_EXIGE_TOMADOR.indexOf(cIndOp) !== -1 && !tem('toma'),
      'toma', 'Tomador ausente para o indicador de operação informado',
      'grupo toma informado', 'ausente (cIndOp ' + cIndOp + ')');
    regra('E0234', INDOP_EXIGE_TOMADOR.indexOf(cIndOp) !== -1 && tem('toma')
      && !tem('toma/end'), 'toma/end',
      'Endereço do tomador ausente para o indicador de operação informado',
      'informado', 'ausente (cIndOp ' + cIndOp + ')');
    regra('E0204', ret === '2' && !v('toma/CNPJ') && !v('toma/CPF'), 'toma',
      'Retenção pelo tomador sem tomador identificado por CNPJ ou CPF',
      'CNPJ ou CPF do tomador', 'ausente');
    regra('E0237', ret === '2' && tpEmit !== '2' && !tem('toma/end/endNac'),
      'toma/end', 'Retenção pelo tomador sem endereço nacional do tomador',
      'endNac informado', 'ausente');
    regra('E0235', tpEmit === '1' && !!v('toma/CNPJ') && !tem('toma/end/endNac'),
      'toma/end', 'Tomador com CNPJ sem endereço nacional',
      'endNac informado', 'ausente');
    regra('E0222', tpEmit === '2' && tem('toma/NIF'), 'toma/NIF',
      'NIF do tomador informado com tomador emitente', 'ausente', v('toma/NIF'));
    regra('E0224', tpEmit === '2' && tem('toma/cNaoNIF'), 'toma/cNaoNIF',
      'cNaoNIF do tomador informado com tomador emitente', 'ausente',
      v('toma/cNaoNIF'));
    regra('E0236', tpEmit === '2' && tem('toma/end/endNac'), 'toma/end/endNac',
      'Endereço nacional do tomador informado com tomador emitente',
      'ausente', 'informado');
    regra('E0264', ret === '3' && !v('interm/CNPJ') && !v('interm/CPF'), 'interm',
      'Retenção pelo intermediário sem intermediário identificado',
      'CNPJ ou CPF do intermediário', 'ausente');
    regra('E0293', ret === '3' && tpEmit !== '3' && !tem('interm/end/endNac'),
      'interm/end', 'Retenção pelo intermediário sem endereço nacional dele',
      'endNac informado', 'ausente');
    regra('E1388', tpEmit === '1' && !!v('interm/CNPJ')
      && !tem('interm/end/endNac'), 'interm/end',
      'Intermediário com CNPJ sem endereço nacional', 'endNac informado', 'ausente');
    regra('E0280', tpEmit === '3' && tem('interm/NIF'), 'interm/NIF',
      'NIF do intermediário informado com intermediário emitente', 'ausente',
      v('interm/NIF'));
    regra('E0284', tpEmit === '3' && tem('interm/cNaoNIF'), 'interm/cNaoNIF',
      'cNaoNIF do intermediário informado com intermediário emitente',
      'ausente', v('interm/cNaoNIF'));
    regra('E0291', tpEmit === '3' && tem('interm/end/endNac'),
      'interm/end/endNac',
      'Endereço nacional do intermediário informado com intermediário emitente',
      'ausente', 'informado');

    // ---- codigos de municipio e pais
    if (Base.dados.municipios) {
      [['prest/end/endNac/cMun', 'E0130', 'prestador'],
        ['toma/end/endNac/cMun', 'E0238', 'tomador'],
        ['interm/end/endNac/cMun', 'E0294', 'intermediário'],
        ['IBSCBS/dest/end/endNac/cMun', 'E0920', 'destinatário']
      ].forEach(function (p) {
        var c = v(p[0]);
        if (c) {
          regra(p[1], !Base.municipio(c), p[0],
            'Município do endereço do ' + p[2] + ' não existe na tabela do IBGE',
            'código IBGE de 7 dígitos', c);
        }
      });
      var cLocPrest = v('serv/locPrest/cLocPrestacao');
      if (cLocPrest) {
        regra('E0302', cLocPrest !== '0000000' && !Base.municipio(cLocPrest),
          'serv/locPrest/cLocPrestacao',
          'Local da prestação não existe na tabela do IBGE',
          'código IBGE ou 0000000 (Águas Marítimas)', cLocPrest);
      }
    }
    regra('E1402', cTribNac === '200101'
      && v('serv/locPrest/cLocPrestacao') === '0000000',
      'serv/locPrest/cLocPrestacao',
      'Subitem 20.01.01 com local de prestação em Águas Marítimas',
      'município IBGE', '0000000');
    regra('E0304', v('serv/locPrest/cPaisPrestacao') === 'BR',
      'serv/locPrest/cPaisPrestacao', 'País da prestação informado como Brasil',
      'país diferente de BR', 'BR');
    [['prest', 'E0146'], ['toma', 'E0246'], ['interm', 'E0299']].forEach(function (p) {
      var rel = p[0] + '/end/endExt/cPais';
      if (v(rel)) {
        regra(p[1], v(rel) === 'BR', rel, 'Endereço no exterior com país Brasil',
          'país diferente de BR', 'BR');
      }
    });

    // ---- grupos condicionados ao servico
    if (cTribNac) {
      var ehObra = OBRA.indexOf(cTribNac) !== -1;
      regra('E0370', ehObra && !tem('serv/obra'), 'serv/obra',
        'Grupo de obra ausente para serviço de construção civil',
        'grupo obra informado', 'ausente (cTribNac ' + cTribNac + ')');
      regra('E0372', !ehObra && cTribNac !== '990101' && tem('serv/obra'),
        'serv/obra', 'Grupo de obra informado para serviço que não é de obra',
        'ausente', 'informado (cTribNac ' + cTribNac + ')');
      var ehEvento = cTribNac.slice(0, 2) === '12';
      regra('E0390', ehEvento && !tem('serv/atvEvento'), 'serv/atvEvento',
        'Grupo de atividade/evento ausente para serviço do item 12',
        'grupo atvEvento informado', 'ausente (cTribNac ' + cTribNac + ')');
      regra('E0392', !ehEvento && cTribNac !== '990101' && tem('serv/atvEvento'),
        'serv/atvEvento',
        'Grupo de atividade/evento informado para serviço fora do item 12',
        'ausente', 'informado (cTribNac ' + cTribNac + ')');
      regra('E0532', cTribNac === '990101' && trib && trib !== '4',
        'valores/trib/tribMun/tribISSQN',
        'Serviço 99.01.01 sem indicação de não incidência',
        '4 - Não incidência', trib);
      regra('E0596', cTribNac === '220101' && retido,
        'valores/trib/tribMun/tpRetISSQN',
        'Retenção do ISSQN para o subitem 22.01.01', '1 - Não retido', ret);
    }

    if (tem('serv/comExt')) {
      [['mdPrestacao', 'E0333'], ['mecAFComexP', 'E0341'],
        ['mecAFComexT', 'E0343'], ['movTempBens', 'E0345']].forEach(function (p) {
        var rel = 'serv/comExt/' + p[0];
        regra(p[1], v(rel) === '0', rel,
          p[0] + ' = 0 não é aceito na emissão', 'diferente de 0', '0');
      });
      var mov = v('serv/comExt/movTempBens');
      regra('E0352', mov === '2' && !v('serv/comExt/nDI'), 'serv/comExt/nDI',
        'Número da DI ausente com movimentação vinculada à importação',
        'nDI informado', 'ausente');
      regra('E0354', mov === '1' && (tem('serv/comExt/nDI') || tem('serv/comExt/nRE')),
        'serv/comExt/nDI', 'DI ou RE informados sem movimentação temporária',
        'ausentes quando movTempBens = 1', 'informado');
      regra('E0356', mov === '3' && !v('serv/comExt/nRE'), 'serv/comExt/nRE',
        'Número do RE ausente com movimentação vinculada à exportação',
        'nRE informado', 'ausente');
    }

    // ---- valores do servico
    var vReceb = numero(v('valores/vServPrest/vReceb'));
    regra('E0423', tpEmit === '3' && vReceb === null, 'valores/vServPrest/vReceb',
      'Valor recebido ausente com intermediário emitente', 'informado', 'ausente');
    regra('E0424', (tpEmit === '1' || tpEmit === '2') && vReceb !== null,
      'valores/vServPrest/vReceb',
      'Valor recebido informado com prestador ou tomador emitente',
      'ausente', v('valores/vServPrest/vReceb'));
    regra('E0425', vReceb !== null && vServ !== null && vReceb < vServ,
      'valores/vServPrest/vReceb', 'Valor recebido menor que o valor do serviço',
      '≥ ' + vServ, vReceb);

    if (vServ !== null) {
      [['valores/vDescCondIncond/vDescIncond', 'E0431', 'incondicionado'],
        ['valores/vDescCondIncond/vDescCond', 'E0432', 'condicionado']
      ].forEach(function (p) {
        var x = numero(v(p[0]));
        if (x === null) return;
        regra(p[1], !(x > 0 && x < vServ), p[0],
          'Desconto ' + p[2] + ' fora da faixa', 'maior que 0 e menor que ' + vServ, x);
      });
    }

    if (tem('valores/vDedRed')) {
      regra('E0435', semIncidencia, 'valores/vDedRed',
        'Dedução/redução informada em serviço imune, exportado ou sem incidência',
        'grupo ausente', 'tribISSQN ' + trib);
      regra('E0436', mei, 'valores/vDedRed', 'Dedução/redução informada para MEI',
        'grupo ausente', 'opSimpNac 2');
      regra('E0438', regEspecial, 'valores/vDedRed',
        'Dedução/redução informada com regime especial de tributação',
        'grupo ausente', 'regEspTrib ' + regEsp);
      var pDR = numero(v('valores/vDedRed/pDR'));
      if (pDR !== null) {
        regra('E0453', !(pDR > 0 && pDR <= 100), 'valores/vDedRed/pDR',
          'Percentual de dedução/redução fora da faixa', 'maior que 0 e até 100', pDR);
      }
      var vDR = numero(v('valores/vDedRed/vDR'));
      if (vDR !== null && vServ !== null) {
        regra('E0476', vDR > vServ, 'valores/vDedRed/vDR',
          'Dedução/redução maior que o valor do serviço', '≤ ' + vServ, vDR);
      }
      Leitor.filhos(noRel(d, 'valores/vDedRed/documentos'), 'docDedRed')
        .forEach(function (doc) {
          var tp = Leitor.valor(doc, 'tpDedRed');
          var desc = Leitor.valor(doc, 'xDescOutDed');
          conferidas.E0468 = conferidas.E0470 = conferidas.E0472 = true;
          if (tp === '99' && !desc) {
            aponta('E0468', 'valores/vDedRed/documentos',
              'Descrição ausente para "Outras deduções"', 'xDescOutDed informado',
              'ausente');
          }
          if (tp && tp !== '99' && desc) {
            aponta('E0470', 'valores/vDedRed/documentos',
              'Descrição informada para tipo de dedução diferente de 99',
              'ausente', desc);
          }
          var dEmi = Leitor.valor(doc, 'dEmiDoc');
          if (/^\d{4}-\d{2}/.test(dEmi) && /^\d{4}-\d{2}/.test(compet)
              && dEmi.slice(0, compet.length) > compet) {
            aponta('E0472', 'valores/vDedRed/documentos',
              'Documento de dedução emitido depois da competência',
              'até ' + compet, dEmi);
          }
        });
    }

    // ---- ISSQN
    var tpImun = v('valores/trib/tribMun/tpImunidade');
    regra('E0592', (trib === '2') !== !!tpImun, 'valores/trib/tribMun/tpImunidade',
      trib === '2' ? 'Tipo de imunidade ausente em serviço imune'
        : 'Tipo de imunidade informado em serviço que não é imune',
      'informado somente quando tribISSQN = 2', tpImun || 'ausente');
    regra('E0593', tpImun === '0', 'valores/trib/tribMun/tpImunidade',
      'Imunidade "0 - tipo não informado" não é aceita na emissão',
      '1 a 7', '0');
    regra('E0585', semIncidencia && tem('valores/trib/tribMun/exigSusp'),
      'valores/trib/tribMun/exigSusp',
      'Suspensão de exigibilidade em serviço imune, exportado ou sem incidência',
      'ausente', 'informado');

    if (tem('valores/trib/tribMun/BM')) {
      regra('E0533', semIncidencia, 'valores/trib/tribMun/BM',
        'Benefício municipal em serviço imune, exportado ou sem incidência',
        'ausente', 'tribISSQN ' + trib);
      regra('E0534', mei, 'valores/trib/tribMun/BM',
        'Benefício municipal informado para MEI', 'ausente', 'opSimpNac 2');
      regra('E0535', regEspecial, 'valores/trib/tribMun/BM',
        'Benefício municipal com regime especial de tributação', 'ausente',
        'regEspTrib ' + regEsp);
    }

    regra('E0580', semIncidencia && retido, 'valores/trib/tribMun/tpRetISSQN',
      'Retenção de ISSQN em serviço imune, exportado ou sem incidência',
      '1 - Não retido', ret);
    regra('E0583', mei && retido, 'valores/trib/tribMun/tpRetISSQN',
      'Retenção de ISSQN para prestador MEI', '1 - Não retido', ret);
    regra('E0588', regEspecial && retido, 'valores/trib/tribMun/tpRetISSQN',
      'Retenção de ISSQN com regime especial de tributação', '1 - Não retido', ret);

    var pAliq = numero(v('valores/trib/tribMun/pAliq'));
    if (pAliq !== null) {
      regra('E0595', pAliq > 5, 'valores/trib/tribMun/pAliq',
        'Alíquota de ISSQN acima de 5%', 'até 5,00', pAliq);
      regra('E0600', mei, 'valores/trib/tribMun/pAliq',
        'Alíquota de ISSQN informada para MEI', 'ausente', pAliq);
      regra('E0602', semIncidencia, 'valores/trib/tribMun/pAliq',
        'Alíquota informada em serviço imune, exportado ou sem incidência',
        'ausente', pAliq);
      regra('E0604', regEspecial, 'valores/trib/tribMun/pAliq',
        'Alíquota informada com regime especial de tributação', 'ausente', pAliq);
    }

    // ---- tributos federais
    if (tem('valores/trib/tribFed')) {
      regra('E0675', tpEmit === '1' && !!v('prest/CPF'), 'valores/trib/tribFed',
        'Tributos federais informados por prestador pessoa física',
        'grupo ausente', 'prestador CPF');
      regra('E0676', mei, 'valores/trib/tribFed',
        'Tributos federais informados por MEI', 'grupo ausente', 'opSimpNac 2');

      var pc = 'valores/trib/tribFed/piscofins/';
      if (tem('valores/trib/tribFed/piscofins')) {
        var cst = v(pc + 'CST');
        var vBC = numero(v(pc + 'vBCPisCofins'));
        var pP = numero(v(pc + 'pAliqPis'));
        var pC = numero(v(pc + 'pAliqCofins'));
        var vP = numero(v(pc + 'vPis'));
        var vC = numero(v(pc + 'vCofins'));
        var semBase = PISCOFINS_SEM_BASE.indexOf(cst) !== -1;

        regra('E0677', vBC !== null && vServ !== null && vBC > vServ,
          pc + 'vBCPisCofins', 'Base de PIS/COFINS maior que o valor do serviço',
          '≤ ' + vServ, vBC);
        regra('E0678', !!cst && !semBase && vBC === null, pc + 'vBCPisCofins',
          'Base de PIS/COFINS ausente para o CST informado', 'informada',
          'ausente (CST ' + cst + ')');
        regra('E0680', !!cst && !semBase && vBC !== null && vBC <= 0,
          pc + 'vBCPisCofins', 'Base de PIS/COFINS zerada para o CST informado',
          'maior que 0', vBC);
        regra('E0682', semBase && vBC !== null, pc + 'vBCPisCofins',
          'Base de PIS/COFINS informada para CST sem incidência',
          'ausente (CST ' + cst + ')', vBC);
        regra('E0684', vBC !== null && pP === null, pc + 'pAliqPis',
          'Alíquota do PIS ausente com base informada', 'informada', 'ausente');
        regra('E0690', vBC !== null && pC === null, pc + 'pAliqCofins',
          'Alíquota da COFINS ausente com base informada', 'informada', 'ausente');
        regra('E0686', pP !== null && (pP < 0 || pP > 100), pc + 'pAliqPis',
          'Alíquota do PIS fora da faixa', '0 a 100', pP);
        regra('E0692', pC !== null && (pC < 0 || pC > 100), pc + 'pAliqCofins',
          'Alíquota da COFINS fora da faixa', '0 a 100', pC);
        regra('E0688', (cst === '04' || cst === '06')
          && ((pP !== null && pP !== 0) || (pC !== null && pC !== 0)),
          pc + 'pAliqPis', 'Alíquota diferente de zero para CST de alíquota zero',
          '0,00', 'PIS ' + pP + ' / COFINS ' + pC);
        if (vBC !== null && pP !== null && vP !== null) {
          var espP = Math.round(vBC * pP) / 100;
          regra('E0694', Math.abs(espP - vP) > 0.01, pc + 'vPis',
            'Valor do PIS não confere com base × alíquota',
            espP.toFixed(2), vP.toFixed(2));
        }
        if (vBC !== null && pC !== null && vC !== null) {
          var espC = Math.round(vBC * pC) / 100;
          regra('E0696', Math.abs(espC - vC) > 0.01, pc + 'vCofins',
            'Valor da COFINS não confere com base × alíquota',
            espC.toFixed(2), vC.toFixed(2));
        }
        regra('E0698', !!cst && !semBase && !v(pc + 'tpRetPisCofins'),
          pc + 'tpRetPisCofins', 'Tipo de retenção de PIS/COFINS ausente',
          'informado', 'ausente (CST ' + cst + ')');
      }

      [['vRetCP', 'E0699'], ['vRetIRRF', 'E0700'], ['vRetCSLL', 'E0701']]
        .forEach(function (p) {
          var rel = 'valores/trib/tribFed/' + p[0];
          var x = numero(v(rel));
          if (x === null || vServ === null) return;
          regra(p[1], !(x > 0 && x < vServ), rel,
            p[0] + ' fora da faixa', 'maior que 0 e menor que ' + vServ, x);
        });
    }

    // ---- total aproximado de tributos
    if (vServ !== null) {
      [['vTotTribFed', 'E0702'], ['vTotTribEst', 'E0703'], ['vTotTribMun', 'E0704']]
        .forEach(function (p) {
          var rel = 'valores/trib/totTrib/vTotTrib/' + p[0];
          var x = numero(v(rel));
          if (x === null) return;
          regra(p[1], x < 0 || x > vServ, rel, p[0] + ' fora da faixa',
            '0 a ' + vServ, x);
        });
    }
    [['pTotTribFed', 'E0706'], ['pTotTribEst', 'E0707'], ['pTotTribMun', 'E0708']]
      .forEach(function (p) {
        var rel = 'valores/trib/totTrib/pTotTrib/' + p[0];
        var x = numero(v(rel));
        if (x === null) return;
        regra(p[1], x < 0 || x > 100, rel, p[0] + ' fora da faixa', '0 a 100', x);
      });
    regra('E0712', opSN === '3' && tem('valores/trib/totTrib/indTotTrib'),
      'valores/trib/totTrib/indTotTrib',
      'indTotTrib informado por ME/EPP do Simples', 'ausente', 'informado');
    regra('E0710', mei && tem('valores/trib/totTrib/pTotTribSN'),
      'valores/trib/totTrib/pTotTribSN', 'pTotTribSN informado por MEI',
      'ausente', 'informado');

    // ---- IBS/CBS
    if (tem('IBSCBS')) {
      var indops = Base.tabela('cIndOp').map(function (x) { return x['Código indOp']; });
      if (cIndOp && indops.length) {
        regra('E0901', indops.indexOf(cIndOp) === -1, 'IBSCBS/cIndOp',
          'Indicador da operação não consta na tabela oficial',
          'código do Anexo VII', cIndOp);
      }
      var tpOper = v('IBSCBS/tpOper');
      var exigeTpOper = tem('IBSCBS/tpEnteGov')
        || TPOPER_SERVICOS.indexOf(cTribNac.slice(0, 4)) !== -1;
      regra('E0903', exigeTpOper && !tpOper, 'IBSCBS/tpOper',
        'Tipo de operação ausente para compra governamental ou serviço sobre imóvel',
        'informado', 'ausente');
      regra('E0904', !exigeTpOper && !!tpOper, 'IBSCBS/tpOper',
        'Tipo de operação informado fora das situações previstas',
        'ausente (só com tpEnteGov ou serviços 25.05, 15.09, 17.12 e 10.05)',
        tpOper);
      var refOk = tpOper === '2' || tpOper === '3';
      regra('E0905', refOk && !tem('IBSCBS/gRefNFSe'), 'IBSCBS/gRefNFSe',
        'NFS-e referenciada ausente para o tipo de operação', 'gRefNFSe informado',
        'ausente (tpOper ' + tpOper + ')');
      regra('E0906', !refOk && tem('IBSCBS/gRefNFSe'), 'IBSCBS/gRefNFSe',
        'NFS-e referenciada informada fora das situações previstas',
        'somente com tpOper 2 ou 3', 'tpOper ' + (tpOper || 'ausente'));
      Leitor.filhos(noRel(d, 'IBSCBS/gRefNFSe'), 'refNFSe').forEach(function (r) {
        conferidas.E0907 = true;
        if (!/^\d{50}$/.test(r.texto)) {
          aponta('E0907', 'IBSCBS/gRefNFSe/refNFSe',
            'Chave de NFS-e referenciada fora do formato', '50 dígitos',
            r.texto.slice(0, 60));
        }
      });
      regra('E0910', tem('IBSCBS/dest') && v('IBSCBS/indDest') !== '1',
        'IBSCBS/dest', 'Destinatário informado sem indDest = 1',
        'dest somente com indDest = 1', 'indDest ' + v('IBSCBS/indDest'));
      if (v('IBSCBS/dest/email')) {
        regra('E0930', !emailValido(v('IBSCBS/dest/email')), 'IBSCBS/dest/email',
          'E-mail do destinatário fora do formato', 'nome@dominio.ext',
          v('IBSCBS/dest/email'));
      }
      var ehImovel = INDOP_IMOVEL.indexOf(cIndOp) !== -1;
      regra('E0931', ehImovel && !tem('IBSCBS/imovel'), 'IBSCBS/imovel',
        'Grupo imóvel ausente para operação com imóvel', 'informado',
        'ausente (cIndOp ' + cIndOp + ')');
      regra('E0932', !ehImovel && tem('IBSCBS/imovel'), 'IBSCBS/imovel',
        'Grupo imóvel informado para operação que não é com imóvel', 'ausente',
        'informado (cIndOp ' + cIndOp + ')');

      Leitor.filhos(noRel(d, 'IBSCBS/valores/gReeRepRes'), 'documentos')
        .forEach(function (doc) {
          var base = 'IBSCBS/valores/gReeRepRes/documentos';
          var dfe = Leitor.filho(doc, 'dFeNacional');
          conferidas.E0940 = conferidas.E0942 = conferidas.E0950 = true;
          conferidas.E0952 = conferidas.E0953 = true;
          if (dfe) {
            var tipo = Leitor.valor(dfe, 'tipoChaveDFe');
            var ch = Leitor.valor(dfe, 'chaveDFe');
            var tam = tipo === '1' ? 50 : (tipo === '2' || tipo === '3' ? 44 : 0);
            if (tam && !new RegExp('^\\d{' + tam + '}$').test(ch)) {
              aponta('E0940', base + '/dFeNacional/chaveDFe',
                'Chave do DF-e fora do formato do tipo indicado',
                tam + ' dígitos', ch.slice(0, 60));
            }
          }
          var dComp = Leitor.valor(doc, 'dtCompDoc');
          if (Leitor.filho(doc, 'docFiscalOutro') && dComp && dComp.slice(0, 10) >= '2025-12-31') {
            aponta('E0942', base + '/docFiscalOutro',
              'Outro documento fiscal com competência a partir de 31/12/2025',
              'competência anterior a 31/12/2025', dComp);
          }
          var dEmiD = Leitor.valor(doc, 'dtEmiDoc');
          if (dEmiD && dComp && dEmiD.slice(0, 10) < dComp.slice(0, 10)) {
            aponta('E0950', base + '/dtEmiDoc',
              'Documento de reembolso emitido antes da sua competência',
              '≥ ' + dComp.slice(0, 10), dEmiD);
          }
          if (Leitor.valor(doc, 'xTpReeRepRes')
              && Leitor.valor(doc, 'tpReeRepRes') !== '99') {
            aponta('E0952', base + '/xTpReeRepRes',
              'Descrição do reembolso informada para tipo diferente de 99',
              'ausente', Leitor.valor(doc, 'xTpReeRepRes'));
          }
          var vlr = numero(Leitor.valor(doc, 'vlrReeRepRes'));
          if (vlr !== null && vServ !== null && vlr > vServ) {
            aponta('E0953', base + '/vlrReeRepRes',
              'Valor de reembolso maior que o valor do serviço', '≤ ' + vServ, vlr);
          }
        });
    }

    return {
      conferidas: Object.keys(conferidas).sort(),
      disparadas: disparadas
    };
  }

  // ------------------------------------------------------------------
  // IBS/CBS: formato, e o par CST + cClassTrib contra a tabela oficial
  // ------------------------------------------------------------------
  function confereIBSCBS(infDPS, col) {
    var resumo = { presente: false, suspensao: IBSCBS_SUSPENSO, pares: [] };
    var g = Leitor.filho(infDPS, 'IBSCBS');

    if (!g) {
      col.add({
        nivel: 'info', grupo: 'Reforma tributária',
        alvo: infDPS.caminho + '/IBSCBS', linha: infDPS.linha,
        titulo: 'Grupo IBSCBS não informado',
        detalhe: IBSCBS_SUSPENSO.texto + ' Previsão de religar a exigência: '
          + IBSCBS_SUSPENSO.previsao + '. A LC 214/2025 segue válida — a nota '
          + 'é aceita hoje, mas o dado precisará existir.',
        fonte: IBSCBS_SUSPENSO.desde, regra: Base.regra('E0900')
      });
      return resumo;
    }

    resumo.presente = true;

    Leitor.percorre(g, function (no) {
      if (no.nome !== 'CST') return;
      var pai = no.pai;
      var cst = no.texto;
      var classe = Leitor.valor(pai, 'cClassTrib');
      if (!cst) return;

      if (!/^\d{3}$/.test(cst)) {
        col.add({
          nivel: 'erro', grupo: 'Reforma tributária', alvo: no.caminho,
          linha: no.linha, titulo: 'CST de IBS/CBS fora do formato',
          esperado: '3 dígitos', obtido: cst, fonte: 'Leiaute'
        });
        return;
      }
      if (classe && !/^\d{6}$/.test(classe)) {
        col.add({
          nivel: 'erro', grupo: 'Reforma tributária',
          alvo: pai.caminho + '/cClassTrib', linha: pai.linha,
          titulo: 'cClassTrib fora do formato',
          esperado: '6 dígitos', obtido: classe, fonte: 'Leiaute'
        });
        return;
      }
      if (!classe) return;

      var par = Base.parValido(cst, classe);
      resumo.pares.push({ cst: cst, cclasstrib: classe, ok: !!par,
        caminho: pai.caminho, par: par });

      if (!par) {
        var validos = Base.tabela('associacao_cst_cclasstrib')
          .filter(function (p) { return p.cst === cst; })
          .map(function (p) { return p.cclasstrib; });
        col.add({
          nivel: 'erro', grupo: 'Reforma tributária',
          alvo: pai.caminho + '/cClassTrib', linha: pai.linha,
          titulo: 'cClassTrib não consta na associação oficial para este CST',
          esperado: validos.length
            ? 'para CST ' + cst + ': ' + validos.join(', ')
            : 'CST ' + cst + ' não consta na tabela de associação',
          obtido: classe,
          detalhe: 'Conferido contra a aba Associação-CST-cClassTrib do '
            + 'Anexo VI da NT 004.',
          fonte: 'Anexo VI — Associação CST × cClassTrib'
        });
      }
    });

    return resumo;
  }

  // ------------------------------------------------------------------
  function valida(texto, nomeArquivo, opcoes) {
    opcoes = opcoes || {};
    opcoes.ordem = opcoes.ordem || 'aviso';
    opcoes.mapeamento = opcoes.mapeamento !== false;

    var col = new Coletor();
    var lido = Leitor.lerXML(texto);

    if (!lido.ok) {
      col.add({
        nivel: 'erro', grupo: 'XML', alvo: nomeArquivo,
        titulo: 'XML mal formado', detalhe: lido.erro,
        fonte: 'Análise sintática do arquivo'
      });
      return monta(nomeArquivo, null, col, opcoes, null);
    }

    // DPS avulsa ou NFS-e completa?
    var infDPS = Leitor.acha(lido.raiz, 'infDPS');
    var infNFSe = Leitor.acha(lido.raiz, 'infNFSe');
    var tipoDoc = infNFSe ? 'NFS-e' : (infDPS ? 'DPS' : null);

    if (!tipoDoc) {
      col.add({
        nivel: 'erro', grupo: 'XML', alvo: nomeArquivo,
        titulo: 'Documento não é uma DPS nem uma NFS-e',
        detalhe: 'Elemento raiz encontrado: <' + lido.raiz.nome + '>. '
          + 'Esperado <DPS> ou <NFSe>.',
        fonte: 'Leiaute da NFS-e nacional'
      });
      return monta(nomeArquivo, lido, col, opcoes, null);
    }

    // ancora os caminhos do documento nos caminhos do leiaute
    var ancora = infNFSe ? 'NFSe/infNFSe' : PREFIXO_DPS + '/infDPS';
    var noAncora = infNFSe || infDPS;
    (function rebase(n, prefixo) {
      n.caminho = prefixo;
      n.filhos.forEach(function (f) { rebase(f, prefixo + '/' + f.nome); });
    })(noAncora, ancora);

    var fora = [];
    var mapeados = 0;
    Leitor.percorre(noAncora, function (n) {
      if (FORA_DO_ESCOPO[n.nome]) return;
      var def = Base.campo(n.caminho);
      if (!def) { fora.push(n); return; }
      mapeados++;
      confereValor(n, def, col);
      if (n.filhos.length) confereFilhos(n, col, opcoes);
    });

    if (opcoes.mapeamento) {
      fora.forEach(function (n) {
        col.add({
          nivel: 'aviso', grupo: 'Mapeamento', alvo: n.caminho, linha: n.linha,
          titulo: 'Elemento fora do mapeamento do leiaute vigente',
          detalhe: 'O caminho não consta no leiaute '
            + Base.dados.vigente.toUpperCase() + '. Pode ser campo de uma '
            + 'versão mais recente, ainda não exigida, ou elemento indevido.',
          obtido: n.texto ? n.texto.slice(0, 80) : '(grupo)',
          fonte: 'Leiaute vigente'
        });
      });
    }

    var alvoDPS = infDPS || Leitor.acha(noAncora, 'infDPS');
    var id = null, rtc = null, roteamento = null, negocio = null;
    if (alvoDPS) {
      // o roteamento vem primeiro de proposito: e a pergunta que muda o
      // significado de tudo o que vier depois
      roteamento = confereRoteamento(alvoDPS, tipoDoc, col);
      id = confereIdDPS(alvoDPS, col);
      rtc = confereIBSCBS(alvoDPS, col);
      negocio = confereRegrasNegocio(alvoDPS, col);
    }
    confereCadastro(noAncora, col);

    return monta(nomeArquivo, lido, col, opcoes, {
      tipoDoc: tipoDoc, infDPS: alvoDPS, infNFSe: infNFSe,
      id: id, rtc: rtc, roteamento: roteamento, negocio: negocio,
      cobertura: { mapeados: mapeados, fora: fora.length }
    });
  }

  function monta(arquivo, lido, col, opcoes, ctx) {
    var erros = col.itens.filter(function (a) { return a.nivel === 'erro'; });
    var avisos = col.itens.filter(function (a) { return a.nivel === 'aviso'; });
    var risco = erros.length ? (erros.length > 8 ? 'Alto' : 'Médio')
      : (avisos.length > 12 ? 'Médio' : 'Baixo');

    var cab = {};
    if (ctx && ctx.infDPS) {
      var d = ctx.infDPS;
      var prest = Leitor.acha(d, 'prest');
      var toma = Leitor.acha(d, 'toma');
      var serv = Leitor.acha(d, 'serv');
      var valores = Leitor.acha(d, 'valores');
      cab = {
        tipoDoc: ctx.tipoDoc,
        id: d.atributos.Id || d.atributos.id || '',
        serie: Leitor.valor(d, 'serie'),
        numero: Leitor.valor(d, 'nDPS'),
        emissao: Leitor.valor(d, 'dhEmi'),
        competencia: Leitor.valor(d, 'dCompet'),
        tpAmb: Leitor.valor(d, 'tpAmb'),
        tpEmit: Leitor.valor(d, 'tpEmit'),
        cLocEmi: Leitor.valor(d, 'cLocEmi'),
        prestador: prest ? (Leitor.valor(prest, 'CNPJ')
          || Leitor.valor(prest, 'CPF')) : '',
        tomador: toma ? (Leitor.valor(toma, 'CNPJ')
          || Leitor.valor(toma, 'CPF')) : '',
        servico: serv ? (Leitor.valor(Leitor.acha(serv, 'cServ') || serv,
          'xDescServ') || '') : '',
        valor: valores ? (Leitor.valor(Leitor.acha(valores, 'vServPrest')
          || valores, 'vServ') || '') : ''
      };
    }

    return {
      arquivo: arquivo, quando: new Date().toISOString(),
      ok: erros.length === 0, risco: risco, cabecalho: cab,
      achados: col.itens,
      totais: {
        erros: erros.length, avisos: avisos.length,
        informacoes: col.itens.length - erros.length - avisos.length,
        camposConferidos: col.conferidos,
        elementos: lido ? lido.nos : 0,
        mapeados: ctx && ctx.cobertura ? ctx.cobertura.mapeados : 0,
        foraMapeamento: ctx && ctx.cobertura ? ctx.cobertura.fora : 0
      },
      rtc: ctx ? ctx.rtc : null,
      roteamento: ctx ? ctx.roteamento : null,
      regrasNegocio: ctx ? ctx.negocio : null,
      opcoes: opcoes, arvore: lido ? lido.raiz : null
    };
  }

  raiz.NFSe.Motor = { valida: valida, cnpjValido: cnpjValido, cpfValido: cpfValido,
    IBSCBS_SUSPENSO: IBSCBS_SUSPENSO };

  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.NFSe.Motor;
})(typeof globalThis !== 'undefined' ? globalThis : this);
