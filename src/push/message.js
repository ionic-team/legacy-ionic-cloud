"use strict";
/**
 * Represents a push notification sent to the device.
 *
 * @featured
 */
var PushMessage = (function () {
    function PushMessage() {
    }
    /**
     * Create a PushMessage from the push plugin's format.
     *
     * @hidden
     *
     * @param data - The plugin's notification object.
     */
    PushMessage.fromPluginData = function (data) {
        var message = new PushMessage();
        message.raw = data;
        message.text = data.message;
        message.title = data.title;
        message.count = data.count;
        message.sound = data.sound;
        message.image = data.image;
        message.app = {
            'asleep': !data.additionalData.foreground,
            'closed': data.additionalData.coldstart
        };
        message.payload = data.additionalData['payload'];
        return message;
    };
    PushMessage.prototype.toString = function () {
        return "<PushMessage [\"" + this.title + "\"]>";
    };
    return PushMessage;
}());
exports.PushMessage = PushMessage;
