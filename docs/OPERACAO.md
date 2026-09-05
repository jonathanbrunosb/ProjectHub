# Operação

## Migrations

Numeradas e versionadas em `supabase/migrations/`, aplicadas em ordem:

| Arquivo | Conteúdo |
|---|---|
| `0001_foundation.sql` | Extensões, schema `app`, enums, gatilhos de carimbo |
| `0002_identity.sql` | Perfis, empresas, unidades, equipes; provisionamento via `auth.users` |
| `0003_portfolio_projects.sql` | Portfólios, templates, projetos, membros, fases |
| `0004_tasks.sql` | Tarefas, dependências, checklist, marcos, progresso ponderado |
| `0005_custom_fields.sql` | Campos personalizados (global/template/projeto) e validação |
| `0006_financial.sql` | Orçamento com revisões, lançamentos, views financeiras |
| `0007_risks_governance.sql` | Riscos, ações, indicadores, EVM, decisões, aprovações |
| `0008_resources_calendar.sql` | Alocação, capacidade rateada, calendário crítico contábil |
| `0009_collaboration.sql` | Comentários, anexos, status reports, saved views, notificações |
| `0010_audit.sql` | Trilha de auditoria append-only e gatilho genérico |
| `0011_rls.sql` | RBAC, funções de autorização e políticas RLS |
| `0012_health_views.sql` | Health score, `v_project_overview`, motor de alertas |
| `0013_storage_rpc.sql` | Storage privado, criação por template, publicação de report |
| `0014_environment.sql` | Declaração de ambiente (`app_environment`), `can_switch_environment`, ações de auditoria |
| `0015_environment_audit.sql` | Auditoria da troca de ambiente, guarda de privilégio, gatilho tolerante a PK não-UUID |

> A `0015` é separada da `0014` porque um valor recém-adicionado a um `enum` não pode ser
> usado na mesma transação em que foi criado. Rode-as **em duas execuções distintas**.

**As duas bases recebem as mesmas migrations, sempre em ordem.** Alteração estrutural
manual em PRD é proibida: cria divergência de schema que só aparece quando a próxima
migration falha. Ver [AMBIENTES.md](AMBIENTES.md).

> Ao criar uma migration nova, **habilite RLS explicitamente** na tabela: a `0011` só
> alcança as tabelas que existiam quando ela rodou.

## Seed

`supabase/seed.sql` popula um ambiente demonstrativo completo: 8 usuários (um por perfil),
3 empresas, 4 unidades, 4 equipes, 6 templates, 6 projetos com status, progresso, saúde,
riscos, custos, alocações e decisões distintos, além do calendário contábil e das regras
de automação.

```bash
supabase db reset                 # migrations + seed
psql "$DATABASE_URL" -f supabase/seed.sql   # apenas o seed
```

Destinado a QA. **Nunca em produção** — e isso não depende de disciplina: o seed começa
com uma guarda que aborta a execução se o banco se declarar PRD:

```
ERROR: Seeds de teste sao proibidos em Producao (app_environment = PRD).
```

Todo o dado fictício, inclusive o usuário técnico `admin@pmocontabil.dev`, pertence a QA e
não é replicado para PRD.

## Testes

```bash
npm run test                # 95 testes de frontend (Vitest + Testing Library)
./supabase/tests/run.sh     # 99 asserções no banco (47 RLS + 38 regras + 14 ambiente)
```

Cobertura do banco: progresso ponderado (incluindo subtarefas e canceladas), progresso
manual preservado, restrições de domínio, reprogramação de prazo, revisão de orçamento,
resumo financeiro, score e matriz de risco, health score automático, validação de campos
personalizados, imutabilidade de status report, conflito de calendário, captura da
auditoria e segregação de ambientes (declaração única, restrição a Admin, impossibilidade
de autoconcessão de `can_switch_environment`, registro das trocas concedidas e negadas).

Cobertura do frontend: consolidação de KPIs do portfólio, distribuições, curva financeira,
capacidade por equipe, formatação e fuso de datas, mapeamento tipado de campos
personalizados, comportamento da `DataTable` (busca, ocultar coluna, estado controlado,
clique na linha, estado vazio), geração de XLSX (tipos preservados, freeze, filtro
automático, nome de aba e de arquivo, aviso de QA, workbook multi-aba, arquivo válido) e a
janela Relatórios (botão por relatório, permissão, relatório vazio, erro de geração).

## Edge Functions

`supabase/functions/admin-create-user` é o único ponto da plataforma que usa a
`service_role` — e ela existe apenas nas variáveis de ambiente da própria função,
nunca no navegador. Cadastra um usuário (`Configurações → Usuários → Adicionar
usuário`, restrito a Admin), já com e-mail confirmado, e devolve uma **senha
temporária** gerada no servidor, exibida uma única vez ao Admin.

**Por que senha temporária e não convite por e-mail:** o serviço de e-mail nativo
do Supabase tem limite severo de envio e restrição de destinatário, o que torna o
cadastro não-determinístico (falhava com HTTP 400 em produção). Criar a conta já
ativa e entregar a credencial ao Admin remove essa dependência. Com SMTP próprio
configurado, dá para voltar ao `inviteUserByEmail`.

A função valida quem chama antes de usar qualquer privilégio: lê o JWT de quem fez
a requisição, confirma o papel em `profiles` pela RLS normal (sem elevação), e só
prossegue com a `service_role` se for `admin`.

**Deploy** (não faz parte do build do GitHub Pages — Edge Functions são publicadas
direto no Supabase):

- **Painel do Supabase:** `Edge Functions → Deploy a new function → Via Editor` →
  nome `admin-create-user` → cole o conteúdo de
  `supabase/functions/admin-create-user/index.ts` → **Deploy**.
- **Ou via CLI:** `supabase functions deploy admin-create-user`.

O import usa URL (`esm.sh`) em vez do especificador `npm:`: este último depende da
versão do Edge Runtime e, quando não resolve, derruba a função na carga — e nesse
caso a plataforma responde 500 **sem cabeçalho CORS**, fazendo o navegador reportar
um erro de CORS que mascara a causa real.

Não é preciso configurar nenhuma variável nova: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` já existem automaticamente no
ambiente de toda Edge Function no Supabase.

## Ambientes QA e PRD

QA e PRD são **projetos Supabase separados**. O provisionamento de PRD, as variáveis de
ambiente, os segredos do GitHub e o checklist completo estão em
**[AMBIENTES.md](AMBIENTES.md)**.

Resumo operacional:

| | QA | PRD |
|---|---|---|
| Projeto Supabase | Existente | A provisionar |
| Migrations `0001` → `0015` | Sim | Sim, as mesmas |
| `seed.sql` | Sim | **Nunca** (bloqueado por guarda) |
| `app_environment` | `QA` | `PRD` (definir manualmente após as migrations) |
| Edge Function `admin-create-user` | Publicada | Publicar |
| Segredos no GitHub | `VITE_SUPABASE_QA_*` | `VITE_SUPABASE_PRD_*` |

O Vite inlineia as variáveis em tempo de build: **trocar um segredo exige novo deploy**,
não basta salvar no GitHub.

## Exportação de dados

Dois formatos, propósitos diferentes: **Excel (.xlsx) para análise** e **PDF para
apresentação**. O CSV foi removido — para análise contábil o arquivo precisa chegar com
moeda somável, percentual calculável e data reconhecida como data, e em CSV tudo isso
vira texto.

**Onde exportar:**

| Origem | O que sai |
|---|---|
| Qualquer tabela (`DataTable`) | Excel com as **colunas visíveis, na ordem da tela**, e apenas as **linhas filtradas** |
| Janela Relatórios (9 relatórios) | `PDF` e `Excel` no card e na página do relatório |
| Trilha de auditoria | Excel, respeitando os filtros de usuário, projeto, entidade, ação e período |

**Os dois formatos partem das mesmas seções** (`buildReportSheets`), então PDF e Excel
nunca divergem de conteúdo. O que muda é o tratamento do valor: no Excel a célula guarda
o número nativo para o analista calcular; no PDF vira texto já formatado em pt-BR.

**Formatação aplicada** (`src/lib/export/xlsx.ts`): cabeçalho em negrito sobre fundo
corporativo, primeira linha congelada, filtro automático, largura de coluna calculada
pelo conteúdo (entre 10 e 46), e formato por tipo — `R$ #,##0.00`, `0.0%`, `dd/mm/yyyy`,
`dd/mm/yyyy hh:mm`, `#,##0`.

**Percentual é gravado como fração** (78,4% → `0,784` com formato `0.0%`): é a
representação nativa do Excel, a única em que média e soma percentual saem corretas.

### PDF (`src/lib/export/pdf.ts`)

Documento A4 com logo do Grupo Equatorial, identidade ProjectHub, título, ambiente, data,
usuário e filtros aplicados; tabelas com cabeçalho repetido a cada página, colunas
numéricas alinhadas à direita, e rodapé com paginação. Orientação escolhida
automaticamente: paisagem acima de 6 colunas. Em QA, uma faixa de aviso identifica o
documento como dado de teste.

Usa **jsPDF + autotable**, não `window.print()`: o diálogo do navegador acrescenta
cabeçalho e rodapé próprios, varia entre navegadores e não permite paginação nem marca
corporativa — inadequado para documento que vai a comitê.

> **A compressão do logo é obrigatória.** O jsPDF embute PNG como bitmap cru por padrão:
> o mesmo relatório sai com **2,1 MB sem compressão e 69 KB com `'MEDIUM'`**. Existe teste
> travando esse parâmetro — sem ele a regressão passa despercebida até alguém tentar
> enviar o arquivo por e-mail.

### Excel

**Biblioteca: ExcelJS, não SheetJS.** A versão community do `xlsx` não aplica estilos —
negrito, largura e formato de número são recursos da versão paga. Com ela o arquivo seria
um CSV com outra extensão. O ExcelJS é carregado sob demanda (`await import`), em chunk
próprio de ~271 kB gzip: quem nunca exporta não paga esse custo no carregamento.

> O `package.json` fixa `overrides.uuid` para manter o `npm audit` limpo. O ExcelJS traz
> `uuid@8` transitivamente, cuja vulnerabilidade conhecida afeta apenas `v3/v5/v6` com o
> parâmetro `buf` — o ExcelJS usa só `v4()`, então não era alcançável; o override existe
> para não deixar ruído em auditoria de dependências.

**Volume:** a geração é client-side. Os relatórios atuais operam em centenas de linhas.
Acima de ~10 mil registros, avalie mover a geração para uma Edge Function antes que o
navegador do usuário vire o gargalo.

## Automações e alertas

`public.generate_alerts()` gera notificações in-app a partir das regras ativas em
`automation_rules`: tarefa vencida, risco crítico sem plano, plano de ação vencido.
`public.refresh_all_health()` recalcula a saúde do portfólio preservando overrides.

Hoje ambas são disparadas manualmente (Configurações → Sistema e Central de Notificações,
restritas a Admin/PMO). Para produção, agende-as via **Supabase Cron** ou uma Edge
Function chamada por *scheduler*.

A arquitetura de notificação já contempla canais `email`, `teams` e `webhook` no enum —
a entrega externa é o que falta implementar.

## Pendências conhecidas

Itens do escopo original ainda não implementados, com o caminho previsto:

| Pendência | Situação | Caminho |
|---|---|---|
| Upload de anexos pela interface | Bucket, políticas e tabela `attachments` prontos | Componente de upload + URL assinada |
| Edge Functions de integração | `admin-create-user` implementada (cadastro de usuário pelo Admin) | Teams, Power BI, webhooks ainda pendentes |
| Agendamento do motor de alertas | Execução manual | Supabase Cron |
| Dashboards montáveis pelo usuário | Arquitetura preparada (componentes e `saved_views`) | Editor de layout |
| MFA | Schema preparado | Habilitar no Supabase Auth |
| SMTP próprio | Não configurado (usa o e-mail nativo do Supabase, limitado) | Configurar em `Authentication → SMTP Settings` para habilitar convite por e-mail e recuperação de senha confiáveis |
| Projeto Supabase de PRD | Código pronto; ambiente aparece desabilitado sem as variáveis `_PRD_` | Seguir o checklist de provisionamento em [AMBIENTES.md](AMBIENTES.md) |
| Comentários por entidade | Tabela e RLS prontas | Componente de thread |
| EVM | Tabela `evm_snapshots` com SPI/CPI calculados | Tela de captura de PV/EV/AC |
| Edição de dependências pela interface | Tabela e visualização no Gantt prontas | Editor de predecessora/sucessora |

## Riscos técnicos a acompanhar

- **Duplicação operacional.** Dois projetos significam duas execuções de migration, dois
  deploys de Edge Function e dois conjuntos de segredos. É o custo consciente de tornar a
  contaminação QA→PRD fisicamente impossível. Mitigue automatizando a aplicação de
  migrations antes que o número de ambientes cresça.
- **Volume da trilha de auditoria.** O gatilho grava `old_data` e `new_data` completos.
  Acima de ~10⁶ eventos, avalie particionamento por mês e política de retenção.
- **`v_resource_capacity`.** Gera uma série de 7 meses por colaborador. Com centenas de
  pessoas e milhares de alocações, considere materializar.
- **Custo do `v_project_overview`.** Usa subconsultas laterais por projeto. Adequado para
  centenas de projetos; para milhares, materialize com refresh incremental.
- **Bundle dos gráficos.** O chunk do Recharts é o maior da aplicação (~115 kB gzip).
  Já está isolado e carregado sob demanda, mas é candidato a substituição se o tempo de
  carga do dashboard se tornar crítico.
