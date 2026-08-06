import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { db } from '../db/connection.js';

dotenv.config();

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    const user = db.prepare('SELECT id,nombre,email,rol,activo FROM usuarios WHERE id = ?').get(payload.sub);
    if (!user || !user.activo) return res.status(401).json({ error: 'Usuario inválido' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function requireAdmin(req, res, next) {
  if (!['ADMIN_PRINCIPAL', 'ADMIN_SECUNDARIO'].includes(req.user?.rol)) {
    return res.status(403).json({ error: 'Permiso de administrador requerido' });
  }
  next();
}

export function requirePrincipal(req, res, next) {
  if (req.user?.rol !== 'ADMIN_PRINCIPAL') {
    return res.status(403).json({ error: 'Permiso de administrador principal requerido' });
  }
  next();
}
