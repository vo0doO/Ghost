const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');

module.exports = createTransactionalMigration(
    async function up() {
        logging.info('4.22 Second up - bout to throw');
        throw new Error('fuck');
    },
    async function down() {
        logging.info('4.22 Second down');
    }
);
