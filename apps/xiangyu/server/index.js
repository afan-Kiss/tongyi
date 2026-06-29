const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { loadConfig, ROOT } = require('./config');
const { createApiRouter } = require('./routes/api');
const { scheduleOrderSearchCacheSync } = require('./services/orderSearchCacheService');

const config = loadConfig();
const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(
  session({
    name: 'xiangyu.sid',
    secret: config.server.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      maxAge: 12 * 60 * 60 * 1000,
    },
  })
);

app.use('/api', createApiRouter());

const clientRoot = path.join(ROOT, 'client');
const staticOpts = { etag: true, lastModified: true, maxAge: '7d', immutable: true };
app.use('/css', express.static(path.join(clientRoot, 'css'), staticOpts));
app.use('/js', express.static(path.join(clientRoot, 'js'), staticOpts));
app.use(express.static(clientRoot, { etag: true, lastModified: true, maxAge: 0 }));

app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(clientRoot, 'index.html'));
});

const port = Number(process.env.PORT || config.server.port || 3080);
const host = process.env.HOST || config.server.host || '0.0.0.0';

app.listen(port, host, () => {
  console.log(`[祥钰系统] http://${host}:${port}`);
  scheduleOrderSearchCacheSync();
});
