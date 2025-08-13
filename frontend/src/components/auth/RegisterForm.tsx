import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuth } from '../../contexts/AuthContext';
import { RegisterData } from '../../types/auth';

const schema = yup.object({
  name: yup.string().required('Name is required'),
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
  role: yup.string().oneOf(['brand_manager', 'analyst'], 'Please select a role').required('Role is required'),
});

interface RegisterFormProps {
  onToggleMode: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onToggleMode }) => {
  const { register: registerUser, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterData>({
    resolver: yupResolver(schema),
  });

  const onSubmit = async (data: RegisterData) => {
    try {
      setError(null);
      await registerUser(data);
    } catch (err) {
      setError('Registration failed. Please try again.');
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 400, mx: 'auto', mt: 8 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Sign Up
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 2 }}>
        <TextField
          {...register('name')}
          fullWidth
          label="Full Name"
          margin="normal"
          error={!!errors.name}
          helperText={errors.name?.message}
          disabled={isLoading}
        />
        
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

        <FormControl fullWidth margin="normal" error={!!errors.role}>
          <InputLabel>Role</InputLabel>
          <Controller
            name="role"
            control={control}
            defaultValue="brand_manager"
            render={({ field }) => (
              <Select {...field} label="Role" disabled={isLoading}>
                <MenuItem value="brand_manager">Brand Manager</MenuItem>
                <MenuItem value="analyst">Analyst</MenuItem>
              </Select>
            )}
          />
          {errors.role && (
            <Typography variant="caption" color="error" sx={{ mt: 1, ml: 2 }}>
              {errors.role.message}
            </Typography>
          )}
        </FormControl>

        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 3, mb: 2 }}
          disabled={isLoading}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Sign Up'}
        </Button>

        <Button
          fullWidth
          variant="text"
          onClick={onToggleMode}
          disabled={isLoading}
        >
          Already have an account? Sign In
        </Button>
      </Box>
    </Paper>
  );
};