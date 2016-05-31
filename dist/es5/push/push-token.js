"use strict";
var PushToken = (function () {
    function PushToken(token) {
        this._token = token || null;
    }
    Object.defineProperty(PushToken.prototype, "token", {
        get: function () {
            return this._token;
        },
        set: function (value) {
            this._token = value;
        },
        enumerable: true,
        configurable: true
    });
    PushToken.prototype.toString = function () {
        var token = this._token || 'null';
        return '<PushToken [\'' + token + '\']>';
    };
    return PushToken;
}());
exports.PushToken = PushToken;
