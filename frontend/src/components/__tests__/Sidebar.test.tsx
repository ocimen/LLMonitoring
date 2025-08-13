import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { vi } from 'vitest';
import { Sidebar } from '../layout/Sidebar';

const theme = createTheme();

// Mock the useAuth hook to return a test user
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'brand_manager',
      brands: ['test-brand'],
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const MockedSidebar = ({ 
  mobileOpen = false, 
  onMobileClose = vi.fn(),
}) => (
  <ThemeProvider theme={theme}>
    <BrowserRouter>
      <div style={{ display: 'flex' }}>
        <Sidebar mobileOpen={mobileOpen} onMobileClose={onMobileClose} />
      </div>
    </BrowserRouter>
  </ThemeProvider>
);

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders navigation items for brand manager', () => {
    render(<MockedSidebar />);
    
    expect(screen.getAllByText('Dashboard')).toHaveLength(2); // Mobile and desktop versions
    expect(screen.getAllByText('Brand Monitoring')).toHaveLength(2);
    expect(screen.getAllByText('Competitive Analysis')).toHaveLength(2);
    expect(screen.getAllByText('Alerts & Notifications')).toHaveLength(2);
    expect(screen.getAllByText('Analytics')).toHaveLength(2);
    expect(screen.getAllByText('Settings')).toHaveLength(2);
  });

  it('shows brand name in header', () => {
    render(<MockedSidebar />);
    
    expect(screen.getAllByText('Brand Monitor')).toHaveLength(2); // Mobile and desktop versions
  });
});