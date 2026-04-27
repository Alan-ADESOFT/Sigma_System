/**
 * GET /api/_debug/uploads?token=<INTERNAL_API_TOKEN>
 *
 * Diagnóstico do volume de uploads em produção. Lista o conteúdo de
 * /app/public/uploads e mostra cwd, exec uid/gid, tamanho dos arquivos.
 * Protegido por INTERNAL_API_TOKEN — deletar quando não precisar mais.
 */
const fs = require('fs');
const path = require('path');

export default async function handler(req, res) {
  const token = req.query.token;
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected || token !== expected) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const cwd = process.cwd();
  const root = path.join(cwd, 'public', 'uploads');
  const out = { cwd, root, exists: false, uid: process.getuid?.(), gid: process.getgid?.(), tree: null, error: null };

  try {
    out.exists = fs.existsSync(root);
    if (out.exists) {
      const walk = (dir, depth = 0) => {
        if (depth > 4) return '…';
        return fs.readdirSync(dir, { withFileTypes: true }).map(d => {
          const full = path.join(dir, d.name);
          if (d.isDirectory()) return { name: d.name + '/', children: walk(full, depth + 1) };
          const st = fs.statSync(full);
          return { name: d.name, size: st.size, mtime: st.mtime.toISOString() };
        });
      };
      out.tree = walk(root);
    }
  } catch (err) {
    out.error = err.message;
  }

  res.json(out);
}
