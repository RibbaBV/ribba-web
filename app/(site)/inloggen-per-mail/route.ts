// Standalone document so analytics never see the private email-link fragment.
export function GET() {
  const authOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  return new Response(`<!doctype html>
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inloggen bij Ribba</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#f4f6fb;color:#17192a;font:16px/1.5 system-ui,sans-serif}
main{width:100%;max-width:420px;background:white;border-radius:18px;padding:32px}
img{width:112px;height:auto}h1{font-size:26px;margin:24px 0 8px}p{margin:0;color:#545e72}
button{width:100%;margin-top:24px;padding:14px;background:#245deb;color:white;border:0;border-radius:9px;font:600 16px system-ui;cursor:pointer}
</style></head><body><main>
<img src="/ribba-logo.png" alt="Ribba"><h1>Inloggen bij Ribba</h1>
<p id="hint">Open deze link op het toestel waarop je hem hebt aangevraagd.</p>
<button id="open" type="button" hidden>Open de Ribba-app</button>
<noscript>Zet JavaScript aan om verder te gaan.</noscript>
</main><script>
const params = new URLSearchParams(location.hash.slice(1));
const type = params.get('type');
const token = params.get('token');
if ((type === 'magiclink' || type === 'signup') && token && /^[a-zA-Z0-9_-]{32,256}$/.test(token)) {
  const button = document.getElementById('open');
  button.hidden = false;
  button.onclick = () => {
    const url = new URL('/auth/v1/verify', '${authOrigin}');
    url.search = new URLSearchParams({ type, token, redirect_to: 'ribba://student-login' }).toString();
    location.assign(url.href);
  };
} else {
  document.getElementById('hint').textContent = 'Vraag in de Ribba-app een nieuwe inloglink aan.';
}
</script></body></html>`, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  } });
}
