"use strict";
var Logger = (function () {
    function Logger(opts) {
        var options = opts || {};
        this._silence = false;
        this._prefix = null;
        this._options = options;
        this._bootstrap();
    }
    Logger.prototype.silence = function () {
        this._silence = true;
    };
    Logger.prototype.verbose = function () {
        this._silence = false;
    };
    Logger.prototype._bootstrap = function () {
        if (this._options.prefix) {
            this._prefix = this._options.prefix;
        }
    };
    Logger.prototype.info = function (data) {
        if (!this._silence) {
            if (this._prefix) {
                console.log(this._prefix, data);
            }
            else {
                console.log(data);
            }
        }
    };
    Logger.prototype.warn = function (data) {
        if (!this._silence) {
            if (this._prefix) {
                console.log(this._prefix, data);
            }
            else {
                console.log(data);
            }
        }
    };
    Logger.prototype.error = function (data) {
        if (this._prefix) {
            console.error(this._prefix, data);
        }
        else {
            console.error(data);
        }
    };
    return Logger;
}());
exports.Logger = Logger;
