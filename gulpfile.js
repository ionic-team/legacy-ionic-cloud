/* eslint-env node */
/* eslint-disable no-console */

var browserify = require("browserify");
var del = require('del');
var fs = require("fs");
var gulp = require('gulp');
var pkg = require('./package.json');
var rename = require('gulp-rename');
var replace = require('gulp-replace');
var shell = require('gulp-shell');
var ts = require('gulp-typescript');
var tslint = require('gulp-tslint');
var uglify = require('gulp-uglify');

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

gulp.task('build-es5', ['clean', 'lint'], function() {
  var tsProject = ts.createProject('tsconfig.json');

  return gulp.src(["typings/index.d.ts", "src/**/*.ts"])
    .pipe(ts(tsProject))
    .js
    .pipe(gulp.dest('dist/es5'));
});

gulp.task('watch-es5', ['build-es5'], function() {
  gulp.watch(['src/**/*.ts'], ['build-es5']);
});

gulp.task('build-es5-bundle-src', ['build-es5'], function() {
  return browserify(["src/es5.js", "src/core/angular.js", "src/analytics/angular.js", "src/auth/angular.js", "src/push/angular.js", "src/deploy/angular.js", "dist/es5/index.js"], { "debug": true })
    .bundle()
    .on("error", function(err) { console.error("Error : " + err.message); })
    .pipe(fs.createWriteStream("dist/ionic.io.bundle.js"));
});

gulp.task('build-es5-bundle-min', ['build-es5-bundle-src'], function() {
  return gulp.src('dist/ionic.io.bundle.js')
    .pipe(uglify().on('error', console.error))
    .pipe(rename(function(path) {
      path.basename += ".min";
    }))
    .pipe(gulp.dest('dist'));
});

gulp.task('version', ['build-es5-bundle-min'], function() {
  return gulp.src('dist/**/*.js')
    .pipe(replace('VERSION_STRING', pkg.version))
    .pipe(gulp.dest('dist'));
});

gulp.task('build', ['version']);

gulp.task('watch', ['build'], function() {
  gulp.watch(['src/**/*.ts'], ['build']);
});

gulp.task('default', ['build']);
