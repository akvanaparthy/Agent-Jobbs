/**
 * User Data Manager - Stores and manages user profile information
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { humanInput } from './humanInput';

export interface UserProfile {
  personalInfo: {
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    linkedIn?: string;
    portfolio?: string;
    github?: string;
  };
  workAuth: {
    authorized?: boolean;
    requireSponsorship?: boolean;
    citizenship?: string;
  };
  demographics: {
    veteran?: boolean;
    disability?: boolean;
    gender?: string;
    ethnicity?: string;
  };
  preferences: {
    remotePreference?: 'onsite' | 'hybrid' | 'remote';
    salaryExpectation?: string;
    availableStartDate?: string;
    willingToRelocate?: boolean;
  };
  experience: {
    yearsOfExperience?: number;
    currentTitle?: string;
    currentCompany?: string;
    highestEducation?: string;
  };
  customFields: Record<string, any>;
}

class UserDataManager {
  private dataPath: string;
  private userData: UserProfile | null = null;
  private modified: boolean = false;

  constructor() {
    this.dataPath = path.resolve(process.cwd(), 'data', 'user-profile.json');
  }

  /**
   * Load user profile from disk
   */
  async load(): Promise<UserProfile> {
    if (this.userData) {
      return this.userData;
    }

    try {
      const exists = await fs.access(this.dataPath).then(() => true).catch(() => false);

      if (exists) {
        const content = await fs.readFile(this.dataPath, 'utf-8');
        this.userData = JSON.parse(content);
        logger.info('User profile loaded', { path: this.dataPath });
      } else {
        // Create empty profile
        this.userData = this.createEmptyProfile();
        await this.save();
        logger.info('Created new user profile', { path: this.dataPath });
      }

      return this.userData!;
    } catch (error) {
      logger.error('Failed to load user profile', { error });
      this.userData = this.createEmptyProfile();
      return this.userData;
    }
  }

  /**
   * Save user profile to disk
   */
  async save(): Promise<void> {
    if (!this.userData) {
      return;
    }

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });

      // Write file
      await fs.writeFile(
        this.dataPath,
        JSON.stringify(this.userData, null, 2),
        'utf-8'
      );

      this.modified = false;
      logger.info('User profile saved', { path: this.dataPath });
    } catch (error) {
      logger.error('Failed to save user profile', { error });
      throw error;
    }
  }

  /**
   * Get a value from user profile
   */
  async get(path: string): Promise<any> {
    const profile = await this.load();

    // Navigate path (e.g., "personalInfo.phone")
    const parts = path.split('.');
    let current: any = profile;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Set a value in user profile
   */
  async set(path: string, value: any): Promise<void> {
    const profile = await this.load();

    // Navigate and set value
    const parts = path.split('.');
    let current: any = profile;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;

    this.modified = true;
    await this.save();

    logger.info('User profile updated', { path, value });
  }

  /**
   * Get value with fallback to asking human
   */
  async getOrAsk(path: string, question: string, options?: {
    saveAfterAsking?: boolean;
    validate?: (answer: string) => boolean | string;
  }): Promise<any> {
    // Try to get from stored data
    const stored = await this.get(path);

    if (stored !== undefined && stored !== null && stored !== '') {
      logger.info('Retrieved value from user profile', { path, value: stored });
      return stored;
    }

    // Ask human for the value
    logger.info('Value not found in profile, asking human', { path });

    const answer = await humanInput.askHuman(question, { validate: options?.validate });

    // Save if requested (default: true)
    if (options?.saveAfterAsking !== false) {
      await this.set(path, answer);
      console.log(`✅ Saved "${answer}" to your profile for future use`);
    }

    return answer;
  }

  /**
   * Check if value exists
   */
  async has(path: string): Promise<boolean> {
    const value = await this.get(path);
    return value !== undefined && value !== null && value !== '';
  }

  /**
   * Delete a value
   */
  async delete(path: string): Promise<void> {
    const profile = await this.load();

    const parts = path.split('.');
    let current: any = profile;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        return; // Path doesn't exist
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    delete current[lastPart];

    this.modified = true;
    await this.save();

    logger.info('Value deleted from user profile', { path });
  }

  /**
   * Get all data
   */
  async getAll(): Promise<UserProfile> {
    return await this.load();
  }

  /**
   * Setup wizard - interactively collect user profile
   */
  async setupWizard(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('👤 USER PROFILE SETUP WIZARD');
    console.log('='.repeat(60));
    console.log('\nThis will help the agent fill out application forms automatically.');
    console.log('You can skip any question by pressing Enter.\n');

    const profile = await this.load();

    // Personal Info
    console.log('\n📋 PERSONAL INFORMATION\n');

    profile.personalInfo.phone = await humanInput.askHuman(
      'Phone number',
      { defaultValue: profile.personalInfo.phone }
    );

    profile.personalInfo.address = await humanInput.askHuman(
      'Street address',
      { defaultValue: profile.personalInfo.address }
    );

    profile.personalInfo.city = await humanInput.askHuman(
      'City',
      { defaultValue: profile.personalInfo.city }
    );

    profile.personalInfo.state = await humanInput.askHuman(
      'State (2-letter code)',
      { defaultValue: profile.personalInfo.state }
    );

    profile.personalInfo.zipCode = await humanInput.askHuman(
      'ZIP code',
      { defaultValue: profile.personalInfo.zipCode }
    );

    profile.personalInfo.linkedIn = await humanInput.askHuman(
      'LinkedIn URL (optional)',
      { defaultValue: profile.personalInfo.linkedIn }
    );

    profile.personalInfo.portfolio = await humanInput.askHuman(
      'Portfolio URL (optional)',
      { defaultValue: profile.personalInfo.portfolio }
    );

    profile.personalInfo.github = await humanInput.askHuman(
      'GitHub URL (optional)',
      { defaultValue: profile.personalInfo.github }
    );

    // Work Authorization
    console.log('\n💼 WORK AUTHORIZATION\n');

    const authorized = await humanInput.confirm(
      'Are you authorized to work in the US?',
      profile.workAuth.authorized ?? true
    );
    profile.workAuth.authorized = authorized;

    if (authorized) {
      const sponsorship = await humanInput.confirm(
        'Will you require sponsorship now or in the future?',
        profile.workAuth.requireSponsorship ?? false
      );
      profile.workAuth.requireSponsorship = sponsorship;
    }

    // Demographics (all optional)
    console.log('\n📊 DEMOGRAPHICS (Optional - used for EEO reporting)\n');

    const veteran = await humanInput.choose(
      'Are you a veteran?',
      ['Yes', 'No', 'Prefer not to say']
    );
    profile.demographics.veteran = veteran === 'Yes' ? true : veteran === 'No' ? false : undefined;

    const disability = await humanInput.choose(
      'Do you have a disability?',
      ['Yes', 'No', 'Prefer not to say']
    );
    profile.demographics.disability = disability === 'Yes' ? true : disability === 'No' ? false : undefined;

    profile.demographics.gender = await humanInput.choose(
      'Gender',
      ['Male', 'Female', 'Non-binary', 'Prefer not to say']
    );

    profile.demographics.ethnicity = await humanInput.choose(
      'Ethnicity',
      [
        'White',
        'Black or African American',
        'Hispanic or Latino',
        'Asian',
        'Native American',
        'Pacific Islander',
        'Two or more races',
        'Prefer not to say',
      ]
    );

    // Preferences
    console.log('\n⚙️  JOB PREFERENCES\n');

    profile.preferences.remotePreference = await humanInput.choose(
      'Work location preference?',
      ['onsite', 'hybrid', 'remote']
    ) as any;

    profile.preferences.salaryExpectation = await humanInput.askHuman(
      'Salary expectation (e.g., "100,000-150,000")',
      { defaultValue: profile.preferences.salaryExpectation }
    );

    profile.preferences.availableStartDate = await humanInput.askHuman(
      'Available start date (e.g., "Immediately", "2 weeks notice", "1 month")',
      { defaultValue: profile.preferences.availableStartDate || '2 weeks notice' }
    );

    const relocate = await humanInput.confirm(
      'Willing to relocate?',
      profile.preferences.willingToRelocate ?? false
    );
    profile.preferences.willingToRelocate = relocate;

    // Experience
    console.log('\n💼 EXPERIENCE\n');

    const years = await humanInput.askHuman(
      'Years of professional experience',
      {
        defaultValue: profile.experience.yearsOfExperience?.toString(),
        validate: (ans) => !isNaN(Number(ans)) || 'Please enter a number',
      }
    );
    profile.experience.yearsOfExperience = Number(years);

    profile.experience.currentTitle = await humanInput.askHuman(
      'Current or most recent job title',
      { defaultValue: profile.experience.currentTitle }
    );

    profile.experience.currentCompany = await humanInput.askHuman(
      'Current or most recent company',
      { defaultValue: profile.experience.currentCompany }
    );

    profile.experience.highestEducation = await humanInput.choose(
      'Highest level of education',
      [
        'High School',
        'Associate Degree',
        'Bachelor\'s Degree',
        'Master\'s Degree',
        'PhD',
        'Other',
      ]
    );

    // Save everything
    this.userData = profile;
    await this.save();

    console.log('\n' + '='.repeat(60));
    console.log('✅ PROFILE SETUP COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nYour profile has been saved to: ${this.dataPath}`);
    console.log('The agent will use this information to fill out applications.\n');
  }

  /**
   * Create empty profile structure
   */
  private createEmptyProfile(): UserProfile {
    return {
      personalInfo: {},
      workAuth: {},
      demographics: {},
      preferences: {},
      experience: {},
      customFields: {},
    };
  }

  /**
   * Get stats
   */
  async getStats(): Promise<{ completeness: number; fieldsPopulated: number; totalFields: number }> {
    const profile = await this.load();

    let populated = 0;
    let total = 0;

    const count = (obj: any) => {
      for (const key in obj) {
        if (key === 'customFields') continue;

        const value = obj[key];
        total++;

        if (value !== undefined && value !== null && value !== '') {
          if (typeof value === 'object' && !Array.isArray(value)) {
            count(value);
          } else {
            populated++;
          }
        }
      }
    };

    count(profile);

    const completeness = total > 0 ? Math.round((populated / total) * 100) : 0;

    return {
      completeness,
      fieldsPopulated: populated,
      totalFields: total,
    };
  }
}

// Export singleton
export const userDataManager = new UserDataManager();
