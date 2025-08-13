import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route 
        path="/auth" 
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthPage />} 
      />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        
        {/* Placeholder routes for navigation items */}
        <Route path="monitoring" element={<div>Brand Monitoring (Coming Soon)</div>} />
        <Route path="competitive" element={<div>Competitive Analysis (Coming Soon)</div>} />
        <Route path="alerts" element={<div>Alerts & Notifications (Coming Soon)</div>} />
        <Route path="analytics" element={<div>Analytics (Coming Soon)</div>} />
        <Route path="geographic" element={<div>Geographic Insights (Coming Soon)</div>} />
        <Route path="shopping" element={<div>Shopping Visibility (Coming Soon)</div>} />
        <Route path="reports" element={<div>Reports (Coming Soon)</div>} />
        <Route 
          path="users" 
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <div>User Management (Coming Soon)</div>
            </ProtectedRoute>
          } 
        />
        <Route path="settings" element={<div>Settings (Coming Soon)</div>} />
      </Route>
      
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;