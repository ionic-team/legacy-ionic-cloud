// Angular 1 modules and factories for the bundle

if (typeof angular === 'object' && angular.module) {

  var emitter = new Ionic.Cloud.EventEmitter();
  var logger = new Ionic.Cloud.Logger();
  var device = new Ionic.Cloud.Device(emitter);
  var cordova = new Ionic.Cloud.Cordova({ 'logger': logger }, device, emitter);

  angular.element(document).ready(function() {
    cordova.bootstrap();
  });

  angular.module('ionic.cloud', [])

  .provider('$ionicCloudConfig', function() {
    var config = new Ionic.Cloud.Config();

    this.register = function(value) {
      config.register(value.core);
    };

    this.$get = function() {
      return config;
    };
  })

  .provider('$ionicCloud', ['$ionicCloudConfigProvider', function($ionicCloudConfigProvider) {
    this.init = function(value) {
      $ionicCloudConfigProvider.register(value);
    };

    this.$get = ['$ionicCloudLogger', '$ionicCloudDevice', '$ionicCloudCordova', '$ionicCloudConfig', '$ionicCloudClient', '$ionicEventEmitter', '$ionicCloudStorage', function($ionicCloudLogger, $ionicCloudDevice, $ionicCloudCordova, $ionicCloudConfig, $ionicCloudClient, $ionicEventEmitter, $ionicCloudStorage) {
      var core = new Ionic.Core($ionicCloudConfig, $ionicCloudLogger, $ionicEventEmitter, $ionicCloudClient, $ionicCloudDevice, $ionicCloudCordova, $ionicCloudStorage);
      core.init();
      return core;
    }];
  }])

  .factory('$ionicCloudLogger', [function() {
    return logger;
  }])

  .factory('$ionicEventEmitter', [function() {
    return emitter;
  }])

  .factory('$ionicCloudDevice', [function() {
    return device;
  }])

  .factory('$ionicCloudCordova', [function() {
    return cordova;
  }])

  .factory('$ionicAuthTokenContext', ['$ionicCloudConfig', function($ionicCloudConfig) {
    var label = 'ionic_io_auth_' + $ionicCloudConfig.get('app_id');
    return new Ionic.Cloud.CombinedAuthTokenContext(label, new Ionic.Cloud.LocalStorageStrategy(), new Ionic.Cloud.SessionStorageStrategy());
  }])

  .factory('$ionicCloudClient', ['$ionicAuthTokenContext', '$ionicCloudConfig', function($ionicAuthTokenContext, $ionicCloudConfig) {
    return new Ionic.Cloud.Client($ionicAuthTokenContext, $ionicCloudConfig.getURL('api'));
  }])

  .factory('$ionicCloudStorage', [function() {
    return new Ionic.Cloud.Storage({}, new Ionic.Cloud.LocalStorageStrategy());
  }])

  .factory('$ionicUserContext', ['$ionicCloudStorage', '$ionicCloudConfig', function($ionicCloudStorage, $ionicCloudConfig) {
    return new Ionic.Cloud.UserContext($ionicCloudStorage, $ionicCloudConfig);
  }])

  .factory('$ionicSingleUserService', ['$ionicCloudClient', '$ionicUserContext', function($ionicCloudClient, $ionicUserContext) {
    return new Ionic.Cloud.SingleUserService({}, $ionicCloudClient, $ionicUserContext);
  }])

  .factory('$ionicUser', ['$ionicSingleUserService', function($ionicSingleUserService) {
    return $ionicSingleUserService.current();
  }])

  .factory('$ionicAuth', ['$ionicCloudConfig', '$ionicCloudClient', '$ionicAuthTokenContext', '$ionicEventEmitter', '$ionicSingleUserService', function($ionicCloudConfig, $ionicCloudClient, $ionicAuthTokenContext, $ionicEventEmitter, $ionicSingleUserService) {
    var authModules = {
      'basic': new Ionic.Cloud.AuthTypes.BasicAuth($ionicCloudConfig, $ionicCloudClient),
      'custom': new Ionic.Cloud.AuthTypes.CustomAuth($ionicCloudConfig, $ionicCloudClient),
      'twitter': new Ionic.Cloud.AuthTypes.TwitterAuth($ionicCloudConfig, $ionicCloudClient),
      'facebook': new Ionic.Cloud.AuthTypes.FacebookAuth($ionicCloudConfig, $ionicCloudClient),
      'github': new Ionic.Cloud.AuthTypes.GithubAuth($ionicCloudConfig, $ionicCloudClient),
      'google': new Ionic.Cloud.AuthTypes.GoogleAuth($ionicCloudConfig, $ionicCloudClient),
      'instagram': new Ionic.Cloud.AuthTypes.InstagramAuth($ionicCloudConfig, $ionicCloudClient),
      'linkedin': new Ionic.Cloud.AuthTypes.LinkedInAuth($ionicCloudConfig, $ionicCloudClient)
    };

    return new Ionic.Auth({}, $ionicEventEmitter, authModules, $ionicAuthTokenContext, $ionicSingleUserService);
  }])

  .factory('$ionicPush', ['$ionicCloud', '$ionicAuth', function($ionicCloud, $ionicAuth) {
    return new Ionic.Push({}, $ionicCloud, $ionicAuth);
  }])

  .factory('$ionicDeploy', ['$ionicCloud', function($ionicCloud) {
    return new Ionic.Deploy({}, $ionicCloud);
  }]);

}
