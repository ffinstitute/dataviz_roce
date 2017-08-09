var gulp = require('gulp'),
    browserify = require('browserify'),
    source = require('vinyl-source-stream'),
    uglify = require('gulp-uglify'),
    streamify = require('gulp-streamify'),
    watchify = require('watchify'),
    cleanCSS = require('gulp-clean-css'),
    sourcemaps = require('gulp-sourcemaps'),
    watch = require('gulp-watch');


gulp.task('copy-css-dev', function () {
    function copy_css() {
        gulp.src('src/**/*.css')
            .pipe(sourcemaps.init())
            .pipe(sourcemaps.write())
            .pipe(gulp.dest('build'));
    }

    watch('src/**/*.css', function () {
        copy_css();
    });

    return copy_css();
});

gulp.task('minify-css', function () {
    return gulp.src('src/*.css')
        .pipe(sourcemaps.init())
        .pipe(cleanCSS())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('build'));
});


gulp.task('compile-js-dev', function () {
    // place code for your default task here
    var b = browserify({
        entries: ['src/main.js'],
        plugin: [watchify]
    });

    function bundle() {
        return b.bundle()
            .pipe(source('bundle.js'))
            .pipe(gulp.dest('build/'));
    }

    b.on('update', bundle);

    return bundle();
});


gulp.task('compile-js', function () {
    // place code for your default task here
    return browserify('src/main.js')
        .bundle()
        .pipe(source('bundle.js'))
        .pipe(streamify(uglify()))
        .pipe(gulp.dest('build/'));
});


gulp.task('compile-dev', ['compile-js-dev', 'copy-css-dev']);
gulp.task('compile', ['compile-js', 'minify-css']);
