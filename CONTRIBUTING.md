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

After cloning and installing npm dependencies, there are a variety of npm
scripts to help you during development.

* `npm run test` - Run the tests. (jasmine/karma/phantomjs).
* `npm run tsc:es5 -- -w` - Compile `.js`/`.d.ts` files and watch for changes.
  (run this in combination with `npm run test`).
* `npm run lint` - Lint your code.
* `npm run build` - Run lint, transpile the TypeScript source files, and bundle
  them up.
