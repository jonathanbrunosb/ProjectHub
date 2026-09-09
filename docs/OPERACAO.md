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

> A `0015` é separada da `0014` porque um valor recém-adicionado a um `enum` não pode ser
> usado na mesma transação em que foi criado. Rode-as **em duas execuções distintas**.

**As duas bases recebem as mesmas migrations, sempre em ordem.** Alteração estrutural
manual em PRD é proibida: cria divergência de schema que só aparece quando a próxima
migration falha. Ver [AMBIENTES.md](AMBIENTES.md).

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
npm run test                # 155 testes de frontend (Vitest + Testing Library)
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
| Projeto Supabase | Existente | A provisionar |
| Migrations `0001` → `0018` | Sim | Sim, as mesmas |
| `seed.sql` | Sim | **Nunca** (bloqueado por guarda) |
| `app_environment` | `QA` | `PRD` (definir manualmente após as migrations) |
| Edge Functions (`admin-create-user`, `admin-reset-password`, `admin-delete-user`) | Publicadas | Publicar |
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

- **Dependências de terceiros.** `npm audit --omit=dev` está em **zero vulnerabilidades**
  e deve continuar assim: rode-o a cada nova dependência. O `package.json` fixa
  `overrides.uuid` porque o ExcelJS traz uma versão antiga transitivamente. O React Router
  está na 7 — a 6 acumulava dois alertas moderados (open redirect em `Link`/`useNavigate`
  e injeção via `deserializeErrors` no SSR), nenhum alcançável neste código, mas o upgrade
  saiu barato e fecha a porta antes de alguém adicionar um `?returnTo=` pós-login.
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
