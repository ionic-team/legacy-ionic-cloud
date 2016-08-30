# Contributing

## Issues

If you need support or find a bug with the Ionic Cloud, please submit an issue
to this repo.

**Before submitting your issue, be sure to update the client and any associated
Cordova plugins to their latest versions.**

## Pull Requests

Pull requests are welcome!

The bleeding edge is `master`, so you'll want to make your changes off of that.
The source code is TypeScript and lives in `src/`. Tests live in `spec/`.

### Local Setup

After cloning and installing npm dependencies, there are a variety of gulp
tasks to help you during development.

* `gulp test` - Run the tests. (jasmine/karma/phantomjs).
* `gulp lint` - Lint your code.
* `gulp build` - Run lint, transpile the TypeScript source files, and bundle them up.
* `gulp watch-es5` - Watch changes in `src/`, transpile the source files when changes occur.
