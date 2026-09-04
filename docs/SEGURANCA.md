# Segurança

## Modelo de permissões

Sete perfis globais (`app.role_key`), combinados com o vínculo do usuário ao projeto
(`project_members`), à equipe, à empresa e à unidade de negócio.

| Perfil | Leitura | Escrita |
|---|---|---|
| **Administrador** | Tudo | Tudo, incluindo configuração e papéis |
| **PMO / Gerência** | Todo o portfólio | Todos os projetos, templates, campos, calendário |
| **Sponsor** | Projetos patrocinados | Decisões e aprovações desses projetos |
| **Project Owner** | Projetos que gerencia | Gestão completa desses projetos, incluindo orçamento e membros |
| **Colaborador** | Projetos em que participa | Execução (tarefas, riscos, ações) nesses projetos |
| **Consulta** | Projetos em que participa | Nenhuma |
| **Auditor** | Todo o portfólio + trilha de auditoria | Nenhuma |

O RBAC do frontend (`useAuth().can()`) existe apenas para **não oferecer ações que o
banco vai recusar**. A autorização efetiva é a RLS.

## Row Level Security

RLS habilitada em **todas** as tabelas do schema `public`, com políticas separadas por
operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). O papel `anon` não recebe nenhum
`GRANT`; `authenticated` recebe DML e passa pelas políticas.

A autorização é centralizada em funções `SECURITY DEFINER` no schema `app`:

| Função | Responde |
|---|---|
| `app.my_role()` | Papel global do usuário autenticado |
| `app.is_admin()` / `app.is_portfolio_manager()` / `app.is_portfolio_reader()` | Alçadas corporativas |
| `app.can_read_project(uuid)` | Leitura do projeto (corporativa, owner, sponsor ou membro) |
| `app.can_write_project(uuid)` | Escrita operacional no projeto |
| `app.can_manage_project(uuid)` | Gestão: orçamento, membros, exclusão, override de saúde |
| `app.is_project_sponsor(uuid)` | Sponsor do projeto, para decisões e aprovações |

Serem `SECURITY DEFINER` evita recursão de política (uma política sobre `project_members`
que consultasse `project_members` sob RLS entraria em laço) e concentra a regra em um só
lugar. Por isso as tabelas usam `ENABLE ROW LEVEL SECURITY` sem `FORCE`: o *owner* precisa
enxergar as linhas para avaliar a própria política.

### Proteções específicas

- **Escalação de privilégio:** o gatilho `app.guard_profile_role` impede que um usuário
  altere o próprio papel ou ative/desative outros — a política de `UPDATE` sozinha
  permitiria editar a própria linha.
- **IDOR entre projetos:** toda tabela filha filtra por `app.can_read_project(project_id)`.
  Um Project Owner não enxerga sequer a existência de projeto alheio.
- **Trilha de auditoria:** append-only. Um gatilho `BEFORE UPDATE OR DELETE` levanta
  exceção — inclusive para Administradores — e os `GRANT` de escrita são revogados.
- **Storage:** bucket `project-files` privado, com política por projeto derivada do
  primeiro segmento do caminho (`<project_id>/<entidade>/<arquivo>`). Download apenas por
  URL assinada. Tipos MIME e tamanho (50 MB) restritos no bucket.
- **Validação de payload:** Zod no frontend; `CHECK`, `UNIQUE` e `FOREIGN KEY` no banco.
  A validação do cliente é usabilidade; a do banco é o controle.

## Segredos

- O frontend usa **exclusivamente** a chave `anon` (pública).
- A `service_role` **nunca** entra no bundle. O workflow de CI e o de deploy falham se
  encontrarem indício dela em `dist/`.
- Operações que exigem segredo ou privilégio ficam em Edge Functions. Quando a ação deve
  respeitar a RLS do usuário, o cliente da função é inicializado com o **JWT recebido**,
  não com a service role.

## Trilha de auditoria

Alterações de dados são capturadas por gatilho no PostgreSQL (`app.audit_row_change`) —
não pelo cliente, que não é fonte confiável. O gatilho classifica semanticamente a ação
(`status_change`, `health_change`, `financial_change`, `schedule_change`,
`ownership_change`) e grava `old_data`, `new_data` e `changed_fields`.

Eventos com contexto de sessão (login, logout, exportação) usam a RPC
`public.log_app_event`, que só aceita esse conjunto restrito de ações e rejeita chamada
não autenticada.

Registra-se: quem, quando (UTC), qual ação, qual entidade, qual projeto, o antes, o
depois, os campos alterados, IP, user agent, correlation id e origem.

## Testes de segurança

`supabase/tests/01_rls_tests.sql` — **47 asserções** executadas contra um PostgreSQL
limpo no CI, assumindo a identidade de cada perfil:

- Anônimo não lê projetos, tarefas nem auditoria.
- Admin e PMO leem todo o portfólio; PMO escreve em qualquer projeto.
- Auditor lê tudo e a trilha, mas não altera projeto, não cria tarefa e não apaga log.
- Project Owner escreve no próprio projeto e **não enxerga** o projeto alheio (IDOR).
- Colaborador escreve nos projetos em que participa, mas não altera orçamento nem membros.
- Consulta não escreve nada.
- Sponsor registra decisão do projeto que patrocina.
- Colaborador não se promove a admin nem desativa outro usuário.
- Admin não altera nem apaga a trilha de auditoria.
- Preferências de coluna são visíveis apenas ao próprio usuário.
- Status report publicado não pode ser alterado.
- Override de saúde exige justificativa e alçada.

## Checklist de hardening antes de produção

- [ ] Habilitar MFA no Supabase Auth (o schema já está preparado).
- [ ] Definir *Site URL* e *Redirect URLs* apenas com os domínios legítimos.
- [ ] Configurar expiração de sessão e refresh token conforme a política interna.
- [ ] Aplicar rate limit nas Edge Functions sensíveis.
- [ ] Revisar `GRANT` no schema `public` após qualquer nova migration.
- [ ] Confirmar que toda tabela nova tem RLS habilitada — migrations posteriores à `0011`
      precisam habilitar explicitamente (é o caso de `health_rules` na `0012`).
- [ ] Rodar `./supabase/tests/run.sh` no pipeline a cada alteração de schema.
