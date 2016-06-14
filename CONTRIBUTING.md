# Contributing

## Issues

If you need support or find a bug with the client, please submit an issue to
this repo. For general Ionic Cloud issues (not related to the client), please
use our [issues repo](https://github.com/driftyco/ionic-cloud-issues/issues).

**Before submitting your issue, be sure to update the client and any associated
Cordova plugins to their latest versions.**

## Pull Requests

Pull requests are welcome!

The bleeding edge is `master`, so you'll want to make your changes off of that.
The source code is Typescript and lives in `src/`. Tests live in `spec/`.

### Local Setup

After cloning and installing npm dependencies, there are a variety of gulp
tasks to help you during development.

* `gulp test` - Run the tests. (jasmine/karma/phantomjs).
* `gulp lint` - Lint your code.
* `gulp build-es5` - Transpile the Typescript source files.
