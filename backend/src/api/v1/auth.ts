import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const authRouter = Router();
const SECRET = process.env.SECRET_KEY || 'ling_shan_default_secret';

// Password hash storage
const ADMIN_CONFIG_FILE = path.resolve(__dirname, '../../../../data/admin_config.json');
const DEFAULT_ADMIN = { username: 'admin', password: 'lingshan2026' };

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.pbkdf2Sync(password, s, 100000, 64, 'sha512').toString('hex');
  return { hash: h, salt: s };
}

function getAdminCredentials(): { username: string; hash: string; salt: string } {
  try {
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      const raw = fs.readFileSync(ADMIN_CONFIG_FILE, 'utf-8');
      const config = JSON.parse(raw);
      if (config.hash && config.salt) return config;
    }
  } catch { /* fall through to init */ }

  // Initialize with default password hash
  const { hash, salt } = hashPassword(DEFAULT_ADMIN.password);
  const config = { username: DEFAULT_ADMIN.username, hash, salt };
  try {
    const dir = path.dirname(ADMIN_CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch { /* non-fatal */ }
  return config;
}

function verifyPassword(password: string): boolean {
  const config = getAdminCredentials();
  const { hash } = hashPassword(password, config.salt);
  return hash === config.hash;
}

// JWT verification middleware
export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供认证令牌' });
    return;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token无效或已过期，请重新登录' });
  }
}

authRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const config = getAdminCredentials();

  if (username === config.username && verifyPassword(password)) {
    const token = jwt.sign(
      { username, role: 'admin' },
      SECRET,
      { expiresIn: '24h' }
    );
    res.json({
      access_token: token,
      token_type: 'bearer',
      username: config.username,
      role: 'admin',
    });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

authRouter.post('/refresh', (req: Request, res: Response) => {
  const { token } = req.body;
  try {
    const decoded = jwt.verify(token, SECRET) as any;
    const newToken = jwt.sign(
      { username: decoded.username, role: decoded.role },
      SECRET,
      { expiresIn: '24h' }
    );
    res.json({ access_token: newToken, token_type: 'bearer' });
  } catch {
    res.status(401).json({ error: 'Token无效或已过期' });
  }
});

export { authRouter };
