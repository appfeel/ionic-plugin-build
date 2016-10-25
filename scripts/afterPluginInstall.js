/* global logger */

const path = require('path');

module.exports = context => new Promise((resolve, reject) => {
    const projectRoot = context.opts.projectRoot;
    const npm = context.requireCordovaModule('npm');
    const src = path.join(projectRoot, 'src');
    const www = path.join(projectRoot, 'www');

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
                    const common = require('./common'); // eslint-disable-line global-require

                    common.init(context);
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
