/**
 * Setup User Profile - Interactive wizard to collect user information
 */

import { userDataManager } from '../agentic/userDataManager';
import { logger } from '../utils/logger';

async function main() {
  console.log('\n🤖 Agent-Jobbs User Profile Setup\n');

  try {
    // Check if profile already exists
    const stats = await userDataManager.getStats();

    if (stats.completeness > 0) {
      console.log(`\n✅ Existing profile found (${stats.completeness}% complete)\n`);
      console.log(`   Fields populated: ${stats.fieldsPopulated}/${stats.totalFields}\n`);

      // Show current profile
      const profile = await userDataManager.getAll();
      console.log('Current profile:');
      console.log(JSON.stringify(profile, null, 2));
      console.log('\n');
    }

    // Run setup wizard
    await userDataManager.setupWizard();

    // Show final stats
    const finalStats = await userDataManager.getStats();
    console.log(`\n✅ Profile is now ${finalStats.completeness}% complete`);
    console.log(`   Fields populated: ${finalStats.fieldsPopulated}/${finalStats.totalFields}\n`);

    console.log('The agent will now use this information when applying to jobs.');
    console.log('You can run this script again anytime to update your profile.\n');

  } catch (error) {
    console.error('\n❌ Error during setup:', error);
    logger.error('Profile setup failed', { error });
    process.exit(1);
  }

  process.exit(0);
}

main();
