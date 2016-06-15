// Angular 1 modules and factories for the bundle

if (typeof angular === 'object' && angular.module) {

  var pushInstance = null;
  var deployInstance = null;

  angular.module('ionic.cloud.core', [])

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

  .factory('$ionicCore', [function() {
    return Ionic.Core;
  }])

  .factory('$ionicUser', [function() {
    return Ionic.User;
  }])

  .run([function() {
    Ionic.io();
  }]);

  // Ionic Auth
  // ----------
  angular.module('ionic.cloud.auth', [])

  .factory('$ionicAuth', [function() {
    return Ionic.Auth;
  }]);

  // Ionic Push
  // ----------
  angular.module('ionic.cloud.push', [])

  /**
   * IonicPushAction Service
   *
   * A utility service to kick off misc features as part of the Ionic Push service
   */
  .factory('$ionicPushAction', ['$state', function($state) {

    function PushActionService() {}

    /**
     * State Navigation
     *
     * Attempts to navigate to a new view if a push notification payload contains:
     *
     *   - $state {String} The state name (e.g 'tab.chats')
     *   - $stateParams {Object} Provided state (url) params
     *
     * Find more info about state navigation and params:
     * https://github.com/angular-ui/ui-router/wiki
     *
     * @param {object} notification Notification Object
     * @return {void}
     */
    PushActionService.prototype.notificationNavigation = function(notification) {
      var state = notification.payload.$state || false;
      var stateParams = notification.payload.$stateParams || {};
      if (state) {
        $state.go(state, stateParams);
      }
    };

    return new PushActionService();
  }])

  .factory('$ionicPush', [function() {
    if (!pushInstance) {
      pushInstance = new Ionic.Push({ 'deferInit': true });
    }
    return pushInstance;
  }])

  .run(['$ionicCore', '$ionicPush', '$ionicPushAction', function($ionicCore, $ionicPush, $ionicPushAction) {
    // This is what kicks off the state redirection when a push notificaiton has the relevant details
    $ionicCore.emitter.on('push:processNotification', function(notification) {
      notification = Ionic.PushMessage.fromPluginJSON(notification);
      if (notification && notification.app) {
        if (notification.app.asleep === true || notification.app.closed === true) {
          $ionicPushAction.notificationNavigation(notification);
        }
      }
    });

  }]);

  // Ionic Deploy
  // ------------
  angular.module('ionic.cloud.deploy', [])

  .factory('$ionicDeploy', [function() {
    if (!deployInstance) {
      deployInstance = new Ionic.Deploy();
    }
    return deployInstance;
  }]);

}
