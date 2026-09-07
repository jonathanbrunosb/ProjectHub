import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';

vi.mock('@/components/layout/AppShell', () => ({ useBreadcrumbs: vi.fn() }));

vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    can: (cap: string) => cap === 'users.manage',
    profile: { id: 'admin-1', role: 'admin' },
  }),
}));

const profiles = [
  { id: 'admin-1', full_name: 'Admin Um', email: 'admin@empresa.com.br', job_title: 'PMO', role: 'admin', can_switch_environment: true, weekly_capacity_hours: 40, active: true, area_id: 'area-1' },
  { id: 'user-2', full_name: 'Colaborador Dois', email: 'colab@empresa.com.br', job_title: null, role: 'collaborator', can_switch_environment: false, weekly_capacity_hours: 40, active: true, area_id: null },
];

const areas = [
  {
    id: 'area-1', business_unit_id: 'bu-1', code: 'CTG', name: 'Contabilidade Geral', is_active: true,
    business_unit: { id: 'bu-1', name: 'Contabilidade Corporativa', code: 'CTB' },
  },
];

const listProfiles = vi.fn(async () => profiles);
vi.mock('@/services/projects', () => ({
  listProfiles: (...args: []) => listProfiles(...args),
  listActiveProfiles: vi.fn(async () => profiles),
  listCompanies: vi.fn(async () => []),
  listTeams: vi.fn(async () => []),
  listTemplates: vi.fn(async () => []),
}));

const listAreas = vi.fn(async () => areas);
const assignPrimaryArea = vi.fn(async (_userId: string, _areaId: string) => {});
vi.mock('@/services/areas', () => ({
  listAreas: (...a: []) => listAreas(...a),
  assignPrimaryArea: (...a: [string, string]) => assignPrimaryArea(...a),
  listBusinessUnits: vi.fn(async () => []),
  createBusinessUnit: vi.fn(), updateBusinessUnit: vi.fn(), setBusinessUnitActive: vi.fn(),
  createArea: vi.fn(), updateArea: vi.fn(), setAreaActive: vi.fn(), updateTeamArea: vi.fn(),
}));

vi.mock('@/services/customFields', () => ({
  listAllDefinitions: vi.fn(async () => []),
  upsertDefinition: vi.fn(), deleteDefinition: vi.fn(), replaceOptions: vi.fn(),
}));

vi.mock('@/services/governance', () => ({ refreshAllHealth: vi.fn() }));

const resetUserPassword = vi.fn();
const deleteUser = vi.fn();
const createUser = vi.fn(async (_input: unknown) => ({ id: 'new-user', email: 'novo@empresa.com.br', temporary_password: 'Abc12345!' }));
vi.mock('@/services/adminUsers', () => ({
  createUser: (...a: [unknown]) => createUser(...a),
  resetUserPassword: (userId: string) => resetUserPassword(userId),
  deleteUser: (userId: string) => deleteUser(userId),
}));

const updateEq = vi.fn(async (_column: string, _value: string) => ({ error: null }));
const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: updateEq }));
vi.mock('@/lib/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/client')>();
  return {
    ...actual,
    supabase: { from: () => ({ update: (payload: Record<string, unknown>) => update(payload) }) },
  };
});

const { SettingsPage } = await import('../SettingsPage');

function render() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/configuracoes/usuarios']}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function lastOf<T>(items: T[]): T {
  return items[items.length - 1];
}

beforeEach(() => {
  resetUserPassword.mockClear();
  deleteUser.mockClear();
  updateEq.mockClear();
  update.mockClear();
  listProfiles.mockClear();
  listProfiles.mockImplementation(async () => profiles);
  listAreas.mockClear().mockImplementation(async () => areas);
  assignPrimaryArea.mockClear();
  createUser.mockClear().mockImplementation(async () => ({ id: 'new-user', email: 'novo@empresa.com.br', temporary_password: 'Abc12345!' }));
});

describe('redefinicao de senha pelo Admin', () => {
  it('oferece o botao de redefinir senha para cada usuario', async () => {
    render();
    expect(await screen.findAllByRole('button', { name: /redefinir senha/i })).toHaveLength(2);
  });

  it('pede confirmacao antes de gerar a nova senha', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /redefinir senha/i });
    await userEvent.click(botoes[1]);
    expect(await screen.findByRole('button', { name: /^redefinir$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Colaborador Dois/).length).toBeGreaterThan(0);
    expect(resetUserPassword).not.toHaveBeenCalled();
  });

  it('gera a senha e exibe a credencial apos confirmar', async () => {
    resetUserPassword.mockResolvedValueOnce({ email: 'colab@empresa.com.br', temporary_password: 'Abc12345!' });
    render();
    const botoes = await screen.findAllByRole('button', { name: /redefinir senha/i });
    await userEvent.click(botoes[1]);
    await userEvent.click(screen.getByRole('button', { name: /^redefinir$/i }));

    await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('user-2'));
    expect(await screen.findByText(/senha redefinida/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Abc12345!')).toBeInTheDocument();
  });

  it('cancelar a confirmacao nao gera nenhuma senha', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /redefinir senha/i });
    await userEvent.click(botoes[0]);
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(resetUserPassword).not.toHaveBeenCalled();
  });
});

describe('protecoes contra autoexclusao e autoinativacao', () => {
  it('nao oferece Inativar nem Excluir na propria linha do Admin logado', async () => {
    render();
    await screen.findAllByRole('button', { name: /redefinir senha/i });
    const linhaAdmin = screen.getByText('Admin Um').closest('tr')!;
    expect(within(linhaAdmin).queryByRole('button', { name: /inativar/i })).toBeNull();
    expect(within(linhaAdmin).queryByRole('button', { name: /^excluir$/i })).toBeNull();
  });

  it('oferece Inativar e Excluir na linha de outro usuario', async () => {
    render();
    await screen.findAllByRole('button', { name: /redefinir senha/i });
    const linhaColab = screen.getByText('Colaborador Dois').closest('tr')!;
    expect(within(linhaColab).getByRole('button', { name: /inativar/i })).toBeInTheDocument();
    expect(within(linhaColab).getByRole('button', { name: /^excluir$/i })).toBeInTheDocument();
  });
});

describe('editar usuario', () => {
  it('abre o formulario preenchido com os dados atuais', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /^editar$/i });
    await userEvent.click(botoes[1]);
    expect(await screen.findByDisplayValue('Colaborador Dois')).toBeInTheDocument();
  });

  it('salva as alteracoes via update direto (RLS ja permite ao Admin)', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /^editar$/i });
    await userEvent.click(botoes[1]);
    const nome = await screen.findByDisplayValue('Colaborador Dois');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Colaborador Renomeado');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(updateEq).toHaveBeenCalledWith('id', 'user-2'));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Colaborador Renomeado' }));
  });

  it('e-mail nao e editavel no formulario', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /^editar$/i });
    await userEvent.click(botoes[1]);
    const email = await screen.findByDisplayValue('colab@empresa.com.br');
    expect(email).toHaveAttribute('readonly');
  });
});

describe('ativar / inativar usuario', () => {
  it('pede confirmacao antes de inativar', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /inativar/i });
    await userEvent.click(botoes[0]);
    await waitFor(() => expect(screen.getByText(/Voce esta inativando/i)).toBeInTheDocument());
    expect(updateEq).not.toHaveBeenCalled();
  });

  it('inativa ao confirmar', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /inativar/i });
    await userEvent.click(botoes[0]);
    // o rodape do modal e' o ultimo botao "Inativar" da tela - os da tabela
    // continuam visiveis atras dele.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^inativar$/i }).length).toBeGreaterThan(1));
    await userEvent.click(lastOf(screen.getAllByRole('button', { name: /^inativar$/i })));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ active: false }));
  });

  it('mantem o usuario inativo visivel na lista, com a acao Ativar disponivel', async () => {
    listProfiles.mockImplementationOnce(async () => [
      ...profiles,
      {
        id: 'user-3', full_name: 'Ex Colaborador', email: 'ex@empresa.com.br', job_title: null,
        role: 'collaborator', can_switch_environment: false, weekly_capacity_hours: 40, active: false, area_id: null,
      },
    ]);
    render();
    expect(await screen.findByText('Ex Colaborador')).toBeInTheDocument();
    const linha = screen.getByText('Ex Colaborador').closest('tr')!;
    expect(within(linha).getByText(/inativo/i)).toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: /^ativar$/i })).toBeInTheDocument();
  });
});

describe('excluir usuario', () => {
  it('exige digitar o e-mail exato antes de habilitar a confirmacao', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /^excluir$/i });
    await userEvent.click(botoes[0]);

    // Apos abrir, o botao de confirmacao no rodape do modal e' o ultimo
    // "Excluir" da tela (os botoes de linha continuam visiveis atras dele) -
    // e comeca desabilitado ate o e-mail ser digitado corretamente.
    await waitFor(() => expect(screen.getByLabelText('Confirmacao')).toBeInTheDocument());
    const botaoModal = lastOf(screen.getAllByRole('button', { name: /^excluir$/i }));
    expect(botaoModal).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Confirmacao'), 'colab@empresa.com.br');
    expect(botaoModal).toBeEnabled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('exclui apos confirmar com o e-mail correto', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /^excluir$/i });
    await userEvent.click(botoes[0]);
    await userEvent.type(screen.getByLabelText('Confirmacao'), 'colab@empresa.com.br');
    await userEvent.click(lastOf(screen.getAllByRole('button', { name: /^excluir$/i })));
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('user-2'));
  });
});

describe('vinculo obrigatorio de Area (item 6/8)', () => {
  it('mostra a Area de quem ja tem vinculo e a pendencia de quem nao tem', async () => {
    render();
    const linhaAdmin = await screen.findByText('Admin Um').then((el) => el.closest('tr')!);
    expect(within(linhaAdmin).getByText('Contabilidade Geral')).toBeInTheDocument();
    const linhaColab = screen.getByText('Colaborador Dois').closest('tr')!;
    expect(within(linhaColab).getByText(/sem area/i)).toBeInTheDocument();
  });

  it('alerta quantos colaboradores ativos estao sem Area, com atalho para filtrar', async () => {
    render();
    expect(await screen.findByText(/sem Area principal vinculada/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /ver e vincular/i }));
    // Com o filtro de pendencia aplicado, so' Colaborador Dois (sem area) permanece na tabela.
    expect(screen.getByText('Colaborador Dois')).toBeInTheDocument();
    expect(screen.queryByText('Admin Um')).toBeNull();
  });

  it('bloqueia o cadastro de novo usuario sem selecionar a Area', async () => {
    render();
    await userEvent.click(await screen.findByRole('button', { name: /adicionar usu.rio/i }));
    await userEvent.type(await screen.findByLabelText(/nome completo/i), 'Novo Usuario');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'novo@empresa.com.br');
    await userEvent.click(screen.getByRole('button', { name: /^cadastrar$/i }));

    await waitFor(() => expect(screen.getByText(/selecione a area/i)).toBeInTheDocument());
    expect(createUser).not.toHaveBeenCalled();
  });

  it('vincula a Area escolhida logo apos criar o usuario', async () => {
    render();
    await userEvent.click(await screen.findByRole('button', { name: /adicionar usu.rio/i }));
    await userEvent.type(await screen.findByLabelText(/nome completo/i), 'Novo Usuario');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'novo@empresa.com.br');
    await userEvent.selectOptions(screen.getByLabelText(/^area$/i), 'area-1');
    await userEvent.click(screen.getByRole('button', { name: /^cadastrar$/i }));

    await waitFor(() => expect(createUser).toHaveBeenCalled());
    await waitFor(() => expect(assignPrimaryArea).toHaveBeenCalledWith('new-user', 'area-1'));
  });

  it('editar usuario so abre novo vinculo de Area quando ela realmente muda', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /^editar$/i });
    await userEvent.click(botoes[0]); // Admin Um, ja vinculado a area-1
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(updateEq).toHaveBeenCalledWith('id', 'admin-1'));
    expect(assignPrimaryArea).not.toHaveBeenCalled();
  });
});
