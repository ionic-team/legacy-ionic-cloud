# ionic-platform-web-client

The client for using the Ionic Platform in your app. Check out [our docs](http://docs.ionic.io/docs/io-introduction).

## Installation

Using the latest [Ionic CLI](https://github.com/driftyco/ionic-cli), run the following commands in terminal:

```bash
$ npm install --save ionic-platform-web-client

# Register your app
$ ionic io init
```

## Usage

```javascript
// If no user has been previously saved, a fresh user object is returned,
// otherwise the last [current] saved user will be returned.
let user = Ionic.User.current();
```

Head over to our [docs](http://docs.ionic.io/docs/io-introduction) when you're ready to integrate services like auth, push, or deploy.

## Issues

If you need support or find a bug with the web client, please submit an issue to this repo. For general Ionic Platform issues (not related to the web client), please use our [issues repo](https://github.com/driftyco/ionic-platform-issues/issues). Before submitting your issue, be sure to update the web client and any associated Cordova plugins to their latest versions.

## Development

1. Install Dependencies `npm install`
2. Run `gulp build` (`gulp build-es5` for just Typescript)
