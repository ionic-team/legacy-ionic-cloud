"use strict";
var logger_1 = require('./logger');
var App = (function () {
    function App(appId) {
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic App:'
        });
        if (!appId || appId === '') {
            this.logger.info('No app_id was provided');
            return;
        }
        this._id = appId;
        // other config value reference
        this.devPush = null;
        this.gcmKey = null;
    }
    Object.defineProperty(App.prototype, "id", {
        get: function () {
            return this._id;
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
