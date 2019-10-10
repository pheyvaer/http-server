var assert = require('assert'),
  path = require('path'),
  fs = require('fs'),
  vows = require('vows'),
  request = require('request'),
  httpServer = require('../lib/http-server');

// Prevent vows from swallowing errors
process.on('uncaughtException', console.error);

var root = path.join(__dirname, 'fixtures', 'root');

vows.describe('http-server').addBatch({
  'When http-server is listening on 8080': {
    topic: function () {
      var server = httpServer.createServer({
        root: root,
        robots: true,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true'
        }
      });

      server.listen(8080);
      this.callback(null, server);
    },
    'it should serve files from root directory': {
      topic: function () {
        request('http://127.0.0.1:8080/file', this.callback);
      },
      'status code should be 200': function (res) {
        assert.equal(res.statusCode, 200);
      },
      'and file content': {
        topic: function (res, body) {
          var self = this;
          fs.readFile(path.join(root, 'file'), 'utf8', function (err, data) {
            self.callback(err, data, body);
          });
        },
        'should match content of served file': function (err, file, body) {
          assert.equal(body.trim(), file.trim());
        }
      }
    },
    'when requesting non-existent file': {
      topic: function () {
        request('http://127.0.0.1:8080/404', this.callback);
      },
      'status code should be 404': function (res) {
        assert.equal(res.statusCode, 404);
      }
    },
    'when requesting /': {
      topic: function () {
        request('http://127.0.0.1:8080/', this.callback);
      },
      'should respond with index': function (err, res, body) {
        assert.equal(res.statusCode, 200);
        assert.include(body, '/file');
        assert.include(body, '/canYouSeeMe');
      }
    },
    'when robots options is activated': {
      topic: function () {
        request('http://127.0.0.1:8080/', this.callback);
      },
      'should respond with status code 200 to /robots.txt': function (res) {
        assert.equal(res.statusCode, 200);
      }
    },
    'and options include custom set http-headers': {
      topic: function () {
        request('http://127.0.0.1:8080/', this.callback);
      },
      'should respond with headers set in options': function (err, res) {
        assert.equal(res.headers['access-control-allow-origin'], '*');
        assert.equal(res.headers['access-control-allow-credentials'], 'true');
      }
    },
    'When http-server is proxying from 8081 to 8080': {
      topic: function () {
        var proxyServer = httpServer.createServer({
          proxy: 'http://127.0.0.1:8080/',
          root: path.join(__dirname, 'fixtures')
        });
        proxyServer.listen(8081);
        this.callback(null, proxyServer);
      },
      'it should serve files from the proxy server root directory': {
        topic: function () {
          request('http://127.0.0.1:8081/root/file', this.callback);
        },
        'status code should be the endpoint code 200': function (res) {
          assert.equal(res.statusCode, 200);
        },
        'and file content': {
          topic: function (res, body) {
            var self = this;
            fs.readFile(path.join(root, 'file'), 'utf8', function (err, data) {
              self.callback(err, data, body);
            });
          },
          'should match content of the served file': function (err, file, body) {
            assert.equal(body.trim(), file.trim());
          }
        }
      },
      'it should fallback to the proxied server': {
        topic: function () {
          request('http://127.0.0.1:8081/file', this.callback);
        },
        'status code should be the endpoint code 200': function (res) {
          assert.equal(res.statusCode, 200);
        },
        'and file content': {
          topic: function (res, body) {
            var self = this;
            fs.readFile(path.join(root, 'file'), 'utf8', function (err, data) {
              self.callback(err, data, body);
            });
          },
          'should match content of the proxied served file': function (err, file, body) {
            assert.equal(body.trim(), file.trim());
          }
        }
      }
    }
  },
  'When cors is enabled': {
    topic: function () {
      var server = httpServer.createServer({
        root: root,
        cors: true,
        corsHeaders: 'X-Test'
      });
      server.listen(8082);
      this.callback(null, server);
    },
    'and given OPTIONS request': {
      topic: function () {
        request({
          method: 'OPTIONS',
          uri: 'http://127.0.0.1:8082/',
          headers: {
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 204': function (err, res) {
        assert.equal(res.statusCode, 204);
      },
      'response Access-Control-Allow-Headers should contain X-Test': function (err, res) {
        assert.ok(res.headers['access-control-allow-headers'].split(/\s*,\s*/g).indexOf('X-Test') >= 0, 204);
      }
    }
  },
  'When gzip and brotli compression is enabled and a compressed file is available': {
    topic: function () {
      var server = httpServer.createServer({
        root: root,
        brotli: true,
        gzip: true
      });
      server.listen(8084);
      this.callback(null, server);
    },
    'and a request accepting only gzip is made': {
      topic: function () {
        request({
          uri: 'http://127.0.0.1:8084/compression/',
          headers: {
            'accept-encoding': 'gzip'
          }
        }, this.callback);
      },
      'response should be gzip compressed': function (err, res, body) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-encoding'], 'gzip');
      }
    },
    'and a request accepting only brotli is made': {
      topic: function () {
        request({
          uri: 'http://127.0.0.1:8084/compression/',
          headers: {
            'accept-encoding': 'br'
          }
        }, this.callback);
      },
      'response should be brotli compressed': function (err, res, body) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-encoding'], 'br');
      }
    },
    'and a request accepting both brotli and gzip is made': {
      topic: function () {
        request({
          uri: 'http://127.0.0.1:8084/compression/',
          headers: {
            'accept-encoding': 'gzip, br'
          }
        }, this.callback);
      },
      'response should be brotli compressed': function (err, res, body) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-encoding'], 'br');
      }
    }
  },
  'When http-server is listening on 8083 with username "good_username" and password "good_password"': {
    topic: function () {
      var server = httpServer.createServer({
        root: root,
        robots: true,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true'
        },
        username: 'good_username',
        password: 'good_password'
      });

      server.listen(8083);
      this.callback(null, server);
    },
    'and the user requests an existent file with no auth details': {
      topic: function () {
        request('http://127.0.0.1:8083/file', this.callback);
      },
      'status code should be 401': function (res) {
        assert.equal(res.statusCode, 401);
      },
      'and file content': {
        topic: function (res, body) {
          var self = this;
          fs.readFile(path.join(root, 'file'), 'utf8', function (err, data) {
            self.callback(err, data, body);
          });
        },
        'should be a forbidden message': function (err, file, body) {
          assert.equal(body, 'Access denied');
        }
      }
    },
    'and the user requests an existent file with incorrect username': {
      topic: function () {
        request('http://127.0.0.1:8083/file', {
          auth: {
            user: 'wrong_username',
            pass: 'good_password'
          }
        }, this.callback);
      },
      'status code should be 401': function (res) {
        assert.equal(res.statusCode, 401);
      },
      'and file content': {
        topic: function (res, body) {
          var self = this;
          fs.readFile(path.join(root, 'file'), 'utf8', function (err, data) {
            self.callback(err, data, body);
          });
        },
        'should be a forbidden message': function (err, file, body) {
          assert.equal(body, 'Access denied');
        }
      }
    },
    'and the user requests an existent file with incorrect password': {
      topic: function () {
        request('http://127.0.0.1:8083/file', {
          auth: {
            user: 'good_username',
            pass: 'wrong_password'
          }
        }, this.callback);
      },
      'status code should be 401': function (res) {
        assert.equal(res.statusCode, 401);
      },
      'and file content': {
        topic: function (res, body) {
          var self = this;
          fs.readFile(path.join(root, 'file'), 'utf8', function (err, data) {
            self.callback(err, data, body);
          });
        },
        'should be a forbidden message': function (err, file, body) {
          assert.equal(body, 'Access denied');
        }
      }
    },
    'and the user requests a non-existent file with incorrect password': {
      topic: function () {
        request('http://127.0.0.1:8083/404', {
          auth: {
            user: 'good_username',
            pass: 'wrong_password'
          }
        }, this.callback);
      },
      'status code should be 401': function (res) {
        assert.equal(res.statusCode, 401);
      },
      'and file content': {
        topic: function (res, body) {
          var self = this;
          fs.readFile(path.join(root, 'file'), 'utf8', function (err, data) {
            self.callback(err, data, body);
          });
        },
        'should be a forbidden message': function (err, file, body) {
          assert.equal(body, 'Access denied');
        }
      }
    },
    'and the user requests an existent file with correct auth details': {
      topic: function () {
        request('http://127.0.0.1:8083/file', {
          auth: {
            user: 'good_username',
            pass: 'good_password'
          }
        }, this.callback);
      },
      'status code should be 200': function (res) {
        assert.equal(res.statusCode, 200);
      },
      'and file content': {
        topic: function (res, body) {
          var self = this;
          fs.readFile(path.join(root, 'file'), 'utf8', function (err, data) {
            self.callback(err, data, body);
          });
        },
        'should match content of served file': function (err, file, body) {
          assert.equal(body.trim(), file.trim());
        }
      }
    }
  },
  'When conneg is enabled': {
    topic: function () {
      var server = httpServer.createServer({
        root: root,
        conneg: true
      });
      server.listen(8085);
      this.callback(null, server);
    },
    'and request has a long accept header': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8085/test',
          headers: {
            Accept: 'application/trig,application/ld+json;q=0.9,application/n-quads;q=0.7,text/turtle;q=0.6,application/rdf+xml;q=0.5,application/xml;q=0.5,text/xml;q=0.5,image/svg+xml;q=0.5,application/json;q=0.45,application/n-triples;q=0.3,text/html;q=0.2,application/xhtml+xml;q=0.18,text/n3;q=0.1',
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 200': function (err, res) {
        assert.equal(res.statusCode, 200);
      },
      'and content type should be turtle': function (err, res) {
        assert.ok(res.headers['content-type'].indexOf('text/turtle') !== -1);
      },
      'and vary header should be present and contain accept': function (err, res) {
        assert.ok(res.headers.vary.split(/\s*,\s/g).indexOf('Accept') >= 0);
      }
    },
    'and ask for turtle': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8085/test',
          headers: {
            Accept: 'text/turtle',
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 200': function (err, res) {
        assert.equal(res.statusCode, 200);
      },
      'and content type should be turtle': function (err, res) {
        assert.ok(res.headers['content-type'].indexOf('text/turtle') !== -1);
      },
      'and vary header should be present and contain accept': function (err, res) {
        assert.ok(res.headers.vary.split(/\s*,\s/g).indexOf('Accept') >= 0);
      }
    },
    'and ask for ntriples': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8085/test',
          headers: {
            Accept: 'application/n-triples',
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 200': function (err, res) {
        assert.equal(res.statusCode, 200);
      },
      'vary header should be present and contain accept': function (err, res) {
        assert.ok(res.headers.vary.split(/\s*,\s/g).indexOf('Accept') >= 0);
      }
    },
    'and ask for rdf/xml': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8085/test',
          headers: {
            Accept: 'application/rdf+xml',
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 404': function (err, res) {
        assert.equal(res.statusCode, 404);
      }
    },
    'and ask for nothing in particular': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8085/test',
          headers: {
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 200': function (err, res) {
        assert.equal(res.statusCode, 200);
      },
      'and vary header should be present and contain accept': function (err, res) {
        assert.ok(res.headers.vary.split(/\s*,\s/g).indexOf('Accept') >= 0);
      },
      'and file content': {
        topic: function (res, body) {
          var self = this;
          fs.readFile(path.join(root, 'test.nt'), 'utf8', function (err, data) {
            self.callback(err, data, body);
          });
        },
        'should match content of the n-triples file': function (err, file, body) {
          assert.equal(body.trim(), file.trim());
        }
      }
    },'and ask for unexisting MIME type': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8085/test',
          headers: {
            Accept: 'asdfadf__dfdkennvd+++++',
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 404': function (err, res) {
        assert.equal(res.statusCode, 404);
      }
    },'and ask for unexisting folder': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8085/test3/',
          headers: {
            Accept: 'text/turtle',
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 404': function (err, res) {
        assert.equal(res.statusCode, 404);
      }
    }
  },
  'When conneg and trailing slash adding enabled': {
    topic: function () {
      var server = httpServer.createServer({
        root: root,
        conneg: true,
        trailing: true
      });
      server.listen(8086);
      this.callback(null, server);
    },
    'and ask for directory without slash': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8086/test2',
          headers: {
            Accept: 'text/turtle',
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 200': function (err, res) {
        assert.equal(res.statusCode, 200);
      },
      'and file content': {
        topic: function (res, body) {
          var self = this;
          fs.readFile(path.join(root, 'test2/index.ttl'), 'utf8', function (err, data) {
            self.callback(err, data, body);
          });
        },
        'should match content of the Turtle file': function (err, file, body) {
          assert.equal(body.trim(), file.trim());
        }
      }
    }
  },
  'When trailing is enabled': {
    topic: function () {
      var server = httpServer.createServer({
        root: root,
        trailing: true
      });
      server.listen(8086);
      this.callback(null, server);
    },
    'and ask for directory without slash': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8086/test2',
          headers: {
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 200': function (err, res) {
        assert.equal(res.statusCode, 200);
      },
      'and file content': {
        topic: function (res, body) {
          var self = this;
          fs.readFile(path.join(root, 'test2/index.html'), 'utf8', function (err, data) {
            self.callback(err, data, body);
          });
        },
        'should match content of the HTML file': function (err, file, body) {
          assert.equal(body.trim(), file.trim());
        }
      }
    }
  }
}).export(module);
