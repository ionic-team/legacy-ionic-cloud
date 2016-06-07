var Analytics = require("./../analytics/analytics").Analytics;
var App = require("./../core/app").App;
var Auth = require("./../auth/auth").Auth;
var BucketStorage = require("./../analytics/storage").BucketStorage;
var config = require("./../core/config").config;
var DOMSerializer = require("./../analytics/serializers").DOMSerializer;
var DataType = require("./../core/data-types").DataType;
var Deploy = require("./../deploy/deploy").Deploy;
var EventEmitter = require("./../core/events").EventEmitter;
var IonicPlatform = require("./../core/core").IonicPlatform;
var Logger = require("./../core/logger").Logger;
var Push = require("./../push/push").Push;
var PushMessage = require("./../push/push-message").PushMessage;
var PushToken = require("./../push/push-token").PushToken;
var Storage = require("./../core/storage").Storage;
var User = require("./../core/user").User;
var promise = require("./../core/promise");

// Declare the window object
window.Ionic = window.Ionic || {};

// Ionic Modules
Ionic.Core = IonicPlatform;
Ionic.User = User;
Ionic.Analytics = Analytics;
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
Ionic.IO.Storage = Storage;
Ionic.IO.Config = config;
Ionic.IO.Settings = function() { return config; };

// Analytic Storage Namespace
Ionic.AnalyticStorage = {};
Ionic.AnalyticStorage.BucketStorage = BucketStorage;

// Analytic Serializers Namespace
Ionic.AnalyticSerializers = {};
Ionic.AnalyticSerializers.DOMSerializer = DOMSerializer;


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
