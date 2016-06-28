// Angular 1 modules and factories for the bundle

if (typeof angular === 'object' && angular.module) {

  angular.element(document).ready(function() {
    Ionic.cordova.bootstrap();
  });

  angular.module('ionic.cloud', [])

  .provider('$ionicCloudConfig', function() {
    var config = Ionic.config;

    this.register = function(settings) {
      config.register(settings.core);
      if (settings.logger) {
        var logger = Ionic.logger;
        logger.silent = settings.logger.silent;
      }
    };

    this.$get = function() {
      return config;
    };
  })

  .provider('$ionicCloud', ['$ionicCloudConfigProvider', function($ionicCloudConfigProvider) {
    this.init = function(value) {
      $ionicCloudConfigProvider.register(value);
    };

    this.$get = [function() {
      return Ionic.core;
    }];
  }])

  .factory('$ionicCloudLogger', [function() {
    return Ionic.logger;
  }])

  .factory('$ionicEventEmitter', [function() {
    return Ionic.eventEmitter;
  }])

  .factory('$ionicCloudDevice', [function() {
    return Ionic.device;
  }])

  .factory('$ionicCloudCordova', [function() {
    return Ionic.cordova;
  }])

  .factory('$ionicCloudClient', [function() {
    return Ionic.client;
  }])

  .factory('$ionicSingleUserService', [function() {
    return Ionic.singleUserService;
  }])

  .factory('$ionicUser', ['$ionicSingleUserService', function($ionicSingleUserService) {
    return $ionicSingleUserService.current();
  }])

  .factory('$ionicAuth', [function() {
    return Ionic.auth;
  }])

  .factory('$ionicPush', [function() {
    return Ionic.push;
  }])

  .factory('$ionicDeploy', [function() {
    return Ionic.deploy;
  }])

  .run([function() {
    // TODO
  }]);

}
