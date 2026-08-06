import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import cadenaRoutes from './routes/cadenaRoutes.js';
import participanteRoutes from './routes/participanteRoutes.js';
import sorteoRoutes from './routes/sorteoRoutes.js';
import pagoRoutes from './routes/pagoRoutes.js';
import entregaRoutes from './routes/entregaRoutes.js';
import reporteRoutes from './routes/reporteRoutes.js';
import iaRoutes from './routes/iaRoutes.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const port = process.env.PORT || 3001;

const devOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const allowedOrigins = process.env.APP_URL ? [...devOrigins, process.env.APP_URL] : devOrigins;

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/cadenas', cadenaRoutes);
app.use('/api/participantes', participanteRoutes);
app.use('/api/sorteo', sorteoRoutes);
app.use('/api/pagos', pagoRoutes);
app.use('/api/entregas', entregaRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/ia', iaRoutes);

if (isProduction) {
  const distPath = path.join(__dirname, '../../dist');
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`API Cadena escuchando en el puerto ${port}`);
});
