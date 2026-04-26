const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { buildBot } = require('./bot');
const { startExamsCron } = require('./services/examsCron');
const { startChallengesCron, ensureDailyChallenge } = require('./services/challengesCron');
const { startAdminReportCron } = require('./services/adminReportCron');

async function main() {
  const bot = buildBot();

  const stop = async () => {
    await bot.stop('stop');
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await bot.launch();
  startExamsCron(bot);
  startChallengesCron(bot);
  startAdminReportCron(bot);
  ensureDailyChallenge().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('ensureDailyChallenge on boot', e);
  });
  // eslint-disable-next-line no-console
  console.log('nokbat_alshamal_bot يعمل الآن');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
