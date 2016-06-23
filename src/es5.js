var App = require("./../dist/es5/app").App;
var Core = require("./../dist/es5/core").Core;
var DataType = require("./../dist/es5/user/data-types").DataType;
var Deploy = require("./../dist/es5/deploy/deploy").Deploy;
var EventEmitter = require("./../dist/es5/events").EventEmitter;
var Logger = require("./../dist/es5/logger").Logger;
var Push = require("./../dist/es5/push/push").Push;
var PushMessage = require("./../dist/es5/push/message").PushMessage;
var PushToken = require("./../dist/es5/push/token").PushToken;
var auth = require("./../dist/es5/auth");
var client = require("./../dist/es5/client");
var config = require("./../dist/es5/config");
var cordova = require("./../dist/es5/cordova");
var device = require("./../dist/es5/device");
var di = require("./../dist/es5/di");
var promise = require("./../dist/es5/promise");
var storage = require("./../dist/es5/storage");
var user = require("./../dist/es5/user/user");

// Declare the window object
window.Ionic = new di.Container();

// Ionic Modules
Ionic.Core = Core;
Ionic.User = user.User;
Ionic.Auth = auth.Auth;
Ionic.Deploy = Deploy;
Ionic.Push = Push;
Ionic.PushToken = PushToken;
Ionic.PushMessage = PushMessage;

// DataType Namespace
Ionic.DataType = DataType;
Ionic.DataTypes = DataType.getMapping();

// Cloud Namespace
Ionic.Cloud = {};
Ionic.Cloud.App = App;
Ionic.Cloud.AuthType = auth.AuthType;
Ionic.Cloud.AuthTypes = {};
Ionic.Cloud.AuthTypes.BasicAuth = auth.BasicAuth;
Ionic.Cloud.AuthTypes.CustomAuth = auth.CustomAuth;
Ionic.Cloud.AuthTypes.TwitterAuth = auth.TwitterAuth;
Ionic.Cloud.AuthTypes.FacebookAuth = auth.FacebookAuth;
Ionic.Cloud.AuthTypes.GithubAuth = auth.GithubAuth;
Ionic.Cloud.AuthTypes.GoogleAuth = auth.GoogleAuth;
Ionic.Cloud.AuthTypes.InstagramAuth = auth.InstagramAuth;
Ionic.Cloud.AuthTypes.LinkedInAuth = auth.LinkedInAuth;
Ionic.Cloud.Cordova = cordova.Cordova;
Ionic.Cloud.Client = client.Client;
Ionic.Cloud.Device = device.Device;
Ionic.Cloud.EventEmitter = EventEmitter;
Ionic.Cloud.Logger = Logger;
Ionic.Cloud.Promise = promise.Promise;
Ionic.Cloud.DeferredPromise = promise.DeferredPromise;
Ionic.Cloud.Storage = storage.Storage;
Ionic.Cloud.UserContext = user.UserContext;
Ionic.Cloud.SingleUserService = user.SingleUserService;
Ionic.Cloud.AuthTokenContext = auth.AuthTokenContext;
Ionic.Cloud.CombinedAuthTokenContext = auth.CombinedAuthTokenContext;
Ionic.Cloud.LocalStorageStrategy = storage.LocalStorageStrategy;
Ionic.Cloud.SessionStorageStrategy = storage.SessionStorageStrategy;
Ionic.Cloud.Config = config.Config;
