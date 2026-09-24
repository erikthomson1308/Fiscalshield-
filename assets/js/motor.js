/* Motor de validacao estrutural.
 *
 * Confere o XML contra a base de dados extraida dos documentos oficiais:
 * existencia do elemento no leiaute, obrigatoriedade, ordem, ocorrencia,
 * tipo, tamanho, casas decimais e dominio de valores. Alem disso, confere o
 * que e verificavel por calculo: digito verificador da chave de acesso, do
 * CNPJ e do CPF, e a coerencia dos 44 digitos da chave com o corpo da nota.
 *
 * Toda constatacao carrega a origem (documento e pagina) do que a sustenta.
 */
(function (raiz) {
  'use strict';

  var Base = raiz.Base;
  var Leitor = raiz.Leitor;

  var ANCORAS = ['infNFe', 'infNFeSupl'];

  // O bloco de assinatura digital e irmao de infNFe no arquivo, nao filho, e
  // sua conferencia e criptografica - fora do escopo da validacao de leiaute.
  var FORA_DO_ESCOPO = { Signature: 1 };

  var UF_IBGE = {
    11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
    21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL',
    28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR',
    42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
  };

  // ------------------------------------------------------------------
  // coletor de achados
  // ------------------------------------------------------------------
  function Coletor() {
    this.itens = [];
    this.conferidos = 0;
  }
  Coletor.prototype.add = function (o) {
    this.itens.push({
      nivel: o.nivel,                 // 'erro' | 'aviso' | 'info'
      grupo: o.grupo,                 // categoria do achado
      alvo: o.alvo || '',             // caminho XML
      linha: o.linha || 0,
      campoId: o.campoId || '',
      titulo: o.titulo,
      detalhe: o.detalhe || '',
      esperado: o.esperado === undefined ? '' : String(o.esperado),
      obtido: o.obtido === undefined ? '' : String(o.obtido),
      fonte: o.fonte || '',
      regra: o.regra || null
    });
  };

  // ------------------------------------------------------------------
  // auxiliares
  // ------------------------------------------------------------------
  function citacao(def) {
    if (!def) return '';
    if (def.fonte === 'ajuste') {
      return 'Ajuste declarado em data/ajustes.json — ' + (def.justificativa || '');
    }
    var t = def.doc || '';
    if (def.pagina) t += ', p. ' + def.pagina;
    if (def.id) t += ' — campo ' + def.id;
    return t;
  }

  function regraCitada(campoId) {
    var rs = Base.regrasDe(campoId);
    return rs.length ? rs[0] : null;
  }

  function soDigitos(s) { return /^\d+$/.test(s); }

  function modulo11(digitos) {
    var peso = 2, soma = 0;
    for (var i = digitos.length - 1; i >= 0; i--) {
      soma += parseInt(digitos.charAt(i), 10) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    var resto = soma % 11;
    return (resto === 0 || resto === 1) ? 0 : 11 - resto;
  }

  function dvCNPJ(base12) {
    function calc(seq, pesos) {
      var s = 0;
      for (var i = 0; i < seq.length; i++) s += parseInt(seq.charAt(i), 10) * pesos[i];
      var r = s % 11;
      return r < 2 ? 0 : 11 - r;
    }
    var d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    var d2 = calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return '' + d1 + d2;
  }

  function cnpjValido(v) {
    if (!/^\d{14}$/.test(v)) return false;
    if (/^(\d)\1{13}$/.test(v)) return false;
    return dvCNPJ(v.slice(0, 12)) === v.slice(12);
  }

  function cpfValido(v) {
    if (!/^\d{11}$/.test(v)) return false;
    if (/^(\d)\1{10}$/.test(v)) return false;
    function calc(n) {
      var s = 0;
      for (var i = 0; i < n; i++) s += parseInt(v.charAt(i), 10) * (n + 1 - i);
      var r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    }
    return calc(9) === +v.charAt(9) && calc(10) === +v.charAt(10);
  }

  // ------------------------------------------------------------------
  // validacao de um elemento contra sua definicao
  // ------------------------------------------------------------------
  function confereValor(no, def, col) {
    var v = no.texto;
    var ehFolha = no.filhos.length === 0;
    if (!ehFolha) return;

    var grupoDef = def.ele === 'G' || def.ele === 'CG';
    if (grupoDef) return;

    if (v === '') {
      // alguns campos sao explicitamente autorizados a vir vazios pelo
      // proprio leiaute (idEstrangeiro, por exemplo, "aceita valor nulo")
      if (Base.aceitaVazio(def)) return;
      col.add({
        nivel: 'erro', grupo: 'Conteúdo', alvo: no.caminho, linha: no.linha,
        campoId: def.id,
        titulo: 'Campo presente mas vazio',
        detalhe: 'O elemento <' + no.nome + '> foi informado sem conteúdo. '
          + 'Campo não utilizado deve ser omitido, não enviado em branco.',
        fonte: citacao(def), regra: regraCitada(def.id)
      });
      return;
    }

    // ---- tipo
    if (def.tipo === 'N') {
      if (!/^-?\d+(\.\d+)?$/.test(v)) {
        col.add({
          nivel: 'erro', grupo: 'Tipo', alvo: no.caminho, linha: no.linha,
          campoId: def.id, titulo: 'Valor não numérico em campo numérico',
          esperado: 'apenas dígitos, separador decimal ponto',
          obtido: v, detalhe: def.desc, fonte: citacao(def),
          regra: regraCitada(def.id)
        });
        return;
      }
      if (v.indexOf(',') !== -1) {
        col.add({
          nivel: 'erro', grupo: 'Tipo', alvo: no.caminho, linha: no.linha,
          campoId: def.id, titulo: 'Separador decimal inválido',
          esperado: 'ponto', obtido: v, fonte: citacao(def)
        });
      }
    } else if (def.tipo === 'D') {
      var ok = /^\d{4}-\d{2}-\d{2}$/.test(v)
        || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([-+]\d{2}:\d{2}|Z)?$/.test(v);
      if (!ok) {
        col.add({
          nivel: 'erro', grupo: 'Tipo', alvo: no.caminho, linha: no.linha,
          campoId: def.id, titulo: 'Data ou data/hora fora do formato',
          esperado: 'AAAA-MM-DD ou AAAA-MM-DDThh:mm:ssTZD',
          obtido: v, fonte: citacao(def), regra: regraCitada(def.id)
        });
      }
    }

    // ---- tamanho
    var t = Base.tamanho(def.tam);
    if (t) {
      if (t.tipo === 'fixo' && v.length !== t.n && def.tipo !== 'N') {
        col.add({
          nivel: 'erro', grupo: 'Tamanho', alvo: no.caminho, linha: no.linha,
          campoId: def.id, titulo: 'Tamanho diferente do previsto',
          esperado: t.n + ' caracteres', obtido: v.length + ' caracteres',
          detalhe: v, fonte: citacao(def), regra: regraCitada(def.id)
        });
      } else if (t.tipo === 'fixo' && def.tipo === 'N' && v.length > t.n) {
        col.add({
          nivel: 'erro', grupo: 'Tamanho', alvo: no.caminho, linha: no.linha,
          campoId: def.id, titulo: 'Valor acima do tamanho previsto',
          esperado: 'até ' + t.n + ' dígitos', obtido: v.length + ' dígitos',
          detalhe: v, fonte: citacao(def), regra: regraCitada(def.id)
        });
      } else if (t.tipo === 'faixa' && (v.length < t.min || v.length > t.max)) {
        col.add({
          nivel: 'erro', grupo: 'Tamanho', alvo: no.caminho, linha: no.linha,
          campoId: def.id, titulo: 'Tamanho fora da faixa prevista',
          esperado: 'de ' + t.min + ' a ' + t.max + ' caracteres',
          obtido: v.length + ' caracteres', detalhe: v,
          fonte: citacao(def), regra: regraCitada(def.id)
        });
      } else if (t.tipo === 'exatos' && t.exatos.indexOf(v.length) === -1) {
        col.add({
          nivel: 'erro', grupo: 'Tamanho', alvo: no.caminho, linha: no.linha,
          campoId: def.id, titulo: 'Tamanho fora dos valores previstos',
          esperado: t.exatos.join(' ou ') + ' caracteres',
          obtido: v.length + ' caracteres', fonte: citacao(def),
          regra: regraCitada(def.id)
        });
      } else if (t.tipo === 'decimal') {
        var partes = v.split('.');
        var inteiros = partes[0].replace('-', '').length;
        var decimais = partes[1] ? partes[1].length : 0;
        if (inteiros > t.intMax) {
          col.add({
            nivel: 'erro', grupo: 'Tamanho', alvo: no.caminho, linha: no.linha,
            campoId: def.id, titulo: 'Parte inteira acima do previsto',
            esperado: 'até ' + t.intMax + ' dígitos inteiros',
            obtido: inteiros + ' dígitos', detalhe: v, fonte: citacao(def)
          });
        }
        if (decimais > t.decMax) {
          col.add({
            nivel: 'erro', grupo: 'Casas decimais', alvo: no.caminho,
            linha: no.linha, campoId: def.id,
            titulo: 'Casas decimais acima do previsto',
            esperado: 'até ' + t.decMax + ' casas (' + t.bruto + ')',
            obtido: decimais + ' casas', detalhe: v, fonte: citacao(def),
            regra: regraCitada(def.id)
          });
        } else if (decimais < t.decMin) {
          col.add({
            nivel: 'aviso', grupo: 'Casas decimais', alvo: no.caminho,
            linha: no.linha, campoId: def.id,
            titulo: 'Casas decimais abaixo do previsto',
            esperado: 'ao menos ' + t.decMin + ' casas (' + t.bruto + ')',
            obtido: decimais + ' casas', detalhe: v, fonte: citacao(def)
          });
        }
      }
    }

    // ---- dominio
    if (def.dominio && def.dominio.valores.length) {
      var lista = def.dominio.valores.map(function (x) { return x.valor; });
      var achou = lista.indexOf(v) !== -1
        || lista.indexOf(String(parseInt(v, 10))) !== -1;
      if (!achou) {
        col.add({
          nivel: def.dominio.fechado ? 'erro' : 'aviso',
          grupo: 'Domínio', alvo: no.caminho, linha: no.linha, campoId: def.id,
          titulo: def.dominio.fechado
            ? 'Valor fora do domínio previsto'
            : 'Valor não consta na relação do leiaute',
          esperado: lista.slice(0, 24).join(', ')
            + (lista.length > 24 ? ' …' : ''),
          obtido: v,
          detalhe: def.dominio.fechado ? def.desc
            : def.desc + ' A relação do leiaute pode não ser exaustiva para '
              + 'este campo; confira antes de tratar como erro.',
          fonte: citacao(def), regra: regraCitada(def.id)
        });
      }
    }

    col.conferidos++;
  }

  // ------------------------------------------------------------------
  // filhos: obrigatoriedade, ocorrencia, ordem, grupos alternativos
  // ------------------------------------------------------------------
  function confereFilhos(no, col, opcoes) {
    var previstos = Base.previstos(no.caminho);
    if (!previstos.length) return;

    var contagem = Object.create(null);
    no.filhos.forEach(function (f) {
      contagem[f.nome] = (contagem[f.nome] || 0) + 1;
    });

    // grupos alternativos declarados no leiaute ("Sequência XML")
    var gruposAlt = Object.create(null);
    previstos.forEach(function (d) {
      if (d.alt) (gruposAlt[d.alt] || (gruposAlt[d.alt] = [])).push(d);
    });
    var altPresente = Object.create(null);
    Object.keys(gruposAlt).forEach(function (g) {
      altPresente[g] = gruposAlt[g].some(function (d) { return contagem[d.tag]; });
    });
    var altUsados = Object.keys(gruposAlt).filter(function (g) { return altPresente[g]; });
    if (altUsados.length > 1) {
      col.add({
        nivel: 'erro', grupo: 'Estrutura', alvo: no.caminho, linha: no.linha,
        titulo: 'Alternativas mutuamente exclusivas informadas ao mesmo tempo',
        detalhe: 'O leiaute prevê que apenas uma das sequências seja informada '
          + 'em <' + no.nome + '>. Foram encontradas ' + altUsados.length + '.',
        esperado: 'uma sequência', obtido: altUsados.join(' e '),
        fonte: citacao(previstos[0])
      });
    }

    // Grupos de escolha (ele = CG). A exclusividade so e exigida quando os
    // irmaos sao todos 1-1: e o caso de ICMS00|ICMS10|ICMS20..., em que o
    // leiaute exige exatamente um. Quando sao 0-1 (ICMS, IPI, II sob
    // imposto), o documento usa CG apenas como marcacao de variante e os
    // grupos convivem na mesma nota - exigir exclusividade ali seria inventar
    // uma restricao que o leiaute nao faz.
    var escolhas = previstos.filter(function (d) { return d.ele === 'CG'; });
    var escolhaReal = escolhas.length > 1 && escolhas.every(function (d) {
      return Base.ocorrencia(d.ocor).min === 1;
    });
    if (escolhaReal) {
      var presentes = escolhas.filter(function (d) { return contagem[d.tag]; });
      if (presentes.length > 1) {
        col.add({
          nivel: 'erro', grupo: 'Estrutura', alvo: no.caminho, linha: no.linha,
          titulo: 'Mais de um grupo de escolha informado',
          detalhe: 'Em <' + no.nome + '> o leiaute admite apenas um dos grupos.',
          esperado: 'um grupo', obtido: presentes.map(function (d) { return d.tag; }).join(', '),
          fonte: citacao(escolhas[0])
        });
      }
      if (presentes.length === 0 && no.filhos.length === 0) {
        col.add({
          nivel: 'erro', grupo: 'Estrutura', alvo: no.caminho, linha: no.linha,
          titulo: 'Grupo sem nenhuma das opções previstas',
          esperado: escolhas.map(function (d) { return d.tag; }).join(' | '),
          obtido: 'vazio', fonte: citacao(escolhas[0])
        });
      }
    }

    // elementos de escolha (ele = CE): exatamente um irmao do conjunto.
    // E o caso de CNPJ ou CPF no emitente e no destinatario.
    var alternativos = previstos.filter(function (d) { return d.ele === 'CE'; });
    var exigidoCE = Object.create(null);
    if (alternativos.length > 1) {
      var usados = alternativos.filter(function (d) { return contagem[d.tag]; });
      var obrigatorio = alternativos.some(function (d) {
        return Base.ocorrencia(d.ocor).min >= 1;
      });
      alternativos.forEach(function (d) { exigidoCE[d.tag] = true; });

      if (usados.length > 1) {
        col.add({
          nivel: 'erro', grupo: 'Estrutura', alvo: no.caminho, linha: no.linha,
          titulo: 'Campos mutuamente exclusivos informados juntos',
          detalhe: 'Em <' + no.nome + '> o leiaute admite apenas um destes campos.',
          esperado: alternativos.map(function (d) { return d.tag; }).join(' ou '),
          obtido: usados.map(function (d) { return d.tag; }).join(' e '),
          fonte: citacao(alternativos[0])
        });
      } else if (usados.length === 0 && obrigatorio) {
        col.add({
          nivel: 'erro', grupo: 'Obrigatório', alvo: no.caminho, linha: no.linha,
          titulo: 'Nenhum dos campos alternativos foi informado',
          esperado: alternativos.map(function (d) { return d.tag; }).join(' ou '),
          obtido: 'ausente', fonte: citacao(alternativos[0]),
          regra: regraCitada(alternativos[0].id)
        });
      }
    }

    previstos.forEach(function (d) {
      if (d.ele === 'CG') return;                   // tratado acima
      if (d.ele === 'CE' && exigidoCE[d.tag]) return;
      if (d.ele === 'A' || d.ele === 'ID') return;  // atributo, nao elemento
      if (FORA_DO_ESCOPO[d.tag]) return;
      var oc = Base.ocorrencia(d.ocor);
      var n = contagem[d.tag] || 0;

      // campo que o próprio leiaute marca como retirado na versão 4.00
      if (d.removido) {
        if (n > 0) {
          col.add({
            nivel: 'erro', grupo: 'Leiaute', alvo: no.caminho + '/' + d.tag,
            linha: no.linha, campoId: d.id,
            titulo: 'Campo excluído do leiaute foi informado',
            detalhe: d.removido + '. ' + (d.desc || ''),
            esperado: 'campo ausente', obtido: 'informado',
            fonte: citacao(d), regra: regraCitada(d.id)
          });
        }
        return;
      }

      if (n === 0 && oc.min >= 1) {
        // se o campo pertence a uma alternativa nao usada, nao e exigido
        if (d.alt && !altPresente[d.alt]) return;
        col.add({
          nivel: 'erro', grupo: 'Obrigatório', alvo: no.caminho + '/' + d.tag,
          linha: no.linha, campoId: d.id,
          titulo: 'Campo obrigatório ausente',
          detalhe: d.desc || d.tag,
          esperado: 'ocorrência ' + oc.bruto, obtido: 'ausente',
          fonte: citacao(d), regra: regraCitada(d.id)
        });
      } else if (n > oc.max) {
        col.add({
          nivel: 'erro', grupo: 'Ocorrência', alvo: no.caminho + '/' + d.tag,
          linha: no.linha, campoId: d.id,
          titulo: 'Elemento repetido acima do permitido',
          esperado: 'até ' + oc.max, obtido: n + ' ocorrências',
          detalhe: d.desc, fonte: citacao(d), regra: regraCitada(d.id)
        });
      }
    });

    // ---- ordem dos elementos
    // So e conferida quando todos os filhos previstos vieram do mesmo
    // documento. Grupos alimentados por documentos diferentes (o leiaute
    // base mais a NT da Reforma) nao tem numeracao de sequencia comparavel,
    // e compara-los produziria alarme falso.
    var fontesFilhos = {};
    previstos.forEach(function (d) { fontesFilhos[d.fonte] = 1; });
    var fonteUnica = Object.keys(fontesFilhos).length === 1;

    if (opcoes.ordem !== 'ignora' && fonteUnica) {
      var ultima = -1, quebrou = null;
      for (var k = 0; k < no.filhos.length; k++) {
        var f = no.filhos[k];
        var d = Base.campo(f.caminho);
        if (!d || d.posicao === undefined) continue;
        if (d.posicao < ultima) { quebrou = f; break; }
        ultima = d.posicao;
      }
      if (quebrou) {
        var ordemEsperada = previstos.map(function (x) { return x.tag; });
        col.add({
          nivel: opcoes.ordem === 'erro' ? 'erro' : 'aviso',
          grupo: 'Ordem', alvo: quebrou.caminho, linha: quebrou.linha,
          titulo: 'Elemento fora da ordem do leiaute',
          detalhe: 'O schema da NF-e exige a sequência definida no leiaute. '
            + '<' + quebrou.nome + '> aparece depois de um elemento que o sucede.',
          esperado: ordemEsperada.join(' → '),
          obtido: no.filhos.map(function (x) { return x.nome; }).join(' → '),
          fonte: citacao(previstos[0])
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // chave de acesso
  // ------------------------------------------------------------------
  function confereChave(infNFe, col) {
    var id = infNFe.atributos.Id || '';
    var chave = id.replace(/^NFe/, '');

    if (!id) {
      col.add({
        nivel: 'erro', grupo: 'Chave de acesso', alvo: 'infNFe@Id',
        linha: infNFe.linha, titulo: 'Atributo Id ausente em infNFe',
        fonte: 'ANEXO I — campo A03'
      });
      return null;
    }
    if (!/^NFe\d{44}$/.test(id)) {
      col.add({
        nivel: 'erro', grupo: 'Chave de acesso', alvo: 'infNFe@Id',
        linha: infNFe.linha, titulo: 'Id fora do formato previsto',
        esperado: 'literal "NFe" seguido de 44 dígitos', obtido: id,
        fonte: 'ANEXO I — campo A03'
      });
      return null;
    }

    var dvInformado = chave.charAt(43);
    var dvCalculado = String(modulo11(chave.slice(0, 43)));
    if (dvInformado !== dvCalculado) {
      col.add({
        nivel: 'erro', grupo: 'Chave de acesso', alvo: 'infNFe@Id',
        linha: infNFe.linha,
        titulo: 'Dígito verificador da chave de acesso incorreto',
        detalhe: 'Cálculo por módulo 11 sobre os 43 primeiros dígitos.',
        esperado: dvCalculado, obtido: dvInformado,
        fonte: 'ANEXO I — composição da chave de acesso (campo B26 / cDV)'
      });
    }

    var partes = {
      cUF: chave.slice(0, 2), aamm: chave.slice(2, 6), cnpj: chave.slice(6, 20),
      mod: chave.slice(20, 22), serie: chave.slice(22, 25),
      nNF: chave.slice(25, 34), tpEmis: chave.slice(34, 35),
      cNF: chave.slice(35, 43), cDV: chave.slice(43)
    };

    var ide = Leitor.acha(infNFe, 'ide');
    var emit = Leitor.acha(infNFe, 'emit');
    if (!ide) return partes;

    function compara(rotulo, doXml, daChave, normaliza) {
      if (!doXml) return;
      var a = normaliza ? normaliza(doXml) : doXml;
      var b = normaliza ? normaliza(daChave) : daChave;
      if (a !== b) {
        col.add({
          nivel: 'erro', grupo: 'Chave de acesso', alvo: 'infNFe@Id',
          linha: infNFe.linha,
          titulo: 'Chave de acesso não confere com ' + rotulo,
          esperado: rotulo + ' = ' + doXml, obtido: 'na chave = ' + daChave,
          detalhe: 'Os 44 dígitos da chave são formados pelos próprios dados '
            + 'da nota; divergência indica chave montada de forma incorreta.',
          fonte: 'ANEXO I — composição da chave de acesso'
        });
      }
    }
    var semZero = function (s) { return String(parseInt(s, 10)); };

    compara('cUF', Leitor.valor(ide, 'cUF'), partes.cUF, semZero);
    compara('mod', Leitor.valor(ide, 'mod'), partes.mod, semZero);
    compara('serie', Leitor.valor(ide, 'serie'), partes.serie, semZero);
    compara('nNF', Leitor.valor(ide, 'nNF'), partes.nNF, semZero);
    compara('tpEmis', Leitor.valor(ide, 'tpEmis'), partes.tpEmis, semZero);
    compara('cNF', Leitor.valor(ide, 'cNF'), partes.cNF, semZero);

    var dh = Leitor.valor(ide, 'dhEmi') || Leitor.valor(ide, 'dEmi');
    if (/^\d{4}-\d{2}/.test(dh)) {
      var aamm = dh.slice(2, 4) + dh.slice(5, 7);
      compara('ano e mês de emissão', aamm, partes.aamm);
    }
    if (emit) {
      var cnpjEmit = Leitor.valor(emit, 'CNPJ');
      if (cnpjEmit) compara('CNPJ do emitente', cnpjEmit, partes.cnpj, semZero);
    }

    // cNF nao pode repetir o nNF
    var cNF = Leitor.valor(ide, 'cNF');
    var nNF = Leitor.valor(ide, 'nNF');
    if (cNF && nNF && parseInt(cNF, 10) === parseInt(nNF, 10)) {
      var r = Base.dados.porRegra['B03-10'] || null;
      col.add({
        nivel: 'erro', grupo: 'Identificação', alvo: 'infNFe/ide/cNF',
        linha: (Leitor.filho(ide, 'cNF') || ide).linha,
        campoId: 'B03',
        titulo: 'Código numérico igual ao número da nota',
        detalhe: 'O código numérico (cNF) não pode ser igual ao número da '
          + 'nota fiscal (nNF).',
        esperado: 'cNF diferente de nNF', obtido: 'cNF = nNF = ' + nNF,
        fonte: 'Regras de validação — campo B03', regra: r
      });
    }

    return partes;
  }

  // ------------------------------------------------------------------
  // cadastro: CNPJ, CPF, UF, municipio
  // ------------------------------------------------------------------
  function confereCadastro(infNFe, col) {
    Leitor.percorre(infNFe, function (no) {
      if (no.filhos.length) return;
      var v = no.texto;
      if (!v) return;

      if (no.nome === 'CNPJ' && !cnpjValido(v)) {
        col.add({
          nivel: 'erro', grupo: 'Cadastro', alvo: no.caminho, linha: no.linha,
          titulo: 'CNPJ com dígito verificador inválido',
          obtido: v, esperado: 'CNPJ com DV consistente',
          detalhe: 'Cálculo padrão de DV do CNPJ (módulo 11).',
          fonte: 'Cálculo de dígito verificador — Receita Federal'
        });
      }
      if (no.nome === 'CPF' && !cpfValido(v)) {
        col.add({
          nivel: 'erro', grupo: 'Cadastro', alvo: no.caminho, linha: no.linha,
          titulo: 'CPF com dígito verificador inválido',
          obtido: v, esperado: 'CPF com DV consistente',
          fonte: 'Cálculo de dígito verificador — Receita Federal'
        });
      }
      if ((no.nome === 'cMun' || no.nome === 'cMunFG' || no.nome === 'cMunFGIBS')
          && /^\d{7}$/.test(v)) {
        // 9999999 e o codigo previsto para operacao com o exterior
        if (v === '9999999') return;
        var uf = parseInt(v.slice(0, 2), 10);
        if (!UF_IBGE[uf]) {
          col.add({
            nivel: 'erro', grupo: 'Cadastro', alvo: no.caminho, linha: no.linha,
            titulo: 'Código de município com UF inexistente',
            obtido: v, esperado: 'os dois primeiros dígitos devem ser um código de UF do IBGE',
            fonte: 'Tabela de códigos de UF e município do IBGE'
          });
        }
      }
      if (no.nome === 'cUF' || no.nome === 'cUFDest') {
        if (!UF_IBGE[parseInt(v, 10)]) {
          col.add({
            nivel: 'erro', grupo: 'Cadastro', alvo: no.caminho, linha: no.linha,
            titulo: 'Código de UF inexistente',
            obtido: v, esperado: Object.keys(UF_IBGE).join(', '),
            fonte: 'Tabela de códigos de UF do IBGE'
          });
        }
      }
      if (no.nome === 'UF' || no.nome === 'UFEmbarq' || no.nome === 'UFDesemb') {
        var siglas = Object.keys(UF_IBGE).map(function (k) { return UF_IBGE[k]; });
        if (v !== 'EX' && siglas.indexOf(v) === -1) {
          col.add({
            nivel: 'erro', grupo: 'Cadastro', alvo: no.caminho, linha: no.linha,
            titulo: 'Sigla de UF inválida', obtido: v,
            esperado: siglas.join(', ') + ' ou EX',
            fonte: 'Tabela de UF do IBGE'
          });
        }
      }
    });

    // coerencia entre cUF do ide e a UF do emitente
    var ide = Leitor.acha(infNFe, 'ide');
    var emit = Leitor.acha(infNFe, 'emit');
    if (ide && emit) {
      var cUF = parseInt(Leitor.valor(ide, 'cUF'), 10);
      var ender = Leitor.filho(emit, 'enderEmit');
      var ufEmit = ender ? Leitor.valor(ender, 'UF') : '';
      if (UF_IBGE[cUF] && ufEmit && UF_IBGE[cUF] !== ufEmit) {
        col.add({
          nivel: 'erro', grupo: 'Identificação', alvo: 'infNFe/ide/cUF',
          linha: ide.linha, campoId: 'B02',
          titulo: 'UF do emitente diverge do código de UF da nota',
          esperado: 'cUF ' + cUF + ' = ' + UF_IBGE[cUF],
          obtido: 'enderEmit/UF = ' + ufEmit,
          fonte: 'ANEXO I — campo B02'
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // atributos (ele = A ou ID no leiaute): Id, versao, nItem
  // ------------------------------------------------------------------
  function confereAtributos(no, col) {
    var previstos = Base.previstos(no.caminho).filter(function (d) {
      return d.ele === 'A' || d.ele === 'ID';
    });
    if (!previstos.length) return;

    previstos.forEach(function (d) {
      var valor = no.atributos[d.tag];
      var oc = Base.ocorrencia(d.ocor);

      if (valor === undefined) {
        if (oc.min >= 1) {
          col.add({
            nivel: 'erro', grupo: 'Obrigatório',
            alvo: no.caminho + '@' + d.tag, linha: no.linha, campoId: d.id,
            titulo: 'Atributo obrigatório ausente',
            detalhe: d.desc || d.tag,
            esperado: 'atributo ' + d.tag + ' em <' + no.nome + '>',
            obtido: 'ausente', fonte: citacao(d), regra: regraCitada(d.id)
          });
        }
        return;
      }

      confereValor({
        caminho: no.caminho + '@' + d.tag,
        linha: no.linha,
        nome: '@' + d.tag,
        texto: valor,
        filhos: []
      }, d, col);
    });

    // atributos presentes no XML que o leiaute nao prevê
    var conhecidos = Object.create(null);
    previstos.forEach(function (d) { conhecidos[d.tag] = 1; });
    Object.keys(no.atributos).forEach(function (a) {
      if (conhecidos[a] || a === 'xmlns' || a.indexOf('xmlns:') === 0) return;
      col.add({
        nivel: 'aviso', grupo: 'Mapeamento', alvo: no.caminho + '@' + a,
        linha: no.linha,
        titulo: 'Atributo fora do mapeamento da base',
        detalhe: 'O leiaute carregado não prevê o atributo "' + a
          + '" em <' + no.nome + '>.',
        obtido: String(no.atributos[a]).slice(0, 80),
        fonte: 'Base de dados do leiaute'
      });
    });
  }

  // ------------------------------------------------------------------
  // percurso principal
  // ------------------------------------------------------------------
  function validaEstrutura(raizNo, col, opcoes) {
    var foraMapeamento = [];
    var mapeados = 0;

    ANCORAS.forEach(function (ancora) {
      var no = Leitor.acha(raizNo, ancora);
      if (!no) return;

      // recalcula caminhos a partir da ancora
      (function rebase(n, prefixo) {
        n.caminho = prefixo;
        n.filhos.forEach(function (f) { rebase(f, prefixo + '/' + f.nome); });
      })(no, ancora);

      Leitor.percorre(no, function (n) {
        if (FORA_DO_ESCOPO[n.nome]) return;
        var def = Base.campo(n.caminho);
        if (!def) {
          foraMapeamento.push(n);
          return;
        }
        mapeados++;
        confereValor(n, def, col);
        confereAtributos(n, col);
        if (n.filhos.length) confereFilhos(n, col, opcoes);
      });

      // a propria ancora precisa ter os filhos conferidos
      var defAncora = Base.campo(ancora);
      if (defAncora) confereFilhos(no, col, opcoes);
    });

    if (opcoes.mapeamento) {
      foraMapeamento.forEach(function (n) {
        col.add({
          nivel: 'aviso', grupo: 'Mapeamento', alvo: n.caminho, linha: n.linha,
          titulo: 'Elemento fora do mapeamento da base',
          detalhe: 'O caminho não consta no leiaute carregado. Pode ser campo '
            + 'de uma versão de leiaute mais recente que a da base, ou elemento '
            + 'indevido — que a SEFAZ rejeitaria na validação do schema.',
          obtido: n.texto ? n.texto.slice(0, 80) : '(grupo)',
          fonte: 'Base: ' + (Base.dados.fontes ? Base.dados.fontes.gerado_em : '')
        });
      });
    }

    return { mapeados: mapeados, foraMapeamento: foraMapeamento.length };
  }

  // ------------------------------------------------------------------
  // entrada publica
  // ------------------------------------------------------------------
  function valida(texto, nomeArquivo, opcoes) {
    opcoes = opcoes || {};
    opcoes.ordem = opcoes.ordem || 'aviso';
    opcoes.mapeamento = opcoes.mapeamento !== false;
    opcoes.tolerancia = opcoes.tolerancia === undefined ? 0.001 : opcoes.tolerancia;

    var col = new Coletor();
    var lido = Leitor.lerXML(texto);

    if (!lido.ok) {
      col.add({
        nivel: 'erro', grupo: 'XML', alvo: nomeArquivo, linha: 0,
        titulo: 'XML mal formado', detalhe: lido.erro,
        fonte: 'Análise sintática do arquivo'
      });
      return montaResultado(nomeArquivo, null, col, opcoes, null);
    }

    var infNFe = Leitor.acha(lido.raiz, 'infNFe');
    if (!infNFe) {
      col.add({
        nivel: 'erro', grupo: 'XML', alvo: nomeArquivo, linha: 0,
        titulo: 'Documento sem grupo infNFe',
        detalhe: 'O arquivo é um XML válido, mas não contém uma NF-e/NFC-e. '
          + 'Elemento raiz encontrado: <' + lido.raiz.nome + '>.',
        fonte: 'ANEXO I — grupo A. Dados da Nota Fiscal eletrônica'
      });
      return montaResultado(nomeArquivo, lido, col, opcoes, null);
    }

    var cobertura = validaEstrutura(lido.raiz, col, opcoes);
    var chave = confereChave(infNFe, col);
    confereCadastro(infNFe, col);

    var fiscal = null;
    if (raiz.Tributos) {
      fiscal = raiz.Tributos.confere(infNFe, col, opcoes);
    }

    return montaResultado(nomeArquivo, lido, col, opcoes, {
      infNFe: infNFe, chave: chave, cobertura: cobertura, fiscal: fiscal
    });
  }

  function montaResultado(nomeArquivo, lido, col, opcoes, ctx) {
    var erros = col.itens.filter(function (a) { return a.nivel === 'erro'; });
    var avisos = col.itens.filter(function (a) { return a.nivel === 'aviso'; });

    var risco = 'Baixo';
    if (erros.length) risco = erros.length > 8 ? 'Alto' : 'Médio';
    else if (avisos.length > 12) risco = 'Médio';

    var cab = {};
    if (ctx && ctx.infNFe) {
      var ide = Leitor.acha(ctx.infNFe, 'ide');
      var emit = Leitor.acha(ctx.infNFe, 'emit');
      var dest = Leitor.acha(ctx.infNFe, 'dest');
      var tot = Leitor.acha(ctx.infNFe, 'ICMSTot');
      cab = {
        chave: (ctx.infNFe.atributos.Id || '').replace(/^NFe/, ''),
        versao: ctx.infNFe.atributos.versao || '',
        modelo: ide ? Leitor.valor(ide, 'mod') : '',
        serie: ide ? Leitor.valor(ide, 'serie') : '',
        numero: ide ? Leitor.valor(ide, 'nNF') : '',
        emissao: ide ? (Leitor.valor(ide, 'dhEmi') || Leitor.valor(ide, 'dEmi')) : '',
        finNFe: ide ? Leitor.valor(ide, 'finNFe') : '',
        tpAmb: ide ? Leitor.valor(ide, 'tpAmb') : '',
        natOp: ide ? Leitor.valor(ide, 'natOp') : '',
        emitente: emit ? Leitor.valor(emit, 'xNome') : '',
        emitenteDoc: emit ? (Leitor.valor(emit, 'CNPJ') || Leitor.valor(emit, 'CPF')) : '',
        crt: emit ? Leitor.valor(emit, 'CRT') : '',
        destinatario: dest ? Leitor.valor(dest, 'xNome') : '',
        destinatarioDoc: dest ? (Leitor.valor(dest, 'CNPJ') || Leitor.valor(dest, 'CPF')) : '',
        itens: Leitor.filhos(ctx.infNFe, 'det').length,
        vNF: tot ? Leitor.valor(tot, 'vNF') : ''
      };
    }

    return {
      arquivo: nomeArquivo,
      quando: new Date().toISOString(),
      ok: erros.length === 0,
      risco: risco,
      cabecalho: cab,
      achados: col.itens,
      totais: {
        erros: erros.length,
        avisos: avisos.length,
        informacoes: col.itens.length - erros.length - avisos.length,
        camposConferidos: col.conferidos,
        elementos: lido ? lido.nos : 0,
        mapeados: ctx && ctx.cobertura ? ctx.cobertura.mapeados : 0,
        foraMapeamento: ctx && ctx.cobertura ? ctx.cobertura.foraMapeamento : 0
      },
      fiscal: ctx ? ctx.fiscal : null,
      opcoes: opcoes,
      arvore: lido ? lido.raiz : null
    };
  }

  raiz.Motor = {
    valida: valida,
    modulo11: modulo11,
    cnpjValido: cnpjValido,
    cpfValido: cpfValido,
    UF_IBGE: UF_IBGE
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.Motor;
})(typeof globalThis !== 'undefined' ? globalThis : this);
