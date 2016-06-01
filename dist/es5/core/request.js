"use strict";
var promise_1 = require('./promise');
var auth_1 = require('../auth/auth');
var r = require('superagent');
function request(options) {
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
    var req = r[request_method](options.uri || options.url);
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
exports.request = request;
