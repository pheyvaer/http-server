'use strict';

var fs = require('fs'),
    union = require('union'),
    ecstatic = require('ecstatic'),
    auth = require('basic-auth'),
    httpProxy = require('http-proxy'),
    corser = require('corser'),
    accepts = require('accepts'),
    path = require('path'),
    Q = require('q'),
    mime = require('./mime'),
    secureCompare = require('secure-compare');

//
// Remark: backwards compatibility for previous
// case convention of HTTP
//
exports.HttpServer = exports.HTTPServer = HttpServer;

/**
 * Returns a new instance of HttpServer with the
 * specified `options`.
 */
exports.createServer = function (options) {
  return new HttpServer(options);
};

/**
 * Constructor function for the HttpServer object
 * which is responsible for serving static files along
 * with other HTTP-related features.
 */
function HttpServer(options) {
  options = options || {};

  if (options.root) {
    this.root = options.root;
  }
  else {
    try {
      fs.lstatSync('./public');
      this.root = './public';
    }
    catch (err) {
      this.root = './';
    }
  }

  this.headers = options.headers || {};

  this.cache = (
    options.cache === undefined ? 3600 :
    // -1 is a special case to turn off caching.
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#Preventing_caching
    options.cache === -1 ? 'no-cache, no-store, must-revalidate' :
    options.cache // in seconds.
  );
  this.showDir = options.showDir !== 'false';
  this.autoIndex = options.autoIndex !== 'false';
  this.showDotfiles = options.showDotfiles;
  this.gzip = options.gzip === true;
  this.brotli = options.brotli === true;
  this.contentType = options.contentType || 'application/octet-stream';
  this.conneg = options.conneg;
  this.trailing = options.trailing;
  this.indexFile = options.indexFile || 'index';
  this.urlToTypes = {};
  this.ext = options.ext || 'html';

  var before = options.before ? options.before.slice() : [];

  before.push(function (req, res) {
    if (options.logFn) {
      options.logFn(req, res);
    }

    res.emit('next');
  });

  if (this.trailing) {
    before.push(function (req, res) {
      if (req.url.indexOf('.') === -1 && req.url[req.url.length - 1] !== '/') {
        req.url += '/';
      }

      res.emit('next');
    });
  }

  var self = this;

  if (this.conneg) {
    before.push(function (req, res) {
      if (req.url.indexOf('.') === -1 || req.url[req.url.length - 1] === '/') {
        var accept = accepts(req);

        var vary = res.getHeader('Vary');
        if (!vary) {
          vary = 'Accept';
        }
        else {
          vary += ', Accept';
        }
        res.setHeader('Vary', vary);

        // If we are dealing with a slash at the end, the user wants to access a folder and so we add 'index' (from this.indexFile).
        if (req.url[req.url.length - 1] === '/') {
          req.url += self.indexFile;
        }

        self.getExistingTypesForFile(req.url).then(function (supportedMimeTypes) {
          // Get the best MIME type based on the types in the accept headers and the ones supported by the server
          var selectedType = accept.type(Object.keys(supportedMimeTypes));

          // If no type was found and the user is happy with anything, return the first supported type
          if (!selectedType && accept.types().indexOf('*/*') !== -1 && Object.keys(supportedMimeTypes).length > 0) {
            selectedType = Object.keys(supportedMimeTypes)[0];
          }

          if (selectedType) {
            req.url += '.' + supportedMimeTypes[selectedType];
          }

          res.emit('next');
        });
      }
      else {
        res.emit('next');
      }
    });
  }

  if (options.username || options.password) {
    before.push(function (req, res) {
      var credentials = auth(req);

      // We perform these outside the if to avoid short-circuiting and giving
      // an attacker knowledge of whether the username is correct via a timing
      // attack.
      if (credentials) {
        var usernameEqual = secureCompare(options.username, credentials.name);
        var passwordEqual = secureCompare(options.password, credentials.pass);
        if (usernameEqual && passwordEqual) {
          return res.emit('next');
        }
      }

      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Basic realm=""');
      res.end('Access denied');
    });
  }

  if (options.cors) {
    this.headers['Access-Control-Allow-Origin'] = '*';
    this.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Range';
    if (options.corsHeaders) {
      options.corsHeaders.split(/\s*,\s*/)
          .forEach(function (h) { this.headers['Access-Control-Allow-Headers'] += ', ' + h; }, this);
    }
    before.push(corser.create(options.corsHeaders ? {
      requestHeaders: this.headers['Access-Control-Allow-Headers'].split(/\s*,\s*/)
    } : null));
  }

  if (options.robots) {
    before.push(function (req, res) {
      if (req.url === '/robots.txt') {
        res.setHeader('Content-Type', 'text/plain');
        var robots = options.robots === true
          ? 'User-agent: *\nDisallow: /'
          : options.robots.replace(/\\n/, '\n');

        return res.end(robots);
      }

      res.emit('next');
    });
  }

  if (options.gzip) {
    before.push(function (req, res) {
      var vary = res.getHeader('Vary');
      if (!vary) {
        vary = 'Accept-Encoding';
      }
      else {
        vary += ', Accept-Encoding';
      }
      res.setHeader('Vary', vary);

      res.emit('next');
    });
  }

  before.push(ecstatic({
    root: this.root,
    cache: this.cache,
    showDir: this.showDir,
    showDotfiles: this.showDotfiles,
    autoIndex: this.autoIndex,
    defaultExt: this.ext,
    gzip: this.gzip,
    brotli: this.brotli,
    contentType: this.contentType,
    mimeTypes: mime.typesToExtensions,
    handleError: typeof options.proxy !== 'string'
  }));

  if (typeof options.proxy === 'string') {
    var proxy = httpProxy.createProxyServer({});
    before.push(function (req, res) {
      proxy.web(req, res, {
        target: options.proxy,
        changeOrigin: true
      }, function (err, req, res, target) {
        if (options.logFn) {
          options.logFn(req, res, {
            message: err.message,
            status: res.statusCode });
        }
        res.emit('next');
      });
    });
  }

  var serverOptions = {
    before: before,
    headers: this.headers,
    onError: function (err, req, res) {
      if (options.logFn) {
        options.logFn(req, res, err);
      }

      res.end();
    }
  };

  if (options.https) {
    serverOptions.https = options.https;
  }

  this.server = union.createServer(serverOptions);
}

HttpServer.prototype.listen = function () {
  this.server.listen.apply(this.server, arguments);
};

HttpServer.prototype.close = function () {
  return this.server.close();
};

/**
 * This method returns a promise that resolves with the supported MIME types for a url.
 * @param url: the url for which to look for MIME types
 * @returns {Promise<object>}: a promise that resolved with the supported MIME types.
 * This is an object that has the types as keys and the extensions as the corresponding values.
 */
HttpServer.prototype.getExistingTypesForFile = function (url) {
  var deferred = Q.defer();

  // Check if the url is already available in the "cache" of types.
  if (!this.urlToTypes[url]) {
    var self = this;
    var supportedMimeTypes = {};
    var filename = url.substring(url.lastIndexOf('/') + 1);

    // Read the corresponding directory to find the available files.
    fs.readdir(path.join(this.root, url.substring(0, url.lastIndexOf('/') + 1)), function (err, files) {
      if (files) {
        files.forEach(function (file) {
          // We only consider the files with an extension.
          if (file.indexOf('.') !== -1) {
            var first = file.substring(0, file.indexOf('.'));

            // The filenames have to match.
            if (filename === first) {
              var extension = file.substring(file.indexOf('.') + 1);
              var types = mime.getTypes(extension);

              // For all MIME types found for the extension, add them.
              types.forEach(function (type) {
                supportedMimeTypes[type] = extension;
              });
            }
          }
        });
      }

      // Update the cache
      self.urlToTypes[url] = supportedMimeTypes;
      deferred.resolve(supportedMimeTypes);
    });
  }
  else {
    deferred.resolve(this.urlToTypes[url]);
  }

  return deferred.promise;
};
