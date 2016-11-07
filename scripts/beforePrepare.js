#!/usr/bin/env node
/* global logger */

'use strict'; // eslint-disable-line strict, lines-around-directive

const path = require('path');
const fs = require('fs');
const common = require('./common');
const chokidar = require('chokidar');
const glob = require('glob');

let isServingFile;

/**
 * Removes the isServingFile, needed in order to know if we are under `phonegap serve` or not
 */
function cleanUp(isExit) {
    try {
        fs.unlinkSync(isServingFile);
    } catch (e) { } // eslint-disable-line no-empty

    if (isExit) {
        process.exit();
    }
}

/**
 * Watch any change in src and copies them to www
 */
function watch(src, www) {
    process.nextTick(() => {
        logger.info(`Watching ${src}`);
        chokidar.watch(path.join(src, '**/*'), {
            ignored: /[\/\\]\./,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100,
            },
            ignorePermissionErrors: true,
            ignoreInitial: true,
        })
            .on('all', (event, _path) => {
                logger.info(`${event}: ${_path}`);
                try {
                    common.copyFiles([_path], src, www);
                } catch (e) {
                    logger.error(e);
                }
            });
    });

    process.on('exit', () => cleanUp());
    process.on('SIGINT', () => cleanUp(true));
    process.on('uncaughtException', () => cleanUp(true));

    return Promise.resolve();
}

function serve(src, tmp, www) {
    return common.clean(www)
        .then(() => common.ensureDirExists(www))
        .then(() => new Promise((resolve, reject) => {
            glob(`${src}/**/*`, { nodir: true }, (err, files) => {
                common.copyFiles(files, src, www)
                    .then(resolve, reject);
            });
        }))
        .catch((err) => {
            logger.error('There was an error while processing before_prepare:', err);
            return Promise.reject(err);
        });
}

/**
 * Builds angular/ionic
 */
function build(src, tmp, www) {
    return common.clean(tmp)
        .then(() => common.ensureDirExists(tmp))
        .then(() => common.processAngular(src, tmp))
        .then(() => common.clean(www))
        .then(() => common.ensureDirExists(www))
        .then(() => common.mv(tmp, www))
        .then(() => common.clean(tmp))
        .catch((err) => {
            logger.error('There was an error while processing before_prepare:', err);
            return Promise.reject(err);
        });
}

/**
 * Process all sources from src to www.
 */
module.exports = (context) => {
    const projectRoot = context.opts.projectRoot;
    const src = path.join(projectRoot, 'src');
    const tmp = path.join(projectRoot, 'tmp');
    const www = path.join(projectRoot, 'www');
    let isServing;

    common.init(context);
    isServingFile = path.join(context.opts.plugin.dir, 'is-serving.tmp');

    // Is serving the app?
    try {
        fs.readFileSync(isServingFile);
        isServing = true;
    } catch (err) {
        isServing = false;
    }

    // Is called from phonegap serve?
    if (/\sserve/i.test(context.cmdLine) || /-w/i.test(context.cmdLine) || /-watch/i.test(context.cmdLine)) {
        fs.writeFileSync(isServingFile, 'true');
        return serve(src, tmp, www)
            .then(() => watch(src, www));
    } else if (!isServing) {
        return build(src, tmp, www);
    }

    return Promise.resolve();
};
