/* global logger */

'use strict'; // eslint-disable-line strict, lines-around-directive

const path = require('path');

module.exports = context => new Promise((resolve, reject) => {
    const exec = context.requireCordovaModule('child_process').execSync;
    const projectRoot = context.opts.projectRoot;
    const src = path.join(projectRoot, 'src');
    const www = path.join(projectRoot, 'www');

    try {
        exec('npm i', { cwd: context.opts.plugin.dir, env: process.env, stdio: 'inherit' });
        const common = require('./common'); // eslint-disable-line global-require

        common.init(context);
        common.mv(www, src)
            .catch(() => Promise.resolve())
            .then(() => common.ensureDirExists(www))
            .then(() => {
                logger.log('warn', 'Remember that all development has to be done in `src` folder');
                resolve();
            });
    } catch (err) {
        reject(err);
    }
});
