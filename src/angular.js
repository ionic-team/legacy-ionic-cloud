// Angular 1 modules and factories for the bundle

if (typeof angular === 'object' && angular.module) {

  angular.element(document).ready(function() {
    Ionic.core.init();
    Ionic.cordova.bootstrap();
  });

  angular.module('ionic.cloud', [])

  .provider('$ionicCloudConfig', function() {
    var config = Ionic.config;

    this.register = function(settings) {
      config.register(settings);
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

  .factory('$ionicCloudClient', [function() {
    return Ionic.client;
  }])

  .factory('$ionicUser', [function() {
    return Ionic.singleUserService.current();
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

  .run(['$window', '$q', '$rootScope', function($window, $q, $rootScope) {
    if (typeof $window.Promise === 'undefined') {
      $window.Promise = $q;
    } else {
      var init = Ionic.Cloud.DeferredPromise.prototype.init;

      Ionic.Cloud.DeferredPromise.prototype.init = function() {
        init.apply(this, arguments);
        this.promise = $q.when(this.promise);
      };
    }

    var emit = Ionic.Cloud.EventEmitter.prototype.emit;

    Ionic.Cloud.EventEmitter.prototype.emit = function(name, data) {
      $rootScope.$broadcast('cloud:' + name, data);
      return emit.apply(this, arguments);
    };
  }]);

}
