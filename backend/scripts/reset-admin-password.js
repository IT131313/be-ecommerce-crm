const bcrypt = require('bcryptjs');
const db = require('../config/database');

function parseArgs() {
  const out = {};
  for (const raw of process.argv.slice(2)) {
    // Supports: --key=value or --key value
    if (raw.startsWith('--')) {
      const eq = raw.indexOf('=');
      if (eq !== -1) {
        const k = raw.slice(2, eq);
        const v = raw.slice(eq + 1);
        out[k] = v;
      } else {
        out[raw.slice(2)] = true;
      }
    } else if (!out._) {
      out._ = [raw];
    } else {
      out._.push(raw);
    }
  }
  return out;
}

async function upsertAdmin({ email, password, name }) {
  if (!email || !password) {
    console.error('Usage: node scripts/reset-admin-password.js --email=<email> --password=<password> [--name="Admin Name"]');
    process.exit(1);
  }

  const displayName = name || 'System Administrator';

  try {
    const existing = await db.get('SELECT id FROM admins WHERE email = ?', [email]);
    const hashed = await bcrypt.hash(password, 10);

    if (existing) {
      await db.run('UPDATE admins SET password = ?, name = COALESCE(name, ?) WHERE email = ?', [hashed, displayName, email]);
      console.log(`Updated password for admin: ${email}`);
    } else {
      await db.run(
        'INSERT INTO admins (email, password, name, role) VALUES (?, ?, ?, ?)',
        [email, hashed, displayName, 'admin']
      );
      console.log(`Created admin: ${email}`);
    }

    console.log('Done. You can now login via /api/admin/auth/login');
  } catch (err) {
    console.error('Failed to upsert admin:', err);
    process.exit(1);
  }
}

(async () => {
  const args = parseArgs();
  // Allow space-separated style: --email test@example.com --password secret
  // If keys without equals were provided, map from positional pairs
  const getVal = (key) => args[key] === true ? null : args[key];

  // Support both --key=value and --key value (in pairs)
  const mapPairs = () => {
    if (!args._ || args._.length === 0) return;
    for (let i = 0; i < args._.length - 1; i += 2) {
      const k = args._[i].replace(/^--/, '');
      const v = args._[i + 1];
      if (!args[k]) args[k] = v;
    }
  };

  mapPairs();

  await upsertAdmin({
    email: getVal('email') || process.env.ADMIN_EMAIL,
    password: getVal('password') || process.env.ADMIN_PASSWORD,
    name: getVal('name') || process.env.ADMIN_NAME,
  });
})();

