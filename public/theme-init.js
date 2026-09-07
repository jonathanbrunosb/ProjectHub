// Aplica o tema antes da hidratacao para evitar flash de tela clara/escura.
//
// Este script vive em um arquivo proprio, e nao inline no index.html, para que a
// Content-Security-Policy possa exigir `script-src 'self'` sem precisar de
// 'unsafe-inline' nem de um hash que teria de ser recalculado a cada alteracao
// (e que quebraria em silencio se alguem esquecesse).
try {
  var t = localStorage.getItem('pmo.theme');
  var d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', d);
} catch {
  /* storage indisponivel - segue com o tema claro padrao */
}
