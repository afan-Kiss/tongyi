/**
 * 本地测试用桥接桩服务：模拟千帆 WebSocket 桥 HTTP 入口
 * 用法: node scripts/bridge-relay-stub.js
 * 然后在设置里把桥接地址设为 http://127.0.0.1:9323/send
 */
const http = require('http');

const PORT = 9323;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'bridge-relay-stub' }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/open-session') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    console.log('[bridge-stub] open-session:', body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        created: true,
        session: {
          appCid: 'stub-app-cid',
          receiverAppUids: body.buyerUserId ? [`1#2#2#${body.buyerUserId}`] : [],
          buyerNick: body.buyerNick,
          shopTitle: body.shopTitle,
          source: 'stub',
        },
      })
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/send') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    console.log('[bridge-stub] 收到发送请求:', {
      shopTitle: body.shopTitle,
      orderId: body.orderId,
      buyerNick: body.buyerNick,
      hasImage: Boolean(body.imageBase64 || body.imageUrl),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, msgId: `stub-${Date.now()}`, mode: 'stub' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge-stub] http://127.0.0.1:${PORT}`);
});
