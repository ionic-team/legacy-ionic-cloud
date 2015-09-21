(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
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
},{"_process":2}],4:[function(require,module,exports){
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

},{"./events":5,"./logger":6,"./storage":9}],5:[function(require,module,exports){
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

},{"events":1}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
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

},{"es6-promise":3}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
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

},{"./promise":7}],10:[function(require,module,exports){
// Add Angular integrations if Angular is available
'use strict';

if (typeof angular === 'object' && angular.module) {

  var IonicAngularDeploy = null;

  angular.module('ionic.service.deploy', []).factory('$ionicDeploy', [function () {
    if (!IonicAngularDeploy) {
      IonicAngularDeploy = new Ionic.Deploy();
    }
    return IonicAngularDeploy;
  }]);
}

},{}],11:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _coreSettings = require("../core/settings");

var _corePromise = require("../core/promise");

var _coreLogger = require("../core/logger");

var _coreCore = require("../core/core");

var settings = new _coreSettings.Settings();

var NO_PLUGIN = "IONIC_DEPLOY_MISSING_PLUGIN";
var INITIAL_DELAY = 1 * 5 * 1000;
var WATCH_INTERVAL = 1 * 60 * 1000;

var Deploy = (function () {

  /**
   * Ionic Deploy
   *
   * This is the main interface that talks with the Ionic Deploy Plugin to facilitate
   * checking, downloading, and loading an update to your app.
   *
   * Base Usage:
   *
   *    Ionic.io();
   *    var deploy = new Ionic.Deploy();
   *    deploy.check().then(null, null, function(hasUpdate) {
   *      deploy.update();
   *    });
   *
   * @constructor
   */

  function Deploy() {
    _classCallCheck(this, Deploy);

    var self = this;
    this.logger = new _coreLogger.Logger({
      'prefix': 'Ionic Deploy:'
    });
    this._plugin = false;
    this._isReady = false;
    this._channelTag = 'production';
    this._emitter = _coreCore.IonicPlatform.getEmitter();
    this.logger.info("init");
    this._emitter.on('ionic_core:ready', function () {
      self._isReady = true;
      self._emitter.emit('ionic_deploy:ready');
    });
  }

  /**
   * Fetch the Deploy Plugin
   *
   * If the plugin has not been set yet, attempt to fetch it, otherwise log
   * a message.
   *
   * @return {IonicDeploy} Returns the plugin or false
   */

  _createClass(Deploy, [{
    key: "_getPlugin",
    value: function _getPlugin() {
      if (this._plugin) {
        return this._plugin;
      }
      if (typeof IonicDeploy === 'undefined') {
        this.logger.info('plugin is not installed or has not loaded. Have you run `ionic plugin add ionic-plugin-deploy` yet?');
        return false;
      }
      this._plugin = IonicDeploy;
      return IonicDeploy;
    }

    /**
     * Initialize the Deploy Plugin
     * @return {void}
     */
  }, {
    key: "initialize",
    value: function initialize() {
      if (this._getPlugin()) {
        this._plugin.initialize(settings.get('app_id'));
      }
    }

    /**
     * Check for updates
     *
     * @return {Promise} Will resolve with true if an update is available, false otherwise. A string or
     *   error will be passed to reject() in the event of a failure.
     */
  }, {
    key: "check",
    value: function check() {
      var self = this;
      var deferred = new _corePromise.DeferredPromise();

      if (this._getPlugin()) {
        this._plugin.check(settings.get('app_id'), this._channelTag, function (result) {
          if (result && result === "true") {
            self.logger.info('an update is available');
            deferred.resolve(true);
          } else {
            self.logger.info('no updates available');
            deferred.resolve(false);
          }
        }, function (error) {
          self.logger.error('encountered an error while checking for updates');
          deferred.reject(error);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }

      return deferred.promise;
    }

    /**
     * Download and available update
     *
     * This should be used in conjunction with extract()
     * @return {Promise} The promise which will resolve with true/false or use
     *    notify to update the download progress.
     */
  }, {
    key: "download",
    value: function download() {
      var self = this;
      var deferred = new _corePromise.DeferredPromise();

      if (this._getPlugin()) {
        this._plugin.download(settings.get('app_id'), function (result) {
          if (result !== 'true' && result !== 'false') {
            deferred.notify(result);
          } else {
            if (result === 'true') {
              self.logger.info("download complete");
            }
            deferred.resolve(result === 'true');
          }
        }, function (error) {
          deferred.reject(error);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }

      return deferred.promise;
    }

    /**
     * Extract the last downloaded update
     *
     * This should be called after a download() successfully resolves.
     * @return {Promise} The promise which will resolve with true/false or use
     *                   notify to update the extraction progress.
     */
  }, {
    key: "extract",
    value: function extract() {
      var self = this;
      var deferred = new _corePromise.DeferredPromise();

      if (this._getPlugin()) {
        this._plugin.extract(settings.get('app_id'), function (result) {
          if (result !== 'done') {
            deferred.notify(result);
          } else {
            if (result === 'true') {
              self.logger.info("extraction complete");
            }
            deferred.resolve(result);
          }
        }, function (error) {
          deferred.reject(error);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }

      return deferred.promise;
    }

    /**
     * Load the latest deployed version
     * This is only necessary to call if you have manually downloaded and extracted
     * an update and wish to reload the app with the latest deploy. The latest deploy
     * will automatically be loaded when the app is started.
     *
     * @return {void}
     */
  }, {
    key: "load",
    value: function load() {
      if (this._getPlugin()) {
        this._plugin.redirect(settings.get('app_id'));
      }
    }

    /**
     * Watch constantly checks for updates, and triggers an
     * event when one is ready.
     * @param {object} options Watch configuration options
     * @return {Promise} returns a promise that will get a notify() callback when an update is available
     */
  }, {
    key: "watch",
    value: function watch(options) {
      var deferred = new _corePromise.DeferredPromise();
      var opts = options || {};
      var self = this;

      if (typeof opts.initialDelay === 'undefined') {
        opts.initialDelay = INITIAL_DELAY;
      }
      if (typeof opts.interval === 'undefined') {
        opts.interval = WATCH_INTERVAL;
      }

      function checkForUpdates() {
        self.check().then(function (hasUpdate) {
          if (hasUpdate) {
            deferred.notify(hasUpdate);
          }
        }, function (err) {
          self.logger.info('unable to check for updates, ', err);
        });

        // Check our timeout to make sure it wasn't cleared while we were waiting
        // for a server response
        if (this._checkTimeout) {
          this._checkTimeout = setTimeout(checkForUpdates.bind(self), opts.interval);
        }
      }

      // Check after an initial short deplay
      this._checkTimeout = setTimeout(checkForUpdates.bind(self), opts.initialDelay);

      return deferred.promise;
    }

    /**
     * Stop automatically looking for updates
     * @return {void}
     */
  }, {
    key: "unwatch",
    value: function unwatch() {
      clearTimeout(this._checkTimeout);
      this._checkTimeout = null;
    }

    /**
     * Information about the current deploy
     *
     * @return {Promise} The resolver will be passed an object that has key/value
     *    pairs pertaining to the currently deployed update.
     */
  }, {
    key: "info",
    value: function info() {
      var deferred = new _corePromise.DeferredPromise();

      if (this._getPlugin()) {
        this._plugin.info(settings.get('app_id'), function (result) {
          deferred.resolve(result);
        }, function (err) {
          deferred.reject(err);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }

      return deferred.promise;
    }

    /**
     * Set the deploy channel that should be checked for updatse
     * See http://docs.ionic.io/docs/deploy-channels for more information
     *
     * @param {string} channelTag The channel tag to use
     * @return {void}
     */
  }, {
    key: "setChannel",
    value: function setChannel(channelTag) {
      this._channelTag = channelTag;
    }

    /**
     * Update app with the latest deploy
     *
     * @return {Promise} A promise result
     */
  }, {
    key: "update",
    value: function update() {
      var deferred = new _corePromise.DeferredPromise();
      var self = this;

      if (this._getPlugin()) {
        // Check for updates
        self.check().then(function (result) {
          if (result === true) {
            // There are updates, download them
            var downloadProgress = 0;
            self.download().then(function (result) {
              if (!result) {
                deferred.reject("download error");
              }
              self.extract().then(function (result) {
                if (!result) {
                  deferred.reject("extraction error");
                }
                self._plugin.redirect(settings.get('app_id'));
              }, function (error) {
                deferred.reject(error);
              }, function (update) {
                var progress = downloadProgress + update / 2;
                deferred.notify(progress);
              });
            }, function (error) {
              deferred.reject(error);
            }, function (update) {
              downloadProgress = update / 2;
              deferred.notify(downloadProgress);
            });
          } else {
            deferred.resolve(false);
          }
        }, function (error) {
          deferred.reject(error);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }

      return deferred.promise;
    }

    /**
     * Fire a callback when deploy is ready. This will fire immediately if
     * deploy has already become available.
     *
     * @param {Function} callback Callback function to fire off
     * @return {void}
     */
  }, {
    key: "onReady",
    value: function onReady(callback) {
      var self = this;
      if (this._isReady) {
        callback(self);
      } else {
        self._emitter.on('ionic_deploy:ready', function () {
          callback(self);
        });
      }
    }
  }]);

  return Deploy;
})();

exports.Deploy = Deploy;

},{"../core/core":4,"../core/logger":6,"../core/promise":7,"../core/settings":8}],12:[function(require,module,exports){
"use strict";

var _deploy = require("./deploy");

// Declare the window object
window.Ionic = window.Ionic || {};

// Ionic Namespace
Ionic.Deploy = _deploy.Deploy;

},{"./deploy":11}]},{},[11,12,10]);
