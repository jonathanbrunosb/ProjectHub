/**
 * Verifica os cabecalhos de seguranca REALMENTE entregues por uma URL publicada.
 *
 * O criterio nao e' o que esta' no repositorio, e sim a resposta que o navegador
 * recebe - por isso este script fala com a URL de verdade, seguindo o mesmo
 * caminho do usuario: HTTP -> redirecionamento -> HTTPS -> rota da SPA -> asset.
 *
 * Uso:
 *   node scripts/check-security-headers.mjs https://projecthub.contabilidade-eqtl.com
 *   node scripts/check-security-headers.mjs <url-de-qa>   # homologar antes de PRD
 *
 * Saida: relatorio por cabecalho e codigo de saida 1 se algum obrigatorio faltar,
 * para poder ser usado em CI.
 */
const alvo = process.argv[2];
if (!alvo) {
  console.error('Informe a URL. Ex.: node scripts/check-security-headers.mjs https://seu-dominio.com');
  process.exit(2);
}

const base = new URL(alvo);

/** Cabecalhos exigidos e como avaliar cada valor recebido. */
const ESPERADOS = [
  {
    nome: 'strict-transport-security',
    obrigatorio: true,
    avaliar: (v) => {
      const m = /max-age=(\d+)/i.exec(v ?? '');
      if (!m) return { ok: false, nota: 'sem max-age' };
      const idade = Number(m[1]);
      if (idade < 86400) return { ok: false, nota: `max-age=${idade} muito curto` };
      if (idade < 31536000) return { ok: true, nota: `max-age=${idade} (fase de implantacao progressiva)` };
      return { ok: true, nota: `max-age=${idade}` };
    },
  },
  {
    nome: 'content-security-policy',
    obrigatorio: true,
    avaliar: (v) => {
      if (!v) return { ok: false, nota: 'ausente no cabecalho (pode estar so na meta do HTML)' };
      const problemas = [];
      if (/unsafe-eval/.test(v)) problemas.push("contem 'unsafe-eval'");
      if (/script-src[^;]*unsafe-inline/.test(v)) problemas.push("script-src com 'unsafe-inline'");
      if (/default-src[^;]*\*/.test(v)) problemas.push('default-src com curinga *');
      if (!/frame-ancestors/.test(v)) problemas.push('sem frame-ancestors');
      return problemas.length ? { ok: false, nota: problemas.join('; ') } : { ok: true, nota: 'politica restritiva' };
    },
  },
  {
    nome: 'x-frame-options',
    obrigatorio: true,
    avaliar: (v) => (/^(DENY|SAMEORIGIN)$/i.test((v ?? '').trim())
      ? { ok: true, nota: v }
      : { ok: false, nota: v ? `valor inesperado: ${v}` : 'ausente' }),
  },
  {
    nome: 'x-content-type-options',
    obrigatorio: true,
    avaliar: (v) => ((v ?? '').trim().toLowerCase() === 'nosniff'
      ? { ok: true, nota: 'nosniff' }
      : { ok: false, nota: v ? `valor inesperado: ${v}` : 'ausente' }),
  },
  {
    nome: 'referrer-policy',
    obrigatorio: true,
    avaliar: (v) => (/(no-referrer|strict-origin)/i.test(v ?? '')
      ? { ok: true, nota: v }
      : { ok: false, nota: v ? `politica fraca: ${v}` : 'ausente' }),
  },
  {
    nome: 'permissions-policy',
    obrigatorio: true,
    avaliar: (v) => (v ? { ok: true, nota: v } : { ok: false, nota: 'ausente' }),
  },
];

async function inspecionar(url, { redirect = 'manual' } = {}) {
  try {
    const r = await fetch(url, { redirect, headers: { 'User-Agent': 'ProjectHub-SecurityCheck' } });
    return { status: r.status, headers: r.headers, location: r.headers.get('location') };
  } catch (e) {
    return { erro: e.message };
  }
}

console.log(`\n=== Verificacao de cabecalhos de seguranca: ${base.origin} ===\n`);

// 1. HTTP deve redirecionar para HTTPS.
const http = await inspecionar(`http://${base.host}/`);
if (http.erro) {
  console.log(`1. HTTP -> HTTPS: nao foi possivel testar (${http.erro})`);
} else {
  const redireciona = http.status >= 300 && http.status < 400 && (http.location ?? '').startsWith('https://');
  console.log(`1. HTTP -> HTTPS: ${redireciona ? 'OK' : 'FALHA'} (status ${http.status}${http.location ? ` -> ${http.location}` : ''})`);
}

// 2. Resposta HTTPS final (documento principal).
const https = await inspecionar(`${base.origin}/`, { redirect: 'follow' });
if (https.erro) {
  console.error(`\n2. HTTPS: falhou (${https.erro})`);
  process.exit(1);
}
console.log(`2. HTTPS: OK (status ${https.status})\n`);

let faltando = 0;
console.log('3. Cabecalhos no documento principal:');
for (const esperado of ESPERADOS) {
  const valor = https.headers.get(esperado.nome);
  const { ok, nota } = esperado.avaliar(valor);
  if (!ok && esperado.obrigatorio) faltando += 1;
  console.log(`   ${ok ? '[ok]  ' : '[FALTA]'} ${esperado.nome}: ${nota}`);
}

// 4. Rota da SPA e asset estatico: os cabecalhos precisam valer para tudo,
// nao so' para a raiz (um proxy mal configurado costuma cobrir so' "/").
console.log('\n4. Cobertura em outras respostas:');
for (const caminho of ['/index.html', '/theme-init.js', '/rota-inexistente-teste']) {
  const r = await inspecionar(`${base.origin}${caminho}`, { redirect: 'follow' });
  if (r.erro) { console.log(`   ${caminho}: erro (${r.erro})`); continue; }
  const presentes = ESPERADOS.filter((e) => r.headers.get(e.nome)).length;
  console.log(`   ${caminho}: status ${r.status} | ${presentes}/${ESPERADOS.length} cabecalhos presentes`);
}

console.log(`\nRESULTADO: ${faltando === 0 ? 'todos os cabecalhos obrigatorios presentes' : `${faltando} cabecalho(s) obrigatorio(s) ausente(s) ou fraco(s)`}`);
process.exit(faltando === 0 ? 0 : 1);
