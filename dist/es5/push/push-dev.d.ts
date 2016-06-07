import { Client } from '../core/client';
import { Logger } from '../core/logger';
/**
 * PushDev Service
 *
 * This service acts as a mock push service that is intended to be used pre-setup of
 * GCM/APNS in an Ionic.io project.
 *
 * How it works:
 *
 *   When register() is called, this service is used to generate a random
 *   development device token. This token is not valid for any service outside of
 *   Ionic Push with `dev_push` set to true. These tokens do not last long and are not
 *   eligible for use in a production app.
 *
 *   The device will then periodically check the Push service for push notifications sent
 *   to our development token -- so unlike a typical "push" update, this actually uses
 *   "polling" to find new notifications. This means you *MUST* have the application open
 *   and in the foreground to retreive messsages.
 *
 *   The callbacks provided in your init() will still be triggered as normal,
 *   but with these notable exceptions:
 *
 *      - There is no payload data available with messages
 *      - An alert() is called when a notification is received unlesss you return false
 *        in your 'onNotification' callback.
 *
 */
export declare class PushDevService {
    client: Client;
    logger: Logger;
    private _token;
    private _watch;
    private _push;
    constructor();
    /**
     * Generate a development token
     *
     * @return {String} development device token
     */
    getDevToken(): string;
    /**
     * Registers a development token with the Ionic Push service
     *
     * @param {IonicPushService} ionicPush Instantiated Push Service
     * @param {function} callback Registration Callback
     * @return {void}
     */
    init(ionicPush: any, callback: any): void;
    /**
     * Checks the push service for notifications that target the current development token
     * @return {void}
     */
    checkForNotifications(): void;
    /**
     * Kicks off the "polling" of the Ionic Push service for new push notifications
     * @return {void}
     */
    watch(): void;
    /**
     * Puts the "polling" for new notifications on hold.
     * @return {void}
     */
    halt(): void;
}
