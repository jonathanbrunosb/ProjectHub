import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ can: () => true }),
}));

vi.mock('@/components/layout/EnvironmentSwitcher', () => ({
  EnvironmentSwitcher: () => <div data-testid="environment-switcher" />,
}));

const { Sidebar } = await import('../Sidebar');

describe('Sidebar recolhida', () => {
  it('mantem a marca oficial em miniatura no cabecalho', () => {
    render(
      <MemoryRouter>
        <Sidebar collapsed onToggle={vi.fn()} mobileOpen={false} onCloseMobile={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: /grupo equatorial/i })).toHaveAttribute(
      'src',
      '/logo-equatorial.svg',
    );
    expect(screen.queryByText('ProjectHub')).toBeNull();
  });
});
