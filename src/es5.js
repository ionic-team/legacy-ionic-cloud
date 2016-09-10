var Core = require("./../dist/esm/core").Core;
var DataType = require("./../dist/esm/user/data-types").DataType;
var Deploy = require("./../dist/esm/deploy/deploy").Deploy;
var EventEmitter = require("./../dist/esm/events").EventEmitter;
var Logger = require("./../dist/esm/logger").Logger;
var Push = require("./../dist/esm/push/push").Push;
var PushMessage = require("./../dist/esm/push/message").PushMessage;
var auth = require("./../dist/esm/auth");
var client = require("./../dist/esm/client");
var config = require("./../dist/esm/config");
var cordova = require("./../dist/esm/cordova");
var device = require("./../dist/esm/device");
var di = require("./../dist/esm/di");
var promise = require("./../dist/esm/promise");
var storage = require("./../dist/esm/storage");
var user = require("./../dist/esm/user/user");

// Declare the window object
window.Ionic = new di.Container();

// Ionic Modules
Ionic.Core = Core;
Ionic.User = user.User;
Ionic.Auth = auth.Auth;
Ionic.Deploy = Deploy;
Ionic.Push = Push;
Ionic.PushMessage = PushMessage;

// DataType Namespace
Ionic.DataType = DataType;
Ionic.DataTypes = DataType.getMapping();

// Cloud Namespace
Ionic.Cloud = {};
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
Ionic.Cloud.DeferredPromise = promise.DeferredPromise;
Ionic.Cloud.Storage = storage.Storage;
Ionic.Cloud.UserContext = user.UserContext;
Ionic.Cloud.SingleUserService = user.SingleUserService;
Ionic.Cloud.AuthTokenContext = auth.AuthTokenContext;
Ionic.Cloud.CombinedAuthTokenContext = auth.CombinedAuthTokenContext;
Ionic.Cloud.LocalStorageStrategy = storage.LocalStorageStrategy;
Ionic.Cloud.SessionStorageStrategy = storage.SessionStorageStrategy;
Ionic.Cloud.Config = config.Config;
