import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardCustomizeModal } from '../DashboardCustomizeModal';
import { DASHBOARD_WIDGETS } from '@/services/dashboardLayout';

const order = DASHBOARD_WIDGETS.slice(0, 3).map((w) => w.id);

describe('DashboardCustomizeModal', () => {
  it('lista os widgets na ordem informada e reordena ao mover para baixo', async () => {
    const onSave = vi.fn();
    render(
      <DashboardCustomizeModal
        open hidden={[]} order={order}
        onClose={() => {}} onSave={onSave} onReset={() => {}}
      />,
    );

    const firstLabel = DASHBOARD_WIDGETS.find((w) => w.id === order[0])!.label;
    const items = screen.getAllByText((_, el) => el?.tagName === 'SPAN' && el.textContent === firstLabel);
    expect(items.length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: 'Mover para baixo' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith([order[1], order[0], order[2]], []);
  });

  it('oculta um widget e salva o id na lista de ocultos', async () => {
    const onSave = vi.fn();
    render(
      <DashboardCustomizeModal
        open hidden={[]} order={order}
        onClose={() => {}} onSave={onSave} onReset={() => {}}
      />,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Ocultar' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith(order, [order[0]]);
  });

  it('chama onReset ao clicar em Restaurar padrao', async () => {
    const onReset = vi.fn();
    render(
      <DashboardCustomizeModal
        open hidden={[]} order={order}
        onClose={() => {}} onSave={() => {}} onReset={onReset}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar padrao' }));
    expect(onReset).toHaveBeenCalled();
  });
});
