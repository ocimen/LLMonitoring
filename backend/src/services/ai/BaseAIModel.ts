import { 
  IAIModel, 
  AIModelConfig, 
  AIQuery, 
  AIResponse, 
  ParsedAIResponse,
  RateLimitInfo,
  AIModelError,
  Citation,
  BrandMention
} from '../../types/ai';

export abstract class BaseAIModel implements IAIModel {
  public config: AIModelConfig;
  private requestCount: number = 0;
  private lastResetTime: Date = new Date();

  constructor(config: AIModelConfig) {
    this.config = config;
    this.validateConfig();
  }

  // Abstract methods that must be implemented by subclasses
  abstract query(request: AIQuery): Promise<AIResponse>;
  abstract healthCheck(): Promise<boolean>;

  // Concrete methods with default implementations
  validateQuery(query: AIQuery): boolean {
    if (!query.query || query.query.trim().length === 0) {
      return false;
    }
    
    if (!query.brand_id || query.brand_id.trim().length === 0) {
      return false;
    }

    // Check query length (most models have token limits)
    if (query.query.length > 10000) {
      return false;
    }

    return true;
  }

  estimateCost(query: AIQuery): number {
    // Simple estimation based on character count
    // More sophisticated implementations would use tokenization
    const estimatedTokens = Math.ceil(query.query.length / 4);
    const responseTokens = query.max_tokens || 1000;
    const totalTokens = estimatedTokens + responseTokens;
    
    // Cost per 1000 tokens
    return (totalTokens / 1000) * this.config.cost_per_request;
  }

  async checkRateLimit(): Promise<RateLimitInfo> {
    const now = new Date();
    const timeSinceReset = now.getTime() - this.lastResetTime.getTime();
    const minutesSinceReset = timeSinceReset / (1000 * 60);

    // Reset counter if more than a minute has passed
    if (minutesSinceReset >= 1) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    const requestsRemaining = Math.max(0, this.config.rate_limit_per_minute - this.requestCount);
    const resetTime = new Date(this.lastResetTime.getTime() + 60 * 1000);

    const retryAfter = requestsRemaining === 0 ? Math.ceil(60 - minutesSinceReset) : undefined;
    
    return {
      requests_remaining: requestsRemaining,
      reset_time: resetTime,
      ...(retryAfter !== undefined && { retry_after: retryAfter })
    };
  }

  async parseResponse(response: AIResponse): Promise<ParsedAIResponse> {
    const citations = await this.extractCitations(response.response);
    const brandMentions = await this.extractBrandMentions(response.response);
    const sentimentAnalysis = await this.analyzeSentiment(response.response);
    const topics = await this.extractTopics(response.response);
    const entities = await this.extractEntities(response.response);

    return {
      ...response,
      citations,
      brand_mentions: brandMentions,
      sentiment_analysis: sentimentAnalysis,
      topics,
      entities
    };
  }

  // Protected helper methods
  protected async extractCitations(text: string): Promise<Citation[]> {
    const citations: Citation[] = [];
    
    // Simple URL extraction - in production, you'd want more sophisticated parsing
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\],]+/g;
    const urls = text.match(urlRegex) || [];
    
    for (let url of urls) {
      try {
        // Remove trailing punctuation that might be part of sentence structure
        url = url.replace(/[.,;:!?]+$/, '');
        
        const domain = new URL(url).hostname;
        citations.push({
          url,
          domain,
          authority_score: this.calculateAuthorityScore(domain),
          relevance_score: 0.8, // Default relevance
          content_type: 'web'
        });
      } catch (error) {
        // Invalid URL, skip
        continue;
      }
    }

    return citations;
  }

  protected async extractBrandMentions(text: string): Promise<BrandMention[]> {
    const mentions: BrandMention[] = [];
    
    // This is a simplified implementation
    // In production, you'd use NLP libraries or AI models for better extraction
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    sentences.forEach((sentence, index) => {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence.length === 0) return;

      // Simple brand detection (you'd want more sophisticated NER here)
      const brandPattern = /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b/g;
      const potentialBrands = trimmedSentence.match(brandPattern) || [];
      
      potentialBrands.forEach(brand => {
        if (brand.length > 2 && brand.length < 50) { // Filter reasonable brand names
          const sentiment = this.calculateSentimentScore(trimmedSentence);
          mentions.push({
            brand_name: brand,
            mention_text: brand,
            context: trimmedSentence,
            position_in_response: index,
            sentiment_score: sentiment.score,
            sentiment_label: sentiment.label,
            confidence: 0.7 // Default confidence
          });
        }
      });
    });

    return mentions;
  }

  protected async analyzeSentiment(text: string): Promise<{
    overall_sentiment: number;
    sentiment_label: 'positive' | 'negative' | 'neutral';
    confidence: number;
  }> {
    // Simple sentiment analysis - in production, use proper NLP libraries
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'outstanding', 'impressive', 'successful', 'innovative'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'disappointing', 'failed', 'poor', 'worst', 'problematic', 'concerning'];
    
    const words = text.toLowerCase().split(/\W+/);
    let positiveCount = 0;
    let negativeCount = 0;
    
    words.forEach(word => {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    });
    
    const totalSentimentWords = positiveCount + negativeCount;
    let sentiment = 0;
    let label: 'positive' | 'negative' | 'neutral' = 'neutral';
    
    if (totalSentimentWords > 0) {
      sentiment = (positiveCount - negativeCount) / totalSentimentWords;
      if (sentiment > 0.1) label = 'positive';
      else if (sentiment < -0.1) label = 'negative';
    }
    
    return {
      overall_sentiment: sentiment,
      sentiment_label: label,
      confidence: Math.min(totalSentimentWords / 10, 1) // Higher confidence with more sentiment words
    };
  }

  protected async extractTopics(text: string): Promise<string[]> {
    // Simple topic extraction - in production, use proper topic modeling
    const commonTopics = [
      'technology', 'business', 'finance', 'marketing', 'innovation', 
      'product', 'service', 'customer', 'market', 'industry',
      'growth', 'revenue', 'profit', 'investment', 'partnership',
      'leadership', 'strategy', 'competition', 'brand', 'reputation'
    ];
    
    const words = text.toLowerCase().split(/\W+/);
    const foundTopics = commonTopics.filter(topic => 
      words.some(word => word.includes(topic) || topic.includes(word))
    );
    
    return foundTopics.slice(0, 5); // Return top 5 topics
  }

  protected async extractEntities(text: string): Promise<Array<{
    name: string;
    type: string;
    confidence: number;
  }>> {
    const entities: Array<{ name: string; type: string; confidence: number }> = [];
    
    // Simple entity extraction - in production, use proper NER
    const organizationPattern = /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*(?:\s+(?:Inc|Corp|LLC|Ltd|Company|Corporation))\b/g;
    const organizations = text.match(organizationPattern) || [];
    
    organizations.forEach(org => {
      entities.push({
        name: org,
        type: 'ORGANIZATION',
        confidence: 0.8
      });
    });
    
    return entities;
  }

  protected calculateAuthorityScore(domain: string): number {
    // Simple domain authority calculation
    const highAuthorityDomains = [
      'wikipedia.org', 'reuters.com', 'bbc.com', 'cnn.com', 'nytimes.com',
      'wsj.com', 'forbes.com', 'bloomberg.com', 'techcrunch.com', 'wired.com'
    ];
    
    if (highAuthorityDomains.includes(domain)) return 0.9;
    if (domain.endsWith('.edu')) return 0.8;
    if (domain.endsWith('.gov')) return 0.9;
    if (domain.endsWith('.org')) return 0.7;
    
    return 0.5; // Default authority
  }

  protected calculateSentimentScore(text: string): { score: number; label: 'positive' | 'negative' | 'neutral' } {
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'disappointing'];
    
    const words = text.toLowerCase().split(/\W+/);
    let score = 0;
    
    words.forEach(word => {
      if (positiveWords.includes(word)) score += 0.5;
      if (negativeWords.includes(word)) score -= 0.5;
    });
    
    let label: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (score > 0.1) label = 'positive';
    else if (score < -0.1) label = 'negative';
    
    return { score: Math.max(-1, Math.min(1, score)), label };
  }

  protected incrementRequestCount(): void {
    this.requestCount++;
  }

  protected createError(message: string, code: string, status?: number, rateLimitInfo?: RateLimitInfo): AIModelError {
    const error = new Error(message) as AIModelError;
    error.code = code;
    if (status !== undefined) {
      error.status = status;
    }
    if (rateLimitInfo !== undefined) {
      error.rate_limit_info = rateLimitInfo;
    }
    return error;
  }

  private validateConfig(): void {
    if (!this.config.api_key) {
      throw new Error(`API key is required for ${this.config.provider} model`);
    }
    
    if (!this.config.api_endpoint) {
      throw new Error(`API endpoint is required for ${this.config.provider} model`);
    }
    
    if (this.config.rate_limit_per_minute <= 0) {
      throw new Error('Rate limit must be greater than 0');
    }
  }
}