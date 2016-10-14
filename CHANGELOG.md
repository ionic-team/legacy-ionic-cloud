# Changelog

## 0.12.0

* Added custom auth error handling. Addresses a portion of issue
  [#53](https://github.com/driftyco/ionic-cloud/issues/53).

## 0.11.0

* Added Facebook and Google Native Auth. See the native auth
  [milestone](https://github.com/driftyco/ionic-cloud/milestone/2?closed=1).

## 0.10.0

* **(breaking)** Move to Typescript 2.0
* Add Push Plugin error handling
  (https://github.com/driftyco/ionic-cloud/pull/47)
* Always include `registered` and `saved` boolean values in push token
  (https://github.com/driftyco/ionic-cloud/issues/48)
* Client-side validation for email/password signups
  (https://github.com/driftyco/ionic-cloud/commit/dd468e785110670b847b61649e1604f3bf35d382)

## 0.9.0

* Fix deploy extract boolean--promise resolves/rejects properly.
* **(breaking)** The promises returned by download and extract no longer
  resolve with boolean values.

## 0.8.2

* Fix goof with event emitter

## 0.8.1

* Fix [#40](https://github.com/driftyco/ionic-cloud/issues/40)

## 0.8.0

* **(breaking)** Require `ionic-plugin-deploy` 0.6.0 for deploy
* Move to Typescript
* **(breaking)** Configuration Update (see the [docs](http://docs.ionic.io) for usage)
* **(breaking)** Remove bower support
* Add CommonJS ES5 distribution files
* Start tests
* Standardize ES and TS linting
* Switch everything to use dependency injection
* **(breaking)** Remove Analytics (will be added back soon in a later version)
* [See more in the Migration Guide](https://github.com/driftyco/ionic-cloud/wiki/Migration-Guide).

## 0.7.1

* (fix) Pushed invalid build (0.7.0 is a broken build)

## 0.7.0

* **(breaking)** (deploy) Version 0.5.0 or greater of `ionic-plugin-deploy` is required
  to use deploy correctly.

## 0.6.1

* (push) (fix) `getPushPlugin` will now correctly return the plugin instance or `null`

## 0.6.0

* **(breaking)** (push) angular integration now correctly uses notification.payload and
  the `$stateParams` property is now passed as a standard object, not a string.

## 0.5.2

* (push) Allow saving of tokens without user context

## 0.5.1

* (auth) (user) Pass additional user details with user signup

## 0.5.0

* (user) Added `resetPassword()` method to users
* (user) (fix) Update user details with custom data during `save()`

## 0.4.0

* (auth) Added ability to send data in custom authentication request

## 0.3.0

* (auth) Introduced Authentication component
* **(breaking)** both Ionic.User and Ionic.Push utilize new beta API
  access and have modified/added/removed some of the current methods
* (push) Added public method to get push pluginI
* (user) Added migrate method for alpha users
* (user) (fix) Falsy values are allowed in `get(key, defaultValue)`
* (analytics) (fix) events are no longer mutated


## 0.2.1

* (push) (fix) prevent dev-mode from registering multiple callbacks
* (user) (fix) prevent dev tokens from saving to a user


## 0.2.0

* (core) removing need to call `Ionic.io();` manually
* (deploy) update() can now defer reloading the app
* (deploy) adding `getVersions` and `deleteVersion` methods to manage deploy versions.
* (deploy) adding `getMetadata` method to fetch deploy metadata
* (deploy) (fix) deploy methods now wait for the onReady event


## 0.1.1

* (push) fixed notification handling for dev_push when using angular integrations
* (push) getPayload() now returns the correct payload
* (analytics) fixed incorrect log method references


## 0.1.0

* web client introduction

