const _ = require('lodash');
const config = require('../../../shared/config');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const moment = require('moment');
const models = require('../../models');
const mail = require('../mail');

const messages = {
    setupAlreadyCompleted: 'Setup has already been completed.',
    setupMustBeCompleted: 'Setup must be completed before making this request.',
    setupUnableToRun: 'Database missing fixture data. Please reset database and try again.',
    sampleBlogDescription: 'Thoughts, stories and ideas.',
    yourNewGhostBlog: 'Your New Ghost Site',
    unableToSendWelcomeEmail: 'Unable to send welcome email, your site will continue to function.'
};

const postSetupFixtures = {
    'coming-soon': '{"version":"0.3.1","atoms":[],"cards":[],"markups":[["a",["href","__GHOST_URL__/#/portal/"]]],"sections":[[1,"p",[[0,[],0,"This is {{site.title}}, a brand new site by {{author.name}} that\'s just getting started. Things will be up and running here shortly, but you can "],[0,[0],1,"subscribe"],[0,[],0," in the meantime if you\'d like to stay up to date and receive emails when new content is published!"]]]],"ghostVersion":"4.0"}',
    about: '{"version":"0.3.1","atoms":[],"cards":[["hr",{}]],"markups":[["a",["href","https://ghost.org"]]],"sections":[[1,"p",[[0,[],0,"{{site.title}} is an independent publication launched in {{date}} by {{author.name}}. If you subscribe today, you\'ll get full access to the website as well as email newsletters about new content when it\'s available. Your subscription makes this site possible, and allows {{site.title}} to continue to exist. Thank you!"]]],[1,"h3",[[0,[],0,"Access all areas"]]],[1,"p",[[0,[],0,"By signing up, you\'ll get access to the full archive of everything that\'s been published before and everything that\'s still to come. Your very own private library."]]],[1,"h3",[[0,[],0,"Fresh content, delivered"]]],[1,"p",[[0,[],0,"Stay up to date with new content sent straight to your inbox! No more worrying about whether you missed something because of a pesky algorithm or news feed."]]],[1,"h3",[[0,[],0,"Meet people like you"]]],[1,"p",[[0,[],0,"Join a community of other subscribers who share the same interests."]]],[10,0],[1,"h3",[[0,[],0,"Start your own thing"]]],[1,"p",[[0,[],0,"Enjoying the experience? Get started for free and set up your very own subscription business using "],[0,[0],1,"Ghost"],[0,[],0,", the same platform that powers this website."]]]],"ghostVersion":"4.0"}'
};

/**
 * Returns setup status
 *
 * @return {Promise<Boolean>}
 */
async function checkIsSetup() {
    return models.User.isSetup();
}

/**
 * Allows an assertion to be made about setup status.
 *
 * @param  {Boolean} status True: setup must be complete. False: setup must not be complete.
 * @return {Function} returns a "task ready" function
 */
function assertSetupCompleted(status) {
    return async function checkPermission(__) {
        const isSetup = await checkIsSetup();

        if (isSetup === status) {
            return __;
        }

        const completed = tpl(messages.setupAlreadyCompleted);
        const notCompleted = tpl(messages.setupMustBeCompleted);

        function throwReason(reason) {
            throw new errors.NoPermissionError({message: reason});
        }

        if (isSetup) {
            throwReason(completed);
        } else {
            throwReason(notCompleted);
        }
    };
}

async function setupUser(userData) {
    const context = {context: {internal: true}};

    const owner = await models.User.findOne({role: 'Owner', status: 'all'});

    if (!owner) {
        throw new errors.GhostError({
            message: tpl(messages.setupUnableToRun)
        });
    }

    const user = await models.User.setup(userData, _.extend({id: owner.id}, context));

    return {
        user: user,
        userData: userData
    };
}

async function doSettings(data, settingsAPI) {
    const context = {context: {user: data.user.id}};
    const user = data.user;
    const blogTitle = data.userData.blogTitle;

    let userSettings;

    if (!blogTitle || typeof blogTitle !== 'string') {
        return user;
    }

    userSettings = [
        {key: 'title', value: blogTitle.trim()},
        {key: 'description', value: tpl(messages.sampleBlogDescription)}
    ];

    await settingsAPI.edit({settings: userSettings}, context);

    return user;
}

async function doProduct(data, productsAPI) {
    const context = {context: {user: data.user.id}};
    const user = data.user;
    const blogTitle = data.userData.blogTitle;

    if (!blogTitle || typeof blogTitle !== 'string') {
        return user;
    }
    try {
        const page = await productsAPI.browse({limit: 1});

        const [product] = page.products;
        if (!product) {
            return data;
        }

        productsAPI.edit({products: [{name: blogTitle.trim()}]}, {context: context.context, id: product.id});
    } catch (e) {
        return data;
    }

    return data;
}

async function doFixtures(data) {
    const date = moment().format('MMMM YYYY');

    _.each(postSetupFixtures, async (mobiledoc, key) => {
        // Using very simple find and replace because we control the fixtures
        mobiledoc = mobiledoc.replace(/{{site.title}}/g, data.userData.blogTitle);
        mobiledoc = mobiledoc.replace(/{{author.name}}/g, data.userData.name);
        mobiledoc = mobiledoc.replace(/{{date}}/, date);

        const post = await models.Post.findOne({slug: key});
        await models.Post.edit({mobiledoc}, {id: post.id});
    });

    return data;
}

function sendWelcomeEmail(email, mailAPI) {
    if (config.get('sendWelcomeEmail')) {
        const data = {
            ownerEmail: email
        };

        return mail.utils.generateContent({data: data, template: 'welcome'})
            .then((content) => {
                const message = {
                    to: email,
                    subject: tpl(messages.yourNewGhostBlog),
                    html: content.html,
                    text: content.text
                };

                const payload = {
                    mail: [{
                        message: message,
                        options: {}
                    }]
                };

                mailAPI.send(payload, {context: {internal: true}})
                    .catch((err) => {
                        err.context = tpl(messages.unableToSendWelcomeEmail);
                        logging.error(err);
                    });
            });
    }
    return Promise.resolve();
}

module.exports = {
    checkIsSetup: checkIsSetup,
    assertSetupCompleted: assertSetupCompleted,
    setupUser: setupUser,
    doSettings: doSettings,
    doProduct: doProduct,
    doFixtures: doFixtures,
    sendWelcomeEmail: sendWelcomeEmail
};
