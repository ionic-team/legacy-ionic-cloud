var gulp = require('gulp'),
  buildConfig = require('./build/config.js'),
  browserify = require("browserify"),
  fs = require("fs"),
  eslint = require('gulp-eslint'),
  replace = require('gulp-replace'),
  uglify = require('gulp-uglify'),
  rename = require('gulp-rename'),
  del = require('del'),
  ts = require('gulp-typescript');

gulp.task('version', ['minify'], function() {
  return gulp.src('dist/**/*.js')
    .pipe(replace('VERSION_STRING', buildConfig.versionData.version))
    .pipe(gulp.dest('dist'));
});

gulp.task('minify', ['build-bundle'], function() {
  return gulp.src('dist/*.js')
    .pipe(uglify())
    .pipe(rename(function(path) {
      path.basename += ".min";
    }))
    .pipe(gulp.dest('dist'));
});

gulp.task('build', ['version']);

gulp.task('build-bundle', ['clean', 'lint', 'build-typescript'], function() {
  return browserify(["src/es5.js", "src/core/angular.js", "src/analytics/angular.js", "src/auth/angular.js", "src/push/angular.js", "src/deploy/angular.js", "dist/es6/index.js"], { "debug": true })
    .transform("babelify", { "presets": ["es2015"], "sourceMapsAbsolute": true })
    .bundle()
    .on("error", function(err) { console.log("Error : " + err.message); })
    .pipe(fs.createWriteStream(buildConfig.dist + "/ionic.io.bundle.js"));
});

gulp.task('clean', function() {
  return del(['dist/**/*']);
});

gulp.task('lint', function() {
  return gulp.src(['gulpfile.js', 'src/**/*.js'])
    .pipe(eslint())
    .pipe(eslint.failOnError())
    .pipe(eslint.formatEach());
});

gulp.task('watch', ['build'], function() {
  gulp.watch(['src/**/*.ts'], ['build']);
});

gulp.task('default', ['build']);

gulp.task('build-typescript', function() {
  return gulp.src(buildConfig.sourceFiles.ts).pipe(ts({
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "target": "es6",
    "declaration": true,
    "typescript": require('typescript')
  })).js.pipe(gulp.dest('dist/es6'));
});
