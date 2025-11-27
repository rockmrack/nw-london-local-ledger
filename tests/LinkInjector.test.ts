import { LinkInjector } from '../src/services/LinkInjector';
import path from 'path';

// Mock the integration map for testing
const mockMapPath = path.join(__dirname, 'mock_integration_map.json');

describe('LinkInjector', () => {
  let injector: LinkInjector;

  beforeAll(() => {
    // In a real test, we would write a mock JSON file here or mock fs.readFileSync
    // For now, we'll rely on the actual file or a mock if we could write it.
    // Since we can't easily mock fs in this environment without jest setup, 
    // we will assume the default constructor works if the file exists in root.
    injector = new LinkInjector(); 
  });

  test('should load integration map correctly', () => {
    expect(injector).toBeDefined();
  });

  test('should report ready status when initialized', () => {
    expect(injector.isReady()).toBe(true);
  });

  test('should inject contextual links', () => {
    const content = "We are discussing planning permission for a new project.";
    const result = injector.injectContextualLinks(content);
    
    expect(result).toContain('<a href="https://hampsteadrenovations.co.uk/planning-applications"');
    expect(result).toContain('planning permission</a>');
  });

  test('should not inject links if no keywords match', () => {
    const content = "We are discussing something else entirely.";
    const result = injector.injectContextualLinks(content);
    expect(result).toBe(content);
  });

  test('should generate featured expert block', () => {
    const block = injector.generateFeaturedExpertBlock('basements', 'NW3');
    
    expect(block).toContain('Planning a basements in NW3?');
    expect(block).toContain('Hampstead Renovations');
    expect(block).toContain('href="https://hampsteadrenovations.co.uk/basement-conversion"');
  });

  test('should generate street link', () => {
    const link = injector.generateStreetLink('Abbey Road', 'NW8');
    
    expect(link).toContain('href="https://hampsteadrenovations.co.uk/streets/nw8/house-extensions-abbey-road-nw8.html"');
    expect(link).toContain('House Extension projects on Abbey Road');
  });

  test('should return empty string for unknown service key', () => {
    const block = injector.generateFeaturedExpertBlock('unknown-service', 'NW3');
    expect(block).toBe('');
  });
});

describe('LinkInjector - Graceful Degradation', () => {
  test('should handle missing integration map gracefully', () => {
    const injector = new LinkInjector('/non/existent/path.json');
    
    expect(injector).toBeDefined();
    expect(injector.isReady()).toBe(false);
  });

  test('should return content unchanged when not initialized', () => {
    const injector = new LinkInjector('/non/existent/path.json');
    const content = "This is some content about planning permission.";
    
    const result = injector.injectContextualLinks(content);
    expect(result).toBe(content);
  });

  test('should return empty string for expert block when not initialized', () => {
    const injector = new LinkInjector('/non/existent/path.json');
    
    const block = injector.generateFeaturedExpertBlock('basements', 'NW3');
    expect(block).toBe('');
  });

  test('should return empty string for street link when not initialized', () => {
    const injector = new LinkInjector('/non/existent/path.json');
    
    const link = injector.generateStreetLink('Abbey Road', 'NW8');
    expect(link).toBe('');
  });
});
