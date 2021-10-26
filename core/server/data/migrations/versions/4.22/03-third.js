const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');

module.exports = createTransactionalMigration(
    async function up() {
        logging.info('4.22 Third up');
    },
    async function down() {
        logging.info('4.22 Third down');
    }
);
