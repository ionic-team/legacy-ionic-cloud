/* eslint-env node */
/* eslint-disable no-console */

var KarmaServer = require('karma').Server;
var browserify = require('browserify');
var del = require('del');
var fs = require('fs');
var gulp = require('gulp');
var merge = require('merge2');
var pkg = require('./package.json');
var rename = require('gulp-rename');
var replace = require('gulp-replace');
var runSequence = require('run-sequence');
var shell = require('gulp-shell');
var ts = require('gulp-typescript');
var tslint = require('gulp-tslint');
var uglify = require('gulp-uglify');

gulp.task('test', ['build-es5-ts'], function(done) {
  new KarmaServer({
    "configFile": __dirname + '/karma.conf.js',
    "singleRun": true
  }, done).start();
});

gulp.task('clean', function() {
  return del(['dist/**/*']);
});

// https://github.com/adametry/gulp-eslint/issues/152
gulp.task('eslint', shell.task('eslint .'));

gulp.task('tslint', function() {
  return gulp.src('src/**/*.ts')
    .pipe(tslint())
    .pipe(tslint.report("verbose"));
});

gulp.task('lint', ['eslint', 'tslint']);

gulp.task('build-es5', function(done) {
  runSequence('build-es5-ts', 'version', done);
});

gulp.task('build-es5-ts', function() {
  var tsProject = ts.createProject('tsconfig.json');
  var tsResult = gulp.src(["typings/index.d.ts", "src/**/*.ts"])
    .pipe(ts(tsProject));

  return merge([
    tsResult.dts.pipe(gulp.dest('dist/es5')),
    tsResult.js.pipe(gulp.dest('dist/es5'))
  ]);
});

gulp.task('watch-es5', ['build-es5'], function() {
  gulp.watch(['src/**/*.ts'], ['build-es5']);
});

gulp.task('build-es5-bundle', ['build-es5-bundle-min']);

gulp.task('watch-es5-bundle', ['build-es5-bundle'], function() {
  gulp.watch(['src/**/*.ts'], ['build-es5-bundle']);
});

gulp.task('build-es5-bundle-src', ['build-es5'], function() {
  var bundleFiles = [
    "src/es5.js",
    "src/angular.js",
    "dist/es5/index.js"
  ];

  fs.mkdirSync("dist/bundle");

  return browserify(bundleFiles, { "debug": true })
    .bundle()
    .on("error", function(err) { console.error("Error : " + err.message); })
    .pipe(fs.createWriteStream("dist/bundle/ionic.cloud.js"));
});

gulp.task('build-es5-bundle-min', ['build-es5-bundle-src'], function() {
  return gulp.src('dist/bundle/ionic.cloud.js')
    .pipe(uglify().on('error', console.error))
    .pipe(rename(function(path) {
      path.basename += ".min";
    }))
    .pipe(gulp.dest('dist/bundle'));
});

gulp.task('version', function() {
  return gulp.src(['dist/es5/core.js'])
    .pipe(replace('VERSION_STRING', pkg.version))
    .pipe(gulp.dest('dist/es5/'));
});

gulp.task('build', function(done) {
  runSequence('lint', 'clean', 'build-es5-bundle', done);
});

gulp.task('default', ['build']);
