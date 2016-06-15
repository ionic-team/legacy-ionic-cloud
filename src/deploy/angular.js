// Add Angular integrations if Angular is available

if (typeof angular === 'object' && angular.module) {
  var deployInstance = null;

  angular.module('ionic.cloud.deploy', [])

  .factory('$ionicDeploy', [function() {
    if (!deployInstance) {
      deployInstance = new Ionic.Deploy();
    }
    return deployInstance;
  }]);
}
