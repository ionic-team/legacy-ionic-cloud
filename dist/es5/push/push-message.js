"use strict";
var PushMessage = (function () {
    function PushMessage(raw) {
        this.app = {};
        this._raw = raw || {};
        if (!this._raw.additionalData) {
            // this should only hit if we are serving up a development push
            this._raw.additionalData = {
                'coldstart': false,
                'foreground': true
            };
        }
        this._payload = null;
        this.text = null;
        this.title = null;
        this.count = null;
        this.sound = null;
        this.image = null;
    }
    PushMessage.fromPluginJSON = function (json) {
        var message = new PushMessage(json);
        message.processRaw();
        return message;
    };
    Object.defineProperty(PushMessage.prototype, "payload", {
        get: function () {
            return this._payload || {};
        },
        enumerable: true,
        configurable: true
    });
    PushMessage.prototype.processRaw = function () {
        this.text = this._raw.message || null;
        this.title = this._raw.title || null;
        this.count = this._raw.count || null;
        this.sound = this._raw.sound || null;
        this.image = this._raw.image || null;
        if (!this._raw.additionalData.foreground) {
            this.app.asleep = true;
        }
        if (this._raw.additionalData.coldstart) {
            this.app.closed = true;
        }
        if (this._raw.additionalData.payload) {
            this._payload = this._raw.additionalData.payload;
        }
    };
    PushMessage.prototype.getRawVersion = function () {
        return this._raw;
    };
    PushMessage.prototype.toString = function () {
        return '<PushMessage [\'' + this.title + '\']>';
    };
    return PushMessage;
}());
exports.PushMessage = PushMessage;
