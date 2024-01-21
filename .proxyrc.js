// https://github.com/parcel-bundler/parcel/issues/3407#issuecomment-686247350
const serveStatic = require('serve-static');

module.exports = function(app) {
  // Use static middleware
  app.use('/public', serveStatic('public'));
};
