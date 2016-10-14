import { Container as DIContainer } from './di';
import { EventEmitter } from './events';
import { DeferredPromise } from './promise';

declare var angular;

/**
 * Angular 1 modules and factories for the bundle
 */
export function bootstrapAngular1() {
  if (typeof angular === 'undefined') {
    return; // No global angular--this is not an AngularJS project.
  }

  let container = new DIContainer();

  angular.element(document).ready(function() {
    container.core.init();
    container.cordova.bootstrap();
  });

  angular.module('ionic.cloud', [])

  .provider('$ionicCloudConfig', function() {
    var config = container.config;

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
      return container.core;
    }];
  }])

  .factory('$ionicCloudClient', [function() {
    return container.client;
  }])

  .factory('$ionicUser', [function() {
    return container.singleUserService.current();
  }])

  .factory('$ionicAuth', [function() {
    return container.auth;
  }])

  .factory('$ionicFacebookAuth', [function() {
    return container.facebookAuth;
  }])

  .factory('$ionicGoogleAuth', [function() {
    return container.googleAuth;
  }])

  .factory('$ionicPush', [function() {
    return container.push;
  }])

  .factory('$ionicDeploy', [function() {
    return container.deploy;
  }])

  .run(['$window', '$q', '$rootScope', function($window, $q, $rootScope) {
    if (typeof $window.Promise === 'undefined') {
      $window.Promise = $q;
    } else {
      var init = DeferredPromise.prototype.init;

      DeferredPromise.prototype.init = function() {
        init.apply(this, arguments);
        this.promise = $q.when(this.promise);
      };
    }

    var emit = EventEmitter.prototype.emit;

    EventEmitter.prototype.emit = function(name, data) {
      $rootScope.$broadcast('cloud:' + name, data);
      return emit.apply(this, arguments);
    };
  }]);
}
