/* global logger */

const path = require('path');
const common = require('./common');

module.exports = context => new Promise((resolve, reject) => {
    const projectRoot = context.opts.projectRoot;
    const npm = context.requireCordovaModule('npm');
    const src = path.join(projectRoot, 'src');
    const www = path.join(projectRoot, 'www');

    common.init(context);
    npm.load({
        prefix: context.opts.plugin.dir,
    }, (err) => {
        if (err) {
            reject(err);
        } else {
            npm.commands.install((e) => {
                if (e) {
                    reject(e);
                } else {
                    common.mv(www, src)
                        .then(() => common.ensureDirExists(www))
                        .then(() => {
                            logger.log('warn', 'Remember that all development has to be done in `src` folder');
                            resolve();
                        });
                }
            });
        }
    });
});
