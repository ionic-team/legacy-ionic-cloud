# Contributing

Pull requests are welcome!

The bleeding edge is `master`, so you'll want to make your changes off of that.
The source code is Typescript and lives in `src/`. Tests live in `spec/`.

## Local Setup

After cloning and installing npm dependencies, there are a variety of gulp
tasks to help you during development.

* `gulp test` - Run the tests. (jasmine/karma/phantomjs).
* `gulp lint` - Lint your code.
* `gulp build-es5` - Transpile the Typescript source files.
