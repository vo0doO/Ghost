const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');

module.exports = createTransactionalMigration(
    async function up() {
        logging.info('4.21 First up');
    },
    async function down() {
        logging.info('4.21 First down');
    }
);
