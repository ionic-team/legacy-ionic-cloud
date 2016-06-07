"use strict";
var Logger = (function () {
    function Logger(prefix) {
        this.prefix = prefix;
        this.silent = false;
        this.outfn = console.log.bind(console);
        this.errfn = console.error.bind(console);
        this.prefix = prefix;
    }
    Logger.prototype.info = function (data) {
        if (!this.silent) {
            this.outfn(this.prefix, data);
        }
    };
    Logger.prototype.warn = function (data) {
        if (!this.silent) {
            this.outfn(this.prefix, data);
        }
    };
    Logger.prototype.error = function (data) {
        this.errfn(this.prefix, data);
    };
    return Logger;
}());
exports.Logger = Logger;
