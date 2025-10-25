/*
  Dev helper to run the server with an ngrok tunnel.
  - Spawns nodemon for live-reload (backend/index.js)
  - Opens an ngrok tunnel to the configured PORT
  Usage: npm run dev:ngrok
*/

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
// Load .env explicitly from backend/.env to avoid CWD ambiguity
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let SELECTED_PORT = Number(process.env.PORT || 3000);
const REGION = process.env.NGROK_REGION; // e.g. 'us', 'eu', 'ap'
const DOMAIN = process.env.NGROK_DOMAIN; // paid feature
const SUBDOMAIN = process.env.NGROK_SUBDOMAIN; // paid feature

let tunnelUrl = null;
let ngrokInstance = null;
let ngrok;
let ngrokCliProc = null;
let child = null;
let restarting = false;
let attempts = 0;
const MAX_ATTEMPTS = 10;

async function openTunnel(port) {
  try {
    const AUTHTOKEN = process.env.NGROK_AUTHTOKEN || process.env.NGROK_TOKEN;
    const token = String(AUTHTOKEN || '').trim();
    if (!token) {
      console.error('[ngrok] NGROK_AUTHTOKEN belum di-set atau kosong. Set di backend/.env');
      process.exitCode = 1;
      return;
    }

    // Prefer official v3 SDK if available
    try {
      const ngrokV3 = require('@ngrok/ngrok');
      const opts = { addr: port, authtoken: token };
      if (REGION) opts.region = REGION;
      if (DOMAIN) opts.domain = DOMAIN;
      if (SUBDOMAIN) opts.subdomain = SUBDOMAIN;

      const listener = await ngrokV3.forward(opts);
      tunnelUrl = listener.url();
      ngrokInstance = ngrokV3;
    } catch (eV3) {
      // Fallback to legacy SDK
      try {
        ngrok = require('ngrok');
      } catch (e) {
        console.error("[ngrok] SDK tidak tersedia. Install salah satu: '@ngrok/ngrok' atau 'ngrok'");
        console.error("[ngrok] Jalankan: npm i -D @ngrok/ngrok");
        process.exitCode = 1;
        return;
      }

      // Set authtoken explicitly
      try {
        if (typeof ngrok.authtoken === 'function') {
          await ngrok.authtoken(token);
        }
      } catch (e) {
        console.error('[ngrok] Gagal set authtoken (SDK v2/v4):', e?.message || e);
        throw e;
      }

      const connectOpts = { addr: port, proto: 'http' };
      if (REGION) connectOpts.region = REGION;
      if (DOMAIN) connectOpts.domain = DOMAIN;
      if (SUBDOMAIN) connectOpts.subdomain = SUBDOMAIN;

      tunnelUrl = await ngrok.connect(connectOpts);
      ngrokInstance = ngrok;
    }

    // Helpful output
    console.log('\n============================================');
    console.log(`[ngrok] Tunnel terbuka: ${tunnelUrl}`);
    console.log('[ngrok] Arahkan klien/webhook ke URL di atas');
    console.log('============================================\n');
  } catch (err) {
    console.error('[ngrok] Gagal membuka tunnel (SDK):', err?.message || err);
    // Cetak detail error untuk troubleshooting
    if (err && err.stack) console.error(err.stack);
    try {
      // Beberapa versi mengembalikan response { body, status }
      if (err?.response) console.error('[ngrok] response:', err.response);
      if (err?.body) console.error('[ngrok] body:', err.body);
    } catch(_) {}
    console.log('[ngrok] Coba fallback ke CLI...');
    await openTunnelCLI(port);
  }
}

async function openTunnelCLI(port) {
  const { spawn } = require('child_process');
  const token = String((process.env.NGROK_AUTHTOKEN || process.env.NGROK_TOKEN || '')).trim();
  const childEnv = { ...process.env };
  if (token) childEnv.NGROK_AUTHTOKEN = token;

  // Use ngrok v3 via npx to avoid old agent
  const args = ['@ngrok/ngrok', 'http'];
  if (REGION) { args.push('--region', REGION); }
  args.push('--log=stdout');
  args.push(String(port));

  const options = { cwd: __dirname + '/../', env: childEnv, shell: true };
  console.log(`[ngrok:cli] Menjalankan: npx ${args.join(' ')}`);
  ngrokCliProc = spawn('npx', args, options);

  ngrokCliProc.stdout.on('data', (buf) => {
    const line = buf.toString();
    process.stdout.write(line);
    if (!tunnelUrl) {
      const m1 = line.match(/Forwarding\s+(https:\/\/[^\s]+)/i);
      const m2 = line.match(/url=(https:\/\/[^\s"']+)/i);
      const found = (m1 && m1[1]) || (m2 && m2[1]);
      if (found) {
        tunnelUrl = found;
        console.log('\n============================================');
        console.log(`[ngrok] Tunnel terbuka: ${tunnelUrl}`);
        console.log('[ngrok] Arahkan klien/webhook ke URL di atas');
        console.log('============================================\n');
      }
    }
  });

  ngrokCliProc.stderr.on('data', (buf) => {
    process.stderr.write(buf.toString());
  });

  ngrokCliProc.on('exit', (code, signal) => {
    console.log(`[ngrok:cli] exited (${signal || code}).`);
  });
}

const net = require('net');

function checkPort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') resolve(false);
        else resolve(false);
      })
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(start) {
  let port = start;
  for (let i = 0; i < 50; i++) {
    // eslint-disable-next-line no-await-in-loop
    const free = await checkPort(port);
    if (free) return port;
    port += 1;
  }
  return start; // fallback to requested
}

async function spawnNodemon() {
  const nodemonPath = process.platform === 'win32'
    ? 'node'
    : 'node';
  const nodemonArgs = [
    './node_modules/nodemon/bin/nodemon.js',
    'index.js'
  ];

  async function launchWithPort(port) {
    // Prevent runaway restarts
    if (attempts >= MAX_ATTEMPTS) {
      console.error(`[dev] Gagal menemukan port bebas setelah ${MAX_ATTEMPTS} percobaan.`);
      process.exit(1);
      return;
    }

    attempts += 1;
    SELECTED_PORT = await findAvailablePort(port);

    const childEnv = { ...process.env };
    if (String(childEnv.PORT) !== String(SELECTED_PORT)) {
      console.log(`[dev] Menggunakan PORT ${SELECTED_PORT}.`);
    }
    childEnv.PORT = String(SELECTED_PORT);

    // Spawn nodemon
    child = spawn(nodemonPath, nodemonArgs, {
      cwd: __dirname + '/../',
      env: childEnv,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    const rlOut = readline.createInterface({ input: child.stdout });
    const rlErr = readline.createInterface({ input: child.stderr });

    const maybeOpenTunnelFromLine = async (line) => {
      // Forward logs
      console.log(line);
      // Open tunnel once server announces it is running
      if (!tunnelUrl && /Server running on port/i.test(line)) {
        await openTunnel(SELECTED_PORT);
      }
      // Detect EADDRINUSE and try next port
      if (/EADDRINUSE|address already in use/i.test(line)) {
        if (restarting) return; // debounce
        restarting = true;
        console.warn('[dev] Port bentrok terdeteksi. Mencoba port berikutnya...');
        try { await closeTunnel(); } catch (_) {}
        try { child.kill('SIGINT'); } catch (_) {}
        rlOut.close();
        rlErr.close();
        // Slight delay before relaunch
        setTimeout(() => {
          restarting = false;
          launchWithPort(SELECTED_PORT + 1);
        }, 500);
      }
    };

    rlOut.on('line', maybeOpenTunnelFromLine);
    rlErr.on('line', (line) => {
      console.error(line);
      maybeOpenTunnelFromLine(line);
    });

    child.on('exit', async (code, signal) => {
      console.log(`[dev] Server process exited (${signal || code}).`);
      await closeTunnel();
      // If exit occurred without us requesting a restart, end the parent
      if (!restarting) process.exit(code ?? 0);
    });
  }

  await launchWithPort(SELECTED_PORT);

  // Close tunnel on Ctrl+C
  process.on('SIGINT', async () => {
    await closeTunnel();
    if (child) try { child.kill('SIGINT'); } catch (_) {}
  });

  process.on('SIGTERM', async () => {
    await closeTunnel();
    if (child) try { child.kill('SIGTERM'); } catch (_) {}
  });
}

async function closeTunnel() {
  try {
    if (ngrokInstance) {
      await ngrokInstance.disconnect();
      await ngrokInstance.kill();
      console.log('[ngrok] Tunnel ditutup');
    }
    if (ngrokCliProc) {
      try { ngrokCliProc.kill('SIGINT'); } catch (_) {}
      ngrokCliProc = null;
    }
  } catch (_) {
    // ignore
  } finally {
    ngrokInstance = null;
    tunnelUrl = null;
  }
}

// Start dev flow
spawnNodemon();
