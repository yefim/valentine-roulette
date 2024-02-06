// https://github.com/parcel-bundler/parcel/issues/3407#issuecomment-686247350
const serveStatic = require('serve-static');
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // Use static middleware
  app.use('/public', serveStatic('public'));

  // Proxy to netlify dev -d app/build/ --debug
  app.use(
    createProxyMiddleware('/api', {
      target: 'http://localhost:8888/',
    }),
  );
};
