import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../utils/api';
import { Card } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import type { User } from '../types';

interface LoginResponse {
  accessToken: string;
  user: User;
}

export function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [email, setEmail] = useState('admin@cadena.local');
  const [password, setPassword] = useState('Admin123*');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const data = await api.post<LoginResponse>('/auth/login', { email, password });
      onLogin(data.accessToken, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-text">LoQui Chain</h1>
            <p className="mt-1 text-sm text-text-muted">Administración integral de cadenas de ahorro.</p>
          </div>

          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <Label>Contraseña</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          </div>

          {error && <Banner kind="error">{error}</Banner>}

          <Button type="submit">Ingresar</Button>
          <small className="text-text-faint">Usuario inicial: admin@cadena.local / Admin123*</small>
        </form>
      </Card>
    </div>
  );
}
