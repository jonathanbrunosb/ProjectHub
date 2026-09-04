import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CriticalityBadge, HealthBadge, ProjectStatusBadge } from '../StatusBadges';

describe('Badges de dominio', () => {
  it('usa a semantica de cor padronizada da plataforma', () => {
    const { rerender } = render(<HealthBadge health="verde" />);
    expect(screen.getByText('No prazo')).toBeInTheDocument();

    rerender(<HealthBadge health="vermelho" />);
    expect(screen.getByText('Critico')).toBeInTheDocument();

    rerender(<HealthBadge health="cinza" />);
    expect(screen.getByText('Em espera')).toBeInTheDocument();
  });

  it('sinaliza saude definida manualmente', () => {
    render(<HealthBadge health="verde" manual />);
    expect(screen.getByText(/No prazo \*/)).toBeInTheDocument();
  });

  it('traduz o status do projeto', () => {
    render(<ProjectStatusBadge status="em_andamento" />);
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
  });

  it('classifica a criticidade do risco pelo score', () => {
    const { rerender } = render(<CriticalityBadge score={20} />);
    expect(screen.getByText(/Critico · 20/)).toBeInTheDocument();

    rerender(<CriticalityBadge score={6} />);
    expect(screen.getByText(/Moderado · 6/)).toBeInTheDocument();
  });
});
