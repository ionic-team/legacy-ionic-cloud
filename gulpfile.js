/* eslint-env node */
/* eslint-disable no-console */

var gulp = require('gulp'),
  buildConfig = require('./build/config.js'),
  browserify = require("browserify"),
  fs = require("fs"),
  eslint = require('gulp-eslint'),
  tslint = require('gulp-tslint'),
  replace = require('gulp-replace'),
  uglify = require('gulp-uglify'),
  rename = require('gulp-rename'),
  del = require('del'),
  ts = require('gulp-typescript');

});

gulp.task('clean', function() {
  return del(['dist/**/*']);
});

gulp.task('eslint', function() {
  return gulp.src('src/**/*.js')
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});

gulp.task('tslint', function() {
  return gulp.src('src/**/*.ts')
    .pipe(tslint())
    .pipe(tslint.report("verbose"));
});

gulp.task('lint', ['eslint', 'tslint']);

gulp.task('build-es6', ['clean', 'lint'], function() {
  return gulp.src(buildConfig.sourceFiles.ts).pipe(ts({
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "target": "es6",
    "declaration": true,
    "typescript": require('typescript')
  })).js.pipe(gulp.dest('dist/es6'));
});

gulp.task('watch-es6', ['build-es6'], function() {
  gulp.watch(['src/**/*.ts'], ['build-es6']);
});

gulp.task('build-es5-bundle-src', ['build-es6'], function() {
  return browserify(["src/es5.js", "src/core/angular.js", "src/analytics/angular.js", "src/auth/angular.js", "src/push/angular.js", "src/deploy/angular.js", "dist/es6/index.js"], { "debug": true })
    .transform("babelify", { "presets": ["es2015"] })
    .bundle()
    .on("error", function(err) { console.error("Error : " + err.message); })
    .pipe(fs.createWriteStream(buildConfig.dist + "/ionic.io.bundle.js"));
});

gulp.task('build-es5-bundle-min', ['build-es5-bundle-src'], function() {
  return gulp.src('dist/ionic.io.bundle.js')
    .pipe(uglify())
    .pipe(rename(function(path) {
      path.basename += ".min";
    }))
    .pipe(gulp.dest('dist'));
});

gulp.task('version', ['build-es5-bundle-min'], function() {
  return gulp.src('dist/**/*.js')
    .pipe(replace('VERSION_STRING', buildConfig.versionData.version))
    .pipe(gulp.dest('dist'));
});

gulp.task('build', ['version']);

gulp.task('watch', ['build'], function() {
  gulp.watch(['src/**/*.ts'], ['build']);
});

gulp.task('default', ['build']);
