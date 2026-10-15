import localtunnel from 'localtunnel';

const SUBDOMAIN = process.env.TUNNEL_SUBDOMAIN || 'grid-erp';
const PORT = parseInt(process.env.PORT || '3000', 10);

async function startTunnel() {
  console.log(`[tunnel] Connecting tunnel to port ${PORT} with subdomain "${SUBDOMAIN}"...`);
  try {
    const tunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN });
    console.log(`[tunnel] LIVE_URL: ${tunnel.url}`);

    tunnel.on('close', () => {
      console.warn('[tunnel] Tunnel connection closed. Reconnecting in 3s...');
      setTimeout(startTunnel, 3000);
    });

    tunnel.on('error', (err) => {
      console.error('[tunnel] Tunnel error:', err.message);
      tunnel.close();
    });

    // Periodic keep-alive ping
    const pinger = setInterval(async () => {
      try {
        await fetch(`${tunnel.url}/api/auth/me`, {
          headers: { 'Bypass-Tunnel-Reminder': 'true' }
        });
      } catch (_) {}
    }, 25000);

    tunnel.on('close', () => clearInterval(pinger));
  } catch (err) {
    console.error('[tunnel] Failed to connect:', err.message, '- retrying in 5s...');
    setTimeout(startTunnel, 5000);
  }
}

startTunnel();
