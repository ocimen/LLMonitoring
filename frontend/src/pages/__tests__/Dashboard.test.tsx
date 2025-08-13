import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Dashboard } from '../Dashboard';

const theme = createTheme();

const MockedDashboard = () => (
  <ThemeProvider theme={theme}>
    <Dashboard />
  </ThemeProvider>
);

describe('Dashboard', () => {
  it('renders dashboard title', () => {
    render(<MockedDashboard />);
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('displays key metrics cards', () => {
    render(<MockedDashboard />);
    
    expect(screen.getByText('Brand Visibility Score')).toBeInTheDocument();
    expect(screen.getByText('AI Mentions')).toBeInTheDocument();
    expect(screen.getByText('Competitor Gap')).toBeInTheDocument();
    expect(screen.getByText('Active Alerts')).toBeInTheDocument();
  });

  it('shows recent activity section', () => {
    render(<MockedDashboard />);
    
    expect(screen.getByText('Recent Brand Monitoring Activity')).toBeInTheDocument();
  });

  it('displays quick actions section', () => {
    render(<MockedDashboard />);
    
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });
});