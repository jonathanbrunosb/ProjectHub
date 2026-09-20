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
| `0016_financial_module_flag.sql` | Módulo financeiro opcional: `system_settings` (global), `projects.financial_module_mode` e `project_templates.financial_module_default` (inherit/enabled/disabled), guarda de privilégio, `v_project_overview.financial_effective_enabled` |
| `0017_goal_indicators.sql` | Indicadores de Metas: `holidays` e dias úteis (`app.is_business_day`/`app.business_days_between`, inexistentes até aqui), `project_goal_settings`, `task_goal_config`, função central `app.calc_delivery_score`, views `v_task_goal_scores`/`v_project_goal_indicator`, fechamento de período (`goal_score_periods`, `close_goal_period`/`reopen_goal_period`) |
| `0018_attachments_entity_check.sql` | Restringe `attachments.entity` aos mesmos valores já usados por `comments` (defesa em profundidade antes da interface de upload existir) |
| `0019_service_role_grants.sql` | Restaura os GRANTs de `service_role` no schema `public`. QA estava sem em **todas as 50 tabelas** e PRD tinha em todas — divergência que fazia qualquer Edge Function falhar com `permission denied` ao tocar tabela. Idempotente: no-op onde já existem |
| `20260909132537_publish_reference_templates.sql` | Publica o catálogo funcional de 6 templates, 8 fases, 8 tarefas-modelo e o campo de referência do template de sistemas em QA e PRD. Somente dados, idempotente e sem alteração de schema |
| `20260918190000_schedule_alert_engine.sql` | Extrai `generate_alerts()` para `app.run_alert_engine()` (sem checagem de permissão) e agenda via Supabase Cron (`pg_cron`), guardado para ambientes sem a extensão |
| `20260919100000_comments_author_only_edit.sql` | FK `comments.created_by → profiles` (permite exibir o nome do autor) e RLS de UPDATE/DELETE restrita ao autor (ou Admin/PMO) — a política genérica anterior permitia que qualquer colaborador com escrita no projeto editasse/apagasse o comentário de outra pessoa |
| `20260919120000_task_dependencies_guard.sql` | Gatilho `trg_task_dependencies_guard` em `task_dependencies`: rejeita dependência cruzando projeto e dependência que fecharia um ciclo (grafo teria deixado de ser acíclico sem aviso nenhum) |

> A `0015` é separada da `0014` porque um valor recém-adicionado a um `enum` não pode ser
> usado na mesma transação em que foi criado. Rode-as **em duas execuções distintas**.

**As duas bases recebem as mesmas migrations, sempre em ordem.** Alteração estrutural
manual em PRD é proibida: cria divergência de schema que só aparece quando a próxima
migration falha. Ver [AMBIENTES.md](AMBIENTES.md).

**Aplicação automática (`.github/workflows/deploy-migrations.yml`).** Até aqui, uma
migration mesclada em `main` só chegava a QA/PRD quando alguém lembrava de aplicar
manualmente — já causou schema divergente e silencioso entre `main` e os bancos
hospedados (aconteceu de verdade: `20260919130000_webhook_dispatch` ficou mesclada e
sem aplicar em QA por um tempo). O workflow fecha essa lacuna:

- Dispara em push para `main` quando `supabase/migrations/**` muda (ou manualmente via
  `workflow_dispatch`).
- **QA aplica automaticamente** (`supabase db push`, idempotente — só aplica o que ainda
  não está em `supabase_migrations.schema_migrations` no projeto de destino).
- **PRD exige aprovação manual**: o job roda sob o GitHub Environment `production`, que
  precisa ter *Required reviewers* configurado (`Settings → Environments` no GitHub) —
  sem isso, o job fica pendente indefinidamente em vez de aplicar sozinho em produção.
- Segredos necessários (`Settings → Secrets and variables → Actions`):
  `SUPABASE_ACCESS_TOKEN` (token pessoal, `https://supabase.com/dashboard/account/tokens`
  — é a mesma limitação de escopo do MFA/SMTP: token do Supabase não é por projeto),
  `SUPABASE_QA_PROJECT_REF`, `SUPABASE_QA_DB_PASSWORD`, `SUPABASE_PRD_PROJECT_REF`,
  `SUPABASE_PRD_DB_PASSWORD`. Nenhum desses existe ainda — o workflow falha (de forma
  visível, não silenciosa) até serem cadastrados.
- Continua não cobrindo Edge Functions (publicação segue manual, ver "Edge Functions")
  nem o passo 2 do checklist de provisionamento de PRD, que documenta o caminho manual
  original como alternativa (ver [AMBIENTES.md](AMBIENTES.md)).

> Ao criar uma migration nova, **habilite RLS explicitamente** na tabela: a `0011` só
> alcança as tabelas que existiam quando ela rodou.

## Seed

`supabase/seed.sql` popula um ambiente demonstrativo completo: 8 usuários (um por perfil),
3 empresas, 4 unidades, 4 equipes e 6 projetos com status, progresso, saúde, riscos,
custos, alocações e decisões distintos, além do calendário contábil e das regras de
automação. Os 6 templates usados por esses projetos são dados funcionais de referência e
vêm da migration `20260909132537_publish_reference_templates.sql`, inclusive em PRD.

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
npm run test                # 274 testes de frontend (Vitest + Testing Library)
./supabase/tests/run.sh     # 140 asserções no banco (48 RLS + 76 regras + 16 ambiente)
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

### CI obrigatório

`.github/workflows/ci.yml` roda os dois jobs acima (frontend e banco) em todo push e pull
request. Desde 20/09/2026, um **ruleset** em `main` (`Settings → Rules → Rulesets`) exige
que os dois checks passem antes de qualquer merge — inclusive merges feitos por
automação/API, já que a lista de bypass foi deixada vazia de propósito. Antes disso, o CI
era só informativo: dava pra mesclar um PR com build ou teste quebrado sem barreira
nenhuma.

## Edge Functions

Tres pontos usam `service_role` — e só eles: ela existe apenas nas variáveis de
ambiente da própria função, nunca no navegador.

### `admin-create-user`

Cadastra um usuário (`Configurações → Usuários → Adicionar usuário`, restrito a
Admin), já com e-mail confirmado, e devolve uma **senha temporária** gerada no
servidor, exibida uma única vez ao Admin.

**Por que senha temporária e não convite por e-mail:** o serviço de e-mail nativo
do Supabase tem limite severo de envio e restrição de destinatário, o que torna o
cadastro não-determinístico (falhava com HTTP 400 em produção). Criar a conta já
ativa e entregar a credencial ao Admin remove essa dependência. Com SMTP próprio
configurado, dá para voltar ao `inviteUserByEmail`.

### `admin-reset-password`

Gera uma nova senha temporária para um usuário **existente** (`Configurações →
Usuários → Redefinir senha` em cada linha, restrito a Admin), substituindo a
atual imediatamente.

**Por que existe além da recuperação por e-mail:** a tela de autosserviço
(`Esqueci minha senha` → código de 6 dígitos) depende do SMTP estar configurado
e do template de e-mail incluir `{{ .Token }}`. Enquanto isso não está pronto,
essa é a via confiável para alguém recuperar acesso — mesmo raciocínio que levou
o cadastro a usar senha temporária em vez de convite por e-mail. Uma vez com SMTP
próprio configurado, os dois caminhos convivem: autosserviço para o dia a dia,
Admin como retaguarda.

### `admin-delete-user`

Exclui a conta **permanentemente** (`Configurações → Usuários → Excluir`, restrito
a Admin, com confirmação exigindo digitar o e-mail exato).

`profiles.id` referencia `auth.users(id) on delete cascade`: excluir só pela
tabela `profiles` deixaria uma conta de auth órfã, que continuaria autenticando
sem enxergar nada — pior que o estado atual. Por isso a exclusão real só existe
via Admin API (`auth.admin.deleteUser`), que remove os dois de uma vez.

**Consequência nos vínculos:** a maioria das referências a um usuário
(responsável por projeto, tarefa, risco, decisão) é `on delete set null` — o
registro permanece, só fica sem responsável. Um grupo menor é `on delete
cascade` (vínculos de equipe, aprovações, visualizações salvas, preferências de
coluna). `approvals` tem gatilho de auditoria: o `DELETE` grava `old_data` em
`application_audit_log` antes da linha sumir, então o fato histórico sobrevive
mesmo que a linha viva seja removida.

**Guardas:** a função nunca deixa a plataforma sem nenhum Admin ativo, e nunca
permite que alguém exclua a própria conta — os dois casos travam a gestão de
usuários sem ninguém para reverter.

### Deploy (comum às três)

Não faz parte do build do GitHub Pages — Edge Functions são publicadas direto no
Supabase, **em cada projeto** (QA e PRD são bancos separados):

- **Painel do Supabase:** `Edge Functions → Deploy a new function → Via Editor` →
  nome da função (`admin-create-user`, `admin-reset-password` ou
  `admin-delete-user`) → cole o conteúdo de `supabase/functions/<nome>/index.ts`
  → **Deploy**.
- **Ou via CLI:** `supabase functions deploy <nome>`.

O import usa URL (`esm.sh`) em vez do especificador `npm:`: este último depende da
versão do Edge Runtime e, quando não resolve, derruba a função na carga — e nesse
caso a plataforma responde 500 **sem cabeçalho CORS**, fazendo o navegador reportar
um erro de CORS que mascara a causa real.

Não é preciso configurar nenhuma variável nova: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` já existem automaticamente no
ambiente de toda Edge Function no Supabase.

### env-switch-login (ponte de login entre QA e PRD)

Habilita, para quem tem `can_switch_environment = true`, trocar de ambiente pelo
menu lateral sem cair no cadastro manual do outro lado. Implantada **nos dois
projetos** (mesmo código nos dois), com duas particularidades em relação às
outras três funções acima:

1. **Um segredo por projeto, apontando para o OUTRO:**
   - Em QA: `PEER_SUPABASE_URL` = URL de **PRD**.
   - Em PRD: `PEER_SUPABASE_URL` = URL de **QA**.
   - Definido em **Edge Functions → env-switch-login → Secrets** no painel, ou
     via `supabase secrets set PEER_SUPABASE_URL="https://<ref>.supabase.co" --project-ref <ref>`.
   - Só a URL é segredo, e é ela a **âncora de confiança**: o token e a permissão
     de quem pede a troca são validados contra ela, e somente contra ela.
   - A **anon key** do outro projeto não precisa ser configurada: ela chega no
     corpo da chamada, vinda do bundle do frontend (onde o build já a injeta
     correta). Configurá-la à mão como `PEER_SUPABASE_ANON_KEY` ainda funciona
     como reserva, mas é desnecessário — e foi justamente a fonte de três
     falhas seguidas em produção, porque um JWT de 200+ caracteres copiado
     entre janelas chega corrompido com facilidade (caractere invisível
     substituindo um caractere legítimo, sem nenhum sinal visual).

2. **Versão do supabase-js**: as Edge Functions importam `@2.115.0` ou superior.
   Versões anteriores a isso enviam a chave de serviço como `Bearer`, o que só
   funciona com as chaves legadas (JWT). Com as **novas chaves do Supabase**
   (`sb_secret_…` / `sb_publishable_…`), que não são JWT, o PostgREST não
   consegue lê-las, trata a requisição como `anon` — revogado em
   `0011_rls.sql` — e devolve `permission denied for table <tabela>`, mesmo com
   a chave correta. A Auth API continua funcionando nesse cenário, o que torna
   o sintoma confuso: gerar acesso funciona, ler tabela não.

3. **Verificação de JWT da plataforma DESLIGADA** (`--no-verify-jwt`), nos dois
   projetos:
   ```
   supabase functions deploy env-switch-login --no-verify-jwt --project-ref <ref-qa>
   supabase functions deploy env-switch-login --no-verify-jwt --project-ref <ref-prd>
   ```
   Diferente das outras Edge Functions (que recebem o token de quem chama no
   mesmo projeto, e por isso passam na verificação padrão do Supabase), esta
   função recebe **de propósito** o token de sessão do ambiente de *origem* da
   troca - um JWT de outro projeto, que a verificação automática do projeto de
   *destino* sempre rejeitaria antes mesmo do código rodar. A função faz a
   própria verificação por dentro (valida esse token direto contra a API do
   projeto de origem antes de liberar qualquer acesso), então desligar a
   checagem automática aqui não abre brecha nenhuma - só destrava o fluxo que
   ela mesma protege depois.
   Esquecer esse passo é o sintoma mais comum: a troca de ambiente "não dá erro
   nenhum", só continua caindo no login manual, porque a chamada é rejeitada
   na entrada, antes de a função sequer rodar.

## Ambientes QA e PRD

QA e PRD são **projetos Supabase separados**. O provisionamento de PRD, as variáveis de
ambiente, os segredos do GitHub e o checklist completo estão em
**[AMBIENTES.md](AMBIENTES.md)**.

Resumo operacional:

| | QA | PRD |
|---|---|---|
| Projeto Supabase | Provisionado | Provisionado |
| Migrations | Sim, todas | Sim, as mesmas |
| `seed.sql` | Sim | **Nunca** (bloqueado por guarda) |
| `app_environment` | `QA` | `PRD` |
| Edge Functions (`admin-create-user`, `admin-reset-password`, `admin-delete-user`) | Publicadas | Publicadas |
| Segredos no GitHub | `VITE_SUPABASE_QA_*` | `VITE_SUPABASE_PRD_*` |
| SMTP próprio (`Authentication → SMTP Settings`) | Configurado | Configurado |
| MFA — TOTP (`Authentication → Multi-Factor Authentication`) | Habilitado | Habilitado |
| Proteção contra senha vazada (`Authentication → Sign In / Providers → Email → Prevent use of leaked passwords`) | Habilitado | Habilitado |

O Vite inlineia as variáveis em tempo de build: **trocar um segredo exige novo deploy**,
não basta salvar no GitHub.

**MFA.** TOTP (aplicativo autenticador) habilitado nos dois ambientes — feito manualmente pelo
Admin em cada projeto (`Authentication → Multi-Factor Authentication`, sem sincronização
automática entre QA e PRD, mesmo padrão do SMTP). A interface está implementada: em
`Configurações → Meu perfil`, o usuário ativa o segundo fator (QR code + segredo manual,
confirmação por código de 6 dígitos) ou desativa um fator já verificado, ambos via
`src/services/mfa.ts` (wrapper sobre `supabase.auth.mfa.*`). No login, o `AuthProvider` recalcula
`mfaPending` a cada mudança de sessão (`currentLevel === 'aal1' && nextLevel === 'aal2'`); o
`ProtectedRoute` redireciona para `/mfa` enquanto o desafio não é resolvido, e a tela
`MfaChallengePage` pede o código do autenticador (com opção de sair, para quem perdeu acesso ao
app). Um cadastro abandonado (usuário abre o QR code e cancela) é desfeito automaticamente —
não fica fator não verificado órfão no Supabase Auth.

**SMTP próprio.** Os dois ambientes enviam e-mail de autenticação via Resend, a partir do
domínio corporativo `mail.contabilidade-eqtl.com` (DKIM/SPF verificados), em vez do e-mail
nativo do Supabase — que tem um limite de envio baixo e não é apropriado para produção.
Cada projeto Supabase configura o SMTP de forma independente (`Authentication → SMTP
Settings`) — não há sincronização automática entre QA e PRD, então uma rotação da chave de
API do Resend precisa ser aplicada manualmente nos dois.

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

## Anexos

Upload de arquivos por projeto, tarefa, risco, plano de ação, decisão ou status report,
via bucket privado `project-files` no Storage. `src/components/attachments/AttachmentsPanel.tsx`
é o componente reutilizável, plugado em quatro telas (aba Anexos do projeto, `TaskModal`,
`RiskModal`, `ActionPlanModal`); `src/services/attachments.ts` concentra a lógica.

- **Limite:** 50 MB por arquivo, aplicado tanto no bucket quanto no frontend antes do envio.
- **Tipos aceitos:** PDF, PNG/JPEG/WEBP, CSV, TXT, Office (xlsx/docx/pptx) — mesma lista nos
  dois lados.
- **Caminho no Storage:** `<project_id>/<entity>/<uuid>-<nome-sanitizado>`. O primeiro
  segmento é o que a política de `storage.objects` usa para autorizar
  (`app.can_write_project`/`can_read_project`) — a tabela `public.attachments` tem RLS
  equivalente, então autorização e armazenamento nunca divergem.
- **Nome de exibição preservado:** a chave do objeto precisa ser ASCII sem espaço (o
  Storage rejeita acento/espaço), mas `file_name` guarda o nome original — só o segmento de
  caminho é sanitizado.
- **Sem lixo órfão:** se o `insert` na tabela falhar depois do upload (RLS, rede), o objeto
  já enviado ao bucket é removido.
- **Download:** URL assinada de 60 segundos — o bucket é privado, nunca há link público
  persistente.

## Comentários

Thread de comentários por registro (projeto, tarefa, risco, plano de ação, decisão ou status
report), na tabela `public.comments`. `src/components/comments/CommentThread.tsx` é o
componente reutilizável, plugado em quatro telas (aba Comentários do projeto, `TaskModal`,
`RiskModal`, `ActionPlanModal`) — mesmo padrão de integração dos Anexos; `src/services/comments.ts`
concentra a lógica.

- **Resposta simples:** `parent_id` referencia outro comentário; a tela mostra o texto citado
  acima da resposta. Sem árvore aninhada — lista cronológica plana, suficiente para o volume
  de uso e mais simples de auditar.
- **Limite:** 8000 caracteres por comentário (`comments_body_ck`), replicado no frontend antes
  do envio.
- **Edição restrita ao autor.** A política original de UPDATE/DELETE herdava a regra genérica
  de tabela-filha (`can_write_project`) — qualquer colaborador com escrita no projeto podia
  editar ou apagar o comentário de outra pessoa. Migration `20260919100000` aperta para
  `created_by = auth.uid() OU Admin/PMO`, no mesmo padrão já usado em `approvals_update`
  (0011). Anexo é documento do projeto (edição coletiva faz sentido); comentário é registro de
  quem disse o quê, então a autoria decide.
- **Nome do autor:** `created_by` ganhou FK para `profiles` na mesma migration (nenhuma coluna
  de carimbo — `created_by`/`updated_by` — tinha FK até então), habilitando o embed
  `profiles!comments_created_by_fkey(full_name)` usado na tela. Se o usuário for excluído, o FK
  é `on delete set null` (mesmo padrão dos demais responsáveis) — o comentário permanece,
  exibido como "Usuário removido".

## Dependências entre tarefas

Editor de predecessora/sucessora dentro do `TaskModal` (aba Tarefas & Entregas, ao editar
uma tarefa já salva): cada tarefa lista suas predecessoras (editável — tipo de dependência
FS/SS/FF/SF e defasagem em dias) e, somente leitura, as tarefas que ela bloqueia (edite a
partir da outra tarefa). As setas do Gantt (`GanttChart`, modo "Gantt" do `TaskList`) já
liam `task_dependencies` desde antes — só faltava a interface para alimentar a tabela sem
passar pela importação de Excel.

**Duas guardas novas no banco (`20260919120000`), nenhuma delas exigida antes porque a
tabela só era alimentada pela importação (dados controlados):**

- **Mesmo projeto.** A RLS de INSERT só conferia escrita no projeto da sucessora — nunca
  comparou o projeto da predecessora. Uma dependência cruzando projetos passava sem erro.
- **Sem ciclo.** Só havia `predecessor_id <> successor_id` (barra só o ciclo trivial de 1
  aresta). Um ciclo maior (A→B→C→A) quebraria silenciosamente a leitura de risco do Gantt
  (`atRisk` em `TaskList.tsx`), que assume o grafo acíclico.

Gatilho `trg_task_dependencies_guard` (BEFORE INSERT/UPDATE) fecha as duas, com uma CTE
recursiva para detectar alcançabilidade antes de aceitar a nova aresta.

## EVM (Earned Value Management)

Opcional por projeto (`projects.evm_enabled`). Quando ativo, a aba **Indicadores** ganha um
painel de captura de snapshots (`public.evm_snapshots`): PV, EV e AC por data de referência,
com SPI (`EV/PV`) e CPI (`EV/AC`) calculados pelo próprio banco (colunas geradas — nunca
enviados pelo frontend). Curva PV × EV × AC e cartões de KPI com semáforo (`< 0,9` crítico,
`0,9–1` atenção, `≥ 1` ok — convenção usual de EVM).

- **Reenviar a mesma data corrige o snapshot** (`upsert` com `onConflict` em
  `(project_id, reference_date)`, mesma restrição `evm_snapshots_uk` da `0007`) — não duplica,
  não exige excluir para corrigir um valor digitado errado.
- **A data de um snapshot existente não é editável** pela tela: só PV/EV/AC. Mudar a data via
  `upsert` criaria/atualizaria outra linha e deixaria a original órfã — mais simples travar o
  campo do que reconciliar esse caso.
- **RLS:** `evm_snapshots` já estava no loop genérico de tabela-filha da `0011`
  (`can_read_project`/`can_write_project`) desde a `0007` — nenhuma migration nova foi
  necessária, só a interface que faltava.

## Dashboard personalizável

A Visão Executiva (`/`) é um catálogo fixo de ~11 blocos (`DASHBOARD_WIDGETS` em
`src/services/dashboardLayout.ts`: KPIs de execução, financeiro/governança, prazos, os
gráficos e as listas operacionais). Botão **Personalizar** no cabeçalho abre um modal para
mostrar/ocultar e reordenar (subir/descer) — **não** é um editor de grid livre com
drag-and-drop: o recorte deliberado foi reordenar/ocultar blocos existentes, não montar um
layout arbitrário, para manter escopo e superfície de teste pequenos.

- **Persistência:** reaproveita `public.column_preferences` (module='dashboard'), a mesma
  tabela já usada para preferência de colunas de `DataTable` — nenhuma migration nova.
  RLS já restringe a leitura/escrita ao próprio usuário (`profile_id = auth.uid()`).
- **Sem preferência salva = layout atual** (tudo visível, ordem do catálogo) — zero
  regressão para quem nunca personalizar.
- **Widget novo adicionado depois:** `resolveDashboardOrder()` acrescenta ao final da ordem
  salva qualquer id do catálogo ausente dela — um layout salvo nunca esconde um bloco novo
  por acidente, só entra no fim até o usuário reordenar.
- Os quatro painéis de listas (riscos/marcos/decisões/atividade) formam **um único widget**
  (`listas_operacionais`): são uma grade de 4 colunas entre si — separá-los quebraria esse
  layout, então a granularidade de personalização é por bloco/seção, não por painel
  individual dentro da grade de listas.

## Automações e alertas

`public.generate_alerts()` gera notificações in-app a partir das regras ativas em
`automation_rules`: tarefa vencida, risco crítico sem plano, plano de ação vencido.
`public.refresh_all_health()` recalcula a saúde do portfólio preservando overrides.

**Critério de elegibilidade e visibilidade.** Para a regra "tarefa vencida" (mesmo
princípio nas outras duas): a tarefa precisa ter `assignee_id`, `due_date` estritamente
anterior a hoje (`<`, não `<=` — vencendo hoje ainda não conta) e status fora de
`concluida`/`cancelada`. A deduplicação é **por entidade** (`notifications.entity_id`,
desde `20260919140000`): cada tarefa/risco/plano vencido gera seu próprio alerta,
independente de outros atrasos do mesmo responsável no mesmo projeto — antes disso a
dedup era por `(responsável, projeto)`, então um responsável com 3 tarefas vencidas no
mesmo projeto só recebia alerta da primeira, e as outras duas ficavam mudas por até 24h
(risco: 3 dias). Visibilidade segue a RLS normal de `notifications`
(`profile_id = auth.uid()`) — **mesmo Admin/PMO só vê os próprios alertas**, nunca os de
outro responsável; não existe hoje uma visão consolidada de atrasos do portfólio na
Central de Notificações (para isso, usar os indicadores de projeto, ex.: `overdue_tasks`
em `v_project_overview`, ou o painel de tarefas com filtro de atraso).

**Motor de alertas agendado.** A lógica de `generate_alerts()` vive em
`app.run_alert_engine()`, chamada diretamente pelo **Supabase Cron** (`pg_cron`) todo dia
às 10:00 UTC (07:00 horário de Brasília), antes do início do expediente. A checagem de
Admin/PMO fica só na RPC pública (`public.generate_alerts()`, que delega para a versão
interna) — o job do cron não tem sessão HTTP/JWT, então não faz sentido exigir papel ali;
a tela **Central de Notificações** continua disponível para acionar manualmente, sempre
restrita a Admin/PMO. `public.refresh_all_health()` segue disparada manualmente
(Configurações → Sistema); agendá-la também é um passo simples e independente, se algum
dia fizer sentido.

A arquitetura de notificação já contempla canais `email`, `teams` e `webhook` no enum.

**Webhook genérico (entrega externa).** Configurável em `Configurações → Integrações`
(Admin): URL de destino + segredo opcional para assinatura HMAC-SHA256 (header
`X-ProjectHub-Signature: sha256=...`). Com o webhook ativo, `app.run_alert_engine()`
despacha ao final de cada execução (`app.dispatch_webhook_notifications()`) um POST em JSON
para cada notificação ainda não entregue (últimas 24h, lote de 50 por ciclo) — cobre as
mesmas três regras do motor de alertas, sem cliente nativo por canal: um endpoint HTTP
único destrava Teams (Incoming Webhook), Power BI, Zapier/Make/n8n ou receptor próprio. A
tela também tem um botão de teste (`public.test_webhook_delivery()`) para validar a URL sem
esperar o próximo ciclo.

- **Transporte:** `pg_net` (`net.http_post`), chamado direto do Postgres — sem Edge Function
  nova, reaproveitando o mesmo `pg_cron` do motor de alertas. Só existe no Supabase
  hospedado; fora dele (CI, Postgres local) o despacho é um no-op silencioso, mesmo padrão
  de guard do `pg_cron` (`20260918190000`).
- **Fire-and-forget:** `net.http_post` é assíncrono (enfileira o request; a resposta HTTP
  fica em `net._http_response`, sem loop de leitura aqui). `notifications.webhook_delivered_at`
  marca que o envio foi enfileirado, não que o receptor confirmou o recebimento — não há
  retry nem alerta de falha de entrega nesta primeira versão.
- **Segredo nunca sai da tabela de configuração:** fica fora da trilha de auditoria (só
  `enabled`/`url` são registrados em `config_change`) e a leitura de `webhook_config` é
  restrita a Admin via RLS.

## Pendências conhecidas

Itens do escopo original ainda não implementados, com o caminho previsto:

| Pendência | Situação | Caminho |
|---|---|---|
| Edge Functions de integração | `admin-create-user` implementada; entrega externa de notificações via webhook genérico implementada (`Configurações → Integrações`, ver "Automações e alertas") | Cliente nativo específico (Incoming Webhook formatado para Teams, conector Power BI) ainda não existe — hoje é o Admin quem aponta o webhook genérico para esses destinos via Zapier/Make/n8n |
| Dashboard: editor de grid livre | Mostrar/ocultar/reordenar blocos fixos implementado (ver "Dashboard personalizável") | Drag-and-drop de posição/tamanho arbitrário, se algum dia fizer sentido — escopo deliberadamente reduzido nesta primeira versão |

## Riscos técnicos a acompanhar

- **Dependências de terceiros.** `npm audit --omit=dev` está em **zero vulnerabilidades**
  e deve continuar assim: rode-o a cada nova dependência. O `package.json` fixa
  `overrides.uuid` porque o ExcelJS traz uma versão antiga transitivamente. O React Router
  está na 7 — a 6 acumulava dois alertas moderados (open redirect em `Link`/`useNavigate`
  e injeção via `deserializeErrors` no SSR), nenhum alcançável neste código, mas o upgrade
  saiu barato e fecha a porta antes de alguém adicionar um `?returnTo=` pós-login.
- **Duplicação operacional.** Dois projetos significam duas execuções de migration, dois
  deploys de Edge Function e dois conjuntos de segredos. É o custo consciente de tornar a
  contaminação QA→PRD fisicamente impossível. A aplicação de migrations em QA já é
  automática (`.github/workflows/deploy-migrations.yml`, ver "Migrations" acima); deploy
  de Edge Function segue manual (`supabase functions deploy`, ver "Edge Functions").
- **Volume da trilha de auditoria.** O gatilho grava `old_data` e `new_data` completos.
  Acima de ~10⁶ eventos, avalie particionamento por mês e política de retenção.
- **`v_resource_capacity`.** Gera uma série de 7 meses por colaborador. Com centenas de
  pessoas e milhares de alocações, considere materializar.
- **Custo do `v_project_overview`.** Usa subconsultas laterais por projeto. Adequado para
  centenas de projetos; para milhares, materialize com refresh incremental.
- **Bundle dos gráficos.** O chunk do Recharts é o maior da aplicação (~115 kB gzip).
  Já está isolado e carregado sob demanda, mas é candidato a substituição se o tempo de
  carga do dashboard se tornar crítico.
- **Backup de Storage.** O backup diário do Supabase cobre o banco, não os arquivos do
  Storage — anexos (`attachments`, ver `src/services/attachments.ts`) não têm backup
  automático nenhum. Volume baixo hoje (poucas unidades); reavaliar se o uso de anexos
  crescer.

## Continuidade e recuperação de desastre (backup/DR)

Levantamento feito em 20/09/2026 (organização `Contabilidade-Equatorial`, plano **Pro**).

**Estado atual, confirmado:**

| | QA | PRD |
|---|---|---|
| Backup automático diário (incluso no Pro) | Ativo | Ativo |
| Retenção | 7 dias | 7 dias |
| PITR (Point-in-Time Recovery) | Desativado | Desativado |
| Custo do backup atual | R$ 0 | R$ 0 |

**RPO (perda máxima de dados) — até 24h.** Sem PITR, um incidente minutos antes do
snapshot diário perde as mudanças daquele intervalo. Com PITR ativo custaria
~US$100/mês/projeto (retenção de 7 dias) e reduziria o RPO a ~2 minutos.

**RTO (tempo de restauração) — sem SLA formal do Supabase**, depende do tamanho do
banco. O volume atual da plataforma é pequeno (dezenas de linhas por tabela), então a
restauração deve levar minutos, não horas — mas isso não é garantido contratualmente,
só uma estimativa pelo tamanho de hoje.

**Decisão registrada: manter só o backup diário (padrão do Pro) em QA e PRD por ora,
sem contratar PITR.** Racional: o volume de lançamentos diário atual é baixo, e o pior
cenário do RPO de 24h — perder até um dia de atualização de tarefas/comentários/status —
é operacionalmente recuperável por reentrada manual, não é perda de fechamento contábil
já auditado (auditoria e financeiro não dependem de granularidade de segundos aqui).
Os ~US$1.200/ano/projeto do PITR não se justificam nesse volume.

**Reavaliar PITR quando:** o sistema virar registro oficial de fechamento com janela de
disponibilidade contínua, ou o volume diário de lançamentos crescer a ponto de "1 dia
perdido" gerar retrabalho real (não só reentrada pontual).

**Processo de restauração (documentado para quando for preciso):**
1. Dashboard do projeto → **Database → Backups** → escolher o snapshot mais próximo
   (antes) do ponto desejado → **Restore**.
2. O projeto fica **indisponível** durante o processo — avisar usuários antes.
3. Senhas de roles customizadas (se houver) não são preservadas no restore; resetar
   depois de concluído.
4. Também pode ser feito via Management API
   (`POST /v1/projects/{ref}/database/backups/restore-pitr` ou o endpoint de backup
   comum, conforme o tipo), usando `SUPABASE_ACCESS_TOKEN`.

**Fora do escopo do backup de banco:** arquivos do Storage (ver bullet acima, em
"Riscos técnicos a acompanhar") e nada em PRD depende de QA para restaurar — os dois
projetos são fisicamente isolados (ver `AMBIENTES.md`), então um incidente em um não
compromete o backup do outro.

## Hardening de segurança aplicado

Levantamento via `get_advisors` (Supabase) em QA/PRD, corrigido em
`20260919160000_harden_search_path_and_extensions.sql`:

- **`search_path` explícito em 15 funções** (14 em `app.*`, `public.risk_criticality`)
  que não tinham — mesma classe de bug do `hmac()` não resolvido em `app.webhook_post`
  (`20260919150000`), fechada preventivamente nas demais antes de aparecer de novo.
  Nenhuma delas chama função de extensão (confirmado lendo cada definição); todas só
  referenciam `app.*`/`public.*` já totalmente qualificado no corpo — sem risco
  funcional, é defesa em profundidade.
- **`btree_gist` movida para o schema `extensions`** (relocável, `extrelocatable = true`,
  e não usada por nenhum índice/constraint do schema hoje — o único índice GiST existente,
  `critical_calendar_period_idx`, usa suporte nativo de `daterange`, não operadores do
  `btree_gist`).
- **`pg_net` permanece em `public`, deliberadamente.** Não é relocável
  (`extrelocatable = false`, confirmado direto no catálogo) — gerenciada pelo próprio
  Supabase com schema interno fixo (`net`). O achado `extension_in_public` para `pg_net`
  fica aceito como está; forçar via drop/recreate arriscaria quebrar o webhook (PR
  #66/#68) por um ganho que a própria extensão não suporta.

**`auth_leaked_password_protection` resolvido** (toggle manual no painel de Auth,
`Authentication → Sign In / Providers → Email → Prevent use of leaked passwords`,
habilitado em QA e PRD — ver "Ambientes QA e PRD"). Confirmado via `get_advisors`: o
achado não aparece mais em nenhum dos dois ambientes.

Segue deliberadamente sem ação, não é uma pendência:
`authenticated_security_definer_function_executable` (13-14 RPCs públicas com
`SECURITY DEFINER` chamáveis por `authenticated`) é o desenho intencional da
plataforma — cada uma faz sua própria checagem de papel internamente, mesmo padrão
desde a `0011`.
