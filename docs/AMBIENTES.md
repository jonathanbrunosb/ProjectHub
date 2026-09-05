# Ambientes QA e PRD

## Decisão de arquitetura

**QA e PRD são dois projetos Supabase distintos — não são um filtro na mesma tabela.**

Segregar por coluna (`environment = 'QA' | 'PRD'`) seria mais barato de implementar e
frágil por construção: um `WHERE` esquecido, uma política de RLS que não repete o filtro,
uma view, um gatilho ou uma função `SECURITY DEFINER` que ignore a coluna, e dado de teste
entra no relatório oficial. O risco não é hipotético — a plataforma tem 43 tabelas, 73
políticas, 5 views e 35 funções; cada uma seria um ponto de vazamento.

Com bancos separados, a contaminação deixa de depender de disciplina de código: não existe
consulta possível que alcance o outro ambiente. O custo é operacional (duas instâncias,
duas execuções de migration, dois conjuntos de segredos) e está documentado abaixo.

| | Filtro por coluna | Projetos separados (adotado) |
|---|---|---|
| Risco de vazamento QA→PRD | Alto — depende de cada consulta | Nulo — não há caminho físico |
| Esforço de implementação | Baixo | Médio |
| Custo de infraestrutura | 1 projeto | 2 projetos |
| Restore de PRD | Arrasta dados de QA | Isolado |
| Teste de carga em QA | Afeta PRD | Não afeta |

**Regra final: QA nunca pode contaminar PRD. PRD nunca pode depender de QA.**

## Como funciona no frontend

```
src/lib/supabase/client.ts     Dois clientes (QA/PRD) + Proxy no export `supabase`
src/app/EnvironmentProvider.tsx  Estado, persistência, ?env=, sequência de troca
src/hooks/useEnvironmentSwitch.ts  Permissão + auditoria da troca
src/components/layout/EnvironmentSwitcher.tsx  Seletor no topo da sidebar
src/components/ui/EnvironmentBadge.tsx  Indicador permanente (header, sidebar, mobile)
src/components/layout/EnvironmentMismatchBanner.tsx  Alerta de configuração divergente
```

**Por que um `Proxy` no export `supabase`.** Vinte e cinco módulos de `services/` importam
`supabase` diretamente. Trocar todos por `getSupabaseClient(env)` significaria propagar o
ambiente por toda a camada de dados — muita alteração em código que funciona, contra a
diretriz de não mexer no que já existe. O `Proxy` resolve cada acesso no cliente ativo do
momento, então `services/` continua idêntico e passa a ser sensível ao ambiente sem saber
disso. `getSupabaseClient(env)` continua disponível para quem precisar de um ambiente
explícito.

### Sequência da troca de ambiente

Executada por `switchEnvironment` em `EnvironmentProvider`, nessa ordem:

1. Valida a permissão (`profile.can_switch_environment`) — sem ela, nada acontece.
2. Verifica se o ambiente de destino está configurado (URL + chave anon presentes).
3. Encerra as assinaturas de Realtime do cliente atual (`removeAllChannels`).
4. Cancela as requisições em voo (`queryClient.cancelQueries`).
5. Limpa o cache (`queryClient.clear`) — nenhum dado do ambiente anterior sobrevive.
6. Troca o cliente ativo (`setActiveEnvironment`).
7. `AuthProvider` reage ao ambiente e revalida a sessão **daquele** projeto.
8. `App` remonta a árvore inteira (`<Suspense key={environment}>`).
9. Os dados são recarregados a partir do novo cliente.
10. A troca é registrada na trilha de auditoria (`environment_switch`).

O passo 8 é o que protege contra erro de contexto: um modal aberto em QA, com formulário
preenchido, é descartado na troca. Sem isso, um `submit` posterior gravaria em PRD um
payload montado com dados de QA.

**Sessões nunca se misturam.** Cada cliente usa seu próprio `storageKey`
(`pmo.auth.QA` / `pmo.auth.PRD`), então o JWT de um projeto nunca é apresentado ao outro —
o que, além de não funcionar, é prática proibida.

## Permissão

`profiles.can_switch_environment` (booleano, `false` por padrão). Concedida por Admin em
**Configurações → Usuários & Permissões → coluna "Alterna QA/PRD"**.

Três camadas:

- **Banco:** o gatilho `app.guard_profile_role` recusa a alteração da coluna por quem não
  é Admin — inclusive na própria linha. Ninguém se autoconcede acesso a Produção.
- **Aplicação:** `useEnvironmentSwitch` só executa a troca com a permissão presente.
- **Auditoria:** a tentativa negada é gravada como `environment_switch_denied`, com
  usuário, e-mail, origem, destino, user agent e correlation id.

Quem não tem a permissão **continua vendo** o ambiente em que está (com cadeado no
seletor). Esconder o indicador criaria o risco de operar em PRD achando que está em QA.

## Indicador visual

| Ambiente | Cor | Ícone | Texto |
|---|---|---|---|
| QA | Âmbar (`warn`) | `FlaskConical` | `QA • Ambiente de Testes` |
| PRD | Azul corporativo (`brand`) | `ShieldCheck` | `PRD • Produção` |

**Vermelho não é usado para PRD**: na plataforma inteira o vermelho significa erro,
atraso ou criticidade. Pintar Produção de vermelho quebraria essa leitura e, por
repetição, dessensibilizaria o usuário justamente para os alertas reais.

O indicador é permanente e sobrevive ao colapso da sidebar e ao layout mobile (variante
`compact`).

## Confirmação em PRD

`ConfirmDialog` acrescenta um bloco de aviso quando o ambiente é PRD:

> Você está operando no ambiente de PRODUÇÃO. Esta ação poderá alterar dados oficiais.

Como todas as confirmações destrutivas já passam por esse componente, o aviso cobre
exclusão, publicação e importação de uma só vez. **Não** foi adicionada confirmação extra
em operação rotineira: aviso em tudo vira ruído e o usuário passa a clicar sem ler.

## Exportações e relatórios

Toda exportação carimba o ambiente em três lugares:

- **Nome do arquivo:** `portfolio_de_projetos_PRD_2026-09-05.xlsx` (ou `.pdf`) / `..._QA_...`
- **Dentro do arquivo:** no Excel, a aba `Informacoes` traz ambiente, data de geração,
  usuário, filtros e contagem; no PDF, essas informações ficam no cabeçalho de abertura.
  Em QA, os dois trazem aviso em destaque: *"dados de QA (ambiente de testes). Não
  utilizar como informação oficial."*
- **Auditoria:** o evento `export` grava ambiente, formato e volume no payload.

Assim uma planilha que circula por e-mail não pode ser confundida com dado oficial — e
quem a recebe descobre a origem abrindo o próprio arquivo, sem depender do nome.

Não existe risco de mistura entre ambientes: a segregação é física (dois projetos
Supabase), então a exportação lê apenas a base do ambiente ativo.

## Guarda contra configuração errada

O banco declara o próprio ambiente em `public.app_environment` (tabela de linha única).
`EnvironmentMismatchBanner` compara a declaração com o ambiente selecionado e exibe um
alerta vermelho quando divergem.

É a proteção contra o erro mais provável da operação: apontar as variáveis
`VITE_SUPABASE_PRD_*` para o projeto de QA (ou o inverso). Sem a declaração no banco, esse
erro é silencioso — a aplicação diz "PRD" e grava em QA.

## Seeds

`supabase/seed.sql` aborta antes de qualquer escrita se o banco se declarar PRD:

```
ERROR: Seeds de teste sao proibidos em Producao (app_environment = PRD).
```

A guarda é programática, não uma convenção de operação. Todo o dado fictício —
incluindo `admin@pmocontabil.dev` — pertence a QA e não é replicado para PRD.

## Variáveis de ambiente

```bash
# QA
VITE_SUPABASE_QA_URL=https://<projeto-qa>.supabase.co
VITE_SUPABASE_QA_ANON_KEY=<anon de QA>

# PRD
VITE_SUPABASE_PRD_URL=https://<projeto-prd>.supabase.co
VITE_SUPABASE_PRD_ANON_KEY=<anon de PRD>
```

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` continuam funcionando como **fallback de
QA**, para que instalações anteriores não quebrem. PRD não tem fallback: sem as variáveis
`_PRD_`, o ambiente aparece desabilitado no seletor — o que é o comportamento correto,
melhor do que apontar Produção para um destino não configurado.

No GitHub: `Settings → Secrets and variables → Actions`, os quatro segredos acima. O
workflow injeta os dois conjuntos no build; o Vite inlineia valores em tempo de build,
então **qualquer troca de segredo exige novo build**.

## Provisionamento de PRD (checklist)

1. Criar o projeto Supabase de produção (região `sa-east-1` para latência no Brasil).
2. Aplicar as migrations `0001` → `0015`, em ordem, no SQL Editor.
   **Não rodar `seed.sql`.**
3. Declarar o ambiente:
   ```sql
   update public.app_environment set environment = 'PRD';
   ```
4. Publicar a Edge Function `admin-create-user` nesse projeto.
5. Criar o primeiro Admin real pelo painel (`Authentication → Users → Add user`, com
   *Auto Confirm*), e então:
   ```sql
   update public.profiles
      set role = 'admin', can_switch_environment = true
    where email = '<email-do-admin>';
   ```
6. Configurar *Site URL* e *Redirect URLs* com o domínio de produção.
7. Cadastrar `VITE_SUPABASE_PRD_URL` e `VITE_SUPABASE_PRD_ANON_KEY` nos segredos do
   GitHub e disparar um novo deploy.
8. Conferir na aplicação: seletor com PRD habilitado, badge azul, portfólio vazio com o
   estado "Nenhum projeto cadastrado em Produção", nenhum banner de divergência.

## Regra de mudança estrutural

Os dois ambientes têm **o mesmo schema**, sempre por migration versionada. Alteração
manual em PRD é proibida: cria divergência que só aparece quando a próxima migration
falha, no pior momento possível. Toda mudança nasce em QA, é validada lá e sobe para PRD
como o mesmo arquivo.
