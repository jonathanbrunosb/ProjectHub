import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  globalSearch: vi.fn(async () => [
    { kind: 'project' as const, id: 'p1', code: 'PRJ-1', title: 'Migracao ERP', subtitle: 'PRJ-1', link: '/projetos/p1' },
    {
      kind: 'task' as const, id: 't1', code: 'T-1', title: 'Homologar migracao',
      subtitle: 'PRJ-1 · Migracao ERP', link: '/projetos/p1/tarefas',
    },
  ]),
  navigate: vi.fn(),
}));

vi.mock('@/services/search', () => ({ globalSearch: mocks.globalSearch }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

const { GlobalSearch } = await import('../GlobalSearch');

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.globalSearch.mockClear();
  mocks.navigate.mockClear();
});

describe('GlobalSearch', () => {
  it('abre com Ctrl+K e foca o campo de busca', async () => {
    renderSearch();
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByPlaceholderText(/Buscar projetos, tarefas/)).toHaveFocus();
  });

  it('nao busca com menos de 2 caracteres', async () => {
    renderSearch();
    await userEvent.keyboard('{Control>}k{/Control}');
    const input = await screen.findByPlaceholderText(/Buscar projetos, tarefas/);
    await userEvent.type(input, 'a');
    expect(screen.getByText('Digite pelo menos 2 caracteres.')).toBeInTheDocument();
    expect(mocks.globalSearch).not.toHaveBeenCalled();
  });

  it('busca (debounced) a partir de 2 caracteres e agrupa os resultados por tipo', async () => {
    renderSearch();
    await userEvent.keyboard('{Control>}k{/Control}');
    const input = await screen.findByPlaceholderText(/Buscar projetos, tarefas/);
    await userEvent.type(input, 'migracao');

    await waitFor(() => expect(mocks.globalSearch).toHaveBeenCalledWith('migracao'));
    expect(await screen.findByText('Projetos')).toBeInTheDocument();
    expect(screen.getByText('Tarefas')).toBeInTheDocument();
    expect(screen.getByText('Migracao ERP')).toBeInTheDocument();
    expect(screen.getByText('Homologar migracao')).toBeInTheDocument();
  });

  it('navega e fecha ao clicar em um resultado', async () => {
    renderSearch();
    await userEvent.keyboard('{Control>}k{/Control}');
    const input = await screen.findByPlaceholderText(/Buscar projetos, tarefas/);
    await userEvent.type(input, 'migracao');

    const result = await screen.findByText('Migracao ERP');
    await userEvent.click(result);

    expect(mocks.navigate).toHaveBeenCalledWith('/projetos/p1');
    await waitFor(() => expect(screen.queryByPlaceholderText(/Buscar projetos, tarefas/)).not.toBeInTheDocument());
  });

  it('fecha com Escape', async () => {
    renderSearch();
    await userEvent.keyboard('{Control>}k{/Control}');
    await screen.findByPlaceholderText(/Buscar projetos, tarefas/);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByPlaceholderText(/Buscar projetos, tarefas/)).not.toBeInTheDocument();
  });
});
