"use strict";
var logger_1 = require('./logger');
var privateData = {};
function privateVar(key) {
    return privateData[key] || null;
}
var App = (function () {
    function App(appId, apiKey) {
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic App:'
        });
        if (!appId || appId === '') {
            this.logger.info('No app_id was provided');
            return;
        }
        if (!apiKey || apiKey === '') {
            this.logger.info('No api_key was provided');
            return;
        }
        privateData.id = appId;
        privateData.apiKey = apiKey;
        // other config value reference
        this.devPush = null;
        this.gcmKey = null;
    }
    Object.defineProperty(App.prototype, "id", {
        get: function () {
            return privateVar('id');
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(App.prototype, "apiKey", {
        get: function () {
            return privateVar('apiKey');
        },
        enumerable: true,
        configurable: true
    });
    App.prototype.toString = function () {
        return '<App [\'' + this.id + '\'>';
    };
    return App;
}());
exports.App = App;
