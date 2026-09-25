/* Recalculo e coerencia fiscal.
 *
 * Duas familias de verificacao, ambas ancoradas em fonte:
 *
 * 1. Identidades aritmeticas do proprio leiaute (valor = base x aliquota,
 *    total do produto = quantidade x valor unitario). Nao dependem de
 *    interpretacao: ou fecham, ou nao fecham.
 *
 * 2. Regras oficiais de validacao da SEFAZ, citadas pelo codigo e pela
 *    mensagem de rejeicao que o Fisco devolveria. O enunciado exibido e o
 *    texto extraido do documento, nao uma parafrase.
 *
 * O que depende de regra estadual, beneficio fiscal ou tabela externa nao e
 * afirmado: e sinalizado como ponto de conferencia.
 */
(function (raiz) {
  'use strict';

  raiz.NFe = raiz.NFe || {};

  var Base = raiz.NFe.Base;
  var Leitor = raiz.Leitor;

  var PORTAL_CLASSIFICACAO =
    'https://dfe-portal.svrs.rs.gov.br/DFE/ClassificacaoTributaria';

  function num(s) {
    if (s === undefined || s === null || s === '') return null;
    var n = parseFloat(String(s).replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  function moeda(n) {
    return n === null || n === undefined ? '—'
      : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  /** Aliquota no formato brasileiro, sem casas decimais sobrando. */
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%';
  }
  function arred(n, casas) {
    var f = Math.pow(10, casas === undefined ? 2 : casas);
    return Math.round((n + Number.EPSILON) * f) / f;
  }
  /** Diferenca aceitavel: um centavo, ou a tolerancia relativa escolhida. */
  function limite(esperado, tol) {
    return Math.max(0.01, Math.abs(esperado || 0) * (tol || 0));
  }
  function fecha(obtido, esperado, tol) {
    return Math.abs(obtido - esperado) <= limite(esperado, tol);
  }

  function citaRegra(codigo) {
    var r = Base.regra(codigo);
    if (!r) return { fonte: 'Regras de validação — ' + codigo, regra: null };
    var f = 'Regra ' + r.codigo + (r.msg ? ' — rejeição ' + r.msg : '')
      + (r.modelo ? ' (modelo ' + r.modelo + ')' : '');
    return { fonte: f, regra: r };
  }

  /** Soma, em todos os itens, os elementos cujo ID no leiaute seja o dado. */
  function somaPorId(infNFe, id, filtroItem) {
    var caminhos = Base.caminhosDe(id);
    if (!caminhos.length) return null;
    var conjunto = Object.create(null);
    caminhos.forEach(function (c) { conjunto[c] = 1; });

    var total = 0, achou = false;
    Leitor.filhos(infNFe, 'det').forEach(function (det) {
      if (filtroItem && !filtroItem(det)) return;
      Leitor.percorre(det, function (n) {
        if (n.filhos.length) return;
        if (!conjunto[n.caminho]) return;
        var v = num(n.texto);
        if (v !== null) { total += v; achou = true; }
      });
    });
    return achou ? arred(total, 2) : null;
  }

  function valorPorId(infNFe, id) {
    var caminhos = Base.caminhosDe(id);
    var achado = null;
    caminhos.forEach(function (c) {
      if (achado !== null) return;
      Leitor.percorre(infNFe, function (n) {
        if (achado !== null || n.filhos.length) return;
        if (n.caminho === c) achado = n;
      });
    });
    return achado;
  }

  /** CST ou CSOSN do ICMS de um item. */
  function situacaoICMS(det) {
    var imposto = Leitor.filho(det, 'imposto');
    var icms = imposto ? Leitor.filho(imposto, 'ICMS') : null;
    if (!icms || !icms.filhos.length) return null;
    var grupo = icms.filhos[0];
    return {
      grupo: grupo.nome,
      no: grupo,
      cst: Leitor.valor(grupo, 'CST'),
      csosn: Leitor.valor(grupo, 'CSOSN')
    };
  }

  function temGrupoICMS(det) {
    var imposto = Leitor.filho(det, 'imposto');
    return !!(imposto && Leitor.filho(imposto, 'ICMS'));
  }
  function temISSQN(det) {
    var imposto = Leitor.filho(det, 'imposto');
    return !!(imposto && Leitor.filho(imposto, 'ISSQN'));
  }

  // ------------------------------------------------------------------
  // 1. identidades aritmeticas por item
  // ------------------------------------------------------------------
  function confereItens(infNFe, col, tol) {
    var linhas = [];

    Leitor.filhos(infNFe, 'det').forEach(function (det) {
      var nItem = det.atributos.nItem || '?';
      var prod = Leitor.filho(det, 'prod');
      if (!prod) return;
      var imposto = Leitor.filho(det, 'imposto');
      var rotulo = 'Item ' + nItem;
      var resumo = {
        item: nItem,
        codigo: Leitor.valor(prod, 'cProd'),
        descricao: Leitor.valor(prod, 'xProd'),
        ncm: Leitor.valor(prod, 'NCM'),
        cfop: Leitor.valor(prod, 'CFOP'),
        vProd: num(Leitor.valor(prod, 'vProd')),
        divergencias: 0
      };

      function checa(o) {
        if (o.esperado === null || o.obtido === null) return;
        if (fecha(o.obtido, o.esperado, tol)) return;
        resumo.divergencias++;
        var cit = o.codigo ? citaRegra(o.codigo)
          : { fonte: o.fonte || 'Identidade aritmética do leiaute', regra: null };
        col.add({
          nivel: 'erro', grupo: 'Cálculo', alvo: o.alvo, linha: o.linha || det.linha,
          titulo: rotulo + ' — ' + o.titulo,
          detalhe: o.formula,
          esperado: moeda(arred(o.esperado, 2)),
          obtido: moeda(arred(o.obtido, 2)),
          fonte: cit.fonte, regra: cit.regra
        });
      }

      // ---- vProd = qCom x vUnCom
      var q = num(Leitor.valor(prod, 'qCom'));
      var vu = num(Leitor.valor(prod, 'vUnCom'));
      if (q !== null && vu !== null && resumo.vProd !== null) {
        checa({
          titulo: 'valor do produto não confere com quantidade × valor unitário',
          alvo: det.caminho + '/prod/vProd',
          linha: (Leitor.filho(prod, 'vProd') || prod).linha,
          formula: 'vProd = qCom (' + q + ') × vUnCom (' + vu + ')',
          esperado: q * vu, obtido: resumo.vProd
        });
      }

      if (!imposto) { linhas.push(resumo); return; }

      // ---- ICMS
      var sit = situacaoICMS(det);
      if (sit) {
        var g = sit.no;
        var vBC = num(Leitor.valor(g, 'vBC'));
        var pICMS = num(Leitor.valor(g, 'pICMS'));
        var vICMS = num(Leitor.valor(g, 'vICMS'));
        if (vBC !== null && pICMS !== null && vICMS !== null) {
          checa({
            titulo: 'ICMS não confere com base × alíquota',
            alvo: g.caminho + '/vICMS',
            linha: (Leitor.filho(g, 'vICMS') || g).linha,
            formula: 'vICMS = vBC (' + moeda(vBC) + ') × pICMS (' + pct(pICMS) + ')',
            esperado: vBC * pICMS / 100, obtido: vICMS
          });
        }
        var vBCST = num(Leitor.valor(g, 'vBCST'));
        var pICMSST = num(Leitor.valor(g, 'pICMSST'));
        var vICMSST = num(Leitor.valor(g, 'vICMSST'));
        if (vBCST !== null && pICMSST !== null && vICMSST !== null) {
          checa({
            titulo: 'ICMS-ST não confere com base × alíquota menos o ICMS próprio',
            alvo: g.caminho + '/vICMSST',
            linha: (Leitor.filho(g, 'vICMSST') || g).linha,
            formula: 'vICMSST = vBCST (' + moeda(vBCST) + ') × pICMSST ('
              + pct(pICMSST) + ') − vICMS (' + moeda(vICMS || 0) + ')',
            esperado: vBCST * pICMSST / 100 - (vICMS || 0), obtido: vICMSST
          });
        }
        var vFCP = num(Leitor.valor(g, 'vFCP'));
        var pFCP = num(Leitor.valor(g, 'pFCP'));
        var vBCFCP = num(Leitor.valor(g, 'vBCFCP'));
        if (vFCP !== null && pFCP !== null && vBCFCP !== null) {
          checa({
            titulo: 'FCP não confere com base × alíquota',
            alvo: g.caminho + '/vFCP',
            linha: (Leitor.filho(g, 'vFCP') || g).linha,
            formula: 'vFCP = vBCFCP (' + moeda(vBCFCP) + ') × pFCP (' + pct(pFCP) + ')',
            esperado: vBCFCP * pFCP / 100, obtido: vFCP
          });
        }
        resumo.cst = sit.cst || sit.csosn || '';
        resumo.grupoICMS = sit.grupo;
      }

      // ---- IPI, PIS, COFINS: valor = base x aliquota, ou quantidade x valor
      [['IPI', 'IPITrib', 'pIPI', 'vIPI', 'vUnid', 'qUnid'],
       ['PIS', null, 'pPIS', 'vPIS', 'vAliqProd', 'qBCProd'],
       ['COFINS', null, 'pCOFINS', 'vCOFINS', 'vAliqProd', 'qBCProd']
      ].forEach(function (cfg) {
        var pai = Leitor.filho(imposto, cfg[0]);
        if (!pai || !pai.filhos.length) return;
        var g = pai.filhos[0];
        if (cfg[0] === 'IPI') {
          g = Leitor.filho(pai, 'IPITrib') || g;
          if (g.nome !== 'IPITrib') return;
        }
        var vBC = num(Leitor.valor(g, 'vBC'));
        var p = num(Leitor.valor(g, cfg[2]));
        var v = num(Leitor.valor(g, cfg[3]));
        var qtd = num(Leitor.valor(g, cfg[5]));
        var vUn = num(Leitor.valor(g, cfg[4]));

        if (vBC !== null && p !== null && v !== null) {
          checa({
            titulo: cfg[0] + ' não confere com base × alíquota',
            alvo: g.caminho + '/' + cfg[3],
            linha: (Leitor.filho(g, cfg[3]) || g).linha,
            formula: cfg[3] + ' = vBC (' + moeda(vBC) + ') × ' + cfg[2] + ' (' + pct(p) + ')',
            esperado: vBC * p / 100, obtido: v
          });
        } else if (qtd !== null && vUn !== null && v !== null) {
          checa({
            titulo: cfg[0] + ' não confere com quantidade × valor por unidade',
            alvo: g.caminho + '/' + cfg[3],
            linha: (Leitor.filho(g, cfg[3]) || g).linha,
            formula: cfg[3] + ' = ' + cfg[5] + ' (' + qtd + ') × ' + cfg[4] + ' (' + vUn + ')',
            esperado: qtd * vUn, obtido: v
          });
        }
      });

      linhas.push(resumo);
    });

    return linhas;
  }

  // ------------------------------------------------------------------
  // 2. totalizadores (regras oficiais W)
  // ------------------------------------------------------------------
  // Cada entrada espelha uma regra do ANEXO I. A condicao, quando existe,
  // reproduz a ressalva escrita no proprio enunciado da regra.
  var TOTAIS = [
    { regra: 'W03-10', total: 'vBC', itemId: 'N15' },
    { regra: 'W04-10', total: 'vICMS', itemId: 'N17',
      condicao: function (det) {
        var s = situacaoICMS(det);
        return !s || ['40', '41', '50'].indexOf(s.cst) === -1;
      },
      ressalva: 'O total não considera itens com CST 40, 41 e 50.' },
    { regra: 'W04a-10', total: 'vICMSDeson', itemId: 'N28a' },
    { regra: 'W04b-10', total: 'vFCP', itemId: 'N17c' },
    { regra: 'W04c-10', total: 'vFCPUFDest', itemId: 'NA13' },
    { regra: 'W04e-10', total: 'vICMSUFDest', itemId: 'NA15' },
    { regra: 'W04g-10', total: 'vICMSUFRemet', itemId: 'NA17' },
    { regra: 'W05-10', total: 'vBCST', itemId: 'N21' },
    { regra: 'W06-10', total: 'vST', itemId: 'N23' },
    { regra: 'W06a-10', total: 'vFCPST', itemId: 'N23d' },
    { regra: 'W06b-10', total: 'vFCPSTRet', itemId: 'N27d' },
    { regra: 'W07-10', total: 'vProd', itemId: 'I11',
      condicao: function (det) {
        var prod = Leitor.filho(det, 'prod');
        return !prod || Leitor.valor(prod, 'indTot') !== '0';
      },
      ressalva: 'Somam-se apenas os itens com indTot = 1.' },
    { regra: 'W08-10', total: 'vFrete', itemId: 'I15' },
    { regra: 'W09-10', total: 'vSeg', itemId: 'I16' },
    { regra: 'W10-10', total: 'vDesc', itemId: 'I17' },
    { regra: 'W11-10', total: 'vII', itemId: 'P04' },
    { regra: 'W12-10', total: 'vIPI', itemId: 'O14' },
    { regra: 'W12a-10', total: 'vIPIDevol', itemId: 'UA04' },
    { regra: 'W13-10', total: 'vPIS', itemId: 'Q09', condicao: temGrupoICMS,
      ressalva: 'Somam-se apenas itens sujeitos ao ICMS.' },
    { regra: 'W14-10', total: 'vCOFINS', itemId: 'S11', condicao: temGrupoICMS,
      ressalva: 'Somam-se apenas itens sujeitos ao ICMS.' },
    { regra: 'W15-10', total: 'vOutro', itemId: 'I17a' },
    { regra: 'W16a-10', total: 'vTotTrib', itemId: 'M02' }
  ];

  function confereTotais(infNFe, col, tol) {
    var tot = Leitor.acha(infNFe, 'ICMSTot');
    var linhas = [];
    if (!tot) return linhas;

    TOTAIS.forEach(function (def) {
      var no = Leitor.filho(tot, def.total);
      var declarado = no ? num(no.texto) : null;
      var somado = somaPorId(infNFe, def.itemId, def.condicao);
      if (declarado === null && somado === null) return;

      var d = declarado === null ? 0 : declarado;
      var s = somado === null ? 0 : somado;
      var ok = fecha(d, s, tol);
      var cit = citaRegra(def.regra);

      linhas.push({
        campo: def.total, regra: def.regra,
        msg: cit.regra ? cit.regra.msg : '',
        declarado: d, somado: s, diferenca: arred(d - s, 2), ok: ok,
        ressalva: def.ressalva || ''
      });

      if (!ok) {
        col.add({
          nivel: 'erro', grupo: 'Totalizadores',
          alvo: 'infNFe/total/ICMSTot/' + def.total,
          linha: no ? no.linha : tot.linha,
          titulo: 'Total de ' + def.total + ' não confere com a soma dos itens',
          detalhe: (cit.regra ? cit.regra.regra : '')
            + (def.ressalva ? ' — ' + def.ressalva : ''),
          esperado: moeda(s) + ' (soma dos itens)',
          obtido: moeda(d) + ' (declarado)',
          fonte: cit.fonte, regra: cit.regra
        });
      }
    });

    // ---- W16-10: composicao do valor total da nota
    var componentes = [
      ['+', 'vProd'], ['-', 'vDesc'], ['-', 'vICMSDeson'], ['+', 'vST'],
      ['+', 'vFCPST'], ['+', 'vFrete'], ['+', 'vSeg'], ['+', 'vOutro'],
      ['+', 'vII'], ['+', 'vIPI'], ['+', 'vIPIDevol']
    ];
    var detalhe = [], soma = 0;
    componentes.forEach(function (c) {
      var v = num(Leitor.valor(tot, c[1]));
      if (v === null) return;
      soma += (c[0] === '+' ? v : -v);
      detalhe.push({ sinal: c[0], campo: c[1], valor: v });
    });
    var issqn = Leitor.acha(infNFe, 'ISSQNtot');
    var vServ = issqn ? num(Leitor.valor(issqn, 'vServ')) : null;
    if (vServ !== null) { soma += vServ; detalhe.push({ sinal: '+', campo: 'vServ', valor: vServ }); }

    var vNFno = Leitor.filho(tot, 'vNF');
    var vNF = vNFno ? num(vNFno.texto) : null;
    if (vNF !== null) {
      soma = arred(soma, 2);
      var okNF = fecha(vNF, soma, tol);
      var citNF = citaRegra('W16-10');
      linhas.push({
        campo: 'vNF', regra: 'W16-10',
        msg: citNF.regra ? citNF.regra.msg : '',
        declarado: vNF, somado: soma, diferenca: arred(vNF - soma, 2),
        ok: okNF, composicao: detalhe,
        ressalva: 'Composição definida na própria regra W16-10.'
      });
      if (!okNF) {
        col.add({
          nivel: 'erro', grupo: 'Totalizadores', alvo: 'infNFe/total/ICMSTot/vNF',
          linha: vNFno.linha,
          titulo: 'Valor total da nota não confere com a composição oficial',
          detalhe: detalhe.map(function (c) {
            return c.sinal + ' ' + c.campo + ' ' + moeda(c.valor);
          }).join('  '),
          esperado: moeda(soma), obtido: moeda(vNF),
          fonte: citNF.fonte, regra: citNF.regra
        });
      }
    }

    return linhas;
  }

  // ------------------------------------------------------------------
  // 3. coerencia CST / CSOSN / CRT / CFOP
  // ------------------------------------------------------------------
  function confereCoerencia(infNFe, col) {
    var emit = Leitor.acha(infNFe, 'emit');
    var ide = Leitor.acha(infNFe, 'ide');
    var crt = emit ? Leitor.valor(emit, 'CRT') : '';
    var idDest = ide ? Leitor.valor(ide, 'idDest') : '';

    Leitor.filhos(infNFe, 'det').forEach(function (det) {
      var nItem = det.atributos.nItem || '?';
      var prod = Leitor.filho(det, 'prod');
      var sit = situacaoICMS(det);
      var cfop = prod ? Leitor.valor(prod, 'CFOP') : '';

      // CRT x CST/CSOSN — regras N12-20 e N12a-10
      if (sit && crt) {
        if (crt === '1' && sit.cst) {
          var c1 = citaRegra('N12-20');
          col.add({
            nivel: 'erro', grupo: 'Regime tributário',
            alvo: sit.no.caminho + '/CST', linha: sit.no.linha, campoId: 'N12',
            titulo: 'Item ' + nItem + ' — CST informado para emitente do Simples Nacional',
            detalhe: c1.regra ? c1.regra.regra : '',
            esperado: 'CSOSN (CRT = 1)', obtido: 'CST = ' + sit.cst,
            fonte: c1.fonte, regra: c1.regra
          });
        }
        if (crt !== '1' && sit.csosn) {
          var c2 = citaRegra('N12a-10');
          col.add({
            nivel: 'erro', grupo: 'Regime tributário',
            alvo: sit.no.caminho + '/CSOSN', linha: sit.no.linha, campoId: 'N12a',
            titulo: 'Item ' + nItem + ' — CSOSN informado para emitente fora do Simples Nacional',
            detalhe: c2.regra ? c2.regra.regra : '',
            esperado: 'CST (CRT = ' + crt + ')', obtido: 'CSOSN = ' + sit.csosn,
            fonte: c2.fonte, regra: c2.regra
          });
        }
      }

      // CFOP de exportacao — regra N12-10
      if (cfop && cfop.charAt(0) === '7' && sit) {
        var exportacaoOk = sit.cst === '41' || sit.csosn === '300';
        if (!exportacaoOk) {
          var c3 = citaRegra('N12-10');
          col.add({
            nivel: 'aviso', grupo: 'Operação', alvo: det.caminho + '/prod/CFOP',
            linha: prod.linha, campoId: 'I08',
            titulo: 'Item ' + nItem + ' — CFOP de exportação com situação tributária divergente',
            detalhe: (c3.regra ? c3.regra.regra : '')
              + ' Há exceções previstas no próprio enunciado; confirme com o time fiscal.',
            esperado: 'CST 41 ou CSOSN 300', obtido: (sit.cst || sit.csosn || '—'),
            fonte: c3.fonte, regra: c3.regra
          });
        }
      }

      // CFOP x destino da operacao
      if (cfop && idDest) {
        var faixa = cfop.charAt(0);
        var esperada = { '1': ['1', '5'], '2': ['2', '6'], '3': ['3', '7'] }[idDest];
        if (esperada && esperada.indexOf(faixa) === -1) {
          col.add({
            nivel: 'aviso', grupo: 'Operação', alvo: det.caminho + '/prod/CFOP',
            linha: prod.linha, campoId: 'I08',
            titulo: 'Item ' + nItem + ' — CFOP não corresponde ao destino informado',
            detalhe: 'idDest = ' + idDest + ' indica operação '
              + { '1': 'interna', '2': 'interestadual', '3': 'com o exterior' }[idDest]
              + '. O primeiro dígito do CFOP deveria ser ' + esperada.join(' ou ') + '.',
            esperado: 'CFOP iniciando por ' + esperada.join(' ou '), obtido: cfop,
            fonte: 'ANEXO I — campos B11 (idDest) e I08 (CFOP)'
          });
        }
      }
    });
  }

  // ------------------------------------------------------------------
  // 4. Reforma Tributaria — IBS, CBS e IS (NT 2025.002-RTC)
  // ------------------------------------------------------------------
  function confereRTC(infNFe, col, tol) {
    var achouGrupo = false;
    var resumo = { presente: false, itens: [], totais: [], pendencias: [] };

    Leitor.filhos(infNFe, 'det').forEach(function (det) {
      var nItem = det.atributos.nItem || '?';
      var imposto = Leitor.filho(det, 'imposto');
      if (!imposto) return;
      var ibscbs = Leitor.filho(imposto, 'IBSCBS');
      if (!ibscbs) return;
      achouGrupo = true;

      var linha = { item: nItem, cst: Leitor.valor(ibscbs, 'CST'),
        cClassTrib: Leitor.valor(ibscbs, 'cClassTrib'), divergencias: 0 };

      // CST (3 digitos) e cClassTrib (6 digitos): a relacao de valores e
      // mantida fora do documento, no portal da SVRS. Aqui so o formato e
      // verificavel; o conteudo fica como ponto de conferencia.
      if (linha.cst && !/^\d{3}$/.test(linha.cst)) {
        col.add({
          nivel: 'erro', grupo: 'Reforma tributária',
          alvo: ibscbs.caminho + '/CST', linha: ibscbs.linha, campoId: 'UB13',
          titulo: 'Item ' + nItem + ' — CST de IBS/CBS fora do formato',
          esperado: '3 dígitos', obtido: linha.cst,
          fonte: 'NT 2025.002-RTC — campo UB13'
        });
      }
      if (linha.cClassTrib && !/^\d{6}$/.test(linha.cClassTrib)) {
        col.add({
          nivel: 'erro', grupo: 'Reforma tributária',
          alvo: ibscbs.caminho + '/cClassTrib', linha: ibscbs.linha,
          titulo: 'Item ' + nItem + ' — cClassTrib fora do formato',
          esperado: '6 dígitos', obtido: linha.cClassTrib,
          fonte: 'NT 2025.002-RTC — Tabela de Classificação Tributária'
        });
      }

      var g = Leitor.filho(ibscbs, 'gIBSCBS');
      if (!g) { resumo.itens.push(linha); return; }
      var vBC = num(Leitor.valor(g, 'vBC'));
      linha.vBC = vBC;

      function confereTributo(caminhoGrupo, pTag, vTag, rotulo) {
        var sub = Leitor.filho(g, caminhoGrupo);
        if (!sub) return;
        var p = num(Leitor.valor(sub, pTag));
        var v = num(Leitor.valor(sub, vTag));
        if (vBC === null || p === null || v === null) return;
        var esperado = arred(vBC * p / 100, 2);
        if (!fecha(v, esperado, tol)) {
          linha.divergencias++;
          col.add({
            nivel: 'erro', grupo: 'Reforma tributária',
            alvo: sub.caminho + '/' + vTag,
            linha: (Leitor.filho(sub, vTag) || sub).linha,
            titulo: 'Item ' + nItem + ' — ' + rotulo + ' não confere com base × alíquota',
            detalhe: vTag + ' = vBC (' + moeda(vBC) + ') × ' + pTag + ' (' + pct(p) + ')',
            esperado: moeda(esperado), obtido: moeda(v),
            fonte: 'NT 2025.002-RTC — grupo ' + caminhoGrupo
          });
        }
        linha[vTag] = v;
      }

      confereTributo('gIBSUF', 'pIBSUF', 'vIBSUF', 'IBS estadual');
      confereTributo('gIBSMun', 'pIBSMun', 'vIBSMun', 'IBS municipal');
      confereTributo('gCBS', 'pCBS', 'vCBS', 'CBS');

      resumo.itens.push(linha);
    });

    resumo.presente = achouGrupo;

    if (achouGrupo) {
      resumo.pendencias.push({
        titulo: 'CST de IBS/CBS e cClassTrib',
        texto: 'A relação de códigos válidos e a vinculação entre CST e '
          + 'cClassTrib são publicadas fora da NT, no portal da SVRS. A '
          + 'ferramenta confere o formato; a validade do código precisa ser '
          + 'conferida na tabela oficial.',
        link: PORTAL_CLASSIFICACAO
      });
      resumo.pendencias.push({
        titulo: 'Alíquotas do período de transição',
        texto: 'A regra UB18-10 fixa alíquotas específicas por período de '
          + 'vigência. A conferência de qual alíquota se aplica a cada data é '
          + 'matéria do time fiscal.',
        link: ''
      });

      // totalizadores do RTC
      var totRTC = Leitor.acha(infNFe, 'IBSCBSTot');
      if (totRTC) {
        [['gIBS/gIBSUF/vIBSUF', 'vIBSUF'], ['gIBS/gIBSMun/vIBSMun', 'vIBSMun'],
         ['gCBS/vCBS', 'vCBS']].forEach(function (par) {
          var partes = par[0].split('/');
          var no = totRTC;
          partes.forEach(function (p) { no = no ? Leitor.filho(no, p) : null; });
          if (!no) return;
          var declarado = num(no.texto);
          var somado = 0, achou = false;
          resumo.itens.forEach(function (it) {
            if (it[par[1]] !== undefined && it[par[1]] !== null) {
              somado += it[par[1]]; achou = true;
            }
          });
          if (declarado === null || !achou) return;
          somado = arred(somado, 2);
          var ok = fecha(declarado, somado, tol);
          resumo.totais.push({ campo: par[1], declarado: declarado,
            somado: somado, diferenca: arred(declarado - somado, 2), ok: ok });
          if (!ok) {
            col.add({
              nivel: 'erro', grupo: 'Reforma tributária', alvo: no.caminho,
              linha: no.linha,
              titulo: 'Total de ' + par[1] + ' não confere com a soma dos itens',
              esperado: moeda(somado), obtido: moeda(declarado),
              fonte: 'NT 2025.002-RTC — grupo de totais IBSCBSTot'
            });
          }
        });
      }
    }

    return resumo;
  }

  // ------------------------------------------------------------------
  function confere(infNFe, col, opcoes) {
    var tol = opcoes.tolerancia;
    var itens = confereItens(infNFe, col, tol);
    var totais = confereTotais(infNFe, col, tol);
    confereCoerencia(infNFe, col);
    var rtc = confereRTC(infNFe, col, tol);

    return {
      itens: itens,
      totais: totais,
      rtc: rtc,
      tolerancia: tol,
      portalClassificacao: PORTAL_CLASSIFICACAO
    };
  }

  raiz.NFe.Tributos = { confere: confere, moeda: moeda, pct: pct, num: num, arred: arred };

  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.NFe.Tributos;
})(typeof globalThis !== 'undefined' ? globalThis : this);
