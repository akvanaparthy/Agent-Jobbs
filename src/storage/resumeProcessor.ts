import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { ResumeChunk } from '../types';
import { logger } from '../utils/logger';
import { chromaDB } from './chromaDB';
import * as crypto from 'crypto';

export class ResumeProcessor {
  /**
   * Process resume file and store in ChromaDB
   */
  async processResumeFile(filepath: string): Promise<ResumeChunk[]> {
    try {
      logger.info('Processing resume file', { filepath });

      // Read file
      const ext = path.extname(filepath).toLowerCase();
      let text: string;

      switch (ext) {
        case '.pdf':
          text = await this.parsePDF(filepath);
          break;
        case '.docx':
          text = await this.parseDOCX(filepath);
          break;
        case '.txt':
          text = await this.parseTXT(filepath);
          break;
        default:
          throw new Error(`Unsupported file format: ${ext}`);
      }

      // Chunk the resume
      const chunks = this.chunkResume(text);

      logger.info(`Resume processed into ${chunks.length} chunks`);

      // Store in ChromaDB
      await chromaDB.addResumeChunks(chunks);

      return chunks;
    } catch (error) {
      logger.error('Failed to process resume', { error, filepath });
      throw error;
    }
  }

  /**
   * Parse PDF file
   */
  private async parsePDF(filepath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filepath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      logger.error('Failed to parse PDF', { error, filepath });
      throw error;
    }
  }

  /**
   * Parse DOCX file
   */
  private async parseDOCX(filepath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filepath });
      return result.value;
    } catch (error) {
      logger.error('Failed to parse DOCX', { error, filepath });
      throw error;
    }
  }

  /**
   * Parse TXT file
   */
  private async parseTXT(filepath: string): Promise<string> {
    try {
      return fs.readFileSync(filepath, 'utf-8');
    } catch (error) {
      logger.error('Failed to parse TXT', { error, filepath });
      throw error;
    }
  }

  /**
   * Chunk resume into sections
   */
  private chunkResume(text: string): ResumeChunk[] {
    const chunks: ResumeChunk[] = [];

    // Normalize line endings and split into lines
    const lines = text.replace(/\r\n/g, '\n').split('\n');

    // Detect sections
    const sections = this.detectSections(lines);

    // Create chunks for each section
    for (const section of sections) {
      const chunk = this.createChunkFromSection(section);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    // If no sections detected, create chunks by paragraph
    if (chunks.length === 0) {
      logger.warn('No sections detected, chunking by paragraph');
      return this.chunkByParagraph(text);
    }

    return chunks;
  }

  /**
   * Detect sections in resume
   */
  private detectSections(lines: string[]): Array<{
    type: ResumeChunk['section'];
    title: string;
    content: string[];
    startLine: number;
  }> {
    const sections: Array<{
      type: ResumeChunk['section'];
      title: string;
      content: string[];
      startLine: number;
    }> = [];

    let currentSection: typeof sections[0] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      // Check if this line is a section header
      const sectionType = this.identifySectionType(lineUpper);

      if (sectionType) {
        // Save previous section
        if (currentSection && currentSection.content.length > 0) {
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          type: sectionType,
          title: line,
          content: [],
          startLine: i,
        };
      } else if (currentSection && line) {
        // Add to current section
        currentSection.content.push(line);
      }
    }

    // Add last section
    if (currentSection && currentSection.content.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Identify section type from header text
   */
  private identifySectionType(headerText: string): ResumeChunk['section'] | null {
    const experienceKeywords = ['EXPERIENCE', 'WORK HISTORY', 'EMPLOYMENT', 'PROFESSIONAL EXPERIENCE'];
    const skillsKeywords = ['SKILLS', 'TECHNICAL SKILLS', 'COMPETENCIES', 'EXPERTISE'];
    const educationKeywords = ['EDUCATION', 'ACADEMIC', 'QUALIFICATIONS'];
    const projectsKeywords = ['PROJECTS', 'PORTFOLIO', 'WORK SAMPLES'];
    const summaryKeywords = ['SUMMARY', 'PROFILE', 'OBJECTIVE', 'ABOUT'];

    if (experienceKeywords.some(kw => headerText.includes(kw))) {
      return 'experience';
    }
    if (skillsKeywords.some(kw => headerText.includes(kw))) {
      return 'skills';
    }
    if (educationKeywords.some(kw => headerText.includes(kw))) {
      return 'education';
    }
    if (projectsKeywords.some(kw => headerText.includes(kw))) {
      return 'projects';
    }
    if (summaryKeywords.some(kw => headerText.includes(kw))) {
      return 'summary';
    }

    return null;
  }

  /**
   * Create chunk from section
   */
  private createChunkFromSection(section: {
    type: ResumeChunk['section'];
    title: string;
    content: string[];
  }): ResumeChunk | null {
    const text = section.content.join('\n').trim();

    if (!text || text.length < 20) {
      return null;
    }

    // Parse metadata based on section type
    const metadata = this.parseMetadata(section.type, text);

    return {
      id: this.generateChunkId(text),
      text,
      section: section.type,
      metadata,
    };
  }

  /**
   * Parse metadata from section content
   */
  private parseMetadata(
    sectionType: ResumeChunk['section'],
    content: string
  ): ResumeChunk['metadata'] {
    const metadata: ResumeChunk['metadata'] = {};

    if (sectionType === 'experience') {
      // Try to extract company, role, dates
      const lines = content.split('\n');

      // Common patterns: "Software Engineer at Google" or "Google - Software Engineer"
      const firstLine = lines[0];
      const companyRoleMatch = firstLine.match(/(.+?)\s+(?:at|@|-)\s+(.+)/i);

      if (companyRoleMatch) {
        metadata.role = companyRoleMatch[1].trim();
        metadata.company = companyRoleMatch[2].trim();
      }

      // Extract dates (e.g., "Jan 2020 - Dec 2022", "2020-2022")
      const datePattern = /(\d{4}|\w+\s+\d{4})\s*-\s*(\d{4}|\w+\s+\d{4}|Present|Current)/i;
      const dateMatch = content.match(datePattern);

      if (dateMatch) {
        metadata.dateRange = dateMatch[0];
      }

      // Extract technologies (common tech stack keywords)
      metadata.technologies = this.extractTechnologies(content);
    } else if (sectionType === 'education') {
      // Extract degree and institution
      const lines = content.split('\n');
      metadata.degree = lines[0];

      // Look for institution name
      const institutionMatch = content.match(/(?:at|from)\s+(.+?)(?:\n|,|$)/i);
      if (institutionMatch) {
        metadata.institution = institutionMatch[1].trim();
      }
    }

    return metadata;
  }

  /**
   * Extract technologies from text
   */
  private extractTechnologies(text: string): string[] {
    const commonTech = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby',
      'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring',
      'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Git', 'GitHub',
      'REST', 'GraphQL', 'gRPC', 'Microservices', 'CI/CD', 'Agile', 'Scrum',
    ];

    const found: string[] = [];

    for (const tech of commonTech) {
      const regex = new RegExp(`\\b${tech}\\b`, 'i');
      if (regex.test(text)) {
        found.push(tech);
      }
    }

    return found;
  }

  /**
   * Chunk by paragraph (fallback method)
   */
  private chunkByParagraph(text: string): ResumeChunk[] {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);

    return paragraphs.map(para => ({
      id: this.generateChunkId(para),
      text: para.trim(),
      section: 'summary',
      metadata: {},
    }));
  }

  /**
   * Generate unique ID for chunk
   */
  private generateChunkId(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex').substring(0, 16);
  }
}

// Export singleton instance
export const resumeProcessor = new ResumeProcessor();
