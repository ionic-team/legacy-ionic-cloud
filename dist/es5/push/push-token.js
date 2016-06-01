"use strict";
var PushToken = (function () {
    function PushToken(token) {
        this.token = token;
        this.token = token;
    }
    PushToken.prototype.toString = function () {
        return "<PushToken [" + this.token + "]>";
    };
    return PushToken;
}());
exports.PushToken = PushToken;
