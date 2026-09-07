import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Trava a politica de seguranca declarada no documento.
 *
 * Nao substitui a verificacao contra a URL publicada (ver
 * scripts/check-security-headers.mjs, que fala com o servidor real): aqui o
 * objetivo e' impedir que a politica seja afrouxada sem que alguem perceba -
 * um 'unsafe-eval' adicionado para "resolver" um bloqueio, uma origem curinga,
 * ou o retorno de script inline no HTML.
 */
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

function csp(): string {
  const m = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/s.exec(html);
  if (!m) throw new Error('Meta Content-Security-Policy nao encontrada no index.html');
  return m[1].replace(/\s+/g, ' ').trim();
}

const ORIGENS_SUPABASE = [
  'https://mhmlcnylugoutzadiwww.supabase.co', // QA
  'https://anjdrbvftudnxddwexpm.supabase.co', // PRD
];

describe('Content-Security-Policy declarada no index.html', () => {
  it('existe e define uma base restritiva', () => {
    const politica = csp();
    expect(politica).toContain("default-src 'self'");
    expect(politica).toContain("base-uri 'self'");
    expect(politica).toContain("object-src 'none'");
    expect(politica).toContain("form-action 'self'");
  });

  it("nunca permite 'unsafe-eval' (validado no navegador: nenhuma lib precisa)", () => {
    expect(csp()).not.toContain('unsafe-eval');
  });

  it("nunca permite script inline - scripts vem de arquivos proprios", () => {
    expect(csp()).not.toMatch(/script-src[^;]*unsafe-inline/);
    // O <script> de tema foi movido para public/theme-init.js justamente para
    // que script-src possa continuar sendo apenas 'self'.
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/);
  });

  it('nao usa curinga em nenhuma diretiva de origem', () => {
    const politica = csp();
    for (const diretiva of ['default-src', 'script-src', 'connect-src', 'img-src', 'style-src', 'font-src']) {
      const trecho = new RegExp(`${diretiva}([^;]*)`).exec(politica)?.[1] ?? '';
      expect(trecho, `${diretiva} nao pode conter curinga`).not.toMatch(/(^|\s)\*(\s|$)/);
    }
  });

  it('autoriza os dois ambientes Supabase - o mesmo bundle atende QA e PRD', () => {
    const politica = csp();
    for (const origem of ORIGENS_SUPABASE) {
      expect(politica, `connect-src precisa de ${origem}`).toContain(origem);
      expect(politica, `websocket de ${origem}`).toContain(origem.replace('https://', 'wss://'));
    }
  });

  it('permite as fontes efetivamente carregadas pelo documento', () => {
    const politica = csp();
    expect(politica).toContain('https://fonts.googleapis.com'); // folha de estilo
    expect(politica).toContain('https://fonts.gstatic.com'); // arquivos .woff2
  });

  it('bloqueia enquadramento por outros sites', () => {
    // frame-ancestors nao vale via meta - fica no cabecalho HTTP (infra/headers).
    // No documento, garante-se ao menos que o app nao carrega frames de terceiros.
    expect(csp()).toContain("frame-src 'none'");
    const headers = readFileSync(resolve(__dirname, '../../infra/headers/_headers'), 'utf8');
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain('X-Frame-Options: DENY');
  });
});

describe('Referrer-Policy declarada no documento', () => {
  it('nao vaza URL completa para terceiros', () => {
    expect(html).toMatch(/<meta name="referrer" content="(strict-origin-when-cross-origin|no-referrer)"/);
  });
});
