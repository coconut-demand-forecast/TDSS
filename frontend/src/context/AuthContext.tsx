import { createContext, useContext, useState, type ReactNode } from 'react';
import { authApi, type User } from '../api';

interface AuthContextValue {
  user: User | null;
  currentOrgId: number | null;
  setCurrentOrgId: (id: number) => void;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; organization_name: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser(): User | null {
  const raw = localStorage.getItem('tdss_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadStoredUser);
  const [currentOrgId, setCurrentOrgIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem('tdss_org_id');
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(false);

  const setCurrentOrgId = (id: number) => {
    localStorage.setItem('tdss_org_id', String(id));
    setCurrentOrgIdState(id);
  };

  const persist = (token: string, u: User) => {
    localStorage.setItem('tdss_token', token);
    localStorage.setItem('tdss_user', JSON.stringify(u));
    setUser(u);
    if (!u.is_system_owner && u.memberships.length > 0) {
      setCurrentOrgId(u.memberships[0].organization_id);
    }
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      persist(res.access_token, res.user);
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: { name: string; email: string; password: string; organization_name: string }) => {
    setLoading(true);
    try {
      const res = await authApi.register(data);
      persist(res.access_token, res.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('tdss_token');
    localStorage.removeItem('tdss_user');
    localStorage.removeItem('tdss_org_id');
    setUser(null);
    setCurrentOrgIdState(null);
  };

  const refreshUser = async () => {
    const u = await authApi.me();
    localStorage.setItem('tdss_user', JSON.stringify(u));
    setUser(u);
  };

  return (
    <AuthContext.Provider value={{ user, currentOrgId, setCurrentOrgId, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
