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

Destinado a desenvolvimento e homologação. **Não use em produção.**

## Testes

```bash
npm run test                # 42 testes de frontend (Vitest + Testing Library)
./supabase/tests/run.sh     # 85 asserções no banco (47 de RLS + 38 de regras)
```

Cobertura do banco: progresso ponderado (incluindo subtarefas e canceladas), progresso
manual preservado, restrições de domínio, reprogramação de prazo, revisão de orçamento,
resumo financeiro, score e matriz de risco, health score automático, validação de campos
personalizados, imutabilidade de status report, conflito de calendário e captura da
auditoria.

Cobertura do frontend: consolidação de KPIs do portfólio, distribuições, curva financeira,
capacidade por equipe, formatação e fuso de datas, mapeamento tipado de campos
personalizados e comportamento da `DataTable` (busca, ocultar coluna, estado controlado,
clique na linha, estado vazio).

## Edge Functions

`supabase/functions/admin-invite-user` é o único ponto da plataforma que usa a
`service_role` — e ela existe apenas nas variáveis de ambiente da própria função,
nunca no navegador. Cadastra um usuário (`Configurações → Usuários → Adicionar
usuário`, restrito a Admin) e envia um convite por e-mail para a pessoa definir a
própria senha.

A função valida quem chama antes de usar qualquer privilégio: lê o JWT de quem fez
a requisição, confirma o papel em `profiles` pela RLS normal (sem elevação), e só
prossegue com a `service_role` se for `admin`.

**Deploy** (não faz parte do build do GitHub Pages — Edge Functions são publicadas
direto no Supabase):

- **Painel do Supabase:** `Edge Functions → Create a new function` → nome
  `admin-invite-user` → cole o conteúdo de `supabase/functions/admin-invite-user/index.ts`
  → **Deploy**.
- **Ou via CLI:** `supabase functions deploy admin-invite-user`.

Não é preciso configurar nenhuma variável nova: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` já existem automaticamente no
ambiente de toda Edge Function no Supabase.

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
| Edge Functions de integração | `admin-invite-user` implementada (cadastro de usuário pelo Admin) | Teams, Power BI, webhooks ainda pendentes |
| Agendamento do motor de alertas | Execução manual | Supabase Cron |
| Dashboards montáveis pelo usuário | Arquitetura preparada (componentes e `saved_views`) | Editor de layout |
| MFA | Schema preparado | Habilitar no Supabase Auth |
| Comentários por entidade | Tabela e RLS prontas | Componente de thread |
| EVM | Tabela `evm_snapshots` com SPI/CPI calculados | Tela de captura de PV/EV/AC |
| Edição de dependências pela interface | Tabela e visualização no Gantt prontas | Editor de predecessora/sucessora |

## Riscos técnicos a acompanhar

- **Volume da trilha de auditoria.** O gatilho grava `old_data` e `new_data` completos.
  Acima de ~10⁶ eventos, avalie particionamento por mês e política de retenção.
- **`v_resource_capacity`.** Gera uma série de 7 meses por colaborador. Com centenas de
  pessoas e milhares de alocações, considere materializar.
- **Custo do `v_project_overview`.** Usa subconsultas laterais por projeto. Adequado para
  centenas de projetos; para milhares, materialize com refresh incremental.
- **Bundle dos gráficos.** O chunk do Recharts é o maior da aplicação (~115 kB gzip).
  Já está isolado e carregado sob demanda, mas é candidato a substituição se o tempo de
  carga do dashboard se tornar crítico.
