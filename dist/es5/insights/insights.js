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
exports.Stat = Stat;
var Insights = (function () {
    function Insights(client, appId) {
        this.client = client;
        this.appId = appId;
        this.submitCount = Insights.SUBMIT_COUNT;
        this.client = client;
        this.appId = appId;
        this.batch = [];
        this.logger = new logger_1.Logger('Ionic Insights:');
    }
    Insights.prototype.track = function (stat, value) {
        if (value === void 0) { value = 1; }
        this.trackStat(new Stat(this.appId, stat, value));
    };
    Insights.prototype.trackStat = function (stat) {
        this.batch.push(stat);
        if (this.shouldSubmit()) {
            this.submit();
        }
    };
    Insights.prototype.shouldSubmit = function () {
        return this.batch.length >= this.submitCount;
    };
    Insights.prototype.submit = function () {
        var insights = [];
        for (var _i = 0, _a = this.batch; _i < _a.length; _i++) {
            var stat = _a[_i];
            insights.push(stat.toJSON());
        }
        return this.client.post('/insights')
            .send({ 'insights': insights });
    };
    Insights.SUBMIT_COUNT = 100;
    return Insights;
}());
exports.Insights = Insights;
