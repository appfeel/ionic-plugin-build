# Ionic Build plugin

**NOTE:** It requires that all development is done in `src/` folder, instead of `www/` folder.

This is an Ionic plugin to build source files. It performs the following operations:

- Preprocess `index.html` (see [preprocess](https://www.npmjs.com/package/preprocess))
- Read all `*.html` templates, lint and converts them to minified javascript files, using `$templateCache.put(...)`
- Transforms all `templateUrl: 'path/to/template.html'` into `templateProvider:function($templateCache){return $templateCache.get('path/to/template.html')}`
- Read all `.css` files from `index.html`, minifies and concats them into `all.min.css` (minification is only done when -p flag is set or when -sc flag is set without -p flag)
- In every `.css`, replaces `../fonts/ionicons*` with `${bowerrc path}/ionic/fonts/ionicons*`
- In every `.css`, replaces `../fonts/fontawesomeionicons*` with `${bowerrc path}/components-font-awesome/fonts/fontawesome*`
- In every `.css`, replaces `../img/*` with `img/*`
- Read all `.js` files from `index.html`, lints, annotates, minifies and concats them into `all.min.js` (minification is only done when -p flag is set or when -sc flag is set without -p flag)
- Skips minification in resources under bower modules and already minified ones
- Copies all resources from `src/` to `www/` (images, etc)
- Replaces all scripts in `index.html` between `<!--startsrc-->` and `<!--endsrc-->` with `<script src="all.min.js?v=${new Date().getTime()}"></script>`
- Replaces all links in `index.html` between `<!--startcss-->` and `<!--endcss-->` with `<link href="all.min.css?v=${new Date().getTime()}" rel="stylesheet">`

These tasks are executed every time a `cordova prepare`, `phonegap prepare` or `ionic prepare` is executed.

When the command is `phonegap serve` it copies all files from `src/` to `www/` without modifying them and watch for changes in `src/` directory, so they are immediately populated to corresponding platform.

## Options:

```js
    options.help = options.h || options.help; // Help
    options.production = options.p || options.prod || options.production; // Production
    options.debug = options.d || options.debug; // DEBUG
    options.angularDebug = options.ad || options['angular-debug']; // ANGULAR_DEBUG
    options.skipLint = options.sl || options['skip-lint']; // Skip lint
    options.noFailLint = options.nf || options['no-fail-lint']; // Don't fail on javascript/html errors
    options.skipComp = options.sc || options['skip-comp']; // Skip compression
    options.verbose = options.vb || options.verb || options.verbose; // Verbose
    options.extendedReport = options.xr || options['extended-report']; // Extended hint reports
    options.skipAll = options.sa || options['skip-all']; // Extended hint reports
    options.preprocessResources = options.ppr || options['preprocess-resources']; // Preprocess resources

    options.skipComp = options.production ? options.skipComp : !options.skipComp;
    options.env = options.production ? 'production' : 'development';
    options.concatResources = options.production;
    options.skipHtmlCompression = options.skipHtmlCompression || options.skipComp;
    options.skipResCompression = options.skipResCompression || options.skipComp;
    options.dest = options.dest || 'build';
    global.NODE_ENV = options.env;

    return {
        context: {
            NODE_ENV: options.env,
            DEBUG: (options.debug && options.production)
                || (!options.debug && !options.production) ? true : undefined,
            ANGULAR_DEBUG: (options.angularDebug && options.production)
                || (!options.angularDebug && !options.production) ? true : undefined,
        },
    };
```

Context variables are used to [preprocess](https://www.npmjs.com/package/preprocess) `index.html`.

This options can be used it like this:

```bash
$ cordova prepare browser -p --skip-lint -nf
```
