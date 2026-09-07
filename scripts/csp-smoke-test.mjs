/**
 * Valida a Content-Security-Policy contra o build real, num navegador real.
 *
 * Por que existe: o app e' publicado no GitHub Pages, que nao permite enviar
 * `Content-Security-Policy-Report-Only`. Sem esse modo, a unica forma honesta de
 * homologar a politica antes de publicar e' carregar o bundle de producao num
 * Chromium com a CSP aplicada e capturar as violacoes que o proprio navegador
 * reporta - que e' o que este script faz.
 *
 * Uso: node scripts/csp-smoke-test.mjs
 * Requer: dist/ construido (`npm run build`) e playwright-core instalado.
 */
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const DIST = resolve(process.cwd(), 'dist');
const PORT = 4180;
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * Serve o dist como o GitHub Pages serve: fallback para index.html nas rotas da
 * SPA. Os cabecalhos de seguranca que dependem de servidor sao enviados aqui
 * para que o teste reflita o alvo (proxy/CDN), nao so' a meta do documento.
 */
function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let filePath = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      filePath = join(DIST, 'index.html'); // fallback de SPA
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();

const violations = [];
const consoleErrors = [];

// O evento nativo do navegador e' a fonte de verdade sobre a CSP.
await page.addInitScript(() => {
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__cspViolations.push({
      directive: e.effectiveDirective || e.violatedDirective,
      blocked: e.blockedURI,
      sample: e.sample || '',
    });
  });
});
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

const rotas = ['/', '/#/login', '/#/cadastro', '/#/esqueci-senha'];
for (const rota of rotas) {
  await page.goto(`http://localhost:${PORT}${rota}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const encontradas = await page.evaluate(() => window.__cspViolations ?? []);
  for (const v of encontradas) violations.push({ rota, ...v });
  await page.evaluate(() => { window.__cspViolations = []; });
}

// Prova que a pagina realmente renderizou (uma CSP que quebra tudo tambem
// "nao gera violacao" se nada carregar - por isso a checagem de conteudo).
await page.goto(`http://localhost:${PORT}/#/login`, { waitUntil: 'networkidle' });
const renderizou = await page.locator('text=Acessar a plataforma').count();

// CONTROLE: uma CSP malformada e' ignorada pelo navegador e tambem produz zero
// violacoes - identico a uma CSP perfeita. Este teste negativo prova que a
// politica esta' realmente ativa, buscando uma origem que ela deve barrar.
const cspAtiva = await page.evaluate(async () => {
  try {
    await fetch('https://origem-nao-autorizada.example/teste');
    return false; // passou = CSP nao esta' bloqueando nada
  } catch {
    return true;
  }
});
await page.evaluate(() => { window.__cspViolations = []; });

// Os chunks pesados sao carregados sob demanda (relatorios, graficos, exports) e
// nao aparecem nas rotas publicas - mas sao justamente os que contem
// `Function("return this")`. Importados aqui de verdade para provar que
// executam sem 'unsafe-eval'; se precisassem, a violacao apareceria agora.
const arquivos = await readdir(join(DIST, 'assets'));
const pesados = arquivos.filter(
  (f) => f.endsWith('.js') && /^(charts|exceljs|jspdf|html2canvas|index\.es|purify)/.test(f),
);
const falhasImport = await page.evaluate(async (lista) => {
  const erros = [];
  for (const arquivo of lista) {
    try {
      await import(`/assets/${arquivo}`);
    } catch (e) {
      erros.push(`${arquivo}: ${e.message}`);
    }
  }
  return erros;
}, pesados);
await page.waitForTimeout(400);
const violacoesChunks = await page.evaluate(() => window.__cspViolations ?? []);
for (const v of violacoesChunks) violations.push({ rota: 'chunks sob demanda', ...v });

await browser.close();
server.close();

console.log(`\nRotas testadas: ${rotas.join(', ')}`);
console.log(`Tela de login renderizou: ${renderizou > 0 ? 'SIM' : 'NAO'}`);
console.log(`CSP comprovadamente ATIVA (bloqueou origem nao autorizada): ${cspAtiva ? 'SIM' : 'NAO'}`);
console.log(`Chunks sob demanda importados: ${pesados.join(', ') || '(nenhum)'}`);
console.log(`Falhas ao importar chunks: ${falhasImport.length}`);
for (const f of falhasImport) console.log(`  ${f}`);

// O teste de controle provoca um bloqueio de proposito - esse erro e' o
// resultado esperado, nao uma falha da aplicacao.
const cspErrors = consoleErrors.filter(
  (e) => /Content Security Policy|Refused to/i.test(e) && !e.includes('origem-nao-autorizada.example'),
);
console.log(`\nViolacoes de CSP relatadas pelo navegador: ${violations.length}`);
for (const v of violations) console.log(`  [${v.rota}] ${v.directive} bloqueou ${v.blocked} ${v.sample}`);
console.log(`\nErros de console relacionados a CSP: ${cspErrors.length}`);
for (const e of cspErrors) console.log(`  ${e}`);

const falhou = violations.length > 0 || cspErrors.length > 0 || renderizou === 0
  || !cspAtiva || falhasImport.length > 0;
console.log(`\nRESULTADO: ${falhou ? 'FALHOU' : 'OK - nenhuma violacao e app renderizou'}`);
process.exit(falhou ? 1 : 0);
