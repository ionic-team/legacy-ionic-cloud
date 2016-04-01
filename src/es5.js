import { App } from "./../dist/es6/core/app";
import { IonicPlatform, IonicPlatformCore } from "./../dist/es6/core/core";
import { EventEmitter } from "./../dist/es6/core/events";
import { Logger } from "./../dist/es6/core/logger";
import { Promise, DeferredPromise } from "./../dist/es6/core/promise";
import { Request, Response, APIRequest, APIResponse } from "./../dist/es6/core/request";
import { Settings } from "./../dist/es6/core/settings";
import { Storage } from "./../dist/es6/core/storage";
import { User } from "./../dist/es6/core/user";
import { DataType } from "./../dist/es6/core/data-types";
import { Analytics } from "./../dist/es6/analytics/analytics";
import { BucketStorage } from "./../dist/es6/analytics/storage";
import { DOMSerializer } from "./../dist/es6/analytics/serializers";
import { Auth } from "./../dist/es6/auth/auth";
import { Deploy } from "./../dist/es6/deploy/deploy";
import { Push } from "./../dist/es6/push/push";
import { PushToken } from "./../dist/es6/push/push-token";
import { PushMessage } from "./../dist/es6/push/push-message";

// Declare the window object
window.Ionic = window.Ionic || {};

// Ionic Modules
Ionic.Core = IonicPlatform;
Ionic.Core.Version = IonicPlatformCore.Version;
Ionic.Core.getEmitter = IonicPlatformCore.getEmitter;
Ionic.Core.getStorage = IonicPlatformCore.getStorage;
Ionic.Core.getConfig = IonicPlatformCore.getConfig;
Ionic.Core.setConfig = IonicPlatformCore.setConfig;
Ionic.Core.isIOSDevice = IonicPlatformCore.isIOSDevice;
Ionic.Core.isAndroidDevice = IonicPlatformCore.isAndroidDevice;
Ionic.Core.deviceConnectedToNetwork = IonicPlatformCore.deviceConnectedToNetwork;
Ionic.Core.getDeviceTypeByNavigator = IonicPlatformCore.getDeviceTypeByNavigator;
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
Ionic.IO.Promise = Promise;
Ionic.IO.DeferredPromise = DeferredPromise;
Ionic.IO.Request = Request;
Ionic.IO.Response = Response;
Ionic.IO.APIRequest = APIRequest;
Ionic.IO.APIResponse = APIResponse;
Ionic.IO.Storage = Storage;
Ionic.IO.Settings = Settings;

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

// Kickstart Ionic Platform
Ionic.io();
