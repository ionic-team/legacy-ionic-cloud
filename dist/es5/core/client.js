"use strict";
var auth_1 = require('../auth/auth');
var core_1 = require('../core/core');
var request = require('superagent');
var Client = (function () {
    function Client(baseUrl, token, req) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.req = req;
        if (typeof req === 'undefined') {
            req = request;
        }
        this.baseUrl = baseUrl;
        this.token = token;
        this.req = req;
    }
    Client.prototype.get = function (endpoint) {
        return this.supplement(this.req.get, endpoint);
    };
    Client.prototype.post = function (endpoint) {
        return this.supplement(this.req.post, endpoint);
    };
    Client.prototype.put = function (endpoint) {
        return this.supplement(this.req.put, endpoint);
    };
    Client.prototype.patch = function (endpoint) {
        return this.supplement(this.req.patch, endpoint);
    };
    Client.prototype.delete = function (endpoint) {
        return this.supplement(this.req.delete, endpoint);
    };
    Client.prototype.supplement = function (fn, endpoint) {
        if (endpoint.substring(0, 1) !== '/') {
            throw Error('endpoint must start with leading slash');
        }
        return fn(this.baseUrl + endpoint).set('Authorization', "Bearer " + this.token);
    };
    return Client;
}());
exports.Client = Client;
exports.client = new Client(core_1.IonicPlatform.config.getURL('platform-api'), auth_1.Auth.getUserToken(), request);
