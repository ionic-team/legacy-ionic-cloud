"use strict";
var logger_1 = require('../core/logger');
var Stat = (function () {
    function Stat(appId, stat, value) {
        if (value === void 0) { value = 1; }
        this.appId = appId;
        this.stat = stat;
        this.value = value;
        this.appId = appId;
        this.stat = stat;
        this.value = value;
        this.created = new Date();
    }
    Stat.prototype.toJSON = function () {
        return {
            app_id: this.appId,
            stat: this.stat,
            value: this.value,
            created: this.created.toISOString(),
        };
    };
    return Stat;
}());
var Insights = (function () {
    function Insights(appId) {
        this.appId = appId;
        this.appId = appId;
        this.batch = [];
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic Insights:'
        });
        this.logger.info('init');
    }
    Insights.prototype.track = function (stat, value) {
        if (value === void 0) { value = 1; }
        this.batch.push(new Stat(this.appId, stat, value));
        this.submit();
    };
    Insights.prototype.submit = function () {
        if (this.batch.length >= Insights.SUBMIT_COUNT) {
        }
    };
    Insights.SUBMIT_COUNT = 100;
    return Insights;
}());
exports.Insights = Insights;
