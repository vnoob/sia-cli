import { parseContextTags } from '../../src/context/parser';

describe('parseContextTags', () => {
  it('should parse file tags with @', () => {
    const { tags, cleanInput } = parseContextTags('Look at @src/index.ts and explain it');
    expect(tags).toHaveLength(1);
    expect(tags[0].type).toBe('file');
    expect(tags[0].value).toBe('src/index.ts');
    expect(cleanInput).toBe('Look at and explain it');
  });

  it('should parse directory tags with #', () => {
    const { tags, cleanInput } = parseContextTags('What is in #src directory?');
    expect(tags).toHaveLength(1);
    expect(tags[0].type).toBe('directory');
    expect(tags[0].value).toBe('src');
    expect(cleanInput).toBe('What is in directory?');
  });

  it('should parse system context tags', () => {
    const { tags } = parseContextTags('Tell me about #system');
    expect(tags).toHaveLength(1);
    expect(tags[0].type).toBe('system');
    expect(tags[0].value).toBe('system');
  });

  it('should parse git context tag', () => {
    const { tags } = parseContextTags('Review #git status');
    expect(tags).toHaveLength(1);
    expect(tags[0].type).toBe('system');
    expect(tags[0].value).toBe('git');
  });

  it('should parse env context tag', () => {
    const { tags } = parseContextTags('Show #env variables');
    expect(tags).toHaveLength(1);
    expect(tags[0].type).toBe('system');
    expect(tags[0].value).toBe('env');
  });

  it('should parse multiple tags', () => {
    const { tags, cleanInput } = parseContextTags('@file1.ts @file2.ts what is different?');
    expect(tags).toHaveLength(2);
    expect(tags[0].type).toBe('file');
    expect(tags[1].type).toBe('file');
    expect(cleanInput).toBe('what is different?');
  });

  it('should handle input with no tags', () => {
    const { tags, cleanInput } = parseContextTags('Hello, how are you?');
    expect(tags).toHaveLength(0);
    expect(cleanInput).toBe('Hello, how are you?');
  });

  it('should handle mixed file and system tags', () => {
    const { tags } = parseContextTags('@package.json #system tell me about this project');
    expect(tags).toHaveLength(2);
    expect(tags.some(t => t.type === 'file')).toBe(true);
    expect(tags.some(t => t.type === 'system')).toBe(true);
  });
});
