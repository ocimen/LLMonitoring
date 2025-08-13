import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  Typography,
  Grid,
  Divider,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Email as EmailIcon,
  Sms as SmsIcon,
  Webhook as WebhookIcon,
  Notifications as NotificationsIcon,
  Science as TestIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useNotifications, NotificationPreferences } from '../contexts/NotificationContext';

export const NotificationPreferencesComponent: React.FC = () => {
  const {
    preferences,
    isConnected,
    updatePreferences,
    testNotification,
    loadPreferences
  } = useNotifications();

  const [formData, setFormData] = useState<Partial<NotificationPreferences>>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load preferences on component mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Update form data when preferences change
  useEffect(() => {
    if (preferences) {
      setFormData(preferences);
    }
  }, [preferences]);

  const handleSwitchChange = (field: keyof NotificationPreferences) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.checked
    }));
  };

  const handleInputChange = (field: keyof NotificationPreferences) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);

    try {
      await updatePreferences(formData);
      setMessage({ type: 'success', text: 'Preferences saved successfully!' });
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to save preferences' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (channel: string) => {
    setTesting(channel);
    setMessage(null);

    try {
      const success = await testNotification(channel);
      if (success) {
        setMessage({ type: 'success', text: `Test ${channel} notification sent successfully!` });
      } else {
        setMessage({ type: 'error', text: `Failed to send test ${channel} notification` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Test ${channel} notification failed` });
    } finally {
      setTesting(null);
    }
  };

  const handleRefresh = () => {
    loadPreferences();
  };

  if (!preferences) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Loading notification preferences...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Card>
        <CardHeader
          title="Notification Preferences"
          subheader="Configure how and when you receive notifications"
          action={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Chip
                size="small"
                label={isConnected ? 'Connected' : 'Disconnected'}
                color={isConnected ? 'success' : 'error'}
                variant="outlined"
              />
              <Tooltip title="Refresh preferences">
                <IconButton onClick={handleRefresh}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
          }
        />
        <CardContent>
          {message && (
            <Alert severity={message.type} sx={{ mb: 3 }}>
              {message.text}
            </Alert>
          )}

          <Grid container spacing={3}>
            {/* Channel Settings */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Notification Channels
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <NotificationsIcon color="primary" />
                    <Typography variant="subtitle2">In-App</Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.in_app_enabled || false}
                        onChange={handleSwitchChange('in_app_enabled')}
                      />
                    }
                    label="Enable"
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleTest('in_app')}
                    disabled={testing === 'in_app' || !formData.in_app_enabled}
                    startIcon={<TestIcon />}
                    sx={{ mt: 1, display: 'block' }}
                  >
                    {testing === 'in_app' ? 'Testing...' : 'Test'}
                  </Button>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <EmailIcon color="primary" />
                    <Typography variant="subtitle2">Email</Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.email_enabled || false}
                        onChange={handleSwitchChange('email_enabled')}
                      />
                    }
                    label="Enable"
                  />
                  <TextField
                    size="small"
                    label="Email Address"
                    value={formData.email_address || ''}
                    onChange={handleInputChange('email_address')}
                    disabled={!formData.email_enabled}
                    sx={{ mt: 1, display: 'block' }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleTest('email')}
                    disabled={testing === 'email' || !formData.email_enabled}
                    startIcon={<TestIcon />}
                    sx={{ mt: 1, display: 'block' }}
                  >
                    {testing === 'email' ? 'Testing...' : 'Test'}
                  </Button>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <SmsIcon color="primary" />
                    <Typography variant="subtitle2">SMS</Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.sms_enabled || false}
                        onChange={handleSwitchChange('sms_enabled')}
                      />
                    }
                    label="Enable"
                  />
                  <TextField
                    size="small"
                    label="Phone Number"
                    value={formData.phone_number || ''}
                    onChange={handleInputChange('phone_number')}
                    disabled={!formData.sms_enabled}
                    placeholder="+1234567890"
                    sx={{ mt: 1, display: 'block' }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleTest('sms')}
                    disabled={testing === 'sms' || !formData.sms_enabled}
                    startIcon={<TestIcon />}
                    sx={{ mt: 1, display: 'block' }}
                  >
                    {testing === 'sms' ? 'Testing...' : 'Test'}
                  </Button>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <WebhookIcon color="primary" />
                    <Typography variant="subtitle2">Webhook</Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.webhook_enabled || false}
                        onChange={handleSwitchChange('webhook_enabled')}
                      />
                    }
                    label="Enable"
                  />
                  <TextField
                    size="small"
                    label="Webhook URL"
                    value={formData.webhook_url || ''}
                    onChange={handleInputChange('webhook_url')}
                    disabled={!formData.webhook_enabled}
                    placeholder="https://example.com/webhook"
                    sx={{ mt: 1, display: 'block' }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleTest('webhook')}
                    disabled={testing === 'webhook' || !formData.webhook_enabled}
                    startIcon={<TestIcon />}
                    sx={{ mt: 1, display: 'block' }}
                  >
                    {testing === 'webhook' ? 'Testing...' : 'Test'}
                  </Button>
                </Grid>
              </Grid>
            </Grid>

            <Grid item xs={12}>
              <Divider />
            </Grid>

            {/* Quiet Hours */}
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Quiet Hours
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                No notifications will be sent during these hours
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    label="Start Time"
                    type="time"
                    value={formData.quiet_hours_start || ''}
                    onChange={handleInputChange('quiet_hours_start')}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    label="End Time"
                    type="time"
                    value={formData.quiet_hours_end || ''}
                    onChange={handleInputChange('quiet_hours_end')}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Grid>

            {/* Frequency Limit */}
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Frequency Limit
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Maximum notifications per hour
              </Typography>
              <FormControl size="small" fullWidth>
                <InputLabel>Max per hour</InputLabel>
                <Select
                  value={formData.frequency_limit || 10}
                  onChange={(e) => setFormData(prev => ({ ...prev, frequency_limit: Number(e.target.value) }))}
                  label="Max per hour"
                >
                  <MenuItem value={1}>1</MenuItem>
                  <MenuItem value={5}>5</MenuItem>
                  <MenuItem value={10}>10</MenuItem>
                  <MenuItem value={20}>20</MenuItem>
                  <MenuItem value={50}>50</MenuItem>
                  <MenuItem value={100}>100</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Divider />
            </Grid>

            {/* Save Button */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={loading}
                  startIcon={<SaveIcon />}
                >
                  {loading ? 'Saving...' : 'Save Preferences'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
};