(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Browser Request
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// UMD HEADER START 
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.returnExports = factory();
  }
}(this, function () {
// UMD HEADER END

var XHR = XMLHttpRequest
if (!XHR) throw new Error('missing XMLHttpRequest')
request.log = {
  'trace': noop, 'debug': noop, 'info': noop, 'warn': noop, 'error': noop
}

var DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

//
// request
//

function request(options, callback) {
  // The entry-point to the API: prep the options object and pass the real work to run_xhr.
  if(typeof callback !== 'function')
    throw new Error('Bad callback given: ' + callback)

  if(!options)
    throw new Error('No options given')

  var options_onResponse = options.onResponse; // Save this for later.

  if(typeof options === 'string')
    options = {'uri':options};
  else
    options = JSON.parse(JSON.stringify(options)); // Use a duplicate for mutating.

  options.onResponse = options_onResponse // And put it back.

  if (options.verbose) request.log = getLogger();

  if(options.url) {
    options.uri = options.url;
    delete options.url;
  }

  if(!options.uri && options.uri !== "")
    throw new Error("options.uri is a required argument");

  if(typeof options.uri != "string")
    throw new Error("options.uri must be a string");

  var unsupported_options = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
  for (var i = 0; i < unsupported_options.length; i++)
    if(options[ unsupported_options[i] ])
      throw new Error("options." + unsupported_options[i] + " is not supported")

  options.callback = callback
  options.method = options.method || 'GET';
  options.headers = options.headers || {};
  options.body    = options.body || null
  options.timeout = options.timeout || request.DEFAULT_TIMEOUT

  if(options.headers.host)
    throw new Error("Options.headers.host is not supported");

  if(options.json) {
    options.headers.accept = options.headers.accept || 'application/json'
    if(options.method !== 'GET')
      options.headers['content-type'] = 'application/json'

    if(typeof options.json !== 'boolean')
      options.body = JSON.stringify(options.json)
    else if(typeof options.body !== 'string')
      options.body = JSON.stringify(options.body)
  }
  
  //BEGIN QS Hack
  var serialize = function(obj) {
    var str = [];
    for(var p in obj)
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    return str.join("&");
  }
  
  if(options.qs){
    var qs = (typeof options.qs == 'string')? options.qs : serialize(options.qs);
    if(options.uri.indexOf('?') !== -1){ //no get params
        options.uri = options.uri+'&'+qs;
    }else{ //existing get params
        options.uri = options.uri+'?'+qs;
    }
  }
  //END QS Hack
  
  //BEGIN FORM Hack
  var multipart = function(obj) {
    //todo: support file type (useful?)
    var result = {};
    result.boundry = '-------------------------------'+Math.floor(Math.random()*1000000000);
    var lines = [];
    for(var p in obj){
        if (obj.hasOwnProperty(p)) {
            lines.push(
                '--'+result.boundry+"\n"+
                'Content-Disposition: form-data; name="'+p+'"'+"\n"+
                "\n"+
                obj[p]+"\n"
            );
        }
    }
    lines.push( '--'+result.boundry+'--' );
    result.body = lines.join('');
    result.length = result.body.length;
    result.type = 'multipart/form-data; boundary='+result.boundry;
    return result;
  }
  
  if(options.form){
    if(typeof options.form == 'string') throw('form name unsupported');
    if(options.method === 'POST'){
        var encoding = (options.encoding || 'application/x-www-form-urlencoded').toLowerCase();
        options.headers['content-type'] = encoding;
        switch(encoding){
            case 'application/x-www-form-urlencoded':
                options.body = serialize(options.form).replace(/%20/g, "+");
                break;
            case 'multipart/form-data':
                var multi = multipart(options.form);
                //options.headers['content-length'] = multi.length;
                options.body = multi.body;
                options.headers['content-type'] = multi.type;
                break;
            default : throw new Error('unsupported encoding:'+encoding);
        }
    }
  }
  //END FORM Hack

  // If onResponse is boolean true, call back immediately when the response is known,
  // not when the full request is complete.
  options.onResponse = options.onResponse || noop
  if(options.onResponse === true) {
    options.onResponse = callback
    options.callback = noop
  }

  // XXX Browsers do not like this.
  //if(options.body)
  //  options.headers['content-length'] = options.body.length;

  // HTTP basic authentication
  if(!options.headers.authorization && options.auth)
    options.headers.authorization = 'Basic ' + b64_enc(options.auth.username + ':' + options.auth.password);

  return run_xhr(options)
}

var req_seq = 0
function run_xhr(options) {
  var xhr = new XHR
    , timed_out = false
    , is_cors = is_crossDomain(options.uri)
    , supports_cors = ('withCredentials' in xhr)

  req_seq += 1
  xhr.seq_id = req_seq
  xhr.id = req_seq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  if(is_cors && !supports_cors) {
    var cors_err = new Error('Browser does not support cross-origin request: ' + options.uri)
    cors_err.cors = 'unsupported'
    return options.callback(cors_err, xhr)
  }

  xhr.timeoutTimer = setTimeout(too_late, options.timeout)
  function too_late() {
    timed_out = true
    var er = new Error('ETIMEDOUT')
    er.code = 'ETIMEDOUT'
    er.duration = options.timeout

    request.log.error('Timeout', { 'id':xhr._id, 'milliseconds':options.timeout })
    return options.callback(er, xhr)
  }

  // Some states can be skipped over, so remember what is still incomplete.
  var did = {'response':false, 'loading':false, 'end':false}

  xhr.onreadystatechange = on_state_change
  xhr.open(options.method, options.uri, true) // asynchronous
  if(is_cors)
    xhr.withCredentials = !! options.withCredentials
  xhr.send(options.body)
  return xhr

  function on_state_change(event) {
    if(timed_out)
      return request.log.debug('Ignoring timed out state change', {'state':xhr.readyState, 'id':xhr.id})

    request.log.debug('State change', {'state':xhr.readyState, 'id':xhr.id, 'timed_out':timed_out})

    if(xhr.readyState === XHR.OPENED) {
      request.log.debug('Request started', {'id':xhr.id})
      for (var key in options.headers)
        xhr.setRequestHeader(key, options.headers[key])
    }

    else if(xhr.readyState === XHR.HEADERS_RECEIVED)
      on_response()

    else if(xhr.readyState === XHR.LOADING) {
      on_response()
      on_loading()
    }

    else if(xhr.readyState === XHR.DONE) {
      on_response()
      on_loading()
      on_end()
    }
  }

  function on_response() {
    if(did.response)
      return

    did.response = true
    request.log.debug('Got response', {'id':xhr.id, 'status':xhr.status})
    clearTimeout(xhr.timeoutTimer)
    xhr.statusCode = xhr.status // Node request compatibility

    // Detect failed CORS requests.
    if(is_cors && xhr.statusCode == 0) {
      var cors_err = new Error('CORS request rejected: ' + options.uri)
      cors_err.cors = 'rejected'

      // Do not process this request further.
      did.loading = true
      did.end = true

      return options.callback(cors_err, xhr)
    }

    options.onResponse(null, xhr)
  }

  function on_loading() {
    if(did.loading)
      return

    did.loading = true
    request.log.debug('Response body loading', {'id':xhr.id})
    // TODO: Maybe simulate "data" events by watching xhr.responseText
  }

  function on_end() {
    if(did.end)
      return

    did.end = true
    request.log.debug('Request done', {'id':xhr.id})

    xhr.body = xhr.responseText
    if(options.json) {
      try        { xhr.body = JSON.parse(xhr.responseText) }
      catch (er) { return options.callback(er, xhr)        }
    }

    options.callback(null, xhr, xhr.body)
  }

} // request

request.withCredentials = false;
request.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;

//
// defaults
//

request.defaults = function(options, requester) {
  var def = function (method) {
    var d = function (params, callback) {
      if(typeof params === 'string')
        params = {'uri': params};
      else {
        params = JSON.parse(JSON.stringify(params));
      }
      for (var i in options) {
        if (params[i] === undefined) params[i] = options[i]
      }
      return method(params, callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  return de
}

//
// HTTP method shortcuts
//

var shortcuts = [ 'get', 'put', 'post', 'head' ];
shortcuts.forEach(function(shortcut) {
  var method = shortcut.toUpperCase();
  var func   = shortcut.toLowerCase();

  request[func] = function(opts) {
    if(typeof opts === 'string')
      opts = {'method':method, 'uri':opts};
    else {
      opts = JSON.parse(JSON.stringify(opts));
      opts.method = method;
    }

    var args = [opts].concat(Array.prototype.slice.apply(arguments, [1]));
    return request.apply(this, args);
  }
})

//
// CouchDB shortcut
//

request.couch = function(options, callback) {
  if(typeof options === 'string')
    options = {'uri':options}

  // Just use the request API to do JSON.
  options.json = true
  if(options.body)
    options.json = options.body
  delete options.body

  callback = callback || noop

  var xhr = request(options, couch_handler)
  return xhr

  function couch_handler(er, resp, body) {
    if(er)
      return callback(er, resp, body)

    if((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
      // The body is a Couch JSON object indicating the error.
      er = new Error('CouchDB error: ' + (body.error.reason || body.error.error))
      for (var key in body)
        er[key] = body[key]
      return callback(er, resp, body);
    }

    return callback(er, resp, body);
  }
}

//
// Utility
//

function noop() {}

function getLogger() {
  var logger = {}
    , levels = ['trace', 'debug', 'info', 'warn', 'error']
    , level, i

  for(i = 0; i < levels.length; i++) {
    level = levels[i]

    logger[level] = noop
    if(typeof console !== 'undefined' && console && console[level])
      logger[level] = formatted(console, level)
  }

  return logger
}

function formatted(obj, method) {
  return formatted_logger

  function formatted_logger(str, context) {
    if(typeof context === 'object')
      str += ' ' + JSON.stringify(context)

    return obj[method].call(obj, str)
  }
}

// Return whether a URL is a cross-domain request.
function is_crossDomain(url) {
  var rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/

  // jQuery #8138, IE may throw an exception when accessing
  // a field from window.location if document.domain has been set
  var ajaxLocation
  try { ajaxLocation = location.href }
  catch (e) {
    // Use the href attribute of an A element since IE will modify it given document.location
    ajaxLocation = document.createElement( "a" );
    ajaxLocation.href = "";
    ajaxLocation = ajaxLocation.href;
  }

  var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || []
    , parts = rurl.exec(url.toLowerCase() )

  var result = !!(
    parts &&
    (  parts[1] != ajaxLocParts[1]
    || parts[2] != ajaxLocParts[2]
    || (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? 80 : 443))
    )
  )

  //console.debug('is_crossDomain('+url+') -> ' + result)
  return result
}

// MIT License from http://phpjs.org/functions/base64_encode:358
function b64_enc (data) {
    // Encodes string using MIME base64 algorithm
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc="", tmp_arr = [];

    if (!data) {
        return data;
    }

    // assume utf8 data
    // data = this.utf8_encode(data+'');

    do { // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = o1<<16 | o2<<8 | o3;

        h1 = bits>>18 & 0x3f;
        h2 = bits>>12 & 0x3f;
        h3 = bits>>6 & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    enc = tmp_arr.join('');

    switch (data.length % 3) {
        case 1:
            enc = enc.slice(0, -2) + '==';
        break;
        case 2:
            enc = enc.slice(0, -1) + '=';
        break;
    }

    return enc;
}
    return request;
//UMD FOOTER START
}));
//UMD FOOTER END

},{}],2:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],3:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],4:[function(require,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   3.0.2
 */

(function() {
    "use strict";
    function lib$es6$promise$utils$$objectOrFunction(x) {
      return typeof x === 'function' || (typeof x === 'object' && x !== null);
    }

    function lib$es6$promise$utils$$isFunction(x) {
      return typeof x === 'function';
    }

    function lib$es6$promise$utils$$isMaybeThenable(x) {
      return typeof x === 'object' && x !== null;
    }

    var lib$es6$promise$utils$$_isArray;
    if (!Array.isArray) {
      lib$es6$promise$utils$$_isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      };
    } else {
      lib$es6$promise$utils$$_isArray = Array.isArray;
    }

    var lib$es6$promise$utils$$isArray = lib$es6$promise$utils$$_isArray;
    var lib$es6$promise$asap$$len = 0;
    var lib$es6$promise$asap$$toString = {}.toString;
    var lib$es6$promise$asap$$vertxNext;
    var lib$es6$promise$asap$$customSchedulerFn;

    var lib$es6$promise$asap$$asap = function asap(callback, arg) {
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len] = callback;
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len + 1] = arg;
      lib$es6$promise$asap$$len += 2;
      if (lib$es6$promise$asap$$len === 2) {
        // If len is 2, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        if (lib$es6$promise$asap$$customSchedulerFn) {
          lib$es6$promise$asap$$customSchedulerFn(lib$es6$promise$asap$$flush);
        } else {
          lib$es6$promise$asap$$scheduleFlush();
        }
      }
    }

    function lib$es6$promise$asap$$setScheduler(scheduleFn) {
      lib$es6$promise$asap$$customSchedulerFn = scheduleFn;
    }

    function lib$es6$promise$asap$$setAsap(asapFn) {
      lib$es6$promise$asap$$asap = asapFn;
    }

    var lib$es6$promise$asap$$browserWindow = (typeof window !== 'undefined') ? window : undefined;
    var lib$es6$promise$asap$$browserGlobal = lib$es6$promise$asap$$browserWindow || {};
    var lib$es6$promise$asap$$BrowserMutationObserver = lib$es6$promise$asap$$browserGlobal.MutationObserver || lib$es6$promise$asap$$browserGlobal.WebKitMutationObserver;
    var lib$es6$promise$asap$$isNode = typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

    // test for web worker but not in IE10
    var lib$es6$promise$asap$$isWorker = typeof Uint8ClampedArray !== 'undefined' &&
      typeof importScripts !== 'undefined' &&
      typeof MessageChannel !== 'undefined';

    // node
    function lib$es6$promise$asap$$useNextTick() {
      // node version 0.10.x displays a deprecation warning when nextTick is used recursively
      // see https://github.com/cujojs/when/issues/410 for details
      return function() {
        process.nextTick(lib$es6$promise$asap$$flush);
      };
    }

    // vertx
    function lib$es6$promise$asap$$useVertxTimer() {
      return function() {
        lib$es6$promise$asap$$vertxNext(lib$es6$promise$asap$$flush);
      };
    }

    function lib$es6$promise$asap$$useMutationObserver() {
      var iterations = 0;
      var observer = new lib$es6$promise$asap$$BrowserMutationObserver(lib$es6$promise$asap$$flush);
      var node = document.createTextNode('');
      observer.observe(node, { characterData: true });

      return function() {
        node.data = (iterations = ++iterations % 2);
      };
    }

    // web worker
    function lib$es6$promise$asap$$useMessageChannel() {
      var channel = new MessageChannel();
      channel.port1.onmessage = lib$es6$promise$asap$$flush;
      return function () {
        channel.port2.postMessage(0);
      };
    }

    function lib$es6$promise$asap$$useSetTimeout() {
      return function() {
        setTimeout(lib$es6$promise$asap$$flush, 1);
      };
    }

    var lib$es6$promise$asap$$queue = new Array(1000);
    function lib$es6$promise$asap$$flush() {
      for (var i = 0; i < lib$es6$promise$asap$$len; i+=2) {
        var callback = lib$es6$promise$asap$$queue[i];
        var arg = lib$es6$promise$asap$$queue[i+1];

        callback(arg);

        lib$es6$promise$asap$$queue[i] = undefined;
        lib$es6$promise$asap$$queue[i+1] = undefined;
      }

      lib$es6$promise$asap$$len = 0;
    }

    function lib$es6$promise$asap$$attemptVertx() {
      try {
        var r = require;
        var vertx = r('vertx');
        lib$es6$promise$asap$$vertxNext = vertx.runOnLoop || vertx.runOnContext;
        return lib$es6$promise$asap$$useVertxTimer();
      } catch(e) {
        return lib$es6$promise$asap$$useSetTimeout();
      }
    }

    var lib$es6$promise$asap$$scheduleFlush;
    // Decide what async method to use to triggering processing of queued callbacks:
    if (lib$es6$promise$asap$$isNode) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useNextTick();
    } else if (lib$es6$promise$asap$$BrowserMutationObserver) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMutationObserver();
    } else if (lib$es6$promise$asap$$isWorker) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMessageChannel();
    } else if (lib$es6$promise$asap$$browserWindow === undefined && typeof require === 'function') {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$attemptVertx();
    } else {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useSetTimeout();
    }

    function lib$es6$promise$$internal$$noop() {}

    var lib$es6$promise$$internal$$PENDING   = void 0;
    var lib$es6$promise$$internal$$FULFILLED = 1;
    var lib$es6$promise$$internal$$REJECTED  = 2;

    var lib$es6$promise$$internal$$GET_THEN_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$selfFulfillment() {
      return new TypeError("You cannot resolve a promise with itself");
    }

    function lib$es6$promise$$internal$$cannotReturnOwn() {
      return new TypeError('A promises callback cannot return that same promise.');
    }

    function lib$es6$promise$$internal$$getThen(promise) {
      try {
        return promise.then;
      } catch(error) {
        lib$es6$promise$$internal$$GET_THEN_ERROR.error = error;
        return lib$es6$promise$$internal$$GET_THEN_ERROR;
      }
    }

    function lib$es6$promise$$internal$$tryThen(then, value, fulfillmentHandler, rejectionHandler) {
      try {
        then.call(value, fulfillmentHandler, rejectionHandler);
      } catch(e) {
        return e;
      }
    }

    function lib$es6$promise$$internal$$handleForeignThenable(promise, thenable, then) {
       lib$es6$promise$asap$$asap(function(promise) {
        var sealed = false;
        var error = lib$es6$promise$$internal$$tryThen(then, thenable, function(value) {
          if (sealed) { return; }
          sealed = true;
          if (thenable !== value) {
            lib$es6$promise$$internal$$resolve(promise, value);
          } else {
            lib$es6$promise$$internal$$fulfill(promise, value);
          }
        }, function(reason) {
          if (sealed) { return; }
          sealed = true;

          lib$es6$promise$$internal$$reject(promise, reason);
        }, 'Settle: ' + (promise._label || ' unknown promise'));

        if (!sealed && error) {
          sealed = true;
          lib$es6$promise$$internal$$reject(promise, error);
        }
      }, promise);
    }

    function lib$es6$promise$$internal$$handleOwnThenable(promise, thenable) {
      if (thenable._state === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, thenable._result);
      } else if (thenable._state === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, thenable._result);
      } else {
        lib$es6$promise$$internal$$subscribe(thenable, undefined, function(value) {
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      }
    }

    function lib$es6$promise$$internal$$handleMaybeThenable(promise, maybeThenable) {
      if (maybeThenable.constructor === promise.constructor) {
        lib$es6$promise$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        var then = lib$es6$promise$$internal$$getThen(maybeThenable);

        if (then === lib$es6$promise$$internal$$GET_THEN_ERROR) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$GET_THEN_ERROR.error);
        } else if (then === undefined) {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        } else if (lib$es6$promise$utils$$isFunction(then)) {
          lib$es6$promise$$internal$$handleForeignThenable(promise, maybeThenable, then);
        } else {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        }
      }
    }

    function lib$es6$promise$$internal$$resolve(promise, value) {
      if (promise === value) {
        lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$selfFulfillment());
      } else if (lib$es6$promise$utils$$objectOrFunction(value)) {
        lib$es6$promise$$internal$$handleMaybeThenable(promise, value);
      } else {
        lib$es6$promise$$internal$$fulfill(promise, value);
      }
    }

    function lib$es6$promise$$internal$$publishRejection(promise) {
      if (promise._onerror) {
        promise._onerror(promise._result);
      }

      lib$es6$promise$$internal$$publish(promise);
    }

    function lib$es6$promise$$internal$$fulfill(promise, value) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }

      promise._result = value;
      promise._state = lib$es6$promise$$internal$$FULFILLED;

      if (promise._subscribers.length !== 0) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, promise);
      }
    }

    function lib$es6$promise$$internal$$reject(promise, reason) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }
      promise._state = lib$es6$promise$$internal$$REJECTED;
      promise._result = reason;

      lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publishRejection, promise);
    }

    function lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection) {
      var subscribers = parent._subscribers;
      var length = subscribers.length;

      parent._onerror = null;

      subscribers[length] = child;
      subscribers[length + lib$es6$promise$$internal$$FULFILLED] = onFulfillment;
      subscribers[length + lib$es6$promise$$internal$$REJECTED]  = onRejection;

      if (length === 0 && parent._state) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, parent);
      }
    }

    function lib$es6$promise$$internal$$publish(promise) {
      var subscribers = promise._subscribers;
      var settled = promise._state;

      if (subscribers.length === 0) { return; }

      var child, callback, detail = promise._result;

      for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];

        if (child) {
          lib$es6$promise$$internal$$invokeCallback(settled, child, callback, detail);
        } else {
          callback(detail);
        }
      }

      promise._subscribers.length = 0;
    }

    function lib$es6$promise$$internal$$ErrorObject() {
      this.error = null;
    }

    var lib$es6$promise$$internal$$TRY_CATCH_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$tryCatch(callback, detail) {
      try {
        return callback(detail);
      } catch(e) {
        lib$es6$promise$$internal$$TRY_CATCH_ERROR.error = e;
        return lib$es6$promise$$internal$$TRY_CATCH_ERROR;
      }
    }

    function lib$es6$promise$$internal$$invokeCallback(settled, promise, callback, detail) {
      var hasCallback = lib$es6$promise$utils$$isFunction(callback),
          value, error, succeeded, failed;

      if (hasCallback) {
        value = lib$es6$promise$$internal$$tryCatch(callback, detail);

        if (value === lib$es6$promise$$internal$$TRY_CATCH_ERROR) {
          failed = true;
          error = value.error;
          value = null;
        } else {
          succeeded = true;
        }

        if (promise === value) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$cannotReturnOwn());
          return;
        }

      } else {
        value = detail;
        succeeded = true;
      }

      if (promise._state !== lib$es6$promise$$internal$$PENDING) {
        // noop
      } else if (hasCallback && succeeded) {
        lib$es6$promise$$internal$$resolve(promise, value);
      } else if (failed) {
        lib$es6$promise$$internal$$reject(promise, error);
      } else if (settled === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, value);
      } else if (settled === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, value);
      }
    }

    function lib$es6$promise$$internal$$initializePromise(promise, resolver) {
      try {
        resolver(function resolvePromise(value){
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function rejectPromise(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      } catch(e) {
        lib$es6$promise$$internal$$reject(promise, e);
      }
    }

    function lib$es6$promise$enumerator$$Enumerator(Constructor, input) {
      var enumerator = this;

      enumerator._instanceConstructor = Constructor;
      enumerator.promise = new Constructor(lib$es6$promise$$internal$$noop);

      if (enumerator._validateInput(input)) {
        enumerator._input     = input;
        enumerator.length     = input.length;
        enumerator._remaining = input.length;

        enumerator._init();

        if (enumerator.length === 0) {
          lib$es6$promise$$internal$$fulfill(enumerator.promise, enumerator._result);
        } else {
          enumerator.length = enumerator.length || 0;
          enumerator._enumerate();
          if (enumerator._remaining === 0) {
            lib$es6$promise$$internal$$fulfill(enumerator.promise, enumerator._result);
          }
        }
      } else {
        lib$es6$promise$$internal$$reject(enumerator.promise, enumerator._validationError());
      }
    }

    lib$es6$promise$enumerator$$Enumerator.prototype._validateInput = function(input) {
      return lib$es6$promise$utils$$isArray(input);
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._validationError = function() {
      return new Error('Array Methods must be provided an Array');
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._init = function() {
      this._result = new Array(this.length);
    };

    var lib$es6$promise$enumerator$$default = lib$es6$promise$enumerator$$Enumerator;

    lib$es6$promise$enumerator$$Enumerator.prototype._enumerate = function() {
      var enumerator = this;

      var length  = enumerator.length;
      var promise = enumerator.promise;
      var input   = enumerator._input;

      for (var i = 0; promise._state === lib$es6$promise$$internal$$PENDING && i < length; i++) {
        enumerator._eachEntry(input[i], i);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var enumerator = this;
      var c = enumerator._instanceConstructor;

      if (lib$es6$promise$utils$$isMaybeThenable(entry)) {
        if (entry.constructor === c && entry._state !== lib$es6$promise$$internal$$PENDING) {
          entry._onerror = null;
          enumerator._settledAt(entry._state, i, entry._result);
        } else {
          enumerator._willSettleAt(c.resolve(entry), i);
        }
      } else {
        enumerator._remaining--;
        enumerator._result[i] = entry;
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var enumerator = this;
      var promise = enumerator.promise;

      if (promise._state === lib$es6$promise$$internal$$PENDING) {
        enumerator._remaining--;

        if (state === lib$es6$promise$$internal$$REJECTED) {
          lib$es6$promise$$internal$$reject(promise, value);
        } else {
          enumerator._result[i] = value;
        }
      }

      if (enumerator._remaining === 0) {
        lib$es6$promise$$internal$$fulfill(promise, enumerator._result);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._willSettleAt = function(promise, i) {
      var enumerator = this;

      lib$es6$promise$$internal$$subscribe(promise, undefined, function(value) {
        enumerator._settledAt(lib$es6$promise$$internal$$FULFILLED, i, value);
      }, function(reason) {
        enumerator._settledAt(lib$es6$promise$$internal$$REJECTED, i, reason);
      });
    };
    function lib$es6$promise$promise$all$$all(entries) {
      return new lib$es6$promise$enumerator$$default(this, entries).promise;
    }
    var lib$es6$promise$promise$all$$default = lib$es6$promise$promise$all$$all;
    function lib$es6$promise$promise$race$$race(entries) {
      /*jshint validthis:true */
      var Constructor = this;

      var promise = new Constructor(lib$es6$promise$$internal$$noop);

      if (!lib$es6$promise$utils$$isArray(entries)) {
        lib$es6$promise$$internal$$reject(promise, new TypeError('You must pass an array to race.'));
        return promise;
      }

      var length = entries.length;

      function onFulfillment(value) {
        lib$es6$promise$$internal$$resolve(promise, value);
      }

      function onRejection(reason) {
        lib$es6$promise$$internal$$reject(promise, reason);
      }

      for (var i = 0; promise._state === lib$es6$promise$$internal$$PENDING && i < length; i++) {
        lib$es6$promise$$internal$$subscribe(Constructor.resolve(entries[i]), undefined, onFulfillment, onRejection);
      }

      return promise;
    }
    var lib$es6$promise$promise$race$$default = lib$es6$promise$promise$race$$race;
    function lib$es6$promise$promise$resolve$$resolve(object) {
      /*jshint validthis:true */
      var Constructor = this;

      if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
      }

      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$resolve(promise, object);
      return promise;
    }
    var lib$es6$promise$promise$resolve$$default = lib$es6$promise$promise$resolve$$resolve;
    function lib$es6$promise$promise$reject$$reject(reason) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$reject(promise, reason);
      return promise;
    }
    var lib$es6$promise$promise$reject$$default = lib$es6$promise$promise$reject$$reject;

    var lib$es6$promise$promise$$counter = 0;

    function lib$es6$promise$promise$$needsResolver() {
      throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
    }

    function lib$es6$promise$promise$$needsNew() {
      throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
    }

    var lib$es6$promise$promise$$default = lib$es6$promise$promise$$Promise;
    /**
      Promise objects represent the eventual result of an asynchronous operation. The
      primary way of interacting with a promise is through its `then` method, which
      registers callbacks to receive either a promise's eventual value or the reason
      why the promise cannot be fulfilled.

      Terminology
      -----------

      - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
      - `thenable` is an object or function that defines a `then` method.
      - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
      - `exception` is a value that is thrown using the throw statement.
      - `reason` is a value that indicates why a promise was rejected.
      - `settled` the final resting state of a promise, fulfilled or rejected.

      A promise can be in one of three states: pending, fulfilled, or rejected.

      Promises that are fulfilled have a fulfillment value and are in the fulfilled
      state.  Promises that are rejected have a rejection reason and are in the
      rejected state.  A fulfillment value is never a thenable.

      Promises can also be said to *resolve* a value.  If this value is also a
      promise, then the original promise's settled state will match the value's
      settled state.  So a promise that *resolves* a promise that rejects will
      itself reject, and a promise that *resolves* a promise that fulfills will
      itself fulfill.


      Basic Usage:
      ------------

      ```js
      var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

      promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Advanced Usage:
      ---------------

      Promises shine when abstracting away asynchronous interactions such as
      `XMLHttpRequest`s.

      ```js
      function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

      getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Unlike callbacks, promises are great composable primitives.

      ```js
      Promise.all([
        getJSON('/posts'),
        getJSON('/comments')
      ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
      ```

      @class Promise
      @param {function} resolver
      Useful for tooling.
      @constructor
    */
    function lib$es6$promise$promise$$Promise(resolver) {
      this._id = lib$es6$promise$promise$$counter++;
      this._state = undefined;
      this._result = undefined;
      this._subscribers = [];

      if (lib$es6$promise$$internal$$noop !== resolver) {
        if (!lib$es6$promise$utils$$isFunction(resolver)) {
          lib$es6$promise$promise$$needsResolver();
        }

        if (!(this instanceof lib$es6$promise$promise$$Promise)) {
          lib$es6$promise$promise$$needsNew();
        }

        lib$es6$promise$$internal$$initializePromise(this, resolver);
      }
    }

    lib$es6$promise$promise$$Promise.all = lib$es6$promise$promise$all$$default;
    lib$es6$promise$promise$$Promise.race = lib$es6$promise$promise$race$$default;
    lib$es6$promise$promise$$Promise.resolve = lib$es6$promise$promise$resolve$$default;
    lib$es6$promise$promise$$Promise.reject = lib$es6$promise$promise$reject$$default;
    lib$es6$promise$promise$$Promise._setScheduler = lib$es6$promise$asap$$setScheduler;
    lib$es6$promise$promise$$Promise._setAsap = lib$es6$promise$asap$$setAsap;
    lib$es6$promise$promise$$Promise._asap = lib$es6$promise$asap$$asap;

    lib$es6$promise$promise$$Promise.prototype = {
      constructor: lib$es6$promise$promise$$Promise,

    /**
      The primary way of interacting with a promise is through its `then` method,
      which registers callbacks to receive either a promise's eventual value or the
      reason why the promise cannot be fulfilled.

      ```js
      findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
      ```

      Chaining
      --------

      The return value of `then` is itself a promise.  This second, 'downstream'
      promise is resolved with the return value of the first promise's fulfillment
      or rejection handler, or rejected if the handler throws an exception.

      ```js
      findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

      findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
      ```
      If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

      ```js
      findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
      ```

      Assimilation
      ------------

      Sometimes the value you want to propagate to a downstream promise can only be
      retrieved asynchronously. This can be achieved by returning a promise in the
      fulfillment or rejection handler. The downstream promise will then be pending
      until the returned promise is settled. This is called *assimilation*.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
      ```

      If the assimliated promise rejects, then the downstream promise will also reject.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
      ```

      Simple Example
      --------------

      Synchronous Example

      ```javascript
      var result;

      try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js
      findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
      ```

      Advanced Example
      --------------

      Synchronous Example

      ```javascript
      var author, books;

      try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js

      function foundBooks(books) {

      }

      function failure(reason) {

      }

      findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findAuthor().
        then(findBooksByAuthor).
        then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
      ```

      @method then
      @param {Function} onFulfilled
      @param {Function} onRejected
      Useful for tooling.
      @return {Promise}
    */
      then: function(onFulfillment, onRejection) {
        var parent = this;
        var state = parent._state;

        if (state === lib$es6$promise$$internal$$FULFILLED && !onFulfillment || state === lib$es6$promise$$internal$$REJECTED && !onRejection) {
          return this;
        }

        var child = new this.constructor(lib$es6$promise$$internal$$noop);
        var result = parent._result;

        if (state) {
          var callback = arguments[state - 1];
          lib$es6$promise$asap$$asap(function(){
            lib$es6$promise$$internal$$invokeCallback(state, child, callback, result);
          });
        } else {
          lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection);
        }

        return child;
      },

    /**
      `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
      as the catch block of a try/catch statement.

      ```js
      function findAuthor(){
        throw new Error('couldn't find that author');
      }

      // synchronous
      try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

      // async with promises
      findAuthor().catch(function(reason){
        // something went wrong
      });
      ```

      @method catch
      @param {Function} onRejection
      Useful for tooling.
      @return {Promise}
    */
      'catch': function(onRejection) {
        return this.then(null, onRejection);
      }
    };
    function lib$es6$promise$polyfill$$polyfill() {
      var local;

      if (typeof global !== 'undefined') {
          local = global;
      } else if (typeof self !== 'undefined') {
          local = self;
      } else {
          try {
              local = Function('return this')();
          } catch (e) {
              throw new Error('polyfill failed because global object is unavailable in this environment');
          }
      }

      var P = local.Promise;

      if (P && Object.prototype.toString.call(P.resolve()) === '[object Promise]' && !P.cast) {
        return;
      }

      local.Promise = lib$es6$promise$promise$$default;
    }
    var lib$es6$promise$polyfill$$default = lib$es6$promise$polyfill$$polyfill;

    var lib$es6$promise$umd$$ES6Promise = {
      'Promise': lib$es6$promise$promise$$default,
      'polyfill': lib$es6$promise$polyfill$$default
    };

    /* global define:true module:true window: true */
    if (typeof define === 'function' && define['amd']) {
      define(function() { return lib$es6$promise$umd$$ES6Promise; });
    } else if (typeof module !== 'undefined' && module['exports']) {
      module['exports'] = lib$es6$promise$umd$$ES6Promise;
    } else if (typeof this !== 'undefined') {
      this['ES6Promise'] = lib$es6$promise$umd$$ES6Promise;
    }

    lib$es6$promise$polyfill$$default();
}).call(this);


}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":3}],5:[function(require,module,exports){
// Add Angular integrations if Angular is available
'use strict';

if (typeof angular === 'object' && angular.module) {
  angular.module('ionic.service.core', [])

  /**
   * @private
   * Provides a safe interface to store objects in persistent memory
   */
  .provider('persistentStorage', function () {
    return {
      '$get': [function () {
        var storage = Ionic.getService('Storage');
        if (!storage) {
          storage = new Ionic.IO.Storage();
          Ionic.addService('Storage', storage, true);
        }
        return storage;
      }]
    };
  }).factory('$ionicCoreSettings', [function () {
    return new Ionic.IO.Settings();
  }]).factory('$ionicUser', [function () {
    return Ionic.User;
  }]).run([function () {
    Ionic.io();
  }]);
}

},{}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _logger = require("./logger");

var privateData = {};

function privateVar(key) {
  return privateData[key] || null;
}

var App = (function () {
  function App(appId, apiKey) {
    _classCallCheck(this, App);

    this.logger = new _logger.Logger({
      'prefix': 'Ionic App:'
    });
    if (!appId || appId === '') {
      this.logger.info('No app_id was provided');
      return false;
    }

    if (!apiKey || apiKey === '') {
      this.logger.info('No api_key was provided');
      return false;
    }

    privateData.id = appId;
    privateData.apiKey = apiKey;

    // other config value reference
    this.devPush = null;
    this.gcmKey = null;
  }

  _createClass(App, [{
    key: 'toString',
    value: function toString() {
      return '<IonicApp [\'' + this.id + '\'>';
    }
  }, {
    key: 'id',
    get: function get() {
      return privateVar('id');
    }
  }, {
    key: 'apiKey',
    get: function get() {
      return privateVar('apiKey');
    }
  }]);

  return App;
})();

exports.App = App;

},{"./logger":10}],7:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _events = require("./events");

var _storage = require("./storage");

var _logger = require("./logger");

var IonicPlatform = (function () {
  function IonicPlatform() {
    _classCallCheck(this, IonicPlatform);

    var self = this;
    this.logger = new _logger.Logger({
      'prefix': 'Ionic Core:'
    });
    this.logger.info('init');
    this._pluginsReady = false;
    this.emitter = IonicPlatform.getEmitter();

    try {
      document.addEventListener("deviceready", function () {
        self.logger.info('plugins are ready');
        self._pluginsReady = true;
        self.emitter.emit('ionic_core:plugins_ready');
      }, false);
    } catch (e) {
      self.logger.info('unable to listen for cordova plugins to be ready');
    }

    this._bootstrap();
  }

  _createClass(IonicPlatform, [{
    key: "_isCordovaAvailable",
    value: function _isCordovaAvailable() {
      var self = this;
      this.logger.info('searching for cordova.js');

      if (typeof cordova !== 'undefined') {
        this.logger.info('cordova.js has already been loaded');
        return true;
      }

      var scripts = document.getElementsByTagName('script');
      var len = scripts.length;
      for (var i = 0; i < len; i++) {
        var script = scripts[i].getAttribute('src');
        if (script) {
          var parts = script.split('/');
          var partsLength = 0;
          try {
            partsLength = parts.length;
            if (parts[partsLength - 1] === 'cordova.js') {
              self.logger.info('cordova.js has previously been included.');
              return true;
            }
          } catch (e) {
            self.logger.info('encountered error while testing for cordova.js presence, ' + e.toString());
          }
        }
      }

      return false;
    }
  }, {
    key: "loadCordova",
    value: function loadCordova() {
      var self = this;
      if (!this._isCordovaAvailable()) {
        var cordovaScript = document.createElement('script');
        var cordovaSrc = 'cordova.js';
        switch (IonicPlatform.getDeviceTypeByNavigator()) {
          case 'android':
            if (window.location.href.substring(0, 4) === "file") {
              cordovaSrc = 'file:///android_asset/www/cordova.js';
            }
            break;

          case 'ipad':
          case 'iphone':
            try {
              var resource = window.location.search.match(/cordova_js_bootstrap_resource=(.*?)(&|#|$)/i);
              if (resource) {
                cordovaSrc = decodeURI(resource[1]);
              }
            } catch (e) {
              self.logger.info('could not find cordova_js_bootstrap_resource query param');
              self.logger.info(e);
            }
            break;

          case 'unknown':
            return false;

          default:
            break;
        }
        cordovaScript.setAttribute('src', cordovaSrc);
        document.head.appendChild(cordovaScript);
        self.logger.info('injecting cordova.js');
      }
    }

    /**
     * Determine the device type via the user agent string
     * @return {string} name of device platform or "unknown" if unable to identify the device
     */
  }, {
    key: "_bootstrap",

    /**
     * Bootstrap Ionic Core
     *
     * Handles the cordova.js bootstrap
     * @return {void}
     */
    value: function _bootstrap() {
      this.loadCordova();
    }
  }, {
    key: "onReady",

    /**
     * Fire a callback when core + plugins are ready. This will fire immediately if
     * the components have already become available.
     *
     * @param {function} callback function to fire off
     * @return {void}
     */
    value: function onReady(callback) {
      var self = this;
      if (this._pluginsReady) {
        callback(self);
      } else {
        self.emitter.on('ionic_core:plugins_ready', function () {
          callback(self);
        });
      }
    }
  }], [{
    key: "getEmitter",
    value: function getEmitter() {
      return _events.EventEmitter;
    }
  }, {
    key: "getStorage",
    value: function getStorage() {
      return _storage.Storage;
    }
  }, {
    key: "getDeviceTypeByNavigator",
    value: function getDeviceTypeByNavigator() {
      var agent = navigator.userAgent;

      var ipad = agent.match(/iPad/i);
      if (ipad && ipad[0].toLowerCase() === 'ipad') {
        return 'ipad';
      }

      var iphone = agent.match(/iPhone/i);
      if (iphone && iphone[0].toLowerCase() === 'iphone') {
        return 'iphone';
      }

      var android = agent.match(/Android/i);
      if (android && android[0].toLowerCase() === 'android') {
        return 'android';
      }

      return "unknown";
    }

    /**
     * Check if the device is an Android device
     * @return {boolean} True if Android, false otherwise
     */
  }, {
    key: "isAndroidDevice",
    value: function isAndroidDevice() {
      var device = IonicPlatform.getDeviceTypeByNavigator();
      if (device === 'android') {
        return true;
      }
      return false;
    }

    /**
     * Check if the device is an iOS device
     * @return {boolean} True if iOS, false otherwise
     */
  }, {
    key: "isIOSDevice",
    value: function isIOSDevice() {
      var device = IonicPlatform.getDeviceTypeByNavigator();
      if (device === 'iphone' || device === 'ipad') {
        return true;
      }
      return false;
    }
  }, {
    key: "deviceConnectedToNetwork",
    value: function deviceConnectedToNetwork(strictMode) {
      if (typeof strictMode === 'undefined') {
        strictMode = false;
      }

      if (typeof navigator.connection === 'undefined' || typeof navigator.connection.type === 'undefined' || typeof Connection === 'undefined') {
        if (!strictMode) {
          return true;
        }
        return false;
      }

      switch (navigator.connection.type) {
        case Connection.ETHERNET:
        case Connection.WIFI:
        case Connection.CELL_2G:
        case Connection.CELL_3G:
        case Connection.CELL_4G:
        case Connection.CELL:
          return true;

        default:
          return false;
      }
    }
  }, {
    key: "Version",
    get: function get() {
      return '0.1.0';
    }
  }]);

  return IonicPlatform;
})();

exports.IonicPlatform = IonicPlatform;

},{"./events":9,"./logger":10,"./storage":14}],8:[function(require,module,exports){
"use strict";

var _app = require("./app");

var _core = require("./core");

var _events = require("./events");

var _logger = require("./logger");

var _promise = require("./promise");

var _request = require("./request");

var _settings = require("./settings");

var _storage = require("./storage");

var _user = require("./user");

// Declare the window object
window.Ionic = window.Ionic || {};

// Ionic Namespace
Ionic.Core = _core.IonicPlatform;
Ionic.User = _user.User;

// IO Namespace
Ionic.IO = {};
Ionic.IO.App = _app.App;
Ionic.IO.EventEmitter = _events.EventEmitter;
Ionic.IO.Logger = _logger.Logger;
Ionic.IO.Promise = _promise.Promise;
Ionic.IO.DeferredPromise = _promise.DeferredPromise;
Ionic.IO.Request = _request.Request;
Ionic.IO.Response = _request.Response;
Ionic.IO.APIRequest = _request.APIRequest;
Ionic.IO.APIResponse = _request.APIResponse;
Ionic.IO.Storage = _storage.Storage;
Ionic.IO.Settings = _settings.Settings;

// Provider a single storage for services that have previously been registered
var serviceStorage = {};

Ionic.io = function () {
  if (typeof Ionic.IO.main === 'undefined') {
    Ionic.IO.main = new Ionic.Core();
  }
  return Ionic.IO.main;
};

Ionic.getService = function (name) {
  if (typeof serviceStorage[name] === 'undefined' || !serviceStorage[name]) {
    return false;
  }
  return serviceStorage[name];
};

Ionic.addService = function (name, service, force) {
  if (service && typeof serviceStorage[name] === 'undefined') {
    serviceStorage[name] = service;
  } else if (service && force) {
    serviceStorage[name] = service;
  }
};

Ionic.removeService = function (name) {
  if (typeof serviceStorage[name] !== 'undefined') {
    delete serviceStorage[name];
  }
};

},{"./app":6,"./core":7,"./events":9,"./logger":10,"./promise":11,"./request":12,"./settings":13,"./storage":14,"./user":15}],9:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _EventEmitter = require("events");

var EventEmitter = (function () {
  function EventEmitter() {
    _classCallCheck(this, EventEmitter);

    this._emitter = new _EventEmitter();
  }

  _createClass(EventEmitter, [{
    key: "on",
    value: function on(event, callback) {
      return this._emitter.on(event, callback);
    }
  }, {
    key: "emit",
    value: function emit(label, data) {
      return this._emitter.emit(label, data);
    }
  }]);

  return EventEmitter;
})();

exports.EventEmitter = EventEmitter;

},{"events":2}],10:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Logger = (function () {
  function Logger(opts) {
    _classCallCheck(this, Logger);

    var options = opts || {};
    this._silence = false;
    this._prefix = false;
    this._options = options;
    this._bootstrap();
  }

  _createClass(Logger, [{
    key: "_bootstrap",
    value: function _bootstrap() {
      if (this._options.prefix) {
        this._prefix = this._options.prefix;
      }
    }
  }, {
    key: "info",
    value: function info(data) {
      if (!this._silence) {
        if (this._prefix) {
          console.log(this._prefix, data);
        } else {
          console.log(data);
        }
      }
    }
  }, {
    key: "error",
    value: function error(data) {
      if (this._prefix) {
        console.error(this._prefix, data);
      } else {
        console.error(data);
      }
    }
  }]);

  return Logger;
})();

exports.Logger = Logger;

},{}],11:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ES6Promise = require("es6-promise").Promise;

var Promise = ES6Promise;

exports.Promise = Promise;

var DeferredPromise = (function () {
  function DeferredPromise() {
    _classCallCheck(this, DeferredPromise);

    var self = this;
    this._update = false;
    this.promise = new ES6Promise(function (resolve, reject) {
      self.resolve = resolve;
      self.reject = reject;
    });
    var originalThen = this.promise.then;
    this.promise.then = function (ok, fail, update) {
      self._update = update;
      return originalThen.call(self.promise, ok, fail);
    };
  }

  _createClass(DeferredPromise, [{
    key: "notify",
    value: function notify(value) {
      if (this._update && typeof this._update === 'function') {
        this._update(value);
      }
    }
  }]);

  return DeferredPromise;
})();

exports.DeferredPromise = DeferredPromise;

},{"es6-promise":4}],12:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _promise = require("./promise");

var request = require("browser-request");

var Request = function Request() {
  _classCallCheck(this, Request);
};

exports.Request = Request;

var Response = function Response() {
  _classCallCheck(this, Response);
};

exports.Response = Response;

var APIResponse = (function (_Response) {
  _inherits(APIResponse, _Response);

  function APIResponse() {
    _classCallCheck(this, APIResponse);

    _get(Object.getPrototypeOf(APIResponse.prototype), "constructor", this).call(this);
  }

  return APIResponse;
})(Response);

exports.APIResponse = APIResponse;

var APIRequest = (function (_Request) {
  _inherits(APIRequest, _Request);

  function APIRequest(options) {
    _classCallCheck(this, APIRequest);

    _get(Object.getPrototypeOf(APIRequest.prototype), "constructor", this).call(this);
    var requestInfo = {};
    var p = new _promise.Promise(function (resolve, reject) {
      request(options, function (err, response, result) {
        requestInfo._lastError = err;
        requestInfo._lastResponse = response;
        requestInfo._lastResult = result;
        if (err) {
          reject(err);
        } else {
          if (response.statusCode < 200 || response.statusCode >= 400) {
            var _err = new Error("Request Failed with status code of " + response.statusCode);
            reject(_err);
          } else {
            resolve({ 'response': response, 'payload': result });
          }
        }
      });
    });
    p.requestInfo = requestInfo;
    return p;
  }

  return APIRequest;
})(Request);

exports.APIRequest = APIRequest;

},{"./promise":11,"browser-request":1}],13:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var BaseSettings = (function () {
  function BaseSettings() {
    _classCallCheck(this, BaseSettings);

    this._settings = null;
    return this;
  }

  _createClass(BaseSettings, [{
    key: 'factory',
    value: function factory(name, func) {
      this._settings = func();
      return this;
    }
  }, {
    key: 'get',
    value: function get(name) {
      return this._settings.get(name);
    }
  }, {
    key: 'finish',
    value: function finish() {
      return this;
    }
  }]);

  return BaseSettings;
})();

var temp = new BaseSettings().factory('$ionicCoreSettings', function () {
  'IONIC_SETTINGS_STRING';
}).finish();

var Settings = (function () {
  function Settings() {
    _classCallCheck(this, Settings);

    this._locations = {
      'api': 'https://apps.ionic.io',
      'push': 'https://push.ionic.io',
      'analytics': 'https://analytics.ionic.io'
    };
    this._devLocations = this.get('dev_locations');
    if (!this._devLocations) {
      this._devLocations = {};
    }
  }

  _createClass(Settings, [{
    key: 'get',
    value: function get(name) {
      return temp.get(name);
    }
  }, {
    key: 'getURL',
    value: function getURL(name) {
      if (this._devLocations[name]) {
        return this._devLocations[name];
      } else if (this._locations[name]) {
        return this._locations[name];
      } else {
        return null;
      }
    }
  }]);

  return Settings;
})();

exports.Settings = Settings;

},{}],14:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _promise = require("./promise");

var PlatformLocalStorageStrategy = (function () {
  function PlatformLocalStorageStrategy() {
    _classCallCheck(this, PlatformLocalStorageStrategy);
  }

  _createClass(PlatformLocalStorageStrategy, [{
    key: 'get',
    value: function get(key) {
      return window.localStorage.getItem(key);
    }
  }, {
    key: 'remove',
    value: function remove(key) {
      return window.localStorage.removeItem(key);
    }
  }, {
    key: 'set',
    value: function set(key, value) {
      return window.localStorage.setItem(key, value);
    }
  }]);

  return PlatformLocalStorageStrategy;
})();

var objectCache = {};
var memoryLocks = {};

var Storage = (function () {
  function Storage() {
    _classCallCheck(this, Storage);

    this.strategy = new PlatformLocalStorageStrategy();
  }

  /**
   * Stores an object in local storage under the given key
   * @param {string} key Name of the key to store values in
   * @param {object} object The object to store with the key
   * @return {void}
   */

  _createClass(Storage, [{
    key: 'storeObject',
    value: function storeObject(key, object) {
      // Convert object to JSON and store in localStorage
      var json = JSON.stringify(object);
      this.strategy.set(key, json);

      // Then store it in the object cache
      objectCache[key] = object;
    }

    /**
     * Either retrieves the cached copy of an object,
     * or the object itself from localStorage.
     * @param {string} key The name of the key to pull from
     * @return {mixed} Returns the previously stored Object or null
     */
  }, {
    key: 'retrieveObject',
    value: function retrieveObject(key) {
      // First check to see if it's the object cache
      var cached = objectCache[key];
      if (cached) {
        return cached;
      }

      // Deserialize the object from JSON
      var json = this.strategy.get(key);

      // null or undefined --> return null.
      if (json === null) {
        return null;
      }

      try {
        return JSON.parse(json);
      } catch (err) {
        return null;
      }
    }

    /**
     * Locks the async call represented by the given promise and lock key.
     * Only one asyncFunction given by the lockKey can be running at any time.
     *
     * @param {string} lockKey should be a string representing the name of this async call.
     *        This is required for persistence.
     * @param {function} asyncFunction Returns a promise of the async call.
     * @returns {Promise} A new promise, identical to the one returned by asyncFunction,
     *          but with two new errors: 'in_progress', and 'last_call_interrupted'.
     */
  }, {
    key: 'lockedAsyncCall',
    value: function lockedAsyncCall(lockKey, asyncFunction) {

      var self = this;
      var deferred = new _promise.DeferredPromise();

      // If the memory lock is set, error out.
      if (memoryLocks[lockKey]) {
        deferred.reject('in_progress');
        return deferred.promise;
      }

      // If there is a stored lock but no memory lock, flag a persistence error
      if (this.strategy.get(lockKey) === 'locked') {
        deferred.reject('last_call_interrupted');
        deferred.promise.then(null, function () {
          self.strategy.remove(lockKey);
        });
        return deferred.promise;
      }

      // Set stored and memory locks
      memoryLocks[lockKey] = true;
      self.strategy.set(lockKey, 'locked');

      // Perform the async operation
      asyncFunction().then(function (successData) {
        deferred.resolve(successData);

        // Remove stored and memory locks
        delete memoryLocks[lockKey];
        self.strategy.remove(lockKey);
      }, function (errorData) {
        deferred.reject(errorData);

        // Remove stored and memory locks
        delete memoryLocks[lockKey];
        self.strategy.remove(lockKey);
      }, function (notifyData) {
        deferred.notify(notifyData);
      });

      return deferred.promise;
    }
  }]);

  return Storage;
})();

exports.Storage = Storage;

},{"./promise":11}],15:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _request = require("./request");

var _promise = require("./promise");

var _settings = require("./settings");

var _core = require("./core");

var _storage = require("./storage");

var _logger = require("./logger");

var _pushPushToken = require("../push/push-token");

var Core = _core.IonicPlatform;
var AppUserContext = null;
var settings = new _settings.Settings();
var storage = new _storage.Storage();

var userAPIBase = settings.getURL('api') + '/api/v1/app/' + settings.get('app_id') + '/users';
var userAPIEndpoints = {
  'load': function load(userModel) {
    return userAPIBase + '/' + userModel.id;
  },
  'remove': function remove(userModel) {
    return userAPIBase + '/' + userModel.id;
  },
  'save': function save() {
    return userAPIBase + '/identify';
  },
  'addToken': function addToken() {
    return userAPIBase + '/pushUnique';
  }
};

var UserContext = (function () {
  function UserContext() {
    _classCallCheck(this, UserContext);
  }

  _createClass(UserContext, null, [{
    key: "store",
    value: function store() {
      storage.storeObject(UserContext.label, User.current());
    }
  }, {
    key: "getRawData",
    value: function getRawData() {
      return storage.retrieveObject(UserContext.label) || false;
    }
  }, {
    key: "load",
    value: function load() {
      var data = storage.retrieveObject(UserContext.label) || false;
      if (data) {
        return User.fromContext(data);
      }
      return false;
    }
  }, {
    key: "label",
    get: function get() {
      return "ionic_io_user_" + settings.get('app_id');
    }
  }]);

  return UserContext;
})();

var PushData = (function () {

  /**
   * Push Data Object
   *
   * Holds push data to use in conjunction with Ionic User models.
   * @constructor
   * @param {object} tokens Formatted token data
   */

  function PushData(tokens) {
    _classCallCheck(this, PushData);

    this.logger = new _logger.Logger({
      'prefix': 'Ionic Push Token:'
    });
    this.tokens = {
      'android': [],
      'ios': []
    };
    if (tokens && typeof tokens === 'object') {
      this.tokens = tokens;
    }
  }

  /**
   * Add a new token to the current list of tokens
   * Duplicates are not added, but still return as succesfully added.
   *
   * @param {ionic.io.push.Token} token Push Token
   * @return {boolean} False on error, otherwise true
   */

  _createClass(PushData, [{
    key: "addToken",
    value: function addToken(token) {
      var platform = null;

      if (typeof token === 'undefined' || !token || token === '') {
        this.logger.info('you need to pass a valid token to addToken()');
        return false;
      }

      if (token.token) {
        token = token.token;
      }

      if (Core.isAndroidDevice()) {
        platform = 'android';
      } else if (Core.isIOSDevice()) {
        platform = 'ios';
      }

      if (platform === null || !this.tokens.hasOwnProperty(platform)) {
        this.logger.info('cannot determine the token platform. Are you running on an Android or iOS device?');
        return false;
      }

      var platformTokens = this.tokens[platform];
      var hasToken = false;
      var testToken = null;

      for (testToken in platformTokens) {
        if (platformTokens[testToken] === token) {
          hasToken = true;
        }
      }
      if (!hasToken) {
        platformTokens.push(token);
      }

      return true;
    }

    /**
     * Remove the specified token if it exists in any platform token listing
     * If it does not exist, nothing is removed, but we will still return success
     *
     * @param {ionic.io.push.Token} token Push Token
     * @return {boolean} true
     */
  }, {
    key: "removeToken",
    value: function removeToken(token) {
      var x;
      for (x in this.tokens) {
        var platform = this.tokens[x];
        var testToken;
        for (testToken in platform) {
          if (platform[testToken] === token) {
            platform.splice(testToken, 1);
          }
        }
      }
      return true;
    }
  }]);

  return PushData;
})();

var UserData = (function () {
  function UserData(data) {
    _classCallCheck(this, UserData);

    this.data = {};
    if (typeof data === 'object') {
      this.data = data;
    }
  }

  _createClass(UserData, [{
    key: "set",
    value: function set(key, value) {
      this.data[key] = value;
    }
  }, {
    key: "unset",
    value: function unset(key) {
      delete this.data[key];
    }
  }, {
    key: "get",
    value: function get(key, defaultValue) {
      if (this.data.hasOwnProperty(key)) {
        return this.data[key];
      } else {
        return defaultValue || null;
      }
    }
  }, {
    key: "toString",
    value: function toString() {
      return JSON.stringify(this.data);
    }
  }]);

  return UserData;
})();

var User = (function () {
  function User() {
    _classCallCheck(this, User);

    this.logger = new _logger.Logger({
      'prefix': 'Ionic User:'
    });
    this._blockLoad = false;
    this._blockSave = false;
    this._blockDelete = false;
    this._dirty = false;
    this._fresh = true;
    this.push = new PushData();
    this.data = new UserData();
  }

  _createClass(User, [{
    key: "isDirty",
    value: function isDirty() {
      return this._dirty;
    }
  }, {
    key: "isFresh",
    value: function isFresh() {
      return this._fresh;
    }
  }, {
    key: "getAPIFormat",
    value: function getAPIFormat() {
      var data = this.data.data;
      data.user_id = this.id; // eslint-disable-line camelcase
      data._push = {
        'android_tokens': this.push.tokens.android,
        'ios_tokens': this.push.tokens.ios
      };
      return data;
    }
  }, {
    key: "getFormat",
    value: function getFormat(format) {
      var self = this;
      var formatted = null;
      switch (format) {
        case 'api':
          formatted = self.getAPIFormat();
          break;
      }
      return formatted;
    }
  }, {
    key: "delete",
    value: function _delete() {
      var self = this;
      var deferred = new _promise.DeferredPromise();

      if (!self.valid) {
        return false;
      }

      if (!self._blockDelete) {
        self._blockDelete = true;
        new _request.APIRequest({
          'uri': userAPIEndpoints.remove(this),
          'method': 'DELETE',
          'headers': {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }).then(function (result) {
          self._blockDelete = false;
          self.logger.info('deleted ' + self);
          deferred.resolve(result);
        }, function (error) {
          self._blockDelete = false;
          self.logger.error(error);
          deferred.reject(error);
        });
      } else {
        self.logger.info("a delete operation is already in progress for " + this + ".");
        deferred.reject(false);
      }

      return deferred.promise;
    }
  }, {
    key: "_store",
    value: function _store() {
      if (this === User.current()) {
        UserContext.store();
      }
    }
  }, {
    key: "save",
    value: function save() {
      var self = this;
      var deferred = new _promise.DeferredPromise();

      if (!self._blockSave) {
        self._blockSave = true;
        new _request.APIRequest({
          'uri': userAPIEndpoints.save(this),
          'method': 'POST',
          'headers': {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          'body': JSON.stringify(self.getFormat('api'))
        }).then(function (result) {
          self._dirty = false;
          self._fresh = false;
          self.logger.info('saved user');
          deferred.resolve(result);
        }, function (error) {
          self._dirty = true;
          self.logger.error(error);
          deferred.reject(error);
        }).then(function () {
          self._blockSave = false;
          self._store();
        });
      } else {
        self.logger.info("a save operation is already in progress for " + this + ".");
        deferred.reject(false);
      }

      return deferred.promise;
    }
  }, {
    key: "toString",
    value: function toString() {
      return '<IonicUser [\'' + this.id + '\']>';
    }
  }, {
    key: "addPushToken",
    value: function addPushToken(token) {
      return this.push.addToken(token);
    }
  }, {
    key: "removePushToken",
    value: function removePushToken(token) {
      if (!(token instanceof _pushPushToken.PushToken)) {
        token = new _pushPushToken.PushToken(token);
      }
      return this.push.removeToken(token);
    }
  }, {
    key: "set",
    value: function set(key, value) {
      return this.data.set(key, value);
    }
  }, {
    key: "get",
    value: function get(key, defaultValue) {
      return this.data.get(key, defaultValue);
    }
  }, {
    key: "remove",
    value: function remove(key) {
      return this.data.unset(key);
    }
  }, {
    key: "valid",
    get: function get() {
      if (this.id) {
        return true;
      }
      return false;
    }
  }, {
    key: "id",
    set: function set(v) {
      if (v && typeof v === 'string' && v !== '') {
        this._id = v;
        return true;
      } else {
        return false;
      }
    },
    get: function get() {
      return this._id || null;
    }
  }], [{
    key: "current",
    value: function current(user) {
      if (user) {
        AppUserContext = user;
        UserContext.store();
        return AppUserContext;
      } else {
        if (!AppUserContext) {
          AppUserContext = UserContext.load();
        }
        if (!AppUserContext) {
          AppUserContext = new User();
        }
        return AppUserContext;
      }
    }
  }, {
    key: "fromContext",
    value: function fromContext(data) {
      var user = new User();
      user.id = data._id;
      user.data = new UserData(data.data);
      user.push = new PushData(data.push.tokens);
      user._fresh = data._fresh;
      user._dirty = data._dirty;
      return user;
    }
  }, {
    key: "load",
    value: function load(id) {
      var deferred = new _promise.DeferredPromise();

      var tempUser = new User();
      tempUser.id = id;

      if (!tempUser._blockLoad) {
        tempUser._blockLoad = true;
        new _request.APIRequest({
          'uri': userAPIEndpoints.load(tempUser),
          'method': 'GET',
          'json': true,
          'headers': {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }).then(function (result) {
          tempUser._blockLoad = false;
          tempUser.logger.info('loaded user');

          // set the custom data
          tempUser.data = new UserData(result.payload.custom_data);

          // set the push tokens
          if (result.payload._push && result.payload._push.android_tokens) {
            tempUser.push.tokens.android = result.payload._push.android_tokens;
          }
          if (result.payload._push && result.payload._push.ios_tokens) {
            tempUser.push.tokens.ios = result.payload._push.ios_tokens;
          }

          tempUser.image = result.payload.image;
          tempUser._fresh = false;

          deferred.resolve(tempUser);
        }, function (error) {
          tempUser._blockLoad = false;
          tempUser.logger.error(error);
          deferred.reject(error);
        });
      } else {
        tempUser.logger.info("a load operation is already in progress for " + this + ".");
        deferred.reject(false);
      }

      return deferred.promise;
    }
  }, {
    key: "anonymousId",
    value: function anonymousId() {
      // this is not guaranteed to be unique
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0,
            v = c == 'x' ? r : r & 0x3 | 0x8; //eslint-disable-line
        return v.toString(16);
      });
    }
  }]);

  return User;
})();

exports.User = User;

},{"../push/push-token":16,"./core":7,"./logger":10,"./promise":11,"./request":12,"./settings":13,"./storage":14}],16:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var PushToken = (function () {
  function PushToken(token) {
    _classCallCheck(this, PushToken);

    this._token = token || null;
  }

  _createClass(PushToken, [{
    key: 'toString',
    value: function toString() {
      var token = this._token || 'null';
      return '<PushToken [\'' + token + '\']>';
    }
  }, {
    key: 'token',
    set: function set(value) {
      this._token = value;
    },
    get: function get() {
      return this._token;
    }
  }]);

  return PushToken;
})();

exports.PushToken = PushToken;

},{}]},{},[11,12,9,10,14,13,7,15,6,8,5]);
