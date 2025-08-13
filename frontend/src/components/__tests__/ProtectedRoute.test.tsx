import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { vi } from 'vitest';
import { ProtectedRoute } from '../ProtectedRoute';

const theme = createTheme();

// Mock the useAuth hook
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { role: 'brand_manager' },
    isLoading: false,
  }),
}));

describe('ProtectedRoute', () => {
  it('renders children when user is authenticated', () => {
    render(
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        </BrowserRouter>
      </ThemeProvider>
    );
    
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders children when user has required role', () => {
    const requiredRoles = ['brand_manager'];
    render(
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <ProtectedRoute requiredRoles={requiredRoles}>
            <div>Admin Content</div>
          </ProtectedRoute>
        </BrowserRouter>
      </ThemeProvider>
    );
    
    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });
});