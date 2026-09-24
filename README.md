# Fiscal Shield — validador de NF-e e NFC-e

Confere o XML de NF-e e NFC-e contra o leiaute oficial, as regras de validação
da SEFAZ e os grupos da Reforma Tributária (IBS, CBS e IS).

**Roda inteiramente no navegador.** Não há servidor, upload nem armazenamento:
o arquivo é lido pela própria máquina de quem usa e nunca sai dela. Feche a
aba e nada permanece.

## Usar

Abra o site publicado, ou baixe esta pasta e dê um duplo clique no
`index.html`. Funciona offline, sem instalar nada.

Arraste o XML para a área indicada. O resultado traz o resumo do documento, os
apontamentos, os campos conferidos, a reconciliação dos tributos e os grupos
da Reforma — com exportação em HTML, JSON e CSV.

## O que ele verifica

| Frente | Conferência |
|---|---|
| Leiaute | Existência do elemento, obrigatoriedade, ordem, ocorrência, tipo, tamanho, casas decimais e domínio de valores |
| Estrutura | Grupos de escolha, campos mutuamente exclusivos e campos excluídos na versão 4.00 |
| Chave de acesso | Dígito verificador por módulo 11 e coerência dos 44 dígitos com cUF, data, CNPJ, modelo, série, número e tipo de emissão |
| Cadastro | Dígito verificador de CNPJ e CPF, códigos de UF e município do IBGE |
| Tributos | Recálculo de ICMS, ICMS-ST, FCP, IPI, PIS e COFINS por item, e reconciliação dos totalizadores contra a soma dos itens |
| Valor total | Composição do vNF exatamente como a regra oficial a define |
| Regime | CST × CRT, CSOSN × CRT e CFOP × destino da operação |
| Reforma | Grupos de IBS, CBS e IS: base × alíquota por item e totalizadores |

Cada apontamento traz o documento, a página e — quando existe — o código da
regra oficial e o número da rejeição que a SEFAZ devolveria.

## O que ele não decide

Regra estadual de benefício fiscal, validade cadastral junto à SEFAZ,
assinatura digital e as relações de códigos publicadas fora dos documentos de
leiaute (CST de IBS/CBS e cClassTrib, mantidos no
[portal da SVRS](https://dfe-portal.svrs.rs.gov.br/DFE/ClassificacaoTributaria)).
Nesses pontos a ferramenta aponta o que precisa ser conferido em vez de
afirmar.

## A base de dados

Nenhuma regra está escrita no código. Tudo o que a ferramenta verifica vem dos
arquivos em `data/`, extraídos dos documentos oficiais do projeto Nota Fiscal
Eletrônica:

| Arquivo | Conteúdo |
|---|---|
| `data/layout.json` | Campos do leiaute NF-e/NFC-e 4.00 e da Reforma, com caminho XML, tipo, ocorrência, tamanho, domínio e a página do documento de origem |
| `data/regras.json` | Regras de validação da SEFAZ, com enunciado, número da rejeição e efeito |
| `data/fontes.json` | Documentos usados, com SHA-256 de cada um |
| `data/base-embutida.js` | A mesma base em forma de script, para o site abrir sem servidor |
| `data/ajustes.json` | Complementos declarados à mão, cada um com justificativa |

A tela **Base de dados** do site permite consultar cada campo e cada regra,
com a origem de cada um. Os documentos de referência são:

- ANEXO I — Leiaute e Regras de Validação NF-e/NFC-e (Manual de Orientação do
  Contribuinte)
- NT 2025.002-RTC — IBS/CBS/IS, conforme a LC 214/2025
- NT 2019.001 — Regras de Validação

Há três complementos declarados em `data/ajustes.json`: `qBCProd`,
`vAliqProd` e `vPIS` do grupo `PISOutr`, que faltam no texto do ANEXO I — o
leiaute salta da sequência 283.1 para 287. A estrutura foi espelhada do grupo
`COFINSOutr`, que é idêntico. O site exibe esses campos marcados como *ajuste
declarado*, separados do que foi extraído automaticamente.

## Servir por HTTP

Abrir o `index.html` resolve o uso normal. Para servir por HTTP:

```
node tools/servidor.js 8000
```

Sem dependência nenhuma — Node puro, servindo apenas a pasta do projeto. No
Windows, `abrir-local.cmd` faz o mesmo com duplo clique.

## Testar

```
node tools/testa.js
```

Valida os XML de `exemplos/` e lista os achados. Serve para conferir, a cada
mudança na base, que nenhuma nota válida passou a acusar erro que não existe.

Os XML de exemplo são sintéticos: CNPJ fictício, chave de acesso recalculada,
sem assinatura digital e sem dado de contribuinte real.

## Aviso

Ferramenta de apoio à conferência técnica. Não substitui a análise de
profissional da área fiscal nem a autorização da SEFAZ.
