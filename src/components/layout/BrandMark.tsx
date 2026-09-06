import { useState } from 'react';
import { cn } from '@/utils/cn';

/**
 * Marca institucional (Grupo Equatorial) + marca de produto (ProjectHub).
 *
 * `GroupLogo` carrega o arquivo oficial em `public/logo-equatorial.png`
 * (servido na raiz do build, fora do bundle JS). Se um SVG for adicionado
 * depois em `public/logo-equatorial.svg`, ele passa a ser usado automatica-
 * mente - escala sem perda em qualquer resolucao, sem precisar trocar codigo.
 * Se nenhum dos dois existir (ambiente de desenvolvimento sem o asset, por
 * exemplo), cai em um texto discreto em vez de quebrar o layout.
 */
const LOGO_CANDIDATES = ['/logo-equatorial.svg', '/logo-equatorial.png'];

export function GroupLogo({
  className, textSize = 'text-xs', variant = 'default',
}: { className?: string; textSize?: string; variant?: 'default' | 'light' }) {
  const [attempt, setAttempt] = useState(0);

  if (attempt >= LOGO_CANDIDATES.length) {
    // Texto de reserva: sempre uma linha (nunca quebra) e trunca com reticencias
    // se o espaco for insuficiente - sem isso, o texto quebraria em "GRUPO" /
    // "EQUATORIAL" e vazaria para fora da altura fixa da caixa, sobrepondo o
    // elemento vizinho (ProductLockup) em layouts horizontais estreitos.
    return (
      <span
        className={cn(
          'inline-flex max-w-full items-center overflow-hidden whitespace-nowrap font-semibold',
          'uppercase tracking-[0.14em]',
          variant === 'light' ? 'text-white' : 'text-nav-muted',
          textSize,
          className,
        )}
      >
        <span className="truncate">Grupo Equatorial</span>
      </span>
    );
  }

  return (
    <img
      key={LOGO_CANDIDATES[attempt]}
      src={LOGO_CANDIDATES[attempt]}
      alt="Grupo Equatorial"
      // A marca oficial e' um tom solido de azul sobre fundo transparente -
      // brightness-0 achata para preto opaco e invert vira branco puro,
      // sem precisar de um segundo arquivo de logo so' para fundo escuro.
      className={cn('object-contain', variant === 'light' && 'brightness-0 invert', className)}
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

const productSizes = {
  lg: { name: 'text-xl font-semibold leading-tight', tagline: 'text-xs text-nav-muted' },
  md: { name: 'text-lg font-semibold leading-tight', tagline: 'text-xs text-nav-muted' },
  sm: { name: 'text-sm font-semibold leading-tight', tagline: 'text-[10px] text-nav-muted' },
} as const;

export function ProductLockup({ size = 'md', className }: { size?: keyof typeof productSizes; className?: string }) {
  const s = productSizes[size];
  return (
    <div className={cn('min-w-0', className)}>
      <p className={cn('truncate', s.name)}>ProjectHub</p>
      <p className={cn('truncate', s.tagline)}>Gestão Integrada de Projetos</p>
    </div>
  );
}

/**
 * Hierarquia completa Grupo Equatorial -> ProjectHub -> tagline, empilhada,
 * para o painel institucional da tela de login/cadastro.
 */
export function BrandHeader({ logoClassName, className }: { logoClassName?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Painel institucional e' sempre bg-nav (escuro) - logo em branco. */}
      <GroupLogo className={cn('h-7 max-w-[176px]', logoClassName)} textSize="text-xs" variant="light" />
      <ProductLockup size="lg" />
    </div>
  );
}

/**
 * Versao compacta e horizontal, para cabecalhos estreitos (mobile, sidebar).
 * `min-w-0` nos dois filhos permite que o flex encolha o que precisar em vez
 * de estourar a largura do container (o que causaria rolagem horizontal).
 */
export function BrandLockupCompact({ className, variant = 'default' }: { className?: string; variant?: 'default' | 'light' }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <GroupLogo className="h-5 max-w-[88px] shrink-0" textSize="text-[9px]" variant={variant} />
      <ProductLockup size="sm" className="min-w-0 flex-1" />
    </div>
  );
}
