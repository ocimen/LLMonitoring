import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box,
  Typography,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  TrendingUp as TrendingUpIcon,
  CompareArrows as CompareIcon,
  Notifications as NotificationsIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  People as PeopleIcon,
  ShoppingCart as ShoppingIcon,
  Language as LanguageIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const drawerWidth = 240;

interface NavigationItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  roles?: string[];
}

const navigationItems: NavigationItem[] = [
  {
    text: 'Dashboard',
    icon: <DashboardIcon />,
    path: '/dashboard',
  },
  {
    text: 'Brand Monitoring',
    icon: <TrendingUpIcon />,
    path: '/monitoring',
  },
  {
    text: 'Competitive Analysis',
    icon: <CompareIcon />,
    path: '/competitive',
  },
  {
    text: 'Alerts & Notifications',
    icon: <NotificationsIcon />,
    path: '/alerts',
  },
  {
    text: 'Analytics',
    icon: <AnalyticsIcon />,
    path: '/analytics',
  },
  {
    text: 'Geographic Insights',
    icon: <LanguageIcon />,
    path: '/geographic',
  },
  {
    text: 'Shopping Visibility',
    icon: <ShoppingIcon />,
    path: '/shopping',
  },
  {
    text: 'Reports',
    icon: <AssessmentIcon />,
    path: '/reports',
  },
  {
    text: 'User Management',
    icon: <PeopleIcon />,
    path: '/users',
    roles: ['admin'],
  },
  {
    text: 'Settings',
    icon: <SettingsIcon />,
    path: '/settings',
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onMobileClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const filteredItems = navigationItems.filter(item => {
    if (!item.roles) return true;
    return user?.role && item.roles.includes(user.role);
  });

  const handleNavigation = (path: string) => {
    navigate(path);
    onMobileClose();
  };

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Brand Monitor
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {filteredItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box
      component="nav"
      sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
    >
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile
        }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
      >
        {drawer}
      </Drawer>
      
      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
        open
      >
        {drawer}
      </Drawer>
    </Box>
  );
};