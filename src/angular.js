// Angular 1 modules and factories for the bundle

if (typeof angular === 'object' && angular.module) {

  var pushInstance = null;
  var deployInstance = null;

  angular.module('ionic.cloud', [])

  /**
   * @private
   * Provides a safe interface to store objects in persistent memory
   */
  .provider('persistentStorage', function() {
    return {
      '$get': [function() {
        var storage = Ionic.getService('Storage');
        if (!storage) {
          storage = new Ionic.IO.Storage();
          Ionic.addService('Storage', storage, true);
        }
        return storage;
      }]
    };
  })

  .provider('$ionicCloud', function() {
    this.init = function(value) {
      Ionic.Core.init(value.core);
    };

    this.$get = function() {
      return Ionic.Core;
    };
  })

  .factory('$ionicCore', [function() {
    return Ionic.Core;
  }])

  .factory('$ionicCloudConfig', [function() {
    return Ionic.Core.config;
  }])

  .factory('$ionicUser', [function() {
    return Ionic.User;
  }])

  .factory('$ionicCurrentUser', [function() {
    return Ionic.User.current();
  }])

  .factory('$ionicEventEmitter', ['$ionicCore', function($ionicCore) {
    return $ionicCore.emitter;
  }])

  .factory('$ionicAuth', [function() {
    return Ionic.Auth;
  }])

  .factory('$ionicPush', [function() {
    if (!pushInstance) {
      pushInstance = new Ionic.Push();
    }
    return pushInstance;
  }])

  .factory('$ionicDeploy', [function() {
    if (!deployInstance) {
      deployInstance = new Ionic.Deploy();
    }
    return deployInstance;
  }])

  .run([function() {
    // This is what kicks off the state redirection when a push notificaiton has the relevant details
    Ionic.io();
  }]);

}
