import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db/connection.js';

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(parsed.data.email);
  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign(
    { sub: user.id, rol: user.rol },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: '12h' }
  );

  res.json({
    accessToken: token,
    user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
  });
});

export default router;
