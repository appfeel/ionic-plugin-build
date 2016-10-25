

module.exports = context => new Promise((resolve, reject) => {
    const npm = context.requireCordovaModule('npm');
    npm.load({
        prefix: context.opts.plugin.dir,
    }, err => (err ? reject(err) : npm.commands.install(e => (e ? reject(e) : resolve()))));
});
