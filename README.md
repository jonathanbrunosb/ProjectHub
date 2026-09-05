# ProjectHub

**Gestão Integrada de Projetos.** Plataforma corporativa de **gestão de portfólio de
projetos (PPM)** construída para a Contabilidade: planejamento, execução, custos,
recursos, riscos, entregas, indicadores e governança de múltiplos projetos simultâneos,
em uma única fonte de verdade.

Substitui o controle disperso em planilhas, e-mails e apresentações por uma base
transacional com **controle de acesso no banco (RLS)**, **trilha de auditoria imutável**
e leitura executiva em segundos.

---

## O que a plataforma entrega

| Camada | Entrega |
|---|---|
| **Visão executiva** | Dashboard consolidado com KPIs de execução, financeiro e governança, todos com drill-down para os registros que os compõem. |
| **Visão corporativa** | Portfólio em tabela, kanban, cards, Gantt e roadmap, com colunas personalizáveis e visualizações salvas. |
| **Visão individual** | Página de projeto com 12 abas: visão geral, cronograma, tarefas, financeiro, recursos, riscos, ações, indicadores, decisões, campos personalizados, status reports e histórico. |
| **Gestão operacional** | Tarefas com peso, dependências, checklist, subtarefas, marcos e reprogramação com histórico. |
| **Gestão financeira** | Orçamento com revisões versionadas, realizado, comprometido, forecast, saldo e variação, com curva mensal e roll-up de portfólio. |
| **Gestão de riscos** | Riscos e issues em matriz 5×5, estratégia, plano de mitigação, risco residual e planos de ação corporativos. |
| **Governança** | Decisões e aprovações rastreáveis, status reports imutáveis após publicação, trilha de auditoria e relatórios prontos para reunião. |
| **Diferencial contábil** | Calendário crítico (fechamento, ITR, DFP, ECD, ECF, inventário, *freeze*) que sinaliza automaticamente entregas de projeto agendadas dentro de janelas sensíveis. |
| **Ambientes segregados** | QA (dados fictícios permanentes) e PRD (dados oficiais) em **projetos Supabase separados**, com troca restrita por permissão e auditada. Sem contaminação possível. |

---

## Stack

- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS, TanStack Query/Table, React Router 7, Recharts, Zod
- **Backend/BaaS:** Supabase — PostgreSQL, Auth, Storage privado, Edge Functions
- **Segurança:** RBAC na aplicação + **RLS no PostgreSQL** em todas as tabelas expostas
- **Deploy:** GitHub Actions → GitHub Pages (frontend estático; persistência no Supabase)

---

## Como rodar localmente

```bash
# 1. Dependências
npm ci

# 2. Variáveis de ambiente (somente chaves públicas)
cp .env.example .env.local
#   VITE_SUPABASE_QA_URL=https://<projeto-qa>.supabase.co
#   VITE_SUPABASE_QA_ANON_KEY=<anon de QA>
#   VITE_SUPABASE_PRD_URL=https://<projeto-prd>.supabase.co     # opcional em dev
#   VITE_SUPABASE_PRD_ANON_KEY=<anon de PRD>                    # opcional em dev
#
#   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY continuam valendo como QA.

# 3. Banco de dados (Supabase CLI)
supabase start
supabase db reset          # aplica migrations + seed demonstrativo

# 4. Aplicação
npm run dev
```

> **Nunca** coloque a `service_role` no `.env` do frontend nem em qualquer arquivo do
> bundle. Operações privilegiadas ficam em Edge Functions. O CI falha o build se
> encontrar indício de chave de serviço em `dist/`.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (typecheck + Vite) |
| `npm run lint` | ESLint (zero warnings tolerados) |
| `npm run test` | Testes unitários e de componente (Vitest) |
| `./supabase/tests/run.sh` | Schema + seed + testes de RLS, de regras de negócio e de ambientes |

---

## Usuários do seed demonstrativo

Pertencem **exclusivamente ao ambiente de QA** — não são replicados para Produção.
Senha de todos: `Pmo@2026`

| E-mail | Perfil | Enxerga |
|---|---|---|
| `admin@pmocontabil.dev` | Administrador | Tudo |
| `pmo@pmocontabil.dev` | PMO / Gerência | Todo o portfólio, com escrita |
| `sponsor@pmocontabil.dev` | Sponsor | Projetos patrocinados; registra decisões |
| `owner1@pmocontabil.dev` | Project Owner | Apenas os projetos que gerencia |
| `colab@pmocontabil.dev` | Colaborador | Projetos em que participa |
| `consulta@pmocontabil.dev` | Consulta | Somente leitura no escopo autorizado |
| `auditor@pmocontabil.dev` | Auditor | Tudo em leitura + trilha de auditoria |

Projetos de exemplo: IFRS 18 / CPC 51, Reforma Tributária, Migração SAP S/4HANA,
IA na Contabilidade, Fechamento D+4 e Automação de Conciliações — com status,
progressos, riscos, custos, owners e prazos distintos.

---

## Deploy no GitHub Pages

1. **Settings → Pages → Source:** *GitHub Actions*.
2. **Settings → Secrets and variables → Actions**, crie:
   - `VITE_SUPABASE_QA_URL` e `VITE_SUPABASE_QA_ANON_KEY`
   - `VITE_SUPABASE_PRD_URL` e `VITE_SUPABASE_PRD_ANON_KEY`

   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` seguem funcionando como QA, para não
   quebrar instalações anteriores. O Vite inlineia os valores no build — **trocar um
   segredo exige novo deploy**.
3. Faça push na `main`. O workflow `deploy.yml` builda, verifica a ausência de
   segredos no bundle e publica.

A aplicação usa `HashRouter`, porque o GitHub Pages é estático e não reescreve rotas —
sem isso, um *deep link* retornaria 404 no refresh.

### Domínio próprio (subdomínio)

O projeto está configurado para servir em `projecthub.contabilidade-eqtl.com`, via
`public/CNAME` (publicado junto do build) e `VITE_BASE_PATH=/` no workflow — um domínio
próprio serve a aplicação na raiz, diferente do padrão `<usuário>.github.io/<repo>/`.

1. **No provedor de DNS do domínio `contabilidade-eqtl.com`** (ex.: a *hosted zone* no
   Route 53, se foi lá que o domínio foi registrado), crie um registro:
   - Tipo: `CNAME`
   - Nome: `projecthub`
   - Valor: `<usuário-ou-organização-github>.github.io`
   - TTL: padrão (300–3600s)

   Isso não abre nenhuma relação de custo nova com a AWS além da *hosted zone* que já
   existe para o domínio — é só um registro de DNS apontando para fora.

2. **No GitHub:** Settings → Pages → **Custom domain** → digite
   `projecthub.contabilidade-eqtl.com` → Save. Depois que o DNS propagar, marque
   **Enforce HTTPS**.

3. A propagação do DNS costuma levar de alguns minutos a algumas horas.

Para voltar ao domínio padrão do GitHub Pages, remova `public/CNAME`, limpe o campo
*Custom domain* nas Settings → Pages, e mude `VITE_BASE_PATH` de volta para
`/${{ github.event.repository.name }}/` no workflow.

### Configuração do Supabase

Em **Authentication → URL Configuration**, adicione a URL final (a do domínio próprio,
se configurado; senão a do `github.io`) em *Site URL* e *Redirect URLs*:
`https://projecthub.contabilidade-eqtl.com/`

---

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — estrutura de código, modelo de dados e decisões técnicas
- [`docs/SEGURANCA.md`](docs/SEGURANCA.md) — modelo de permissões, RLS, auditoria e checklist de hardening
- [`docs/OPERACAO.md`](docs/OPERACAO.md) — migrations, seed, testes, automações e roadmap
- [`docs/AMBIENTES.md`](docs/AMBIENTES.md) — segregação QA/PRD, troca de ambiente, guardas e provisionamento de Produção

---

## Estado atual e próximos passos

**Implementado e validado:** schema com 15 migrations versionadas, RLS em todas as
tabelas expostas (47 asserções de teste), regras de negócio no banco (38 asserções),
segregação QA/PRD (14 asserções), 112 testes de frontend, build e deploy automatizados.

**Pendências conhecidas** — ver [`docs/OPERACAO.md`](docs/OPERACAO.md):
upload de anexos pela interface, Edge Functions de integração (Teams/e-mail/Power BI),
agendamento do motor de alertas, dashboards montáveis pelo usuário, MFA e o
provisionamento do projeto Supabase de Produção (código pronto; checklist em
[`docs/AMBIENTES.md`](docs/AMBIENTES.md)).
