import { ChromaClient, Collection } from 'chromadb';
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { ResumeChunk, QAPair } from '../types';
import { CHROMA_COLLECTIONS } from '../config/constants';

/**
 * Custom OpenAI Embedding Function for ChromaDB
 */
class OpenAIEmbeddingFunction {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'text-embedding-3-small') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      logger.error('Failed to generate embeddings', { error });
      throw error;
    }
  }
}

export class ChromaDBManager {
  private client: ChromaClient | null = null;
  private resumeCollection: Collection | null = null;
  private qaCollection: Collection | null = null;
  private embeddingFunction: OpenAIEmbeddingFunction | null = null;

  /**
   * Initialize ChromaDB client
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing ChromaDB...', {
        host: config.chromaDbHost,
        port: config.chromaDbPort,
      });

      this.client = new ChromaClient({
        path: `http://${config.chromaDbHost}:${config.chromaDbPort}`,
      });

      // Test connection
      await this.client.heartbeat();
      logger.info('ChromaDB connection established');

      // Initialize OpenAI embedding function
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new Error('OPENAI_API_KEY not found in environment variables');
      }

      this.embeddingFunction = new OpenAIEmbeddingFunction(openaiApiKey, 'text-embedding-3-small');

      logger.info('OpenAI embedding function initialized');

      // Get or create collections
      await this.ensureCollections();
    } catch (error) {
      logger.error('Failed to initialize ChromaDB', { error });
      throw new Error(
        `ChromaDB initialization failed. Make sure ChromaDB is running on ${config.chromaDbHost}:${config.chromaDbPort}`
      );
    }
  }

  /**
   * Ensure collections exist
   */
  private async ensureCollections(): Promise<void> {
    try {
      if (!this.client) throw new Error('Client not initialized');
      if (!this.embeddingFunction) throw new Error('Embedding function not initialized');

      // Resume embeddings collection
      try {
        this.resumeCollection = await this.client.getOrCreateCollection({
          name: CHROMA_COLLECTIONS.RESUME,
          metadata: { description: 'Resume chunks with embeddings' },
          embeddingFunction: this.embeddingFunction,
        });
        logger.info('Resume collection ready');
      } catch (error) {
        logger.error('Failed to create resume collection', { error });
        throw error;
      }

      // Q&A pairs collection
      try {
        this.qaCollection = await this.client.getOrCreateCollection({
          name: CHROMA_COLLECTIONS.QA_PAIRS,
          metadata: { description: 'Question-answer pairs with embeddings' },
          embeddingFunction: this.embeddingFunction,
        });
        logger.info('Q&A collection ready');
      } catch (error) {
        logger.error('Failed to create Q&A collection', { error });
        throw error;
      }
    } catch (error) {
      logger.error('Failed to ensure collections', { error });
      throw error;
    }
  }

  /**
   * Add resume chunks to collection
   */
  async addResumeChunks(chunks: ResumeChunk[]): Promise<void> {
    try {
      if (!this.client || !this.resumeCollection) {
        logger.error('ChromaDB not initialized - cannot add resume chunks');
        throw new Error('Resume collection not initialized. Call initialize() first.');
      }

      if (chunks.length === 0) {
        logger.warn('No chunks to add');
        return;
      }

      logger.info(`Adding ${chunks.length} resume chunks to ChromaDB`);

      // Prepare data for ChromaDB
      const ids = chunks.map(c => c.id);
      const documents = chunks.map(c => c.text);
      const metadatas = chunks.map(c => {
        const meta: Record<string, any> = {
          section: c.section,
        };
        // Convert metadata, flattening arrays to strings
        Object.entries(c.metadata).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            meta[key] = value.join(', ');
          } else if (value !== undefined && value !== null) {
            meta[key] = value;
          }
        });
        return meta;
      });

      // Add to collection
      await this.resumeCollection.add({
        ids,
        documents,
        metadatas,
      });

      logger.info('Resume chunks added successfully');
    } catch (error) {
      logger.error('Failed to add resume chunks', { error });
      throw error;
    }
  }

  /**
   * Search resume chunks by query
   */
  async searchResumeChunks(query: string, limit: number = 5): Promise<ResumeChunk[]> {
    try {
      if (!this.client || !this.resumeCollection) {
        logger.error('ChromaDB not initialized - cannot search resume chunks');
        throw new Error('Resume collection not initialized. Call initialize() first.');
      }

      logger.debug('Searching resume chunks', { query, limit });

      const results = await this.resumeCollection.query({
        queryTexts: [query],
        nResults: limit,
      });

      if (!results.ids || !results.documents || !results.metadatas) {
        return [];
      }

      // Convert results to ResumeChunk objects
      const chunks: ResumeChunk[] = [];
      const ids = results.ids[0] || [];
      const documents = results.documents[0] || [];
      const metadatas = results.metadatas[0] || [];

      for (let i = 0; i < ids.length; i++) {
        const metadata = metadatas[i] as any;
        chunks.push({
          id: ids[i],
          text: documents[i] || '',
          section: metadata.section,
          metadata: metadata,
        });
      }

      logger.debug(`Found ${chunks.length} matching resume chunks`);
      return chunks;
    } catch (error) {
      logger.error('Failed to search resume chunks', { error });
      return [];
    }
  }

  /**
   * Add Q&A pair to collection
   */
  async addQAPair(qaPair: QAPair): Promise<void> {
    try {
      if (!this.client || !this.qaCollection) {
        logger.error('ChromaDB not initialized - cannot add Q&A pair');
        throw new Error('Q&A collection not initialized. Call initialize() first.');
      }

      logger.debug('Adding Q&A pair to ChromaDB', { id: qaPair.id });

      // Prepare metadata
      const metadata: Record<string, any> = {
        answer: qaPair.answer,
        category: qaPair.category || 'general',
        keywords: qaPair.keywords?.join(',') || '',
        usageCount: qaPair.usageCount || 0,
        lastUsed: qaPair.lastUsed || new Date().toISOString(),
      };

      // Add to collection (using question as the document)
      await this.qaCollection.add({
        ids: [qaPair.id],
        documents: [qaPair.question],
        metadatas: [metadata],
      });

      logger.debug('Q&A pair added successfully');
    } catch (error) {
      logger.error('Failed to add Q&A pair', { error });
      throw error;
    }
  }

  /**
   * Search for similar questions
   */
  async searchSimilarQuestions(question: string, limit: number = 3): Promise<QAPair[]> {
    try {
      if (!this.client || !this.qaCollection) {
        logger.error('ChromaDB not initialized - cannot search Q&A pairs');
        throw new Error('Q&A collection not initialized. Call initialize() first.');
      }

      logger.debug('Searching for similar questions', { question, limit });

      const results = await this.qaCollection.query({
        queryTexts: [question],
        nResults: limit,
      });

      if (!results.ids || !results.documents || !results.metadatas || !results.distances) {
        return [];
      }

      // Convert results to QAPair objects
      const qaPairs: QAPair[] = [];
      const ids = results.ids[0] || [];
      const documents = results.documents[0] || [];
      const metadatas = results.metadatas[0] || [];
      const distances = results.distances[0] || [];

      for (let i = 0; i < ids.length; i++) {
        const metadata = metadatas[i] as any;
        const distance = distances[i];

        // Only include if similarity is high enough (distance < 0.3)
        if (distance !== null && distance !== undefined && distance < 0.3) {
          qaPairs.push({
            id: ids[i],
            question: documents[i] || '',
            answer: metadata.answer,
            category: metadata.category,
            keywords: metadata.keywords ? metadata.keywords.split(',') : undefined,
            usageCount: metadata.usageCount,
            lastUsed: metadata.lastUsed,
          });
        }
      }

      logger.debug(`Found ${qaPairs.length} similar questions`);
      return qaPairs;
    } catch (error) {
      logger.error('Failed to search similar questions', { error });
      return [];
    }
  }

  /**
   * Update Q&A pair
   */
  async updateQAPair(id: string, updates: Partial<QAPair>): Promise<void> {
    try {
      if (!this.qaCollection) {
        throw new Error('Q&A collection not initialized');
      }

      logger.debug('Updating Q&A pair', { id });

      // Get existing entry
      const existing = await this.qaCollection.get({ ids: [id] });

      if (!existing.ids || existing.ids.length === 0) {
        logger.warn('Q&A pair not found', { id });
        return;
      }

      const existingMetadata = existing.metadatas?.[0] as any || {};

      // Merge updates
      const newMetadata = {
        ...existingMetadata,
        ...(updates.answer && { answer: updates.answer }),
        ...(updates.category && { category: updates.category }),
        ...(updates.keywords && { keywords: updates.keywords.join(',') }),
        ...(updates.usageCount !== undefined && { usageCount: updates.usageCount }),
        ...(updates.lastUsed && { lastUsed: updates.lastUsed }),
      };

      // Update in collection
      await this.qaCollection.update({
        ids: [id],
        metadatas: [newMetadata],
        ...(updates.question && { documents: [updates.question] }),
      });

      logger.debug('Q&A pair updated successfully');
    } catch (error) {
      logger.error('Failed to update Q&A pair', { error });
      throw error;
    }
  }

  /**
   * Increment usage count for Q&A pair
   */
  async incrementUsageCount(id: string): Promise<void> {
    try {
      if (!this.qaCollection) return;

      const existing = await this.qaCollection.get({ ids: [id] });
      if (!existing.metadatas || existing.metadatas.length === 0) return;

      const metadata = existing.metadatas[0] as any;
      const currentCount = metadata.usageCount || 0;

      await this.updateQAPair(id, {
        usageCount: currentCount + 1,
        lastUsed: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to increment usage count', { error });
    }
  }

  /**
   * Get all Q&A pairs
   */
  async getAllQAPairs(): Promise<QAPair[]> {
    try {
      if (!this.qaCollection) {
        throw new Error('Q&A collection not initialized');
      }

      const results = await this.qaCollection.get();

      if (!results.ids || !results.documents || !results.metadatas) {
        return [];
      }

      const qaPairs: QAPair[] = [];

      for (let i = 0; i < results.ids.length; i++) {
        const metadata = results.metadatas[i] as any;
        qaPairs.push({
          id: results.ids[i],
          question: results.documents[i] || '',
          answer: metadata.answer,
          category: metadata.category,
          keywords: metadata.keywords ? metadata.keywords.split(',') : undefined,
          usageCount: metadata.usageCount,
          lastUsed: metadata.lastUsed,
        });
      }

      return qaPairs;
    } catch (error) {
      logger.error('Failed to get all Q&A pairs', { error });
      return [];
    }
  }

  /**
   * Clear all resume chunks
   */
  async clearResumeChunks(): Promise<void> {
    try {
      if (!this.client) return;

      await this.client.deleteCollection({ name: CHROMA_COLLECTIONS.RESUME });
      await this.ensureCollections();
      logger.info('Resume chunks cleared');
    } catch (error) {
      logger.error('Failed to clear resume chunks', { error });
    }
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{
    resumeChunks: number;
    qaPairs: number;
  }> {
    try {
      const resumeCount = await this.resumeCollection?.count() || 0;
      const qaCount = await this.qaCollection?.count() || 0;

      return {
        resumeChunks: resumeCount,
        qaPairs: qaCount,
      };
    } catch (error) {
      logger.error('Failed to get stats', { error });
      return { resumeChunks: 0, qaPairs: 0 };
    }
  }

  /**
   * Get all resume chunks (without embedding search)
   */
  async getAllResumeChunks(): Promise<ResumeChunk[]> {
    try {
      if (!this.client || !this.resumeCollection) {
        logger.error('ChromaDB not initialized - cannot get resume chunks');
        throw new Error('Resume collection not initialized. Call initialize() first.');
      }

      logger.debug('Getting all resume chunks');

      const results = await this.resumeCollection.get();

      if (!results.ids || !results.documents || !results.metadatas) {
        return [];
      }

      // Convert results to ResumeChunk objects
      const chunks: ResumeChunk[] = [];
      const ids = results.ids || [];
      const documents = results.documents || [];
      const metadatas = results.metadatas || [];

      for (let i = 0; i < ids.length; i++) {
        const metadata = metadatas[i] as any;
        chunks.push({
          id: ids[i],
          text: documents[i] || '',
          section: metadata.section,
          metadata: metadata,
        });
      }

      logger.debug(`Retrieved ${chunks.length} total resume chunks`);
      return chunks;
    } catch (error) {
      logger.error('Failed to get all resume chunks', { error });
      return [];
    }
  }
}

// Export singleton instance
export const chromaDB = new ChromaDBManager();
