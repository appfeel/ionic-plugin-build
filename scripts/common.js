#!/usr/bin/env node
/* global logger */

"use strict";

const mpath = require('path');
const fs = require('fs');

const mvExt = require('mv');
const opener = require('opener');
const winston = require('winston');
const chalk = require('chalk');
const del = require('del');
const preprocess = require('preprocess').preprocess;
const templateCache = require('templatecache');
const cheerio = require('cheerio');
const ngAnnotate = require('ng-annotate');
const uglify = require('uglify-js');
const htmlMinify = require('html-minifier').minify;
const htmlHint = require('htmlhint').HTMLHint;
const glob = require('glob');
const eslinter = require('eslint').linter;
const CLIEngine = require('eslint').CLIEngine;
const cssnano = require('cssnano');
const mkdirp = require('mkdirp');
const eslintReporter = require('eslint-html-reporter/reporter');

const errPad = Array('12345 Error(s) '.length).join(' ');
const warPad = Array('12345 Warning(s)'.length).join(' ');
const clcError = chalk.red.bold;
const clcWarning = chalk.yellow.bold;
const clcFile = chalk.magenta;
const clcInfo = chalk.cyan;

let bowerDir;
let bowerInner;

const uglifyOpts = {
    warnings: true,
    fromString: true,
    preserveComments: 'license',
    compress: {
        sequences: true,        // join consecutive statemets with the “comma operator”
        properties: true,       // optimize property access: a['foo'] → a.foo
        dead_code: true,        // discard unreachable code
        drop_debugger: true,    // discard “debugger” statements
        unsafe: false,          // some unsafe optimizations (see below)
        conditionals: true,     // optimize if-s and conditional expressions
        comparisons: true,      // optimize comparisons
        evaluate: true,         // evaluate constant expressions
        booleans: true,         // optimize boolean expressions
        loops: true,            // optimize loops
        unused: true,           // drop unused variables/functions
        hoist_funs: true,       // hoist function declarations
        hoist_vars: false,      // hoist variable declarations
        if_return: true,        // optimize if-s followed by return/continue
        join_vars: true,        // join var declarations
        cascade: true,          // try to cascade `right` into `left` in sequences
        side_effects: true,     // drop side-effect-free statements
        warnings: true,         // warn about potentially dangerous optimizations/code
        global_defs: {},        // global definitions
    },
};
const htmlMinOpts = {
    caseSensitive: true,
    removeComments: true,
    removeAttributeQuotes: true,
};
const htmHintOpts = {
    'tagname-lowercase': true,
    'attr-lowercase': true,
    'attr-value-double-quotes': false,
    'doctype-first': false,
    'tag-pair': true,
    'spec-char-escape': true,
    'id-unique': true,
    'src-not-empty': true,
    'attr-no-duplication': true,
    'title-require': false,
};

let options;
let projectRoot;
let preprocessOptions;
let skipLintRegex;

const logFileProgress = (message, filename, type) => {
    if (options.verbose || type === 'error') {
        logger[type || 'info'](`${message}: ${clcFile(filename)}`);
    }
};

const formatYMDHMDate = (date) => {
    const year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hour = date.getHours();
    let minute = date.getMinutes();
    if (month.toString().length === 1) {
        month = `0${month}`;
    }
    if (day.toString().length === 1) {
        day = `0${day}`;
    }
    if (hour.toString().length === 1) {
        hour = `0${hour}`;
    }
    if (minute.toString().length === 1) {
        minute = `0${minute}`;
    }
    return `${year}-${month}-${day} ${hour}:${minute}`;
};

function ensureDirExists(dOut) {
    return new Promise((resolve, reject) => {
        mkdirp(dOut, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function prepareOptions(opts) {
    options = opts;
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

    uglifyOpts.warnings = options.verbose;
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
}

function padNumber(number, length) {
    let nStr = number.toString();
    if (length > nStr.length) {
        for (let i = 0; i < length - nStr.length; i += 1) {
            nStr = ` ${nStr}`;
        }
    }
    return nStr;
}

/**
 * Creates a basic report for hint errors
 */
function basicReporter(messages, path) {
    let errMsg;
    let eCount = 0;
    let wCount = 0;

    for (let m = 0; m < messages.length; m += 1) {
        errMsg = messages[m];
        if (messages[m].severity === 1) {
            logger.error(clcInfo(`Line: ${messages[m].line} Column: ${messages[m].column}: `) + clcWarning(messages[m].message));
            wCount += 1;
        } else {
            logger.error(clcInfo(`Line: ${messages[m].line} Column: ${messages[m].column}: `) + clcError(messages[m].message));
            eCount += 1;
        }
    }
    errMsg = 'ESLINT: ';
    errMsg += eCount ? clcError(`${padNumber(eCount, 5)} Error(s)`) : errPad;
    errMsg += wCount ? clcWarning(`${padNumber(wCount, 5)} Warning(s)`) : warPad;
    errMsg += ` at ${clcFile(path)}`;

    if ((eCount + wCount) > 0) {
        logger.error(errMsg);
    }

    return eCount + wCount;
}

/**
 * Reads a file and preprocess it when specified, resolving any directive in it (see https://github.com/jsoverson/preprocess).
 * @param filePath {string} the path of the file to preprocess.
 * @param isPreprocess {boolean} whether to preprocess the file or not.
 * @return {Promise} with the processed string.
 */
function readFile(filePath, isPreprocess) {
    return new Promise((resolve, reject) => {
        logFileProgress('Reading', filePath);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                reject(err);
            } else if (isPreprocess) {
                logFileProgress('Preprocessing', filePath);
                resolve(preprocess(data.toString(), preprocessOptions));
            } else {
                resolve(data.toString());
            }
        });
    });
}

/**
 * Writes a file. Does not manage error to user interface.
 * @param path {string} the path of the file to write.
 * @param fileName {string} the name of the file to write.
 * @param data {string} the data to be written.
 * @return {Promise} with the processed string.
 */
function writeFile(path, fileName, data) {
    return new Promise((resolve, reject) => {
        ensureDirExists(path)
            .then(() => {
                fs.writeFile(mpath.join(path, fileName), data.toString(), (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            }, reject);
    });
}

/**
 * Prepares extended report
 * @param allMessages {Array} with all error messages.
 * @param reportName {string} the name of the report to write.
 * @param reporter {function} the function that will create the report.
 * @returns {Promise} with true if there where errors or false otherwise.
 */
function prepareExtendedReport(allMessages, reportName, reporter) {
    return new Promise((resolve, reject) => {
        if (options.extendedReport && allMessages.length > 0) {
            writeFile(mpath.join(projectRoot, 'logs'), reportName, reporter(allMessages))
                .then(() => {
                    logFileProgress('Extended report has been created', mpath.join(projectRoot, 'logs', reportName), 'error');
                    opener(mpath.join(projectRoot, 'logs', reportName));
                    resolve(allMessages.length > 0);
                }, reject);
        }
        resolve(allMessages.length > 0);
    });
}

const pathReplaces = {};
/**
 * Creates a regexp to replace the path. Keeps it in a cache.
 * @param path {string} the path to create the regexp.
 * @return {RegExp} the regex expression.
 */
function getPathReplace(path) {
    if (!pathReplaces[path]) {
        pathReplaces[path] = new RegExp(`^${path}/?`, 'gi');
    }
    return pathReplaces[path];
}

/**
 * Performs eslint to the supplied code.
 * @param code {string} the code to lint.
 * @param path {string} [Optional] the path where the file is. This is used for reporting options.
 * @param fileName {string} [Optional] the file name. This is used for reporting options.
 * @return {Array} the messages.
 */
function lintJs(code, path, fileName) {
    const fullName = mpath.join(path, fileName);
    const config = new CLIEngine().getConfigForFile(fullName);
    let messages = [];

    // TODO: what if there is a file in /path/someotherpath/templates.js ??
    if (!options.skipLint && !skipLintRegex.test(fullName) && !/templates\.js$/gi.test(fileName)) {
        logFileProgress('Linting', fullName);
        messages = eslinter.verify(code, config);
        if (messages.length > 0) {
            basicReporter(messages, fullName);
        }
    }
    return messages;
}

function lintHtml(code, path, fileName) {
    const fullName = mpath.join(path, fileName);
    let messages = [];

    if (!options.skipLint && !skipLintRegex.test(fullName)) {
        logFileProgress('Linting', fullName);
        messages = htmlHint.verify(code, htmHintOpts);
        if (messages.length > 0) {
            messages = messages.map(message => ({
                severity: message.type === 'error' ? 2 : 1,
                line: message.line,
                column: message.col,
                message: `${message.message} Raw: ${message.raw}`,
                ruleId: message.rule.id,
                ruleUrl: message.rule.link,
            }));
            basicReporter(messages, fullName);
        }
    }
    return messages;
}

/**
 * Get all scripts src's and all links href's from an html file.
 * @param indexData {string} the html data string
 * @return {Promise} with an object with an array of scripts src's and links href's
 */
function getResources(indexData) {
    return new Promise((resolve, reject) => {
        try {
            const $ = cheerio.load(indexData);
            const scripts = [];
            const links = [];
            $('[ng-app]').each((index, element) => $(element).attr('ng-strict-di', true));
            $('script').each((index, element) => scripts.push($(element).attr('src')));
            $('link').each((index, element) => (/(\.css$|\.css\?)/i.test($(element).attr('href')) ? links.push($(element).attr('href')) : true));
            resolve({ scripts, links, indexData: $.html() });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Copies files from path to dest.
 * @param files {Array} an array with the file names to be copied.
 * @param path {string} the base path.
 * @param dest {string} the destination path.
 * @param opts {Object} options where can be defined a regex expression to include/exclude files:
 *  {
 *      exclude: [/\.js$/i, /\.css$/i, /\.html$/i]
 *  }
 */
function copyFiles(files, path, dest, opts) {
    const mopts = opts || {};
    const pathReplace = getPathReplace(path);
    const popts = mopts.exclude || mopts.include || [];
    const promises = [];
    const isProcessFileCfg = mopts.exclude !== undefined
        || !(mopts.include !== undefined)
        || (!mopts.exclude && !mopts.include);
    const copyFile = (fileParts, origin, to) => ensureDirExists(mpath.join(dest, fileParts))
        .then(() => new Promise((resolve, reject) => {
            const rs = fs.createReadStream(origin);
            const ws = fs.createWriteStream(to);
            ws.on('close', resolve);
            rs.on('error', reject);
            ws.on('error', reject);
            rs.pipe(ws);
        }));
    let isProcessFile;

    files.forEach((file) => {
        isProcessFile = isProcessFileCfg;
        for (const opt of popts) {
            if (opt.test(file)) {
                isProcessFile = !isProcessFile;
                break;
            }
        }

        if (isProcessFile && file) {
            let fileParts = file.replace(pathReplace, '').split('/');
            const fileName = fileParts.pop();
            fileParts = fileParts.join('/');
            const origin = mpath.join(path, fileParts, fileName);
            const to = mpath.join(dest, fileParts, fileName);
            if (fs.existsSync(origin)) {
                logFileProgress('Copying resource', `from ${origin} to ${to}`);
                promises.push(copyFile(fileParts, origin, to));
            }
        }
    });

    return Promise.all(promises);
}

/**
 * Process each template to see if there is an script or css in there.
 * This is not fully reliable as it does not annotate/lint/minify scripts.
 * It just copies the script from path to dest.
 * @param content {string} the content of html template.
 * @param path {string} the path to the template.
 * @param dest {string} the output directory for whole build.
 */
function processTemplateResources(content, path, dest) {
    return getResources(content)
        .then(r => Promise.all([copyFiles(r.scripts, path, dest), copyFiles(r.links, path, dest)]));
}

/**
 * Prepare the template files for an Angular app and saves all resources found
 * in each template (scripts and links).
 * @param path {string} the path of the angular app
 * @param dest {string} the dest for scripts and links found in templates
 * @return {Promise} with the templates script data
 */
function prepareTemplates(path, dest) {
    const allMessages = [];
    let isNoErrors = true;

    return templateCache({
        angularRoot: path,
        fileName: 'templates.js',
        moduleName: 'templates',
        standalone: false,
        isCreateOutput: false,
        isNgAnnotate: true,
        progress: (p) => {
            logFileProgress('Processing template', p);
            return true;
        },
        contentModifier: (content, filePath) => {
            const messages = lintHtml(content, path, filePath.replace(path, ''));
            if (messages.length > 0) {
                allMessages.push({
                    filePath,
                    messages,
                });
                if (!options.noFailLint) {
                    isNoErrors = false;
                    return Promise.reject('Linting failed');
                }
            }
            return processTemplateResources(content, path, dest)
                .then(() => {
                    logFileProgress('Processing content of template', filePath);
                    return preprocess(content, preprocessOptions);
                });
        },
    })
        .then((_templatesjs) => {
            const reportName = `htmllint-report-${path.replace(projectRoot, '').replace(/\//g, '-')}.html`;
            return prepareExtendedReport(allMessages, reportName, eslintReporter)
                .then(() => (isNoErrors ? _templatesjs : Promise.reject('HTML hint errors')));
        });
}

/**
 * Performs the following tasks for each script provided in the script paths array:
 * preprocess, ngAnnotate, jshint, uglify.
 * @param scripts {Array} an array with relative paths of scripts.
 * @param path {string} the path to the scripts relative path.
 */
function processScripts(scripts, path) {
    const allMessages = [];
    const promises = [];
    let isNoErrors = true;

    scripts.forEach((script) => {
        if (script) {
            const promise = readFile(mpath.join(path, script), options.preprocessResources)
                .then(code => ({
                    messages: lintJs(code, path, script),
                    code,
                }))
                .then(d => ({
                    messages: d.messages,
                    code: d.code.replace(/(templateUrl)[\s]*:[\s]*([^\n,]+)/g, 'templateProvider:function($templateCache){return $templateCache.get($2)}'),
                }))
                .then((d) => {
                    const code = d.code;
                    logFileProgress('Annotating', mpath.join(path, script));
                    const res = ngAnnotate(code, { add: true });
                    if (res.errors && res.errors.length) {
                        throw new Error(res.errors.join(','));
                    }
                    return {
                        messages: d.messages,
                        code: res.src,
                    };
                })
                .then((d) => {
                    const messages = d.messages;
                    let code = d.code;
                    if (messages.length > 0) {
                        allMessages.push({
                            filePath: mpath.join(path, script),
                            messages,
                        });
                        if (!options.noFailLint) {
                            isNoErrors = false;
                            throw new Error('Linting failed');
                        }
                    }
                    if (!options.skipComp && isNoErrors) {
                        if (!/\.min\.js$/gi.test(script)) {
                            logFileProgress('Minifying', script);
                            const res = uglify.minify(code, uglifyOpts);
                            code = res.code;
                        }
                    }
                    return `~(function(){\n${code}\n})()`;
                })
                .catch((err) => {
                    logFileProgress(err, mpath.join(path, script), 'error');
                });

            promises.push(promise);
        }
    });

    return Promise.all(promises)
        .then((jsData) => {
            const reportName = `eslint-report-${path.replace(projectRoot, '').replace(/\//g, '-')}.html`;
            return prepareExtendedReport(allMessages, reportName, eslintReporter)
                .then(() => (isNoErrors ? jsData.join('\n') : Promise.reject('JS lint errors')));
        });
}


/**
 * Performs the following tasks for each link provided in the link paths array: cssnano.
 * @param links {Array} an array with relative paths of links.
 * @param path {string} the path to the links relative path.
 */
function processLinks(links, path) {
    const promises = [];
    links.forEach((link) => {
        const promise = readFile(mpath.join(path, link), options.preprocessResources)
            .then(code => code.replace(/\.\.\/fonts\/ionicons/g, `${bowerInner}/ionic/fonts/ionicons`))
            .then(code => code.replace(/\.\.\/fonts\/fontawesome/g, `${bowerInner}/components-font-awesome/fonts/fontawesome`))
            .then(code => code.replace(/\.\.\/img\//g, 'img/'))
            .then(code => code.replace(/\.\.\/fonts\//g, 'fonts/'))
            .then((code) => {
                if (!options.skipComp) {
                    if (!/(\.min\.css$|\.min\.css\?)/gi.test(link)) {
                        logFileProgress('Minifying', link);
                        return cssnano.process(code);
                    }
                }
                return code;
            })
            .catch(err => logFileProgress(err.code, mpath.join(path, link), 'error'));
        promises.push(promise);
    });
    return Promise.all(promises)
        .then(cssData => cssData.join('\n'));
}

/**
 * Process all non .js and non .css resources copying them from path/to/resource to dest/to/resource
 * @param path {string} the path where the resources to be processed are.
 * @param dest {string} the path where the resources must be copied.
 */
function processResources(path, dest) {
    return new Promise((resolve, reject) => {
        glob(`${path}/**/*`, { nodir: true }, (err, files) => {
            copyFiles(files, path, dest, { exclude: [/\.js$/i, /\.css$/i, /\.html$/i] })
                .then(resolve, reject);
        });
    });
}

/**
 * Completly process angular app:
 * Embed all html templates in $templateCache, preprocess index.html,
 * minimize and concat all scripts and links and write all stuff in dest
 * @param path {string} the path where angular app is.
 * @param dest {string} the path where angular app will be build.
 * @param localPath {string} the path in dest where the app should be build.
 * @return {Promise}
 */
function processAngular(path, dest, localPath) {
    const destPath = mpath.join(dest, localPath || '');
    let indexData;
    let processedResources;
    let templatesjs;

    logFileProgress('Processing angular app', path);
    return prepareTemplates(path, destPath)
        .then((_templatesjs) => {
            const index = mpath.join(path, 'index.html');
            templatesjs = _templatesjs;
            return readFile(index, true);
        })
        .then((_indexData) => {
            indexData = _indexData;
            return getResources(indexData);
        })
        .then((_processedResources) => {
            const results = [];
            processedResources = _processedResources;
            return processScripts(processedResources.scripts, path)
                .then((jsData) => {
                    results.push(jsData);
                    return processLinks(processedResources.links, path);
                })
                .then((cssData) => {
                    results.push(cssData);
                    return processResources(path, destPath);
                })
                .then(() => results);
        })
        .then((results) => {
            let jsData = results[0];
            const cssData = results[1];
            if (!jsData && !cssData) {
                return Promise.reject('CSS and JS failed');
            }
            if (!jsData) {
                return Promise.reject('JS failed');
            }
            if (!cssData) {
                return Promise.reject('CSS failed');
            }
            jsData += `\n~(function(){\n${templatesjs}\n})()`;
            indexData = processedResources.indexData;
            indexData = indexData.replace(/<!--startcss-->[^]+<!--endcss-->/gi, `<link href="all.min.css?v=${new Date().getTime()}" rel="stylesheet">`);
            indexData = indexData.replace(/<!--startsrc-->[^]+<!--endsrc-->/gi, `<script src="all.min.js?v=${new Date().getTime()}"></script>`);
            indexData = htmlMinify(indexData, htmlMinOpts);

            return Promise.all([
                writeFile(destPath, 'index.html', indexData),
                writeFile(destPath, 'all.min.js', jsData),
                writeFile(destPath, 'all.min.css', cssData),
            ]);
        });
}

function mv(orig, dest) {
    return new Promise((resolve, reject) => {
        mvExt(orig, dest, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function clean(dest) {
    logFileProgress('Cleaning', dest);
    return del([dest]);
}

function init(context) {
    preprocessOptions = prepareOptions(context.opts.options || {});
    projectRoot = context.opts.projectRoot;

    try {
        bowerDir = JSON.parse(fs.readFileSync(mpath.join(projectRoot, '.bowerrc'), 'utf8')).directory.replace(/(\/?|^)www\//g, 'src/');
    } catch (err) {
        bowerDir = 'bower_components';
    }
    skipLintRegex = new RegExp(`(${bowerDir}/|node_modules/)`, 'i');
    const bowerParts = bowerDir.split('/');
    while (bowerParts.shift() !== 'src');
    bowerInner = bowerParts.join('/');
    global.logger = new winston.Logger({
        transports: [
            new (winston.transports.Console)(),
        ],
    });
    logger.filters.push((level, msg) => `${chalk.gray(formatYMDHMDate(new Date()))} - ${msg}`);
}

module.exports = {
    init,
    clean,
    mv,
    processAngular,
    ensureDirExists,
    readFile,
    writeFile,
    copyFiles,
};
