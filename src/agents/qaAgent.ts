import { ChatAnthropic } from '@langchain/anthropic';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { ApplicationQuestion, Answer, JobListing, QAPair } from '../types';
import { chromaDB } from '../storage/chromaDB';
import * as crypto from 'crypto';

export class QAAgent {
  private model: ChatAnthropic;

  constructor() {
    this.model = new ChatAnthropic({
      apiKey: config.anthropicApiKey,
      model: config.claudeModel,
      temperature: 0.5,
    });
  }

  /**
   * Answer an application question
   */
  async answerQuestion(
    question: ApplicationQuestion,
    job: JobListing
  ): Promise<Answer> {
    try {
      logger.debug('Answering question', { questionId: question.id, label: question.label });

      // First, search for similar questions in ChromaDB
      const similarQuestions = await chromaDB.searchSimilarQuestions(question.label, 3);

      // If we have a highly similar question with good answer, use it
      if (similarQuestions.length > 0) {
        const cached = similarQuestions[0];
        logger.info('Using cached answer', {
          questionId: question.id,
          cachedQuestionId: cached.id,
        });

        // Increment usage count
        await chromaDB.incrementUsageCount(cached.id);

        return {
          questionId: question.id,
          answer: cached.answer,
          confidence: 0.9, // High confidence for cached answers
          source: 'cached',
        };
      }

      // No cached answer found, generate new one
      logger.debug('Generating new answer');

      const answer = await this.generateAnswer(question, job);

      // Save to ChromaDB for future use
      await this.saveQAPair(question, answer);

      return answer;
    } catch (error) {
      logger.error('Failed to answer question', { error });

      return {
        questionId: question.id,
        answer: '',
        confidence: 0,
        source: 'user_input_required',
      };
    }
  }

  /**
   * Generate answer using Claude
   */
  private async generateAnswer(
    question: ApplicationQuestion,
    job: JobListing
  ): Promise<Answer> {
    try {
      // Get relevant resume context
      const resumeChunks = await chromaDB.searchResumeChunks(question.label, 5);

      const resumeContext = resumeChunks
        .map(chunk => `[${chunk.section}] ${chunk.text}`)
        .join('\n\n');

      // Build prompt based on question type
      let prompt = '';

      if (question.type === 'select' || question.type === 'radio') {
        // For dropdown/radio, need to select from options
        prompt = `You are helping a job candidate answer an application question.

Question: ${question.label}
${question.required ? '(Required)' : '(Optional)'}

Available options:
${question.options?.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

Job Information:
- Title: ${job.title}
- Company: ${job.company}
- Description: ${job.description.substring(0, 300)}...

Candidate Resume Context:
${resumeContext}

Please select the MOST APPROPRIATE option from the list above. Consider the candidate's background and the job requirements.

Respond with ONLY the exact text of the selected option, nothing else.`;
      } else if (question.type === 'checkbox') {
        // For checkbox, determine yes/no
        prompt = `You are helping a job candidate answer an application question.

Question: ${question.label}
Type: Yes/No checkbox

Job Information:
- Title: ${job.title}
- Company: ${job.company}

Candidate Resume Context:
${resumeContext}

Should the candidate check this box? Respond with ONLY "yes" or "no" and a brief reason.

Format:
Answer: yes|no
Reason: <brief explanation>`;
      } else {
        // For text/textarea questions - use strict JSON output
        const isPhoneQuestion = this.isPhoneQuestion(question.label);
        const isLinkedInQuestion = this.isLinkedInQuestion(question.label);
        const isURLQuestion = this.isURLQuestion(question.label);

        prompt = `<task>Extract the answer value for a job application question from the candidate's resume.</task>

<question>${question.label}</question>

<resume_context>
${resumeContext}
</resume_context>

<output_format>
Return ONLY valid JSON with NO other text before or after:
{
  "answer": "value",
  "confidence": 0.85
}
</output_format>

<rules>
${isPhoneQuestion ? '- answer must be phone number in format: +1XXXXXXXXXX (digits only, e.g., +15551234567)' : ''}
${isLinkedInQuestion ? '- answer must be full LinkedIn URL (e.g., https://linkedin.com/in/username)' : ''}
${isURLQuestion ? '- answer must be full URL starting with https://' : ''}
${!isPhoneQuestion && !isLinkedInQuestion && !isURLQuestion ? '- answer must be brief, professional response (max 2 sentences)' : ''}
- confidence: number between 0.0-1.0
- Return ONLY the JSON object, nothing else
- Do NOT add explanations, reasoning, or any text outside the JSON
</rules>

<example_output>
{"answer": "+15551234567", "confidence": 0.9}
</example_output>`;
      }

      const response = await (this.model as any).invoke(prompt);
      const responseText = response.content.toString().trim();

      // Parse answer based on type
      let finalAnswer = '';
      let confidence = 0.8; // Default confidence

      // For text/textarea questions, parse JSON response
      if (question.type !== 'checkbox' && question.type !== 'select' && question.type !== 'radio') {
        try {
          // Extract JSON from response (handle cases where Claude adds markdown code blocks)
          let jsonText = responseText;
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          }

          const parsed = JSON.parse(jsonText);
          finalAnswer = parsed.answer || '';
          confidence = parsed.confidence || 0.8;

          logger.debug('Parsed JSON response', { answer: finalAnswer, confidence });
        } catch (error) {
          // Fallback: treat entire response as answer
          logger.warn('Failed to parse JSON, using raw response', { error });
          finalAnswer = responseText;
          confidence = 0.5;
        }
      } else {
        // For select/radio/checkbox, use existing logic
        const answerText = responseText;

        if (question.type === 'checkbox') {
          const match = answerText.match(/Answer:\s*(yes|no)/i);
          if (match) {
            finalAnswer = match[1].toLowerCase();
            confidence = 0.85;
          } else {
            finalAnswer = 'no';
            confidence = 0.5;
          }
        } else if (question.type === 'select' || question.type === 'radio') {
          // Verify the answer is one of the options
          if (question.options?.some(opt => opt.toLowerCase() === answerText.toLowerCase())) {
            finalAnswer = answerText;
            confidence = 0.85;
          } else {
            // Try to find closest match
            const closestOption = question.options?.find(opt =>
              answerText.toLowerCase().includes(opt.toLowerCase()) ||
              opt.toLowerCase().includes(answerText.toLowerCase())
            );

            if (closestOption) {
              finalAnswer = closestOption;
              confidence = 0.7;
            } else {
              // Default to first option if no match
              finalAnswer = question.options?.[0] || '';
              confidence = 0.3;
            }
          }
        }
      }

      // Check if answer seems incomplete or uncertain
      if (!finalAnswer || finalAnswer.length < 3) {
        confidence = 0.3;
      }

      // Flag for user review if confidence is low
      const needsReview = confidence < 0.6;

      return {
        questionId: question.id,
        answer: finalAnswer,
        confidence,
        source: needsReview ? 'user_input_required' : 'generated',
      };
    } catch (error) {
      logger.error('Failed to generate answer', { error });

      return {
        questionId: question.id,
        answer: '',
        confidence: 0,
        source: 'user_input_required',
      };
    }
  }

  /**
   * Save Q&A pair to ChromaDB
   */
  private async saveQAPair(question: ApplicationQuestion, answer: Answer): Promise<void> {
    try {
      if (answer.confidence < 0.6) {
        // Don't save low-confidence answers
        return;
      }

      const qaPair: QAPair = {
        id: this.generateQAPairId(question.label),
        question: question.label,
        answer: answer.answer,
        category: this.categorizeQuestion(question.label),
        keywords: this.extractKeywords(question.label),
        usageCount: 1,
        lastUsed: new Date().toISOString(),
      };

      await chromaDB.addQAPair(qaPair);

      logger.debug('Q&A pair saved', { id: qaPair.id });
    } catch (error) {
      logger.error('Failed to save Q&A pair', { error });
    }
  }

  /**
   * Categorize question
   */
  private categorizeQuestion(questionText: string): string {
    const text = questionText.toLowerCase();

    if (text.includes('authorization') || text.includes('work permit') || text.includes('visa')) {
      return 'authorization';
    }
    if (text.includes('years') && text.includes('experience')) {
      return 'experience';
    }
    if (text.includes('salary') || text.includes('compensation')) {
      return 'compensation';
    }
    if (text.includes('start') || text.includes('available') || text.includes('notice')) {
      return 'availability';
    }
    if (text.includes('relocate') || text.includes('relocation')) {
      return 'relocation';
    }
    if (text.includes('degree') || text.includes('education')) {
      return 'education';
    }

    return 'general';
  }

  /**
   * Extract keywords from question
   */
  private extractKeywords(questionText: string): string[] {
    const keywords: string[] = [];
    const text = questionText.toLowerCase();

    const keywordPatterns = [
      'authorization',
      'work permit',
      'visa',
      'experience',
      'years',
      'salary',
      'compensation',
      'start date',
      'availability',
      'relocate',
      'degree',
      'education',
      'skills',
      'certification',
    ];

    keywordPatterns.forEach(pattern => {
      if (text.includes(pattern)) {
        keywords.push(pattern);
      }
    });

    return keywords;
  }

  /**
   * Generate unique ID for Q&A pair
   */
  private generateQAPairId(question: string): string {
    return `qa_${crypto.createHash('md5').update(question.toLowerCase()).digest('hex').substring(0, 12)}`;
  }

  /**
   * Check if question is asking for phone number
   */
  private isPhoneQuestion(questionText: string): boolean {
    const text = questionText.toLowerCase();
    return text.includes('phone') || text.includes('mobile') || text.includes('cell') || text.includes('number to receive');
  }

  /**
   * Check if question is asking for LinkedIn
   */
  private isLinkedInQuestion(questionText: string): boolean {
    const text = questionText.toLowerCase();
    return text.includes('linkedin');
  }

  /**
   * Check if question is asking for URL
   */
  private isURLQuestion(questionText: string): boolean {
    const text = questionText.toLowerCase();
    return text.includes('github') || text.includes('portfolio') || text.includes('website');
  }

  /**
   * Update an existing answer
   */
  async updateAnswer(questionId: string, newAnswer: string): Promise<void> {
    try {
      await chromaDB.updateQAPair(questionId, {
        answer: newAnswer,
        lastUsed: new Date().toISOString(),
      });

      logger.info('Answer updated', { questionId });
    } catch (error) {
      logger.error('Failed to update answer', { error });
    }
  }

  /**
   * Answer multiple questions in batch
   */
  async answerQuestions(
    questions: ApplicationQuestion[],
    job: JobListing
  ): Promise<Answer[]> {
    logger.info(`Answering ${questions.length} questions`);

    const answers: Answer[] = [];

    for (const question of questions) {
      const answer = await this.answerQuestion(question, job);
      answers.push(answer);
    }

    // Log summary
    const cached = answers.filter(a => a.source === 'cached').length;
    const generated = answers.filter(a => a.source === 'generated').length;
    const needsInput = answers.filter(a => a.source === 'user_input_required').length;

    logger.info('Questions answered', {
      total: questions.length,
      cached,
      generated,
      needsInput,
    });

    return answers;
  }
}

// Export singleton instance
export const qaAgent = new QAAgent();
