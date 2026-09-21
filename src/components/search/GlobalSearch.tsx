import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search, FolderKanban, ListChecks, ShieldAlert, ClipboardCheck, Gavel, Loader2,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { globalSearch, type SearchResult, type SearchResultKind } from '@/services/search';

const KIND_META: Record<SearchResultKind, { label: string; icon: typeof FolderKanban }> = {
  project: { label: 'Projetos', icon: FolderKanban },
  task: { label: 'Tarefas', icon: ListChecks },
  risk: { label: 'Riscos', icon: ShieldAlert },
  action_plan: { label: 'Planos de Acao', icon: ClipboardCheck },
  decision: { label: 'Decisoes', icon: Gavel },
};

const KIND_ORDER: SearchResultKind[] = ['project', 'task', 'risk', 'action_plan', 'decision'];
const DEBOUNCE_MS = 250;

/**
 * Busca global (Ctrl+K / Cmd+K). Vive uma unica vez no layout (Topbar), com
 * seu proprio listener de teclado - assim funciona em qualquer tela sem cada
 * pagina precisar declarar o atalho.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setTerm('');
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const query = term.trim();
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await globalSearch(query);
        if (requestIdRef.current === id) {
          setResults(data);
          setActiveIndex(0);
        }
      } finally {
        if (requestIdRef.current === id) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, open]);

  const goTo = (result: SearchResult) => {
    setOpen(false);
    navigate(result.link);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      goTo(results[activeIndex]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-fg focus-ring sm:flex"
        aria-label="Busca global"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Buscar...</span>
        <kbd className="ml-2 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg focus-ring sm:hidden"
        aria-label="Busca global"
      >
        <Search className="h-4 w-4" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Busca global"
            className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-pop animate-slide-up"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" /> : <Search className="h-4 w-4 shrink-0 text-muted" />}
              <input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Buscar projetos, tarefas, riscos, planos de acao, decisoes..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {term.trim().length < 2 && (
                <p className="px-2 py-6 text-center text-xs text-muted">Digite pelo menos 2 caracteres.</p>
              )}
              {term.trim().length >= 2 && !loading && results.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted">Nenhum resultado para &quot;{term}&quot;.</p>
              )}
              {KIND_ORDER.map((kind) => {
                const items = results.filter((r) => r.kind === kind);
                if (items.length === 0) return null;
                const { label, icon: Icon } = KIND_META[kind];
                return (
                  <div key={kind} className="mb-2">
                    <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                    {items.map((item) => {
                      const globalIndex = results.indexOf(item);
                      const active = globalIndex === activeIndex;
                      return (
                        <button
                          key={`${item.kind}-${item.id}`}
                          type="button"
                          onMouseEnter={() => setActiveIndex(globalIndex)}
                          onClick={() => goTo(item)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
                            active ? 'bg-brand/10 text-brand' : 'hover:bg-surface-2',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{item.title}</span>
                            {item.subtitle && <span className="block truncate text-xs text-muted">{item.subtitle}</span>}
                          </span>
                          {item.code && <span className="shrink-0 text-xs text-muted">{item.code}</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
