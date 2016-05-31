"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var promise_1 = require('./promise');
var auth_1 = require('../auth/auth');
var request = require('superagent');
var Request = (function () {
    function Request() {
    }
    return Request;
}());
exports.Request = Request;
var Response = (function () {
    function Response() {
    }
    return Response;
}());
exports.Response = Response;
var APIResponse = (function (_super) {
    __extends(APIResponse, _super);
    function APIResponse() {
        _super.call(this);
    }
    return APIResponse;
}(Response));
exports.APIResponse = APIResponse;
var APIRequest = (function (_super) {
    __extends(APIRequest, _super);
    function APIRequest(options) {
        _super.call(this);
        options.headers = options.headers || {};
        if (!options.headers.Authorization) {
            var token = auth_1.Auth.getUserToken();
            if (token) {
                options.headers.Authorization = 'Bearer ' + token;
            }
        }
        var requestInfo = {};
        var p = new promise_1.DeferredPromise();
        var request_method = (options.method || 'get').toLowerCase();
        var req = request[request_method](options.uri || options.url);
        if (options.json) {
            req = req.send(options.json);
        }
        if (options.headers) {
            req = req.set(options.headers);
        }
        req = req.end(function (err, res) {
            requestInfo._lastError = err;
            requestInfo._lastResult = res;
            if (err) {
                p.reject(err);
            }
            else {
                if (res.status < 200 || res.status >= 400) {
                    var _err = new Error('Request Failed with status code of ' + res.status);
                    p.reject({ 'response': res, 'error': _err });
                }
                else {
                    p.resolve({ 'response': res, 'payload': res.body });
                }
            }
        });
        p.requestInfo = requestInfo;
        return p.promise;
    }
    return APIRequest;
}(Request));
exports.APIRequest = APIRequest;
