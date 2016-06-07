"use strict";
var request = require('superagent');
var Client = (function () {
    function Client(baseUrl, token, req // TODO: use superagent types
        ) {
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
    Client.prototype.request = function (method, endpoint) {
        return this.supplement(this.req.bind(method), endpoint);
    };
    Client.prototype.supplement = function (fn, endpoint) {
        if (endpoint.substring(0, 1) !== '/') {
            throw Error('endpoint must start with leading slash');
        }
        var req = fn(this.baseUrl + endpoint);
        if (this.token) {
            req.set('Authorization', "Bearer " + this.token);
        }
        return req;
    };
    return Client;
}());
exports.Client = Client;
