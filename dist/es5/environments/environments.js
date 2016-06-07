"use strict";
var core_1 = require('../core/core');
var promise_1 = require('../core/promise');
var envAPIEndpoints = {
    'getEnv': function (appId, tag) {
        return '/apps/' + appId + '/env/' + tag;
    }
};
var Environment = (function () {
    /**
     * Environment constructor
     *
     * @param {object} config Configuration object
     */
    function Environment() {
    }
    /**
     * Load an environment, calls loadEnvFromAPI
     *
     * @param {string} tag Environment tag
     * @return {DeferredPromise} will resolve/reject with the config object or error
     */
    Environment.prototype.load = function (tag) {
        var deferred = new promise_1.DeferredPromise();
        this.loadEnvFromAPI(tag).then(function (env) {
            deferred.resolve(env['config']);
        }, function (err) {
            deferred.reject(err);
        });
        return deferred.promise;
    };
    /**
     * Load an environment from the API
     *
     * @param {string} tag Environment tag
     * @return {DeferredPromise} will resolve/reject with the config object or error
     */
    Environment.prototype.loadEnvFromAPI = function (tag) {
        var deferred = new promise_1.DeferredPromise();
        core_1.IonicPlatform.client.get('/apps/' + core_1.IonicPlatform.config.get('app_id') + '/env/' + tag)
            .end(function (err, res) {
            if (err) {
                deferred.reject(err);
            }
            else if (res.ok) {
                deferred.resolve(res.body.data);
            }
        });
        return deferred.promise;
    };
    return Environment;
}());
exports.Environment = Environment;
