import React from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Notifications,
  Assessment,
} from '@mui/icons-material';

const StatCard: React.FC<{
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: React.ReactElement;
}> = ({ title, value, change, trend, icon }) => (
  <Card>
    <CardContent>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography color="textSecondary" gutterBottom variant="body2">
            {title}
          </Typography>
          <Typography variant="h4" component="div">
            {value}
          </Typography>
          <Box display="flex" alignItems="center" mt={1}>
            {trend === 'up' ? (
              <TrendingUp color="success" fontSize="small" />
            ) : (
              <TrendingDown color="error" fontSize="small" />
            )}
            <Typography
              variant="body2"
              color={trend === 'up' ? 'success.main' : 'error.main'}
              sx={{ ml: 0.5 }}
            >
              {change}
            </Typography>
          </Box>
        </Box>
        <Box color="action.active">{icon}</Box>
      </Box>
    </CardContent>
  </Card>
);

export const Dashboard: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
      <Grid container spacing={3}>
        {/* Key Metrics */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Brand Visibility Score"
            value="87"
            change="+5.2%"
            trend="up"
            icon={<TrendingUp />}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="AI Mentions"
            value="1,234"
            change="+12.3%"
            trend="up"
            icon={<Assessment />}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Competitor Gap"
            value="-3.2%"
            change="-1.1%"
            trend="down"
            icon={<TrendingDown />}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Alerts"
            value="7"
            change="+2"
            trend="up"
            icon={<Notifications />}
          />
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Brand Monitoring Activity
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="textSecondary">
                Brand visibility tracking is active. Next update in 2 hours.
              </Typography>
              <LinearProgress variant="determinate" value={65} sx={{ mt: 1 }} />
            </Box>
          </Paper>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Typography variant="body2" color="textSecondary">
              • View latest reports
              <br />
              • Configure alerts
              <br />
              • Analyze competitors
              <br />
              • Export data
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};