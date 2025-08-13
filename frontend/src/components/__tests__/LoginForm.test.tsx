import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { vi } from 'vitest';
import { LoginForm } from '../auth/LoginForm';
import { AuthProvider } from '../../contexts/AuthContext';

const theme = createTheme();

const MockedLoginForm = ({ onToggleMode }: { onToggleMode: () => void }) => (
  <ThemeProvider theme={theme}>
    <AuthProvider>
      <LoginForm onToggleMode={onToggleMode} />
    </AuthProvider>
  </ThemeProvider>
);

describe('LoginForm', () => {
  const mockToggleMode = vi.fn();

  beforeEach(() => {
    mockToggleMode.mockClear();
  });

  it('renders login form with email and password fields', () => {
    render(<MockedLoginForm onToggleMode={mockToggleMode} />);
    
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders sign up toggle button', () => {
    render(<MockedLoginForm onToggleMode={mockToggleMode} />);
    
    expect(screen.getByRole('button', { name: /don't have an account/i })).toBeInTheDocument();
  });
});