// Add Angular integrations if Angular is available
if ((typeof angular === 'object') && angular.module) {

  var IonicAngularAuth = null;

  angular.module('ionic.service.auth', [])

  .factory('$ionicAuth', [function() {
    return IonicAngularAuth;
  }]);
}
