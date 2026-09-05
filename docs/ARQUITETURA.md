# Arquitetura

## Princípio central

**O banco é a fonte de verdade da autorização e das regras de negócio.** O frontend é
uma camada de apresentação: esconder um botão é conveniência de UX, nunca controle de
acesso. Toda regra que, se burlada, causaria dano — permissão, imutabilidade de status
report, escalação de privilégio, validação financeira — está implementada em RLS,
*constraints* ou gatilhos no PostgreSQL.

## Estrutura de código

```
src/
  app/            Providers (tema, ambiente, autenticação, TanStack Query) e roteamento
  components/
    ui/           Design system interno (Button, Input, DataTable, Modal, Toast, ...)
    layout/       AppShell, Sidebar, Topbar, Breadcrumbs
    charts/       Primitivas de gráfico e tokens de cor
    gantt/        Componente de Gantt/roadmap reutilizável
  features/       Um diretório por domínio (dashboard, portfolio, projects, tasks,
                  risks, financial, resources, calendar, reports, audit, settings)
  hooks/          Hooks transversais (ex.: useTableState)
  lib/export/     Geração de Excel (.xlsx) e PDF, carregadas sob demanda
  lib/supabase/   Clientes QA/PRD e utilitários de auditoria
  services/       Acesso a dados — única camada que fala com o Supabase
  types/          Tipos de domínio espelhando os enums do PostgreSQL
  utils/          Formatação, rótulos de domínio, helpers puros
supabase/
  migrations/     Migrations versionadas (0001 → 0015)
  tests/          Shim do ambiente Supabase + testes de RLS e de regras de negócio
  seed.sql        Seed demonstrativo
```

**Regras de organização:**

- Componentes não chamam o Supabase diretamente — sempre via `services/`.
- `services/` não conhece React; devolve tipos de domínio.
- Cálculos usados em dashboards ficam em funções puras (`features/*/selectors.ts`),
  o que os torna testáveis sem renderizar componentes.
- Nenhum arquivo concentra a aplicação: o maior módulo de feature tem ~700 linhas.

## Ambientes QA e PRD

QA e PRD são **dois projetos Supabase distintos**, não um filtro na mesma base. A
aplicação mantém um cliente por ambiente e o export `supabase` é um `Proxy` que resolve no
cliente ativo — a camada `services/` permanece inalterada e mesmo assim passa a respeitar o
ambiente. Sessões, Storage, RLS e dados são fisicamente separados; não existe consulta que
alcance o outro lado.

Detalhamento, sequência de troca, permissão, guardas e provisionamento: **[AMBIENTES.md](AMBIENTES.md)**.

## Modelo de dados

Todas as tabelas usam UUID como chave e carregam `created_at`, `created_by`,
`updated_at`, `updated_by`, preenchidos por gatilho (`app.attach_stamps`).

### Blocos

| Bloco | Tabelas |
|---|---|
| Identidade e organização | `profiles`, `companies`, `business_units`, `teams`, `team_memberships` |
| Portfólio | `portfolios`, `project_templates`, `template_phases`, `template_tasks`, `projects`, `project_members`, `project_business_units`, `project_phases` |
| Execução | `tasks`, `task_dependencies`, `task_corresponsibles`, `task_checklist_items`, `task_reschedules`, `milestones` |
| Financeiro | `project_budgets`, `financial_entries`, `cost_centers` |
| Riscos e governança | `risks`, `action_plans`, `indicators`, `indicator_measurements`, `evm_snapshots`, `decisions`, `approvals` |
| Recursos e calendário | `resource_allocations`, `critical_calendar_events` |
| Flexibilidade | `custom_field_definitions`, `custom_field_options`, `custom_field_values` |
| Colaboração | `comments`, `attachments`, `status_reports`, `saved_views`, `column_preferences`, `notifications`, `automation_rules` |
| Auditoria | `application_audit_log` |
| Configuração | `health_rules`, `app_environment` |

### Decisões de modelagem

**Campos personalizados em colunas tipadas, não JSONB genérico.**
`custom_field_values` tem `value_text`, `value_number`, `value_date`, `value_timestamp`,
`value_boolean`, `value_uuid` e `value_json`. Cada coluna tem índice por definição de
campo, o que permite filtrar e ordenar por campo customizado com desempenho. JSONB seria
mais simples de escrever e inutilizável para filtro em escala. Um gatilho
(`app.validate_custom_field_value`) valida o tipo e as opções de lista na gravação.

**Progresso físico ponderado, calculado no banco.**
`app.calc_project_progress` faz `SUM(progresso × peso) / SUM(peso)` considerando apenas
**tarefas folha** — uma subtarefa substitui a tarefa-pai, evitando contagem dupla — e
ignorando canceladas. `app.calc_project_planned_progress` deriva o avanço planejado da
fração de prazo decorrida de cada tarefa. Um gatilho propaga o resultado para
`projects.progress_actual`, respeitando projetos com metodologia manual.

**Orçamento versionado, nunca sobrescrito.**
Cada revisão é uma linha em `project_budgets`, com justificativa e aprovador. Um índice
único parcial garante uma única revisão vigente por projeto, e um gatilho `BEFORE` libera
a revisão anterior antes da gravação — necessário porque o índice é avaliado no momento
da inserção da linha.

**Status report imutável após publicação.**
Publicar (`public.publish_status_report`) congela um snapshot JSONB do projeto, riscos,
marcos e decisões. Um gatilho impede qualquer alteração de um report publicado e impede
que ele volte a rascunho. Correções exigem nova versão, que marca a anterior como
substituída.

**Saúde automática com override auditável.**
`app.calc_project_health` considera desvio de avanço, desvio financeiro, marcos críticos
vencidos e riscos críticos sem mitigação, com limiares configuráveis em `health_rules`.
O override manual (`public.override_project_health`) exige justificativa de no mínimo 10
caracteres e grava autor e data — a função rejeita a operação se a justificativa for
insuficiente ou se o usuário não gerenciar o projeto.

### Views de leitura

- `v_project_overview` — base do portfólio e da visão executiva: projeto + financeiro +
  contagens de risco, tarefa, ação e decisão + próximo marco. Uma consulta em vez de N+1.
- `v_project_financials` / `v_project_financial_curve` — resumo e curva mensal.
- `v_resource_capacity` — capacidade × alocação por colaborador e mês, com as horas de
  uma alocação **rateadas pelos dias de sobreposição** com o mês (uma alocação de três
  meses não aparece integral em cada um deles).
- `v_calendar_conflicts` — marcos que caem dentro de janelas críticas da Contabilidade.

Todas as views usam `security_invoker = on`, herdando a RLS das tabelas base.

## Personalização de tabelas

Três camadas combinadas no hook `useTableState`:

1. **Estado da sessão** — ordenação, busca, agrupamento em memória.
2. **Preferência do usuário** — `column_preferences`, chaveada por `usuário + módulo + view`,
   persistida no banco (sobrevive à troca de dispositivo, ao contrário de `localStorage`).
3. **Visualizações salvas** — `saved_views`, com escopo privado, compartilhado, padrão do
   projeto ou padrão do template.

## Performance

Route splitting por módulo (`React.lazy`), *manual chunks* para React/Query/Charts/Supabase,
paginação em todas as tabelas, `SELECT` de colunas explícitas (nunca `SELECT *`), índices
para todos os filtros e ordenações usados na interface, agregações resolvidas em views
laterais em vez de N+1, e cache do TanStack Query com invalidação dirigida por mutação.
Erros de permissão (`42501`) não são reprocessados — *retry* em erro de RLS é desperdício.

## Responsividade e tema

Menu lateral recolhível com estado persistido; tabelas com rolagem horizontal e colunas
fixáveis; kanban com rolagem; dashboards reorganizados por *breakpoint*; modais viram
*bottom sheets* no celular. O tema claro/escuro usa variáveis CSS em `:root`/`.dark`,
aplicadas antes da hidratação por um script inline no `index.html` para evitar *flash*.
