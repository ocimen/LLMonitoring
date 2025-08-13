import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuth } from '../../contexts/AuthContext';
import { LoginCredentials } from '../../types/auth';

const schema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
});

interface LoginFormProps {
  onToggleMode: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onToggleMode }) => {
  const { login, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginCredentials>({
    resolver: yupResolver(schema),
  });

  const onSubmit = async (data: LoginCredentials) => {
    try {
      setError(null);
      await login(data);
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 400, mx: 'auto', mt: 8 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Sign In
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 2 }}>
        <TextField
          {...register('email')}
          fullWidth
          label="Email"
          type="email"
          margin="normal"
          error={!!errors.email}
          helperText={errors.email?.message}
          disabled={isLoading}
        />
        
        <TextField
          {...register('password')}
          fullWidth
          label="Password"
          type="password"
          margin="normal"
          error={!!errors.password}
          helperText={errors.password?.message}
          disabled={isLoading}
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 3, mb: 2 }}
          disabled={isLoading}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Sign In'}
        </Button>

        <Button
          fullWidth
          variant="text"
          onClick={onToggleMode}
          disabled={isLoading}
        >
          Don't have an account? Sign Up
        </Button>
      </Box>
    </Paper>
  );
};