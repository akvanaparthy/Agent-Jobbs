/**
 * Smart Answer Handler - Intelligent Q&A with confidence-based human interaction
 */

import { logger } from '../utils/logger';
import { humanInput } from './humanInput';
import { chromaDB } from '../storage/chromaDB';
import { qaAgent } from '../agents/qaAgent';
import { userDataManager } from './userDataManager';
import { JobListing, ApplicationQuestion } from '../types';

export interface AnswerResult {
  answer: string;
  confidence: number;
  source: 'cached' | 'resume' | 'profile' | 'human';
  saved: boolean;
}

/**
 * Smart Answer Handler with 3-tier confidence system
 * 
 * >= 90%: Auto-apply, ask if should save
 * 75-89%: Suggest answer, wait for approval
 * < 75%: Ask human for answer
 */
export class SmartAnswerHandler {
  /**
   * Get answer for a question with intelligent confidence handling
   */
  async getAnswer(
    question: ApplicationQuestion,
    job: JobListing,
    context?: string
  ): Promise<AnswerResult> {
    logger.info('🤔 Processing question with smart answer handler', {
      question: question.label,
      type: question.type,
    });

    // Step 1: Check for cached answer in ChromaDB
    const cached = await this.checkCachedAnswer(question.label);
    
    if (cached) {
      logger.info('✅ Found cached answer', { 
        question: question.label,
        usageCount: cached.usageCount 
      });

      console.log('\n' + '='.repeat(60));
      console.log('💾 CACHED ANSWER FOUND');
      console.log('='.repeat(60));
      console.log(`\nQuestion: ${question.label}`);
      console.log(`Cached Answer: ${cached.answer}`);
      console.log(`Used ${cached.usageCount || 1} time(s) before\n`);
      
      const useCache = await humanInput.confirm(
        'Use this cached answer?',
        true // Default: yes
      );

      if (useCache) {
        // Update usage count
        await this.incrementUsageCount(cached.id);
        
        return {
          answer: cached.answer,
          confidence: 1.0, // Cached = 100% confidence
          source: 'cached',
          saved: false, // Already saved
        };
      }

      console.log('🔄 Will generate new answer instead...\n');
    }

    // Step 2: Check user profile for common fields
    const profileAnswer = await this.checkUserProfile(question.label);
    
    if (profileAnswer) {
      logger.info('📋 Found answer in user profile', { 
        question: question.label 
      });

      return {
        answer: profileAnswer,
        confidence: 1.0,
        source: 'profile',
        saved: false, // Profile data doesn't go to ChromaDB
      };
    }

    // Step 3: Generate answer from resume using QA Agent
    const generatedAnswer = await qaAgent.answerQuestion(question, job);

    const confidence = generatedAnswer.confidence;

    logger.info('📊 Generated answer with confidence', {
      question: question.label,
      confidence,
      tier: this.getConfidenceTier(confidence),
    });

    // Step 4: Handle based on confidence level
    return await this.handleByConfidence(
      question.label,
      generatedAnswer.answer,
      confidence,
      question.type,
      question.options
    );
  }

  /**
   * Check ChromaDB for cached answer
   */
  private async checkCachedAnswer(question: string): Promise<any | null> {
    try {
      const similar = await chromaDB.searchSimilarQuestions(question, 1);
      
      if (similar.length > 0 && similar[0]) {
        // Consider it a match if similarity is high
        // (ChromaDB returns most similar first)
        return similar[0];
      }

      return null;
    } catch (error) {
      logger.error('Failed to check cached answer', { error });
      return null;
    }
  }

  /**
   * Check user profile for answer
   */
  private async checkUserProfile(question: string): Promise<string | null> {
    const lowerQ = question.toLowerCase();

    // Map common questions to profile fields
    const profileMappings: Record<string, string> = {
      phone: 'personalInfo.phone',
      email: 'personalInfo.email',
      address: 'personalInfo.address',
      city: 'personalInfo.city',
      state: 'personalInfo.state',
      'zip code': 'personalInfo.zipCode',
      linkedin: 'personalInfo.linkedIn',
      github: 'personalInfo.github',
      portfolio: 'personalInfo.portfolio',
      'authorized to work': 'workAuth.authorized',
      'work authorization': 'workAuth.authorized',
      sponsorship: 'workAuth.requireSponsorship',
      veteran: 'demographics.veteran',
      disability: 'demographics.disability',
      gender: 'demographics.gender',
      ethnicity: 'demographics.ethnicity',
      'remote preference': 'preferences.remotePreference',
      salary: 'preferences.salaryExpectation',
      'start date': 'preferences.availableStartDate',
      relocate: 'preferences.willingToRelocate',
    };

    // Check if question matches any mapping
    for (const [keyword, fieldPath] of Object.entries(profileMappings)) {
      if (lowerQ.includes(keyword)) {
        const value = await userDataManager.get(fieldPath);
        
        if (value !== undefined && value !== null && value !== '') {
          // Format boolean values
          if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
          }
          return String(value);
        }
      }
    }

    return null;
  }

  /**
   * Get confidence tier
   */
  private getConfidenceTier(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 0.9) return 'high';
    if (confidence >= 0.75) return 'medium';
    return 'low';
  }

  /**
   * Handle answer based on confidence level
   */
  private async handleByConfidence(
    question: string,
    generatedAnswer: string,
    confidence: number,
    questionType: string,
    options?: string[]
  ): Promise<AnswerResult> {
    // HIGH CONFIDENCE (>= 90%): Auto-apply, ask if should save
    if (confidence >= 0.9) {
      return await this.handleHighConfidence(question, generatedAnswer, confidence);
    }

    // MEDIUM CONFIDENCE (75-89%): Suggest answer, wait for approval
    if (confidence >= 0.75) {
      return await this.handleMediumConfidence(
        question,
        generatedAnswer,
        confidence,
        questionType,
        options
      );
    }

    // LOW CONFIDENCE (< 75%): Ask human for answer
    return await this.handleLowConfidence(question, questionType, options);
  }

  /**
   * Handle HIGH confidence (>= 90%)
   * Auto-apply, ask if should save to ChromaDB
   */
  private async handleHighConfidence(
    question: string,
    answer: string,
    confidence: number
  ): Promise<AnswerResult> {
    console.log('\n' + '='.repeat(60));
    console.log('✅ HIGH CONFIDENCE ANSWER');
    console.log('='.repeat(60));
    console.log(`\nQuestion: ${question}`);
    console.log(`Answer: ${answer}`);
    console.log(`Confidence: ${Math.round(confidence * 100)}%\n`);
    console.log('This answer will be used automatically.');
    console.log('='.repeat(60) + '\n');

    // Ask if should save for future use
    const shouldSave = await humanInput.confirm(
      'Save this answer to memory for future applications?',
      true // Default: yes
    );

    let saved = false;

    if (shouldSave) {
      await this.saveAnswer(question, answer);
      saved = true;
      console.log('✅ Answer saved to memory\n');
    } else {
      console.log('⏭️  Answer will be used but not saved\n');
    }

    return {
      answer,
      confidence,
      source: 'resume',
      saved,
    };
  }

  /**
   * Handle MEDIUM confidence (75-89%)
   * Suggest answer, wait for approval/edit
   */
  private async handleMediumConfidence(
    question: string,
    suggestedAnswer: string,
    confidence: number,
    questionType: string,
    options?: string[]
  ): Promise<AnswerResult> {
    console.log('\n' + '='.repeat(60));
    console.log('⚠️  MEDIUM CONFIDENCE - REVIEW NEEDED');
    console.log('='.repeat(60));
    console.log(`\nQuestion: ${question}`);
    console.log(`Suggested Answer: ${suggestedAnswer}`);
    console.log(`Confidence: ${Math.round(confidence * 100)}%\n`);

    if (options && options.length > 0) {
      console.log('Available options:');
      options.forEach((opt, i) => {
        const isSelected = opt === suggestedAnswer ? ' ← SUGGESTED' : '';
        console.log(`  ${i + 1}. ${opt}${isSelected}`);
      });
      console.log('');
    }

    console.log('='.repeat(60) + '\n');

    // Ask for approval
    const choice = await humanInput.choose(
      'What would you like to do?',
      [
        'Use suggested answer',
        'Edit suggested answer',
        'Provide my own answer',
      ]
    );

    let finalAnswer = suggestedAnswer;

    if (choice === 'Edit suggested answer') {
      finalAnswer = await humanInput.askHuman(
        'Edit the answer',
        { defaultValue: suggestedAnswer }
      );
    } else if (choice === 'Provide my own answer') {
      if (options && options.length > 0) {
        finalAnswer = await humanInput.choose(
          'Select your answer',
          options
        );
      } else {
        finalAnswer = await humanInput.askHuman('Enter your answer');
      }
    }

    // Always save medium-confidence answers after approval
    await this.saveAnswer(question, finalAnswer);

    console.log('✅ Answer approved and saved to memory\n');

    return {
      answer: finalAnswer,
      confidence,
      source: choice === 'Use suggested answer' ? 'resume' : 'human',
      saved: true,
    };
  }

  /**
   * Handle LOW confidence (< 75%)
   * Ask human for answer directly
   */
  private async handleLowConfidence(
    question: string,
    questionType: string,
    options?: string[]
  ): Promise<AnswerResult> {
    console.log('\n' + '='.repeat(60));
    console.log('❓ LOW CONFIDENCE - HUMAN INPUT NEEDED');
    console.log('='.repeat(60));
    console.log(`\nQuestion: ${question}`);
    console.log('I\'m not confident enough to suggest an answer.\n');

    if (options && options.length > 0) {
      console.log('Available options:');
      options.forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt}`);
      });
      console.log('');
    }

    console.log('='.repeat(60) + '\n');

    let answer: string;

    if (options && options.length > 0) {
      answer = await humanInput.choose('Please select an answer', options);
    } else if (questionType === 'checkbox') {
      const checked = await humanInput.confirm(
        'Should this be checked?',
        false
      );
      answer = checked ? 'Yes' : 'No';
    } else {
      answer = await humanInput.askHuman('Please provide your answer');
    }

    // Always save low-confidence answers (these are human-provided)
    await this.saveAnswer(question, answer);

    console.log('✅ Answer saved to memory for future use\n');

    return {
      answer,
      confidence: 0, // Low confidence
      source: 'human',
      saved: true,
    };
  }

  /**
   * Save Q&A pair to ChromaDB
   */
  private async saveAnswer(question: string, answer: string): Promise<void> {
    try {
      await chromaDB.addQAPair({
        id: `qa-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        question,
        answer,
        category: 'application_form',
        keywords: [question.substring(0, 50)],
        usageCount: 1,
        lastUsed: new Date().toISOString(),
      });

      logger.info('💾 Saved Q&A pair to ChromaDB', { question, answer });
    } catch (error) {
      logger.error('Failed to save Q&A pair', { error });
    }
  }

  /**
   * Increment usage count for cached answer
   */
  private async incrementUsageCount(qaId: string): Promise<void> {
    try {
      // Note: ChromaDB doesn't support direct updates
      // This would require fetching, modifying, and re-adding
      // For now, just log the usage
      logger.info('📊 Used cached answer', { qaId });
    } catch (error) {
      logger.error('Failed to update usage count', { error });
    }
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalCachedAnswers: number;
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
  }> {
    try {
      const stats = await chromaDB.getStats();

      return {
        totalCachedAnswers: stats.qaPairs,
        highConfidenceCount: 0, // TODO: Track in memory
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0,
      };
    } catch (error) {
      return {
        totalCachedAnswers: 0,
        highConfidenceCount: 0,
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0,
      };
    }
  }
}

// Export singleton
export const smartAnswerHandler = new SmartAnswerHandler();
