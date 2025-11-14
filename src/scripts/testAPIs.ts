#!/usr/bin/env ts-node
/**
 * Test script to verify API calls and embeddings are working properly
 * This tests:
 * 1. OpenAI Embeddings API
 * 2. Anthropic Claude API
 * 3. ChromaDB connection and operations
 */

import * as dotenv from 'dotenv';
import { ChatAnthropic } from '@langchain/anthropic';
import OpenAI from 'openai';
import { ChromaClient } from 'chromadb';

// Load environment variables
dotenv.config();

// Test results tracking
interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

// ANSI color codes
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
};

// Helper function to run a test
async function runTest(
  name: string,
  testFn: () => Promise<any>
): Promise<void> {
  const startTime = Date.now();
  try {
    console.log(colors.blue(`\n🧪 Testing: ${name}...`));
    const result = await testFn();
    const duration = Date.now() - startTime;

    results.push({
      name,
      success: true,
      duration,
      details: result
    });

    console.log(colors.green(`✓ ${name} - PASSED (${duration}ms)`));
    if (result) {
      console.log(colors.gray(`  Details: ${JSON.stringify(result, null, 2)}`));
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    results.push({
      name,
      success: false,
      duration,
      error: errorMessage
    });

    console.log(colors.red(`✗ ${name} - FAILED (${duration}ms)`));
    console.log(colors.red(`  Error: ${errorMessage}`));
  }
}

// Test 1: OpenAI API Key
async function testOpenAIAPIKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY not set in .env file');
  }
  return { keyLength: apiKey.length, keyPrefix: apiKey.substring(0, 7) };
}

// Test 2: Anthropic API Key
async function testAnthropicAPIKey() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('ANTHROPIC_API_KEY not set in .env file');
  }
  return { keyLength: apiKey.length, keyPrefix: apiKey.substring(0, 7) };
}

// Test 3: OpenAI Embeddings Generation
async function testOpenAIEmbeddings() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY not set');
  }

  const openai = new OpenAI({ apiKey });

  const testText = 'This is a test sentence for embeddings generation.';
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: testText,
  });

  const embedding = response.data[0].embedding;

  return {
    model: response.model,
    embeddingDimension: embedding.length,
    firstFewValues: embedding.slice(0, 3),
    usage: response.usage
  };
}

// Test 4: OpenAI Embeddings - Multiple Texts
async function testOpenAIEmbeddingsMultiple() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const openai = new OpenAI({ apiKey });

  const testTexts = [
    'I am a senior software engineer with 5 years of experience.',
    'Expert in React, Node.js, and TypeScript.',
    'Looking for remote full-stack developer positions.'
  ];

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: testTexts,
  });

  return {
    model: response.model,
    numberOfEmbeddings: response.data.length,
    embeddingDimension: response.data[0].embedding.length,
    usage: response.usage
  };
}

// Test 5: Anthropic Claude API Call
async function testAnthropicClaude() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const claudeModel = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022';

  const model = new ChatAnthropic({
    anthropicApiKey: apiKey,
    modelName: claudeModel,
    temperature: 0.3,
  });

  const testPrompt = 'Say "API connection successful" if you can read this message.';
  const response = await model.invoke(testPrompt);

  return {
    model: claudeModel,
    responseLength: response.content.length,
    responsePreview: typeof response.content === 'string'
      ? response.content.substring(0, 100)
      : JSON.stringify(response.content).substring(0, 100)
  };
}

// Test 6: Anthropic Claude - Structured Response
async function testAnthropicClaudeStructured() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const claudeModel = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022';

  const model = new ChatAnthropic({
    anthropicApiKey: apiKey,
    modelName: claudeModel,
    temperature: 0,
  });

  const prompt = `Analyze this job title and respond with ONLY a JSON object: "Software Engineer"

  Return format: {"isRelevant": true/false, "confidence": 0.0-1.0}`;

  const response = await model.invoke(prompt);
  const content = typeof response.content === 'string' ? response.content : '';

  // Try to parse JSON from response
  let parsedData;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedData = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    parsedData = { note: 'Could not parse JSON', rawContent: content.substring(0, 100) };
  }

  return {
    model: claudeModel,
    parsedResponse: parsedData
  };
}

// Test 7: ChromaDB Connection
async function testChromaDBConnection() {
  const chromaHost = process.env.CHROMA_DB_HOST || 'localhost';
  const chromaPort = process.env.CHROMA_DB_PORT || '8000';

  const client = new ChromaClient({
    path: `http://${chromaHost}:${chromaPort}`,
  });

  const heartbeat = await client.heartbeat();
  const version = await client.version();

  return {
    heartbeat,
    version,
    host: chromaHost,
    port: chromaPort
  };
}

// Test 8: ChromaDB - List Collections
async function testChromaDBCollections() {
  const chromaHost = process.env.CHROMA_DB_HOST || 'localhost';
  const chromaPort = process.env.CHROMA_DB_PORT || '8000';

  const client = new ChromaClient({
    path: `http://${chromaHost}:${chromaPort}`,
  });

  const collections = await client.listCollections();

  return {
    numberOfCollections: collections.length,
    collectionNames: collections.map(c => c.name)
  };
}

// Test 9: ChromaDB - Create Test Collection with Embeddings
async function testChromaDBWithEmbeddings() {
  const chromaHost = process.env.CHROMA_DB_HOST || 'localhost';
  const chromaPort = process.env.CHROMA_DB_PORT || '8000';
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey || openaiApiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY not set');
  }

  const client = new ChromaClient({
    path: `http://${chromaHost}:${chromaPort}`,
  });

  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Delete test collection if it exists
  try {
    await client.deleteCollection({ name: 'test_api_collection' });
  } catch (e) {
    // Collection doesn't exist, that's fine
  }

  // Create test collection
  const collection = await client.createCollection({
    name: 'test_api_collection',
    metadata: { description: 'Test collection for API verification' }
  });

  // Generate embeddings for test data
  const testDocs = [
    'I am a software engineer with expertise in Python and JavaScript.',
    'I have 5 years of experience in web development.',
  ];

  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: testDocs,
  });

  const embeddings = embeddingResponse.data.map(d => d.embedding);

  // Add documents to collection
  await collection.add({
    ids: ['test_1', 'test_2'],
    embeddings: embeddings,
    documents: testDocs,
    metadatas: [{ source: 'test' }, { source: 'test' }]
  });

  // Query the collection
  const queryText = 'programming experience';
  const queryEmbedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: queryText,
  });

  const queryResults = await collection.query({
    queryEmbeddings: [queryEmbedding.data[0].embedding],
    nResults: 2
  });

  // Clean up - delete test collection
  await client.deleteCollection({ name: 'test_api_collection' });

  return {
    collectionCreated: true,
    documentsAdded: testDocs.length,
    queryResultsCount: queryResults.ids[0].length,
    topResult: queryResults.documents[0][0]?.substring(0, 50) || 'N/A',
    topDistance: queryResults.distances?.[0][0]
  };
}

// Main test runner
async function main() {
  console.log(colors.bold(colors.cyan('\n========================================')));
  console.log(colors.bold(colors.cyan('🚀 API & Embeddings Test Suite')));
  console.log(colors.bold(colors.cyan('========================================\n')));

  console.log(colors.yellow('Testing API keys and connectivity...\n'));

  // API Key Tests
  await runTest('OpenAI API Key Configuration', testOpenAIAPIKey);
  await runTest('Anthropic API Key Configuration', testAnthropicAPIKey);

  // OpenAI Embeddings Tests
  console.log(colors.yellow('\n--- OpenAI Embeddings Tests ---'));
  await runTest('OpenAI Embeddings - Single Text', testOpenAIEmbeddings);
  await runTest('OpenAI Embeddings - Multiple Texts', testOpenAIEmbeddingsMultiple);

  // Anthropic Claude Tests
  console.log(colors.yellow('\n--- Anthropic Claude API Tests ---'));
  await runTest('Anthropic Claude - Basic Call', testAnthropicClaude);
  await runTest('Anthropic Claude - Structured Response', testAnthropicClaudeStructured);

  // ChromaDB Tests
  console.log(colors.yellow('\n--- ChromaDB Tests ---'));
  await runTest('ChromaDB Connection', testChromaDBConnection);
  await runTest('ChromaDB - List Collections', testChromaDBCollections);
  await runTest('ChromaDB - Full Integration with Embeddings', testChromaDBWithEmbeddings);

  // Print Summary
  console.log(colors.bold(colors.cyan('\n========================================')));
  console.log(colors.bold(colors.cyan('📊 Test Summary')));
  console.log(colors.bold(colors.cyan('========================================\n')));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(colors.green(`Passed: ${passed}`));
  console.log(colors.red(`Failed: ${failed}`));
  console.log(`\nSuccess Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log(colors.red('\n❌ Failed Tests:'));
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(colors.red(`  - ${r.name}`));
        console.log(colors.red(`    ${r.error}`));
      });
  }

  console.log(colors.bold(colors.cyan('\n========================================\n')));

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
main().catch(error => {
  console.error(colors.red('\n💥 Test suite crashed:'), error);
  process.exit(1);
});
