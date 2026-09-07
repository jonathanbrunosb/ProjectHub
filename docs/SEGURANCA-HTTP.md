# Segurança HTTP do ProjectHub

Resposta técnica à nota **F** no SecurityHeaders.com. Este documento registra o
diagnóstico, o que foi implementado, o que depende do administrador de
infraestrutura e o que continua em aberto.

---

## 1. Diagnóstico da causa da nota F

A causa não é configuração errada: é **arquitetural**. O ProjectHub é publicado
no **GitHub Pages**, que **não permite configurar cabeçalhos HTTP de resposta**.
Não existe `_headers`, `netlify.toml`, `vercel.json`, regra de proxy nem opção no
painel. Os cabeçalhos entregues são os que o GitHub decide enviar.

Consequência direta: **nenhum** dos seis cabeçalhos cobrados pelo
SecurityHeaders.com podia ser entregue pela hospedagem atual — daí a nota F.

Evidências coletadas no repositório:

| Verificação | Resultado |
|---|---|
| `public/CNAME` | `projecthub.contabilidade-eqtl.com` (domínio próprio) |
| `.github/workflows/deploy.yml` | `actions/deploy-pages` → GitHub Pages |
| `public/.nojekyll` | presente (padrão GitHub Pages) |
| Configuração de CDN/proxy no repositório | nenhuma |
| `netlify.toml` / `vercel.json` / `_headers` | inexistentes |

---

## 2. Hospedagem e camada responsável pelos cabeçalhos

- **Hospedagem atual:** GitHub Pages, domínio próprio via `CNAME`.
- **CI/CD:** GitHub Actions (`deploy.yml`), build Vite → `dist/` → Pages.
- **Camada correta para os cabeçalhos:** um **proxy/CDN à frente do Pages**, ou
  uma hospedagem estática que suporte cabeçalhos. Essa mudança **não foi
  realizada** — depende de aprovação e de acesso a DNS.

O que dá para fazer **sem** tocar em infraestrutura, e foi feito, está na seção 5.
O que **não** tem como ser resolvido pelo documento HTML: `Strict-Transport-Security`,
`X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy` e a diretiva
`frame-ancestors` — todos exigem cabeçalho HTTP real.

---

## 3. Cabeçalhos anteriores identificados

**Não foi possível inspecionar as URLs publicadas a partir do ambiente onde este
trabalho foi executado** — o proxy de rede bloqueia todo tráfego externo
(`CONNECT tunnel failed, response 403` para qualquer destino). Portanto **não há
aqui evidência dos cabeçalhos anteriores**, e nada é afirmado sobre eles.

A evidência precisa ser produzida por quem tem acesso à rede, com o script
entregue na seção 9.

---

## 4. Cabeçalhos propostos

| Cabeçalho | Valor | Onde |
|---|---|---|
| `Content-Security-Policy` | ver seção 7 | meta no HTML **e** cabeçalho (infra) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | meta no HTML **e** cabeçalho |
| `Strict-Transport-Security` | `max-age=86400` → depois `31536000` | **só** cabeçalho (infra) |
| `X-Frame-Options` | `DENY` | **só** cabeçalho (infra) |
| `X-Content-Type-Options` | `nosniff` | **só** cabeçalho (infra) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | **só** cabeçalho (infra) |
| `Cross-Origin-Opener-Policy` | `same-origin` | cabeçalho (infra) |
| `Cross-Origin-Resource-Policy` | `same-origin` | cabeçalho (infra) |
| `Cache-Control` | `immutable` em `/assets/*`, `no-cache` em `index.html` | cabeçalho (infra) |

**HSTS em implantação progressiva**, conforme pedido: começa em `max-age=86400`
(1 dia). Só avance para 1 ano — e só considere `includeSubDomains` — depois de
confirmar que **todos** os subdomínios de `contabilidade-eqtl.com` atendem em
HTTPS. `preload` **não** é recomendado agora: é praticamente irreversível e
afeta o domínio corporativo inteiro.

---

## 5. Arquivos alterados

| Arquivo | O que mudou | Por quê |
|---|---|---|
| `index.html` | meta CSP + meta referrer; script inline removido | única camada disponível hoje |
| `public/theme-init.js` | **novo** — script de tema, antes inline | permite `script-src 'self'` sem `unsafe-inline` nem hash frágil |
| `infra/headers/_headers` | **novo** — cabeçalhos para Netlify/Cloudflare Pages | pronto para a camada de infra, sem ser publicado por engano |
| `scripts/csp-smoke-test.mjs` | **novo** — valida a CSP em Chromium real | substitui a fase Report-Only, impossível no Pages |
| `scripts/check-security-headers.mjs` | **novo** — verifica a URL publicada | produz a evidência da seção 9 |
| `src/__tests__/securityHeaders.test.ts` | **novo** — trava a política | impede afrouxamento silencioso |

O arquivo `_headers` fica em `infra/`, **não** em `public/`: publicado hoje no
GitHub Pages ele seria um arquivo estático inerte, dando falsa impressão de que
a política está valendo.

---

## 6. Configurações de infraestrutura necessárias (dependem do administrador)

Duas opções, ambas preservando GitHub como repositório, GitHub Actions como
CI/CD, React+TypeScript+Vite e Supabase. **Nenhuma foi executada** — exigem
aprovação e acesso a DNS.

### Opção A — Cloudflare (proxy à frente do GitHub Pages) — recomendada

Mantém a hospedagem atual. O DNS de `projecthub.contabilidade-eqtl.com` passa a
apontar para a Cloudflare em modo proxy (nuvem laranja), e os cabeçalhos são
adicionados por **Rules → Transform Rules → Modify Response Header**, com os
valores de `infra/headers/_headers`.

- Esforço: baixo. Reversível desligando o proxy.
- Risco: mudança de DNS do domínio — precisa de janela e aprovação.
- Bônus: HSTS tem opção dedicada no painel (SSL/TLS → Edge Certificates).

### Opção B — Cloudflare Pages ou Netlify (troca de hospedagem)

Copiar `infra/headers/_headers` para `public/_headers` e apontar o deploy para a
plataforma escolhida. Mais controle, porém mexe no pipeline de publicação.

### O que **não** foi feito, por decisão explícita

Migração de hospedagem, alteração de DNS e qualquer mudança em infraestrutura de
produção — conforme a restrição do escopo.

---

## 7. Política CSP final

```
default-src 'self';
base-uri 'self';
object-src 'none';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
style-src-attr 'unsafe-inline';
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https://mhmlcnylugoutzadiwww.supabase.co https://anjdrbvftudnxddwexpm.supabase.co;
connect-src 'self' https://mhmlcnylugoutzadiwww.supabase.co wss://mhmlcnylugoutzadiwww.supabase.co
            https://anjdrbvftudnxddwexpm.supabase.co wss://anjdrbvftudnxddwexpm.supabase.co;
worker-src 'self' blob:;
frame-src 'none';
frame-ancestors 'none';   /* só no cabeçalho HTTP - ignorado em meta */
form-action 'self';
upgrade-insecure-requests;
```

---

## 8. Justificativa de cada origem autorizada

| Diretiva / origem | Por que está autorizada |
|---|---|
| `default-src 'self'` | tudo que não for explicitamente liberado vem do próprio domínio |
| `script-src 'self'` | **sem** `unsafe-inline` e **sem** `unsafe-eval`. O único script inline (tema) virou arquivo. A ausência de `unsafe-eval` foi **comprovada no navegador**: os 7 chunks pesados (recharts, exceljs, jspdf, html2canvas, purify) importam e executam sem ela — o `Function("return this")` presente neles é fallback de `globalThis` e nunca é avaliado em navegador moderno |
| `style-src ... fonts.googleapis.com` | o `index.html` carrega a folha de estilo da fonte Inter |
| `style-src-attr 'unsafe-inline'` | 22 usos de `style={{...}}` no React. Diretiva **separada** de propósito: libera apenas o **atributo** `style`, que não executa script — `<style>` e folhas externas seguem restritos |
| `font-src ... fonts.gstatic.com` | arquivos `.woff2` da fonte Inter |
| `img-src 'self' data: blob:` | `data:`/`blob:` para gráficos e exportações (canvas → PNG/PDF) |
| `img-src ... supabase.co` | imagens de anexos servidas pelo Storage via URL assinada |
| `connect-src ... supabase.co` | REST (131 chamadas), Auth (11), RPC (9), Storage (4), Edge Functions (2) — todos no mesmo host de cada projeto |
| `connect-src wss://...` | Realtime. Hoje o app só chama `removeAllChannels()`, mas o cliente pode abrir WS; autorizar evita quebra futura sem custo de segurança |
| `worker-src 'self' blob:` | `@supabase/supabase-js` instancia Worker; libs de exportação usam blob |
| `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | fecham vetores clássicos (plugins, sequestro de base, exfiltração por formulário) |
| `frame-src`/`frame-ancestors 'none'` | o app não incorpora nem é incorporado |

**As duas origens Supabase (QA e PRD) constam na mesma política** porque o
**mesmo bundle, no mesmo domínio, atende os dois ambientes** — a troca é
client-side. Segregar a CSP por ambiente exigiria domínios/deploys separados
(ver seção 12).

---

## 9. Resultado dos testes e evidências

### Validado aqui, com navegador real (`scripts/csp-smoke-test.mjs`)

Executa o build de produção em Chromium com a CSP aplicada:

```
Rotas testadas: /, /#/login, /#/cadastro, /#/esqueci-senha
Tela de login renderizou: SIM
CSP comprovadamente ATIVA (bloqueou origem nao autorizada): SIM
Chunks sob demanda importados: charts, exceljs, html2canvas, index.es, jspdf, jspdf.plugin.autotable, purify
Falhas ao importar chunks: 0
Violacoes de CSP relatadas pelo navegador: 0
Erros de console relacionados a CSP: 0
RESULTADO: OK - nenhuma violacao e app renderizou
```

O teste de controle é essencial: uma CSP **malformada** também produziria zero
violações, idêntico a uma CSP perfeita. O script prova que a política está viva
tentando alcançar uma origem que ela deve barrar.

### Ainda **não** validado — depende de você

Os cabeçalhos realmente entregues pela URL publicada. Rode:

```bash
node scripts/check-security-headers.mjs https://projecthub.contabilidade-eqtl.com
```

Ele verifica redirecionamento HTTP→HTTPS, resposta HTTPS, cada cabeçalho, e a
cobertura em rota de SPA e asset estático (proxy mal configurado costuma cobrir
só `/`).

### Fluxos que exigem sessão autenticada

Login, logout, recuperação de senha, troca QA/PRD, dashboards, gráficos, tabelas,
Gantt, Kanban, anexos, upload, download, Realtime, Edge Functions e exportações
**não foram exercitados** — o ambiente de execução não tem credenciais nem rede.
Precisam de teste manual após a publicação.

---

## 10. Segurança além da nota (auditoria do bundle publicado)

| Verificação | Resultado |
|---|---|
| `service_role` no bundle | **ausente** |
| Chaves JWT embutidas | nenhuma além das `anon` esperadas |
| Source maps em produção | **não gerados** (`sourcemap: mode !== 'production'`) e nenhum `.map` no `dist/` |
| `sourceMappingURL` residual | nenhum |
| Vulnerabilidades em **produção** (`npm audit --omit=dev`) | **0** |
| Vulnerabilidades em devDependencies | 5 (vite, vitest, esbuild e transitivas) — **não vão para o bundle**; afetam servidor de desenvolvimento local. Recomenda-se atualizar, sem urgência de produção |

---

## 11. Pendências para PRD

1. Escolher e aprovar a opção de infraestrutura (seção 6).
2. Aplicar os cabeçalhos e rodar `check-security-headers.mjs` como evidência.
3. Testar manualmente os fluxos autenticados da seção 9.
4. Evoluir o HSTS de `86400` para `31536000` **somente** após confirmar HTTPS em
   todos os subdomínios do domínio corporativo.
5. Reavaliar `includeSubDomains` e `preload` — nenhum dos dois agora.

---

## 12. Riscos residuais

- **Segregação QA/PRD na CSP é imperfeita por arquitetura.** Um único domínio e
  bundle atendem os dois ambientes, então a política autoriza as duas origens
  Supabase simultaneamente. Resolver isso exige domínios separados por ambiente —
  mudança de arquitetura de publicação, fora do escopo desta entrega.
- **`style-src-attr 'unsafe-inline'`** permanece por causa dos estilos inline do
  React. Risco baixo (atributo `style` não executa script); eliminar exigiria
  refatorar 22 pontos do código.
- **Sem fase Report-Only.** O GitHub Pages não envia esse cabeçalho; a mitigação
  foi a validação em navegador real, que cobre as rotas públicas mas **não** as
  autenticadas.
- **Nota A no SecurityHeaders.com não é certificado de segurança.** RLS,
  permissões de Storage, autorização de Edge Functions e regras de negócio
  continuam sendo a defesa principal.

---

## 13. Rollback

| Situação | Ação | Efeito |
|---|---|---|
| CSP bloqueou algo em produção | remover o bloco `<meta http-equiv="Content-Security-Policy">` do `index.html`, publicar | volta ao comportamento anterior em um deploy |
| Necessidade de manter a CSP mas liberar um recurso | adicionar **a origem específica** na diretiva correspondente — nunca `*`, `unsafe-inline` ou `unsafe-eval` | mantém a proteção |
| Cabeçalhos de infra causaram problema | desligar a regra no proxy/CDN | imediato, sem deploy |
| HSTS precisa ser revertido | reduzir `max-age` e aguardar a expiração já entregue aos navegadores | **não é imediato** — motivo de começar com 1 dia |

Antes de qualquer alteração na política, rode:

```bash
npm run build && node scripts/csp-smoke-test.mjs
npx vitest run src/__tests__/securityHeaders.test.ts
```
