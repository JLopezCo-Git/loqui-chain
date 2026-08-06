import { useState, useCallback } from 'react';
import { getUser, setSession, clearSession } from '../utils/api';
import type { User } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(getUser());

  const login = useCallback((token: string, loggedUser: User) => {
    setSession(token, loggedUser);
    setUser(loggedUser);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return { user, login, logout };
}
