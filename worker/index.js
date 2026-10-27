

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, User-Agent, X-Wake-Ping, X-Keep-Alive-Pulse',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/ping' || url.pathname === '/health' || url.pathname === '/') {
      const isWakePing = request.headers.get('X-Wake-Ping') || request.headers.get('X-Keep-Alive-Pulse');
      return new Response(
        JSON.stringify({
          status: 'online',
          edge: 'Cloudflare Worker',
          timestamp: new Date().toISOString(),
          wokenByCompanion: Boolean(isWakePing),
          message: isWakePing ? 'Wake-up pulse received successfully' : 'GitBot Edge Worker is active',
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found', path: url.pathname }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  },
};
