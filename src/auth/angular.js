// Add Angular integrations if Angular is available

if (typeof angular === 'object' && angular.module) {
  angular.module('ionic.cloud.auth', [])

  .factory('$ionicAuth', [function() {
    return Ionic.Auth;
  }]);
}
