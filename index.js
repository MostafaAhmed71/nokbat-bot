const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { buildBot } = require('./bot');

async function main() {
  const bot = buildBot();

  const stop = async () => {
    await bot.stop('stop');
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await bot.launch();
  // eslint-disable-next-line no-console
  console.log('nokbat_alshamal_bot يعمل الآن');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
