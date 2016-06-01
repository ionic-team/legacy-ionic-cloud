import { App } from '../core/app';
import { Logger } from '../core/logger';
import { PromiseWithNotify } from '../core/promise';
import { PushToken } from './push-token';
export declare class Push {
    logger: Logger;
    app: App;
    registerCallback: any;
    notificationCallback: any;
    errorCallback: any;
    private _emitter;
    private _debug;
    private _isReady;
    private _blockRegistration;
    private _blockUnregister;
    private _blockSaveToken;
    private _notification;
    private _registered;
    private _tokenReady;
    private _plugin;
    private _config;
    private _token;
    constructor(config: any);
    token: any;
    getStorageToken(): PushToken;
    clearStorageToken(): void;
    /**
     * Init method to setup push behavior/options
     *
     * The config supports the following properties:
     *   - debug {Boolean} Enables some extra logging as well as some default callback handlers
     *   - onNotification {Function} Callback function that is passed the notification object
     *   - onRegister {Function} Callback function that is passed the registration object
     *   - onError {Function} Callback function that is passed the error object
     *   - pluginConfig {Object} Plugin configuration: https://github.com/phonegap/phonegap-plugin-push
     *
     * @param {object} config Configuration object
     * @return {Push} returns the called Push instantiation
     */
    init(config: any): this;
    saveToken(token: any, options: any): PromiseWithNotify<any>;
    /**
     * Registers the device with GCM/APNS to get a device token
     * Fires off the 'onRegister' callback if one has been provided in the init() config
     * @param {function} callback Callback Function
     * @return {void}
     */
    register(callback: (token: PushToken) => void): boolean;
    /**
     * Invalidate the current GCM/APNS token
     *
     * @return {Promise} the unregister result
     */
    unregister(): PromiseWithNotify<any>;
    /**
     * Convenience method to grab the payload object from a notification
     *
     * @param {PushNotification} notification Push Notification object
     * @return {object} Payload object or an empty object
     */
    getPayload(notification: any): any;
    /**
     * Set the registration callback
     *
     * @param {function} callback Registration callback function
     * @return {boolean} true if set correctly, otherwise false
     */
    setRegisterCallback(callback: any): boolean;
    /**
     * Set the notification callback
     *
     * @param {function} callback Notification callback function
     * @return {boolean} true if set correctly, otherwise false
     */
    setNotificationCallback(callback: any): boolean;
    /**
     * Set the error callback
     *
     * @param {function} callback Error callback function
     * @return {boolean} true if set correctly, otherwise false
     */
    setErrorCallback(callback: any): boolean;
    _debugRegistrationCallback(): (data: any) => void;
    _debugNotificationCallback(): (notification: any) => void;
    _debugErrorCallback(): (err: any) => void;
    _registerCallback(): (data: any) => any;
    _notificationCallback(): (notification: any) => any;
    _errorCallback(): (err: any) => any;
    /**
     * Registers the default debug callbacks with the PushPlugin when debug is enabled
     * Internal Method
     * @private
     * @return {void}
     */
    _debugCallbackRegistration(): void;
    /**
     * Registers the user supplied callbacks with the PushPlugin
     * Internal Method
     * @return {void}
     */
    _callbackRegistration(): void;
    /**
     * Performs misc features based on the contents of a push notification
     * Internal Method
     *
     * Currently just does the payload $state redirection
     * @param {PushNotification} notification Push Notification object
     * @return {void}
     */
    _processNotification(notification: any): void;
    _getPushPlugin(): any;
    /**
     * Fetch the phonegap-push-plugin interface
     *
     * @return {PushNotification} PushNotification instance
     */
    getPushPlugin(): any;
    /**
     * Fire a callback when Push is ready. This will fire immediately if
     * the service has already initialized.
     *
     * @param {function} callback Callback function to fire off
     * @return {void}
     */
    onReady(callback: any): void;
}
