// Angular 1 modules and factories for the bundle

if (typeof angular === 'object' && angular.module) {

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
      return new Ionic.Core($ionicCloudConfig, $ionicCloudLogger, $ionicEventEmitter, $ionicCloudClient, $ionicCloudDevice, $ionicCloudCordova, $ionicCloudStorage);
    }];
  }])

  .factory('$ionicCloudLogger', [function() {
    return new Ionic.Cloud.Logger();
  }])

  .factory('$ionicCloudDevice', ['$ionicEventEmitter', function($ionicEventEmitter) {
    return new Ionic.Cloud.Device($ionicEventEmitter);
  }])

  .factory('$ionicCloudCordova', ['$ionicCloudDevice', '$ionicEventEmitter', '$ionicCloudLogger', function($ionicCloudDevice, $ionicEventEmitter, $ionicCloudLogger) {
    return new Ionic.Cloud.Cordova($ionicCloudDevice, $ionicEventEmitter, { 'logger': $ionicCloudLogger });
  }])

  .factory('$ionicCloudClient', ['$ionicCloudConfig', function($ionicCloudConfig) {
    return new Ionic.Cloud.Client($ionicCloudConfig.getURL('api'));
  }])

  .factory('$ionicCloudStorage', [function() {
    return new Ionic.Cloud.Storage(new Ionic.Cloud.LocalStorageStrategy());
  }])

  .factory('$ionicUserContext', ['$ionicCloudStorage', '$ionicCloudConfig', function($ionicCloudStorage, $ionicCloudConfig) {
    return new Ionic.Cloud.UserContext($ionicCloudStorage, $ionicCloudConfig);
  }])

  .factory('$ionicUser', ['$ionicUserContext', function($ionicUserContext) {
    return new Ionic.User($ionicUserContext);
  }])

  .factory('$ionicEventEmitter', [function() {
    return new Ionic.Cloud.EventEmitter();
  }])

  .factory('$ionicAuth', ['$ionicCloudConfig', '$ionicCloudClient', '$ionicEventEmitter', function($ionicCloudConfig, $ionicCloudClient, $ionicEventEmitter) {
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

    var tokenContext = new Ionic.Cloud.AuthTokenContext(new Ionic.Cloud.LocalStorageStrategy(), $ionicCloudConfig);
    var tempTokenContext = new Ionic.Cloud.AuthTokenContext(new Ionic.Cloud.SessionStorageStrategy(), $ionicCloudConfig);

    return new Ionic.Auth($ionicEventEmitter, authModules, tokenContext, tempTokenContext);
  }])

  .factory('$ionicPush', [function() {
    return new Ionic.Push();
  }])

  .factory('$ionicDeploy', [function() {
    return new Ionic.Deploy();
  }])

  .run([function() {
    // TODO
  }]);

}
