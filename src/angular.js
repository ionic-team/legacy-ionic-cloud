// Angular 1 modules and factories for the bundle

if (typeof angular === 'object' && angular.module) {

  var emitter = new Ionic.Cloud.EventEmitter();
  var logger = new Ionic.Cloud.Logger();
  var device = new Ionic.Cloud.Device(emitter);
  var cordova = new Ionic.Cloud.Cordova({}, device, emitter, logger);

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

    this.$get = ['$ionicCloudConfig', '$ionicCloudLogger', '$ionicEventEmitter', '$ionicCloudClient', function($ionicCloudConfig, $ionicCloudLogger, $ionicEventEmitter, $ionicCloudClient) {
      return new Ionic.Core($ionicCloudConfig, $ionicCloudLogger, $ionicEventEmitter, $ionicCloudClient);
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
    var authModules = Ionic.Cloud.AuthType.createAuthModules($ionicCloudConfig, $ionicCloudClient);
    return new Ionic.Auth({}, $ionicEventEmitter, authModules, $ionicAuthTokenContext, $ionicSingleUserService);
  }])

  .factory('$ionicPush', ['$ionicCloudConfig', '$ionicAuth', '$ionicCloudDevice', '$ionicCloudClient', '$ionicEventEmitter', '$ionicCloudStorage', '$ionicCloudLogger', function($ionicCloudConfig, $ionicAuth, $ionicCloudDevice, $ionicCloudClient, $ionicEventEmitter, $ionicCloudStorage, $ionicCloudLogger) {
    return new Ionic.Push({}, $ionicCloudConfig, $ionicAuth, $ionicCloudDevice, $ionicCloudClient, $ionicEventEmitter, $ionicCloudStorage, $ionicCloudLogger);
  }])

  .factory('$ionicDeploy', ['$ionicCloudConfig', '$ionicEventEmitter', '$ionicCloudLogger', function($ionicCloudConfig, $ionicEventEmitter, $ionicCloudLogger) {
    return new Ionic.Deploy({}, $ionicCloudConfig, $ionicEventEmitter, $ionicCloudLogger);
  }])

  .run(['$ionicCloud', function($ionicCloud) {
    $ionicCloud.init();
  }]);

}
