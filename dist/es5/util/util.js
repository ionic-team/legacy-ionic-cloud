"use strict";
function deepExtend() {
    var out = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        out[_i - 0] = arguments[_i];
    }
    out = out[0] || {};
    for (var i = 1; i < arguments.length; i++) {
        var obj = arguments[i];
        if (!obj) {
            continue;
        }
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object') {
                    out[key] = deepExtend(out[key], obj[key]);
                }
                else {
                    out[key] = obj[key];
                }
            }
        }
    }
    return out;
}
exports.deepExtend = deepExtend;
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
exports.generateUUID = generateUUID;
