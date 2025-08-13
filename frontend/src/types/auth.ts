export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'brand_manager' | 'analyst';
  brands: string[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: 'brand_manager' | 'analyst';
}