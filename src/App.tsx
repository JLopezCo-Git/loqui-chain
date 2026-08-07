import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Login } from './pages/Login';
import { AppLayout } from './layouts/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Cadenas } from './pages/Cadenas';
import { Participantes } from './pages/Participantes';
import { Pagos } from './pages/Pagos';
import { Entregas } from './pages/Entregas';
import { IA } from './pages/IA';

export function App() {
  const { user, login, logout } = useAuth();

  if (!user) return <Login onLogin={login} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout user={user} onLogout={logout} />}>
          <Route index element={<Dashboard />} />
          <Route path="cadenas" element={<Cadenas />} />
          <Route path="participantes" element={<Participantes />} />
          <Route path="pagos" element={<Pagos />} />
          <Route path="entregas" element={<Entregas />} />
          <Route path="ia" element={<IA />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
