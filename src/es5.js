var App = require("./../dist/es5/core/app").App;
var Auth = require("./../dist/es5/auth/auth").Auth;
var Config = require("./../dist/es5/core/config").Config;
var DataType = require("./../dist/es5/core/data-types").DataType;
var Deploy = require("./../dist/es5/deploy/deploy").Deploy;
var EventEmitter = require("./../dist/es5/core/events").EventEmitter;
var IonicPlatform = require("./../dist/es5/core/core").IonicPlatform;
var Logger = require("./../dist/es5/core/logger").Logger;
var Push = require("./../dist/es5/push/push").Push;
var PushMessage = require("./../dist/es5/push/push-message").PushMessage;
var PushToken = require("./../dist/es5/push/push-token").PushToken;
var Storage = require("./../dist/es5/core/storage").Storage;
var User = require("./../dist/es5/core/user").User;
var promise = require("./../dist/es5/core/promise");
var request = require("./../dist/es5/core/request");

// Declare the window object
window.Ionic = window.Ionic || {};

// Ionic Modules
Ionic.Core = IonicPlatform;
Ionic.User = User;
Ionic.Auth = Auth;
Ionic.Deploy = Deploy;
Ionic.Push = Push;
Ionic.PushToken = PushToken;
Ionic.PushMessage = PushMessage;

// DataType Namespace
Ionic.DataType = DataType;
Ionic.DataTypes = DataType.getMapping();

// IO Namespace
Ionic.IO = {};
Ionic.IO.App = App;
Ionic.IO.EventEmitter = EventEmitter;
Ionic.IO.Logger = Logger;
Ionic.IO.Promise = promise.Promise;
Ionic.IO.DeferredPromise = promise.DeferredPromise;
Ionic.IO.Request = request.Request;
Ionic.IO.Response = request.Response;
Ionic.IO.APIRequest = request.APIRequest;
Ionic.IO.APIResponse = request.APIResponse;
Ionic.IO.Storage = Storage;
Ionic.IO.Config = Config;

// Provider a single storage for services that have previously been registered
var serviceStorage = {};

Ionic.io = function() {
  return Ionic.Core;
};

Ionic.getService = function(name) {
  if (typeof serviceStorage[name] === 'undefined' || !serviceStorage[name]) {
    return false;
  }
  return serviceStorage[name];
};

Ionic.addService = function(name, service, force) {
  if (service && typeof serviceStorage[name] === 'undefined') {
    serviceStorage[name] = service;
  } else if (service && force) {
    serviceStorage[name] = service;
  }
};

Ionic.removeService = function(name) {
  if (typeof serviceStorage[name] !== 'undefined') {
    delete serviceStorage[name];
  }
};
