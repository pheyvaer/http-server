var assert = require('assert'),
    path = require('path'),
    fs = require('fs'),
    vows = require('vows'),
    request = require('request'),
    httpServer = require('../lib/http-server');

var root = path.join(__dirname, 'fixtures', 'root');

// because of https://techsparx.com/nodejs/howto/vows-weird-trick.html
process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err.stack);
});

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
  'When conneg is enabled': {
    topic: function () {
      var server = httpServer.createServer({
        root: root,
        conneg: true
      });
      server.listen(8083);
      this.callback(null, server);
    },
    'and ask for turtle': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8083/test',
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
        assert.ok(res.headers['content-type'].startsWith('text/turtle'));
      },
      'and vary header should be present and contain accept': function (err, res) {
        assert.ok(res.headers.vary.split(/\s*,\s/g).indexOf('Accept') >= 0);
      }
    },
    'and ask for ntriples': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8083/test',
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
          uri: 'http://127.0.0.1:8083/test',
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
          uri: 'http://127.0.0.1:8083/test',
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
          uri: 'http://127.0.0.1:8083/test',
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
          uri: 'http://127.0.0.1:8083/test3/',
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
      server.listen(8084);
      this.callback(null, server);
    },
    'and ask for directory without slash': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8084/test2',
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
      server.listen(8085);
      this.callback(null, server);
    },
    'and ask for directory without slash': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8085/test2',
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
  },
  'When gzip is enabled': {
    topic: function () {
      var server = httpServer.createServer({
        root: root,
        gzip: true
      });
      server.listen(8086);
      this.callback(null, server);
    },
    'and ask for gzip content encoding': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8086/test.ttl',
          headers: {
            'Accept-Encoding': 'gzip',
            'Access-Control-Request-Method': 'GET',
            Origin: 'http://example.com',
            'Access-Control-Request-Headers': 'Foobar'
          }
        }, this.callback);
      },
      'status code should be 200': function (err, res) {
        assert.equal(res.statusCode, 200);
      },
      'and content is gzipped': function (err, res) {
        assert.equal(res.headers['content-encoding'], 'gzip');
      },
      'and vary header is set and contains Accept-Encoding': function (err, res) {
        assert.ok(res.headers.vary.split(/\s*,\s/g).indexOf('Accept-Encoding') >= 0);
      }
    },
    'and ask for no particular content encoding': {
      topic: function () {
        request({
          method: 'GET',
          uri: 'http://127.0.0.1:8086/test.ttl',
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
      'and content is not gzipped': function (err, res) {
        assert.ok(!res.headers['content-encoding']);
      },
      'and vary header is set and contains Accept-Encoding': function (err, res) {
        assert.ok(res.headers.vary.split(/\s*,\s/g).indexOf('Accept-Encoding') >= 0);
      }
    }
  }
}).export(module);
