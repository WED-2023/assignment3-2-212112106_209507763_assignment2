
// Michael new 03072025 below (Generic server)
var path = require("path");
var app = require('./main');
var https = require('https');
var http = require('http');
var fs = require('fs');


// Environment flag - set to 'production' in your production environment
const isProduction = process.env.NODE_ENV === 'production';
/**
 * Get port from environment and store in Express.
 */
var port = normalizePort(process.env.PORT || '443');
app.set('port', port);

/**
 * Create server based on environment
 */
var server;

if (isProduction) {
  // HTTPS for production
  var httpsOptions = {
    key: fs.readFileSync(path.join(__dirname, "privkey.pem")),
    cert: fs.readFileSync(path.join(__dirname, "fullchain.pem")),
  };
  server = https.createServer(httpsOptions, app);
  console.log('Running in PRODUCTION mode (HTTPS)');
} else {
  // HTTP for development
  server = http.createServer(app);
  console.log('Running in DEVELOPMENT mode (HTTP)');
}


/**
 * Listen on provided port, on all network interfaces.
 */
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }
  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;
  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */
const domain = process.env.VUE_APP_SERVER_DOMAIN;
server.address(domain);
function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
    console.log(`Server listen in port ${port} in adrress ${domain}`);
}